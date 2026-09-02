// ============================================================
//  CURNX v1.3 — engine/memory.js
//  Virtual Memory — a simulated, byte-addressable RAM.
//
//  Every variable Curnx declares now really "lives" at a numeric
//  address in this space, the same way it would on a real machine:
//
//    0x000            NULL / guard page (address 0 == NULL)
//    DATA   segment — globals & interned string literals, bump-
//                     allocated upward from just above the guard page
//    HEAP   segment — malloc() / calloc() / free(), first-fit
//                     free-list allocator with a bump fallback
//    STACK  segment — locals & call frames, grows DOWN from the
//                     top of the address space (like a real x86/ARM
//                     process stack) — recursive calls really do
//                     get lower and lower addresses per frame.
//
//  Reads/writes go through a real ArrayBuffer + DataView (little-
//  endian), so int/float/char/pointer occupy their real byte width:
//  a 32-bit int genuinely wraps on overflow, a `float` genuinely
//  loses precision the way a real 32-bit float does, and reading
//  past the end of the address space is a real, catchable fault.
// ============================================================

class SegFault extends Error {}

class VMemory {
  constructor(size = 1 << 20 /* 1 MB virtual address space */) {
    this.size  = size;
    this.buf   = new ArrayBuffer(size);
    this.view  = new DataView(this.buf);
    this.bytes = new Uint8Array(this.buf);

    // ── Segment layout ──────────────────────────────────────
    this.NULL_PAGE = 0x100;                    // 0..NULL_PAGE reserved; addr 0 == NULL
    this.DATA_BASE = this.NULL_PAGE;
    this.dataPtr   = this.DATA_BASE;

    this.HEAP_BASE = Math.floor(size * 0.35);
    this.HEAP_END  = Math.floor(size * 0.75);
    this.heapPtr   = this.HEAP_BASE;
    this.freeList  = [];             // [{addr,size}] — reusable freed blocks
    this.liveBlocks = new Map();      // addr -> size, for free()/leak reporting

    this.STACK_BASE = size - 16;      // stack grows DOWN from near the top
    this.sp          = this.STACK_BASE;
    this.stackFloor   = this.sp;       // low-water mark (deepest the stack ever went)

    this.strPool = new Map();          // interned string-literal text -> addr
  }

  // ── Bounds / fault checking ──────────────────────────────
  _check(addr, len) {
    if (!Number.isFinite(addr) || addr < 0 || addr + len > this.size) {
      throw new SegFault(
        `Segmentation fault: access to address 0x${(addr >>> 0).toString(16)} (${len} byte${len === 1 ? '' : 's'}) is out of bounds`
      );
    }
    if (addr < this.NULL_PAGE) {
      throw new SegFault(`Null pointer dereference at address 0x${addr.toString(16)}`);
    }
  }

  // ── Raw typed access (little-endian) ─────────────────────
  readKind(addr, kind) {
    switch (kind) {
      case 'i8':  this._check(addr, 1); return this.view.getInt8(addr);
      case 'u8':  this._check(addr, 1); return this.view.getUint8(addr);
      case 'i16': this._check(addr, 2); return this.view.getInt16(addr, true);
      case 'u16': this._check(addr, 2); return this.view.getUint16(addr, true);
      case 'i32': this._check(addr, 4); return this.view.getInt32(addr, true);
      case 'u32': this._check(addr, 4); return this.view.getUint32(addr, true);
      case 'f32': this._check(addr, 4); return this.view.getFloat32(addr, true);
      case 'f64': this._check(addr, 8); return this.view.getFloat64(addr, true);
      case 'ptr': this._check(addr, 8); return this.view.getFloat64(addr, true);
      default:    throw new SegFault(`Unknown memory access kind: ${kind}`);
    }
  }

  writeKind(addr, kind, val) {
    switch (kind) {
      case 'i8':  this._check(addr, 1); this.view.setInt8(addr, val | 0); return;
      case 'u8':  this._check(addr, 1); this.view.setUint8(addr, val & 0xFF); return;
      case 'i16': this._check(addr, 2); this.view.setInt16(addr, val | 0, true); return;
      case 'u16': this._check(addr, 2); this.view.setUint16(addr, val & 0xFFFF, true); return;
      case 'i32': this._check(addr, 4); this.view.setInt32(addr, val | 0, true); return;
      case 'u32': this._check(addr, 4); this.view.setUint32(addr, val >>> 0, true); return;
      case 'f32': this._check(addr, 4); this.view.setFloat32(addr, val, true); return;
      case 'f64': this._check(addr, 8); this.view.setFloat64(addr, val, true); return;
      case 'ptr': this._check(addr, 8); this.view.setFloat64(addr, val, true); return;
      default:    throw new SegFault(`Unknown memory access kind: ${kind}`);
    }
  }

  sizeOfKind(kind) {
    return { i8: 1, u8: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, f64: 8, ptr: 8 }[kind] || 1;
  }

  // ── C-string helpers (null-terminated byte sequences) ────
  readCString(addr, maxLen = this.size) {
    if (addr === 0) return '';
    let out = '', a = addr, n = 0;
    while (n < maxLen) {
      const b = this.readKind(a, 'u8');
      if (b === 0) break;
      out += String.fromCharCode(b);
      a++; n++;
    }
    return out;
  }

  writeCString(addr, str, maxBytes = Infinity) {
    let i = 0;
    const cap = Number.isFinite(maxBytes) ? maxBytes - 1 : str.length;
    for (; i < str.length && i < cap; i++) this.writeKind(addr + i, 'u8', str.charCodeAt(i) & 0xFF);
    this.writeKind(addr + i, 'u8', 0);
    return i;
  }

  // ── Bulk operations ───────────────────────────────────────
  copy(dest, src, len) {
    if (len <= 0) return;
    this._check(dest, len); this._check(src, len);
    this.bytes.copyWithin(dest, src, src + len); // memmove semantics (overlap-safe)
  }

  fill(addr, len, byteVal) {
    if (len <= 0) return;
    this._check(addr, len);
    this.bytes.fill(byteVal & 0xFF, addr, addr + len);
  }

  // ── DATA segment (globals + interned string literals) ────
  allocGlobal(size, align = 4) {
    size = Math.max(1, size);
    let addr = (this.dataPtr + (align - 1)) & ~(align - 1);
    if (addr + size > this.HEAP_BASE) {
      throw new SegFault('Out of memory: data/globals segment exhausted');
    }
    this.dataPtr = addr + size;
    return addr;
  }

  internString(text) {
    if (this.strPool.has(text)) return this.strPool.get(text);
    const addr = this.allocGlobal(text.length + 1, 1);
    this.writeCString(addr, text, text.length + 1);
    this.strPool.set(text, addr);
    return addr;
  }

  // ── HEAP segment (malloc/calloc/free) ────────────────────
  allocHeap(size) {
    size = Math.max(1, Math.trunc(size));
    for (let i = 0; i < this.freeList.length; i++) {
      const blk = this.freeList[i];
      if (blk.size >= size) {
        this.freeList.splice(i, 1);
        this.liveBlocks.set(blk.addr, blk.size);
        return blk.addr;
      }
    }
    let addr = this.heapPtr;
    if (addr + size > this.HEAP_END) return 0; // malloc() failure => NULL, same as real C
    this.heapPtr = (addr + size + 7) & ~7;      // bump + 8-byte align next allocation
    this.liveBlocks.set(addr, size);
    return addr;
  }

  freeHeap(addr) {
    if (!addr) return; // free(NULL) is a documented no-op in real C
    if (!this.liveBlocks.has(addr)) {
      throw new SegFault(`free(): invalid pointer 0x${addr.toString(16)} — not a live malloc'd block (double free or corrupted pointer?)`);
    }
    const size = this.liveBlocks.get(addr);
    this.liveBlocks.delete(addr);
    this.freeList.push({ addr, size });
  }

  // ── STACK segment (locals & call frames — grows DOWN) ────
  pushFrame() { return this.sp; }

  popFrame(mark) { this.sp = mark; }

  allocStack(size, align = 4) {
    size = Math.max(1, size);
    let addr = (this.sp - size) & ~(align - 1);
    if (addr <= this.HEAP_END) {
      throw new SegFault('Stack overflow — out of stack space (deep recursion or oversized locals?)');
    }
    this.sp = addr;
    if (this.sp < this.stackFloor) this.stackFloor = this.sp;
    return addr;
  }

  // ── Introspection (powers the memory viewer / %p / debugging) ─
  stats() {
    return {
      totalSize:      this.size,
      dataUsed:        this.dataPtr - this.DATA_BASE,
      dataBase:        this.DATA_BASE,
      heapBase:        this.HEAP_BASE,
      heapEnd:         this.HEAP_END,
      heapBumpUsed:    this.heapPtr - this.HEAP_BASE,
      heapLiveBytes:   [...this.liveBlocks.values()].reduce((a, b) => a + b, 0),
      heapLiveBlocks:  this.liveBlocks.size,
      stackBase:       this.STACK_BASE,
      stackPointer:    this.sp,
      stackPeakUsed:   this.STACK_BASE - this.stackFloor,
    };
  }

  hexdump(addr, len) {
    this._check(addr, len);
    const lines = [];
    for (let i = 0; i < len; i += 16) {
      const row = [];
      for (let j = i; j < Math.min(i + 16, len); j++) row.push(this.bytes[addr + j].toString(16).padStart(2, '0'));
      lines.push(`0x${(addr + i).toString(16).padStart(6, '0')}  ${row.join(' ')}`);
    }
    return lines.join('\n');
  }

  fmtAddr(addr) { return '0x' + (addr >>> 0).toString(16); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { VMemory, SegFault };

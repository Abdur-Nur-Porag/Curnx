// ============================================================
//  CURNX v1.3 — engine/interpreter.js
//  Tree-walk Interpreter (AST Evaluator)
//
//  New in v1.3: every variable is now backed by a real address in
//  a simulated virtual memory space (see engine/memory.js) instead
//  of a JS object property. `&x` returns a genuine numeric address,
//  `*p` reads real bytes at that address, `arr[i]` / pointer
//  arithmetic do real address math scaled by the element's real
//  byte size, and `sizeof` reports real byte sizes instead of a
//  hardcoded 4. Arrays decay to pointers exactly like real C.
//
//  Supports a "jsBridge" — native JS functions exposed to C
//  via #include <name.jh> (see engine/curnx.js).
// ============================================================

// ── Signal classes for control flow ──────────────────────────
class BreakSignal    { constructor() { this.type = 'break'; } }
class ContinueSignal { constructor() { this.type = 'continue'; } }
class ReturnSignal   { constructor(val) { this.val = val; this.type = 'return'; } }
class CError extends Error {}

// Resolve VMemory/SegFault whether we're loaded as a <script> global
// (browser — engine/memory.js must be included first, see index.html)
// or via require() (Node — used by the test harness). Deliberately NOT
// named `VMemory`/`SegFault` here: classic <script> tags share one global
// lexical scope, so redeclaring those identifiers would throw in-browser.
const _CurnxMem = (typeof module !== 'undefined' && module.exports) ? require('./memory.js') : null;
const _VMemory  = _CurnxMem ? _CurnxMem.VMemory  : VMemory;

// ── A type descriptor ("Desc") describes the C type of a value ──
// { base, category, unsigned, ptr, isArray, dims }
//   base:      canonical display name, e.g. 'int', 'struct Point'
//   category:  'void' | 'int' | 'float' | 'char' | 'struct'
//   unsigned:  true if declared unsigned
//   ptr:       pointer depth (0 = not a pointer)
//   isArray:   true for array types
//   dims:      array of dimension sizes (outermost first) or null

// ── Scoped variable environment — now a map of NAME -> ADDRESS ──
class Env {
  constructor(parent = null, memory = null) {
    this.parent = parent;
    this.memory = memory || (parent ? parent.memory : null);
    this.slots  = {};   // name -> address
    this.descs  = {};   // name -> Desc
  }

  declare(name, addr, desc) { this.slots[name] = addr; this.descs[name] = desc; }

  _lookup(name) {
    if (name in this.slots) return this;
    if (this.parent) return this.parent._lookup(name);
    return null;
  }

  getAddr(name) {
    const owner = this._lookup(name);
    if (!owner) throw new CError(`Undefined variable: ${name}`);
    return owner.slots[name];
  }

  getDesc(name) {
    const owner = this._lookup(name);
    return owner ? owner.descs[name] : null;
  }
}

// ── Main Interpreter class ────────────────────────────────────
class Interpreter {
  constructor(outputCb, opts = {}) {
    this.output      = outputCb;
    this.memory       = opts.memory instanceof _VMemory ? opts.memory : new _VMemory(opts.memorySize || (1 << 20));
    this.global        = new Env(null, this.memory);
    this.funcs          = {};
    this.structs         = {};
    this._structLayoutCache = {};
    this.callDepth        = 0;
    this.stepCount          = 0;
    this.MAX_STEPS           = 500000;
    // jsBridge: { fnName: nativeJsFunction } — populated from
    // #include <name.jh> headers resolved by Curnx before running.
    this.jsBridge = opts.jsBridge || {};
    this._setupBuiltins();
  }

  _setupBuiltins() {
    const INT_DESC   = { base: 'int', category: 'int', unsigned: false, ptr: 0, isArray: false, dims: null };
    const FLOAT_DESC = { base: 'double', category: 'float', unsigned: false, ptr: 0, isArray: false, dims: null };
    const define = (name, val, desc = INT_DESC) => {
      const addr = this.memory.allocGlobal(this._slotInfo(desc).size, 8);
      this.global.declare(name, addr, desc);
      this.memWrite(addr, desc, val);
    };
    define('PI',       Math.PI, FLOAT_DESC);
    define('M_PI',     Math.PI, FLOAT_DESC);
    define('EOF',      -1);
    define('NULL',     0);
    define('TRUE',     1);
    define('FALSE',    0);
    define('INT_MAX',  2147483647);
    define('INT_MIN',  -2147483648);
    define('RAND_MAX', 32767);
  }

  // ── Entry point ─────────────────────────────────────────────
  run(ast) {
    for (const node of ast.body) {
      if (node.type === 'FuncDef' || node.type === 'FuncDecl') {
        this.funcs[node.name] = node;
      } else if (node.type === 'StructDef') {
        this.structs[node.name || '__anon'] = node;
      } else if (node.type === 'VarDecl') {
        this._execVarDecl(node, this.global);
      }
    }
    if (!this.funcs['main']) throw new CError('No main() function found');
    const r = this._callFunc('main', []);
    return r instanceof ReturnSignal ? r.val : r;
  }

  // ── Numeric coercion helper ───────────────────────────────────
  _toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return v.charCodeAt(0) || 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined) return 0;
    const n = +v;
    return Number.isNaN(n) ? 0 : n;
  }

  _charCode(v) {
    if (typeof v === 'string') return v.charCodeAt(0) || 0;
    return Math.trunc(this._toNumber(v)) & 0xFF;
  }

  _asCStr(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return v === 0 ? '' : this.memory.readCString(v);
    if (Array.isArray(v)) return v.filter(x => x && x !== '\0').map(x => typeof x === 'number' ? String.fromCharCode(x) : x).join('');
    return String(v ?? '');
  }

  // ── Descriptor helpers ────────────────────────────────────────
  // Byte size + storage "kind" for a given type descriptor.
  _slotInfo(desc) {
    if (desc.isArray) {
      const scalarDesc = { base: desc.base, category: desc.category, unsigned: desc.unsigned, ptr: desc.ptr || 0, isArray: false, dims: null };
      const scalarInfo = this._slotInfo(scalarDesc);
      const count       = (desc.dims || []).reduce((a, b) => a * (b || 0), 1);
      const elemDesc    = this._elemDesc(desc);
      return { size: Math.max(1, scalarInfo.size * count), kind: 'array', elemInfo: this._slotInfo(elemDesc), count };
    }
    if (desc.ptr && desc.ptr > 0) return { size: 8, kind: 'ptr' };
    switch (desc.category) {
      case 'char':  return { size: 1, kind: desc.unsigned ? 'u8' : 'i8' };
      case 'float': return desc.base === 'float' ? { size: 4, kind: 'f32' } : { size: 8, kind: 'f64' };
      case 'void':  return { size: 1, kind: 'i8' };
      case 'struct': { const layout = this._structLayout(desc.base); return { size: layout.size, kind: 'struct', layout }; }
      default: {
        if (/\bshort\b/.test(desc.base))     return { size: 2, kind: desc.unsigned ? 'u16' : 'i16' };
        if (/\blong\b/.test(desc.base))      return { size: 8, kind: 'f64' }; // long & long long (JS-safe-int range)
        return { size: 4, kind: desc.unsigned ? 'u32' : 'i32' };
      }
    }
  }

  // Type of one element of an array, or of the pointee of a pointer.
  _elemDesc(desc) {
    if (desc.isArray) {
      if (desc.dims && desc.dims.length > 1) return { ...desc, dims: desc.dims.slice(1) };
      return { base: desc.base, category: desc.category, unsigned: desc.unsigned, ptr: desc.ptr || 0, isArray: false, dims: null };
    }
    if (desc.ptr && desc.ptr > 0) return { base: desc.base, category: desc.category, unsigned: desc.unsigned, ptr: desc.ptr - 1, isArray: false, dims: null };
    return desc;
  }

  // Array-to-pointer decay: the type `arr + 1` etc. evaluates to.
  _decayPtr(desc) {
    if (desc.isArray) return { base: desc.base, category: desc.category, unsigned: desc.unsigned, ptr: (desc.ptr || 0) + 1, isArray: false, dims: null };
    return desc;
  }

  _descFromTypeNode(t) {
    if (!t) return null;
    const cat = t.category || (t.base === 'char' ? 'char' : (t.base === 'float' || t.base === 'double') ? 'float' : (t.base && t.base.startsWith('struct:')) ? 'struct' : 'int');
    const baseDisp = cat === 'struct' ? 'struct ' + t.base.slice(7) : t.base;
    return { base: baseDisp, category: cat, unsigned: !!t.unsigned, ptr: t.ptr || 0, isArray: false, dims: null };
  }

  // Struct memory layout (field offsets), computed once and cached.
  _structLayout(base) {
    const name = base.replace(/^struct\s+/, '');
    if (this._structLayoutCache[name]) return this._structLayoutCache[name];
    const sDef = this.structs[name];
    const fields = {}, order = [];
    let offset = 0;
    if (sDef) {
      for (const f of sDef.fields) {
        const fd0 = this._descFromTypeNode(f.type);
        let fDesc = fd0;
        if (f.dims) {
          const dims = f.dims.map(dimExpr => {
            if (dimExpr == null) return 0;
            try { return Math.max(0, Math.trunc(this._toNumber(this._eval(dimExpr, this.global)))); }
            catch (e) { return 0; }
          });
          fDesc = { ...fd0, isArray: true, dims };
        }
        const info  = this._slotInfo(fDesc);
        const align = Math.min(info.size, 8) || 1;
        offset = (offset + align - 1) & ~(align - 1);
        fields[f.name] = { offset, size: info.size, desc: fDesc };
        order.push(f.name);
        offset += info.size;
      }
    }
    const layout = { size: Math.max(offset, 1), fields, order };
    this._structLayoutCache[name] = layout;
    return layout;
  }

  _descToString(desc) {
    let s = desc.base;
    if (desc.ptr) s += ' ' + '*'.repeat(desc.ptr);
    if (desc.isArray) s += '[]';
    return s;
  }

  // ── Static type inference (compile-time-ish; drives pointer
  //     arithmetic step size, dereference width, and sizeof) ─────
  _staticDesc(node, env) {
    if (!node) return null;
    switch (node.type) {
      case 'Paren': return this._staticDesc(node.expr, env);
      case 'ID':    { try { return env.getDesc(node.name); } catch (e) { return null; } }
      case 'Num':   return { base: 'int', category: 'int', unsigned: false, ptr: 0, isArray: false, dims: null };
      case 'Float': return { base: 'double', category: 'float', unsigned: false, ptr: 0, isArray: false, dims: null };
      case 'Char':  return { base: 'char', category: 'char', unsigned: false, ptr: 0, isArray: false, dims: null };
      case 'Str':   return { base: 'char', category: 'char', unsigned: false, ptr: 1, isArray: false, dims: null };
      case 'Cast':  return this._descFromTypeNode(node.castType);
      case 'Unary': {
        if (node.op === '&') {
          const d = this._staticDesc(node.expr, env);
          if (!d) return null;
          return { base: d.base, category: d.category, unsigned: d.unsigned, ptr: (d.isArray ? (d.ptr || 0) : (d.ptr || 0)) + 1, isArray: false, dims: null };
        }
        if (node.op === '*') { const d = this._staticDesc(node.expr, env); return d ? this._elemDesc(d) : null; }
        return this._staticDesc(node.expr, env);
      }
      case 'Index':  { const d = this._staticDesc(node.obj, env); return d ? this._elemDesc(d) : null; }
      case 'Member': {
        const d = this._staticDesc(node.obj, env);
        if (!d || d.category !== 'struct') return null;
        const f = this._structLayout(d.base).fields[node.field];
        return f ? f.desc : null;
      }
      case 'PtrMember': {
        const d = this._staticDesc(node.obj, env);
        if (!d) return null;
        const structDesc = this._elemDesc(d);
        const f = this._structLayout(structDesc.base).fields[node.field];
        return f ? f.desc : null;
      }
      case 'BinOp': {
        if (node.op === '+' || node.op === '-') {
          const ld = this._staticDesc(node.left, env), rd = this._staticDesc(node.right, env);
          const lp = ld && (ld.isArray || ld.ptr > 0), rp = rd && (rd.isArray || rd.ptr > 0);
          if (lp && rp && node.op === '-') return { base: 'long int', category: 'int', unsigned: false, ptr: 0, isArray: false, dims: null };
          if (lp) return this._decayPtr(ld);
          if (rp) return this._decayPtr(rd);
        }
        return this._isFloatNode(node, env)
          ? { base: 'double', category: 'float', unsigned: false, ptr: 0, isArray: false, dims: null }
          : { base: 'int', category: 'int', unsigned: false, ptr: 0, isArray: false, dims: null };
      }
      case 'Call': {
        const callee = node.callee && node.callee.type === 'ID' ? node.callee.name : null;
        const fn = callee ? this.funcs[callee] : null;
        return fn && fn.retType ? this._descFromTypeNode(fn.retType) : null;
      }
      default: return null;
    }
  }

  // ── Address resolution — the heart of the memory model ───────
  // Given ANY addressable expression node, returns { addr, desc }
  // where `desc` is the type stored AT that address.
  _addressOf(node, env) {
    switch (node.type) {
      case 'Paren': return this._addressOf(node.expr, env);
      case 'ID': {
        const addr = env.getAddr(node.name);
        const desc = env.getDesc(node.name);
        return { addr, desc };
      }
      case 'Index': {
        const base = this._addrOrPtrBase(node.obj, env);
        const idx  = Math.trunc(this._toNumber(this._eval(node.idx, env)));
        const elemInfo = this._slotInfo(base.elemDesc);
        return { addr: base.addr + idx * elemInfo.size, desc: base.elemDesc };
      }
      case 'Member': {
        const obj = this._addressOf(node.obj, env);
        if (!obj.desc || obj.desc.category !== 'struct') throw new CError(`'.${node.field}' used on a non-struct value`);
        const layout = this._structLayout(obj.desc.base);
        const f = layout.fields[node.field];
        if (!f) throw new CError(`No such field: ${node.field}`);
        return { addr: obj.addr + f.offset, desc: f.desc };
      }
      case 'PtrMember': {
        const ptrVal  = this._eval(node.obj, env);
        const ptrDesc = this._staticDesc(node.obj, env) || { base: 'int', category: 'int', ptr: 1, isArray: false, dims: null };
        const structDesc = this._elemDesc(ptrDesc);
        const layout = this._structLayout(structDesc.base);
        const f = layout.fields[node.field];
        if (!f) throw new CError(`No such field: ${node.field}`);
        return { addr: ptrVal + f.offset, desc: f.desc };
      }
      case 'Unary': {
        if (node.op === '*') {
          const ptrVal  = this._eval(node.expr, env);
          const ptrDesc = this._staticDesc(node.expr, env) || { base: 'int', category: 'int', ptr: 1, isArray: false, dims: null };
          return { addr: ptrVal, desc: this._elemDesc(ptrDesc) };
        }
        break;
      }
    }
    throw new CError(`Not an lvalue: ${node.type}`);
  }

  // Resolves the "obj" of an Index expression to a base address +
  // element descriptor, whether obj is an array (decays) or a
  // pointer (its stored value already IS the base address).
  _addrOrPtrBase(node, env) {
    const desc = this._staticDesc(node, env);
    if (desc && desc.isArray) {
      const { addr } = this._addressOf(node, env);
      return { addr, elemDesc: this._elemDesc(desc) };
    }
    if (desc && desc.ptr > 0) {
      const addr = this._eval(node, env);
      return { addr, elemDesc: this._elemDesc(desc) };
    }
    // No static type available (e.g. result of a plain malloc()) — best effort.
    const v = this._eval(node, env);
    return { addr: typeof v === 'number' ? v : 0, elemDesc: desc || { base: 'int', category: 'int', unsigned: false, ptr: 0, isArray: false, dims: null } };
  }

  // ── Best-effort runtime type inference (no static decl found) ─
  _inferRuntimeType(v) {
    if (v === null || v === undefined) return 'void';
    if (Array.isArray(v)) return (v.length && typeof v[0] === 'string') ? 'char[]' : 'int[]';
    if (typeof v === 'string') return v.length <= 1 ? 'char' : 'char*';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
    if (typeof v === 'object') return 'struct';
    return typeof v;
  }

  // ── Static-ish float detection (fixes float division truncation) ─
  _isFloatNode(node, env) {
    if (!node) return false;
    switch (node.type) {
      case 'Float':  return true;
      case 'Num':    return false;
      case 'Paren':  return this._isFloatNode(node.expr, env);
      case 'Unary':  return node.op === '-' || node.op === '+' ? this._isFloatNode(node.expr, env) : false;
      case 'Cast':   return node.castType ? node.castType.category === 'float' : false;
      case 'BinOp':  return this._isFloatNode(node.left, env) || this._isFloatNode(node.right, env);
      case 'ID': {
        const d = env.getDesc(node.name);
        return !!d && d.category === 'float';
      }
      case 'Index': case 'Member': case 'PtrMember': {
        const d = this._staticDesc(node, env);
        return !!d && d.category === 'float';
      }
      case 'Call': {
        const callee = node.callee && node.callee.type === 'ID' ? node.callee.name : null;
        return !!callee && ['sqrt', 'pow', 'fabs', 'sin', 'cos', 'tan', 'log', 'log10', 'exp', 'atof'].includes(callee);
      }
      default: return false;
    }
  }

  // ── Memory-backed read/write for a scalar/pointer/struct desc ─
  memRead(addr, desc) {
    const info = this._slotInfo(desc);
    if (info.kind === 'array' || info.kind === 'struct') return addr; // decays to its own address
    if (info.kind === 'ptr') return this.memory.readKind(addr, 'ptr');
    // char is just a small integer in real C — keep it numeric so %d,
    // arithmetic, and comparisons all work; %c/%s already know how to
    // render a numeric char code back into a character.
    return this.memory.readKind(addr, info.kind);
  }

  memWrite(addr, desc, val) {
    const info = this._slotInfo(desc);
    if (info.kind === 'array') {
      if (desc.category === 'char' && typeof val === 'string') {
        this.memory.writeCString(addr, val, desc.dims[desc.dims.length - 1] || undefined);
        return;
      }
      if (typeof val === 'number') { this.memory.copy(addr, val, info.size); return; } // array-from-array copy
      if (Array.isArray(val)) {
        const elemDesc = this._elemDesc(desc);
        const elemInfo = this._slotInfo(elemDesc);
        val.forEach((item, i) => { if (i < (desc.dims[0] || 0)) this.memWrite(addr + i * elemInfo.size, elemDesc, item); });
      }
      return;
    }
    if (info.kind === 'struct') {
      if (typeof val === 'number') { this.memory.copy(addr, val, info.size); return; }
      if (val && typeof val === 'object') this._writeStructFromObject(addr, desc, val);
      return;
    }
    if (info.kind === 'ptr') { this.memory.writeKind(addr, 'ptr', this._toNumber(val)); return; }
    if (desc.category === 'char') {
      const code = typeof val === 'string' ? (val.charCodeAt(0) || 0) : Math.trunc(this._toNumber(val));
      this.memory.writeKind(addr, info.kind, code);
      return;
    }
    let n = this._toNumber(val);
    if (desc.category === 'int') n = Math.trunc(n);
    this.memory.writeKind(addr, info.kind, n);
  }

  _writeStructFromObject(addr, desc, obj) {
    const layout = this._structLayout(desc.base);
    for (const fname of layout.order) {
      if (!(fname in obj)) continue;
      const f = layout.fields[fname];
      this.memWrite(addr + f.offset, f.desc, obj[fname]);
    }
  }

  // ── Function call ────────────────────────────────────────────
  _callFunc(name, args) {
    this.callDepth++;
    if (this.callDepth > 500) { this.callDepth--; throw new CError('Stack overflow (recursion too deep)'); }

    const bi = this._builtin(name, args);
    if (bi !== undefined) { this.callDepth--; return bi; }

    const fn = this.funcs[name];
    if (!fn) { this.callDepth--; throw new CError(`Undefined function: ${name}`); }

    const mark = this.memory.pushFrame();
    let result = 0;
    try {
      const env = new Env(this.global, this.memory);
      for (let i = 0; i < fn.params.length; i++) {
        const p  = fn.params[i];
        const pt = p.varType || { base: 'int', category: 'int', unsigned: false, ptr: 0 };
        const base = this._descFromTypeNode(pt);
        let ptr = base.ptr;
        if (p.arr) ptr += 1; // C array params decay to pointers
        const desc = { ...base, ptr, isArray: false, dims: null };
        const info  = this._slotInfo(desc);
        const align = Math.min(info.size, 8) || 1;
        const addr  = this.memory.allocStack(info.size, align);
        env.declare(p.name, addr, desc);

        const argVal = args[i];
        if (desc.category === 'struct' && desc.ptr === 0) {
          if (typeof argVal === 'number') this.memory.copy(addr, argVal, info.size);
        } else {
          this.memWrite(addr, desc, argVal !== undefined ? argVal : 0);
        }
      }
      const r = this._execBlock(fn.body, env);
      result = r instanceof ReturnSignal ? r.val : 0;
    } finally {
      this.memory.popFrame(mark);
    }
    this.callDepth--;
    return result;
  }

  // ── JS bridge argument marshalling ─────────────────────────
  // Converts an argument expression to a plain JS value for a
  // .jh-linked function: char*/char[] -> JS string, arrays -> JS
  // arrays, everything else passes through as-is. This preserves
  // the "plain JS values in, plain JS values out" bridge contract
  // even though C-side arrays/strings now live in real memory.
  _toBridgeValue(argNode, env) {
    const desc = this._staticDesc(argNode, env);
    const v    = this._eval(argNode, env);
    if (!desc) return v;
    if (desc.category === 'char' && (desc.isArray || desc.ptr > 0)) {
      return typeof v === 'number' ? this._asCStr(v) : String(v);
    }
    if (desc.isArray) {
      const elemDesc = this._elemDesc(desc);
      const elemInfo = this._slotInfo(elemDesc);
      const total = (desc.dims || []).reduce((a, b) => a * (b || 0), 1);
      const out = [];
      for (let i = 0; i < total; i++) out.push(this.memRead(v + i * elemInfo.size, elemDesc));
      return out;
    }
    return v;
  }

  // ── Standard library builtins ────────────────────────────────
  _builtin(name, args) {
    const n = (i) => this._toNumber(args[i]);
    switch (name) {
      case 'printf':   return this._printf(args);
      case 'scanf':    return this._scanf(args);
      case 'puts':     { const s = this._asCStr(args[0]); this.output(s + '\n'); return s.length + 1; }
      case 'putchar':  { const c = this._charCode(args[0]); this.output(String.fromCharCode(c)); return c; }
      case 'getchar':  { const s = prompt('getchar:'); return s ? s.charCodeAt(0) : -1; }
      case 'gets':     {
        const raw = window.prompt('gets:');
        if (raw === null) return 0;
        if (typeof args[0] === 'number') this.memory.writeCString(args[0], raw);
        return args[0] ?? 0;
      }

      // String functions
      case 'strlen':   return this._asCStr(args[0]).length;
      case 'strcpy':   { const s = this._asCStr(args[1]); this.memory.writeCString(args[0], s); return args[0]; }
      case 'strncpy':  { const s = this._asCStr(args[1]).slice(0, n(2)); this.memory.writeCString(args[0], s, n(2)); return args[0]; }
      case 'strcat':   { const d = this._asCStr(args[0]); const s = this._asCStr(args[1]); this.memory.writeCString(args[0], d + s); return args[0]; }
      case 'strcmp':   { const a = this._asCStr(args[0]), b = this._asCStr(args[1]); return a < b ? -1 : a > b ? 1 : 0; }
      case 'strstr':   {
        const h = this._asCStr(args[0]), needle = this._asCStr(args[1]);
        const i = h.indexOf(needle);
        if (i === -1) return 0;
        return typeof args[0] === 'number' ? args[0] + i : i;
      }
      case 'sprintf':  { const fmt = this._asCStr(args[1]); const out = this._formatStr(fmt, args.slice(2)); this.memory.writeCString(args[0], out); return out.length; }
      case 'sscanf':   return 0;

      // Conversion
      case 'atoi':     return parseInt(this._asCStr(args[0])) || 0;
      case 'atof':     return parseFloat(this._asCStr(args[0])) || 0;
      case 'itoa':     {
        const s = String(Math.trunc(n(0)));
        if (args[1] !== undefined && typeof args[1] === 'number') { this.memory.writeCString(args[1], s); return args[1]; }
        return s;
      }

      // Memory
      case 'malloc':   return this.memory.allocHeap(Math.max(1, Math.trunc(n(0))));
      case 'calloc':   { const total = Math.max(1, Math.trunc(n(0) * n(1))); const addr = this.memory.allocHeap(total); if (addr) this.memory.fill(addr, total, 0); return addr; }
      case 'free':     this.memory.freeHeap(args[0]); return 0;
      case 'memset':   this.memory.fill(args[0], Math.trunc(n(2)), Math.trunc(n(1))); return args[0];
      case 'memcpy':   this.memory.copy(args[0], args[1], Math.trunc(n(2))); return args[0];

      // Process
      case 'exit':     throw new ReturnSignal(args[0] ?? 0);

      // Math
      case 'abs': case 'fabs': return Math.abs(n(0));
      case 'sqrt':     return Math.sqrt(n(0));
      case 'pow':      return Math.pow(n(0), n(1));
      case 'floor':    return Math.floor(n(0));
      case 'ceil':     return Math.ceil(n(0));
      case 'round':    return Math.round(n(0));
      case 'sin':      return Math.sin(n(0));
      case 'cos':      return Math.cos(n(0));
      case 'tan':      return Math.tan(n(0));
      case 'log':      return Math.log(n(0));
      case 'log10':    return Math.log10(n(0));
      case 'exp':      return Math.exp(n(0));
      case 'rand':     return Math.floor(Math.random() * 32768);
      case 'srand':    return 0;
      case 'max':      return Math.max(n(0), n(1));
      case 'min':      return Math.min(n(0), n(1));

      // Char classification
      case 'toupper':  return String.fromCharCode(this._charCode(args[0])).toUpperCase().charCodeAt(0);
      case 'tolower':  return String.fromCharCode(this._charCode(args[0])).toLowerCase().charCodeAt(0);
      case 'isalpha':  return /[a-zA-Z]/.test(String.fromCharCode(this._charCode(args[0]))) ? 1 : 0;
      case 'isdigit':  return /[0-9]/.test(String.fromCharCode(this._charCode(args[0]))) ? 1 : 0;
      case 'isspace':  return /\s/.test(String.fromCharCode(this._charCode(args[0]))) ? 1 : 0;
      case 'isalnum':  return /[a-zA-Z0-9]/.test(String.fromCharCode(this._charCode(args[0]))) ? 1 : 0;
      case 'isupper':  return /[A-Z]/.test(String.fromCharCode(this._charCode(args[0]))) ? 1 : 0;
      case 'islower':  return /[a-z]/.test(String.fromCharCode(this._charCode(args[0]))) ? 1 : 0;

      default: return undefined;
    }
  }

  // ── printf implementation ────────────────────────────────────
  _printf(args) {
    if (args.length === 0) return 0;
    const fmt = this._asCStr(args[0]);
    const out = this._formatStr(fmt, args.slice(1));
    this.output(out);
    return out.length;
  }

  // ── scanf implementation ─────────────────────────────────────
  // Supports plain conversions (%d %i %f %c %s ...) and the
  // "scanset" form %[^chars] — most commonly %[^\n], which reads
  // an entire line/command instead of stopping at whitespace.
  _scanf(args) {
    if (args.length === 0) return 0;
    const fmt = this._asCStr(args[0]);
    const specRe = /%(?:\[(\^?)([^\]]*)\]|[hlLqjzt]*([diouxXeEfFgGcs]))/g;
    const specs  = [...fmt.matchAll(specRe)];
    let count = 0;

    for (let i = 0; i < specs.length; i++) {
      const m       = specs[i];
      const isScanset = m[2] !== undefined;
      let val;

      if (isScanset) {
        const excluded = m[2] || '\n';
        const raw = window.prompt(`scanf input (%[^${excluded.replace(/\n/g, '\\n')}]) — full line:`);
        if (raw === null) break;
        const cutIdx = [...excluded].reduce((min, ch) => {
          const idx = raw.indexOf(ch);
          return idx !== -1 && idx < min ? idx : min;
        }, raw.length);
        val = raw.slice(0, cutIdx);
      } else {
        const spec = m[3];
        const raw  = window.prompt(`scanf input (%${spec}):`);
        if (raw === null) break;
        val =
          (spec === 'f' || spec === 'F' || spec === 'e' || spec === 'E' || spec === 'g' || spec === 'G') ? (parseFloat(raw) || 0) :
          spec === 'c' ? (raw[0] || '\0') :
          spec === 's' ? (raw.trim().split(/\s+/)[0] ?? '') :
          (parseInt(raw, 10) || 0);
      }

      if (this._scanRefs && this._scanRefs[i]) this._scanRefs[i](val);
      count++;
    }
    return count;
  }

  // ── printf format string engine ──────────────────────────────
  _formatStr(fmt, vals) {
    if (typeof fmt !== 'string') return String(fmt);
    let out = '', vi = 0, i = 0;
    const self = this;

    while (i < fmt.length) {
      if (fmt[i] !== '%') { out += fmt[i++]; continue; }
      i++;
      if (i >= fmt.length) break;
      if (fmt[i] === '%') { out += '%'; i++; continue; }

      let flags = '', width = '', prec = '', spec = '', lenMod = '';
      while ('-+ #0'.includes(fmt[i])) flags += fmt[i++];
      while (/\d/.test(fmt[i]))        width += fmt[i++];
      if (fmt[i] === '.') { i++; while (/\d/.test(fmt[i])) prec += fmt[i++]; }
      while ('hlLqjzt'.includes(fmt[i])) lenMod += fmt[i++];
      spec = fmt[i++];

      const wide = lenMod.includes('l') || lenMod.includes('q') || lenMod.includes('j') || lenMod.includes('L');

      const v = vals[vi++];
      switch (spec) {
        case 'd': case 'i': out += fmtInt(v, width, flags);   break;
        case 'u':           out += fmtInt(toUnsignedBits(v, wide), width, flags.replace(/[+ ]/g, '')); break;
        case 'o':           out += toUnsignedBits(v, wide).toString(8);    break;
        case 'x':           out += toUnsignedBits(v, wide).toString(16);   break;
        case 'X':           out += toUnsignedBits(v, wide).toString(16).toUpperCase(); break;
        case 'f': case 'F': out += fmtFloat(v, width, prec !== '' ? +prec : 6, flags); break;
        case 'e': case 'E': out += (+v || 0).toExponential(prec !== '' ? +prec : 6); break;
        case 'g': case 'G': out += parseFloat((+v || 0).toPrecision(prec !== '' ? +prec : 6)).toString(); break;
        case 'c':           out += typeof v === 'string' ? v[0] : String.fromCharCode(+v || 0); break;
        case 's': {
          let s = v === null || v === undefined ? '(null)'
                : typeof v === 'number' ? (v === 0 ? '(null)' : self.memory.readCString(v))
                : Array.isArray(v) ? v.filter(x => x && x !== '\0').join('')
                : String(v);
          if (prec !== '') s = s.slice(0, +prec);
          if (width !== '') s = flags.includes('-') ? s.padEnd(+width) : s.padStart(+width);
          out += s;
          break;
        }
        case 'p': out += (v === 0 || v === null || v === undefined) ? '0x0' : '0x' + toUnsignedBits(v, true).toString(16); break;
        default:  out += '%' + spec;
      }
    }
    return out;

    function toUnsignedBits(v, wide) {
      let n = Math.trunc(+v || 0);
      if (wide) return n < 0 ? n + (Number.MAX_SAFE_INTEGER + 1) : n;
      return n >>> 0;
    }

    function fmtInt(v, width, flags) {
      let s = String(Math.trunc(+v || 0));
      if (flags.includes('+') || flags.includes(' ')) s = (+v >= 0 ? '+' : '') + s;
      if (width !== '') s = flags.includes('-') ? s.padEnd(+width) : s.padStart(+width, flags.includes('0') ? '0' : ' ');
      return s;
    }
    function fmtFloat(v, width, prec, flags) {
      let s = (+v || 0).toFixed(prec);
      if (flags.includes('+') || flags.includes(' ')) s = (+v >= 0 ? '+' : '') + s;
      if (width !== '') s = flags.includes('-') ? s.padEnd(+width) : s.padStart(+width, flags.includes('0') ? '0' : ' ');
      return s;
    }
  }

  // ── Statement execution ──────────────────────────────────────
  _execBlock(block, env) {
    for (const stmt of block.body) {
      const r = this._exec(stmt, env);
      if (r instanceof BreakSignal || r instanceof ContinueSignal || r instanceof ReturnSignal) return r;
    }
  }

  _exec(node, env) {
    this.stepCount++;
    if (this.stepCount > this.MAX_STEPS) throw new CError('Execution limit reached (infinite loop?)');

    switch (node.type) {
      case 'Block': {
        const mark = this.memory.pushFrame();
        try { return this._execBlock(node, new Env(env)); }
        finally { this.memory.popFrame(mark); }
      }
      case 'VarDecl':  return this._execVarDecl(node, env);
      case 'ExprStmt': this._eval(node.expr, env); return;

      case 'If': {
        if (this._eval(node.cond, env)) return this._exec(node.then, env);
        if (node.els)                   return this._exec(node.els,  env);
        return;
      }

      case 'While': {
        while (this._eval(node.cond, env)) {
          const r = this._exec(node.body, env);
          if (r instanceof BreakSignal)    break;
          if (r instanceof ReturnSignal)   return r;
          this.stepCount++;
          if (this.stepCount > this.MAX_STEPS) throw new CError('Execution limit reached');
        }
        return;
      }

      case 'DoWhile': {
        do {
          const r = this._exec(node.body, env);
          if (r instanceof BreakSignal)    break;
          if (r instanceof ReturnSignal)   return r;
          this.stepCount++;
          if (this.stepCount > this.MAX_STEPS) throw new CError('Execution limit reached');
        } while (this._eval(node.cond, env));
        return;
      }

      case 'For': {
        const mark = this.memory.pushFrame();
        try {
          const fenv = new Env(env);
          if (node.init) {
            if (node.init.type === 'VarDecl') this._execVarDecl(node.init, fenv);
            else this._eval(node.init.expr, fenv);
          }
          while (!node.cond || this._eval(node.cond, fenv)) {
            const r = this._exec(node.body, fenv);
            if (r instanceof BreakSignal)  break;
            if (r instanceof ReturnSignal) return r;
            if (node.upd) this._eval(node.upd, fenv);
            this.stepCount++;
            if (this.stepCount > this.MAX_STEPS) throw new CError('Execution limit reached');
          }
        } finally {
          this.memory.popFrame(mark);
        }
        return;
      }

      case 'Return':   return new ReturnSignal(node.val ? this._eval(node.val, env) : 0);
      case 'Break':    return new BreakSignal();
      case 'Continue': return new ContinueSignal();

      case 'Switch': {
        const disc    = this._eval(node.disc, env);
        let matched   = false;
        for (const c of node.cases) {
          if (c.type === 'Default') continue;
          if (this._eval(c.val, env) === disc) matched = true;
          if (matched) {
            for (const s of c.stmts) {
              const r = this._exec(s, env);
              if (r instanceof BreakSignal)  return;
              if (r instanceof ReturnSignal) return r;
            }
          }
        }
        if (!matched) {
          const def = node.cases.find(c => c.type === 'Default');
          if (def) {
            for (const s of def.stmts) {
              const r = this._exec(s, env);
              if (r instanceof BreakSignal)  return;
              if (r instanceof ReturnSignal) return r;
            }
          }
        }
        return;
      }

      case 'StructDef': this.structs[node.name] = node; return;
      default:          this._eval(node, env);
    }
  }

  _execVarDecl(node, env) {
    for (const d of node.decls) {
      const vt  = node.varType || { base: 'int', category: 'int', unsigned: false, ptr: 0 };
      const base0 = this._descFromTypeNode(vt);

      let dims = null;
      if (d.dims) {
        dims = d.dims.map((dimExpr, i) => {
          if (dimExpr == null) {
            if (i === 0) {
              if (d.init && d.init.type === 'InitList') return d.init.items.length;
              if (d.init && d.init.type === 'Str')      return d.init.val.length + 1;
            }
            return 0;
          }
          return Math.max(0, Math.trunc(this._toNumber(this._eval(dimExpr, env))));
        });
      }
      const isArray = !!dims;
      const desc = { ...base0, isArray, dims };
      const info  = this._slotInfo(desc);
      const align = Math.min(info.size, 8) || 1;
      const addr  = node.global ? this.memory.allocGlobal(info.size, align) : this.memory.allocStack(info.size, align);

      env.declare(d.name, addr, desc);

      if (isArray) {
        this.memory.fill(addr, info.size, 0);
        if (d.init) this._initArray(addr, desc, d.init, env);
      } else if (desc.category === 'struct' && desc.ptr === 0) {
        this.memory.fill(addr, info.size, 0);
        if (d.init) {
          if (d.init.type === 'InitList') this._initStructFromList(addr, desc, d.init, env);
          else { const src = this._eval(d.init, env); if (typeof src === 'number') this.memory.copy(addr, src, info.size); }
        }
      } else {
        const val = d.init ? this._eval(d.init, env) : (desc.category === 'char' ? '\0' : 0);
        this.memWrite(addr, desc, val);
      }
    }
  }

  _initArray(addr, desc, initNode, env) {
    const elemDesc = this._elemDesc(desc);
    const elemInfo = this._slotInfo(elemDesc);
    const count    = desc.dims[0] || 0;

    if (initNode.type === 'Str') {
      this.memory.writeCString(addr, initNode.val, count || undefined);
      return;
    }
    if (initNode.type === 'InitList') {
      initNode.items.forEach((item, i) => {
        if (i >= count) return;
        const elemAddr = addr + i * elemInfo.size;
        if (desc.dims.length > 1) {
          if (item.type === 'InitList' || (item.type === 'Str' && elemDesc.category === 'char')) this._initArray(elemAddr, elemDesc, item, env);
          else this.memWrite(elemAddr, elemDesc, this._eval(item, env));
        } else if (elemDesc.category === 'struct' && elemDesc.ptr === 0) {
          if (item.type === 'InitList') this._initStructFromList(elemAddr, elemDesc, item, env);
          else { const src = this._eval(item, env); if (typeof src === 'number') this.memory.copy(elemAddr, src, elemInfo.size); }
        } else {
          this.memWrite(elemAddr, elemDesc, this._eval(item, env));
        }
      });
    }
  }

  _initStructFromList(addr, desc, initNode, env) {
    const layout = this._structLayout(desc.base);
    initNode.items.forEach((item, i) => {
      const fname = layout.order[i];
      if (!fname) return;
      const field = layout.fields[fname];
      const fAddr = addr + field.offset;
      if (field.desc.isArray) {
        if (item.type === 'InitList' || item.type === 'Str') this._initArray(fAddr, field.desc, item, env);
      } else if (field.desc.category === 'struct' && field.desc.ptr === 0) {
        if (item.type === 'InitList') this._initStructFromList(fAddr, field.desc, item, env);
        else { const src = this._eval(item, env); if (typeof src === 'number') this.memory.copy(fAddr, src, field.size); }
      } else {
        this.memWrite(fAddr, field.desc, this._eval(item, env));
      }
    });
  }

  // ── L-value resolution (for assignment) ─────────────────────
  _lval(node, env) {
    const { addr, desc } = this._addressOf(node, env);
    return {
      desc,
      get: () => this.memRead(addr, desc),
      set: (v) => this.memWrite(addr, desc, v),
    };
  }

  // ── Expression evaluation ────────────────────────────────────
  _eval(node, env) {
    switch (node.type) {
      case 'Num':      return node.val;
      case 'Float':    return node.val;
      case 'Str':      return this.memory.internString(node.val);
      case 'Char':     return node.val.charCodeAt(0);
      case 'Paren':    return this._eval(node.expr, env);
      case 'Comma':    this._eval(node.left, env); return this._eval(node.right, env);

      case 'Cast': {
        const v = this._eval(node.expr, env);
        const t = node.castType;
        if (!t) return v;
        if (t.ptr && t.ptr > 0) return this._toNumber(v); // pointer cast: value (address) unchanged
        if (t.category === 'char') {
          if (typeof v === 'number') return String.fromCharCode(((Math.trunc(v) % 256) + 256) % 256);
          if (typeof v === 'string') return v[0] || '\0';
          return '\0';
        }
        const num = typeof v === 'string' ? (v.charCodeAt(0) || 0) : (+v || 0);
        if (t.category === 'float') return num;
        return Math.trunc(num);
      }

      case 'SizeOf': {
        let desc;
        if (node.argType) {
          desc = this._descFromTypeNode(node.argType);
        } else {
          desc = this._staticDesc(node.argExpr, env);
          if (!desc) {
            const v = this._eval(node.argExpr, env);
            return typeof v === 'string' ? v.length + 1 : (Number.isInteger(v) ? 4 : 8);
          }
        }
        return this._slotInfo(desc).size;
      }

      case 'TypeOf': {
        if (node.argType) return this._descToString(this._descFromTypeNode(node.argType));
        const expr = node.argExpr;
        const d = this._staticDesc(expr, env);
        if (d) return this._descToString(d);
        return this._inferRuntimeType(this._eval(expr, env));
      }

      case 'InitList': return node.items.map(i => this._eval(i, env));

      case 'ID': {
        try {
          const addr = env.getAddr(node.name);
          const desc = env.getDesc(node.name);
          return this.memRead(addr, desc);
        } catch (e) {
          if (this.funcs[node.name] || typeof this.jsBridge[node.name] === 'function') return node.name;
          throw e;
        }
      }

      case 'Unary': {
        if (node.op === '&') return this._addressOf(node.expr, env).addr;
        if (node.op === '*') { const { addr, desc } = this._addressOf(node, env); return this.memRead(addr, desc); }
        const v = this._eval(node.expr, env);
        if (node.op === '-') return -v;
        if (node.op === '!') return v ? 0 : 1;
        if (node.op === '~') return ~v;
        return v;
      }

      case 'PreInc': {
        const lv   = this._lval(node.expr, env);
        const step = (lv.desc && lv.desc.ptr > 0) ? this._slotInfo(this._elemDesc(lv.desc)).size : 1;
        const nv   = node.op === '++' ? lv.get() + step : lv.get() - step;
        lv.set(nv); return nv;
      }

      case 'PostInc': {
        const lv   = this._lval(node.expr, env);
        const step = (lv.desc && lv.desc.ptr > 0) ? this._slotInfo(this._elemDesc(lv.desc)).size : 1;
        const old  = lv.get();
        lv.set(node.op === '++' ? old + step : old - step);
        return old;
      }

      case 'BinOp': {
        if (node.op === '&&') { const l = this._eval(node.left, env); if (!l) return 0; return this._eval(node.right, env) ? 1 : 0; }
        if (node.op === '||') { const l = this._eval(node.left, env); if (l)  return 1; return this._eval(node.right, env) ? 1 : 0; }

        // Real pointer / array arithmetic: `p + n` steps by sizeof(*p) bytes,
        // and `p2 - p1` between two same-type pointers yields an element count.
        if (node.op === '+' || node.op === '-') {
          const ld = this._staticDesc(node.left, env), rd = this._staticDesc(node.right, env);
          const lp = ld && (ld.isArray || ld.ptr > 0), rp = rd && (rd.isArray || rd.ptr > 0);
          if (lp || rp) {
            if (lp && rp && node.op === '-') {
              const elemSize = this._slotInfo(this._elemDesc(ld)).size;
              const lv = this._eval(node.left, env), rv = this._eval(node.right, env);
              return Math.trunc((lv - rv) / elemSize);
            }
            const ptrDesc = lp ? ld : rd;
            const ptrVal  = lp ? this._eval(node.left, env)  : this._eval(node.right, env);
            const idxVal  = lp ? this._eval(node.right, env) : this._eval(node.left, env);
            const elemSize = this._slotInfo(this._elemDesc(ptrDesc)).size;
            const idx = Math.trunc(this._toNumber(idxVal));
            return node.op === '+' ? ptrVal + idx * elemSize : ptrVal - idx * elemSize;
          }
        }

        const l = this._eval(node.left, env);
        const r = this._eval(node.right, env);
        switch (node.op) {
          case '+':  return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : l + r;
          case '-':  return l - r;
          case '*':  return l * r;
          case '/':  {
            if (r === 0) throw new CError('Division by zero');
            const floaty = this._isFloatNode(node.left, env) || this._isFloatNode(node.right, env);
            return floaty ? l / r : ((Number.isInteger(l) && Number.isInteger(r)) ? Math.trunc(l / r) : l / r);
          }
          case '%':  if (r === 0) throw new CError('Modulo by zero'); return l % r;
          case '<':  return l < r  ? 1 : 0;
          case '>':  return l > r  ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          case '==': return l == r ? 1 : 0;
          case '!=': return l != r ? 1 : 0;
          case '&':  return (~~l) &  (~~r);
          case '|':  return (~~l) |  (~~r);
          case '^':  return (~~l) ^  (~~r);
          case '<<': return (~~l) << (~~r);
          case '>>': return (~~l) >> (~~r);
        }
        return 0;
      }

      case 'Assign': {
        const lv = this._lval(node.left, env);
        let rval;
        if (node.op === '=') {
          rval = this._eval(node.right, env);
        } else {
          const cur   = lv.get();
          const rraw  = this._eval(node.right, env);
          const isPtr = lv.desc && lv.desc.ptr > 0;
          const step  = isPtr ? this._slotInfo(this._elemDesc(lv.desc)).size : 1;
          switch (node.op) {
            case '+=': rval = isPtr ? cur + Math.trunc(this._toNumber(rraw)) * step : cur + rraw; break;
            case '-=': rval = isPtr ? cur - Math.trunc(this._toNumber(rraw)) * step : cur - rraw; break;
            case '*=': rval = cur * rraw; break;
            case '/=': {
              if (rraw === 0) throw new CError('Division by zero');
              const floaty = this._isFloatNode(node.left, env) || this._isFloatNode(node.right, env);
              rval = floaty ? cur / rraw : ((Number.isInteger(cur) && Number.isInteger(rraw)) ? Math.trunc(cur / rraw) : cur / rraw);
              break;
            }
            case '%=': rval = cur % rraw; break;
          }
        }
        lv.set(rval); return rval;
      }

      case 'Ternary': return this._eval(node.cond, env) ? this._eval(node.then, env) : this._eval(node.els, env);

      case 'Index': {
        const { addr, desc } = this._addressOf(node, env);
        if (desc.isArray) return addr;
        return this.memRead(addr, desc);
      }

      case 'Member': case 'PtrMember': {
        const { addr, desc } = this._addressOf(node, env);
        if (desc.isArray || desc.category === 'struct') return addr;
        return this.memRead(addr, desc);
      }

      case 'Call': {
        const callee = node.callee.type === 'ID' ? node.callee.name : this._eval(node.callee, env);

        if (callee === 'scanf') {
          const fmt   = node.args[0] ? this._eval(node.args[0], env) : '';
          const fmtStr = this._asCStr(fmt);
          const specs = [...fmtStr.matchAll(/%(?:\[(?:\^?)[^\]]*\]|[hlLqjzt]*[diouxXeEfFgGcs])/g)];
          this._scanRefs = specs.map((_, i) => {
            const refNode = node.args[i + 1];
            if (!refNode) return () => {};
            const target = refNode.type === 'Unary' && refNode.op === '&' ? refNode.expr : refNode;
            return (v) => {
              try { this._lval(target, env).set(v); } catch (e) { /* ignore */ }
            };
          });
          return this._scanf([fmtStr, ...node.args.slice(1).map(a => this._eval(a, env))]);
        }

        if (typeof this.jsBridge[callee] === 'function') {
          this.callDepth++;
          if (this.callDepth > 500) { this.callDepth--; throw new CError('Stack overflow (recursion too deep)'); }
          const jsArgs = node.args.map(a => this._toBridgeValue(a, env));
          let r;
          try { r = this.jsBridge[callee](...jsArgs); }
          catch (e) { this.callDepth--; throw new CError(`JS bridge function "${callee}" threw: ${e.message}`); }
          this.callDepth--;
          return r ?? 0;
        }

        const args = node.args.map(a => this._eval(a, env));
        const r    = this._callFunc(callee, args);
        return r instanceof ReturnSignal ? r.val : r ?? 0;
      }

      default: return 0;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Interpreter, ReturnSignal, BreakSignal, ContinueSignal, CError, Env };

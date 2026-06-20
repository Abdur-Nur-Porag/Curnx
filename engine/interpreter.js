// ============================================================
//  CURNX v1.2 — engine/interpreter.js
//  Tree-walk Interpreter (AST Evaluator)
//  Walks the AST and executes C code in JavaScript.
//  Supports a "jsBridge" — native JS functions exposed to C
//  via #include <name.jh> (see engine/curnx.js).
// ============================================================

// ── Signal classes for control flow ──────────────────────────
class BreakSignal    { constructor() { this.type = 'break'; } }
class ContinueSignal { constructor() { this.type = 'continue'; } }
class ReturnSignal   { constructor(val) { this.val = val; this.type = 'return'; } }
class CError extends Error {}

// ── Scoped variable environment ───────────────────────────────
class Env {
  constructor(parent = null) {
    this.vars   = {};
    this.types  = {};   // name -> canonical type string, for typeof()
    this.parent = parent;
  }

  get(name) {
    if (name in this.vars) return this.vars[name];
    if (this.parent)       return this.parent.get(name);
    throw new CError(`Undefined variable: ${name}`);
  }

  set(name, val) {
    if (name in this.vars)  { this.vars[name] = val; return; }
    if (this.parent) {
      try { this.parent.set(name, val); return; } catch (e) {}
    }
    throw new CError(`Undefined variable: ${name}`);
  }

  def(name, val) { this.vars[name] = val; }

  defType(name, typeStr) { this.types[name] = typeStr; }

  getType(name) {
    if (name in this.types) return this.types[name];
    if (this.parent)        return this.parent.getType(name);
    return null;
  }
}

// ── Main Interpreter class ────────────────────────────────────
class Interpreter {
  constructor(outputCb, opts = {}) {
    this.output    = outputCb;
    this.global    = new Env();
    this.funcs     = {};
    this.structs   = {};
    this.callDepth = 0;
    this.stepCount = 0;
    this.MAX_STEPS = 500000;
    // jsBridge: { fnName: nativeJsFunction } — populated from
    // #include <name.jh> headers resolved by Curnx before running.
    this.jsBridge   = opts.jsBridge || {};
    this._setupBuiltins();
  }

  _setupBuiltins() {
    const G = this.global;
    G.def('PI',       Math.PI);
    G.def('M_PI',     Math.PI);
    G.def('EOF',      -1);
    G.def('NULL',     0);
    G.def('TRUE',     1);
    G.def('FALSE',    0);
    G.def('INT_MAX',  2147483647);
    G.def('INT_MIN',  -2147483648);
    G.def('RAND_MAX', 32767);
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

  // ── Function call ────────────────────────────────────────────
  _callFunc(name, args) {
    this.callDepth++;
    if (this.callDepth > 500) throw new CError('Stack overflow (recursion too deep)');

    const bi = this._builtin(name, args);
    if (bi !== undefined) { this.callDepth--; return bi; }

    // ── JS Bridge: functions linked in via #include <name.jh> ──
    if (typeof this.jsBridge[name] === 'function') {
      let r;
      try {
        r = this.jsBridge[name](...args);
      } catch (e) {
        throw new CError(`JS bridge function "${name}" threw: ${e.message}`);
      }
      this.callDepth--;
      return r;
    }

    const fn = this.funcs[name];
    if (!fn) throw new CError(`Undefined function: ${name}`);

    const env = new Env(this.global);
    for (let i = 0; i < fn.params.length; i++) {
      env.def(fn.params[i].name, args[i] !== undefined ? args[i] : 0);
      if (fn.params[i].varType) {
        env.defType(fn.params[i].name, this._typeDescToString(fn.params[i].varType, { isArray: !!fn.params[i].arr }));
      }
    }

    const r = this._execBlock(fn.body, env);
    this.callDepth--;
    if (r instanceof ReturnSignal) return r.val;
    return 0;
  }

  // ── Type descriptor → display string (used by typeof()) ───────
  _typeDescToString(t, { isArray = false } = {}) {
    if (!t) return 'int';
    let s = t.base || 'int';
    if (s.startsWith('struct:')) s = 'struct ' + s.slice(7);
    if (t.ptr) s += ' ' + '*'.repeat(t.ptr);
    if (isArray) s += '[]';
    return s;
  }

  // ── Best-effort runtime type inference (no static decl found) ─
  _inferRuntimeType(v) {
    if (v === null || v === undefined) return 'void';
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'string') return 'char[]';
      return 'int[]';
    }
    if (typeof v === 'string') return v.length <= 1 ? 'char' : 'char*';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
    if (typeof v === 'object') return 'struct';
    return typeof v;
  }

  // ── Static-ish float detection (fixes float division truncation) ─
  // JS can't distinguish 7.0 from 7 at runtime, so "is this expression
  // float?" has to be answered from the AST + declared types, not the
  // resulting number's integer-ness.
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
        const t = env.getType(node.name);
        return !!t && /\b(float|double)\b/.test(t);
      }
      case 'Call': {
        const callee = node.callee && node.callee.type === 'ID' ? node.callee.name : null;
        return !!callee && ['sqrt','pow','fabs','sin','cos','tan','log','log10','exp','atof'].includes(callee);
      }
      default: return false;
    }
  }

  // ── Standard library builtins ────────────────────────────────
  _builtin(name, args) {
    switch (name) {
      case 'printf':   return this._printf(args);
      case 'scanf':    return this._scanf(args);
      case 'puts':     { this.output((args[0] ?? '') + ''); return 0; }
      case 'putchar':  { this.output(String.fromCharCode(args[0])); return args[0]; }
      case 'getchar':  { const s = prompt('getchar:'); return s ? s.charCodeAt(0) : -1; }
      case 'gets':     return 0;

      // String functions
      case 'strlen':   {
        const s = args[0];
        if (typeof s === 'string') return s.length;
        if (Array.isArray(s)) { let i = 0; while (s[i] && s[i] !== '\0') i++; return i; }
        return 0;
      }
      case 'strcpy':
      case 'strncpy':  return args[1];
      case 'strcat':   return (args[0] ?? '') + (args[1] ?? '');
      case 'strcmp':   { const a = String(args[0] ?? ''), b = String(args[1] ?? ''); return a < b ? -1 : a > b ? 1 : 0; }
      case 'strstr':   { const h = String(args[0] ?? ''), n = String(args[1] ?? ''); const i = h.indexOf(n); return i === -1 ? 0 : i; }
      case 'sprintf':  return this._formatStr(String(args[0] ?? ''), args.slice(1));
      case 'sscanf':   return 0;

      // Conversion
      case 'atoi':     return parseInt(String(args[0] ?? 0)) || 0;
      case 'atof':     return parseFloat(String(args[0] ?? 0)) || 0;
      case 'itoa':     return String(args[0]);

      // Memory
      case 'malloc':   return new Array(args[0]).fill(0);
      case 'calloc':   return new Array(args[0] * (args[1] || 1)).fill(0);
      case 'free':     return;
      case 'memset':   return args[0];
      case 'memcpy':   return args[0];

      // Process
      case 'exit':     throw new ReturnSignal(args[0] ?? 0);

      // Math
      case 'abs':
      case 'fabs':     return Math.abs(args[0]);
      case 'sqrt':     return Math.sqrt(args[0]);
      case 'pow':      return Math.pow(args[0], args[1]);
      case 'floor':    return Math.floor(args[0]);
      case 'ceil':     return Math.ceil(args[0]);
      case 'round':    return Math.round(args[0]);
      case 'sin':      return Math.sin(args[0]);
      case 'cos':      return Math.cos(args[0]);
      case 'tan':      return Math.tan(args[0]);
      case 'log':      return Math.log(args[0]);
      case 'log10':    return Math.log10(args[0]);
      case 'exp':      return Math.exp(args[0]);
      case 'rand':     return Math.floor(Math.random() * 32768);
      case 'srand':    return;
      case 'max':      return Math.max(args[0], args[1]);
      case 'min':      return Math.min(args[0], args[1]);

      // Char classification
      case 'toupper':  return typeof args[0] === 'string' ? args[0].toUpperCase() : String.fromCharCode(args[0]).toUpperCase().charCodeAt(0);
      case 'tolower':  return typeof args[0] === 'string' ? args[0].toLowerCase() : String.fromCharCode(args[0]).toLowerCase().charCodeAt(0);
      case 'isalpha':  return /[a-zA-Z]/.test(String.fromCharCode(args[0])) ? 1 : 0;
      case 'isdigit':  return /[0-9]/.test(String.fromCharCode(args[0])) ? 1 : 0;
      case 'isspace':  return /\s/.test(String.fromCharCode(args[0])) ? 1 : 0;
      case 'isalnum':  return /[a-zA-Z0-9]/.test(String.fromCharCode(args[0])) ? 1 : 0;
      case 'isupper':  return /[A-Z]/.test(String.fromCharCode(args[0])) ? 1 : 0;
      case 'islower':  return /[a-z]/.test(String.fromCharCode(args[0])) ? 1 : 0;

      default: return undefined;
    }
  }

  // ── printf implementation ────────────────────────────────────
  _printf(args) {
    if (args.length === 0) return 0;
    const fmt = args[0];
    if (typeof fmt !== 'string') { this.output(String(fmt)); return 1; }
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
    const fmt = String(args[0]);
    const specRe = /%(?:\[(\^?)([^\]]*)\]|[hlLqjzt]*([diouxXeEfFgGcs]))/g;
    const specs  = [...fmt.matchAll(specRe)];
    let count = 0;

    for (let i = 0; i < specs.length; i++) {
      const m       = specs[i];
      const isScanset = m[2] !== undefined;
      let val;

      if (isScanset) {
        // %[^...] — read the full line as-is (a "command"/sentence),
        // stopping logically at the excluded character (default: \n).
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
          spec === 's' ? (raw.trim().split(/\s+/)[0] ?? '') :    // %s stops at first whitespace
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

    while (i < fmt.length) {
      if (fmt[i] !== '%') { out += fmt[i++]; continue; }
      i++;
      if (i >= fmt.length) break;
      if (fmt[i] === '%') { out += '%'; i++; continue; }

      let flags = '', width = '', prec = '', spec = '', lenMod = '';
      while ('-+ #0'.includes(fmt[i])) flags += fmt[i++];
      while (/\d/.test(fmt[i]))        width += fmt[i++];
      if (fmt[i] === '.') { i++; while (/\d/.test(fmt[i])) prec += fmt[i++]; }
      while ('hlLqjzt'.includes(fmt[i])) lenMod += fmt[i++]; // h/l/ll/L/q/j/z/t — width of the argument
      spec = fmt[i++];

      // "wide" = the value may legitimately exceed 32 bits (long, long long, etc.)
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
          let s = v === null || v === undefined ? '(null)' : Array.isArray(v) ? v.filter(x => x && x !== '\0').join('') : String(v);
          if (prec !== '') s = s.slice(0, +prec);
          if (width !== '') s = flags.includes('-') ? s.padEnd(+width) : s.padStart(+width);
          out += s;
          break;
        }
        case 'p': out += '0x' + toUnsignedBits(v, true).toString(16); break;
        default:  out += '%' + spec;
      }
    }
    return out;

    // Renders the unsigned bit-pattern of v for %o/%x/%X/%u/%p.
    // wide=true (l/ll/q/j/L length modifier) keeps full JS-safe-integer
    // range instead of wrapping to 32 bits, so long/long long survive.
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
      case 'Block':    return this._execBlock(node, new Env(env));
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
      const vt       = node.varType || { base: 'int', category: 'int' };
      const base     = vt.base || 'int';
      const category = vt.category || (base === 'char' ? 'char' : (base === 'float' || base === 'double') ? 'float' : base.startsWith('struct:') ? 'struct' : 'int');
      let val        = 0;
      let isArray    = false;

      if (d.size !== null && d.size !== undefined) {
        // Array declaration
        isArray = true;
        const sz = this._eval(d.size, env);
        if (d.init && d.init.type === 'InitList') {
          const arr = new Array(sz).fill(0);
          d.init.items.forEach((item, i) => { if (i < sz) arr[i] = this._eval(item, env); });
          val = arr;
        } else if (d.init && d.init.type === 'Str') {
          val = [...d.init.val].map(c => c.charCodeAt(0));
          val.push(0);
        } else {
          val = new Array(sz).fill(category === 'char' ? '\0' : 0);
        }
      } else if (category === 'struct') {
        // Struct instance
        const sname = base.slice(7);
        const sDef  = this.structs[sname];
        val = {};
        if (sDef) for (const f of sDef.fields) val[f.name] = f.size ? new Array(4).fill(0) : 0;
        if (d.init) val = this._eval(d.init, env);
      } else if (d.init) {
        if (d.init.type === 'Str')      val = d.init.val;
        else if (d.init.type === 'InitList') val = d.init.items.map(i => this._eval(i, env));
        else val = this._eval(d.init, env);
      } else {
        val = category === 'char' ? '\0' : category === 'float' ? 0.0 : 0;
      }

      // Integer-family declarations truncate to whole numbers, mirroring
      // C's storage semantics for int/long/short/unsigned (but not float/double).
      if (category === 'int' && typeof val === 'number') val = Math.trunc(val);

      env.def(d.name, val);
      env.defType(d.name, this._typeDescToString(vt, { isArray }));
    }
  }

  // ── L-value resolution (for assignment) ─────────────────────
  _lval(node, env) {
    if (node.type === 'ID') {
      return { get: () => env.get(node.name), set: (v) => env.set(node.name, v) };
    }
    if (node.type === 'Index') {
      const obj = this._eval(node.obj, env);
      const idx = this._eval(node.idx, env);
      return { get: () => Array.isArray(obj) ? obj[idx] : 0, set: (v) => { if (Array.isArray(obj)) obj[idx] = v; } };
    }
    if (node.type === 'Member') {
      const obj = this._eval(node.obj, env);
      return { get: () => obj[node.field], set: (v) => obj[node.field] = v };
    }
    if (node.type === 'PtrMember') {
      const obj = this._eval(node.obj, env);
      return { get: () => obj[node.field], set: (v) => obj[node.field] = v };
    }
    if (node.type === 'Unary' && node.op === '*') return this._lval(node.expr, env);
    throw new CError(`Not an lvalue: ${node.type}`);
  }

  // ── Expression evaluation ────────────────────────────────────
  _eval(node, env) {
    switch (node.type) {
      case 'Num':      return node.val;
      case 'Float':    return node.val;
      case 'Str':      return node.val;
      case 'Char':     return node.val.charCodeAt(0);
      case 'Paren':    return this._eval(node.expr, env);
      case 'Comma':    this._eval(node.left, env); return this._eval(node.right, env);
      case 'Cast': {
        const v = this._eval(node.expr, env);
        const t = node.castType;
        if (!t) return v;
        if (t.category === 'char') {
          if (typeof v === 'number') return String.fromCharCode(((Math.trunc(v) % 256) + 256) % 256);
          if (typeof v === 'string') return v[0] || '\0';
          return '\0';
        }
        const n = typeof v === 'string' ? (v.charCodeAt(0) || 0) : (+v || 0);
        if (t.category === 'float') return n;          // float/double: keep fraction
        return Math.trunc(n);                           // int family (incl. long/short/unsigned)
      }
      case 'TypeOf': {
        if (node.argType) return this._typeDescToString(node.argType);
        const expr = node.argExpr;
        if (expr && expr.type === 'ID') {
          const declared = env.getType(expr.name);
          if (declared) return declared;
        }
        return this._inferRuntimeType(this._eval(expr, env));
      }
      case 'InitList': return node.items.map(i => this._eval(i, env));

      case 'ID': {
        try { return env.get(node.name); }
        catch (e) {
          if (this.funcs[node.name] || typeof this.jsBridge[node.name] === 'function') return node.name;
          throw e;
        }
      }

      case 'Unary': {
        if (node.op === '&' || node.op === '*') return this._eval(node.expr, env);
        const v = this._eval(node.expr, env);
        if (node.op === '-') return -v;
        if (node.op === '!') return v ? 0 : 1;
        if (node.op === '~') return ~v;
        return v;
      }

      case 'PreInc': {
        const lv = this._lval(node.expr, env);
        const nv = node.op === '++' ? lv.get() + 1 : lv.get() - 1;
        lv.set(nv); return nv;
      }

      case 'PostInc': {
        const lv  = this._lval(node.expr, env);
        const old = lv.get();
        lv.set(node.op === '++' ? old + 1 : old - 1);
        return old;
      }

      case 'BinOp': {
        // Short-circuit logic
        if (node.op === '&&') { const l = this._eval(node.left, env); if (!l) return 0; return this._eval(node.right, env) ? 1 : 0; }
        if (node.op === '||') { const l = this._eval(node.left, env); if (l)  return 1; return this._eval(node.right, env) ? 1 : 0; }
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
        let rval = this._eval(node.right, env);
        const lv = this._lval(node.left, env);
        if (node.op !== '=') {
          const cur = lv.get();
          switch (node.op) {
            case '+=': rval = cur + rval; break;
            case '-=': rval = cur - rval; break;
            case '*=': rval = cur * rval; break;
            case '/=': {
              if (rval === 0) throw new CError('Division by zero');
              const floaty = this._isFloatNode(node.left, env) || this._isFloatNode(node.right, env);
              rval = floaty ? cur / rval : ((Number.isInteger(cur) && Number.isInteger(rval)) ? Math.trunc(cur / rval) : cur / rval);
              break;
            }
            case '%=': rval = cur % rval; break;
          }
        }
        lv.set(rval); return rval;
      }

      case 'Ternary': return this._eval(node.cond, env) ? this._eval(node.then, env) : this._eval(node.els, env);

      case 'Index': {
        const obj = this._eval(node.obj, env);
        const idx = this._eval(node.idx, env);
        if (typeof obj === 'string')   return obj.charCodeAt(idx) || 0;
        if (Array.isArray(obj))        return obj[idx] ?? 0;
        return 0;
      }

      case 'Member':    { const obj = this._eval(node.obj, env); return obj?.[node.field] ?? 0; }
      case 'PtrMember': { const obj = this._eval(node.obj, env); return obj?.[node.field] ?? 0; }

      case 'Call': {
        const callee = node.callee.type === 'ID' ? node.callee.name : this._eval(node.callee, env);

        // Special handling for scanf to capture write-back references
        if (callee === 'scanf') {
          const fmt   = node.args[0] ? this._eval(node.args[0], env) : '';
          const specs = [...String(fmt).matchAll(/%(?:\[(?:\^?)[^\]]*\]|[hlLqjzt]*[diouxXeEfFgGcs])/g)];
          this._scanRefs = specs.map((_, i) => {
            const refNode = node.args[i + 1];
            if (!refNode) return () => {};
            const target = refNode.type === 'Unary' && refNode.op === '&' ? refNode.expr : refNode;
            return (v) => {
              try { this._lval(target, env).set(v); } catch (e) { /* ignore */ }
            };
          });
          return this._scanf([fmt, ...node.args.slice(1).map(a => this._eval(a, env))]);
        }

        const args = node.args.map(a => this._eval(a, env));
        const r    = this._callFunc(callee, args);
        return r instanceof ReturnSignal ? r.val : r ?? 0;
      }

      default: return 0;
    }
  }
}

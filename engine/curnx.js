// ============================================================
//  CURNX v1.2 — engine/curnx.js
//  Base of the framework. Calls the parser (tokenizer + AST)
//  and the interpreter, and resolves C preprocessor includes:
//
//    #include <stdio.h>   → core header, builtin, no-op
//    #include "my.h"      → user header, fetched + inlined
//    #include <math.jh>   → JS header, fetched + linked as a
//                            native JS "bridge" callable from C
//
//  Public API:
//    Curnx.execute(code, opts)      → Promise<Result>
//    Curnx.loadExecute(path, opts)  → Promise<Result>
//    Curnx.ast(code, opts)          → Promise<ASTNode>
//    Curnx.compile(code, opts)      → Promise<{source,tokens,ast,jsBridge}>
//
//  Depends on: engine/parser.js (tokenize, parse)
//              engine/interpreter.js (Interpreter, ReturnSignal)
// ============================================================

const Curnx = (() => {

  const VERSION = '1.2.0';

  // Core C headers Curnx already implements as builtins —
  // included for compatibility, resolved as a no-op.
  const CORE_HEADERS = new Set([
    'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'ctype.h',
    'time.h', 'limits.h', 'stdbool.h', 'stdarg.h', 'assert.h',
    'float.h', 'errno.h'
  ]);

  // Matches: #include <name.ext>   or   #include "name.ext"
  const INCLUDE_RE = /^[ \t]*#[ \t]*include[ \t]*([<"])([^>"]+)[>"][ \t]*$/;

  // ── Path helpers ──────────────────────────────────────────
  function dirname(path) {
    const i = path.lastIndexOf('/');
    return i === -1 ? '' : path.slice(0, i + 1);
  }

  function joinPath(base, rel) {
    if (/^([a-z]+:)?\/\//i.test(rel) || rel.startsWith('/')) return rel;
    return (base || '') + rel;
  }

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new CurnxError(`Could not load "${url}" (HTTP ${res.status})`);
    return await res.text();
  }

  class CurnxError extends Error {}

  // ── .jh JS-bridge loader ─────────────────────────────────
  // A .jh file is plain JavaScript declaring functions that
  // become callable from C, e.g.:
  //   function addNum(a, b) { return a + b; }
  // We sandbox-evaluate it and harvest every top-level
  // function / arrow-function binding into a plain object.
  function extractJsBindingNames(src) {
    const names = new Set();
    const fnDeclRe = /function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/g;
    const varFnRe  = /(?:^|[\s;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
    let m;
    while ((m = fnDeclRe.exec(src))) names.add(m[1]);
    while ((m = varFnRe.exec(src)))  names.add(m[1]);
    return [...names];
  }

  function loadJsBridge(src, headerName) {
    const names = extractJsBindingNames(src);
    if (names.length === 0) {
      throw new CurnxError(`JS header "${headerName}" declared no functions to link`);
    }
    const harvest = names
      .map(n => `try { __curnx_bridge[${JSON.stringify(n)}] = ${n}; } catch (e) {}`)
      .join('\n');
    // new Function gives the script its own scope; nothing here
    // touches the outer Curnx/Interpreter internals.
    const factory = new Function('__curnx_bridge', `
      ${src}
      ${harvest}
      return __curnx_bridge;
    `);
    return factory({});
  }

  // ── #include resolver ────────────────────────────────────
  // Walks the source line by line. Inlines user ".h" headers
  // (recursively), skips core headers, and links ".jh" headers
  // into a jsBridge map that the Interpreter consults at call time.
  async function resolveSource(rawSource, basePath, jsBridge, seen) {
    const lines  = rawSource.split('\n');
    const output = [];

    for (const line of lines) {
      const m = line.match(INCLUDE_RE);
      if (!m) { output.push(line); continue; }

      const angle = m[1] === '<';
      const name  = m[2];

      // 1. JS communication header (always fetched, regardless of <> or "")
      if (name.endsWith('.jh')) {
        const url   = joinPath(basePath, name);
        const jsSrc = await fetchText(url);
        const bridge = loadJsBridge(jsSrc, name);
        Object.assign(jsBridge, bridge);
        output.push(`// [curnx] linked JS bridge: ${name} (${Object.keys(bridge).join(', ')})`);
        continue;
      }

      // 2. Core C header — already builtin, skip
      if (angle && CORE_HEADERS.has(name)) {
        output.push(`// [curnx] core header: ${name}`);
        continue;
      }

      // 3. User-defined header — fetch & inline its (resolved) text
      const url = joinPath(basePath, name);
      if (seen.has(url)) {
        output.push(`// [curnx] header already included: ${name}`);
        continue;
      }
      seen.add(url);
      const headerSrc = await fetchText(url);
      const resolved   = await resolveSource(headerSrc, dirname(url), jsBridge, seen);
      output.push(`// [curnx] begin header: ${name}`, resolved, `// [curnx] end header: ${name}`);
    }

    return output.join('\n');
  }

  // ── Compile pipeline: includes → tokens → AST ────────────
  async function compile(source, opts = {}) {
    const basePath = opts.basePath || '';
    const jsBridge  = {};
    const seen      = new Set();

    const finalSource = await resolveSource(source, basePath, jsBridge, seen);
    const tokens       = tokenize(finalSource);
    const astTree       = parse(tokens);

    return { source: finalSource, tokens, ast: astTree, jsBridge };
  }

  // ── Execute: compile + run, captures stdout ──────────────
  async function execute(code, opts = {}) {
    const onOutput = typeof opts.onOutput === 'function' ? opts.onOutput : null;
    let buffered = '';

    const { ast: astTree, jsBridge, source } = await compile(code, opts);

    const interp = new Interpreter((text) => {
      buffered += text;
      if (onOutput) onOutput(text);
    }, { jsBridge });

    let exitCode = 0, error = null;
    try {
      const r = interp.run(astTree);
      exitCode = r ?? 0;
    } catch (e) {
      if (e instanceof ReturnSignal) exitCode = e.val ?? 0;
      else error = e.message || String(e);
    }

    return {
      output:   buffered,
      exitCode,
      error,
      ast:      astTree,
      source,
      steps:    interp.stepCount
    };
  }

  // ── Load + execute an external .c file ───────────────────
  async function loadExecute(path, opts = {}) {
    const src  = await fetchText(path);
    const base = opts.basePath || dirname(path);
    return execute(src, { ...opts, basePath: base });
  }

  // ── AST only (no execution) ──────────────────────────────
  async function ast(code, opts = {}) {
    const result = await compile(code, opts);
    return result.ast;
  }

  return { execute, loadExecute, ast, compile, version: VERSION, CurnxError };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Curnx;

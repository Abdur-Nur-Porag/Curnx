# Curnx CJs

> A C parser and interpreter written in pure vanilla JavaScript — run C code directly in your browser, no compiler needed.

![License](https://img.shields.io/badge/license-MIT%20%2B%20Attribution-blue)
![Language](https://img.shields.io/badge/language-Vanilla%20JS-yellow)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Version](https://img.shields.io/badge/version-1.3.0-orange)

---

## What's new in v1.3

**A real virtual memory model.** Every variable now lives at an actual numeric address in a simulated, byte-addressable RAM (`engine/memory.js` — new), instead of being a JS object property. Concretely:

- **`&x` returns a real address**, and `*p` really dereferences it by reading bytes at that address. `printf("%p", &x)` now prints something meaningful.
- **Real, byte-scaled pointer arithmetic** — `p + 1` moves by `sizeof(*p)` bytes (not by 1), `p2 - p1` between two same-type pointers correctly yields an *element* count, and `p++`/`p += n` are pointer-aware too.
- **Real arrays** — elements are laid out contiguously in memory exactly like C, array names decay to a pointer to their first element in expressions, and **multi-dimensional arrays** (`int grid[3][4]`, nested initializers `{{1,2},{3,4}}`) are supported for the first time, with correct row-major addressing.
- **Real `sizeof`** — previously hardcoded to always return `4`; now computed from the actual type (`sizeof(int)` → 4, `sizeof(double)` → 8, `sizeof(arr)` → the array's true total size, `sizeof(ptr)` → real pointer size), and `float` genuinely stores at 32-bit precision (distinct from `double`'s 64-bit) instead of both silently sharing JS's native double.
- **Real `struct` layout** — fields sit at real, computed byte offsets, struct-to-struct assignment (`p2 = p1;`) now does a true copy instead of the old aliasing bug where both variables secretly shared one JS object, and `->`/`.` both resolve through real addresses.
- **Real dynamic memory** — `malloc`/`calloc`/`free` now allocate/release from an actual heap region with address reuse after `free()`, instead of `malloc` faking it with a plain JS array and `free`/`memset`/`memcpy` being silent no-ops (they were, in v1.2 — genuine bugs fixed here). A stack region grows and shrinks for real as functions are called and return, so recursive calls really do get distinct, lower addresses per frame, and deep-enough recursion hits a real stack overflow.
- **New "Memory" panel in the UI** — after a run, click **🧠 Memory** to see the global-scope variables (name / address / type / value) and allocator stats (data/heap/stack usage, live heap blocks). Local variables intentionally aren't listed after a run finishes — like on a real machine, their stack frame is really gone by then.
- **Honest side effect**: out-of-bounds array/buffer writes can now genuinely corrupt neighboring memory instead of being silently absorbed by a JS array — the same footgun real C has. Useful for teaching *why* buffer overflows are dangerous, not just that they are.
- **Bug fixes found along the way**: `free()` and `srand()` previously always raised "Undefined function" if called (a dispatch bug — they returned `undefined`, which looked identical to "no such builtin"); `puts()` wasn't appending its trailing newline; `sprintf()` ignored its destination buffer and returned a string instead of writing into it; `PI`/`M_PI` are no longer silently truncated to `3`.
- Engine files (`memory.js`, `parser.js`, `interpreter.js`, `curnx.js`) now also load under Node via `require()`, for local testing — no change for browser usage.

> Two honest scope limits, called out here rather than left to be discovered: pointer/`long`/`long long` values live in an 8-byte slot but are stored as IEEE-754 doubles under the hood (same JS-safe-integer-range caveat v1.2 already had for 64-bit math), and multi-dimensional arrays are supported for variables but not yet as function parameters (`void f(int m[][4])`) — pass a single-dimension pointer and compute strides manually for now.

## What's new in v1.2

- **Rebuilt the type parser** — `long`, `short`, `unsigned`, `signed` are real composable modifiers now (not aliased straight to `int`), so `long long int`, `unsigned long`, `long double`, `signed char`, etc. all parse correctly and report their true name. Bare modifiers without a base type also work (`unsigned x;`, `long y;`).
- **`typeof`** — a new Curnx-extension keyword that returns a variable's or expression's datatype as a string at runtime: `typeof(x)`, `typeof(long long)`. See [`docs/KEYWORDS.md`](docs/KEYWORDS.md).
- **`printf` width/precision, hardened**: `%5d`, `%-5d`, `%05d`, `%.2f`, `%9.7f`, `%2.5f`, plus `%i` as a full alias for `%d`. Also fixed a real overflow bug where `%lld`/`%llx`/`%llu` silently corrupted large `long`/`long long` values via JS's 32-bit `~~` truncation trick — these now use `Math.trunc` and stay accurate up to the JS safe-integer range.
- **`scanf` scanset support**: `%[^\n]` reads a full line/sentence instead of stopping at the first space — useful for "enter a command" style input. `%s` itself now correctly stops at the first whitespace character, matching real C semantics (previously it grabbed the whole input).
- **Float-division bug fix**: `7.0 / 2` was truncating to `3` instead of `3.5`, because JS can't tell `7.0` apart from `7` at runtime. Division now checks the expression's *declared* type (literal `7.0` vs. variable declared `float`/`double`) instead of guessing from the resulting value.
- **Real `(type)` casts**: `(int)`, `(float)`, `(char)` casts now actually convert the value instead of being a no-op.

## What's new in v1.1

- **Restructured into an `engine/`** — the framework itself (tokenizer, parser, interpreter, and the new `Curnx` base file) now lives separately from the demo app in `src/`.
- **Real `#include` support**:
  - `#include <stdio.h>` and other core headers — resolved as built-ins (no-op).
  - `#include "myheader.h"` — fetched over the network and inlined, recursively.
  - `#include <name.jh>` — a **JS communication header**: plain JavaScript functions that become directly callable from your C code.
- **Public `Curnx` API** for embedding the engine in your own page — `Curnx.execute()`, `Curnx.loadExecute()`, `Curnx.ast()`.

---
## Features
- **Full C Lexer** — tokenizes keywords, operators, literals, identifiers
- **Recursive Descent Parser** — builds a complete AST, with a robust composite-type system (`long long int`, `unsigned long`, `long double`, etc.) and multi-dimensional array declarators
- **Tree-walk Interpreter** — evaluates the AST directly in JS
- **A real virtual memory model** — variables live at real numeric addresses in a simulated, byte-addressable RAM with DATA/HEAP/STACK segments; see [What's new in v1.3](#whats-new-in-v13)
- **printf / scanf** — full format string support (width, precision, flags, `%i`, `%lld`/`%llx`/`%llu`, scansets like `%[^\n]`), scanf uses browser `prompt()`
- **All control flow** — `if/else`, `while`, `for`, `do-while`, `switch/case`, `break`, `continue`, `return`
- **Types** — `int`, `float`, `double`, `char`, `long`/`short`/`unsigned`/`signed` (and combinations), arrays (incl. multi-dimensional), pointers, `struct`
- **`typeof`** — a Curnx extension that returns a datatype name as a string at runtime
- **Operators** — arithmetic, bitwise, logical, relational, compound assignment (`+=`, `-=`, etc.), `++`/`--`, real `(type)` casts, real pointer arithmetic
- **Functions** — recursion, parameters, return values
- **`#include`** — core headers, user `.h` headers, and `.jh` JS-bridge headers
- **Standard library** — `sqrt`, `pow`, `abs`, `rand`, `strlen`, `strcmp`, `atoi`, `malloc`/`calloc`/`free` (a real heap), `toupper`, and more
- **17 built-in samples** — Hello World, Fibonacci, Factorial, Bubble Sort, Structs, Switch, Pointers, Memory & Addresses, 2D Arrays, Pointer Arithmetic, Dynamic Memory, scanf, User Header, JS Bridge, Type System, typeof Demo, scanf scanset
---
## Documentation
| Doc | Covers |
|---|---|
| [`docs/KEYWORDS.md`](docs/KEYWORDS.md) | All 26 supported C keywords, by category, plus the composite type system, `typeof`, and built-in stdlib functions |
| [`docs/HEADERS.md`](docs/HEADERS.md) | Full syntax reference for `<core.h>`, `"user.h"`, and `<bridge.jh>` includes |
---
## Project Structure
```
curnx/
├── index.html          ← Main UI (links all files)
├── css/
│   └── style.css       ← Dark IDE theme
├── engine/              ← The framework itself
│   ├── memory.js         ← v1.3: VMemory — the virtual RAM (DATA/HEAP/STACK)
│   ├── parser.js        ← tokenize() + parse(): C source → tokens → AST
│   ├── interpreter.js   ← Interpreter class: AST → execution (+ JS bridge)
│   └── curnx.js         ← Base of the framework. Calls parser + interpreter,
│                           resolves #include, exposes the public Curnx API
├── src/                  ← Demo app built on top of the engine
│   ├── samples.js       ← Built-in example programs
│   └── app.js           ← UI logic & boot (drives everything via Curnx,
│                           incl. the v1.3 memory viewer panel)
├── examples/             ← Sample headers used by the demo
│   ├── util.h            ← user-defined C header
│   └── math.jh           ← JS bridge header
├── docs/                 ← Reference documentation
│   ├── KEYWORDS.md       ← every supported C keyword, categorized
│   └── HEADERS.md        ← `.h` / `.jh` include syntax in detail
├── LICENSE
└── README.md
```
`engine/curnx.js` is the framework's entry point — it calls into `memory.js` (virtual RAM), `parser.js` (tokenizer + AST), and `interpreter.js` (evaluator) so you never have to touch any of them directly. Script order in `index.html` matters: `memory.js` loads before `interpreter.js`, which depends on it.

---

## Using the engine (`Curnx`)

```html
<script src="engine/memory.js"></script>
<script src="engine/parser.js"></script>
<script src="engine/interpreter.js"></script>
<script src="engine/curnx.js"></script>
```

### Run inline C source

```js
const result = await Curnx.execute(`
#include <stdio.h>
int main() {
    printf("Hello from Curnx!\\n");
    return 0;
}
`);

console.log(result.output);    // "Hello from Curnx!\n"
console.log(result.exitCode);  // 0
```

### Inspecting virtual memory (new in v1.3)

`Curnx.execute()`'s result now includes a `memory` field: the global-scope variables (name, address, type, value) and allocator stats (data/heap/stack byte usage, live heap block count) from that run.

```js
const result = await Curnx.execute(`
#include <stdio.h>
int counter = 0;
int main() { counter++; return 0; }
`);

console.log(result.memory.globals);
// [{ name: 'counter', address: '0x100', type: 'int', value: 1 }, ...also PI, NULL, etc.]
console.log(result.memory.stats.stackPeakUsed); // how deep the stack went during this run
```

Local/stack variables aren't included — by the time a run finishes, their stack frames have really been popped, the same as on a real machine. To inspect locals mid-execution you'd need a step debugger, which is outside what this field provides.

### Run an external `.c` file

```js
const result = await Curnx.loadExecute('my.c');
```

### Get the AST only

```js
const tree = await Curnx.ast(`int main(){ return 0; }`);
console.log(JSON.stringify(tree, null, 2));
```

### Stream output as it's produced

```js
await Curnx.execute(code, {
  onOutput: (chunk) => console.log('chunk:', chunk)
});
```

### `basePath`

Headers (`"name.h"`, `<name.jh>`) are fetched relative to `basePath` (default `''`). `Curnx.loadExecute()` infers it from the file's own path; pass it explicitly to `Curnx.execute()` if your inline code includes headers:

```js
await Curnx.execute(code, { basePath: 'examples/' });
```

> Fetching headers requires the page to be served over HTTP(S) (e.g. `python3 -m http.server`) — browsers block `fetch()` of local files under `file://`.

---

## Header files

> Full syntax reference: [`docs/HEADERS.md`](docs/HEADERS.md)

C already distinguishes two include forms:

```c
#include <name.h>   // core / library header
#include "name.h"   // user-defined header
```

Curnx keeps that distinction and adds a third kind for talking to JavaScript:

```c
#include <name.jh>  // JavaScript communication header
```

### Core headers
`<stdio.h>`, `<stdlib.h>`, `<string.h>`, `<math.h>`, `<ctype.h>`, etc. are already implemented as interpreter built-ins, so they resolve to a no-op.

### User headers (`.h`)
Fetched via `fetch()` and inlined at the `#include` site, recursively (a header can itself `#include` more headers).

**`examples/util.h`**
```c
int square(int n) { return n * n; }
int cube(int n)   { return n * n * n; }
```

**your code**
```c
#include <stdio.h>
#include "util.h"

int main() {
    printf("%d\n", square(5));
    return 0;
}
```

### JS bridge headers (`.jh`)
A `.jh` file is plain JavaScript. Every top-level function it declares becomes directly callable from your C code — no JS code reaches the C side, only the function names and return values do.

**`examples/math.jh`**
```js
function addNum(num_1, num_2) { return num_1 + num_2; }
```

**`addition.c`**
```c
#include <stdio.h>
#include <math.jh>

void main() {
    int a, b, sum;
    a = 10;
    b = 20;
    sum = addNum(a, b);
    printf("%d", sum);
}
```

---


## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Run code |
| `Tab` | Insert 4 spaces |

The **🧠 Memory** button in the header (new in v1.3) toggles a panel showing the global variables and allocator stats from the last run — see [Inspecting virtual memory](#inspecting-virtual-memory-new-in-v13).

---

## Supported C Features

> Full keyword-by-keyword reference: [`docs/KEYWORDS.md`](docs/KEYWORDS.md)

| Feature | Support |
|---|---|
| `int`, `float`, `double`, `char` | ✅ Real distinct byte widths (`float`=4 bytes w/ real precision loss, `double`=8) |
| `long`, `short`, `unsigned`, `signed` (incl. combinations) | ✅ |
| `typeof(x)` | ✅ Curnx extension |
| Arrays, incl. multi-dimensional (`int m[3][4]`) | ✅ Real contiguous memory, row-major |
| Pointers (`*`, `&`) | ✅ Real addresses; real byte-scaled pointer arithmetic |
| `struct` | ✅ Real computed field offsets; struct assignment does a true copy |
| `if / else` | ✅ |
| `while`, `do-while` | ✅ |
| `for` loop | ✅ |
| `switch / case / default` | ✅ |
| `break`, `continue` | ✅ |
| `return` | ✅ |
| Recursion | ✅ Each call frame gets real, distinct stack addresses |
| `(type)` casts | ✅ Real conversion (int/float/char/pointer) |
| `printf` | ✅ Width, precision, flags, `%i`, `%lld`/`%llx`/`%llu`, real `%p` addresses |
| `scanf` | ✅ Via browser prompt, incl. `%[^\n]` scansets |
| Math functions | ✅ `sqrt`, `pow`, `sin`, `cos`… |
| String functions | ✅ `strlen`, `strcmp`, `strcat`, `sprintf`… (work over real memory) |
| Dynamic memory | ✅ `malloc`/`calloc`/`free` — a real heap, real address reuse |
| `sizeof` | ✅ Real byte size per type/array/struct (was hardcoded to `4` in v1.2) |
| `typedef` | ⚠️ Parsed but ignored |
| `#include <core.h>` | ✅ Resolved as built-in |
| `#include "user.h"` | ✅ Fetched & inlined |
| `#include <bridge.jh>` | ✅ JS functions linked into C |
| `#define` | ⚠️ Skipped (not needed) |
| Multi-dim array function params (`f(int m[][4])`) | ⚠️ Not yet — pass a pointer and stride manually |
| File I/O | ❌ |


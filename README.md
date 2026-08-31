# Curnx CJs

> A C parser and interpreter written in pure vanilla JavaScript — run C code directly in your browser, no compiler needed.

![License](https://img.shields.io/badge/license-MIT%20%2B%20Attribution-blue)
![Language](https://img.shields.io/badge/language-Vanilla%20JS-yellow)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Version](https://img.shields.io/badge/version-1.2.0-orange)

---

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
- **Recursive Descent Parser** — builds a complete AST, with a robust composite-type system (`long long int`, `unsigned long`, `long double`, etc.)
- **Tree-walk Interpreter** — evaluates the AST directly in JS
- **printf / scanf** — full format string support (width, precision, flags, `%i`, `%lld`/`%llx`/`%llu`, scansets like `%[^\n]`), scanf uses browser `prompt()`
- **All control flow** — `if/else`, `while`, `for`, `do-while`, `switch/case`, `break`, `continue`, `return`
- **Types** — `int`, `float`, `double`, `char`, `long`/`short`/`unsigned`/`signed` (and combinations), arrays, pointers, `struct`
- **`typeof`** — a Curnx extension that returns a datatype name as a string at runtime
- **Operators** — arithmetic, bitwise, logical, relational, compound assignment (`+=`, `-=`, etc.), `++`/`--`, real `(type)` casts
- **Functions** — recursion, parameters, return values
- **`#include`** — core headers, user `.h` headers, and `.jh` JS-bridge headers
- **Standard library** — `sqrt`, `pow`, `abs`, `rand`, `strlen`, `strcmp`, `atoi`, `malloc`, `toupper`, and more
- **13 built-in samples** — Hello World, Fibonacci, Factorial, Bubble Sort, Structs, Switch, Pointers, scanf, User Header, JS Bridge, Type System, typeof Demo, scanf scanset

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
│   ├── parser.js        ← tokenize() + parse(): C source → tokens → AST
│   ├── interpreter.js   ← Interpreter class: AST → execution (+ JS bridge)
│   └── curnx.js         ← Base of the framework. Calls parser + interpreter,
│                           resolves #include, exposes the public Curnx API
├── src/                  ← Demo app built on top of the engine
│   ├── samples.js       ← Built-in example programs
│   └── app.js           ← UI logic & boot (drives everything via Curnx)
├── examples/             ← Sample headers used by the demo
│   ├── util.h            ← user-defined C header
│   └── math.jh           ← JS bridge header
├── docs/                 ← Reference documentation
│   ├── KEYWORDS.md       ← every supported C keyword, categorized
│   └── HEADERS.md        ← `.h` / `.jh` include syntax in detail
├── LICENSE
└── README.md
```

`engine/curnx.js` is the framework's entry point — it calls into `parser.js` (tokenizer + AST) and `interpreter.js` (evaluator) so you never have to touch either directly.

---

## Using the engine (`Curnx`)

```html
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

---

## Supported C Features

> Full keyword-by-keyword reference: [`docs/KEYWORDS.md`](docs/KEYWORDS.md)

| Feature | Support |
|---|---|
| `int`, `float`, `double`, `char` | ✅ |
| `long`, `short`, `unsigned`, `signed` (incl. combinations) | ✅ |
| `typeof(x)` | ✅ Curnx extension |
| Arrays | ✅ |
| Pointers (`*`, `&`) | ✅ (simplified) |
| `struct` | ✅ |
| `if / else` | ✅ |
| `while`, `do-while` | ✅ |
| `for` loop | ✅ |
| `switch / case / default` | ✅ |
| `break`, `continue` | ✅ |
| `return` | ✅ |
| Recursion | ✅ |
| `(type)` casts | ✅ Real conversion (int/float/char) |
| `printf` | ✅ Width, precision, flags, `%i`, `%lld`/`%llx`/`%llu` |
| `scanf` | ✅ Via browser prompt, incl. `%[^\n]` scansets |
| Math functions | ✅ `sqrt`, `pow`, `sin`, `cos`… |
| String functions | ✅ `strlen`, `strcmp`, `strcat`… |
| `sizeof` | ✅ Returns 4 |
| `typedef` | ⚠️ Parsed but ignored |
| `#include <core.h>` | ✅ Resolved as built-in |
| `#include "user.h"` | ✅ Fetched & inlined |
| `#include <bridge.jh>` | ✅ JS functions linked into C |
| `#define` | ⚠️ Skipped (not needed) |
| File I/O | ❌ |


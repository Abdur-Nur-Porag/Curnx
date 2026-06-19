# Curnx CJs

> A C parser and interpreter written in pure vanilla JavaScript — run C code directly in your browser, no compiler needed.

![License](https://img.shields.io/badge/license-MIT-blue)
![Language](https://img.shields.io/badge/language-Vanilla%20JS-yellow)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Version](https://img.shields.io/badge/version-1.1.0-orange)

---

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
- **Recursive Descent Parser** — builds a complete AST
- **Tree-walk Interpreter** — evaluates the AST directly in JS
- **printf / scanf** — full format string support (`%d %f %s %c %x %o` etc.), scanf uses browser `prompt()`
- **All control flow** — `if/else`, `while`, `for`, `do-while`, `switch/case`, `break`, `continue`, `return`
- **Types** — `int`, `float`, `double`, `char`, arrays, pointers, `struct`
- **Operators** — arithmetic, bitwise, logical, relational, compound assignment (`+=`, `-=`, etc.), `++`/`--`
- **Functions** — recursion, parameters, return values
- **`#include`** — core headers, user `.h` headers, and `.jh` JS-bridge headers
- **Standard library** — `sqrt`, `pow`, `abs`, `rand`, `strlen`, `strcmp`, `atoi`, `malloc`, `toupper`, and more
- **10 built-in samples** — Hello World, Fibonacci, Factorial, Bubble Sort, Structs, Switch, Pointers, scanf, User Header, JS Bridge

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

## Getting Started

No build tools, no npm, no dependencies.

```bash
git clone https://github.com/YOUR_USERNAME/curnx.git
cd curnx
python3 -m http.server   # headers/.jh need real HTTP, not file://
# open http://localhost:8000
```

If you don't need `#include "x.h"` / `#include <x.jh>` resolution, opening `index.html` directly still works.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Run code |
| `Tab` | Insert 4 spaces |

---

## Supported C Features

| Feature | Support |
|---|---|
| `int`, `float`, `double`, `char` | ✅ |
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
| `printf` | ✅ Full format strings |
| `scanf` | ✅ Via browser prompt |
| Math functions | ✅ `sqrt`, `pow`, `sin`, `cos`… |
| String functions | ✅ `strlen`, `strcmp`, `strcat`… |
| `sizeof` | ✅ Returns 4 |
| `typedef` | ⚠️ Parsed but ignored |
| `#include <core.h>` | ✅ Resolved as built-in |
| `#include "user.h"` | ✅ Fetched & inlined |
| `#include <bridge.jh>` | ✅ JS functions linked into C |
| `#define` | ⚠️ Skipped (not needed) |
| File I/O | ❌ |

---

## License

MIT — use freely, modify freely, share freely.

---

# Curnx — Header File Syntax (`.h` / `.jh`)

Curnx recognizes three kinds of `#include`. Each is resolved by `engine/curnx.js` **before** tokenizing/parsing.

## 1. Core Headers — `#include <name.h>`

Standard library headers. Already implemented as interpreter built-ins — resolved as a no-op.

```c
#include <stdio.h>
#include <math.h>
```

Supported: `stdio.h`, `stdlib.h`, `string.h`, `math.h`, `ctype.h`, `time.h`, `limits.h`, `stdbool.h`, `stdarg.h`, `assert.h`, `float.h`, `errno.h`

## 2. User Headers — `#include "name.h"`

Plain C. Fetched over HTTP and **textually inlined** at the include site — recursively, so a header may itself `#include` other headers.

**Syntax — `util.h`:**
```c
// util.h — just C function definitions, no special markers needed
int square(int n) {
    return n * n;
}

int cube(int n) {
    return n * n * n;
}
```

**Usage:**
```c
#include <stdio.h>
#include "util.h"

int main() {
    printf("%d\n", square(5));   // 25
    return 0;
}
```

## 3. JS Bridge Headers — `#include <name.jh>`

A `.jh` file is **plain JavaScript**, not C. Every top-level `function` declaration becomes directly callable from C — Curnx links the names, not the JS source, into the C function table.

**Syntax — `math.jh`:**
```js
// math.jh — plain JS function declarations
function addNum(num_1, num_2) {
  return num_1 + num_2;
}

function gcd(a, b) {
  while (b !== 0) { [a, b] = [b, a % b]; }
  return Math.abs(a);
}
```

**Usage:**
```c
#include <stdio.h>
#include <math.jh>

void main() {
    int a, b, sum;
    a = 10;
    b = 20;
    sum = addNum(a, b);
    printf("%d", sum);   // 30
}
```

**Rules:**
- Use top-level `function name(...) {}` declarations — arrow functions assigned to `const`/`let`/`var` also work, but plain `function` is recommended for clarity.
- Arguments and return values are passed as plain JS values (numbers, strings) — no manual type marshaling needed for primitives.
- The `.jh` file itself never touches the C interpreter's memory model directly; it only returns a value back into C.

## Resolution Rules (all three kinds)

| Include form | Resolved as | Network call? |
|---|---|---|
| `<core.h>` | No-op (already builtin) | No |
| `"user.h"` | Inlined C source | Yes (`fetch`) |
| `<bridge.jh>` | Linked JS functions | Yes (`fetch`) |

- Paths resolve relative to `basePath` passed to `Curnx.execute()` / inferred by `Curnx.loadExecute()`.
- Requires the page served over HTTP(S) — `fetch()` cannot read local files under `file://`.
- Duplicate `"user.h"` includes are skipped automatically (include-guard behavior is automatic).

---
*Curnx v1.1*

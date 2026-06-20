# Curnx — Keyword Reference

Curnx supports **26 keywords**. Anything outside this list is treated as an identifier (variable/function name) or simply unsupported.

## What changed in v1.2

- `long`, `short`, `unsigned`, `signed` are no longer aliased straight to `int` — they're now real type **modifiers** that combine with a base type, so `long long int`, `unsigned long`, `long double`, `signed char`, etc. all parse and report their real composite name.
- `const` is now its own token (still a parsed-but-unenforced qualifier) instead of also being collapsed into `int`.
- New keyword: **`typeof`** — a Curnx extension (not standard C) that returns a variable's or expression's datatype as a string at runtime.

## Quick Count

| Category | Count | Keywords |
|---|---|---|
| Types | 5 | `int`, `float`, `char`, `double`, `void` |
| Type Modifiers | 4 | `long`, `short`, `unsigned`, `signed` |
| Control Flow | 9 | `if`, `else`, `while`, `for`, `do`, `break`, `continue`, `switch`, `case` |
| Functions / Return | 2 | `return`, `default` |
| Data Structures | 2 | `struct`, `typedef` |
| Operators (word form) | 2 | `sizeof`, `typeof` |
| Constants | 1 | `NULL` |
| Qualifiers | 1 | `const` |

## Full Table

| Keyword | Category | Notes |
|---|---|---|
| `int` | Type | 4-byte integer |
| `float` | Type | Single-precision float |
| `char` | Type | Single character / byte |
| `double` | Type | Double-precision float |
| `void` | Type | No return value |
| `long` | Modifier | Combines with `int`/`double`: `long int`, `long long int`, `long double` |
| `short` | Modifier | Combines with `int`: `short int` |
| `unsigned` | Modifier | Combines with `int`/`char`/`long`/`short` |
| `signed` | Modifier | Combines with `int`/`char` (default sign, mostly for clarity) |
| `const` | Qualifier | Parsed, not enforced as read-only |
| `if` | Control flow | Conditional branch |
| `else` | Control flow | Alternate branch |
| `while` | Control flow | Pre-condition loop |
| `for` | Control flow | Counted loop |
| `do` | Control flow | Post-condition loop (`do...while`) |
| `break` | Control flow | Exit loop/switch |
| `continue` | Control flow | Skip to next iteration |
| `switch` | Control flow | Multi-branch dispatch |
| `case` | Control flow | `switch` branch label |
| `default` | Control flow | `switch` fallback label |
| `return` | Function | Return from function |
| `struct` | Data structure | Aggregate type definition |
| `typedef` | Data structure | Parsed, but the alias is discarded (no-op) |
| `sizeof` | Operator | Always evaluates to `4` |
| `typeof` | Operator (Curnx extension) | Returns the datatype name as a string — see below |
| `NULL` | Constant | Evaluates to `0` |

## Composite Type Reference (new in v1.2)

These all parse correctly and report their canonical name via `typeof`:

| You write | Canonical name | Category |
|---|---|---|
| `int` | `int` | integer |
| `long` / `long int` | `long int` | integer |
| `long long` / `long long int` | `long long int` | integer |
| `short` / `short int` | `short int` | integer |
| `unsigned` / `unsigned int` | `unsigned int` | integer |
| `unsigned long` | `unsigned long int` | integer |
| `unsigned long long` | `unsigned long long int` | integer |
| `unsigned short` | `unsigned short int` | integer |
| `signed char` | `signed char` | char |
| `unsigned char` | `unsigned char` | char |
| `float` | `float` | floating point |
| `double` | `double` | floating point |
| `long double` | `long double` | floating point |

> Curnx evaluates everything as a JS number under the hood, so `long`/`long long` get the practical range of a JS safe integer (±2^53), not true fixed 64-bit wraparound — plenty for typical interpreter use, just not bit-exact with native C on overflow.

## `typeof` — Curnx Extension

`typeof` is **not standard C** — it's a Curnx convenience for inspecting types at runtime, similar in spirit to JavaScript's `typeof`.

```c
int x = 5;
long long z = 100;
printf("%s\n", typeof(x));          // "int"
printf("%s\n", typeof(z));          // "long long int"
printf("%s\n", typeof(long long));  // "long long int" — also works directly on a type name
```

- On a declared variable, it returns the variable's declared type exactly as written/normalized.
- On an undeclared expression (a literal, a function call result, etc.), it falls back to a best-effort runtime guess (whole numbers → `int`, fractional → `double`, strings → `char`/`char*`, arrays → `int[]`/`char[]`, struct instances → `struct Name`).

## Not Yet Supported

These appear in standard C but are **not** recognized as keywords by Curnx's tokenizer:

`enum`, `union`, `static`, `extern`, `register`, `volatile`, `inline`, `restrict`, `goto`, `auto`, `_Bool`, `_Complex`

## Built-in Global Constants

Defined automatically (not keywords, but available without `#include`):

```
PI  M_PI  EOF  NULL  TRUE  FALSE  INT_MAX  INT_MIN  RAND_MAX
```

## Standard Library Functions

Not keywords either, but available without linking — grouped by header for reference:

| Header | Functions |
|---|---|
| `stdio.h` | `printf`, `scanf`, `puts`, `putchar`, `getchar`, `gets`, `sprintf`, `sscanf` |
| `string.h` | `strlen`, `strcpy`, `strncpy`, `strcat`, `strcmp`, `strstr` |
| `stdlib.h` | `atoi`, `atof`, `itoa`, `malloc`, `calloc`, `free`, `exit`, `rand`, `srand` |
| `string.h` (mem) | `memset`, `memcpy` |
| `math.h` | `abs`, `fabs`, `sqrt`, `pow`, `floor`, `ceil`, `round`, `sin`, `cos`, `tan`, `log`, `log10`, `exp`, `max`, `min` |
| `ctype.h` | `toupper`, `tolower`, `isalpha`, `isdigit`, `isspace`, `isalnum`, `isupper`, `islower` |

---
*Curnx v1.2*

# Curnx — Keyword Reference

Curnx supports **25 keywords**. Anything outside this list is treated as an identifier (variable/function name) or simply unsupported.

## Quick Count

| Category | Count | Keywords |
|---|---|---|
| Types | 9 | `int`, `float`, `char`, `double`, `void`, `long`, `short`, `unsigned`, `signed` |
| Control Flow | 9 | `if`, `else`, `while`, `for`, `do`, `break`, `continue`, `switch`, `case` |
| Functions / Return | 2 | `return`, `default` |
| Data Structures | 2 | `struct`, `typedef` |
| Operators (word form) | 1 | `sizeof` |
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
| `long` | Type modifier | Aliased to `int` internally |
| `short` | Type modifier | Aliased to `int` internally |
| `unsigned` | Type modifier | Aliased to `int` internally |
| `signed` | Type modifier | Aliased to `int` internally |
| `const` | Qualifier | Parsed, treated as `int`-compatible (not enforced as read-only) |
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
| `NULL` | Constant | Evaluates to `0` |

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
*Curnx v1.1*

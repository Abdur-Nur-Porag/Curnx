// examples/util.h
// A user-defined header. Curnx fetches this and inlines it
// wherever `#include "util.h"` appears in the source.

int square(int n) {
    return n * n;
}

int cube(int n) {
    return n * n * n;
}

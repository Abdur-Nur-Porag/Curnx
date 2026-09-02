// ============================================================
//  CURNX v1.3 — src/samples.js
//  Built-in C code examples shown in the UI
// ============================================================

const SAMPLES = [
  {
    label: 'Hello World',
    code: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`
  },
  {
    label: 'Fibonacci',
    code: `#include <stdio.h>

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    int i;
    printf("Fibonacci Series:\\n");
    for (i = 0; i < 10; i++) {
        printf("F(%d) = %d\\n", i, fibonacci(i));
    }
    return 0;
}`
  },
  {
    label: 'Factorial',
    code: `#include <stdio.h>

long factorial(int n) {
    if (n == 0) return 1;
    return n * factorial(n - 1);
}

int main() {
    int i;
    for (i = 0; i <= 12; i++) {
        printf("%d! = %ld\\n", i, factorial(i));
    }
    return 0;
}`
  },
  {
    label: 'Bubble Sort',
    code: `#include <stdio.h>

int main() {
    int arr[] = {5, 3, 8, 1, 9, 2, 7, 4, 6};
    int n = 9, i, j, temp;

    for (i = 0; i < n - 1; i++) {
        for (j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                temp     = arr[j];
                arr[j]   = arr[j + 1];
                arr[j+1] = temp;
            }
        }
    }

    printf("Sorted: ");
    for (i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}`
  },
  {
    label: 'Structs',
    code: `#include <stdio.h>

struct Student {
    int   id;
    float gpa;
};

int main() {
    struct Student s;
    s.id  = 101;
    s.gpa = 3.85;
    printf("Student ID: %d\\n", s.id);
    printf("GPA: %.2f\\n",       s.gpa);
    return 0;
}`
  },
  {
    label: 'Switch/Case',
    code: `#include <stdio.h>

int main() {
    int day = 3;
    switch (day) {
        case 1:  printf("Monday\\n");    break;
        case 2:  printf("Tuesday\\n");   break;
        case 3:  printf("Wednesday\\n"); break;
        case 4:  printf("Thursday\\n");  break;
        case 5:  printf("Friday\\n");    break;
        default: printf("Weekend!\\n");
    }
    return 0;
}`
  },
  {
    label: 'Pointers',
    code: `#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 10, y = 20;
    printf("Before: x=%d, y=%d\\n", x, y);
    swap(&x, &y);
    printf("After:  x=%d, y=%d\\n", x, y);
    return 0;
}`
  },
  {
    label: 'Memory & Addresses (v1.3)',
    code: `#include <stdio.h>

int main() {
    int x = 42;
    int *p = &x;

    printf("x lives at address: %p\\n", &x);
    printf("p itself lives at:  %p\\n", &p);
    printf("p points to:        %p\\n", p);
    printf("*p (value at that address) = %d\\n\\n", *p);

    printf("sizeof(int)    = %d bytes\\n", sizeof(int));
    printf("sizeof(char)   = %d bytes\\n", sizeof(char));
    printf("sizeof(double) = %d bytes\\n", sizeof(double));
    printf("sizeof(int *)  = %d bytes (a real pointer, on this VM)\\n\\n", sizeof(p));

    *p = 100;
    printf("wrote 100 through p, x is now: %d\\n", x);
    return 0;
}`
  },
  {
    label: '2D Arrays (v1.3)',
    code: `#include <stdio.h>

int main() {
    int grid[3][3] = {
        {1, 2, 3},
        {4, 5, 6},
        {7, 8, 9}
    };

    printf("The grid:\\n");
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) printf("%3d ", grid[i][j]);
        printf("\\n");
    }

    int total = 0;
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            total += grid[i][j];
    printf("\\nSum of all elements: %d\\n", total);

    printf("sizeof(grid)    = %d bytes (3 x 3 ints)\\n", sizeof(grid));
    printf("sizeof(grid[0]) = %d bytes (one row)\\n", sizeof(grid[0]));

    // a row decays to a real pointer, just like in C
    int *row = grid[1];
    row[0] = 99;
    printf("grid[1][0] via row pointer is now: %d\\n", grid[1][0]);
    return 0;
}`
  },
  {
    label: 'Pointer Arithmetic (v1.3)',
    code: `#include <stdio.h>

int main() {
    int nums[5] = {10, 20, 30, 40, 50};
    int *p = nums;   // array decays to a pointer to its first element

    printf("Walking the array with pointer arithmetic:\\n");
    for (int i = 0; i < 5; i++) {
        printf("  *(p + %d) = %d   (address %p)\\n", i, *(p + i), p + i);
    }

    int *start = &nums[0];
    int *end   = &nums[4];
    printf("\\nend - start = %ld elements apart\\n", end - start);

    p++;
    printf("after p++, *p = %d\\n", *p);
    p += 2;
    printf("after p += 2, *p = %d\\n", *p);
    return 0;
}`
  },
  {
    label: 'Dynamic Memory (v1.3)',
    code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n = 5;
    int *arr = malloc(n * sizeof(int));   // real heap allocation, real address

    for (int i = 0; i < n; i++) arr[i] = (i + 1) * (i + 1);

    printf("Heap block starts at: %p\\n", arr);
    printf("Squares: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");

    free(arr);

    int *arr2 = malloc(3 * sizeof(int));
    printf("\\nAfter free(), a new allocation reuses that address: %p\\n", arr2);
    free(arr2);
    return 0;
}`
  },
  {
    label: 'scanf Input',
    code: `#include <stdio.h>

int main() {
    int n;
    printf("Enter a number: ");
    scanf("%d", &n);
    printf("You entered: %d\\n", n);
    printf("Square: %d\\n", n * n);
    printf("Cube:   %d\\n", n * n * n);
    return 0;
}`
  },
  {
    label: 'User Header (.h)',
    code: `#include <stdio.h>
#include "util.h"

int main() {
    int n = 5;
    printf("square(%d) = %d\\n", n, square(n));
    printf("cube(%d)   = %d\\n", n, cube(n));
    return 0;
}`
  },
  {
    label: 'JS Bridge (.jh)',
    code: `#include <stdio.h>
#include <math.jh>

void main() {
    int a, b, sum;
    a = 10;
    b = 20;
    sum = addNum(a, b);
    printf("addNum(%d, %d) = %d\\n", a, b, sum);
    printf("gcd(48, 18)    = %d\\n", gcd(48, 18));
}`
  },
  {
    label: 'Type System (v1.2)',
    code: `#include <stdio.h>

int main() {
    long a = 100000;
    long long b = 9000000000;
    unsigned int c = 42;
    unsigned long d = 7;
    short e = 3;
    long double f = 3.14159;
    signed char g = 5;

    printf("long       a = %ld\\n", a);
    printf("long long  b = %lld\\n", b);
    printf("unsigned   c = %u\\n", c);
    printf("u long     d = %lu\\n", d);
    printf("short      e = %d\\n", e);
    printf("long dbl   f = %.5f\\n", f);
    printf("signed chr g = %d\\n", g);
    return 0;
}`
  },
  {
    label: 'typeof Demo',
    code: `#include <stdio.h>

int main() {
    int x = 5;
    float y = 2.5;
    long long z = 100;
    char ch = 'A';
    double pi = 3.14159;

    printf("typeof(x)  = %s\\n", typeof(x));
    printf("typeof(y)  = %s\\n", typeof(y));
    printf("typeof(z)  = %s\\n", typeof(z));
    printf("typeof(ch) = %s\\n", typeof(ch));
    printf("typeof(pi) = %s\\n", typeof(pi));

    // typeof also works directly on a type name
    printf("typeof(long long) = %s\\n", typeof(long long));
    return 0;
}`
  },
  {
    label: 'scanf %[^\\\\n]',
    code: `#include <stdio.h>

int main() {
    char word[20];
    char sentence[100];

    printf("Enter a single word: ");
    scanf("%s", word);

    printf("Enter a full sentence: ");
    scanf(" %[^\\n]", sentence);

    printf("Word:     %s\\n", word);
    printf("Sentence: %s\\n", sentence);
    return 0;
}`
  }
];

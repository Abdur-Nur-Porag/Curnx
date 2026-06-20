// ============================================================
//  CURNX v1.2 — src/samples.js
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

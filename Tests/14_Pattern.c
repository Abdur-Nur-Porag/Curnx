/* Rhombus Pattern

   1 1
  2   2
 3     3
4       4
 3     3
  2   2
   1 1

*/

#include<stdio.h>
 void main()
 {
  int num,i,c,s,n;
  printf("Enter maximum number : ");
  scanf("%d", &num);
  for(i=1; i<=num; i++)
  {
    for(s=num-i; s>=1; s--)
       printf(" ");
    printf("%d", i);
    for(s=i*2; s>1; s--)
       printf(" ");
    printf("%d", i);
    printf("\n");
  }
  for(i=1,n=num-1; i<num; i++,n--)
  {
    for(s=i; s>=1; s--)
       printf(" ");
    printf("%d",n);
    for(s=n*2; s>1; s--)
       printf(" ");
    printf("%d", n);
    printf("\n");
    } 
 }

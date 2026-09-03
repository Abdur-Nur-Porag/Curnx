/*  pascal triangle

     1
    1 1
   1 2 1
  1 3 3 1
 1 4 6 4 1

*/

#include<stdio.h>

long calc( int );
int main()
{
 int i,j,row,pas;
 printf("Enter no. of rows in pascal triangle : ");
 scanf("%d", &row);
 for(i=0; i<row; i++)
 {
   for(j=0; j<=(row-i-1); j++)
     printf(" ");
   for(j=0; j<=i; j++)
   {
     pas=calc(i)/(calc(j)*calc(i-j));
     printf("%ld ",pas); //take single space
   }
   printf("\n");
 }
 
 return 0;
}

long calc( int num)
{
 int x;
 long res=1;
 for(x=1; x<=num; x++)
   res=res*x;
 return (res);
}

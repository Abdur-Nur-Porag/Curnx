/*Program to find gross salary.*/

#include<stdio.h>
void main()
{
  int gs,bs,da,ta;
  printf("Enter basic salary:");
  scanf("%d",&bs);
  da=(10*bs)/100;
  ta=(12*bs)/100;
  gs=bs+da+ta;
  printf("gross salary=%d",gs);
}

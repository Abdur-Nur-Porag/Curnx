// program to multiply given number by 4 using bitwise operators 

 #include <stdio.h>
 void main()
 {
     long number, tempnum;
     printf("Enter an integer ");
     scanf("%ld", &number);
     tempnum = number;
     number = number << 2;
     printf("%ld x 4 = %ld", tempnum, number);
 }

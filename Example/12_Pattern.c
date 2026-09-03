/* Print Pattern

A
1 2
B C D
3 4 5 6  
E F G H I

*/

#include<stdio.h>

void main()
{
	int i,n,j,k=1;
	char ch='A';

	printf("\n\nEnter How Many Rows Own::>\n");
	scanf("%d",&n);
	for(i=1;i<=n;i++)
	{
		if((i%2)==0)
		{
		 	for(j=1;j<=i;j++)
			{
				printf("%d",k);
				k++;
			}
		}
		else
		{
			for(j=1;j<=i;j++)
			{
				printf("%c",ch);
				ch++;
			}
		}
		printf("\n");
	}
	
}

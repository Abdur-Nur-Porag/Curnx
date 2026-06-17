/*
*/
#include<stdio.h>
int FindLarger(int a,int b,int c){
	if(a>b){
    if(a>c){
      return a;
    }
    else{
      return c;
    }
	}
  else{
    if(b>c){
      return b;
    }
    else{
      return c;
    }
  }
}

int main(){
  int num_1,num_2,num_3;
  int checkNum= FindLarger(num_1,num_2,num_3);
  num_1=189;
  num_2=58;
	num_3=589;
  switch(checkNum){
    case checkNum==num_1:
			printf("%d is Largest",num_1);
    case checkNum==num_2:
			printf("%d is Largest",num_2);
    case checkNum==num_3:
			printf("%d is Largest",num_3);
    default:
    	printf("Something Wrong\n");
  }
  return 0;
}

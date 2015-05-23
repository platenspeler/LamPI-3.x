#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <getopt.h>
#include <unistd.h>
#include <ctype.h>
#include <string.h>
#include <iostream>
#include "RemoteSwitch.cpp"

#define _periodusec 200									// 190 is a safe choice, with min of 100 and max of 300
#define _repeats 3										// used by the RemoteSwitch program
#define on True
#define off False

using namespace std;
bool state = false;

 /*
*/
 
 static void display_usage(const char *cmd)
 {
	fprintf(stderr, "Usage: %s [-g group] [-n deviceid] [-p gpio-device] on|off|dimvalue\n\n", cmd);
	fprintf(stderr, " -g Group (default 1), default is group 1\n");
	fprintf(stderr, " -h Display usage information (this message)\n");
	fprintf(stderr, " -n Deviceid (default 1), lowest and default is device 1\n");
	fprintf(stderr, " -p Gpio-pin (default pin 15)\n");
	// fprintf(stderr, " -d Dim level (default 10) \n");
	fprintf(stderr, " on|off Action requested (default off)\n");
	fprintf(stderr,	"\nExamples: ");
	fprintf(stderr,	"\n%s -g 31 -n 1 -p 7 on\n", cmd);
	fprintf(stderr,	"\n%s -g 31 -n 2 off\n", cmd);
	fprintf(stderr,	"\n%s -g 1 -n 3 on\n", cmd);
	fprintf(stderr,	"\n%s -g 2 -n 4 -v on\n", cmd);
 }

 int main(int argc, char **argv)
 {
	int verbose=0;
	int pin = 15;
	long switch_group = 1;				// Group value
	char switch_dev = 0;				// unit device value
	int n=0;
	int m=0;

	if (argc < 2){
	display_usage(argv[0]);
	return 1;
	}	
	
	while (1) {
		int c;
		c = getopt(argc, argv, "g:hvn:p:?");
		if (c == -1)
		break;
		switch (c) {
			case 'g':
				sscanf(optarg,"%d", &n);
				switch_group=n;
			break;
			case 'n':
				sscanf(optarg,"%d", &n);
				switch_dev=n;						// device is a character value A-P
			break;
			case 'p':
				sscanf(optarg,"%d", &m );
				pin=m;
			break;
			case 'v':
				verbose=1;
			break;
			case 'h':
			case '?':
			case ':':
				display_usage(argv[0]);
				return 1;
			default:
				exit(1);
		}
	} 

   	if (wiringPiSetup () == -1)
		exit (1) ;
	pinMode (pin, OUTPUT) ;

	// Set the pin 
	
	ActionSwitch actionSwitch(pin);
	
	if (verbose == 1) {
		fprintf(stderr, "Calling action with following parameters\n");
		fprintf(stderr, "verbose: %d\n", verbose);
		fprintf(stderr, "pin: %d\n", pin);
		fprintf(stderr, "room: %d\n", switch_group);
		fprintf(stderr, "device: %d\n", switch_dev);
		fprintf(stderr, "value: %s\n", argv[optind]);

	}

	if (optind < argc) /* first check if it says on */
	{
		digitalWrite(pin, LOW);
		
		if ( ! strcmp(argv[optind],"on")) {
		
			actionSwitch.sendSignal(switch_group, switch_dev, true);
		}
		else if (! strcmp(argv[optind],"off")) {

			actionSwitch.sendSignal(switch_group, switch_dev, false);
		}
	}

	printf("OK\n");
	return 0;	

}



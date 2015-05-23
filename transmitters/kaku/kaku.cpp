/*
* kaku.c:
* Simple program to control klik-aan-klik-uit power devices new type
*/

#include <wiringPi.h>

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include "NewRemoteTransmitter.cpp"

#define _periodusec 260 
#define _repeats 3
#define on True
#define off False

//typedef enum {False=0, True} boolean;
//typedef unsigned char byte;

 /*
*/
 
 static void display_usage(const char *cmd)
 {
	fprintf(stderr, "Usage: %s [-g group] [-n deviceid] [-p gpio-device] on|off|dimvalue\n\n", cmd);
	fprintf(stderr, " -g Group (default A), default is group A\n");
	fprintf(stderr, " -h Display usage information (this message)\n");
	fprintf(stderr, " -n Deviceid (default 1), default is device 1\n");
	fprintf(stderr, " -p Gpio-pin (default pin 15)\n");
	// fprintf(stderr, " -d Dim level (default 10) \n");
	fprintf(stderr, " on|off Action requested (default off), dimvalue 0 to 15\n");
	fprintf(stderr,	"\nExamples: ");
	fprintf(stderr,	"\n%s -g 100 -n 1 -p 7 on\n", cmd);
	fprintf(stderr,	"\n%s -g 100 -n 1 off\n", cmd);
	fprintf(stderr,	"\n%s -g 100 -n 2 15\n", cmd);
	fprintf(stderr,	"\n%s -g 100 -n 1 -p 0 11\n", cmd);
 }

 int main(int argc, char **argv)
 {
	int verbose=0;
	int pin = 15;
	int dim = 10;				// Just a dimming value
	long switch_group = 100;	// Group value
	int switch_dev = 1;			// unit device value
	int n=0;
	int m=0;

	if (argc < 2){
		display_usage(argv[0]);
		return 1;
	}	

	while (1) {
		int c;
		c = getopt(argc, argv, "g:hvn:p:d:?");
		if (c == -1)
		break;
		switch (c) {
			case 'g':
				sscanf(optarg,"%d", &n);
				switch_group=n;
			break;
			case 'n':
				sscanf(optarg,"%d", &n );
				switch_dev=n;
			break;
			case 'p':
				sscanf(optarg,"%d", &m );
				pin=m;
			break;
			case 'd':
				sscanf(optarg,"%d", &m);
				dim=m;
			break;
			case 'v':
				verbose=1;
			break;
			case 'h':
			case '?':
				display_usage(argv[0]);
				return 1;
			default:
				abort();
		}
	}

   	if (wiringPiSetup () == -1)
		exit (1) ;
	pinMode (pin, OUTPUT) ;

	// Set group, the pin and the number of re-transmits
	NewRemoteTransmitter transmitter(switch_group, pin, 260, 3);

	if (verbose == 1) {
		uid_t uid, euid;
  		if (-1 == (uid = getuid()))
     		perror("getuid() error.");
  		if (-1 == (euid = geteuid()))
     		perror("geteuid() error.");
     	fprintf(stderr, "The real UID is: %u\n", uid);
		fprintf(stderr, "The effective UID is: %u\n", euid);
		fprintf(stderr, "Calling Kaku with following parameters\n");
		fprintf(stderr, "verbose: %d\n", verbose);
		fprintf(stderr, "pin: %d\n", pin);
		fprintf(stderr, "device: %d\n", switch_dev);
		fprintf(stderr, "value: %s\n", argv[optind]);
	}

	if (optind < argc) 								/* first check if it says on */
	{
		if (verbose ==1 ) printf ("additional arguments %d\n",(argc-optind));
		
		if ( ! strcmp(argv[optind],"on")) {
			transmitter.sendUnit(switch_dev,true);
		}
		else if (! strcmp(argv[optind],"off")) {
			transmitter.sendUnit(switch_dev,false);
		}
		else {  									/* so it has to be a dim value */
			dim=atoi(argv[optind]);
			transmitter.sendDim(switch_dev,dim);
		}
	}

	if (verbose == 1) printf("OK\n");
	return 0;
 }

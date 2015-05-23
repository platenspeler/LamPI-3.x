/*
  kopou.cpp - Library for Kopou wireless switches.
  Created on Jan 2, 2014
  M. Westenberg (mw12554 @@ hotmail.com)
  
  XXX This code really needs some cleaning and is far too complicated
  XXX There is no receiver support so far, as the protocol is really (I mean REALLY) simple/dumm
  		and leads to many errorneous codes discovered
  
  Released into the public domain.
*/

#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <stdlib.h>
#include <wiringPi.h>
#include <math.h>
#include <time.h>
#include <unistd.h>
#include <netdb.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include "kopou.h"

#define REPEATS 70

// Global Variables
//
unsigned int group = 13;							// The 13 is the group value of my little switch (bit 0-15)
unsigned char device = 225;							// Key A is number 225, B is 242 (bit 16-22, with bit 19=1)
unsigned int loops = 1;
unsigned int repeats = REPEATS;
bool inverted = false;
unsigned char output_pin = 15;						// wiringPi PIN number

int fflg = 0;										// Fake flag, for debugging. Init to false. If true, print values only

// I found the timing paramters below to be VERY VERY critical
// Only a few uSecs extra will make the switch fail.
//
int p_short = 90;									// 90 works quite OK
int p_long = 210;									// 210 works quite OK
int p_start = 500;									// 500 works quite OK

Kopou::Kopou(unsigned char pin)
{
  pinMode(pin, OUTPUT);
  txPin = pin;
}

// keycodes: Bit 0-15 (16 bits), remote 13 seems to work
// Device ids: bit 16-23 (8bits), values: A: 225; B: 242; C: 19; D: 36 (all OFF)
// use: sendButton(remoteID, keycode), see example blink.ino; 

// =======================================================================================
//
//
void Kopou::sendButton(unsigned int remoteID, unsigned char keycode) {

  for (pulse= 0; pulse <= repeats; pulse++) 		// how many times to transmit a command
  {
  	// Start with sending a header Pulse
	if (inverted) 
	{
		if (fflg==1) printf("L%d H%d ",p_short,p_start);
		else {
			digitalWrite(txPin, LOW);
			delayMicroseconds(p_short); 				// 110
			digitalWrite(txPin, HIGH);
			delayMicroseconds(p_start); 				// 550 Extra Long HIGH
		}
	}
    else 
	{
		if (fflg==1) printf("H%d L%d ",p_short,p_start);
		else {
			digitalWrite(txPin, HIGH);
			delayMicroseconds(p_short);					// 110
			digitalWrite(txPin, LOW);
			delayMicroseconds(p_start); 				// 550 Start Extra Long LOW
		}
	}
	
	// Now send the Group Address
	
	if (fflg==1) printf("< ");
    for (i = 15; i>=0; i--) { 						// transmit remoteID
      unsigned int txPulse = remoteID & ( 1<<i );	// read bits from remote ID
      if (txPulse>0) { 
		selectPulse(1); 
      }
      else {
		selectPulse(0);
      }
    }
	
	// Send the Device Code
	
	if (fflg==1) printf(">< ");
    for (i = 7; i>=0; i--) 							// XXX transmit keycode
    {
		
		unsigned char txPulse= keycode & (1<<i); 	// read bits from keycode
		if (txPulse>0) {
			selectPulse(1); 
		}
		else {
			selectPulse(0);
		}
    } 
	if (fflg==1) printf(">\n");
  }
  
  // Close the pin to well known state
  
  if (inverted) {
  	digitalWrite(txPin, LOW);
	if (fflg==1) printf("Pin L\n");
  }
  else {
  	digitalWrite(txPin, HIGH);
	if (fflg==1) printf("Pin H\n");
  }
}

// =======================================================================================
// build transmit sequence so that every high pulse is followed by low and vice versa
//
//
void Kopou::selectPulse(unsigned char inBit) {


    switch (inBit) {
    case 0: 
        if (inverted) {   							// if current pulse should be high, send High Zero
			if (fflg==1) printf("L%d H%d ",p_short,p_long);
			else {
		  		digitalWrite(txPin, LOW);
				delayMicroseconds(p_short); 				// 110
				digitalWrite(txPin, HIGH);
				delayMicroseconds(p_long); 					// 290
			}
        } 
		else {              						// else send short High 1H followed by long LOW 3L
			if (fflg==1) printf("H%d L%d ",p_short,p_long);
			else {
				digitalWrite(txPin, HIGH);
				delayMicroseconds(p_short);					// 110
				digitalWrite(txPin, LOW);
				delayMicroseconds(p_long); 					// 303
			}
        }
      break;

      case 1:                						// if current pulse should be high, send High One
        if (inverted) {
			if (fflg==1) printf("L%d H%d ",p_long,p_short);
			else {
				digitalWrite(txPin, LOW);
				delayMicroseconds(p_long); 					// 303	 LLL
				digitalWrite(txPin, HIGH);
				delayMicroseconds(p_short);					// 110
			}
        } 
		else { 				       						// else send Low One
			if (fflg==1) printf("H%d L%d ",p_long,p_short);
			else {
				digitalWrite(txPin, HIGH);
				delayMicroseconds(p_long); 					// 290	 HHH
				digitalWrite(txPin, LOW);
				delayMicroseconds(p_short); 				// 110
			}
        }
      break; 
    }

}



// =============================================================================================
// This is the main program part.
//
//

int main(int argc, char **argv)
{
  int cflg, tflg, dflg, iflg, lflg, kflg, pflg;
  int verbose=0;
  fflg = 0;
  int errflg=0;
  int c, j;
  
  Kopou kop(output_pin);
  
  if (wiringPiSetup () == -1)
		exit (1) ;

   // Sort out the options first!
   //
   // ./kopou -g <gid> -n <dev> on/off

   while ((c = getopt(argc, argv, ":b:fg:il:n:p:r:s:t:v")) != -1) {
        switch(c) {
		case 'b':						// Timing for the start pulse (Base Begin)
			p_start = atoi(optarg);
		break;
		case 'f':						// fake flag ...
			fflg = 1;
		break;
		case 'g':						// Group
			group = atoi(optarg);
		break;
		case 'i':						// Inverted codes. Experience has shown that this does not really work
			inverted=true;
		break;
		case 'l':						// Timing for the long pulse (typical around 300 uSec)
			p_long= atoi(optarg);
		break;
		
		// We must make sure that manual assigned device ID's do not collide with automatic device ID's used
		// in the LamPI application. Therefore we use the range from device ID 31 and onward.
		// Also we make a translation between out assigned device ID's, to the physical address of Kopou.
		case 'n':						// Device Number, for interface must be A=32, B=33, C=34
			device = atoi(optarg);
			switch (device) {
				case 32: // Button A
					device = 225;
				break;
				case 33: // Button B
					device = 242;
				break;
				case 34: // Button C
					device = 19;
				break;
				default:
					errflg++;
			}
		break;

		case 'p':						// output pin of wiringPi
			output_pin = atoi(optarg);;
		break;
		case 'r':						// Pulse repeats
			repeats=atoi(optarg);
		break;
		case 's':						// short pulse length
			p_short=atoi(optarg);
		break;
		case 't':						// Loop mode 
			loops = atoi(optarg);
			if (loops<1) errflg=1;
		break;
		case 'v':						// Verbose, output long timing/bit strings
			verbose = 1;
		break;
		case ':':       				// -f or -o without operand
			fprintf(stderr,"Option -%c requires an operand\n", optopt);
			errflg++;
		break;
		case '?':
			fprintf(stderr, "Unrecognized option: -%c\n", optopt);
            errflg++;
        }
    }
		

	// Check for additional command such as on or off. For off, change to device code 36
	while (optind < argc) {
		if (verbose==1) printf("Additional Arguments: %s\n",argv[optind]);
		// we must be sure that off is not toggled between ON/OFF
		if (! strcmp(argv[optind], "off" )) device = 36;						// off -> ALL OFF 
		optind++;
	}
	
	// If there is an error, display the correct usage of the command
    if (errflg) {
        fprintf(stderr, "usage: argv[0] (options) \n");
		
		fprintf(stderr, "\nSettings:\n");
		fprintf(stderr, "\t\t; This setting will affect other timing settings as well\n");
		fprintf(stderr, "-g\t\t; Group address, 13 should work\n");
		fprintf(stderr, "-n\t\t; Device code, A: 32, B: 33, C: 34, (D is reserved for ALL OFF)\n");
		fprintf(stderr, "-t\t\t; Test mode, will output received code from remote\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
		fprintf(stderr, "-l\t\t; Long pulse time in uSec\n");
		fprintf(stderr, "-s\t\t; Short pulse time in uSec\n");
		fprintf(stderr, "-r\t\t; Repeats per train pulse time in uSec\n");
		fprintf(stderr, "-f\t\t; Fake mode, will output code to screen\n");

        exit (2);
    }

	// If the -v verbose flag is specified, output more information than usual
	if (verbose == 1) {
	
		printf("The following options have been set:\n\n");
		printf("-v\t; Verbose option\n");
		if (tflg>0) printf("-t\t; Test option\n");
		if (fflg>0) printf("-f\t; Fake option\n");
		printf("\n");
		printf("-g\tgroup  : %d\n",group);
		printf("-n\tdev code: %d\n",device);
		printf("-r\trepeats: %d\n",repeats);
		printf("-b\tp_begin: %d\n",p_start);
		printf("-s\tp_short: %d\n",p_short);
		printf("-l\tp_long : %d\n",p_long);
		
		printf("\n");
	}
	
  // 
  // Main LOOP
  //
  for ( j=1; j<=loops; j++)
  {
	
	if (verbose==1) {
		printf("Sending: j: %d, grp: %d, code: %d ...\n",j,group,device);
		printf(", start: %d, short: %d, long: %d ... \n",p_start,p_short,p_long);
		fflush(stdout);
	}
	kop.sendButton(group, device);	
	if (verbose==1) {						// Do the transmission
		printf(" ... done\n"); fflush(stdout);
	}
	if (j<loops) sleep(5);
  }
}

/*
  Livolo.cpp - Library for Livolo wireless switches.
  First created by Sergey Chernov, October 25, 2013, and adapted and simplified Dec 3, 2013 by
  M. Westenberg (mw12554 @@ hotmail.com)
  
  XXX This code really needs some cleaning and is far too complicated
  XXX There is no receiver support so far, as the protocol is really (I mean REALLY) simple/dumm
  		and leads to many errorneous codes discovered
  
  Released into the public domain.
  
  Usage:
  As said, the Livolo protocol is rather unreliable. Even the transmitter keychain which is well received 
  by my Raspberry sniffer/receiver program has a very limited range for its own devices. In fact, reception
  can only be reliable when the switches are in sight and one can visibly check whether commands are received.
  
  Also, as buttons A-C toggle the value of the switch, one would NEVER be sure whether the switch is on or off.
  A workaround would be: ALWAYS first send code D, all devices OFF and then transmit on values for ALL buttons
  again. In practice this might not be desirable, should work though.
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
#include "livolo.h"

#define REPEATS 100

// Global Variables
//
unsigned int group = 23783;							// The 23783 is the group value of my little switch (bit 0-15)
unsigned char device = 16;							// Key A is number 8, B16 (bit 16-22, with bit 19=1)
unsigned int loops = 1;
unsigned int repeats = REPEATS;
bool inverted = false;
unsigned char output_pin = 15;						// wiringPi PIN number

int fflg = 0;										// Fake flag, for debugging. Init to false. If true, print values only

// I found the timing parameters below to be VERY VERY critical
// Only a few uSecs extra will make the switch fail.
//
int p_short = 110;									// 110 works quite OK
int p_long = 290;									// 300 works quite OK
int p_start = 520;									// 520 works quite OK

Livolo::Livolo(unsigned char pin)
{
  pinMode(pin, OUTPUT);
  txPin = pin;
}

// keycodes #1: 0, #2: 96, #3: 120, #4: 24, #5: 80, #6: 48, #7: 108, #8: 12, #9: 72; #10: 40, #OFF: 106
// real remote IDs: 6400; 19303; 23783
// tested "virtual" remote IDs: 10550; 8500; 7400
// other IDs could work too, as long as they do not exceed 16 bit
// known issue: not all 16 bit remote ID are valid
// have not tested other buttons, but as there is dimmer control, some keycodes could be strictly system
// use: sendButton(remoteID, keycode), see example blink.ino; 

// =======================================================================================
//
//
void Livolo::sendButton(unsigned int remoteID, unsigned char keycode) {

  for (pulse= 0; pulse <= repeats; pulse++) 		// how many times to transmit a command
  {
    int res;
    res = piHiPri (90);
	if (res<0) {
		perror("SendButton:: piHiPri set error: ");
		return;
	}
  	high = !inverted;								// if inverted, start invert all pulses
	if (high) 
		sendPulse(1);
    else 
		sendPulse(0);								// Start 
    												// first pulse is always high

    for (i = 15; i>=0; i--) { 						// transmit remoteID
      unsigned int txPulse = remoteID & ( 1<<i );	// read bits from remote ID
      if (txPulse>0) { 
		selectPulse(1); 
      }
      else {
		selectPulse(0);
      }
    }

    for (i = 6; i>=0; i--) 							// XXX transmit keycode
    {
		unsigned char txPulse= keycode & (1<<i); 	// read bits from keycode
		if (txPulse>0) {
			selectPulse(1); 
		}
		else {
			selectPulse(0);
		}
    } 
    if (fflg==1) printf("\n");
	res = piHiPri((int)0);
	if (res<0) {
//		perror("SendButton::  piHiPri reset error: ");
//		return;
	}
  }
  
  if (high)
  	digitalWrite(txPin, LOW);
  else 
  	digitalWrite(txPin, HIGH);

}

// =======================================================================================
// build transmit sequence so that every high pulse is followed by low and vice versa
//
//
void Livolo::selectPulse(unsigned char inBit) {


    switch (inBit) {
    case 0: 
        if (high == true) {   						// if current pulse should be high, send High Zero
          sendPulse(2); 
		  sendPulse(4);
        } else {              						// else send Low Zero
          sendPulse(4);
		  sendPulse(2);
        }
      break;

      case 1:                						// if current pulse should be high, send High One
        if (high == true) {
          sendPulse(3);
        } else {             						// else send Low One
          sendPulse(5);
        }
        high=!high; 								// invert next pulse
      break; 
    }

}

// =========================================================================================
// transmit pulses
// slightly corrected pulse length, use old (commented out) values if these not working for you

void Livolo::sendPulse(unsigned char txPulse) {

  if (fflg == 0)
  {
	switch(txPulse) 								// transmit pulse
	{
	case 0: 										// Start
		digitalWrite(txPin, LOW);
		delayMicroseconds(p_start); 				// 550
	break;
   
	case 1: 										// Start
		digitalWrite(txPin, HIGH);
		delayMicroseconds(p_start); 				// 550
	break;

	case 2: 										// "High Zero"
		digitalWrite(txPin, LOW);
		delayMicroseconds(p_short); 				// 110
	break;
 
	case 3: 										// "High One"
		digitalWrite(txPin, LOW);
		delayMicroseconds(p_long); 					// 303
	break; 

	case 4: 										// "Low Zero"
		digitalWrite(txPin, HIGH);
		delayMicroseconds(p_short);					// 110
	break;

	case 5:											// "Low One"
		digitalWrite(txPin, HIGH);
		delayMicroseconds(p_long); 					// 290
	break; 
	}
  }
  //
  // Fake, print only values, do not write to GPIO
  // This is very useful for debugging codes
  //
  else			 										
  {
  	switch(txPulse) {
		case 0:
			printf("L%d ",p_start);
		break;
		
		case 1:
			printf("H%d ",p_start);
		break;
		
		case 2:
			printf("L%d ",p_short);
		break;
		
		case 3:
			printf("L%d ",p_long);
		break;
		
		case 4:
			printf("H%d ",p_short);
		break;
		
		case 5:
			printf("H%d ",p_long);
		break;
	}
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
  
  Livolo liv(output_pin);
  
  if (wiringPiSetup () == -1)
		exit (1) ;

   // Sort out the options first!
   //
   // ./livolo -g <gid> -n <dev> on/off

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
		
		case 'n':						// Device Number
			device = atoi(optarg);
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
	
	// Check for additional command such as on or off
	while (optind < argc) {
		if (verbose==1) printf("Additional Arguments: %s\n",argv[optind]);
		// we must be sure that off is not toggled between ON/OFF
		if (! strcmp(argv[optind], "off" )) device = 42;						// off -> ALL OFF 
		optind++;
	}
	
	// If there is an error, display the correct usage of the command
    if (errflg) {
        fprintf(stderr, "usage: argv[0] (options) \n");
		
		fprintf(stderr, "\nSettings:\n");
		fprintf(stderr, "\t\t; This setting will affect other timing settings as well\n");
		fprintf(stderr, "-t\t\t; Test mode, will output received code from remote\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
		fprintf(stderr, "-l\t\t; Long pulse time in uSec\n");
		fprintf(stderr, "-s\t\t; Short pulse time in uSec\n");
		fprintf(stderr, "-r\t\t; Repeats per train pulse time in uSec\n");

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
		printf("-n\tdevice : %d\n",device);
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
		printf("Sending: j: %d, grp: %d, code: %d ...",j,group,device);
		printf(", start: %d, short: %d, long: %d ...",p_start,p_short,p_long);
		fflush(stdout);
	}
	liv.sendButton(group, device);	
	if (verbose==1) {						// Do the transmission
		printf(" ... done\n"); fflush(stdout);
	}
	if (j<loops) sleep(5);
  }
}

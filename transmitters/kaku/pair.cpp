/**
 * Demo for RF remote switch receiver.
 * For details, see NewRemoteReceiver.h!
 *
 * Connect the transmitter to digital pin 15.
 *
 * This sketch demonstrates the use of the NewRemoteTransmitter class.
 *
 * When run, this sketch switches some pre-defined devices on and off in a loop.
 *
 * NOTE: the actual receivers have the address and group numbers in this example
 * are only for demonstration! If you want to duplicate an existing remote, please
 * try the "retransmitter"-example instead.
 * 
 * To use this actual example, you'd need to "learn" the used code in the receivers
 * This sketch is unsuited for that.
 * 
 */
#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <getopt.h>
#include <unistd.h>
#include <ctype.h>
#include <iostream>
#include "NewRemoteTransmitter.cpp"

using namespace std;

int main(int argc, char **argv) 
{
  // load wiringPi

  if(wiringPiSetup() == -1)
  {
		printf("WiringPi setup failed. Maybe you haven't installed it yet?");
		exit(1);
  }

// Create a transmitter on address 123, using digital pin 15 to transmit, 
// with a period duration of 260ms (default), repeating the transmitted
// code 2^3=8 times.

  NewRemoteTransmitter transmitter(1024, 15, 260, 3);


  // Switch unit 1 on
  transmitter.sendUnit(1, true);


}

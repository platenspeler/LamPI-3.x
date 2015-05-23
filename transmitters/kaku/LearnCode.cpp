/*
* Demo for RF remote switch receiver.
* This example is for the new KaKu / Home Easy type of remotes!
*
* For details, see NewRemoteReceiver.h!
*
* With this sketch you can control a LED connected to digital pin 13,
* after the sketch learned the code. After start, the LED starts to blink,
* until a valid code has been received. The led stops blinking. Now you
* can control the LED with the remote.
*
* Note: only unit-switches are supported in this sketch, no group or dim.
*
* Set-up: connect the receiver to digital pin 'r_pin' and a LED to digital pin 's_pin'.
*/

#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include "NewRemoteReceiver.cpp"
// #include <NewRemoteReceiver.h>

bool codeLearned = false;
unsigned long learnedAddress;
unsigned short learnedUnit;

int r_pin = 1;
int s_pin = 13;

// Callback function is called only when a valid code is received.

// -------------------------------------------
//
//
void processCode(NewRemoteCode receivedCode) {

  // A code has been received.
  // Do we already know the code?
  if (!codeLearned) {
    // No! Let's learn the received code.
    learnedAddress = receivedCode.address;
    learnedUnit = receivedCode.unit;
    codeLearned = true;
  } else {
    // Yes!
    // Is the received code identical to the learned code?
    if (receivedCode.address == learnedAddress && receivedCode.unit == learnedUnit) {
      // Yes!
      // switchType == 1 means on, switchType == 0 means off.
      if (receivedCode.switchType == 1) {
        digitalWrite(s_pin, HIGH);
      } else if (receivedCode.switchType == 0) {
        digitalWrite(s_pin, LOW);
      }
	  printf("Address: %d, unit: %d, type: %d\n", receivedCode.address, receivedCode.unit, receivedCode.switchType);
    }
  }
}

// --------------------------------------
//
//
void loop() {
  // Blink led until a code has been learned
  if (!codeLearned) {
  	printf(".");										// print a .
    //digitalWrite(s_pin, HIGH);
    delay(500);
    //digitalWrite(s_pin, LOW);
    delay(500);
  }
}

// --------------------------------------
//
//
void setup() {
  // LED-pin as output
  pinMode(s_pin, OUTPUT);

  // Init a new receiver on interrupt pin r_pin, 
  // minimal 2 identical repeats, and callback set to processCode.
  NewRemoteReceiver::init(r_pin, 2, processCode);
}

// --------------------------------------
//
//
//
int main(int argc, char **argv)
{
	if (wiringPiSetup () == -1)
		exit (1);

	setup();
	while (1) loop();
}
/*
* Demo for RF remote switch receiver.
* This example is for the new KaKu / Home Easy type of remotes!

* For details, see NewRemoteReceiver.h!
*
* This sketch shows the received signals on the serial port.
* Connect the receiver to digital pin 1 (wiringPI1, GPIO18, header12)
*
*/
#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include "NewRemoteReceiver.cpp"
// #include <NewRemoteReceiver.h>

int r_pin = 1;

void loop() {
}

// Callback function is called only when a valid code is received.

void showCode(NewRemoteCode receivedCode) {
  // Note: interrupts are disabled. You can re-enable them if needed.
  
  // Print the received code.
  printf("Addr ");
  printf("%d",receivedCode.address);
  
  if (receivedCode.groupBit) {
    printf(" group");
  } else {
    printf(" unit ");
    printf("%d",receivedCode.unit);
  }
  
  switch (receivedCode.switchType) {
    case 0:
      printf(" off");
      break;
    case 1:
      printf(" on");
      break;
    case 2:
      printf(" dim level");
      printf("%d",receivedCode.dimLevel);
      break;
  }
  
  printf(", period: ");
  printf("%d",receivedCode.period);
  printf("us.\n");
}

void setup() {
  // Serial.begin(115200);			// XXX serial interface not used
  
  // Initialize receiver on interrupt 'r_pin' (= digital pin 2), calls the callback "showCode"
  // (XXX we changed to pin 'r_pin')
  //
  // after 2 identical codes have been received in a row. (thus, keep the button pressed
  // for a moment)
  //
  // See the interrupt-parameter of attachInterrupt for possible values (and pins)
  // to connect the receiver.
  
  NewRemoteReceiver::init(r_pin, 2, showCode);
}

int main(int argc, char **argv)
{
	if (wiringPiSetup () == -1) {
		printf("WiringPiSetup failed\n");
		exit (1) ;
	}
	piHiPri(55) ;	
	setup();
	while(1) loop();
}
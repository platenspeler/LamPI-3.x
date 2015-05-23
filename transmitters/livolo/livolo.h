/*
  Morse.h - Library for Livolo wireless switches.
  First version created by Sergey Chernov, October 25, 2013 for Arduino.
  Ported, adapted and simplified by M. Westenberg (Dec 2013).
  
  Released into the public domain.
*/

#ifndef Livolo_h
#define Livolo_h

#include <wiringPi.h>

class Livolo
{
  public:
    Livolo(unsigned char pin);
    void sendButton(unsigned int remoteID, unsigned char keycode);
  private:
    unsigned char txPin;
	int i; 						// just a counter
	unsigned char pulse; 		// counter for command repeat
	bool high; 					// pulse "sign"
	void selectPulse(unsigned char inBit);
	void sendPulse(unsigned char txPulse);
};

#endif

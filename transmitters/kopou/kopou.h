/*
  kopou.h - Library for Kopou wireless switches.
  Idea by Sergey Chernov, October 25, 2013 for Arduino.
  Ported, adapted and simplified by M. Westenberg (Dec 2013).
  
  Released into the public domain.
*/

#ifndef Kopou_h
#define Kopou_h

#include <wiringPi.h>

class Kopou
{
  public:
    Kopou(unsigned char pin);
    void sendButton(unsigned int remoteID, unsigned char keycode);
  private:
    unsigned char txPin;
	int i; 						//  counter
	unsigned char pulse; 		// counter for command repeat
	void selectPulse(unsigned char inBit);
};

#endif

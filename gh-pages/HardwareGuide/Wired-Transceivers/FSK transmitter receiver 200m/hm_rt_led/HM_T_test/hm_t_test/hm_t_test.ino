

void setup() {                
  // initialize the digital.
 
  pinMode(13, OUTPUT);    // Pin 13 has an LED connected on most Arduino boards:
  pinMode(2, OUTPUT);   //   Pin 2 is HT-T data PIN:
}

void loop() {
  
  
  digitalWrite(2, HIGH);   // send '1' to HT-T data pin
  digitalWrite(13, HIGH);   // send '1' to LED data pin
  
  delay(20);              // wait for a second
  

   
  digitalWrite(2, LOW);   // send '0' to HT-T data pin
  digitalWrite(13, LOW);   // send '0' to LED data pin
  
  delay(20);              // wait for a second
  
  
}

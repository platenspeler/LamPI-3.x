void setup() {                
  // initialize the digital.
 
  pinMode(13, OUTPUT);    // Pin 13 has an LED connected on most Arduino boards:
  pinMode(2, INPUT);   //   Pin 3 is HT-R data PIN:
  pinMode(3, OUTPUT);   //   Pin 3 is HT-R ENABLE PIN:
}

void loop() {
  
  digitalWrite(3, HIGH);   // enable HT-R
  
  
  //delay(10);              // wait for a second
  
  //read HT-R data pin
  if (digitalRead(2) == 1 ) 
  {
    digitalWrite(13, HIGH);
  }
  else
  {
    digitalWrite(13, LOW);
  }
    
// delay(10);              // wait for a second
  
  
  
   //read HT-R data pin
  if (digitalRead(2) == 1 ) 
  {
    digitalWrite(13, HIGH);
  }
  else
  {
    digitalWrite(13, LOW);
  }

  
}

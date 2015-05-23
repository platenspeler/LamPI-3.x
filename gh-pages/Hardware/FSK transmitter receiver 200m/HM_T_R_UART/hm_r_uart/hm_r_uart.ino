
String comdata = "";

void setup()
{
    Serial.begin(4800);
    pinMode(3, OUTPUT);   //   Pin 3 is HT-R ENABLE PIN:
    
     pinMode(13, OUTPUT);    // Pin 13 has an LED connected on most Arduino boards:
    
}

void loop()
{
    int i;
    
    digitalWrite(3, HIGH);   // enable HT-R
    
    i =0;
    
    digitalWrite(13, LOW);
    
    while (1) 
    {
      
      while(Serial.available() == 0);
      
      if(char(Serial.read()) == '5')  i++;
      else  i = 0;
      
      delay(2);
      
      if(i>= 5) break;
      
    }
    
    digitalWrite(13, HIGH);
    
    while (1) 
    {
      
      while(Serial.available() == 0);
      
      if(char(Serial.read()) == 'A')  break;
      
      delay(2);
      
    }
    
    delay(2);
    
    while (Serial.available() > 0)  
    {
      
        comdata += char(Serial.read());
        delay(2);
    }
    
    
    if (comdata.length() > 0)
    {
        Serial.println(comdata);
        comdata = "";
    }
}

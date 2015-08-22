void setup()
{
    Serial.begin(4800);
    pinMode(13, OUTPUT);    // Pin 13 has an LED connected on most Arduino boards:
}

void loop()
{
        Serial.print("5555555A");
        Serial.println("canton-electronics");
        digitalWrite(13, LOW);
        
        
        delay(1000);
        digitalWrite(13, HIGH);
}

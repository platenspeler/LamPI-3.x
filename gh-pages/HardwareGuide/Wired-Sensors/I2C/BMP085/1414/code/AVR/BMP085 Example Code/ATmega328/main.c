/*
    BMP085 Test Code
	April 7, 2010
	by: Jim Lindblom
	
	Test code for the BMP085 Barometric Pressure Sensor.
	We'll first read all the calibration values from the sensor.
	Then the pressure and temperature readings will be read and calculated.
	Also attempts to calculate altitude (remove comments)
	The sensor is run in ultra low power mode.
	Tested on a 3.3V 8MHz Arduino Pro
	A4 (PC4) -> SDA
	A5 (PC5) -> SCL
	No Connection to EOC or XCLR pins
*/

#include <stdlib.h>
#include <stdio.h>
#include <avr/io.h>
#include <avr/pgmspace.h>
#include <avr/interrupt.h>
#include "types.h"
#include "defs.h"
//#include "math.h"	// To calculate altitude
#include "i2c.h"

#define FOSC 8000000
#define BAUD 9600
#define BMP085_R 0xEF
#define BMP085_W 0xEE
#define OSS 0	// Oversampling Setting (note: code is not set up to use other OSS values)

#define sbi(var, mask)   ((var) |= (uint8_t)(1 << mask))
#define cbi(var, mask)   ((var) &= (uint8_t)~(1 << mask))

///============Function Prototypes=========/////////////////
void BMP085_Calibration(void);

///============I2C Prototypes=============//////////////////
short bmp085ReadShort(unsigned char address);
long bmp085ReadTemp(void);
long bmp085ReadPressure(void);
void bmp085Convert(long * temperature, long * pressure);

///============Initialize Prototypes=====//////////////////
void ioinit(void);
void UART_Init(unsigned int ubrr);
static int uart_putchar(char c, FILE *stream);
void put_char(unsigned char byte);
static FILE mystdout = FDEV_SETUP_STREAM(uart_putchar, NULL, _FDEV_SETUP_WRITE);
void delay_ms(uint16_t x);

/////=========Global Variables======////////////////////
short ac1;
short ac2; 
short ac3; 
unsigned short ac4;
unsigned short ac5;
unsigned short ac6;
short b1; 
short b2;
short mb;
short mc;
short md;

int main(void)
{	
	long temperature = 0;
	long pressure = 0;
	//long altitude = 0;
	//double temp = 0;
	
	ioinit();
	i2cInit();
	delay_ms(100);
	
	BMP085_Calibration();
	
	while(1)
	{
		bmp085Convert(&temperature, &pressure);
		
		printf("Temperature: %ld (in 0.1 deg C)\n", temperature);
		printf("Pressure: %ld Pa\n\n", pressure);
		
		// For fun, lets convert to altitude
		/*temp = (double) pressure/101325;
		temp = 1-pow(temp, 0.19029);
		altitude = round(44330*temp);
		printf("Altitude: %ldm\n\n", altitude);*/
		
		delay_ms(1000);
	}
}

void BMP085_Calibration(void)
{
	printf("\nCalibration Information:\n");
	printf("------------------------\n");
	ac1 = bmp085ReadShort(0xAA);
	ac2 = bmp085ReadShort(0xAC);
	ac3 = bmp085ReadShort(0xAE);
	ac4 = bmp085ReadShort(0xB0);
	ac5 = bmp085ReadShort(0xB2);
	ac6 = bmp085ReadShort(0xB4);
	b1 = bmp085ReadShort(0xB6);
	b2 = bmp085ReadShort(0xB8);
	mb = bmp085ReadShort(0xBA);
	mc = bmp085ReadShort(0xBC);
	md = bmp085ReadShort(0xBE);
	
	printf("\tAC1 = %d\n", ac1);
	printf("\tAC2 = %d\n", ac2);
	printf("\tAC3 = %d\n", ac3);
	printf("\tAC4 = %d\n", ac4);
	printf("\tAC5 = %d\n", ac5);
	printf("\tAC6 = %d\n", ac6);
	printf("\tB1 = %d\n", b1);
	printf("\tB2 = %d\n", b2);
	printf("\tMB = %d\n", mb);
	printf("\tMC = %d\n", mc);
	printf("\tMD = %d\n", md);
	printf("------------------------\n\n");
}

// bmp085ReadShort will read two sequential 8-bit registers, and return a 16-bit value
// the MSB register is read first
// Input: First register to read
// Output: 16-bit value of (first register value << 8) | (sequential register value)
short bmp085ReadShort(unsigned char address)
{
	char msb, lsb;
	short data;
	
	i2cSendStart();
	i2cWaitForComplete();
	
	i2cSendByte(BMP085_W);	// write 0xEE
	i2cWaitForComplete();
	
	i2cSendByte(address);	// write register address
	i2cWaitForComplete();
	
	i2cSendStart();
	
	i2cSendByte(BMP085_R);	// write 0xEF
	i2cWaitForComplete();
	
	i2cReceiveByte(TRUE);        //ack
	i2cWaitForComplete();
	msb = i2cGetReceivedByte();	// Get MSB result
	i2cWaitForComplete();
	
	i2cReceiveByte(FALSE);     //no ack
	i2cWaitForComplete();
	lsb = i2cGetReceivedByte();	// Get LSB result
	i2cWaitForComplete();
	
	i2cSendStop();
	
	data = msb << 8;
	data |= lsb;
	
	return data;
}

long bmp085ReadTemp(void)
{
	i2cSendStart();
	i2cWaitForComplete();
	
	i2cSendByte(BMP085_W);	// write 0xEE
	i2cWaitForComplete();
	
	i2cSendByte(0xF4);	// write register address
	i2cWaitForComplete();
	
	i2cSendByte(0x2E);	// write register data for temp
	i2cWaitForComplete();
	
	i2cSendStop();
	
	delay_ms(10);	// max time is 4.5ms
	
	return (long) bmp085ReadShort(0xF6);
}

long bmp085ReadPressure(void)
{
	long pressure = 0;
	
	i2cSendStart();
	i2cWaitForComplete();
	
	i2cSendByte(BMP085_W);	// write 0xEE
	i2cWaitForComplete();
	
	i2cSendByte(0xF4);	// write register address
	i2cWaitForComplete();
	
	i2cSendByte(0x34);	// write register data for temp
	i2cWaitForComplete();
	
	i2cSendStop();
	
	delay_ms(10);	// max time is 4.5ms
	
	pressure = bmp085ReadShort(0xF6);
	pressure &= 0x0000FFFF;
	
	return pressure;
	
	//return (long) bmp085ReadShort(0xF6);
}

void bmp085Convert(long* temperature, long* pressure)
{
	long ut;
	long up;
	long x1, x2, b5, b6, x3, b3, p;
	unsigned long b4, b7;
	
	ut = bmp085ReadTemp();
	ut = bmp085ReadTemp();	// some bug here, have to read twice to get good data
	up = bmp085ReadPressure();
	up = bmp085ReadPressure();
	
	x1 = ((long)ut - ac6) * ac5 >> 15;
	x2 = ((long) mc << 11) / (x1 + md);
	b5 = x1 + x2;
	*temperature = (b5 + 8) >> 4;
	
	b6 = b5 - 4000;
	x1 = (b2 * (b6 * b6 >> 12)) >> 11;
	x2 = ac2 * b6 >> 11;
	x3 = x1 + x2;
	b3 = (((int32_t) ac1 * 4 + x3) + 2)/4;
	x1 = ac3 * b6 >> 13;
	x2 = (b1 * (b6 * b6 >> 12)) >> 16;
	x3 = ((x1 + x2) + 2) >> 2;
	b4 = (ac4 * (unsigned long) (x3 + 32768)) >> 15;
	b7 = ((unsigned long) up - b3) * (50000 >> OSS);
	p = b7 < 0x80000000 ? (b7 * 2) / b4 : (b7 / b4) * 2;
	x1 = (p >> 8) * (p >> 8);
	x1 = (x1 * 3038) >> 16;
	x2 = (-7357 * p) >> 16;
	*pressure = p + ((x1 + x2 + 3791) >> 4);
}

/*********************
 ****Initialize****
 *********************/
 
void ioinit (void)
{
    //1 = output, 0 = input
	DDRB = 0b01100000; //PORTB4, B5 output
    DDRC = 0b00010000; //PORTC4 (SDA), PORTC5 (SCL), PORTC all others are inputs
    DDRD = 0b11111110; //PORTD (RX on PD0), PD2 is status output
	PORTC = 0b00110000; //pullups on the I2C bus
	
	UART_Init((unsigned int)(FOSC/16/BAUD-1));		// ocillator fq/16/baud rate -1	
}

void UART_Init( unsigned int ubrr)
{
	// Set baud rate 
	UBRR0H = ubrr>>8;
	UBRR0L = ubrr;
	
	// Enable receiver and transmitter 
	UCSR0A = (0<<U2X0);
	UCSR0B = (1<<RXEN0)|(1<<TXEN0);
	
	// Set frame format: 8 bit, no parity, 1 stop bit,   
	UCSR0C = (1<<UCSZ00)|(1<<UCSZ01);
	
	stdout = &mystdout; //Required for printf init
}

static int uart_putchar(char c, FILE *stream)
{
    if (c == '\n') uart_putchar('\r', stream);
  
    loop_until_bit_is_set(UCSR0A, UDRE0);
    UDR0 = c;
    
    return 0;
}

void put_char(unsigned char byte)
{
	/* Wait for empty transmit buffer */
	while ( !( UCSR0A & (1<<UDRE0)) );
	/* Put data into buffer, sends the data */
	UDR0 = byte;
}
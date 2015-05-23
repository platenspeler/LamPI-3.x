/*
  Copyright (c) 2013 Maarten Westenberg, mw12554@hotmail.com 
 
  This software is licensed under GNU license as detailed in the root directory
  of this distribution and on http://www.gnu.org/licenses/gpl.txt
 
  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.
 
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
#include <wiringPi.h>
#include <maxdetect.h>
#include <stdio.h>  
#include <stdlib.h> 
#include <string.h>
#include <stdint.h> 
#include <time.h>
#include <errno.h>
#include <netdb.h>
#include <math.h>
#include <unistd.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <arpa/inet.h>

#include "cJSON.h"
#include "sensor.h"

#define MAX_TIME 90  
#define DHT11PIN 0 					// == GPIO pin 17



// ----------------------------------------------------------------
// Each message is 40 bits:
// - 8 bit: Relative Humidity, Integral part
// - 8 bit: Relative Humidity, decimal part
// - 8 bit: Temperature; Integral part
// - 8 bit: Temperature; Decimal part
// - 8 bit: Check
//
// Protocol:
// =========
// Request:
// --------
//	Bus Free status starts by having data line HIGH
// 	Transmitter pulls down data line for at least 18 ms
//	Transmitter pull up data line level to HIGH for 20-40 ms
//
// Confirm
// --------
// 	Receiver starts sending LOW for 80 uSec
//	Receiver Pulls to HIGH for 80 uSec
//
// Data Transfer Phase
// -------------------
// Every bit starts with a 50 uSec pulse
// Data bit is 26-28 uSec for a "0", and 70 uSec for a "1"
//
// After last it, DHT11 pulls data line down for 50 uSec and lets loose after
//
// --------------------------------------------------------------------

unsigned char dht11_val[5]={0,0,0,0,0};
static volatile int pulse_array [MAXDATASIZE];	// Array to store the pulse timing
static volatile unsigned long edgeTimeStamp[2] = {0, };  // Timestamp of edges
static volatile unsigned long start_time = 0;
static volatile int stop_ints = 0;				// Stop Interrupts. If set, do not do any processing in interrupt time
static volatile int p_index = 0;				// Counter of pulses in interrupt routine. 

int statistics [I_MAX_ROWS][I_MAX_COLS];
// Declarations for Sockets
int sockfd;	
fd_set fds;

static int dflg = 0;							// Daemon
static int cflg = 0;							// Check
int verbose = 0;
int debug = 0;
int checks = 0;									// Number of checks on messages
int sflg = 0;									// If set, gather statistics

/*
 *********************************************************************************
 * INIT STATISTICS
 *
 *********************************************************************************/
int init_statistics(int statistics[I_MAX_ROWS][I_MAX_COLS])
{
	// Brute force method. Just make everything 0
	int i;
	int j;
	for (i=0; i<I_MAX_ROWS; i++)
	{
		for (j=0; j<I_MAX_COLS; j++)
		{
			statistics[i][j]=0;
		}
	}
	return(0);
} 

/*
 *********************************************************************************
 * Get In Addr
 *
 * get sockaddr, IPv4 or IPv6: These new way of dealing with sockets in Linux/C 
 * makes use of structs.
 *********************************************************************************
 */
void *get_in_addr(struct sockaddr *sa)
{
    if (sa->sa_family == AF_INET) {
        return &(((struct sockaddr_in*)sa)->sin_addr);
    }
    return &(((struct sockaddr_in6*)sa)->sin6_addr);
}

/*
 *********************************************************************************
 * Open Socket
 * The socket is used both by the sniffer and the transmitter program.
 * Standard communication is on port 5000 over websockets.
 *********************************************************************************
 */
int open_socket(char *host, char *port) {

	int sockfd;  
    struct addrinfo hints, *servinfo, *p;
    int rv;
    char s[INET6_ADDRSTRLEN];

    memset(&hints, 0, sizeof hints);
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    if ((rv = getaddrinfo(host, port, &hints, &servinfo)) != 0) {
        fprintf(stderr, "getaddrinfo: %s %s\n", host, gai_strerror(rv));
        return -1;
    }

    // loop through all the results and connect to the first we can
	
    for(p = servinfo; p != NULL; p = p->ai_next) {
	
        if ((sockfd = socket(p->ai_family, p->ai_socktype,
                p->ai_protocol)) == -1) {
            perror("client: socket");
            continue;
        }

        if (connect(sockfd, p->ai_addr, p->ai_addrlen) == -1) {
            close(sockfd);
			fprintf(stderr,"Address: %s, ", (char *) p->ai_addr);
            perror("client: connect");
            continue;
        }

        break;
    }

    if (p == NULL) {
        fprintf(stderr, "client: failed to connect\n");
        return -1;
    }

    inet_ntop(p->ai_family, get_in_addr((struct sockaddr *)p->ai_addr), s, sizeof s);
    printf("client: connecting to %s\n", s);

    freeaddrinfo(servinfo); // all done with this structure
	
	return(sockfd);
}


/*
 *********************************************************************************
 * DAEMON mode
 * In daemon mode, the interrupt handler will itself post completed messages
 * to the main LamPI-daemon php program. In order to not spend too much wait time 
 * in the main program, we can either sleep or (which is better) listen to the 
 * LamPI-daemoan process for incoming messages to be sent to the transmitter.
 *
 * These messages could be either PINGs or requests to the transmitter to send
 * device messages to the various receiver programs.
 * XXX We could move this function to a separate .c file for readibility
 *********************************************************************************
 */
 
 int daemon_mode(char *hostname, char* port) 
 {
	// ---------------- FOR DAEMON USE, OPEN SOCKETS ---------------------------------
	// If we choose daemon mode, we will need to open a socket for communication
	// This needs to be done BEFORE enabling the interrupt handler, as we want
	// the handler to send its code to the LamPI-daemon process 
	
	// Open a socket
	if ((sockfd = open_socket(hostname,port)) < 0) {
		fprintf(stderr,"Error opening socket for host %s. Exiting program\n\n", hostname);
		exit (1);
	};
	FD_ZERO(&fds);
	FD_SET(sockfd, &fds);

	return(0);
}


/*
 *********************************************************************************
 * Sensor_interrupt
 *
 * This is the main interrupt routine that is called as soon as we received an
 * edge (change) on the receiver GPIO pin of the RPI. As pulses arrive once every 
 * 100uSec, we have 1/10,000 sec to do work before another edge arrives on the pin.
 *
 *********************************************************************************
 */
void sensor_interrupt (void) 
{ 
	if (stop_ints == 1) return;
	
	// We record the time at receiving an interrupt, and we keep track of the
	// time of the previous interrupt. The difference is duration of this edge
	// We need to handle the pulse, even if we're not doing anything with it
	// as we need to start with correct pulses.
	//
	edgeTimeStamp[0] = edgeTimeStamp[1];
    edgeTimeStamp[1] = micros();	
	
	// Record this time
	//
	pulse_array[p_index++] = edgeTimeStamp[1] - edgeTimeStamp[0];
	
	return;
}

/*
 *********************************************************************************
 * dht11_read_int
 *
 * Read function based on interrupt processing
 *
 *
 *********************************************************************************
 */ 
int dht11_read_int(int r)  
{  
	uint8_t j,i;
	uint8_t linex;
	int time_interval = 0;
	int attempts = 100;
	
	// We want at least ONE successful read of the sensor values.
	while (--attempts >= 0) 
	{
		j=0;
		stop_ints = 1;								// Disable interrupts for the moment
		time_interval = 0;
		delay(500);									// XXX Necessary?
		
		pullUpDnControl (DHT11PIN, PUD_UP);			// Start with a HIGH value
		digitalWrite(DHT11PIN,HIGH);
		delay(10);									// Wait a little, 10 millisec
	
		for(i=0;i<5;i++)  dht11_val[i]=0;  			// Initialize result to 0

		// Send the request pulse
		//
		pinMode(DHT11PIN,OUTPUT);  
		digitalWrite(DHT11PIN,LOW);  
		delay(24);									// Wait 18 milli seconds
	
		digitalWrite(DHT11PIN,HIGH);  
		delayMicroseconds(18); 						// Pull up 20-40 uSec
  
		// Switch to input mode, enable interrupts 
		// Set pin mode to input
	
		pinMode(DHT11PIN,INPUT);
		piHiPri (20);								// Give this program higher interrupt than std
		stop_ints = 0;
	
		//pullUpDnControl (DHT11PIN, PUD_UP);		// Set data to a HIGH value
	
		// Receive bits, wait for interrupts to finish
		//

		start_time = micros();
		p_index = 0;								// Initialize index
		edgeTimeStamp[1] = start_time;
    	while (1) 
		{
			delayMicroseconds(5);
			time_interval = micros() - start_time;
			if ( time_interval > 80000 )
			{
				if (debug) printf("\n\nERROR: Timeout, p_index: %d, interval: %d uSec\n", 
					p_index, time_interval);
				break;
			}
			if ( p_index > 41 )
			{
				if (debug) printf("\n\nERROR: p_index overflow, p_index: %d, interval: %d uSec\n", 
					p_index, time_interval);
				break;
			}
		}
	
		start_time = 0;								// Reset timer
		piHiPri (0);
	
		linex=0;
		if (verbose) printf("Printing values, %d found:\n", p_index);
		for (i=0; i< p_index; i++) 
		{		
		// useless transitions are ignored
		
			if (i>=1)
			{  
				dht11_val[j/8]<<=1;  				// Shift one bit to left
				if (pulse_array[i] > 100) 			// "0"=50+28 uSec, "1"=50+70uSec
				{ 
					dht11_val[j/8]|=1;				// Make lsb 1 (else it remains 0)
				}
				j++;  
			} 
			if (verbose)
			{
				printf("%3d|", pulse_array[i]);
				if (linex <= 0) {
					printf("\n");
					linex=8;
				}
				linex--;
			}
		}
		if (verbose) 
		{	
			printf("\n");
			printf("values: ");
			for (i=0; i<5; i++) {
				printf("%3d.",dht11_val[i]);
			}
			printf("\n");
  		}
	
		// verify checksum and print the verified data  
	
		if((j>=40)&&(dht11_val[4]==((dht11_val[0]+dht11_val[1]+dht11_val[2]+dht11_val[3])& 0xFF)))  
		{  
			printf("%d, humidity: %d.%d; temperature: %d.%d; OK\n",
				r+1, dht11_val[0], dht11_val[1], dht11_val[2], dht11_val[3]);
			return(attempts);
		}  
		else 
		{  
			if (verbose) {
				printf("%d, humidity: %d.%d; temperature: %d.%d; Checksum failed\n",
		 			r+1, dht11_val[0], dht11_val[1], dht11_val[2], dht11_val[3]);
			}
		}
		//delay(1100);			// Really necessary?
	}//success
	return(-1);
} 


/*
 *********************************************************************************
 * dht11_read_wiring
 *
 * Making use of the wiringPiDev library. The function will only return when
 * reading the sensor is successful
 *
 *********************************************************************************
 */
int dht11_read_wiring(int r) 
{
	//int myTemp        = 0;
	//int myRelHumidity = 0;
	int attempts      = 100;
	int goodReading   = 0;
	piHiPri (10);
	while (!goodReading && (attempts-- >= 0)) {
	
		usleep(1000*10);
		if (maxDetectRead (DHT11PIN, dht11_val)) {
			goodReading = 1;
		}
				
		//if ( readRHT03 (DHT11PIN, &myTemp, &myRelHumidity) == 0) {
		//	goodReading = 0;		//keep looping and try again
		//} else {
		//	goodReading = 1; 		// stop now that it worked
		//}
		usleep(1000*500);
	}
	piHiPri (0);
	//printf("Temp: %2.1fF  ",(((((float)myTemp/10)*9)/5)+32));
	//printf("RH: %2.1f%%\n",((float)myRelHumidity/10));
	
	printf("%d, humidity: %d.%d; temperature: %d.%d; OK\n",
				r+1, dht11_val[0], dht11_val[1], dht11_val[2], dht11_val[3]);
				
	return(attempts);
}

/*
 *********************************************************************************
 * dht11_read_old
 *
 * Reading the sensor using the brute force method. Call the wait routine several times.
 * this method is more compute intensive than calling the interrupt routine.
 *
 *********************************************************************************
 */ 
int dht11_read_old(int r)  
{  
	uint8_t lststate=HIGH;  
	uint8_t counter=0;  
	uint8_t j,i,k;
	uint8_t linex;
	//struct timespec tim;

	int attempts = 100;
	
	while (-- attempts >= 0)
	{
		j = 0;
		//tim.tv_sec = 0;
		//tim.tv_nsec = 1000;
	
		delay(500);
		for(i=0;i<5;i++)  dht11_val[i]=0;  			// Initialize result to 0
	
		//pullUpDnControl (DHT11PIN, PUD_UP);		// Start with a HIGH value
		delay(1);									// Wait a ms
		piHiPri (10);								// Set Higher Priority
	
		// Send the request pulse
   
		pinMode(DHT11PIN,OUTPUT);  
		digitalWrite(DHT11PIN,LOW);  
		delay(24);										// Wait 18 milli seconds
		digitalWrite(DHT11PIN,HIGH);  
		delayMicroseconds(25); 							// Pull up 40 uSec ==>> 38 works MUCH better
  
		// Switch to input mode 
	
		// pullUpDnControl (DHT11PIN, PUD_UP);
		// Set pin mode to input
		pinMode(DHT11PIN,INPUT);
	
		//
		// READ LOOP
		//
		for( i=0; i<MAX_TIME; i++)  
		{
			counter=0;  
			while(digitalRead(DHT11PIN)==lststate){  
				counter++;  
				delayMicroseconds(1);  
				if(counter>=255)  					// break while loop when 255 uSecs no change on pin
				break;  
			} 
	
			//lststate=digitalRead(DHT11PIN);  
			if(counter>=255)
				break;									// break for loop
			else
				lststate = 1 - lststate;
			
			// top 3 transistions (pulses) are ignored as are the
			// odd numbers which all should be around 50 uSec each 
			if((i>=4)&&(i%2==0))
			{  
				dht11_val[j/8]<<=1;  
				if(counter>16) {
					dht11_val[j/8]|=1;
				}
				pulse_array[i]=counter;
				j++;  
			} 
			else {
				pulse_array[i]=counter;
			}
		}
	
		//
		// RESULTS SECTION
		//
		
		if (verbose)
		{
			printf("\n");
  
  			linex = 3;
  			for (k=0; k< i; k++) {
				printf("%3d ",pulse_array[k]);
		
				if (linex <= 0) {
					linex = 16;
					printf("\n");
				}
				linex--;
			}
			printf("\n");
				if (j<40) {
				printf("ERROR: Not 40 bits but %d: ",j);
				printf("hum:%d.%d | temp:%d.%d\n",
				 	dht11_val[0],dht11_val[1],dht11_val[2],dht11_val[3]);
				//return (EXIT_FAILURE);
			}
		}
		
  
		// verify cheksum and print the verified data  
	
		if((j>=40)&&(dht11_val[4]==((dht11_val[0]+dht11_val[1]+dht11_val[2]+dht11_val[3])& 0xFF)))  
		{  
			printf("%d, humidity: %d.%d | temperature: %d.%d\n",
				r+1, dht11_val[0],dht11_val[1],dht11_val[2],dht11_val[3]); 
			return(attempts); 
		}  
		else {  
			if (verbose) {
				printf("Invalid Data: ");
				printf("%d, hum: %d.%d | temp: %d.%d\n",
					r+1, dht11_val[0],dht11_val[1],dht11_val[2],dht11_val[3]);
			}
		}
	}
	return (attempts);
} 


/* ********************************************************************
 * MAIN PROGRAM
 *
 * We use HIGE timers in order to see system performance with vmstat
 *
 * ********************************************************************	*/  
int main(int argc, char **argv)  
{  
	int i,c;
	int errflg = 0;
	int iflg = 0;
	int wflg = 0;							// WIringPI
	int repeats = 1;						// We can repeat readings
	int attempts = 0;						// How many attempts were necessary to be successful
	
	char *hostname = "localhost";			// Default setting for our host == this host
	char *port = PORT;						// default port, 5000
	
    extern char *optarg;
    extern int optind, optopt;

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	// Valid options are:
	// -h <hostname> ; hostname or IP address of the daemon
	// -p <port> ; Portnumber for daemon socket
	// -a ; Catch all, find out the protocol yourself
	// -v ; Verbose, Give detailed messages
	// -w ; WiringPi mode
	//
    while ((c = getopt(argc, argv, ":c:dh:ip:r:stvw")) != -1) {
        switch(c) {

		case 'c':
			cflg = 1;					// Checks
			checks = atoi(optarg);
		break;
		case 'd':						// Daemon mode, cannot be together with test?
			dflg = 1;
		break;
		case 'h':						// Socket communication
            dflg++;						// Need daemon flag too, (implied)
			hostname = optarg;
		break;
		case 'i':						// Interrupt (instead of waiting out).
			iflg=1;
			if (wflg) errflg++;
		break;
		case 'p':						// Port number
            port = optarg;
           dflg++;						// Need daemon flag too, (implied)
        break;
		case 'r':						// repeats
			repeats = atoi(optarg);
		break;
		case 's':						// Statistics
			sflg = 1;
		break;
		case 't':						// Test Mode, do debugging
			debug=1;
		break;
		case 'v':						// Verbose, output long timing/bit strings
			verbose = 1;
		break;
		case 'w':						// wiringpi library used
			wflg = 1;
			if (iflg) errflg++;
		break;
		case ':':       				// -f or -o without operand
			fprintf(stderr,"Option -%c requires an operand\n", optopt);
			errflg++;
		break;
		case '?':
			fprintf(stderr, "Unrecognized option: -%c\n", optopt);
            errflg++;
        }
    }
	
	// -------------------- PRINT ERROR ---------------------------------------
	// Print error message if parsing the commandline
	// was not successful
	
    if (errflg) {
        fprintf(stderr, "usage: argv[0] (options) \n\n");
		
		fprintf(stderr, "-d\t\t; Daemon mode. Codes received will be sent to another host at port 5000\n");
		fprintf(stderr, "-i\t\t; Interrupt based sensor processing\n");
		fprintf(stderr, "-w\t\t; WiringPI libs used for sensor processing\n");
		fprintf(stderr, "-s\t\t; Statistics, will gather statistics from remote\n");
		fprintf(stderr, "-r\t\t; Repeats, will gather statistics #repeats times\n");
		fprintf(stderr, "-t\t\t; Test mode, will output received code from remote\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
        exit (2);
    }
	
	// ------------------ SETUP WIRINGPI --------------------------------------------
	// Now start with setup wiringPI
	//
	
	wiringPiSetup();

	//	------------------ PRINTING Parameters ------------------------------
	//
	if (verbose == 1) {
		printf("The following options have been set:\n\n");
		printf("-v\t; Verbose option\n");
		if (statistics>0)	printf("-s\t; Statistics option\n");
		if (dflg>0)			printf("-d\t; Daemon option\n");
		if (iflg>0)			printf("-i\t; Interrupt processing\n");
		if (wflg>0)			printf("-w\t; WIringPI library processing\n");
		if (debug)			printf("-t\t; Test and Debug option");
		if (repeats>=1)		printf("-r\t; Repeats: %d",repeats);
		printf("\n");						 
	}//if verbose
	
	// If we are in daemon mode, initialize sockets etc.
	//
	if (dflg) {
		daemon_mode(hostname, port);
	}
	
	if (sflg) {
		fprintf(stderr,"init statistics\n");
		init_statistics(statistics);			// Make cells 0
	}
	
	// ------------------------
	// MAIN LOOP
	// 
	delay(500);								// Wait 2 secs before starting
	if (iflg) {
		wiringPiISR (DHT11PIN, INT_EDGE_FALLING, &sensor_interrupt);
	}
	
	for (i=0; i<repeats; i++)  
	{  
		if (iflg) {
		// Use an interrupt routing, less resource consuming
			attempts = 100 - dht11_read_int(i);
		}
		else if (wflg) {
		// Make use of the special library for these devices in wiringPI
			attempts = 100 - dht11_read_wiring(i);
			delay (500);
		}
		else {
		// Use the brute force method and wait all reads out
			attempts = 100 - dht11_read_old(i); 
		}	
		//delay(1500);							// wait 1.5 secs
		
		printf("It took %d attempts to read\n",attempts);
	}
	
	exit(EXIT_SUCCESS); 
}  

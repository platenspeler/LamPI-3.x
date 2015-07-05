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
#define DHT22PIN 0 					// == GPIO pin 17



// ----------------------------------------------------------------
// Each message is 40 bits:
// - 8 bit: Relative Humidity MSByte
// - 8 bit: Relative Humidity 
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
// After last it, DHT22 pulls data line down for 50 uSec and lets loose after
//
// --------------------------------------------------------------------

unsigned char dht22_val[5]={0,0,0,0,0};
static volatile int pulse_array [MAXDATASIZE];	// Array to store the pulse timing
static volatile unsigned long edgeTimeStamp[2] = {0, };  // Timestamp of edges
static volatile unsigned long start_time = 0;
static volatile int stop_ints = 0;				// Stop Interrupts. If set, do not do any processing in interrupt time
static volatile int p_index = 0;				// Counter of pulses in interrupt routine. 

int statistics [I_MAX_ROWS][I_MAX_COLS];
// Declarations for Sockets
int socktcnt = 0;
int sockfd;	
fd_set fds;

static int dflg = 0;							// Daemon
static int cflg = 0;							// Check
int verbose = 0;
int debug = 0;
int checks = 0;									// Number of checks on messages
int sflg = 0;									// If set, gather statistics
int mode = SOCK_STREAM;

float temperature;
float humidity;

// char *hostname = "localhost";			// Default setting for our host == this host
char *hostname = "0.0.0.0";					// Default setting for our host == this host
char *port = PORT;							// default port, 5000

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
 * Open UDP Socket
 *********************************************************************************
 */
int open_udp_socket() {

	int sockfd;  
    //struct sockaddr_in myaddr;
	int broadcastPermission;
	
	if ((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0) 
	{
		perror("cannot create socket"); 
		return (-1); 
	}
	broadcastPermission = 1;
		
	if (setsockopt(sockfd, 
			SOL_SOCKET, SO_BROADCAST, 
			(void *) &broadcastPermission, 
			sizeof(broadcastPermission) ) < 0) 
	{
		perror("open_udp_socket:: ");
	}
	return(sockfd);
}



/*
 *********************************************************************************
 * Open TCP Socket
 * The socket is used both by the sniffer and the transmitter program.
 * Standard communication is on port 5000 over websockets.
 *********************************************************************************
 */
int open_tcp_socket(char *host, char *port) {

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
 
 int daemon_mode(char *hostname, char* port, int mode) 
 {
	// ---------------- FOR DAEMON USE, OPEN SOCKETS ---------------------------------
	// If we choose daemon mode, we will need to open a socket for communication
	// This needs to be done BEFORE enabling the interrupt handler, as we want
	// the handler to send its code to the LamPI-daemon process 
	
	if (mode == SOCK_DGRAM) {
	
		if ((sockfd = open_udp_socket()) < 0) {
			fprintf(stderr,"Error opening UDP socket for host %s. Exiting program\n\n", hostname);
			exit (1);
		}
		else if (verbose) {
			printf("daemon mode:: Success opening ocket\n");
		}
	}
	else {
		// Open a TCP socket
		if ((sockfd = open_tcp_socket(hostname,port)) < 0) {
			fprintf(stderr,"Error opening TCP socket for host %s. Exiting program\n\n", hostname);
			exit (1);
		}
		else if (verbose) {
			printf("daemon mode:: Success connecting TCP to %s:%s\n",hostname,port);
		}
		FD_ZERO(&fds);
		FD_SET(sockfd, &fds);
	}
	return(0);
}

/*
 *********************************************************************************
 * send_2_server
 * Send a message buffer to the server over either TCP or UDP
 *********************************************************************************
 */
int send_2_server(int sockfd, float humidity, float temperature)
{
	char snd_buf[256];
	if (temperature > 50) {
		fprintf(stderr,"dht22:: ERROR temperature too high: %2.1f\n",temperature);
		return(-1);
	}
	
	// Daemon, output to socket
	sprintf(snd_buf, "{\"tcnt\":\"%d\",\"action\":\"sensor\",\"brand\":\"dht22\",\"type\":\"json\",\"address\":\"%s\",\"channel\":\"%s\",\"temperature\":\"%3.1f\",\"humidity\":\"%2.1f\",\"windspeed\":\"\"}", 
				socktcnt%1000,
				"0",								// address
				"0",								// channel
				temperature,
				humidity
				);
	socktcnt++;			
	// If this is a TCP connections
	//
	if (mode == SOCK_STREAM) 
	{				
		// Do NOT use check_n_write_socket as weather stations will not
		// send too many repeating messages (1 or 2 will come in one transmission)
		//
		if (write(sockfd, snd_buf, strlen(snd_buf)) == -1) {
			fprintf(stderr,"socket write error\n");
		}	

		delay(200);			
		if (verbose) printf("Buffer sent to TCP Socket: %s\n",snd_buf);
	}
	
	// If this is an UDP connections
	//
	else {
		// hostname and port are global variables. Must be changed later!
		
		struct sockaddr_in servaddr; 			// server address */
		short s_port = atoi(port);				// Instead of port 5000, use port 5001 as standard
		
		/* fill in the server's address and data, in this case 0 */ 
		
		memset((char*)&servaddr, 0, sizeof(servaddr)); 
		servaddr.sin_family = AF_INET; 
		servaddr.sin_port = htons(s_port);
		servaddr.sin_addr.s_addr = inet_addr(hostname);
		
		//printf("UDP dest: %s -> inet_addr: %ul, port: %d -> %u \n", 
		//		hostname, inet_addr(hostname), s_port, htons(s_port) );
		printf("UDP dest: %s , port: %d\n", hostname, s_port);
		
		if (sendto(sockfd, snd_buf, strlen(snd_buf), 0, (struct sockaddr *)&servaddr, sizeof(servaddr)) < 0) {
	 		perror("sendto failed"); 
			return -1; 
		}
	}
	return(1);
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
 * dht22_read_old
 *
 * Reading the sensor using the brute force method. Call the wait routine several times.
 * this method is more compute intensive than calling the interrupt routine.
 *
 *********************************************************************************
 */ 
int dht22_read_old(int r)  
{  
	uint8_t lststate=HIGH;  
	uint8_t counter=0;  
	uint8_t j,i,k;
	uint8_t linex;
	//struct timespec tim;
	int attempts = 0;
	int result = 0;
	
	while ((result == 0) && (attempts++ < 100))
	{
		j = 0;
		//tim.tv_sec = 0;
		//tim.tv_nsec = 1000;
	
		delay(50);
		for(i=0;i<5;i++) dht22_val[i]=0;  			// Initialize result to 0
	
		//pullUpDnControl (DHT22PIN, PUD_UP);		// Start with a HIGH value
		delay(1);									// Wait a ms
		piHiPri (10);								// Set Higher Priority
	
		// Send the request pulse
   
		pinMode(DHT22PIN,OUTPUT);  
		digitalWrite(DHT22PIN,LOW);  
		delay(24);										// Wait 18 milli seconds
		digitalWrite(DHT22PIN,HIGH);  
		delayMicroseconds(25); 							// Pull up 40 uSec ==>> 38 works MUCH better
  
		// Switch to input mode 
	
		// pullUpDnControl (DHT22PIN, PUD_UP);
		// Set pin mode to input
		pinMode(DHT22PIN,INPUT);
	
		//
		// READ LOOP
		//
		for( i=0; i<MAX_TIME; i++)  
		{
			counter=0;  
			while(digitalRead(DHT22PIN)==lststate){  
				counter++;  
				delayMicroseconds(1);  
				if(counter>=255)  					// break while loop when 255 uSecs no change on pin
				break;  
			} 
	
			//lststate=digitalRead(DHT22PIN);  
			if(counter>=255)
				break;									// break for loop
			else
				lststate = 1 - lststate;
			
			// top 3 transistions (pulses) are ignored as are the
			// odd numbers which all should be around 50 uSec each 
			if((i>=4)&&(i%2==0))
			{  
				dht22_val[j/8]<<=1;  
				if(counter>16) {
					dht22_val[j/8]|=1;
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
		if (debug)
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
				 	dht22_val[0],dht22_val[1],dht22_val[2],dht22_val[3]);
				//return (EXIT_FAILURE);
			}
		}
  
		// verify cheksum and print the verified data  
		humidity    = (float)(dht22_val[0]*256+ dht22_val[1])/10;
		temperature = (float)(dht22_val[2]*256+ dht22_val[3])/10;
		
		if((j>=40)&&(dht22_val[4]==((dht22_val[0]+dht22_val[1]+dht22_val[2]+dht22_val[3])& 0xFF)))  
		{
			if (dflg) {
				send_2_server(sockfd, humidity, temperature);
				if (verbose) printf("humidity: %2.1f; temperature: %2.1f; ORG. \n", humidity, temperature); 
			}
			else {  
				if (debug) {
					printf("Invalid Checksum Msg: %2d, humidity: %2.1f; temperature: %2.1f; ORG. \n", r+1, humidity, temperature);
				}
			}//else
			result = 1;
		}
	}
	return (attempts);
} 


/*
 *********************************************************************************
 * dht22_read_int
 *
 * Read function based on interrupt processing
 * argument r describes the repeat index number (meaningful if we have large
 * numbers of repeats.
 * This -i option seems to take less time to come to results, however its system time
 * to reach that result is higher than the original (brute force) timer result.
 *********************************************************************************
 */ 
int dht22_read_int(int r)  
{  
	uint8_t j,i;
	uint8_t linex;
	int time_interval = 0;
	int attempts = 0;
	int result = 0;
	
	// We want at least ONE successful read of the sensor values.
	while ((result == 0)  && (attempts++ < 100))
	{
		j=0;
		stop_ints = 1;								// Disable interrupts for the moment
		time_interval = 0;
		delay(50);									// XXX Necessary?
		
		pullUpDnControl (DHT22PIN, PUD_UP);			// Start with a HIGH value
		digitalWrite(DHT22PIN,HIGH);
		delay(5);									// Wait a little, 5 millisec
	
		for(i=0; i<5; i++)  dht22_val[i]=0;  		// Initialize result to 0

		// Send the request pulse
		//
		pinMode(DHT22PIN,OUTPUT);  
		digitalWrite(DHT22PIN,LOW);  
		delay(24);									// Wait 18 milli seconds
	
		digitalWrite(DHT22PIN,HIGH);  
		delayMicroseconds(18); 						// Pull up 20-40 uSec
  
		// Switch to input mode, enable interrupts 
		// Set pin mode to input
	
		pinMode(DHT22PIN,INPUT);
		piHiPri (10);								// Give this program higher interrupt than std
		stop_ints = 0;
	
		//pullUpDnControl (DHT22PIN, PUD_UP);		// Set data to a HIGH value
	
		// Receive bits, wait for interrupts to finish
		//

		start_time = micros();
		p_index = 0;								// Initialize index
		edgeTimeStamp[1] = start_time;
    	while (1) 
		{
			delayMicroseconds(5);
			time_interval = micros() - start_time;
			if ( time_interval > 12000 )			// 40 bits * (50+75) usec max = 6000 usec
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
		// useless transitions are ignored. But the difference between 0 and 1 is not just the
		// typical value of 28uSec or 70uSec. This is because the system itself takes time as well to evaluate
		// transitions
		
			if (i>=1)
			{  
				dht22_val[j/8]<<=1;  				// Shift one bit to left
				if (pulse_array[i] > 110) 			// "0"=50+28 uSec, "1"=50+70uSec
				{ 
					dht22_val[j/8]|=1;				// Make lsb 1 (else it remains 0)
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
		}// for
		
		if (verbose) 
		{	
			printf("\n");
			printf("values: ");
			for (i=0; i<5; i++) {
				printf("%3d.",dht22_val[i]);
			}
			printf("\n");
  		}
	
		// verify checksum and print the verified data  
		humidity    = (float) (dht22_val[0]*256+dht22_val[1])/10;
		temperature = (float) (dht22_val[2]*256+dht22_val[3])/10;
		
		if((j>=40)&&(dht22_val[4]==((dht22_val[0]+dht22_val[1]+dht22_val[2]+dht22_val[3])& 0xFF)))  
		{
			printf("UDP %2d, humidity: %3.1f; temperature: %3.1f; INT. ", r+1, humidity, temperature);
			if (dflg) {
				send_2_server(sockfd, humidity, temperature);
			}
			else {  
				if (debug) {
					printf("Invalid Checksum Msg: %2d, humidity: %2.1f; temperature: %2.1f; INT. \n", r+1, humidity, temperature);
				}
			}//else
			result = 1;
		}  
		else 
		{  
			if (verbose) {
				printf("Invalid Checksum Msg: %2d, humidity: %2.1f; temperature: %2.1f; INT. \n", r+1, humidity, temperature);
			}
		}
		//delay(1100);			// Really necessary?
	}//while
	return(attempts);
} 


/*
 *********************************************************************************
 * dht22_read_wiring
 *
 * Making use of the wiringPiDev library. The function will only return when
 * reading the sensor is successful
 *
 *********************************************************************************
 */
int dht22_read_wiring(int r) 
{
	//int myTemp        = 0;
	//int myRelHumidity = 0;
	int attempts      = 100;
	int goodReading   = 0;
	piHiPri (10);
	while (!goodReading && (attempts-- >= 0)) {
	
		usleep(1000*10);
		if (maxDetectRead (DHT22PIN, dht22_val)) {
			goodReading = 1;
		}
				
		//if ( readRHT03(DHT22PIN, &myTemp, &myRelHumidity) == 0) {
		//	goodReading = 0;		//keep looping and try again
		//} else {
		//	goodReading = 1; 		// stop now that it worked
		//}
		usleep(1000*500);
	}
	piHiPri (0);
	//printf("Temp: %2.1fF  ",(((((float)myTemp/10)*9)/5)+32));
	//printf("RH: %2.1f%%\n",((float)myRelHumidity/10));
	humidity    = (float) (dht22_val[0]*256+dht22_val[1])/10;
	temperature = (float) (dht22_val[2]*256+dht22_val[3])/10;
	printf("%2d, humidity: %2.1f; temperature: %2.1f; WPI. ", r+1, humidity, temperature);
	return(attempts);
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
	int fake = 0;
	
    extern char *optarg;
    extern int optind, optopt;
	
	mode = SOCK_STREAM;						// default Socket mode

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	// Valid options are:
	// -h <hostname> ; hostname or IP address of the daemon
	// -p <port> ; Portnumber for daemon socket
	// -b ; Broadcast mode
	// -v ; Verbose, Give detailed messages
	// -w ; WiringPi mode
	//
    while ((c = getopt(argc, argv, ":bc:dfh:ip:r:stvw")) != -1) {
        switch(c) {
		case 'b':
			mode = SOCK_DGRAM;			// UDP Datagram Mode, broadcasting
		break;
		case 'c':
			cflg = 1;					// Checks
			checks = atoi(optarg);
		break;
		case 'd':						// Daemon mode, cannot be together with test?
			dflg = 1;
		break;
		case 'f':
			fake = 1;
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
		fprintf(stderr, "-b\t\t; Broadcast mode. Use UDP broadcasting\n");
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
		if (debug)			printf("-t\t; Test and Debug option\n");
		if (repeats>=1)		printf("-r\t; Repeats: %d\n",repeats);
		if (mode != SOCK_STREAM) printf("-b\t; UDP Broadcasting option\n");
		printf("\n");						 
	}//if verbose
	
	// If we are in daemon mode, initialize sockets etc.
	//
	if (dflg) {
		daemon_mode(hostname, port, mode);
	}
	
	if (sflg) {
		fprintf(stderr,"init statistics\n");
		init_statistics(statistics);			// Make cells 0
	}
	
	// ------------------------
	// MAIN LOOP
	// 
	delay(500);								// Wait 0.5 secs before starting
	
	// We will initialize the interrupt handler to only react to a falling edge.
	// SO as every bit consists of a high pulse of 50 and a low pulse of either 28 or 75 usec
	// when we measure the falling edge only a 50+28 means a 0 and a 50+75usec flank means 1
	//
	if (iflg) {
		wiringPiISR (DHT22PIN, INT_EDGE_FALLING, &sensor_interrupt);
	}
	
	for (i=0; i<repeats; i++)  
	{  
		if (iflg) {
		// Use an interrupt routing, less resource consuming
			attempts = dht22_read_int(i);
		}
		else if (wflg) {
		// Make use of the special library for these devices in wiringPI
			attempts = dht22_read_wiring(i);
		}
		else if (fake) {
			attempts = 1;
			send_2_server(sockfd, 50, 10);
		}
		else {
		// Use the brute force method and wait all reads out
			attempts = dht22_read_old(i); 
		}
		
		if (attempts <= 100) {
			printf(" It took %d attempts to read\n",attempts);
		}
		else {
			printf(" dht22: Unable to read a value in 100 attempts\n");
		}
		delay(2000);							// wait 2.0 secs
	}
	
	// Close the socket to the daemon
	if (close(sockfd) == -1) {
		perror("Error closing socket to daemon");
	}
	exit(EXIT_SUCCESS); 
}  

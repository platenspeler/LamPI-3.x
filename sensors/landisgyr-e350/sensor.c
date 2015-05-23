/*
  Copyright (c) 2013,2014 Maarten Westenberg, mw12554@hotmail.com 
 
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
#include <fcntl.h>
#include <termios.h>

#include "cJSON.h"
#include "sensor.h"


/* ----------------------------------------------------------------
 * The Landis Gyr e350 is a smart Meter
 *
 * It is read over a selerial line from the P1 port of the meter.
 * In my case P1 is connected with a RJ45 (telephone) cable.
 * The protocol is 11520 baud no parity

 *
 * ----------------------------------------------------------------	*/

// Declaration for Statistics
int statistics [I_MAX_ROWS][I_MAX_COLS];

// Declarations for Sockets
int sockfd;	
fd_set fds;
int socktcnt = 0;

// Options flags
static int dflg = 0;							// Daemon
static int cflg = 0;							// Check
int verbose = 0;
int debug = 0;
int checks = 0;									// Number of checks on messages
int start = 0;

// Define the various meters!

struct meter {
	char kw_hi_use[12];			// Meter reading High tariff Use
	char kw_lo_use[12];			// Meter reading Low tariff Usage
	char kw_hi_ret[12];			
	char kw_lo_ret[12];
	char gas_use[10];
	char kw_act_use[12];		// Actual use
	char kw_act_ret[12];
	char kw_ph1_use[12];		// 3-Phase power
	char kw_ph2_use[12];
	char kw_ph3_use[12];
	char kw_ph1_ret[12];
	char kw_ph2_ret[12];
	char kw_ph3_ret[12];
	

};

struct meter mtr;

// --------------------------------------------------------------------------------
// Print Meter data
//
char * print_meter(char *outbuf, struct meter mtr, int dflg)
{
	//char b[32];
	if (dflg) {
		sprintf(outbuf, 
		"\"kw_hi_use\":\"%s\",\"kw_lo_use\":\"%s\",\"kw_hi_ret\":\"%s\",\"kw_lo_ret\":\"%s\",\"gas_use\":\"%s\",\"kw_act_use\":\"%s\",\"kw_act_ret\":\"%s\",\"kw_ph1_use\":\"%s\",\"kw_ph2_use\":\"%s\",\"kw_ph3_use\":\"%s\",\"kw_ph1_ret\":\"%s\",\"kw_ph2_ret\":\"%s\",\"kw_ph3_ret\":\"%s\""
		
		, mtr.kw_hi_use
		, mtr.kw_lo_use
		, mtr.kw_hi_ret
		, mtr.kw_lo_ret	
		, mtr.gas_use			// Gas usage for heating
		, mtr.kw_act_use				// Actual use
		, mtr.kw_act_ret
		, mtr.kw_ph1_use				// 3-Phase power
		, mtr.kw_ph2_use
		, mtr.kw_ph3_use
		, mtr.kw_ph1_ret
		, mtr.kw_ph2_ret
		, mtr.kw_ph3_ret );
	}
	else {
		sprintf(outbuf, " \
		kw_hi_use: %s kWh\n \
		kw_lo_use: %s kWh\n \
		kw_hi_ret: %s kWh\n \
		kw_lo_ret: %s kWh\n \
		kw_act_use: %s kW\n \
		kw_act_ret: %s kW\n \
		kw_ph1_use: %s kW\n \
		kw_ph2_use: %s kW\n \
		kw_ph3_use: %s kW\n \
		kw_ph1_ret: %s kW\n \
		kw_ph2_ret: %s kW\n \
		kw_ph3_ret: %s kW\n \
		gas: %s m3\n"
		
		,mtr.kw_hi_use
		,mtr.kw_lo_use
		,mtr.kw_hi_ret
		,mtr.kw_lo_ret
		,mtr.kw_act_use
		,mtr.kw_act_ret
		,mtr.kw_ph1_use
		,mtr.kw_ph2_use
		,mtr.kw_ph3_use
		,mtr.kw_ph1_ret
		,mtr.kw_ph2_ret
		,mtr.kw_ph3_ret
		,mtr.gas_use);
	}
	return(outbuf);
}

// --------------------------------------------------------------------------------
// Parse Meter data
//
int parse_meter(char *str)
{
	// Meter HI and LOW usage
	if (strstr(str, "1-0:1.8.1(" ) != NULL)  { strncpy(mtr.kw_hi_use, str+10, 10); start++; return(1); }
	if (strstr(str, "1-0:1.8.2(" ) != NULL)  { strncpy(mtr.kw_lo_use, str+10, 10); start++; return(1); }
	// Meter HI and Low return
	if (strstr(str, "1-0:2.8.1(" ) != NULL)  { strncpy(mtr.kw_hi_ret, str+10, 10); start++; return(1); }
	if (strstr(str, "1-0:2.8.2(" ) != NULL)  { strncpy(mtr.kw_lo_ret, str+10, 10); start++; return(1); }
	// Actual Electricty USE and RETurn
	if (strstr(str, "1-0:1.7.0(" ) != NULL)  { strncpy(mtr.kw_act_use, str+10, 6); start++; return(1); }
	if (strstr(str, "1-0:2.7.0(" ) != NULL)  { strncpy(mtr.kw_act_ret, str+10, 6); start++; return(1); }
	// Phase Split (We have 3 phases in the home)
	if (strstr(str, "1-0:21.7.0(" ) != NULL)  { strncpy(mtr.kw_ph1_use, str+11, 6); start++; return(1); }
	if (strstr(str, "1-0:41.7.0(" ) != NULL)  { strncpy(mtr.kw_ph2_use, str+11, 6); start++; return(1); }
	if (strstr(str, "1-0:61.7.0(" ) != NULL)  { strncpy(mtr.kw_ph3_use, str+11, 6); start++; return(1); }
	if (strstr(str, "1-0:22.7.0(" ) != NULL)  { strncpy(mtr.kw_ph1_ret, str+11, 6); start++; return(1); }
	if (strstr(str, "1-0:42.7.0(" ) != NULL)  { strncpy(mtr.kw_ph2_ret, str+11, 6); start++; return(1); }
	if (strstr(str, "1-0:62.7.0(" ) != NULL)  { strncpy(mtr.kw_ph3_ret, str+11, 6); start++; return(1); }
	// Natural Gas usage
	if (strstr(str, "0-1:24.2.1(" ) != NULL)  { strncpy(mtr.gas_use, str+26, 9); start++; return(1); }

	return(1);
}


// --------------------------------------------------------------------------------
// Set the Line attributes
//
int set_interface_attribs (int fd, int speed, int parity)
{
        struct termios tty;
        memset (&tty, 0, sizeof tty);
        if (tcgetattr (fd, &tty) != 0)
        {
                fprintf (stderr, "error %d from tcgetattr", errno);
                return -1;
        }

        cfsetospeed (&tty, speed);
        cfsetispeed (&tty, speed);

        // disable IGNBRK for mismatched speed tests; otherwise receive break
        // as \000 chars
		
        tty.c_iflag &= ~IGNBRK;         		// disable break processing
        tty.c_iflag &= ~(IXON | IXOFF | IXANY); // shut off xon/xoff ctrl                // no canonical processing
		
        tty.c_oflag = 0;                		// no remapping, no delays
		//tty.c_oflag &= ~(ONLCR | OCRNL);
		
        tty.c_cc[VMIN]  = 0;            		// read doesn't block
        tty.c_cc[VTIME] = 50;           		// 0.5 seconds read timeout
		
        // tty.c_cflag = (tty.c_cflag & ~CSIZE) | CS8;     // 8-bit chars
        // tty.c_cflag &= ~(PARENB | PARODD);      // shut off parity
        // tty.c_cflag |= parity;
        // tty.c_cflag &= ~CRTSCTS;
		
		tty.c_cflag |= (CLOCAL | CREAD);		// ignore modem controls, enable reading
		tty.c_cflag &= ~CSTOPB;					// No stop bits
		tty.c_cflag &= ~PARENB ;				// No parity
		tty.c_cflag &= ~CSIZE;
		tty.c_cflag |= CS8;						// 8 bits
		
		tty.c_lflag = 0;                		// no signaling chars, no echo,
		//tty.c_lflag &= ~ICANON ;

        if (tcsetattr (fd, TCSANOW, &tty) != 0)
        {
                fprintf(stderr,"error %d from tcsetattr", errno);
                return -1;
        }
        return 0;
}

// --------------------------------------------------------------------------------
// Set blocking attribute
// 
void set_blocking (int fd, int should_block)
{
        struct termios tty;
        memset (&tty, 0, sizeof tty);
        if (tcgetattr (fd, &tty) != 0)
        {
                fprintf(stderr,"error %d from tggetattr", errno);
                return;
        }

        tty.c_cc[VMIN]  = should_block ? 1 : 0;
        tty.c_cc[VTIME] = 110;            // 11 seconds read timeout

        if (tcsetattr (fd, TCSANOW, &tty) != 0)
                fprintf(stderr,"error %d setting term attributes", errno);
}

/*
 *********************************************************************************
 * p1_read
 *
 * Reading the sensor using the power method. Call the wait routine several times.
 * this method is more compute intensive than calling the interrupt routine.
 *
 *********************************************************************************
 */ 
int p1_read(char *p1_line, char *buf)  
{ 
	int n;
	char *p1, *p2;
	char buf2[1024];
	int fd = open (p1_line, O_RDWR | O_NOCTTY | O_SYNC);
	if (fd < 0)
	{
        fprintf(stderr,"error %d opening %s: %s", errno, p1_line, strerror (errno));
        return (-1);
	}
	set_interface_attribs (fd, B115200, 0);			// set speed to 115,200 bps, 8n1 (no parity)
	set_blocking (fd, 0);                			// set no blocking
	
	buf [0]=0;
	buf2[0]=0;
	while (( n = read (fd, buf, sizeof buf)) > 0) 	// read up to bufsize characters if ready to read
	{
		buf[n] = 0;									// Terminate the string
		p1 = buf;									// temporaty ptr
		
		// Is there a \n found in p1?
		while ((p2 = strchr(p1,'\n')) != NULL ) 	
		{	
			
			strncat(buf2, p1, (p2-p1));				// Concatenate only first part of buf into buf2
			if (strlen(buf2) > 0) 
			{
				if (verbose) printf("%s\n",buf2);	// XXX Process buf2
				if (buf2[0] == '/') {
					if (debug) printf("Found begin /\n");
					start = 1;						// begin init nr of variables we want
				}
				if ( start >=0) {
					parse_meter(buf2);				// As long as not all variables are found
				}
				if (buf2[0] == '!' ) {
					if (debug) printf("Found end !\n");

					close(fd);
					return(1);
				}
			}
			memset(buf2,0,sizeof(buf2));
			p1 = p2+1;
		}
		// Copy last part of the string
		strcat(buf2, p1);
		// buf[0]=0;
	}
	
	if (n==0) {
		fprintf(stderr, "No characters read\n");
	}
	
	close(fd);
	//
	return(1);
} 


/* ********************************************************************
 * MAIN PROGRAM
 *
 * Read the user option of the commandline and either print to stdout
 * or return the value over the socket. 
 *
 * ********************************************************************	*/  
int main(int argc, char **argv)  
{  
	int i,c;
	int errflg = 0;
	int repeats = 1;
	
	int mode = SOCK_DGRAM;					// Datagram is standard
	char *hostname = "255.255.255.255";		// Default setting for our host == this host
	char *port = UDPPORT;					// default port, 5000
	char *p1_line = "/dev/ttyUSB0";			// Optional: Device to read

	int seconds;							// The actual nr of seconds (from the current time)
	char snd_buf[1024];						// Buffer to send to LamPI-daemon

    extern char *optarg;
    extern int optind, optopt;

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	// Valid options are:
	// -h <hostname> ; hostname or IP address of the daemon
	// -p <port> ; Portnumber for daemon socket
	// -v ; Verbose, Give detailed messages
	//
    while ((c = getopt(argc, argv, ":c:dh:l:p:r:tv")) != -1) {
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
			case 'l':						// Line descriptor argument eg /dev/ttyUSB0
				p1_line = optarg;
			break;
			case 'p':						// Port number
            	port = optarg;
				dflg++;						// Need daemon flag too, (implied)
			break;
			case 'r':						// Nr of repeats
				repeats = atoi(optarg);
			break;
			case 't':						// Test Mode, do debugging
				debug=1;
			break;
			case 'v':						// Verbose, output long timing/bit strings
				verbose = 1;
			break;
			case ':':       				// -f or -o without operand
				fprintf(stderr,"Option -%c requires an operand\n", optopt);
				errflg++;
			break;
			case '?':
				fprintf(stderr, "Unrecognized option: -%c\n", optopt);
				errflg++;
			break;
        }
    }
	
	// -------------------- PRINT ERROR ---------------------------------------
	// Print error message if parsing the commandline was not successful
	
    if (errflg) {
        fprintf(stderr, "usage: argv[0] (options) \n\n");
		fprintf(stderr, "-d\t\t; Daemon mode. Codes received will be sent to another host at port 5000\n");
		fprintf(stderr, "-l [line]\t\t; Line descriptor. Standard is /dev/ttyUSB0\n");
		fprintf(stderr, "-t\t\t; Test mode, will output received codes from sensors, even if in error\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
        exit (2);
    }
	

	//	------------------ PRINTING Parameters ------------------------------
	//
	if (verbose == 1) {
		printf("The following options have been set:\n\n");
		printf("-v\t; Verbose option\n");
		if (dflg>0)			printf("-d\t; Daemon option\n");
		if (debug)			printf("-t\t; Test and Debug option");
		printf("\n");						 
	}//if verbose

	
	// ------------------------
	// MAIN LOOP
	// 

	if (verbose) printf("\nRepeats: %d::\n",repeats);
	for (i=0; i<repeats; i++)  
	{
		char buf[512];
		if (p1_read(p1_line, snd_buf) < 0) {
			fprintf(stderr,"ERROR, unable to read sensor");
			continue;
		}
		
		if (dflg) {
			char t[20];
						
			// If we are in daemon mode, initialize sockets etc.
			if ((sockfd = socket_open(hostname, port, mode)) == -1) {
				fprintf(stderr,"socket_open failed\n");
				exit(1);
			}
			
			print_meter(buf, mtr, dflg);				// Print meter data in the buf var			
			seconds = get_time(t);
			
			sprintf(snd_buf, "{\"tcnt\":\"%d\",\"action\":\"energy\",\"brand\":\"e350\",\"type\":\"json\",\"address\":\"%s\",\"channel\":\"%d\",%s}", 
					seconds,							// Nr of seconds as a message reference
					"083867",							// address
					0,									// channel
					buf);								// Actual meter data
											
			buf_2_server(sockfd, hostname, port, snd_buf, mode);
			printf("%s Sent to host: %s:%s, sensor: %s\n", t, hostname, port, "e350");
		}
		else {
			// If in command mode
			print_meter(buf, mtr, dflg);			// In command mode, do pretty print
			printf("Results: \n%s", buf);
		}

	} // for
	delay(1000);
	
	// Close the socket to the daemon
	if (close(sockfd) == -1) {
		perror("Error closing socket to daemon");
	}
	// Should wait for confirmation of the daemon before closing
	
	exit(EXIT_SUCCESS); 
}  

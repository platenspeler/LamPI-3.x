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

#include "cJSON.h"
#include "sensor.h"


/* ----------------------------------------------------------------
 * The DS18B20 is a cheap yet powerful temperature sensor.
 * It works over the 1-wire Dallas bus
 * The Raspberry provides module support for the Dallas/Maxim bus
 * Make sure you load the w1-gpio and w1-therm modules.
 * > sudo modprobe w1-therm
 * > sodu modprobe w1-gpio
 * By reading the approrpiate device entry w1_slave the module will
 * return the sensor value
 *
 * ----------------------------------------------------------------	*/

// Declaration for Statistics
int statistics [I_MAX_ROWS][I_MAX_COLS];

// Declarations for Sockets
int sockfd;	
fd_set fds;
int socktcnt = 0;

// Options flags
static int dflg = 1;							// Daemon
static int cflg = 0;							// Check
int verbose = 0;
int debug = 0;
int checks = 0;									// Number of checks on messages



/* ********************************************************************
 * MAIN PROGRAM
 *
 * Read the user option of the commandline and either print to stdout
 * or return the value over the socket. 
 *
 * ********************************************************************	*/  
int main(int argc, char **argv)  
{  
	int i, c;
	int errflg = 0;
	int repeats = 1;											// Especially when using UDP messaging send more than one time
	
	int mode = SOCK_DGRAM;										// Datagram is standard
	char *port = UDPPORT;										// default port, 5000
	
	char *hostname = "255.255.255.255";							// Default setting for our host == this host
	char *snd_buf = "{\"tcnt\":\"0\",\"type\":\"raw\",\"action\":\"ping\"}";		// jSon Buffer to send to LamPI-daemon
	int seconds;												// The actual nr of seconds (from the current time)
	
    extern char *optarg;
    extern int optind, optopt;

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	// Valid options are:
	// -h <hostname> ; hostname or IP address of the daemon
	// -p <port> ; Portnumber for daemon socket
	// -v ; Verbose, Give detailed messages
	// -b <buffer> ; specify the json buffer
	//
    while ((c = getopt(argc, argv, ":b:c:h:p:r:tsv")) != -1) {
        switch(c) {
			case 'b':						// Buffer (mandatory) if not it will be a ping
				snd_buf = optarg;
			break;
			case 'c':
				cflg = 1;					// Checks
				checks = atoi(optarg);
			break;
			case 'h':						// Socket communication
           		dflg++;						// Need daemon flag too, (implied)
				hostname = optarg;
			break;
			case 'p':						// Port number
            	port = optarg;
				dflg++;						// Need daemon flag too, (implied)
			break;
			case 'r':						// repeats
				repeats = atoi(optarg);
			break;
			case 's':						// SOCK_STREAM mode
				mode=SOCK_STREAM;
				if (0 == strcmp(port,UDPPORT)) port=PORT;
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
		fprintf(stderr, "-d\t\t; Daemon mode. Codes received will be sent to another host at port <port>\n");
		fprintf(stderr, "-t\t\t; Test mode, will output received codes from sensors, even if in error\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
		fprintf(stderr, "-h <host>\t; hostname or IP address \n");
		fprintf(stderr, "-p <port>\t; port number, 5000 for TCP and 5001 for UDP \n");
		fprintf(stderr, "-b <buffer>\t; Daemon mode. Codes received will be sent to another host at port <port>\n");
        exit (2);
    }
	

	//	------------------ PRINTING Parameters ------------------------------
	//
	if (verbose == 1) {
		printf("The following options have been set:\n\n");
							printf("-v\t; Verbose option\n");
		if (dflg>0)			printf("-d\t; Daemon option\n");
		if (debug)			printf("-t\t; Test and Debug option\n");
		printf("-h\t; host: %s\n",hostname);
		printf("-p\t; port: %s\n",port);
		if (mode == SOCK_DGRAM) printf("  \t; mode: SOCK_DGRAM\n");
					else		printf("-s\t; mode: SOCK_STREAM\n");
		printf("-b\t; buffer: %s\n",snd_buf);
		printf("\n");						 
	}//if verbose


	// ------------------- MAIN LOOP ----------------------------------------	
	// MAIN LOOP
	// 
	delay(1000);											// Wait some time so that not every sensor fires ate same time
	
	if (verbose) printf("\nRepeats: %d::\n",repeats);
	for (i=0; i<repeats; i++)  
	{					
		if (dflg) {
			char t[20];
						
			// If we are in daemon mode, initialize sockets etc.
			if ((sockfd = socket_open(hostname, port, mode)) == -1) {
				fprintf(stderr,"socket_open failed\n");
				exit(1);
			}
						
			seconds = get_time(t);
														
			buf_2_server(sockfd, hostname, port, snd_buf, mode);
			if (verbose) printf("%s Sent to host: %s:%s, json: %s\n", t, hostname, port, snd_buf);
		}
		else {
			// Commandline
  			/* could not open directory */
 			// perror ("No such directory ");
			// return EXIT_FAILURE;
	
		} //dflg
		
		delay(100);
	}//for
	
	// Close the socket to the daemon
	if (close(sockfd) == -1) {
		perror("Error closing socket to daemon");
	}
	// Should wait for confirmation of the daemon before closing
	
	exit(EXIT_SUCCESS); 
}  

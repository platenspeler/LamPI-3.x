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
#include <dirent.h>

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
static int dflg = 0;							// Daemon
static int cflg = 0;							// Check
int verbose = 0;
int debug = 0;
int checks = 0;									// Number of checks on messages


/*
 *********************************************************************************
 * ds18b20_read
 *
 * Reading the sensor using the power method. Call the wait routine several times.
 * this method is more compute intensive than calling the interrupt routine.
 *
 *********************************************************************************
 */ 
int ds18b20_read(char *dir)  
{  
	char dev[192];
	char line[192];
	FILE *fp;
	int temperature;
	char * tpos = NULL;
	char * crcpos = NULL;
	//int cntr = 0;

	strcpy(dev,SPATH);
	strcat(dev,"/");
	strcat(dev,dir);
	strcat(dev,"/w1_slave");
	
	if (verbose) printf("dev: %s\n",dev);
	
	if (NULL == (fp = fopen(dev,"r") )) {
		fprintf(stderr,"ds18w20 error:: error for device: %s\n",dev);
		perror("Error opening device");
		return(-1);
	}
	
	while (fgets(line, 128, fp) != NULL )
	{
		if (verbose) fprintf(stderr,"read line: %s", line);
		
		// Before we read a temperature, first check the crc which is in a
		// line before the actual temperature line
		if (crcpos == NULL) {
			crcpos = strstr(line, "crc=");
			if ((crcpos != NULL) && (strstr(crcpos,"YES") == NULL)) {
				// CRC error
				crcpos = NULL;
				if (verbose) fprintf(stderr,"crc error for device %s\n" , dev);
				return(-1);
			}
		}
		
		// If we have a valid crc check on a line, next line will contain valid temperature
		else {
			if (verbose) printf("crc read correctly\n");
			tpos = strstr(line, "t=");
			// Will only be true for 2nd line
			if (tpos != NULL) {
				tpos +=2;
				sscanf(tpos, "%d", &temperature);
			}
			if (verbose) fprintf(stderr,"temp read: %d\n\n",temperature);
		}
	}
	
	fclose(fp);
	//
	
	return(temperature);
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
	int temp = 0;
	int mode = SOCK_DGRAM;					// Datagram is standard
	char *hostname = "255.255.255.255";		// Default setting for our host == this host
	char *port = UDPPORT;					// default port, 5000
	char snd_buf[256];						// Buffer to send to LamPI-daemon
	int seconds;							// The actual nr of seconds (from the current time)
	
    extern char *optarg;
    extern int optind, optopt;

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	// Valid options are:
	// -h <hostname> ; hostname or IP address of the daemon
	// -p <port> ; Portnumber for daemon socket
	// -v ; Verbose, Give detailed messages
	//
    while ((c = getopt(argc, argv, ":c:dh:p:r:tv")) != -1) {
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
			case 'p':						// Port number
            	port = optarg;
				dflg++;						// Need daemon flag too, (implied)
			break;
			case 'r':						// repeats
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
	//
    if (errflg) {
        fprintf(stderr, "usage: argv[0] (options) \n\n");
		fprintf(stderr, "-d\t\t; Daemon mode. Codes received will be sent to another host at port 5000\n");
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
	
	chdir (SPATH);
	
	// ------------------------
	// MAIN LOOP
	// 

	delay(1000);										// Wait some time so that not every sensor fires ate same time
	
	if (verbose) printf("\nRepeats: %d::\n",repeats);
	for (i=0; i<repeats; i++)  
	{  
		// For every directory found in SPATH
		DIR *dir;
		struct dirent *ent;
		char str_temp[32];
		
		if ((dir = opendir (SPATH)) != NULL) {
			/* print all the files and directories within directory */
			while ((ent = readdir (dir)) != NULL) {
			
				if (verbose) printf("%s\n", ent->d_name);
				
				if (strncmp(ent->d_name,"28",2) == 0)		// found 28 as the prefix for ds18b20 devices
				{
					temp = ds18b20_read(ent->d_name);
					if (temp == -1) {
						// Error
						fprintf(stderr,"ds18b20 error: No temperature returned for %s\n",ent->d_name );
					}
					else {
						sprintf(str_temp,"%3.1f",(float) temp/1000);
						if (dflg) {
							char t[20];
						
							// If we are in daemon mode, initialize sockets etc.
							if ((sockfd = socket_open(hostname, port, mode)) == -1) {
								fprintf(stderr,"socket_open failed\n");
								exit(1);
							}
							seconds = get_time(t);
							sprintf(snd_buf, "{\"tcnt\":\"%d\",\"action\":\"sensor\",\"brand\":\"ds18b20\",\"type\":\"json\",\"address\":\"%s\",\"channel\":\"%u\",\"temperature\":\"%s\"}", 
							seconds,							// Nr of seconds as a message reference
							ent->d_name,						// address
							0,									// channel
							str_temp);							// temperature
											
							buf_2_server(sockfd, hostname, port, snd_buf, mode);
							printf("%s Sent to host: %s:%s, sensor: %s, temp: %s\n", t, hostname, port, ent->d_name, str_temp);
						}
						else {
						// Commandline
							if (temp > 0) {
								printf("Temperature for dev %s: %s\n", ent->d_name, str_temp);
							}
							else {
								temp = -temp;
								printf("Temperature for dev %s: -%d.%d\n",
												ent->d_name, temp/1000,temp%1000);
							}
						}//dflg
					}//temp>0
					delay(500);									// Only wait when we read a sensor (and not other inodes)
				}
				else {
					// Use this if there are another Dallas sensors than the ds18b20
					// which is highly unlikely (there are no others)
					// But . .. w1_bus_master1 are there also
					//
					if (verbose) fprintf(stderr,"ds18w20:: Number is not 28 but: %s\n",ent->d_name);
				}
			}
			closedir (dir);
		}// open_dir
		else {
  			/* could not open directory */
 			 perror ("No such directory ");
			return EXIT_FAILURE;
		}
		delay(1000);
	}
	delay(1000);
	
	// Close the socket to the daemon
	if (close(sockfd) == -1) {
		perror("Error closing socket to daemon");
	}
	// Should wait for confirmation of the daemon before closing
	
	exit(EXIT_SUCCESS); 
}  

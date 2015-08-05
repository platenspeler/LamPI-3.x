 /* **************************************************************************************
 * LamPI-arduino.c Sniffer program for the LamPI project
 * 
 *   Copyright (c) 2013,2014 Maarten Westenberg, mw12554@hotmail.com 
 * 
 *  This software is licensed under GNU license as detailed in the root directory
 *  of this distribution and on http://www.gnu.org/licenses/gpl.txt
 
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 *
 *    You should have received a copy of the GNU  General Public License
 *    along with LamPI.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Program to read klikaanklikuit receivers (and to test receiver codes)
 * The program is part of the LamPI daemon code and
 * received remote codes will be transmitted to a receiving socket of the 
 * LamPI-node daemon or in test mode be printed on the terminal.
 *
 * How to test:
 *
 * The following command will loop forever (takes 100% cpu) waiting
 * for completed messages by the interrup handler and then show the 
 * result:
 * 	> sudo ./LamPI-arduino  -v -d -h <remote_IP>  // -d is for debug, -v for verbose
 *
 * 
 ***********************************************************************************************
*/

#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include <netdb.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <wiringPi.h>

#include "cJSON.h"
#include "LamPI-arduino.h"

// Declarations for Sockets
int sockfd;										// Socket Descripor
fd_set fds;										// File descriptors

// Declaration of USB port
#define USBPORT /dev/ttyUSB0
int ttyfd;

// Init timing values
struct timeval timeout;	
unsigned int timestamp = 0;
unsigned int sock_stamp;						// Timestamp of last socket send call
int socktcnt = 0;								// Message counter, used in sockets and in reporting
	
static volatile int stop_ints = 0;				// Stop Interrupts. If set, do not do any processing in interrupt time
static volatile int duration = 0;				// actual duration of this edge interrupt since the previous edge

int cflg = 0;									// Check
int sflg = 0;									// If set, gather statistics
int checks = 0;									// Number of checks on messages	
int verbose = 0;
int debug = 0;									// Global var, used in all scanner functions

char snd_buf[255];


// ----------------------------------------------------------------------------------	
// 	look up the time and put in a buffer
//
int time2buf(char * buf) {
    time_t timer;
    struct tm* tm_info;

    time(&timer);
    tm_info = localtime(&timer);

    strftime(buf, 26, "%Y:%m:%d %H:%M:%S", tm_info);
	return(0);
}



// ---------------------------------------------------------------------------------
// Check the messages, write them to the socket
// And make sure we do not send every single message
//
int write_socket(int sockfd, char *snd_buf)
{
	if (write(sockfd, snd_buf, strlen(snd_buf)) == -1) {
				fprintf(stderr,"socket write error\n");
	}

	if (verbose) printf("Buffer sent to daemon: %s\n",snd_buf);
	return(0);
}



// ---------------------------------------------------------------------------------
// Get In Addr
// 
// get sockaddr, IPv4 or IPv6: These new way of dealing with sockets in Linux/C 
// makes use of structs.
//
void *get_in_addr(struct sockaddr *sa)
{
    if (sa->sa_family == AF_INET) {
        return &(((struct sockaddr_in*)sa)->sin_addr);
    }
    return &(((struct sockaddr_in6*)sa)->sin6_addr);
}

// ---------------------------------------------------------------------------------
// Open Socket
// The socket is used both by the sniffer and the transmitter program.
// Standard communication is on port 5000 over websockets.
//

int open_socket(char *host, char *port) {

	int sockfd;  
    struct addrinfo hints, *servinfo, *p;
    int rv;
    char s[INET6_ADDRSTRLEN];

    memset(&hints, 0, sizeof hints);
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    if ((rv = getaddrinfo(host, port, &hints, &servinfo)) != 0) {
        fprintf(stderr, "open_socket:: ERROR getaddrinfo: %s %s\n", host, gai_strerror(rv));
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
			fprintf(stderr,"open_socket:: ERROR Address: %s, ", (char *) p->ai_addr);
            perror("open_socket:: connect");
            continue;
        }
        break;
    }

    if (p == NULL) {
        fprintf(stderr, "open_scoekt:: failed to connect\n");
        return -1;
    }

    inet_ntop(p->ai_family, get_in_addr((struct sockaddr *)p->ai_addr), s, sizeof s);
    if (verbose) printf("client: connecting to %s\n", s);

    freeaddrinfo(servinfo); // all done with this structure
	return(sockfd);
}


// ----------------------------------------------------------------------------------
//
// Universal transmit for well known transmitter. 
// In arduinoXmit we check whether the tramsnitter value is a well-known device in the 
// /home/pi/exe directory.
//
// XXX We really need to figure out the -p (outpin) for wiringPi value
//
int send2device(int ttyfd, int dev, char *gaddr, char *uaddr, char *val)
{
	int ret;
	char arduinoBuf[255];
	
	// Match the GUI values 1-32 for the dimmer to the device
	// values of 0-15
	if (strcmp(val,"on")==0)  
		sprintf(arduinoBuf,"> %d 1 %d %s %s on\n", socktcnt, dev, gaddr,uaddr);
	else if (strcmp(val,"off") ==0 ) 
		sprintf(arduinoBuf,"> %d 1 %d %s %s 0\n", socktcnt, dev, gaddr,uaddr);
	else if (strcmp(val,"0") == 0) 
		sprintf(arduinoBuf,"> %d 1 %d %s %s 0\n", socktcnt, dev, gaddr,uaddr);
	else {
		int ivalue= (int) ( (atoi(val)-1)/2 );
		sprintf(arduinoBuf,"> %d 1 %d %s %s %d\n", socktcnt, dev, gaddr, uaddr, ivalue);
	}
	if (debug >=1) fprintf(stderr,"send2device:: %d: \(%s\)\n",strlen(arduinoBuf), arduinoBuf);
	ret = write(ttyfd, arduinoBuf, strlen(arduinoBuf));
	if (ret == -1) fprintf(stderr,"dkaku:: ERROR transmit failed\n");
	socktcnt++;
	return(0);
}


// ----------------------------------------------------------------------------------
// Transmit a value to a device (over the air) using either a shell
// command directly.
// NOTE:: The command is called with the json arguments gaddr,uaddr and
//        not with the GUI addresses
// The value 'Val' is between 0 and 31.
//
int arduinoXmit(int ttyfd, char *brand, char *gaddr, char *uaddr, char *val) 
{
	// Correct the unit code for action, old Kaku and Elro, that range from A-P 
	// The device specific executable uses unit addresses starting from 1 to n
	// And for Blokker that starts with 0, is corrected in the exe code.
	//
	if (strcmp(brand,"kaku") ==0)     { send2device(ttyfd, 0, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"action") ==0)   { send2device(ttyfd, 1, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"livolo") ==0)   { send2device(ttyfd, 2, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"elro") ==0)     { send2device(ttyfd, 3, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"blokker") ==0)  { send2device(ttyfd, 4, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"kiku") ==0)     { send2device(ttyfd, 5, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"kopou") ==0)    { send2device(ttyfd, 6, gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"zwave") ==0)    { if (verbose == 1) printf("arduinoXmit:: brand is zwave\n"); fflush(stdout); return(0); }
	
	fprintf(stderr,"arduinoXmit:: brand not recognized %s\n", brand);
	return(-1);
};

// -------------------------------------------------------------------------------
//
// Read a socket and send a 433MHz message 
//
// In daemon mode, the interrupt handler will itself post completed messages
// to the main LamPI-daemon php program. In order to not spend too much wait time 
// in the main program, we can either sleep or (which is better) listen to the 
// LamPI-daemon process for incoming messages to be sent to the transmitter.
//
int read_socket_and_transmit(int sockfd, int ttyfd)
{
 	int rc;	
	char *jgaddr;	// Group address
	char *juaddr;
	char *jbrand;
	char *jval;
	char *action;
	char buf[MAXDATASIZE];							// For sending and receiving socket messages
	char *ptr1, *ptr2;
				
	rc = read(sockfd, buf, MAXDATASIZE); 
	if (rc == 0) {
		// Read error, break and establish new connection if necessary
		// If we break, we will automatically do a PING to check
		if (verbose == 1) printf("read_socket_and_transmit:: read no data\n");
		//close(sockfd);
		return(-1);
	}
		else if (rc == -1) {
		perror("read_socket_and_transmit.c:: Error reading socket");
		return(-1);
	}
			
	buf[rc]=0;									// Terminate a string
	if (verbose) printf("\n------------------------------------------------\n");
	if (verbose) printf("Socket read:: <%s>\n",buf);
			
	ptr1 = buf;	
	cJSON *root;
			 
	for (;;)
	{
		// ptr contains end pos of parsed buf		
		root = cJSON_ParseWithOpts((const char*) ptr1,(const char **)&ptr2,0);		
		if (root == 0) {
			fprintf(stderr,"read_socket_and_transmit:: read: cJSON_ParseWithOps returned error, Buf: %s\n", ptr1);
					
			// If the parsing failed, it COULD be that we did miss part of the message
			// we can read another message and concatenate it to the end of this message
			// However, more likely that we receive a non-JSON message. So discard the message for the moment
				
			cJSON_Delete(root);
			break;
		}
				
		// First parse the action field (which MUST be present in Json message
		// The action field will be used to implement a "switch" below
				
		action = parse_cjson(root, "action");		// My add-on parsing function 
		if (action == NULL)
		{
			printf("parse_cjson action returned NULL \n"); 
			goto next;
		}
				
		// If we receive and ACK message as a response from the daemon that our
		// message was received correctly => Ignore OK messages for the receiver (oh oh)
		if  (strcmp(action,"ack") == 0) { 
			goto next; 
		}		
				
		// We receive a message for the transmitter
		if  ((strcmp(action,"gui") == 0) || (strcmp(action,"upd") == 0)) 
		{
			// Parse for brand and other parameters of the transmitter
			jbrand = parse_cjson(root, "cmd");		// My add-on parsing function 
			if (jbrand == NULL) { fprintf(stderr, "parse_cjson jbrand returned NULL \n"); goto next; }
				
			jgaddr = parse_cjson(root, "gaddr");
			if (jgaddr == NULL) { fprintf(stderr, "parse_cjson gaddr returned NULL \n"); goto next; }
				
			juaddr = parse_cjson(root, "uaddr");
			if (juaddr == NULL) { fprintf(stderr, "parse_cjson uaddr returned NULL \n"); goto next; }
				
			jval = parse_cjson(root, "val");
			if (jval == NULL) {	fprintf(stderr, "parse_cjson val returned NULL \n"); goto next; }
				
			//if (debug >= 1) printf("Json:: gaddr: %s, uaddr: %s, val: %s\n",jgaddr, juaddr, jval);
		
			// Now transmit the command to a device using function transmit
			// 
			if (arduinoXmit(ttyfd, jbrand, jgaddr, juaddr, jval) == -1)
			{
				fprintf(stderr,"arduinoXmit: returned error \n");
				cJSON_Delete(root);
				goto next;
			}
		}
				
		// If we receive a weather notification (a broadcast), ignore
		if  (strcmp(action,"weather") == 0) { 
			if (debug >= 2) printf("parse_cjson:: weather message received. DISCARD\n");
			goto next; 
		}
		// If we receive a sensor notification (a broadcast), ignore
		if  (strcmp(action,"sensor") == 0) { 
			if (debug >=2) printf("parse_cjson:: sensor message received. DISCARD\n");
			goto next; 
		}		
		// If we receive a energy notification (a broadcast), ignore
		if  (strcmp(action,"energy") == 0) { 
			if (debug >= 2) fprintf(stderr,"parse_cjson:: energy message received. DISCARD\n");
			goto next; 
		}
				
next:
		cJSON_Delete(root);
				
		// We know now that we parsed a JSON message. If there are more JSON messages
		// in the buffer, we will have to parse them as well. So move the pointers in buf
		// and loop again.
			
		if ((ptr2 - buf) < rc) {
			if (verbose) printf("read_socket_and_transmit:: Unparsed data in buf: %d chars, first char: %c\n",(buf+rc-ptr2), *ptr2);
				ptr1 = ptr2;
				ptr2 = NULL;
			}
		else {
			break;
		}
				
	}//for	

	// Is the socket still alive? XXX we should not always do this once we are here,
	// but only once in every 60 seconds or so ....	
	if ((millis() - timestamp) > MILLIWAIT)			// compare time and do every 60 seconds
	{
		timestamp = millis();
		if (verbose == 1) printf("sending PING to socket\n");		
		sprintf(buf,"{\"tcnt\":\"%d\",\"action\":\"ping\",\"type\":\"json\"}", 
						socktcnt%1000);
		socktcnt++;
		if (write(sockfd, buf, strlen(buf)) == -1) {
			perror("transmitter.c:: Error writing to socket\n");
			close(sockfd);
			return(-2);								// code not connected
		}
	}
	
	return(1);
 }




//  --------------------------------------------------------------------------------
// Parse the json array of values. NOTE: complex json arrays are not supported! 
// Only one-level (flat) key->value arrays
// The return value is a string, as all my PHP json-encoded values are strings anyway!
// Therefore it is safe to assume that the we need to look in the array of children
// from the original root cJSON node
//
char * parse_cjson( cJSON * ptr, char * pattern )
{
	cJSON *child;
	if (ptr == NULL) {
		printf("parse_cjson:: Ptr is NULL\n");
		return NULL;
	}
	if (ptr->child == NULL) {
		printf("parse_cjson:: Child is NULL\n");
		return NULL;
	}
	child = ptr->child;
	
	while (child->next != NULL)
	{
		if ( (child->type == cJSON_String) &&
			 (strcmp(child->string, pattern)==0) )
		{
			return(child->valuestring);
		}
		child = child->next;
	}
	return(NULL);
}

// ---------------------------------------------------------------------------------
// SOCKET INIT
// In daemon mode, the interrupt handler will itself post completed messages
// In order to not spend too much wait time 
// in the main program, we can either sleep or (which is better) listen to the 
// LamPI-daemoan process for incoming messages to be sent to the transmitter.
//
 
int socket_init(char *hostname, char* port) 
{
	int sockfd;
	// ---------------- FOR DAEMON USE, OPEN SOCKETS -------------------------------
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
	
	// The command below is sort of initialization command to put the sender in 
	// a known state. Without it, there might be a problem when more than one Raspberry is
	// used for transmitting on the network. Unitialized it will apparently send noise ...
	// XXX Maybe just pulling the transmitter pin to 0 will work as well :-)

	return(sockfd);
}

// --------------------------------------------------------------------------------
// Parse a few well-known protocols
//
char * parse_remote(char *tok, int cod)
{
  int group;
  int unit;
  int level;

  tok = strtok(NULL, " ,"); group = atoi(tok);
  tok = strtok(NULL, " ,"); unit  = atoi(tok);
  tok = strtok(NULL, " ,"); level = atoi(tok);
  
  // Remotes do not do dimlevel, but if necessary we can ...
  // XXX Trick: if there is no integer function atoi() returns 0
  if (level > 0) {
	if (verbose) printf("parse_remote:: Address: %d, Unit: %d, Level: %d\n",group,unit,level);
	sprintf(snd_buf, "{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dFdP%d\"}", 
			socktcnt%1000,group,unit,level);
  }
  else {
  	if (strncmp(tok,"on",2) == 0) { level = 1; };		// third char will be "\r"
	if (verbose) printf("parse_remote:: Address: %d, Unit: %d, Level: %d\n",group,unit,level);
		sprintf(snd_buf, "{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dF%d\"}", 
			socktcnt%1000,group,unit,level);
  }
  socktcnt++;
  return(snd_buf);
}

// --------------------------------------------------------------------------------
// Parse sensor code
//
char * parse_sensor(char *tok, int cod)
{
  int address;
  int channel;
  int temperature;
  int humidity;

  tok = strtok(NULL, " ,"); address = atoi(tok);
  tok = strtok(NULL, " ,"); channel  = atoi(tok);
  tok = strtok(NULL, " ,"); temperature = atoi(tok);
  tok = strtok(NULL, " ,"); humidity = atoi(tok);
  
  temperature = (temperature - 6400) * 10 / 128;
  
  sprintf(snd_buf, 
"{\"tcnt\":\"%d\",\"action\":\"sensor\",\"brand\":\"wt440h\",\"type\":\"json\",\"address\":\"%d\",\"channel\":\"%d\",\"temperature\":\"%d.%d\",\"humidity\":\"%d\"}", 
		socktcnt%1000,address,channel,temperature/10,temperature%10,humidity);
		
  socktcnt++;
  return(snd_buf);
}

// --------------------------------------------------------------------------------
// Parse the incoming USB text message and take action
// Example: 
// "< 357 2 0 100 1 10"
// Incoming command (2) kaku (0) message nr 357 on group 100, unit 1, value 10
//
char * parse_tty(char *inp) 
{
  char *ptr;
  char *res = NULL;
  int cnt; int cmd; int cod;
  inp++;											// Move over the '<' char
  ptr = strtok(inp, " ,");  cnt = atoi(ptr);
  ptr = strtok(NULL, " ,"); cmd = atoi(ptr);
  switch (cmd) {
  	case 0:
		fprintf(stderr,"parse_tty %d:: Incoming admin message (not used)\n",cnt);
		
	break;
	case 1:
		fprintf(stderr,"parse_tty %d:: Incoming confirm message\n",cnt);
		
	break;
	case 2:
		ptr = strtok(NULL, " ,"); cod = atoi(ptr);
		if (debug >= 1) { printf("parse_tty %d:: Incoming message codec %i\n",cnt, cod); fflush(stdout); }
		res = parse_remote(ptr, cod);
	break;
	case 3:
		ptr = strtok(NULL, " ,"); cod = atoi(ptr);
		printf("parse_tty %d:: Incoming sensor message\n", cnt);
		res = parse_sensor(ptr, cod);
	break;
	default:
		fprintf(stderr,"parse_tty %d:: Unknown command %d\n", cnt, cmd);
  }
  return(res);
}


// --------------------------------------------------------------------------------
// TTY SETTING
//
int set_interface_attribs (int fd, int speed, int parity)
{
        struct termios tty;
        memset (&tty, 0, sizeof tty);
        if (tcgetattr (fd, &tty) != 0)
        {
                fprintf (stderr,"error %d from tcgetattr", errno);
                return -1;
        }

        cfsetospeed (&tty, speed);
        cfsetispeed (&tty, speed);

        tty.c_cflag = (tty.c_cflag & ~CSIZE) | CS8;     // 8-bit chars
        // disable IGNBRK for mismatched speed tests; otherwise receive break
        // as \000 chars
        tty.c_iflag &= ~IGNBRK;         // disable break processing
        tty.c_lflag = ICANON;           // no signaling chars, no echo,
                                        // XXX normally no canonical processing
        tty.c_oflag = 0;                // no remapping, no delays
        tty.c_cc[VMIN]  = 0;            // read doesn't block
        tty.c_cc[VTIME] = 5;            // 0.5 seconds read timeout

        tty.c_iflag &= ~(IXON | IXOFF | IXANY); // shut off xon/xoff ctrl

        tty.c_cflag |= (CLOCAL | CREAD);// ignore modem controls,
                                        // enable reading
        tty.c_cflag &= ~(PARENB | PARODD);      // shut off parity
        tty.c_cflag |= parity;
        tty.c_cflag &= ~CSTOPB;
        tty.c_cflag &= ~CRTSCTS;

        if (tcsetattr (fd, TCSANOW, &tty) != 0)
        {
                fprintf (stderr,"error %d from tcsetattr\n", errno);
                return -1;
        }
        return 0;
}

// --------------------------------------------------------------------------------
// INIT TTY COMMUNICATION
//

int tty_init(char * portname) 
{
  int fd;
  fd = open(portname, O_RDWR| O_NOCTTY | O_SYNC);
  if (fd < 0)
  {
        fprintf(stderr,"\nERROR %d opening %s: %s\n", errno, portname, strerror (errno));
        exit(1);
  }
  set_interface_attribs (fd, B115200, 0);
  write (fd, "100 1 10\n", 9);
  usleep(2000);
  write (fd, "100 1 0\n", 8);
  fprintf(stderr,"tty_init:: Done\n");
  return(fd);
}

/*
 *********************************************************************************
 * main Program
 * The main program should ideally do not much more than collect the commandline
 * arguments, connect the interrupt handler and start sleeping (to save cpu cycles).
 *********************************************************************************
 */

int main (int argc, char **argv)
{										
	int i, c;								// counters
	int errflg = 0;							// If set, there is a commandline parsing error

	char *hostname = "localhost";			// Default setting for our host == this host
	char *port = PORT;						// default port, 5000
	char *tty = "/dev/ttyUSB0";

    extern char *optarg;
    extern int optind, optopt;
	
	char ttyInput[4096];

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	//
    while ((c = getopt(argc, argv, ":123ac:dh:p:stvx")) != -1) {
        switch(c) {
		case 'c': checks = atoi(optarg); cflg = 1; break;	// Checks
		case 'd': debug = 1; break;							// Debug mode
		case 'h': hostname = optarg; break; 		// Socket communication
		case 'p': port = optarg; break; 			// Port number
		case 's': sflg = 1; break;					// Do Statistics
		case 't': tty = optarg; break;				// tty port setting manual
		case 'v': verbose = 1; break; 				// Verbose, output long timing/bit strings
		case ':':       							// -f or -o without operand
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
		fprintf(stderr, "-d\t\t; Debug mode. \n");
		fprintf(stderr, "-s\t\t; Statistics, will gather statistics from remote\n");
		fprintf(stderr, "-t value\t; Tty setting mode\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
		fprintf(stderr, "-c value\t; Check, will chick received codes <value> times before sending to daemon\n");
		fprintf(stderr, "\n\nOther settings:\n");
		fprintf(stderr, "-l value\t; Low Pass, number of uSec at minimum that is needed to count as a edge/bit change\n");

		fprintf(stderr, "\n\nObsolete settings, not doing any action:\n");
        exit (2);
    }
	
	// ------------------ SETUP WIRINGPI --------------------------------------------
	// Now start with setup wiringPI
	//wiringPiSetup();
	//pri =  piHiPri(40); if (pri <0) { perror("No receiver priority setting"); exit(1); }

	// ------------------ VERBOSE PRINT --------------------------------------------
	if (verbose == 1) {
		printf("The following options have been set:\n\n");
		printf("-v\t; Verbose option\n");
		if (sflg>0)		printf("-s\t; Statistics option\n");
		if (debug>0)	printf("-d\t; Debug option\n");
		printf("\n");		 
	}
	
	// ------------------ SOCKETS INIT ------------------------------
	sockfd = socket_init(hostname, port);
	
	// ------------------- TTY INIT ----------------------------------
	ttyfd = tty_init(tty);
	
	// ------------------ STATISTICS INIT ------------------------------
	if (sflg) {
		fprintf(stderr,"init statistics XXX\n");
	}

	// -------------------- START THE MAIN LOOP OF THE PROGRAM ------------------------
	// LOOP Forever. for testing purposes (only) not delay, for daemon mode wait every second
	
	if (debug >=1) fprintf(stderr,"main debug:: sockfd: %d, ttyfd: %d\n", sockfd, ttyfd);
	
	for (;;)
	{
	  char * buf;
	  int rc;
	  int ret;
	  int reads = 0;
	  // begin with select and see whether we have work to do
	  //
	  FD_ZERO(&fds);
	  FD_SET(ttyfd, &fds);
	  FD_SET(sockfd, &fds);

	  timeout.tv_usec= USLEEP;
	  timeout.tv_sec = SLEEP;
			
	  // Check for incoming socket messages. As longs as there is a message, read it, process it
	  // If there are no fds ready, function returns 0, and we restart the loop
		
	  //while ((rc = select(sockfd+1, &fds, NULL, NULL, &timeout)) > 0) {
	  while ((rc = select(6, &fds, NULL, NULL, &timeout)) > 0) {
	  
		if (FD_ISSET(ttyfd,  &fds)) {
			if ((ret = read(ttyfd, ttyInput, 1024)) >0 ) {
				ttyInput[ret] = '\0';						// Including "\n", maybe use ret-1

				// Now do something with that info!
				if (ttyInput[0] == '!' ) {						// Incoming comments text
					// rest of message is debug
					int i;
					fprintf(stderr,"main:: rcvd %d: ",ret);
					for (i=0; i<ret; i++){
						if ((ttyInput[i]>31) && (ttyInput[i]<127)) fprintf(stderr,"%c",ttyInput[i]);
						else fprintf(stderr,"(%d)",ttyInput[i]);
					}
					fprintf(stderr,"\n");
				}
				else if (ttyInput[0]=='<' ) {					// Incoming command
					buf = parse_tty(ttyInput);
					if (buf == NULL) fprintf(stderr,"main:: No buffer to sens to socket\n");
					else { write_socket(sockfd,buf); }
				}
				else {											// Discard
				}
			} 
			else if (ret == -1) {
			  perror("Error reading tty device");
			}
			else {
			  reads++;
			  if (debug>=1) printf("main:: ttyfd message set, but no chars read (chk:%d)\n",reads);
			}
		}
		
		else if (FD_ISSET(sockfd, &fds)) {
			if (debug >= 1) printf("main:: sockfd message\n");
			if (read_socket_and_transmit(sockfd, ttyfd) == -2) {
				// If connection failed due to LamPI-daemon not running, we have to wait until
				// the daemon is restarted by cron after 60 secs and restart again.
				// The easiest way is to quit the program and let it be restarted by cron too
				i=0;
				while ( ((sockfd = open_socket(hostname,port)) < 0) && (i++ < 15) ) {
					fprintf(stderr,"(%d) Error opening socket connection to daemon %s\n",i, hostname);
					sleep(5);
				}

				if (sockfd < 0) {
					fprintf(stderr,"Giving up: Error opening socket for host %s\n", hostname);
					sleep(1);
					exit(1);
				};
				if (verbose==1) printf("main:: reopened the socket\n");
				// New socket created, hopefully we're fine now
			}
		}
		else {
			// No message available
			reads++;
			if (debug >= 1) printf("main:: Select returns 1 but has no message(rc:%d)\n",rc);
		}
		
		if (reads >= 10) {
			fprintf(stderr,"main:: ERROR reading empty messages, resetting connection\n");
			close(ttyfd);
			sleep(10);
			ttyfd = tty_init(tty);
		}
	  }	
	  fflush(stdout);
	  //if (rc == 0) fprintf(stderr,"Timeout\n");
	  if (rc == 2) perror("Select error: ");	
		
	}// for;;;
}

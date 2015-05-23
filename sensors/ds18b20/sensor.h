/*
  Copyright (c) 2013, 2014 Maarten Westenberg, mw12554@hotmail.com 
 
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

// This file is both for definitions and for general functions declarations
// that can be used by sensors in this directory

#ifndef sensor__h
#define sensor__h

#ifdef __cplusplus
extern "C"
{
#endif

#define SPATH "/sys/bus/w1/devices"

// Define Buffer Sizes
#define MAXDATASIZE 132 						// max number of bytes we can get and store at once 
#define MAXMSGSIZE 128							// Max number of pulses in one message.

// 
// WAIT settings for the daemon and sockets
//
#define SLEEP 50000								// Sleeptime uSec in daemon mode between two PING messages to LamPI-daemon
#define MILLIWAIT 60000							// 60 milli secs is  minute

// Default port setting
//
#define PORT "5000" 							// the port client will be connecting to 
#define UDPPORT "5001"


// Define Pulse /timing for devices
//
#define P_ACTION_SHORT	120
#define P_AUTO	500								// Pulse time for Auto mode, must be little lower than pulse_long
#define P_ACTION 150							// Pulse time for Action/Impulse receivers
#define P_KAKU 260								// Pulse time for Kaku receivers
#define ACTION_MAX_SHORT 280


// Define Row Indexes for statistics ARRAY, make sure I_MAX_ROWS is larger than the number
// of receivers specified below....
//
#define I_MAX_ROWS 3
//
#define I_DHT11 0
#define I_WT440H 1

// Define Columns Indexes for statistics, I_MAX_COLS must be equal or larger than number of parameters
// specified below.
// I_MSGS_DISCARD; The number of messages discarded after the first recognition pulses were successful
//		it provides a measure how good the first few pulses can be used to identify pulses
#define I_MAX_COLS 26
//
// General statistics
//
#define I_MSGS 0
#define I_MSGS_DISCARD 1
#define I_PULSES 2
#define I_READ_AHEAD 3
#define T_READ_AHEAD 4
//
// Statistics the apply to all messages
//
#define I_CNT_SHORT 5
#define I_MIN_SHORT 6
#define I_AVG_SHORT 7
#define I_MAX_SHORT 8
#define I_SUM_SHORT 9
#define I_CNT_LONG 10
#define I_MIN_LONG 11
#define I_AVG_LONG 12
#define I_MAX_LONG 13
#define I_SUM_LONG 14
//
// statistics that apply for This current message only
//
#define T_CNT_SHORT 15
#define T_MIN_SHORT 16
#define T_AVG_SHORT 17
#define T_MAX_SHORT 18
#define T_SUM_SHORT 19
#define T_CNT_LONG 20
#define T_MIN_LONG 21
#define T_AVG_LONG 22
#define T_MAX_LONG 23
#define T_SUM_LONG 24



// External JSON functions in cJSON.c
//
extern int verbose;
extern int debug;
extern int socktcnt;							// Count the messages to the server
extern int sockerr;
extern int sockfd;								// The socket number/id for the server


// --------------------------------------------------------------------------------
// GET THE TIME IN A STRING
//
int get_time(char *s)
{
	time_t t = time(NULL);
	struct tm tm = *localtime(&t);

	sprintf(s, "[%d-%02d-%02d %02d:%02d:%02d] ", tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
	return(tm.tm_sec);
}


// --------------------------------------------------------------------------------
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
 * socket_open() function
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
 
 int socket_open(char * hostIP, char* port, int mode) 
 {
 	fd_set fds;
	// ---------------- FOR DAEMON USE, OPEN SOCKETS ---------------------------------
	// If we choose daemon mode, we will need to open a socket for communication
	// This needs to be done BEFORE enabling the interrupt handler, as we want
	// the handler to send its code to the LamPI-daemon process 
	
	if (mode == SOCK_DGRAM) {
	
		if ((sockfd = open_udp_socket()) < 0) {
			fprintf(stderr,"Error opening UDP socket for host %s. Exiting program\n\n", hostIP);
			exit (1);
		}
		else if (verbose) {
			printf("daemon mode:: Success opening ocket\n");
		}
	}
	else {
		// Open a TCP socket
		if ((sockfd = open_tcp_socket(hostIP,port)) < 0) {
			fprintf(stderr,"Error opening TCP socket for host %s. Exiting program\n\n", hostIP);
			exit (1);
		}
		else if (verbose) {
			printf("daemon mode:: Success connecting TCP to %s:%s\n",hostIP,port);
		}
		FD_ZERO(&fds);
		FD_SET(sockfd, &fds);
	}
	return(sockfd);
}


/*
 *********************************************************************************
 * buf_2_server
 * Send a message buffer to the server over either TCP or UDP
 *********************************************************************************
 */
int buf_2_server(int sockfd, 
				char * serverIP,			// HostIP, eg 255.255.255.255
				char * port,				// Port number, eg 5001
				char * snd_buf,
				int mode )
{
	
	// Daemon, output to socket

	if (mode == SOCK_STREAM) 
	{	
					
		// Do NOT use check_n_write_socket as weather stations will not
		// send too many repeating messages (1 or 2 will come in one transmission)
		//
		if (write(sockfd, snd_buf, strlen(snd_buf)) == -1) {
			fprintf(stderr,"socket write error\n");
			return(-1);
		}	

		delay(200);			
		if (verbose) printf("Buffer sent to TCP Socket: %s\n",snd_buf);

	}
	
	// If this is an UDP connections
	//
	else {
		// hostIP and port are global variables. Must be changed later!
		
		struct sockaddr_in servaddr; 			// server address */
		short s_port = atoi(port);				// Instead of port 5000, use port 5001 as standard
		
		/* fill in the server's address and data, in this case 0 */ 
		
		memset((char*)&servaddr, 0, sizeof(servaddr)); 
		servaddr.sin_family = AF_INET; 
		servaddr.sin_port = htons(s_port);
		servaddr.sin_addr.s_addr = inet_addr(serverIP);
		
		if (verbose) printf("UDP dest: %s , port: %d\n", serverIP, s_port);
		
		if (sendto(sockfd, snd_buf, strlen(snd_buf), 0, (struct sockaddr *)&servaddr, sizeof(servaddr)) < 0) {
	 		perror("sendto failed"); 
			return(-1); 
		}
		if (verbose) printf("buf_2_server:: serverIP: %s:%s, buf: %s\n", serverIP, port, snd_buf);
	}
	return(1);
}

#ifdef __cplusplus
}
#endif

#endif

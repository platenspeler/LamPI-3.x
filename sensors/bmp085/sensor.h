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
#define MILLIWAIT 60000							// 60 milli secs is minute

// Default port setting
//
#define PORT "5002" 							// the port client will be connecting to 
#define UDPPORT "5001"


/*
 *********************************************************************************
 * Get local address
 *********************************************************************************
 */
int getLocalAddress(char *host) {

    struct ifaddrs *ifaddr, *ifa;
    int family, s;
    //char host[NI_MAXHOST];

    if (getifaddrs(&ifaddr) == -1)
    {
        perror("getifaddrs");
		return(-1);
        //exit(EXIT_FAILURE);
    }
	fprintf(stderr,"Starting loop\n");
    for (ifa = ifaddr; ifa != NULL; ifa = ifa->ifa_next)
    {
        if (ifa->ifa_addr == NULL)
            continue;

        s=getnameinfo(ifa->ifa_addr,sizeof(struct sockaddr_in),host, NI_MAXHOST, NULL, 0, NI_NUMERICHOST);

        if((strcmp(ifa->ifa_name,"wlan0")==0)&&(ifa->ifa_addr->sa_family==AF_INET))
        {
            if (s != 0)
            {
                fprintf(stderr,"getnameinfo() failed: %s\n", gai_strerror(s));
				return(-1);
                //exit(EXIT_FAILURE);
            }
//            fprintf(stderr,"\tInterface : <%s>\n",ifa->ifa_name );
//            fprintf(stderr,"\t  Address : <%s>\n", host);
        }
    }

    freeifaddrs(ifaddr);
    return(0);
}


/*
 *********************************************************************************
 * Get In Addr
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
		return(-1);
	}
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
	int sockfd;
	
	// ---------------- FOR DAEMON USE, OPEN SOCKETS ---------------------------------
	// If we choose daemon mode, we will need to open a socket for communication
	// This needs to be done BEFORE enabling the interrupt handler, as we want
	// the handler to send its code to the LamPI-daemon process 
	
	if (mode == SOCK_DGRAM) {
	
		if ((sockfd = open_udp_socket()) < 0) {
			fprintf(stderr,"Error opening UDP socket for host %s. Exiting program\n\n", hostIP);
			exit (1);
		}
	}
	else {
		return(-1);
	}
	return(sockfd);
}


/*
 *********************************************************************************
 * buf_2_server
 * Send a message buffer to the server over either TCP or UDP
 * Be aware, that there is a minimum of arguments that need to be specified in
 * the jSon snd_buf string.
 *********************************************************************************
 */
int buf_2_server(int sockfd, 
				char * serverIP,			// HostIP, eg 255.255.255.255
				char * port,				// Port number, eg 5001
				char * snd_buf,
				int mode )
{
	
	// Daemon, output to socket

	if (mode == SOCK_DGRAM) 
	{	
		// hostIP and port are global variables. Must be changed later!
		
		struct sockaddr_in servaddr; 			// server address */
		short s_port = atoi(port);				// Instead of port 5002, use port 5001 as standard
		
		/* fill in the server's address and data, in this case 0 */ 
		
		memset((char*)&servaddr, 0, sizeof(servaddr)); 
		servaddr.sin_family = AF_INET; 
		servaddr.sin_port = htons(s_port);
		servaddr.sin_addr.s_addr = inet_addr(serverIP);
		
		printf("UDP dest: %s , port: %d\n", serverIP, s_port);
		
		if (sendto(sockfd, snd_buf, strlen(snd_buf), 0, (struct sockaddr *)&servaddr, sizeof(servaddr)) < 0) {
	 		perror("sendto failed"); 
			return(-1); 
		}
		printf("buf_2_server:: serverIP: %s:%s, buf: %s\n", serverIP, port, snd_buf);
		return(1);
	}
	return(-1);
}

#ifdef __cplusplus
}
#endif

#endif

/* **************************************************************************************
 * transmitter.c:
 * 
 *   Copyright (c) 2013,2014 Maarten Westenberg, mw12554@hotmail.com 
 * 
 *  This software is licensed under GNU license as detailed in the root directory
 *  of this distribution and on http://www.gnu.org/licenses/gpl.txt
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 *
 *    You should have received a copy of the GNU General Public License
 *    along with LamPI.  If not, see <http://www.gnu.org/licenses/>.
 *
 *
 *************************************************************************************** */

#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <stdlib.h>
#include <wiringPi.h>
#include <math.h>
#include <time.h>
#include <unistd.h>
#include <netdb.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include "cJSON.h"
#include "LamPI.h"

extern int verbose;
extern int debug;

// Declarations for Sockets
int sockfd;	
fd_set fds;

// Init timing values
struct timeval timeout;	
unsigned int timestamp = 0;

static volatile int stop_ints;				

// ----------------------------------------------------------------------------------
//
// XXX We really need to figure out the -p (outpin) for wiringPi value
//
int dkaku(char *gaddr, char *uaddr, char *val)
{
	int ret;
	char fname[255];
	// Match the GUI values 1-32 for the dimmer to the device
	if (verbose) fprintf(stderr,"dkaku:: val: %s\n",val);
	
	// values of 0-15
	if (strcmp(val,"on")==0)  
		sprintf(fname,"/home/pi/exe/kaku -g %s -n %s on", gaddr,uaddr);
	else if (strcmp(val,"off")==0) 
		sprintf(fname,"/home/pi/exe/kaku -g %s -n %s off", gaddr,uaddr);
	else if (strcmp(val,"0")==0) 
		sprintf(fname,"/home/pi/exe/kaku -g %s -n %s off", gaddr,uaddr);
	else {
		int ivalue= (int) ( (atoi(val)-1)/2 );
		sprintf(fname,"cd /home/pi/exe; ./kaku -g %s -n %s %d", gaddr,uaddr,ivalue);
	}
	stop_ints = 1;
	if (verbose) fprintf(stderr,"dkaku:: system to kaku: %s\n",fname);
	ret = system(fname);						/* Actual transmission to system command */
	stop_ints = 0;
	
	if (ret == -1) fprintf(stderr,"dkaku:: system failed");
	return(0);
}

// ----------------------------------------------------------------------------------
// Universal transmit for well known transmitter. 
// In dtransmit we check whether the tramsnitter value is a well-known device in the 
// /home/pi/exe directory.
//
// XXX Both the exe directory and the pin number need to be configurable
//
int send_2_device(char *brand, char *gaddr, char *uaddr, char *val)
{
	int ret;
	char fname[255];
	sprintf(fname,"cd /home/pi/exe; ./%s -g %s -n %s %s", brand,gaddr,uaddr,val);
	printf("send_2_device:: %s\n",fname);
	
	stop_ints = 1;
	ret = system(fname);
	stop_ints = 0;
	
	if (ret == -1) {
		fprintf(stderr,"system failed");
		return (-1);
	}
	return(0);
}


// ----------------------------------------------------------------------------------
// Transmit a value to a device (over the air) using either a shell
// command directly.
// NOTE:: The command is called with the json arguments gaddr,uaddr and
//        not with the GUI addresses
// The value 'Val' is between 0 and 31.
//
int dtransmit(char *brand, char *gaddr, char *uaddr, char *val) 
{
	// Correct the unit code for action, old Kaku and Elro, that range from A-P 
	// The device specific executable uses unit addresses starting from 1 to n
	// And for Blokker that starts with 0, is corrected in the exe code.
	//
	fprintf(stderr,"dtransmit:: transmit %s %s %s %s\n",brand,gaddr,uaddr,val);
	if (strcmp(brand,"kaku") ==0)     { dkaku(gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"action") ==0)   { send_2_device(brand,gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"livolo") ==0)   { send_2_device(brand,gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"elro") ==0)     { send_2_device(brand,gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"blokker") ==0)  { send_2_device(brand,gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"kiku") ==0)     { send_2_device(brand,gaddr,uaddr,val); return(0); }
	if (strcmp(brand,"kopou") ==0)    { send_2_device(brand,gaddr,uaddr,val); return(0); }
	
	if (strcmp(brand,"zwave") ==0)    { if (verbose == 1) printf("dtransmit:: brand is zwave\n"); fflush(stdout); return(0); }
	
	fprintf(stderr,"dtransmit:: brand not recognized %s\n", brand);
	return(-1);
};


//  ----------------------------------------------------------------------------------
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
	
	// The command below is sort of initialization command to put the sender in 
	// a known state. Without it, there might be a problem when more than one Raspberry is
	// used for transmitting on the network. Unitialized it will apparently send noise ...
	// XXX Maybe just pulling the transmitter pin to 0 will work as well :-)
	
	send_2_device("kaku", "99", "1", "on");
	return(0);
}

/*
 *********************************************************************************
 * Read a socket and send a 433MHz message 
 *
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
int read_socket_and_transmit(int sockfd)
{
 	int rc;	
	
	char *jgaddr;	// Group address
	char *juaddr;
	char *jbrand;
	char *jval;
	char *action;
	char buf[MAXDATASIZE];							// For sending and receiving socket messages
	char *ptr1, *ptr2;
	
	// If we run in daemon, the interrupt handler outputs to the LamPI-daemon directly
	// so this program ONLY needs to sleep in that case to save cpu cycles
	//
	if (debug > 1) {
		printf("read_sock_and_transmit:: transaction: %d, sleep: %d, stop_ints: %d\n",
						socktcnt, SLEEP, stop_ints);
		fflush (stdout);
	}
			
	// Is the socket still alive? XXX we should not always do this once we are here,
	// but only once in every 60 seconds or so ....
		
	if ((millis() - timestamp) > MILLIWAIT)			// compare time and do every 60 seconds
	{
		timestamp = millis();
		if (verbose == 1) printf("PING\n");
		//sprintf(buf,"%d,PING",++socktcnt%1000);	// Keep_Alive and check for connection
		
		sprintf(buf,"{\"tcnt\":\"%d\",\"action\":\"ping\",\"type\":\"json\"}", 
						socktcnt%1000);
		
		if (write(sockfd, buf, strlen(buf)) == -1) {
			perror("transmitter.c:: Error writing to socket\n");
			close(sockfd);
			return(-2);								// code not connected
		}
	}
	
	// Now we have a connection still or again ...
	FD_ZERO(&fds);
	FD_SET(sockfd, &fds);
	timeout.tv_usec= SLEEP;
	timeout.tv_sec = 0;
			
	// Check for incoming socket messages. As longs as there is a message, read it, process it
	// If there are no fds ready, function returns 0, and we restart the loop
	// XXX Note: Timeout is so that we will not wait too long, as this will cluther the
	// interrupt process trying to fill the buffer.
		
	while ((rc = select(sockfd+1, &fds, NULL, NULL, &timeout)) > 0)
	{
		  // Look at the filedescriptor, and see if this socket is selected
		  if (FD_ISSET(sockfd, &fds))
		  {
			if (debug==1) printf("read_socket_and_transmit:: Message ready waiting on socket\n");
				
			rc = read(sockfd, buf, MAXDATASIZE); 
			if (rc == 0) {
				// Read error, break and establish new connection if necessary
				// If we break, we will automatically do a PING to check
				if (verbose == 1) printf("read_socket_and_transmit:: read error, connection lost?\n");
				close(sockfd);
				break;
			}
			else if (rc == -1) {
				perror("transmitter.c:: Error reading socket");
				break;
			}
			
			buf[rc]=0;									// Terminate a string
			// printf("\n------------------------------------------------\n");
			// printf("Buf read:: <%s>\n",buf);
			
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
					if (verbose) { 
						printf("\n------------------------------------------------\n");
						printf("Buf read:: <%s>\n",buf);
					}
					// Parse for brand and other parameters of the transmitter
					jbrand = parse_cjson(root, "cmd");		// My add-on parsing function 
					if (jbrand == NULL) { fprintf(stderr, "parse_cjson jbrand returned NULL \n"); goto next; }
				
					jgaddr = parse_cjson(root, "gaddr");
					if (jgaddr == NULL) { fprintf(stderr, "parse_cjson gaddr returned NULL \n"); goto next; }
				
					juaddr = parse_cjson(root, "uaddr");
					if (juaddr == NULL) { fprintf(stderr, "parse_cjson uaddr returned NULL \n"); goto next; }
				
					jval = parse_cjson(root, "val");
					if (jval == NULL) {	fprintf(stderr, "parse_cjson val returned NULL \n"); goto next; }
				
					fprintf(stderr, "Json:: gaddr: %s, uaddr: %s, val: %s\n",jgaddr, juaddr, jval);
		
					// Now transmit the command to a device using function transmit
					// 
					if (dtransmit(jbrand, jgaddr, juaddr, jval) == -1)
					{
						fprintf(stderr,"dtransmit: returned error \n");
						cJSON_Delete(root);
						goto next;
					}
				}
				
				// If we receive a weather notification (a broadcast), ignore
				if  (strcmp(action,"weather") == 0) { 
					// printf("parse_cjson:: weather message received. DISCARD\n");
					goto next; 
				}
				
				// If we receive a energy notification (a broadcast), ignore
				if  (strcmp(action,"energy") == 0) { 
					fprintf(stderr,"parse_cjson:: energy message received. DISCARD\n");
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
		  }// FD_ISSET

	}// while
		
	if (rc == -1) {
		perror("select failed with value -1");	
		return(-2);
	}
	if (rc == 0) {
		// perror("select failed with value 0");				// XXX Remove, val 0 means no data
	}
		
	//stop_ints=0;

	return(1);
 }
 



 
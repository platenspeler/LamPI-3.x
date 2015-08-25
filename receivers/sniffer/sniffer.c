 /* **************************************************************************************
 * sniffer.c Sniffer program for the LamPI project
 * 
 *   Copyright (c) 2013,2014,2015 Maarten Westenberg, mw12554@hotmail.com 
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
 *
 *************************************************************************************** 
 * sniffer.c:
 *
 * Program to read klikaanklikuit receivers (and to test receiver codes)
 * The program is part of the LamPI-daemon.php daemon code and
 * received remote codes will be transmitted to a receiving socket of the 
 * LamPI-dameon daemon or in test mode be printed on the terminal.
 *
 * How to test:
 *
 * The following command will loop forever (takes 100% cpu) waiting
 * for completed messages by the interrup handler and then show the 
 * result:
 * 	> sudo ./sniffer  -v -d
 *	
 * -d is for debug, -v for verbose
 * The variable "stop_ints" is used to temporary stop the handler from gathering
 * bits (interrupts occur but handler returns immediately)
 * This is to prevent reentrancy and corruption of main program results in testmode.
 * 
 *
 ***********************************************************************************************
*/

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

static unsigned long edgeTimeStamp[2] = {0, };  // Timestamp of edges

// The pulse_time is the most important parameter for the system to recognize messages
// For kaku we work with 260 uSec which works quite OK.
// For action switches the pulse time is more like 150 uSec. This means that if we want to see
// both messages we should adapt the pulse time, or widen the 30% bandwidth in the low_pass var in main init.
// As an experiment, we set this value to the last bit before a new header!

static volatile int pulse_time = P_AUTO;		// This is the initial lenght of the pulse

static int pulse_array [MAXDATASIZE];			// circular Array to store the pulse timing

// Binary code messages of receiver
static int binary_count = 0;
static char binary    [256];						// Resulting bit stream
static char chk_buf [256];						// Check buffer. Compare real bits in binary array (not pulses)
char timebuffer [26];

static int low_pass   = 80;						// Init so that min pulse_time - 30%  > low_pass

// Results ready for send/receive of daemon
static char snd_buf [256];

int socktcnt = 0;								// Message counter, used in sockets and in reporting

//	Global variable to count interrupts. 
//	These variable are shared between main prog and interrupt handler
//	Should be declared volatile to avoid compiler to cache it.

static volatile int stop_ints = 0;				// Stop Interrupts. If set, do not do any processing in interrupt time
static volatile int p_index = 0;				// Counter of pulses in interrupt routine. It needs to be larger r_index, but should not pass
static volatile int r_index = 0;				// Read pointer in the circular array pulse_array;
static volatile int duration = 0;				// actual duration of this edge interrupt since the previous edge

static int dflg = 0;							// Daemon
static int cflg = 0;							// Check

int checks = 0;									// Number of checks on messages	
int verbose = 0;
int debug = 0;									// Global var, used in all scanner functions
int sflg = 0;									// If set, gather statistics
unsigned int sock_stamp;						// Timestamp of last socket send call

// Statistics, see LamPI.h for definitions
//
// Row contains statistics per brand (in order database.cfg):
// 	0=kaku, 1=action/impuls, 2=blokker, 3=kiku (=kaku old), 
//	4=elro, 5=livolo, 6=kopou
//
// Columns contain statistics for each brand:
//	0=message_count, 1=pulse_count, 2=pulses_short, 3=min_short, 4=avg_short
//  5=max_short, 6=min_long, 7=avg_long, 8=max_long
//
int statistics [I_MAX_ROWS][I_MAX_COLS];

/*
 **********************************************************************************	
 	look up the time and put in a buffer
 **********************************************************************************
*/
int time2buf(char * buf) {
    time_t timer;
    struct tm* tm_info;

    time(&timer);
    tm_info = localtime(&timer);

    strftime(buf, 26, "%Y:%m:%d %H:%M:%S", tm_info);
	return(0);
}

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
 * ADD STATISTICS
 *
 * Fill the statistics row for a device/remote. Remote is coded in value of row
 * Whether or not short or long pulse is determined by value of split.
 *
 * We read the pulse_array starting at the beginning of the current message
 * in r_index (start of message without start/stop pulses);
 *
 *********************************************************************************/
int add_statistics(int row, int split, int start, int length)
{
	int i;
	int p_length = (p_index - r_index + MAXDATASIZE) % MAXDATASIZE;
	statistics[row][T_READ_AHEAD] = p_length;
	statistics[row][I_READ_AHEAD] += p_length;
	statistics[row][T_SUM_SHORT] = 0;
	statistics[row][T_CNT_SHORT] = 0;
	statistics[row][T_MIN_SHORT] = 0;
	statistics[row][T_MAX_SHORT] = 0;
	statistics[row][T_SUM_LONG] = 0;
	statistics[row][T_CNT_LONG] = 0;
	statistics[row][T_MIN_LONG] = 0;
	statistics[row][T_MAX_LONG] = 0;
	
	statistics[row][I_MSGS]++;
	
	for (i=0; i<length; i++)
	{
		int p = pulse_array[(start+i)%MAXDATASIZE];
		statistics[row][I_PULSES]++;
		
		if (p < split)								// Short pulse
		{
			// Statistics only for this message
			if ((p<statistics[row][T_MIN_SHORT]) ||
				(statistics[row][T_MIN_SHORT] == 0)) 
			{
				statistics[row][T_MIN_SHORT]= p;
			}
			else
			if ((p>statistics[row][T_MAX_SHORT]) ||
				(statistics[row][T_MAX_SHORT] == 0)) 
			{
				statistics[row][T_MAX_SHORT]= p;
			}
			statistics[row][T_SUM_SHORT] += p;
			statistics[row][T_CNT_SHORT] ++;
			statistics[row][T_AVG_SHORT]= (int) statistics[row][T_SUM_SHORT] / statistics[row][T_CNT_SHORT];
			
			// Global statistics, for every message of this device type
			if ((p<statistics[row][I_MIN_SHORT]) ||
				(statistics[row][I_MIN_SHORT] == 0)) 
			{
				statistics[row][I_MIN_SHORT]= p;
			}
			else
			if ((p>statistics[row][I_MAX_SHORT]) ||
				(statistics[row][I_MAX_SHORT] == 0)) 
			{
				statistics[row][I_MAX_SHORT]= p;
			}
			
			statistics[row][I_SUM_SHORT] += p;
			statistics[row][I_CNT_SHORT] ++;
			statistics[row][I_AVG_SHORT]= (int) statistics[row][I_SUM_SHORT] / statistics[row][I_CNT_SHORT];
		}
		else								// This is a long pulse
		{
			// Statistics for this message only
			//
			if ((p<statistics[row][T_MIN_LONG]) ||
				(statistics[row][T_MIN_LONG] == 0)) 
			{
				statistics[row][T_MIN_LONG]= p;
			}
			else
			if ((p>statistics[row][T_MAX_LONG]) ||
				(statistics[row][T_MAX_LONG] == 0)) 
			{
				statistics[row][T_MAX_LONG]= p;
			}
			statistics[row][T_SUM_LONG] += p;
			statistics[row][T_CNT_LONG] ++;
			statistics[row][T_AVG_LONG]= (int) statistics[row][T_SUM_LONG] / statistics[row][T_CNT_LONG];
			
			// Global statistics for this type of device
			//
			if ((p<statistics[row][I_MIN_LONG]) ||
				(statistics[row][I_MIN_LONG] == 0)) 
			{
				statistics[row][I_MIN_LONG]= p;
			}
			else
			if ((p>statistics[row][I_MAX_LONG]) ||
				(statistics[row][I_MAX_LONG] == 0)) 
			{
				statistics[row][I_MAX_LONG]= p;
			}
			
			statistics[row][I_SUM_LONG] += p;
			statistics[row][I_CNT_LONG] ++;
			statistics[row][I_AVG_LONG]= (int) statistics[row][I_SUM_LONG] / statistics[row][I_CNT_LONG];
		}
	}
	return(0);	
}


/*
 *********************************************************************************
 * PRINT STATISTICS
 *
 *
 *********************************************************************************/
int print_statistics(int row)
{
	printf("\nDevice Statistics\tAll Messages\t\t\tThis Message\n");
	printf("Total/This msg\t\t MIN \t AVG \t MAX \t\t MIN \t AVG \tMAX\n");
	
	printf("Short Pulse Length:\t%4d\t%4d\t%4d\t\t%4d\t%4d\t%4d\n", 
		statistics[row][I_MIN_SHORT], statistics[row][I_AVG_SHORT], statistics[row][I_MAX_SHORT],
		statistics[row][T_MIN_SHORT], statistics[row][T_AVG_SHORT], statistics[row][T_MAX_SHORT]
		);
		
	printf("Short Pulse Count:\t%4d\t\t\t\t%4d\n", statistics[row][I_CNT_SHORT],statistics[row][T_CNT_SHORT]);
	
	printf("Long  Pulse Length:\t%4d\t%4d\t%4d\t\t%4d\t%4d\t%4d\n", 
		statistics[row][I_MIN_LONG], statistics[row][I_AVG_LONG], statistics[row][I_MAX_LONG],
		statistics[row][T_MIN_LONG], statistics[row][T_AVG_LONG], statistics[row][T_MAX_LONG]
		);
		
	printf("Long  Pulse Count:\t%4d\t\t\t\t%4d\n", statistics[row][I_CNT_LONG],statistics[row][T_CNT_LONG]);
	printf("Pulses Count     :\t%4d\t\t\t\t%4d\n", statistics[row][I_PULSES],
		statistics[row][T_CNT_SHORT]+statistics[row][T_CNT_LONG]);
	
	printf("\nTotal/This msg\t\tAll Devices\t\t\tThis Device\n");
	printf("Msg Count Ttl/Dev:\t%4d\t\t\t\t%4d\n", socktcnt, statistics[row][I_MSGS]);
	printf("Read Ahead Buf   :\t%4d\t\t\t\t%4d\n",
		statistics[row][I_READ_AHEAD]/statistics[row][I_MSGS],statistics[row][T_READ_AHEAD]);
	printf("Dev Msgs Discard :\t\t\t\t\t%4d\n\n", statistics[row][I_MSGS_DISCARD]);

	return(0);
}

/*
 *********************************************************************************
 * Check them messages, write them to the socket
 * And make sure we do not send every single message
 *********************************************************************************
 */
int check_n_write_socket(char *binary, char *chkbuf , int binary_count)
{
	int i;
	// Check whether 2 subsequent messages are the same...
	// NOTE:: This code can easiy be adapted for a double-check if check==2 ...
	if (checks == 0) 
	{
		for (i=0; i<binary_count; i++) chk_buf[i] = binary[i];
	}
	else
	{
		// So we filled the chk_buf when checks === 0. See whether codes are equal..
		for (i=0; i<binary_count; i++) {
			if (chk_buf[i] != binary[i]) checks = -1;			// Start over
		}
						
		// This will also work if we receive a code from another remote
		// If checks is still 1, we need to send the buffer to the daemon over socket connection
		// XXX NOTE: We do not transmit any same code before checks == 0 again.
		// So maybe we should make checks = 0 in the heartbeat section below in main program.
					
		if (checks == 1) {
						
			// Send to socket
			if (write(sockfd, snd_buf, strlen(snd_buf)) == -1) {
				fprintf(stderr,"socket write error\n");
			}
			sock_stamp = millis();
			if (verbose) printf("Buffer sent to daemon: %s\n",snd_buf);
		}
		else if (verbose) {
			printf("Buffer checked %d times\n",checks);
		}
		
		// Reset checks every 2 seconds of idle socket time
		if ((millis() - sock_stamp) > 2000)	checks = -1;		
	}
	checks++;
	return(0);
}

/*
 *********************************************************************************
 * WT440H weather station sensor FUCTION
 *
 * Global Parameters Used: pulse_array, Binary_array, r_index, p_index;
 * p_length (as an argument)
 *
 * timing:
 *
 *           _   
 * '1':   |_| |     (T,T)
 *                 
 * '0':   |___|     (2T)
 * 
 * Protocol Info from: ala-paavola.fi
 *
 * bit 00-03 Leader
 * bit 04-07 Address
 * bit 08-09 Channel
 * bit 10-12 Constant (bit 
 * bit 13-19 Humidity
 * bit 20-34 Temperature
 * bit 35    Parity
 *
 * The protocol is an FM encoded message of 36 bits. Therefore, the number of pulses
 * needed to encode the message is NOT fixed. A 0 bit is just one LONG pulse, and a
 * 1 is encoded as two pulse (alternating low-high).
 * Therefore, reading such message can be a little bit more tricky as we do not know
 * how far to read ahead is enough to have potentially received a whole message.
 * 
 * As far as I can see, every message is sent 2 times, interval is 1 minute between
 * sending new values from the sensor.
 *
 * PULSE defines are found in the LamPI.h include file
 *********************************************************************************/
int wt440h(int p_length)
{
	int i;
	int j;
	// Check for WT440H. 
	
	// 2 periods start pulse each 1000 + 1000 uSec ( so 4 * 1000 uSec pulse )
	// As the bits are FM modulated, the number of interrupts may be between 36 (all 0) and 72 (all 1)
	// I make the assumption that checking 6 pulses is not heavier on the system than
	// checking 2 or 4 pulses first, as the compiler will probably break as soon
	// as one of the conditions is false (and not evaluate all conditions)
	if (p_length > 72)
	{	
		int pcnt = 0;
		binary_count = 0;
		j = r_index;
		//
		// The preamble of the WT440H has 4 bits, 1100 which means following 6 pulses
		// if these pulses are found we assume that we might have a valid message
		if  (  (pulse_array[j     % MAXDATASIZE] > WT440H_MIN_SHORT) // 1
			&& (pulse_array[j     % MAXDATASIZE] < WT440H_MAX_SHORT) 
			&& (pulse_array[(j+1) % MAXDATASIZE] > WT440H_MIN_SHORT)
			&& (pulse_array[(j+1) % MAXDATASIZE] < WT440H_MAX_SHORT)
			
			&& (pulse_array[(j+2) % MAXDATASIZE] > WT440H_MIN_SHORT) // 1
			&& (pulse_array[(j+2) % MAXDATASIZE] < WT440H_MAX_SHORT)
			&& (pulse_array[(j+3) % MAXDATASIZE] > WT440H_MIN_SHORT)
			&& (pulse_array[(j+3) % MAXDATASIZE] < WT440H_MAX_SHORT)
			
			&& (pulse_array[(j+4) % MAXDATASIZE] > WT440H_MIN_LONG) // 0
			&& (pulse_array[(j+4) % MAXDATASIZE] < WT440H_MAX_LONG)
			
			&& (pulse_array[(j+5) % MAXDATASIZE] > WT440H_MIN_LONG) // 0
			&& (pulse_array[(j+5) % MAXDATASIZE] < WT440H_MAX_LONG)
			)
		{
			pcnt+=6;									// 6 pulses
			j+=6;
			binary[binary_count++]=1;					// but only 4 bits
			binary[binary_count++]=1;
			binary[binary_count++]=0;
			binary[binary_count++]=0;
			
			for (i=0; i<32; i++)						// 4 bits leader, 32 bits remaining
			{
				if (   (pulse_array[ j % MAXDATASIZE] > WT440H_MIN_LONG) 
					&& (pulse_array[ j % MAXDATASIZE] < WT440H_MAX_LONG) 
					)
				{
					// We read a 0 bit
					binary[binary_count++]=0;
					pcnt+=1;
					j+=1;
				}
				else
				if (   (pulse_array[ j    % MAXDATASIZE] > WT440H_MIN_SHORT) 
					&& (pulse_array[ j    % MAXDATASIZE] < WT440H_MAX_SHORT) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > WT440H_MIN_SHORT)
					&& (pulse_array[(j+1) % MAXDATASIZE] < WT440H_MAX_SHORT)
					)
				{
					// We read a 1 bit
					binary[binary_count++]=1;
					pcnt+=2;
					j+=2;
				}
				else {
					// Any other timing combination is an error
					statistics[I_WT440H][I_MSGS_DISCARD]++;
					if (debug) {
						printf("WT440H:: Failed: index %d, last 2 pulses read: %4d %4d \n", binary_count,
							pulse_array[j % MAXDATASIZE], pulse_array[(j+1) % MAXDATASIZE]
						);
					}
					pcnt = 0;
					binary_count = 0;
					return(0);
				}
			}//for
					
			// XXX We might want to do some checking of the message, now we have the pulse train length in pcnt.
			// After all, the WT440H message contains a last parity bit for checking
			
			if (binary_count > 0)
			{
				int leader = 0;			for (i=0; i<4; i++)	leader = leader*2 + binary[i];
				int address = 0;		for (i=4; i<8; i++) address = address*2 + binary[i];
				int channel = 0;		for (i=8; i<10; i++) channel = channel*2 + binary[i];
				int constant = 0;		for (i=10; i<13; i++) constant = constant*2 + binary[i];
				int humidity = 0;		for (i=13; i<20; i++) humidity = humidity*2 + binary[i];
				int temperature = 0;	for (i=20; i<35; i++) temperature = temperature*2 + binary[i];
				int parity = binary[i++];
				
				// decode temperature (step 1)
				temperature=(temperature - 6400) * 10 /128;
				
				// if leader != 10 (1100)
				// Then break off
				
				// if constant != 6 return(0);
				// then break off
				
				// Gather statistics, but no skipping of bits
				//
				if (sflg) add_statistics(I_WT440H, 1500, r_index, pcnt);
				
				if (verbose)
				{
				// Print the binary code
					printf("\n------------------------------------------------------\nWT440H: <");
					for (i=0; i<binary_count; i++) {
						printf("%d ",binary[i]);
					}
					printf(">\n");
				}	
				// Print the address and device information
				//
				time2buf(timebuffer);
				printf ("%s:: leader: %d, address: %d, channel: %d, constant: %d, humid: %d, temp: %d.%d, par: %d\n",
						timebuffer, leader, address, channel, constant, humidity, temperature/10, temperature%10, parity);
						
				// When debugging, print the timing data too
				//
				if (debug==1) {
						printf("Timing:: r_index: %5d, j: %d\n",r_index,j);
						for (i=0; i<pcnt; i++)
						{
							printf("%03d ",pulse_array[(r_index+i)%MAXDATASIZE]);
						}
						printf("\n");
				}
				fflush(stdout);
				
				// Do communication to the daemon of print output
				socktcnt++;
				
				if (dflg)
				{
					// Fill the Json buffer, 0 for empty value...
					sprintf(snd_buf, 
					 "{\"tcnt\":\"%d\",\"action\":\"sensor\",\"brand\":\"wt440h\",\"type\":\"json\",\"address\":\"%d\",\"channel\":\"%d\",\"temperature\":\"%d.%d\",\"humidity\":\"%d\"}", 
						socktcnt%1000,address,channel,temperature/10,temperature%10,humidity);
					
					// Do NOT use check_n_write_socket as weather stations will not
					// send too many repeating messages (1 or 2 will come in one transmission)
					//
					if (write(sockfd, snd_buf, strlen(snd_buf)) == -1) {
						fprintf(stderr,"socket write error\n");
					}	
					
					if (verbose) printf("Buffer sent to Socket: %s\n",snd_buf);
				}
				else
				{
					sprintf(snd_buf, "tcnt: %d, Address: %d, Channel: %d, Temp: %d\n", 
							socktcnt%1000, address, channel, temperature);
					if (verbose) printf("Send Buffer: %s\n",snd_buf);
				}
				
				if (sflg) print_statistics(I_WT440H);
					
				// We know we can do this as we checked our p_length before
				r_index = j;
				if (r_index > MAXDATASIZE) r_index = r_index - MAXDATASIZE;
			}//if
		}
		return(binary_count);
	}
	return(0);
}

/*
 *********************************************************************************
 * KOPOU FUCTION
 *
 * Global Parameters Used: pulse_array, Binary_array, r_index, p_index;
 * p_length (as an argument)
 *
 * Kopou timing:
 *
 *           _______
 * Start: |_|       | (T,5T)
 *           ___   
 * '0':   |_|   |     (T,2T)
 *             _    
 * '1':   |___| |     (2T,T)
 * 
 * 
 * Every message starts with 2 periods start pulse: 140 + 600 uSec
 * There are 16 bits address pulses: 140+260 for a 0-bit and 260+140 for 1-bit
 * And there are 8 bits for Device is: 140+260 or 260+140 uSecs
 *
 *********************************************************************************/
int kopou(int p_length)
{
	int i;
	int j;
	int onoff = 0;
	
	// Check for Kopou. Actually, we should put this into modules/functions to make code more readible....
	// 2 periods start pulse: 140 + 600 uSec
	// 16 bits address pulses: 140+260 or 260+140
	//  8 bits Device: 140+260 or 260+140
	//
	if (p_length > 50)
	{	
		binary_count = 0;
		j = r_index;
		// Check for short+long pulse at start of message
		if  (  (pulse_array[(j+1) % MAXDATASIZE] > 550) 
			&& (pulse_array[(j+1) % MAXDATASIZE] < 700) 
			&& (pulse_array[ j    % MAXDATASIZE] > 100) 
			&& (pulse_array[ j    % MAXDATASIZE] < 160))
		{
			// this could be a start pulse of a Kopou message.
			// XXX We chould be checking this message with the next message
			
			j+=2;
				
			// Process the 24 databits, each consisting of 2 pulses
			// And we already did the two first pulses

			while (j < (r_index+48))					// total Must be 50
			{
				if (   (pulse_array[ j % MAXDATASIZE] > 100) 
					&& (pulse_array[ j % MAXDATASIZE] < 160) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > 240) 
					&& (pulse_array[(j+1) % MAXDATASIZE] < 320))
				{
					binary[binary_count++]=0;
				}
				else 
				if (   (pulse_array[ j % MAXDATASIZE] > 240) 
					&& (pulse_array[ j % MAXDATASIZE] < 320) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > 100) 
					&& (pulse_array[(j+1) % MAXDATASIZE] < 160))
				{
					binary[binary_count++]=1;
				}
				else
				{
					statistics[I_KOPOU][I_MSGS_DISCARD]++;
					// printf("Error, not a Kopou message for binary index %d, r_index: %d\n", binary_count, r_index);
					binary_count = 0;
					break;
				}
				j+=2;											// Increment by 2 as we read 2 pulses for every bit
			}//while
				
			// Print results for Kopou, if any
			//
			if (binary_count > 0) 
			{
				if (sflg) add_statistics(I_KOPOU, 200, r_index+2, 48);
				int address = 0; for (i=0; i<16; i++) address = address*2 + binary[i];
				int unit = 0; for (i=16; i<24; i++) unit = unit*2 + binary[i];
				
				if (verbose)
				{
					printf("\n------------------------------------------------------\nKOPOU: <");
					for (i=0; i<binary_count; i++) {
						printf("%d ",binary[i]);
					}
					printf(">\n"); 
				
					// Print the address and device information
					//
					printf ("Address: %d, Unit: %d\n",address,unit);
				
					// When debuggin is set, print the timing codes too
					//
					if (debug==1) {
						printf("Timing:: r_index: %5d, j: %d\n",r_index,j);
						for (i=0; i<52; i++)
						{
							int p = pulse_array[(r_index+i)%MAXDATASIZE];
							printf("%03d ",p);
						
						}//for
						printf("\n");
					}
					fflush(stdout);
				}
				
				// Do communication to the daemon of print output
				//if (socktcnt++ >999) socktcnt = 0;		// Transaction counter reset
				socktcnt++;
				// sprintf(snd_buf, "%d,!A%dD%dF1", socktcnt%1000, address, unit);
				onoff = 1;
				sprintf(snd_buf, 
					 "{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dF%d\"}", 
							socktcnt%1000,address,unit,onoff);
							
				if (dflg) 
				{
					check_n_write_socket(binary, chk_buf, binary_count);
				}
				else
				{
					if (verbose) printf("Send Buffer: %s\n",snd_buf);
				}
				
				// Print the statistics
				if (sflg) print_statistics(I_KOPOU);
				
				// We know we can do this as we checked our p_length before
				r_index = j;
				if (r_index > MAXDATASIZE) r_index = r_index - MAXDATASIZE;
			}
				
			// Maybe change r_indeax at this point...
			// But we should not change r_index unless we have a valid message!
			// Since below other protocols/receivers can look at the same array too.
		}
		return(binary_count);		
	}
	else
	{
		if (debug>1) printf("kopou p_length is %d\n",p_length);
	}
	return(0);		
}



/*
 *********************************************************************************
 * LIVOLO FUCTION
 *
 * Global Parameters Used: pulse_array, Binary_array, r_index, p_index;
 * p_length (as an argument)
 *
 * Livolo timing:
 *
 *
 * Every message starts with a start pulse of 500 uSec
 * There are 16 bits address pulses: 140+260 for a 0-bit and 260+140 for 1-bit
 * And there are 8 bits for Device is: 140+260 or 260+140 uSecs
 * Each bit is approx 400 USec long.
 *
 *********************************************************************************/
int livolo(int p_length)
{
	int i;
	int j;
	int onoff = 0;
	
	if (p_length > 50)
	{
		int pcnt = 0;
		binary_count = 0;
		j = r_index;
		if  (  (pulse_array[j % MAXDATASIZE] > 450) 
			&& (pulse_array[j % MAXDATASIZE] < 550) )
		{
			pcnt++;
			j++;
			for (i=0; i<23; i++)
			{
				if (   (pulse_array[ j % MAXDATASIZE] > 100) 
					&& (pulse_array[ j % MAXDATASIZE] < 200) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > 100) 
					&& (pulse_array[(j+1) % MAXDATASIZE] < 200))
				{
					binary[binary_count++]=0;
					pcnt+=2;
					j+=2;
					//printf("s ");
				}
				else
				if (   (pulse_array[ j % MAXDATASIZE] > 220) 
					&& (pulse_array[ j % MAXDATASIZE] < 350) )
				{
					binary[binary_count++]=1;
					pcnt+=1;
					j++;
					//printf("l ");
				}
				else {
					statistics[I_LIVOLO][I_MSGS_DISCARD]++;
					pcnt = 0;
					binary_count = 0;
					//printf("x\n");
					return(0);
				}
			}//for
					
			// XXX We might want to do some checking of the message, now we have the pulse train length in pcnt.
			// If we are here, there are probably same messages at position pulse_array[j+pcnt] !!
			
			if (binary_count > 0)
			{
				// Gather statistics, but skip the first start byte
				//
				if (sflg) add_statistics(I_LIVOLO, 210, r_index+1, pcnt-1);
				
				int address = 0; for (i=0; i<16; i++) address = address*2 + binary[i];
				int unit = 0; for (i=16; i<23; i++) unit = unit*2 + binary[i];
				
				if (verbose)
				{
				// Print the binary code
					printf("\n------------------------------------------------------\nLIVOLO: <");
					for (i=0; i<binary_count; i++) {
						printf("%d ",binary[i]);
					}
					printf(">\n");
					// Print the address and device information
					//
					printf ("Address: %d, Unit: %d\n",address,unit);
					// When debugging, print the timing data too
					//
					if (debug==1) {
						printf("Timing:: r_index: %5d, j: %d\n",r_index,j);
						for (i=0; i<pcnt; i++)
						{
							printf("%03d ",pulse_array[(r_index+i)%MAXDATASIZE]);
						}
						printf("\n");
					}
					fflush(stdout);
				}
				
				// Do communication to the daemon of print output
				if (socktcnt++ >999) socktcnt = 0;		// Transaction counter reset
				socktcnt++;
				//sprintf(snd_buf, "%d,!A%dD%dF1", socktcnt, address, unit);
				onoff = 1;
				sprintf(snd_buf, 
					 "{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dF%d\"}", 
							socktcnt%1000,address,unit,onoff);
				
				if (dflg) 
				{
					check_n_write_socket(binary, chk_buf, binary_count);
				}
				else
				{
					if (verbose) printf("Send Buffer: %s\n",snd_buf);
				}
				
				if (sflg) print_statistics(I_LIVOLO);
					
				// We know we can do this as we checked our p_length before
				r_index = j;
				if (r_index > MAXDATASIZE) r_index = r_index - MAXDATASIZE;
			}//if
		}
		return(binary_count);
	}
	return(0);
}//Livolo

/*
 *********************************************************************************
 * ACTION/IMPULS FUCTION
 *
 * Global Parameters Used: pulse_array, Binary_array, r_index, p_index; p_length (as an argument)
 *
 * Action/Impuls timing data
 * See http://dzrmo.wordpress.com/2012/07/08/remote-control-pt2272-for-android/
 * and the datasheet of the Princeton PT2262 which is used in MANY remotes today.
 *
 *         _     _
 * '0':   | |___| |___ (T,3T,T,3T)
 *         ___   ___
 * '1':   |   |_|   |_ (3T,T,3T,T)
 *         _     ___
 * float: | |___|   |_ (T,3T,3T,T) used in addresses
 *         _
 * Sync:  | |_______________________________| (T, 31T)
 *
 * 
 *  Every code bit is 4 pulses. Short pulses are T=170 uSec and Long pulses 3T 
 *  A full frame looks like this:
 * 
 * - Sync pulse: T high, 31T low (Total 32T), followed by 12 bits message 
 *   According to datasheet, this is a sync-bit or footer, but not a header :-)
 *   But the remote sends so many messages that we use sync of preceding message as our start bit
 *
 * - 5 bit:  Address/Group/Room
 * - 5 bit:  Unit	(Only one bit be active), others are float (and can be made 0)
 * - 1 bit:  on-off
 * - 1 bit:  on-Off
 * So the content of message is 12 bits, or 48 pulses
 *
 * - 1 Sync Bit: 1T high, 31T low (4 bits in length)
 * 
 * Therefore the total is 12 bits message + 4 bit times Sync = 16 bit = 16 * 8T pulses
 *
 * NOTE:: Long timing is between 250 and 600 uSec. HOWEVER: some keyfobs work almost
 *		identical to kaku and have a slightly longer timing for long pulses.
 *		Here we support these FOBs, if the systes starts messing up, put back timing
 *		to max 600 uSec for Keychain FOBS 
 *
 *********************************************************************************/
int action(int p_length)
{
	int i;
	int j;
	int address = 0; 
	int unit = 0;
	int onoff = 0;
	
	// Action messages are 12 bits of 4 pulses, and 2 pulses start
	//
	if (p_length > 52)
	{	
		binary_count = 0;
		j = r_index;
		if  (  (pulse_array[(j+1) % MAXDATASIZE] > 4000) 
			&& (pulse_array[(j+1) % MAXDATASIZE] < 6500) 
			&& (pulse_array[ j    % MAXDATASIZE] > ACTION_MIN_SHORT) 
			&& (pulse_array[ j    % MAXDATASIZE] < ACTION_MAX_SHORT)
			)
		{
			// this could be a start pulse of a Action message.
			// XXX Yes, we chould be checking this message with the next message
			// As all messages have same number of pulses
			
			j+=2;
				
			// Process the 12 databits, each consisting of 4 pulses
			// And we already did the two first pulses. 100-240 for short
			// and 260-600 work for KAKU.
			// TO also recognize keychain make longs 280-900

			while (j < (r_index+48))					// total Must be 50
			{
				if (   (pulse_array[ j    % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[ j    % MAXDATASIZE] < ACTION_MAX_SHORT) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[(j+1) % MAXDATASIZE] < ACTION_MAX_LONG)  
					&& (pulse_array[(j+2) % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[(j+2) % MAXDATASIZE] < ACTION_MAX_SHORT) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[(j+3) % MAXDATASIZE] < ACTION_MAX_LONG)
					)
				{
					binary[binary_count++]=0;
				}
				else 
				if (   (pulse_array[ j    % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[ j    % MAXDATASIZE] < ACTION_MAX_LONG) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[(j+1) % MAXDATASIZE] < ACTION_MAX_SHORT)
					&& (pulse_array[(j+2) % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[(j+2) % MAXDATASIZE] < ACTION_MAX_LONG) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[(j+3) % MAXDATASIZE] < ACTION_MAX_SHORT)
					)
				{
					binary[binary_count++]=1;
				}
				else 
				if (   (pulse_array[ j    % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[ j    % MAXDATASIZE] < ACTION_MAX_SHORT) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[(j+1) % MAXDATASIZE] < ACTION_MAX_LONG)
					&& (pulse_array[(j+2) % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[(j+2) % MAXDATASIZE] < ACTION_MAX_LONG) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[(j+3) % MAXDATASIZE] < ACTION_MAX_SHORT)
					)
				{
					binary[binary_count++]=2;
				}
				else 
				if (   (pulse_array[ j    % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[ j    % MAXDATASIZE] < ACTION_MAX_LONG) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[(j+1) % MAXDATASIZE] < ACTION_MAX_SHORT)
					&& (pulse_array[(j+2) % MAXDATASIZE] > ACTION_MIN_SHORT) // Short
					&& (pulse_array[(j+2) % MAXDATASIZE] < ACTION_MAX_SHORT) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > ACTION_MIN_LONG)  // Long
					&& (pulse_array[(j+3) % MAXDATASIZE] < ACTION_MAX_LONG)
					)
				{
					binary[binary_count++]=3;
				}
				else
				{
					// If some bits arrive OK and some not, this will trigger here
					// and provide some insight
					if ((debug) && (binary_count>1)) 
					{
						printf("Error:: Action: binary index %d, r_index: %d, 4-bytes: %d %d %d %d\n", 
							binary_count, r_index,
							pulse_array[ j   %MAXDATASIZE],
							pulse_array[(j+1)%MAXDATASIZE],
							pulse_array[(j+2)%MAXDATASIZE],
							pulse_array[(j+3)%MAXDATASIZE]
							);
					}
					statistics[I_ACTION][I_MSGS_DISCARD]++;
					binary_count = 0;
					return(0);
				}
				j+=4;		// Increment by 4 as we read 4 pulses for every bit
			}//while
				
			// Print results for action, if any
			//
			if (binary_count > 0) 
			{
				// Decode the binary buffer and compute addres, unit and value of the remote
				//
				for (i=0; i<=4; i++) {
					address = address * 2;
					if (binary[i]==1) address += binary[i];
				}	 
				for (i=5; i<=9; i++) {					// Only the bitposition that is 0 is unit index, others float
					if (binary[i] == 0) {
						unit= i-5;
						continue;
					}
				}	
				// The on-off state is encoded in 2 bits, 10 and 11.
				// One bit is 0, its position tells us whether we decode 0 or a 1
				// The other bit MUST be 2 (float) for "02" or "20" is allowed.
				// This enables us to check for empty "00" messages and discard those	
				if ((binary[10] == 0) && (binary[11] == 2)) onoff = 0;			// Other bits are float
				else 
				if ((binary[11] == 0) && (binary[10] == 2)) onoff = 1;
				else 
				if ((binary[10] == 0) && (binary[11] == 3)) { onoff = 0; unit++; }	// Unofficial coding
				else
				if ((binary[11] == 0) && (binary[10] == 3)) { onoff = 1; unit++; }	// Unofficial coding
				else {
					if (debug) printf("Action:: Wrong Value\n");				// Wrong message format. 
					return(0);
				}

				// If we are here, even the last bits are checked.
				// Total message is 52 bits, but we skip headers/footers
				// So skip first two bits and the last two bits
				
				if (sflg) add_statistics(I_ACTION, ACTION_MAX_SHORT, r_index+2, 48);
				
				if (verbose)
				{
					printf("\n------------------------------------------------------\n");
					printf("ACTION/IMPULS: <");
					
					for (i=0; i<binary_count; i++) {
						printf("%d ",binary[i]);
					}
					printf(">\n"); 
					
					printf ("address: %d, unit: %d, value: %d\n",address,unit,onoff);
						
					if (debug==1) {
						printf("Timing:: r_index: %5d, j: %d\n",r_index,j);
						for (i=0; i<52; i++)
						{
							printf("%03d ",pulse_array[(r_index+i)%MAXDATASIZE]);
						}
						printf("\n");
						printf("p_length is:: %d\n", p_length);
					}
					fflush(stdout);
				}
				
				socktcnt++;
				// Do communication to the daemon of print output
				// Use jSson mesage format, but encoding is raw as we use message=ics
				
				sprintf(snd_buf, 
					 "{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dF%d\"}", 
							socktcnt%1000,address,unit,onoff);
							
				//sprintf(snd_buf, "%d,!A%dD%dF%d", socktcnt%1000, address, unit, onoff);
				
				if (dflg) {
					check_n_write_socket(binary, chk_buf, binary_count);
				}
				else {
					if (verbose) printf("Send Buffer: %s\n",snd_buf);
				}
				
				// We know we can do this as we checked our p_length before
				//
				r_index = j;
				if (r_index > MAXDATASIZE) r_index = r_index - MAXDATASIZE;
				
				if (sflg) print_statistics(I_ACTION);
			}
					
			// Maybe change r_indeax at this point...
			// But we should not change r_index unless we have a valid message!
			// Since below other protocols/receivers can look at the same array too.
		}
		return(binary_count);		
	}
	else
	{
		if (debug>1) printf("WARNING:: action p_length is %d\n",p_length);
	}
	return(0);		
}// action




/**********************************************************************************************
 * Klikaanklikuit timing data

Protocol. (Timing copied in part from Wieltje, 
http://www.circuitsonline.net/forum/view/message/1181410#1181410,
but with slightly different timings)
        _   _
'0':   | |_| |_____ (T,T,T,5T)
        _       _
'1':   | |_____| |_ (T,5T,T,T)
        _   _
dim:   | |_| |_     (T,T,T,T)

T = short period of ~260 - 295µs. 

A full frame looks like this:

- start bit: 1T high, 10T low

- 26 bit:  Address
- 1  bit:  group bit
- 1  bit:  on/off/[dim]
- 4  bit:  unit
- [4 bit:  dim level. Only present if [dim] is chosen]

- stop bit: 1T high, 40T low
*********************************************************************************/
int kaku(int p_length)
{
	int i;
	int j;
	
	// Kaku messages are 32 bits (or 36 in case of dimmer) of 4 pulses, 
	// and 1 pulse start, and a long pulse end
	//
	
	if (p_length > 140)
	{	
		binary_count = 0;
		j = r_index;
		
		// First pulse is 10T followed by T
		if  (  (pulse_array[(j+1)   % MAXDATASIZE] >  2300) 	// first pulse of the train
			&& (pulse_array[(j+1)   % MAXDATASIZE] <  3000)				 				
			&& (pulse_array[ j      % MAXDATASIZE] >   KAKU_MIN_SHORT) 
			&& (pulse_array[ j      % MAXDATASIZE] <   KAKU_MAX_SHORT)
			)
		{
			// End pulse if 40T (10ms) long
			if (   (pulse_array[(j+131) % MAXDATASIZE] >  9000) 	// Last pulse of the train switch
				&& (pulse_array[(j+131) % MAXDATASIZE] < 12000) )
			{
				if (debug) printf("\nkaku switch end: %d\n", pulse_array[(j+131) % MAXDATASIZE]);
			}
			else
			if (   (pulse_array[(j+135) % MAXDATASIZE] >  9000) 	// Last pulse of the train dimmer
				&& (pulse_array[(j+135) % MAXDATASIZE] < 12000) )
			{
				if (debug) printf("\nkaku dimmer end: %d\n", pulse_array[(j+135) % MAXDATASIZE]);
			}
			else
			{
				if (debug>1)
				{
					printf("kaku pulse not found: \n");
					printf("p 126: %d\n",pulse_array[(j+126) % MAXDATASIZE]);
					printf("p 127: %d\n",pulse_array[(j+127) % MAXDATASIZE]);
					printf("p 128: %d\n",pulse_array[(j+128) % MAXDATASIZE]);
					printf("p 129: %d\n",pulse_array[(j+129) % MAXDATASIZE]);
					printf("p 130: %d\n",pulse_array[(j+130) % MAXDATASIZE]);
					printf("p 131: %d\n",pulse_array[(j+131) % MAXDATASIZE]);
					printf("p 132: %d\n",pulse_array[(j+132) % MAXDATASIZE]);
					printf("p 133: %d\n",pulse_array[(j+133) % MAXDATASIZE]);
					printf("p 134: %d\n",pulse_array[(j+134) % MAXDATASIZE]);
					printf("p 135: %d\n",pulse_array[(j+135) % MAXDATASIZE]);
					printf("p 136: %d\n",pulse_array[(j+136) % MAXDATASIZE]);
					printf("p 137: %d\n",pulse_array[(j+137) % MAXDATASIZE]);
					printf("p 138: %d\n",pulse_array[(j+138) % MAXDATASIZE]);
					printf("p 139: %d\n",pulse_array[(j+139) % MAXDATASIZE]);
					printf("p 140: %d\n",pulse_array[(j+140) % MAXDATASIZE]);
					printf("\n");
				}
				return(0);
			}
			
			
			// this could be a start pulse of a Kaku message.
			// XXX Yes, we chould be checking this message with the next message
			// As all messages have same number of pulses
			
			j+=2;
				
			// Process the 32 or 36 databits, each consisting of 4 pulses
			// And we already did the two first pulses
			// First encode the 128 bits for a switch, later dimmer bits if necessary

			while (j < (r_index+130))					// total Must be 50
			{
				// Test whether this is a 0
				if (   (pulse_array[ j    % MAXDATASIZE] > KAKU_MIN_SHORT)	// Short
					&& (pulse_array[ j    % MAXDATASIZE] < KAKU_MAX_SHORT) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+1) % MAXDATASIZE] < KAKU_MAX_SHORT)  
					&& (pulse_array[(j+2) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+2) % MAXDATASIZE] < KAKU_MAX_SHORT) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > KAKU_MIN_LONG) // Long
					&& (pulse_array[(j+3) % MAXDATASIZE] < KAKU_MAX_LONG)
					)
				{
					binary[binary_count++]=0;
				}
				else 
				// Test whether this is a 1 bit
				if (   (pulse_array[ j    % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[ j    % MAXDATASIZE] < KAKU_MAX_SHORT) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > KAKU_MIN_LONG) // Long
					&& (pulse_array[(j+1) % MAXDATASIZE] < KAKU_MAX_LONG)
					&& (pulse_array[(j+2) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+2) % MAXDATASIZE] < KAKU_MAX_SHORT) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+3) % MAXDATASIZE] < KAKU_MAX_SHORT)
					)
				{
					// Coding for a 1-bit
					binary[binary_count++]=1;
				}
				else 
				// Test whether this is floating bit (we have a dimmer)
				if (   (pulse_array[ j    % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[ j    % MAXDATASIZE] < KAKU_MAX_SHORT) 
					&& (pulse_array[(j+1) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+1) % MAXDATASIZE] < KAKU_MAX_SHORT)
					&& (pulse_array[(j+2) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+2) % MAXDATASIZE] < KAKU_MAX_SHORT) 
					&& (pulse_array[(j+3) % MAXDATASIZE] > KAKU_MIN_SHORT) // Short
					&& (pulse_array[(j+3) % MAXDATASIZE] < KAKU_MAX_SHORT)
					)
				{
					// Float encoding
					binary[binary_count++]=2;
				}
				else
				{
					// If debug, print out the message so we can see what's wrong.
					// Could be that our timing is setup up to critical
					if (debug)
					{
						printf("Error:: Wrong Kaku. Binary index %d, around pulse: %d, p_length: %d ...\n", 
							binary_count, j-r_index, p_length);
						printf("pulses: %d %d %d %d\n", pulse_array[(j)%MAXDATASIZE], pulse_array[(j+1)%MAXDATASIZE],
													 pulse_array[(j+2)%MAXDATASIZE], pulse_array[(j+3)%MAXDATASIZE]);
						statistics[I_KAKU][I_MSGS_DISCARD]++;
						binary_count = 0;
						//
						// Need more debugging info, and print whole failed message, uncommment below
						//
						//printf("Timing:: r_index: %5d, j: %d\n",r_index,j);
						//for (i=0; i<132; i++)
						//{
						//	printf("%05d ",pulse_array[(r_index+i)%MAXDATASIZE]);
						//}
						//printf("\n");
					}
					
					// Only for Kaku, as we know no other protocol has such large 
					// trailer values... So we won't redo this message again
					if (p_length > 140) 
					{
						r_index = r_index +1 ;
						if (r_index >= MAXDATASIZE) r_index = 0;
					}
					return(0);
				}
				j+=4;		// Increment by 4 as we read 4 pulses for every bit
			}//while
				
			// Print results for action, if any
			//
			if (binary_count > 0) 
			{
			
				// Total message is 132 bits, but we skip headers/footers
				// So skip first two bits and the last two bits
				
				if (sflg) add_statistics(I_KAKU, 500, r_index+2, 128);
				
				
				if (verbose) 
				{
					printf("\n------------------------------------------------------\nKAKU: <");
					for (i=0; i<binary_count; i++) {
						printf("%d ",binary[i]);
					}
					printf(">\n"); 
				}
				// Print the pulse timing for each bit
				//	
				if (debug) {
					printf("Timing:: r_index: %5d, j: %d\n",r_index,j);
					for (i=0; i<132; i++)
					{
						printf("%05d ",pulse_array[(r_index+i)%MAXDATASIZE]);
					}
					printf("\n");
				}
				fflush(stdout);
						
				// We know we can do this as we checked our p_length before
				r_index = j;
				if (r_index > MAXDATASIZE) r_index = r_index - MAXDATASIZE;
				
				// Decode the binary buffer and compute addres, unit and value of the remote
				//	
				// bit 0 - 25: First 26 bits are address
				// bit     26: Group Bit
				// bit     27: on/off/dim bit
				// bit 28- 31: Unit Code
				// ONLY for dimmer
				// bit 32- 36: dimmer value
					
				int address = 0; for (i=0; i<=25; i++) address = address*2 + binary[i];
				int group = binary[26];
				int onoff = binary[27];
				int unit = 0; for (i=28; i<=31; i++) unit = unit*2 + binary[i];
				int dimlevel = 0; 
				
				// Dimmer only
				if (binary[27] == 2) {
					for (i=32; i<=35; i++) dimlevel = dimlevel * 2 + binary[i];
				}
				//if (socktcnt++ > 999) socktcnt = 0;				// Transaction counter reset
				socktcnt++;
				
				// If group message, send other message than if it is regular button
				if (group == 1) {
				
					sprintf(snd_buf, 
					 "{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dG%d\"}", 
							socktcnt%1000,address,unit,group);
					if (verbose) printf("Address: %d, Unit: %d, Group: %d\n",address,unit,group);
					
				}
				else {
					
					// Remotes do not do dimlevel, but if necessary we can ...
					if (onoff == 2) {
						if (verbose) printf("Address: %d, Unit: %d, Dim: %d\n",address,unit,dimlevel);
						sprintf(snd_buf, 
							"{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dFdP%d\"}", 
							socktcnt%1000,address,unit,dimlevel);
					}
					else {
						if (verbose) printf("Address: %d, Unit: %d, OnOff: %d\n",address,unit,onoff);
						sprintf(snd_buf, 
							"{\"tcnt\":\"%d\",\"action\":\"handset\",\"type\":\"raw\",\"message\":\"!A%dD%dF%d\"}", 
							socktcnt%1000,address,unit,onoff);
					}
				}
				
				// Do communication to the daemon of print output
				
				if (dflg) 
				{
					check_n_write_socket(binary, chk_buf, binary_count);
				}
				else
				{
					if (verbose) printf("Send Buffer: %s\n",snd_buf);
				}
				
				//printf("kaku ret %d, p: %d, r: %d\n",ret,p_index,r_index);
				if (sflg) print_statistics(I_KAKU);	
			}//if
			
			
			// Maybe change r_indeax at this point...
			// But we should not change r_index unless we have a valid message!
			// Since below other protocols/receivers can look at the same array too.
		}
		return(binary_count);		
	}
	else
	{
		if (debug>1) printf("Kaku p_length is %d\n",p_length);
	}
	return(0);	
}// Kaku


/*
 *********************************************************************************
 * Lampi_Interrupt
 *
 * This is the main interrupt routine that is called as soon as we received an
 * edge (change) on the receiver GPIO pin of the RPI. As pulses arrive once every 
 * 100uSec, we have 1/10,000 sec to do work before another edge arrives on the pin.
 *
 * Therefore, the code is simple (for compiler), we fill a circular buffer
 * until our p_index pointer reaches the read pointer r_index.
 * At that moment, we stop interrupt processing and start working through the
 * buffer.
 * As soon as the buffer is empty again we resume interrupt processing
 *
 *********************************************************************************
 */
void lampi_interrupt (void) 
{ 
	// We record the time at receiving an interrupt, and we keep track of the
	// time of the previous interrupt. The difference is duration of this edge
	// We need to handle the pulse, even if we're not doing anything with it
	// as we need to start with correct pulses.
	//
	edgeTimeStamp[0] = edgeTimeStamp[1];
    edgeTimeStamp[1] = micros();	
	duration = edgeTimeStamp[1] - edgeTimeStamp[0];		// time between 2 interrupts
	
	// As long as we process output, (we then have gathered a complete message) 
	// or the buffer is full (!), stop receiving!
	//
	if (stop_ints) {
		return;
	}
	// With an open receiver, we receive more short pulses than long pulses.
	// Specially shorter than 100 uSec means reubbish in most cases.
	// We therefore filter out too short or too long pulses. This method works as a low pass filter.
	// If the duration is shorter than the normalized pulse_lenght of
	// low_pass (80) uSec, then we must discard the message. There is much noise on the 433MHz
	// band and interrupt time must be kept short! We keep a 30% margin!
	// So for protocols with shorter timing we should lower low_pass parameter,
	// but this is probably not necessary
	//
	if ( (duration < (int)(low_pass))					// Low pass filter
		|| (duration > 15000) )							
	{					
		return;
	}
		
	// Record this time
	//
	pulse_array[p_index] = duration;
	p_index++;
		
	// Index contains the NEXT position to store a timing position in
	// If the nexy position is going to be out of bounds, reset position to begin of array
	//
	if (p_index >= MAXDATASIZE) {
		p_index = 0;
	}
	
	// If we are going to pass the current position of the read_pointer r_index in next write
	// We need (!) to pause as we will be overwriting our data in the NEXT interrupt (not yet)
	// cycle.
	
	if (p_index == r_index) {
	 	stop_ints = 1;
	 	return;
	}
	return;
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
    if (verbose) printf("client: connecting to %s\n", s);

    freeaddrinfo(servinfo); // all done with this structure
	
	return(sockfd);
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
	int r_pin = 1;							// This is the Raspberry Programmable Interrupt Number (PIN)
											// At the moment it is fixed on pin 1										
	int i;									// counters
	int c;
	int pri;
	unsigned int lcnt=1;					// Loop Count
	int last_r_index = 0;
	
	// Vars for storing commandline options 

	int errflg = 0;							// If set, there is a commandline parsing error
	int p_length = 0;

	char *hostname = "localhost";			// Default setting for our host == this host
	char *port = PORT;						// default port, 5000
	
    extern char *optarg;
    extern int optind, optopt;

	// ------------------------- COMMANDLINE OPTIONS SETTING ----------------------
	// Valid options are:
	// -h <hostname> ; hostname or IP address of the daemon
	// -p <port> ; Portnumber for daemon socket
	// -v ; Verbose, Give detailed messages
	// -t; test/debug option
	// -s; Statistics
	// -c <count>; Check incoming messages count times
	//
    while ((c = getopt(argc, argv, ":123ac:dh:l:p:stvx")) != -1) {
        switch(c) {
		case 'c':
			cflg = 1;					// Checks
			checks = atoi(optarg);
		break;
		case 'd':						// Daemon mode, cannot be together with test?
			dflg = 1;
		break;
		case 'h':						// Socket communication
			//if (tflg>0) errflg++;
            dflg++;						// Need daemon flag too, (implied)
			hostname = optarg;
		break;
		case 'l':						// Low Pass filter setting
			low_pass = atoi(optarg);
			if ((low_pass<20) || (low_pass>pulse_time)) errflg++;
		break;
		case 'p':						// Port number
            port = optarg;
			//if (tflg>0) errflg++;
           dflg++;						// Need daemon flag too, (implied)
        break;
		case 's':						// Do Statistics
			sflg = 1;
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
        }
    }
	
	// -------------------- PRINT ERROR ---------------------------------------
	// Print error message if parsing the commandline
	// was not successful
	
    if (errflg) {
        fprintf(stderr, "usage: argv[0] (options) \n\n");
		
		fprintf(stderr, "-d\t\t; Daemon mode. Codes received will be sent to another host at port 5000\n");
		fprintf(stderr, "-s\t\t; Statistics, will gather statistics from remote\n");
		fprintf(stderr, "-t\t\t; Test mode, will output received code from remote\n");
		fprintf(stderr, "-v\t\t; Verbose, will output more information about the received codes\n");
		fprintf(stderr, "-c value\t; Check, will chick received codes <value> times before sending to daemon\n");
		
		fprintf(stderr, "\n\nOther settings:\n");
		fprintf(stderr, "-l value\t; Low Pass, number of uSec at minimum that is needed to count as a edge/bit change\n");

		fprintf(stderr, "\n\nObsolete settings, not doing any action:\n");
        exit (2);
    }
	
	// ------------------ SETUP WIRINGPI --------------------------------------------
	// Now start with setup wiringPI
	//
	
	wiringPiSetup();
	pri =  piHiPri(40); if (pri <0) { perror("No receiver priority setting"); exit(1); }
	wiringPiISR (r_pin, INT_EDGE_BOTH, &lampi_interrupt) ;

	//	------------------ PRINTING Parameters ------------------------------
	//
	if (verbose == 1) {
		
		printf("The following options have been set:\n\n");
		
		printf("-v\t; Verbose option\n");
		if (statistics>0)	printf("-s\t; Statistics option\n");
		if (dflg>0)			printf("-d\t; Daemon option\n");

		printf("\n");			
				 
	}//if verbose
	
	// If we are in daemon mode, initialize sockets etc.
	//
	if (dflg) {
		printf("Sniffer:: Init daemon process\n");
		daemon_mode(hostname, port);
	}
	
	if (sflg) {
		fprintf(stderr,"init statistics\n");
		init_statistics(statistics);			// Make cells 0
	}

	// -------------------- START THE MAIN LOOP OF THE PROGRAM ------------------------
	// LOOP Forever. for testing purposes (only) not delay, for daemon mode wait every second
	// XXX In daemon mode we can also receive messages every second on the socket if we want

	for (;;)
	{	
		// We write time values of interrupt routine faster to te pulse array
		// than we can read them (oops). So we take a timeout and process all
		// backlog until we are almost at p_index
		
		if (stop_ints)
		{
			// If stop ints is set, we have read more characters/timing than we could process
			// and the buffer is full. this means p_index == r_index.
			// The solution is to write the buffer and start again with p_index and r_index at the 
			// current positions
			//
			// NOTE: Using the -s flag for statistics will severly slow down the reader
			//		which may lead to buffer overflow. If omitting -s avoid this condition please
			//		consider to use it wisely!
			// NOTE2: Alternatively, one could discard the buffer as well. Therefore, only if verbose!!!
		
			if (verbose == 1) {
				printf("stop_ints::\t r_index: %d, p_index: %d\n",r_index, p_index); 
				fflush(stdout);
			}
			
			// There is a minimum message length that we need before we start printing
			// If it is less, we discard the message
			//
			//if (((p_index-r_index)%MAXDATASIZE) <= p_min) {
			//	p_index = 0;
			//	stop_ints = 0;
			//	continue;
			//}
			
			// If we are here, r_index == p_index (at least during interrupt)
			// For the moment we dup the WHOLE buffer, if verbose we print it as well
			// XXX Maybe change to if (debug)
			if (verbose == 1) 
			{
				printf("Timing code: <\n");
				for ( i=r_index; i < (r_index + MAXDATASIZE); i++)
				{
					printf("%03d ",pulse_array[i% MAXDATASIZE]);
				}
				printf(">\n");
				fflush(stdout);
			}
			else
			{
				fprintf(stderr,"Buffer Flush:: r_index: %4d\n",r_index);
			}
			
			// continue with interrupts. If data is not saved above, we will loose a complete buffer!!
			// 
			stop_ints = 0;
			
		}// if stop ints
		
		//---------------------------------------------------------
		// If stop ints is not 1, we can still try to process the string between p_index and r_index looking for 
		// protocols. First the idea was to have multiple threads look at the same code, now the idea is that 
		// one thread is more efficient since the processor of the RPI does not offer advantages when executing threads.
		//
		// So let's start interpreting the data we have so far ...
		//
		
		else
		{
			int ret;
			// Compute the gap between the p_index and the r_index
			// Does not work if these are equal....
			p_length = (p_index - r_index + MAXDATASIZE) % MAXDATASIZE;	
			
			// --------------------------- KOPOU --------------------------------------
			// // function kopou returns Binary Count
			//
			if ( (ret = kopou(p_length)) > 0 )
			{
				// As we recognized a Kopou message, there is NO need to look at other formats
				continue;
			}
			
			// --------------------------- WT440H --------------------------------------
			// // function wt440H returns Binary Count
			//
			if ( (ret = wt440h(p_length)) > 0 )
			{
				// As we recognized a temperature message, there is NO need to look at other formats
				continue;
			}
			
			// --------------------------- KLIKAAANKLIKUIT -----------------------------
			// Check for Klikaanklikuit
			//
			if ( (ret = kaku(p_length)) > 0 )
			{
				// As we recognized an Action message, there is NO need to look at other formats
				continue;
			}
			
			// --------------------------- ACTION/IMPULS -------------------------------			
			// Check Impulse
			//
			if ( (ret = action(p_length)) > 0 )
			{
				// As we recognized an Action/Impuls message, there is NO need to look at other formats
				continue;
			}
			
			// --------------------------- LIVOLO --------------------------------------			
			// Check Livolo
			// Livolo has a msg size of 24 bits: 16 data, 8 code and 1 start/stop
			// Problem is that bits are equal in duration, and alternating in High/Low.
			// 1-bit is wide 290 uSec, and 0-bit is two pulses of 110 uSec
			//
			if ( (ret = livolo(p_length)) > 0 )
			{
				// As we recognized a Livolo message, there is NO need to look at other formats
				continue;
			}
			
			// --------------------------- ELSE, NOTHING -------------------------------
			// If we're here, no well known remote found so we increase the index by one and go again.
			// The number for p_length must be LARGER than any of the messages to be recognized.
			// This way we keep a read buffer in front of us that is large enough to read
			// any device code in one go.
			
			// If p_length drops below a message size (as we parse multiple messages for example)
			// then the lines below make sure that we let the interrupt fill the buffer first
			// before we start reading again.
			
			for (;;) 
			{
				// If the interrupt routine has enough new pulses received ...
				// Or we did read actual messages for one of the remotes
				
				if ((p_length > MAXMSGSIZE) || (r_index != last_r_index))
				{
					r_index = r_index +1 ;
					if (r_index >= MAXDATASIZE) r_index = 0;
					break;								// Continue readin buffer
				}
				
				// If we are here, we will only break out of the loop if we read
				// enough new pulses, and p_index gets larger ..
				
				p_length = (p_index - r_index + MAXDATASIZE) % MAXDATASIZE;
				
				// else: Do some other work to kill time
				if (dflg)
				{
					if ( (debug==1) && ((lcnt++ % 10000000)==0) )
						printf("loop p: %4d, r:%4d, l:%4d\n",p_index,r_index,p_length);
						
					// The socket select contains a SLEEP as well
					if (read_socket_and_transmit(sockfd) == -2)
					{
						// If connection failed due to LamPI-daemon not running, we have to wait until
						// the daemon is restarted by cron after 60 secs and restart again.
						// The easiest way is to quit the program and let it be restarted by cron too
						// XXX better way is loop and try a few times
						i=0;
						stop_ints = 1;							// Block Interrupts
						while ( ((sockfd = open_socket(hostname,port)) < 0) && (i++ < 15) ) {
							fprintf(stderr,"Error opening socket connection to daemon %s, retry: %d\n",hostname,i);
							// XXX Oh boy, if we need to do this, our interrupt handler will scream!
							sleep(5);
						}
						stop_ints = 0;							// Enable Interrupts
						if (sockfd < 0) {
							fprintf(stderr,"Giving up: Error opening socket for host %s\n", hostname);
							exit(1);
						};
						if (verbose==1) printf("daemon_mode:: reopened the socket\n");
						// New socket created, hopefully we're fine now
					}
					
					// Do some basic checks to avoid hanging of the daemon
					// XXX Needs more checks
					
					if (stop_ints == 1) {
						fprintf(stderr,"ERROR sniffer.c:: in daemon mode, stop_ints == 1");
						stop_ints = 0;							// Unlock interrupt handler
					}
				}
				else {
					usleep(SLEEP);
					// XXX must be delayMicroseconds(SLEEP) 
				}
			}// for
			last_r_index = r_index;
			
			
			// This is sort of heartbeat. You can check whether the read program is still able
			// to keep up with the interrupts coming in. If so, the p_length will normally stay in
			// the same ballpark as the number above (MAXMSGSIZE) ....
			
			if ( (debug==1) && ((lcnt++ % 10000000)==0) )
				printf("loop p: %4d, r:%4d, l:%4d\n",p_index,r_index,p_length);	
			
		}// else
		
	}// for;;;
}

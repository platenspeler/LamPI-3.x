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

#ifndef LamPI__h
#define LamPI__h

#ifdef __cplusplus
extern "C"
{
#endif

// 
// WAIT settings for the daemon and sockets
//
#define SLEEP 50000								// Sleeptime uSec in daemon mode between two PING messages to LamPI-daemon
#define MILLIWAIT 60000							// 60 milli secs is  minute

// Default port setting
//
#define PORT "5000" 							// the port client will be connecting to 

// Define Pulse /timing for devices
//
#define P_ACTION_SHORT	120
#define P_AUTO	500								// Pulse time Auto mode, must be little lower than pulse_long
#define P_ACTION 150							// Pulse time for Action/Impulse receivers
#define P_KAKU 260								// Pulse time for Kaku receivers

// Definitions for Action devices
//
#define ACTION_MIN_SHORT 90
#define ACTION_MAX_SHORT 280
#define ACTION_MIN_LONG 280
#define ACTION_MAX_LONG 900

// Definitions for WT440H Weather station wireless sensors
//
#define WT440H_MIN_SHORT 700
#define WT440H_MAX_SHORT 1250
#define WT440H_MIN_LONG 1700
#define WT440H_MAX_LONG 2300

// Definitions for Kaku Devices
//
#define KAKU_MIN_SHORT 150
#define KAKU_MAX_SHORT 425
#define KAKU_MIN_LONG 1100
#define KAKU_MAX_LONG 1400

// Define Row Indexes for statistics ARRAY, make sure I_MAX_ROWS is larger than the number
// of receivers specified below....
// 	0=kaku, 1=action/impuls, 2=blokker, 3=kiku (=kaku old), 
//	4=elro, 5=livolo, 6=kopou, 7=wt-440H
#define I_MAX_ROWS 10

#define I_KAKU 0
#define I_ACTION 1
#define I_BLOKKER  2
#define I_KIKU 3
#define I_ELRO 4
#define I_LIVOLO 5
#define I_KOPOU 6
#define I_WT440H 7

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


// Define Buffer Sizes
#define MAXDATASIZE 16384 						// max number of bytes we can get and store at once 
#define MAXMSGSIZE 256							// Max number of pulses in one message.

// External JSON functions in transmitter.c or cJSON.c
//
extern char * parse_cjson(cJSON *ptr, char * pattern);
extern int dtransmit(char *brand, char *gaddr, char *uaddr, char *val);
extern int daemon_mode(char *hostname, char* port);


// Cross declarations of functions
//
extern int open_socket(char *host, char *port);
extern int read_socket_and_transmit(int sockfd);

extern int verbose;
extern int debug;
extern int socktcnt;
extern int sockerr;
extern int sockfd;


#ifdef __cplusplus
}
#endif

#endif

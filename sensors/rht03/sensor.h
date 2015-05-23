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

#ifndef sensor__h
#define sensor__h

#ifdef __cplusplus
extern "C"
{
#endif


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

// Define Pulse /timing for devices
//
#define P_ACTION_SHORT	120
#define P_AUTO	500								// Pulse time for Auto mode, little lower than pulse_long
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



// External JSON functions in transmitter.c or cJSON.c
//

extern int verbose;
extern int debug;
extern int socktcnt;
extern int sockerr;
extern int sockfd;


#ifdef __cplusplus
}
#endif

#endif

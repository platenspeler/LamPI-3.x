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
#define USLEEP 50000							// Sleeptime uSec in daemon mode between two PING messages to LamPI-daemon
#define SLEEP	2								// Sleeptime in seconds
#define MILLIWAIT 60000							// 60 milli secs is  minute

// Default port setting
//
#define PORT "5002" 							// the port client will be connecting to 
#define UDPPORT "5002"

// Define Buffer Sizes
#define MAXDATASIZE 16384 						// max number of bytes we can get and store at once 
#define MAXMSGSIZE 256							// Max number of pulses in one message.

// External JSON functions in LamPI-arduino.c or cJSON.c
//
extern char * parse_cjson(cJSON *ptr, char * pattern);


#ifdef __cplusplus
}
#endif

#endif

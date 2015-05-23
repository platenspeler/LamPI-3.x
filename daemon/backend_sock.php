<?php 
require_once( dirname(__FILE__) . '/../config/backend_cfg.php' );

//	------------------------------------------------------------------------------	
// backend_sock.php, Socket Class for LamPI-daemon 
//	
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c). M. Westenberg, all rights reserved	
// Version 1.5, Oct 20, 2013. Implemented connections, started with websockets as an option next (!) to .ajax calls.
// Version 1.6. Nov 10, 2013 Enhanced support for receivers, added new devices
// Version 1.7, Dec 06, 2013 Redo of jQuery Mobile for version jqm version 1.4
// Version 1.8, Jan 18, 2014 Added temperature sensor support
// Version 1.9, Mar 10, 2014 Support for sensors, and remote access
// Version 2.0, Jun 15, 2014 Initial support for Z-Wave devices (868MHz)
// Version 2.1, Jul 31, 2014 Smart Meter support
// Version 2.2, Sep 15, 2014 Support for Z-Wave switches and dimmers
// Version 2.4, Oct 15, 2014 More .css work, Z-Wave daemon on the Z-Wave hub to read switch status
// Version 2.5, Nov 20, 2014 LamPI-daemon changed mysqli connection, LamPI-gate rewrote from zautomation to zwayAPI,
//					Sockets Class in separate backend-sock.php file
//
// Copyright, Use terms, Distribution etc.
// ===================================================================================
//  This software is licensed under GNU General Pulic License as detailed in the 
//  root directory of this distribution and on http://www.gnu.org/licenses/gpl.txt
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
// 
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//  THE SOFTWARE.
//
//    You should have received a copy of the GNU General Public License
//    along with LamPI.  If not, see <http://www.gnu.org/licenses/>.
//
// THIS Program file in PHP implements the daemon program to run in the background
//	It will read timer command from MySQL and then run them either immediately or on
//	certain moments based on timer settings.
//	
//	-------------------------------------------------------------------------------	*/
				

// -----------------------------------------------------------------------------------------------
//	CLASS SOCKet
//	Handles all socket communication functions.
//	Until version 1.4 all sockets were UDP based. Starting version 1.5 the LamPI daemon will change
//	to TCP connection based sockets. This will allow websockets (that are TCP only) migration in the
//	front-end app.
//	
// Websockets work just like normal sockets. ONLY, when the client makes a connection
// it is required that we upgrade the regular web/browser connection to a full
// tcp connect including json support and masking of the data (security)
//
// Therefore functiosn mask/s_unmask are introduced. It is possible to have regular and
// websockets work next to each other, but funcing out whether the message just received
// is a websocket message is a little creative/tricky.
//	
//	The select call for socket can wait on several connection end-points. Therefore we will also
//	introduce some security in later versions, so that some devices may and other may not control LamPI.
//

class Sock {
	
	public	$usock = 0;					// UDP Receive Socket
	public	$rsock = 0;					// Receive socket of the server
	public	$ssock = 0;					// Sendto Socket; often last socket rcvd on, so THE socket to reply to
	public	$clientIP;					// Refer to with either $sock-> or $this->
	public	$clients = array();			// Array of sockets containing the real "accepted" clients
	public	$sockadmin = array();		// contains name, ip, type of client etc data
	
	private $read = array();			// The object for socket_select, contains array of data sockets
	private $wait = 1;					// Timeout value for socket_select. Changed dynamically!

	//
	//handshake new client. Also called upgrade of a websocket connection request
	// Websites:
	//
	private function s_upgrade($rcvd_header, $client_conn, $host, $port)
	{
		global $debug, $log;
		$log->lwrite("s_upgrade:: building upgrade reply",2);
		$headers = array();
		$lines = preg_split("/\r\n/", $rcvd_header);
		foreach($lines as $line)
		{
			$line = chop($line);
			if(preg_match('/\A(\S+): (.*)\z/', $line, $matches))
			{
				$headers[$matches[1]] = $matches[2];
			}
		}
		// XXX Need to figure out the name of this program through $_SYSTEM or $_SESSION
		// If index Sec-Websocket-Key not found we get a warning! So maybe we shoud print the
		// total header for debug>2 to see where this comes from
		$secKey = $headers['Sec-WebSocket-Key'];
		
		$log->lwrite("s_upgrade:: secKey: ".$secKey,2);
	
		$secAccept = base64_encode(pack('H*', sha1($secKey . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')));
		//hand shaking header, and write the upgrade response back to the client
		$upgrade  = "HTTP/1.1 101 Web Socket Protocol Handshake\r\n" .
					"Upgrade: Websocket\r\n" .
					"Connection: Upgrade\r\n" .
					"WebSocket-Origin: $host\r\n" .
					"WebSocket-Location: ws://$host:$port/LamPI-daemon.php\r\n".
					"Sec-WebSocket-Accept:$secAccept\r\n\r\n";
		socket_write($client_conn,$upgrade,strlen($upgrade));
		$log->lwrite("s_upgrade:: sending upgrade reply",1);
		$log->lwrite("\n".$upgrade,3);
	}

	//
	//Encode message for transfer to client.
	//
	public function s_mask($text)
	{
		$b1 = 0x80 | (0x1 & 0x0f);
		$length = strlen($text);
	
		if($length <= 125)
			$header = pack('CC', $b1, $length);
		elseif($length > 125 && $length < 65536)
			$header = pack('CCS', $b1, 126, $length);
		elseif($length >= 65536)
			$header = pack('CCN', $b1, 127, $length);
		return $header.$text;
	}//mask

	//
	// May be improved function to encode messages prior to transmission
	//
	public function s_encode($message, $messageType='text') {
		global $log;
		global $debug;
		$log->lwrite("s_encode:: message: ".$message.", type: ".$messageType,3);
		switch ($messageType) {
			case 'continuous':
				$b1 = 0;
			break;
			case 'text':
				$b1 = 1;
			break;
			case 'binary':
				$b1 = 2;
			break;
			case 'close':
				$b1 = 8;
			break;
			case 'ping':
				$b1 = 9;
			break;
			case 'pong':
				$b1 = 10;
			break;
		}
		$b1 += 128;
		$length = strlen($message);
		$lengthField = "";
                
		if ($length < 126) {
			$b2 = $length;
		} elseif ($length <= 65536) {
			$b2 = 126;
			$hexLength = dechex($length);
			//$this->stdout("Hex Length: $hexLength");
			if (strlen($hexLength)%2 == 1) {
				$hexLength = '0' . $hexLength;
			} 

			$n = strlen($hexLength) - 2;
			for ($i = $n; $i >= 0; $i=$i-2) {
				$lengthField = chr(hexdec(substr($hexLength, $i, 2))) . $lengthField;
			}

			while (strlen($lengthField) < 2) {
				$lengthField = chr(0) . $lengthField;
			}
		} else {
			$b2 = 127;
			$hexLength = dechex($length);

			if (strlen($hexLength)%2 == 1) {
				$hexLength = '0' . $hexLength;
			} 
			$n = strlen($hexLength) - 2;
			for ($i = $n; $i >= 0; $i=$i-2) {
				$lengthField = chr(hexdec(substr($hexLength, $i, 2))) . $lengthField;
			}

			while (strlen($lengthField) < 8) {
				$lengthField = chr(0) . $lengthField;
			}
		}
		return chr($b1) . chr($b2) . $lengthField . $message;
	}

	//
	// Unmask incoming framed message
	//
	private function s_unmask($text) {
		$length = ord($text[1]) & 127;
		if($length == 126) {
			$masks = substr($text, 4, 4);
			$data = substr($text, 8);
		}
		elseif($length == 127) {
			$masks = substr($text, 10, 4);
			$data = substr($text, 14);
		}
		else {
			$masks = substr($text, 2, 4);
			$data = substr($text, 6);
		}
		$text = "";
		for ($i = 0; $i < strlen($data); ++$i) {
			$text .= $data[$i] ^ $masks[$i%4];
		}
		return $text;
	}//s_unmask
	
	
	//
	//	Open the UDP server socket as an internal function
	//
	private function s_uopen() {
		global $debug;
		global $log;
		global $rcv_daemon_port;
		global $udp_daemon_port;
		global $serverIP;
		
		$address= $serverIP;
		
		$log->lwrite("s_uopen:: Opening UDP Socket on IP ".$address.":".$udp_daemon_port,1);
		
		$this->usock = socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
		//if (!$this->usock)
        //	die('Unable to create AF_UNIX socket');
			
    	//if (!socket_set_option($this->usock, SOL_SOCKET, SO_BROADCAST, 1)) 		// Re-use the port, 
		if (!socket_set_option($this->usock, SOL_SOCKET, SO_REUSEADDR, 1)) 		// Re-use the port,
    	{ 
			$log->lwrite("s_uopen:: socket_set_option failed:: ".socket_strerror(socket_last_error($this->usock)) ); 
			return(-1); 
   		}
		// Set listen port on any address
		if (!socket_bind($this->usock, $address, $udp_daemon_port))
		{
			$log->lwrite("s_uopen:: socket_bind failed:: ".socket_strerror(socket_last_error($this->usock)));
			socket_close($this->usock);
			return (-1);
		}	
		$log->lwrite("s_uopen:: receive socket opened ok on port: ".$udp_daemon_port,1);
		return(0);
	}
	
	//
	// s_urecv. 
	// Main UDP receiver code for all messages on all socket connections to clients
	// $this->read contains the modified read array of socket to read
	//
	public function s_urecv() {
		global $log;
		global $debug;
		global $udp_daemon_port;
		global $serverIP;
		
		$buf = '';
		$name = '';
		$len = 512;
		$usec = 10000;
		
		$i1=time();
		if (!is_resource($this->usock)) {
            $this->s_uopen();
        }

		if (!($ret=socket_recvfrom ($this->usock, 
								   $buf ,
								   $len , 
								   MSG_DONTWAIT , 
								   $name, 
								   $port
		)	)						)
		{	
			$sockerr = socket_last_error($this->usock);
			
			switch($sockerr) {
				
				case 11:							// EAGAIN
					$log->lwrite("s_urecv:: no message",2);
					return(-1);
				break;
				default:
					$log->lwrite("s_urecv:: ERROR: ".socket_strerror($sockerr),1);
					return(-1);
				break;
			}
		}
		if ($ret == 0) {
				$log->lwrite("s_urecv:: No Data to read".$name.":".$port,2);
				return(-1);
		}
		else {
			$log->lwrite("s_urecv:: Receiving from: ".$name.":".$port." buf: ".$buf,2);
			return($buf);
		}
		return(-1);	
	}// s_urecv	
	
	
	//
	//	Open the server socket as an internal function
	//
	private function s_open() {
		global $debug;
		global $log;
		global $rcv_daemon_port;
		global $serverIP;
		
		$address= $serverIP;
		//$address = gethostbyname($_SERVER['SERVER_NAME']);
		//$address = $_SERVER['SERVER_ADDR'];			// Open THIS server IP
		
		$log->lwrite("s_open:: Opening Sockets on IP ".$address.":".$rcv_daemon_port,1);
		
		$this->rsock = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
    	if (!socket_set_option($this->rsock, SOL_SOCKET, SO_REUSEADDR, 1)) 		// Re-use the port, 
    	{ 
			$log->lwrite("s_open:: socket_set_option failed:: ".socket_strerror(socket_last_error($this->rsock)) ); 
			return(-1); 
   		}
		// Set listen port on any address
		if (!socket_bind($this->rsock, $address, $rcv_daemon_port))
		{
			$log->lwrite("s_open:: socket_bind failed:: ".socket_strerror(socket_last_error($this->rsock)));
			socket_close($this->rsock);
			return (-1);
		}	
		// 10 connections is enough? The silent Max is SOMAXCONN==18 on Raspberry Linux
		if (socket_listen($this->rsock, 10) === false) {
     		echo "s_open:: socket_listen() failed:: ".socket_strerror(socket_last_error($this->rsock));
			return (-1);
 		}

		$log->lwrite("s_open:: receive socket opened ok on port: ".$rcv_daemon_port,1);
		return(0);
	}
	
	//
	// Close the socket, use the client key ckey as an index for the socket administration.
	// This comes in handy, as the array will still have relevant info about the socket
	// even if the peer has already closed the connection
	//
	public function s_close($ckey) {
		global $log;
		global $debug;
		$log->lwrite("s_close:: close socket for IP "
						 	.$this->sockadmin[$ckey]['ip'].":"
							.$this->sockadmin[$ckey]['port'],2);
		
		socket_close($this->sockadmin[$ckey]['socket']);
	}// s_close
	
	//
	//	Send a message to the peer
	//	The message may need to be encoded depending on the type of client connected
	//  The function standard does not take a socket argument, we expect the $this->ssock
	//  to be set in the receiving function.
	//
	public function s_send($cmd_pkg) {
		global $log;
		global $debug;
		
		if (!is_resource($this->ssock)) {
			$log->lwrite("s_send failed: socket this->ssock not open");
			return(-1);
        }
		socket_getpeername($this->ssock, $clientIP, $clientPort);
		//$akey = array_keys($this->clients, $this->ssock);
		//$ckey = $akey[0];
		if (false === ( $ckey = array_search($this->ssock, $this->clients))) {
			$log->lwrite("s_send:: ERROR Key not found for current socket. ip: ".$clientIP.":".$clientPort);
			return(-1);
		}
		else {
			$log->lwrite("s_send:: Key ".$ckey." found for current socket. ip: ".$clientIP.":".$clientPort,2);
		}
		// If this is a websocket, make sure to encode first
		if ($this->sockadmin[$ckey]['type'] == 'websocket')
		{
			$log->lwrite("s_send:: websocket, encoding message. ip: ".$clientIP.":".$clientPort,2);
			$message = $this->s_encode($cmd_pkg);
		}
		else {
			$log->lwrite("s_send:: Not a websocket. ".$clientIP.":".$clientPort,2);
			$message = $cmd_pkg;
		}
		//
		$log->lwrite("s_send:: writing message <".$cmd_pkg.">",3);				
    	if (socket_write($this->ssock, $message, strlen($message)) === false)
   		{
     		$log->lwrite( "s_send:: ERROR socket_write failed:: ".socket_strerror(socket_last_error()) );
			socket_close($this->ssock);					//  This is one of the accepted connections
			return(-1);
    	}
		$log->lwrite("s_send:: socket_write to IP: ".$clientIP.":".$clientPort." success",2);
		return(0);
	}// s_send
	
	//
	// Broadcast a message to every connected (web)socket. As normal socket will probably
	// not be async
	//
	public function s_bcast($cmd_pkg) {
		global $log, $debug;
		
		$log->lwrite("s_bcast:: writing to connected clients: <".$cmd_pkg.">",2);
				
		foreach ($this->clients as $key => $client) 
		{  
			if (!is_resource($client)) {
				$log->lwrite("ERROR s_bcast:: failed: socket client not open: ".
							 $this->sockadmin[$key]['ip'].":".
							 $this->sockadmin[$key]['port']
				);
				socket_close($client);					//  This is one of the accepted connections
				unset($this->clients[$key]);
				unset($this->sockadmin[$key]);
				continue;
        	}
			if ($this->sockadmin[$key]['type'] != 'websocket' ) {
				$log->lwrite("s_bcast:: Warning: Not a websocket: "
									.$this->sockadmin[$key]['ip'].":"
									.$this->sockadmin[$key]['port'].", type "
									.$this->sockadmin[$key]['type']." need upgrade?"
									,2);
				$message = $cmd_pkg;
				if (socket_write($client,$message,strlen($message)) === false)
   				{
     				$log->lwrite( "ERROR s_bcast:: write failed:: ".socket_strerror(socket_last_error()) );
					socket_close($client);					//  This is one of the accepted connections
					unset($this->clients[$key]);
					unset($this->sockadmin[$key]);
					continue;
    			}
		
    			$log->lwrite("s_bcast:: raw socket_write to IP: ".$this->sockadmin[$key]['ip'].
										":".$this->sockadmin[$key]['port']." success",2);
			}
			else // Encode the message according to websocket standard
			{
				$message = $this->s_encode($cmd_pkg);
				if (socket_write($client,$message,strlen($message)) === false)
   				{
     				$log->lwrite( "ERROR s_bcast:: write failed:: ".socket_strerror(socket_last_error()) );
					socket_close($client);					//  This is one of the accepted connections
					unset($this->clients[$key]);
					unset($this->sockadmin[$key]);
					continue;
    			}
				$log->lwrite("s_bcast:: web socket_write to IP: ".$this->sockadmin[$key]['ip'].
										":".$this->sockadmin[$key]['port']." success",2);
			}
		}
		return(0);
	}// s_bcast
	
	
	//
	// s_recv. Main receiver code for all messages on all socket connections to clients
	// $this->read contains the modified read array of socket to read
	// XXX Actually we read only one successful message and then return back to caller
	// XXX This is not strict what the manual says: We should read all sockets with data available
	// XXX before calling select again.
	//
	public function s_recv() {
		global $log;
		global $debug;
		global $rcv_daemon_port;
		global $serverIP;
		
		$buf = '';
		$clientPort=0;
		$clientIP=0;
		$usec = 10000;
		
		$i1=time();

		$log->lwrite("s_recv:: calling socket_select, timeout: ".$this->wait,3);
		if (!is_resource($this->rsock)) {
			$log->lwrite("s_recv:: calling s_open no read socket is open",1);
            $this->s_open();
        }
		
		// socket_select waits for incoming messages on datagram and stream sockets
		// the this->wait timeout parameter is dynamic which allows the program to wait
		// in system mode until something happens.
		$ret = socket_select($this->read, $write = NULL, $except = NULL, $this->wait, $usec);
		if ($ret === false)
     	{
        	$log->lwrite( "s_recv:: socket_select failed:: ".socket_strerror(socket_last_error())."\n");
			return(-1);
     	}
		
		// Print data for changed sockets, this is for debugging only
		if ($debug>=3) {
			$log->lwrite("s_recv:: socket_select: printing changed sockets");
			foreach ($this->read as $key => $client) 
			{
				socket_getpeername($client, $clientIP, $clientPort);
				$log->lwrite("s_recv:: socket_select: key: ".$key." listen ip: ".$clientIP.":".$clientPort);
			}
		}
		
		// It the select function returns 0, there are no messages on any read sockets
		// and we return to the calling main process
		if ($ret == 0) {
			$log->lwrite( "s_recv:: socket_select returned 0",3);
			return(-1);
		}
		// $ret contains the number of sockets with messages. We will only serve one at a time!!
		$log->lwrite("s_recv:: socket_select success, returned: ".$ret,3);
		
		// DATAGRAM?
		// Is this a datagram message?
		if (in_array($this->usock, $this->read)) 
		{
			$log->lwrite("s_recv:: Reading Datagram message on usock",2);
			// Start with reading the UDP socket. If there is a message read, return the buffer
			if ( ($buf = $this->s_urecv() ) != -1 ) {
				$log->lwrite("s_recv:: UDP s_urecv returned buffer: ".$buf,3);
				// Remove the usock from the read array
				$key = array_search($this->usock, $this->read);
				if (false === $key)
					$log->lwrite("s_recv:: ERROR: unable to find usock key: ".$key." in the read array");
				else {
					$log->lwrite("s_recv:: Masking usock from read array, key: ".$key,3);
					unset($this->read[$key]);
				}
				return($buf);
			}
			else {
				return(-1);
			}
		}
		
		// NEW CONNECTION? 
		// (coming from a previous call of socket_select() in $read)
		// Incoming connect request comes in on server socket rsock only
		$log->lwrite("s_recv:: checking for new connections in this->read",2);
		if (in_array($this->rsock, $this->read)) 
		{
			$log->lwrite("s_recv:: server rsock to accept new connection ",3);
			if (($msgsock = socket_accept($this->rsock)) === false) {
            	$log->lwrite("s_recv:: socket_accept() failed:: ".socket_strerror(socket_last_error($this->rsock)) );
            	return(-1);
        	}

			socket_getpeername($msgsock, $clientIP, $clientPort);
			$log->lwrite("s_recv:: socket_accept: connect ip: ".$clientIP.":".$clientPort,1);
			
			// Add this socket to the array of clients for this server 
			// and update the admin array with relevant info for this socket
			$this->clients[] = $msgsock;
			$s_admin = array (
								  'key' => '',
								  'type' => 'rawsocket' , // either { rawsocket, websocket, ack }
								  'socket' => $msgsock ,
								  'ip' => $clientIP ,
								  'port' => $clientPort ,
								  'login' => '',
								  'trusted' => '0'
							);
			
			// Can we trust this socket -> Is the client on our subnetwork?
			if (clientInSameSubnet($clientIP)) {
				$log->lwrite("s_recv:: client IP: ".$clientIP." in local subnet",2);
				$s_admin['trusted']	= '1';
			}
			
			// Append to Admin Array
			$this->sockadmin[] = $s_admin;
			
			// remove rsock from read
			$key = array_search($this->rsock, $this->read);
			if (false === $key)
				$log->lwrite("s_recv:: ERROR: unable to find key: ".$key." in the read array");
			else {
				$log->lwrite("s_recv:: Masking rsock from read array, key: ".$key,3);
				unset($this->read[$key]);
			}
		}
		
		// STREAM SOCKET MESSAGE?
		// Handle incoming messages. Messages come in on one of the sockets we connected to.
		// As we handle incoming messages immediately. Set the sender socket in private var
		// so the s_Send command knows where to send response to for last message
		
		$log->lwrite("s_recv:: checking for data on sockets of this->read",3);
		foreach ($this->read as $key => $client) 
		{
				$akey = array_keys($this->clients, $client);	// Key in the client array (and admin array)
				$ckey = $akey[0];

				$log->lwrite("s_recv:: key: ".$key." (ckey = ".$ckey.") has data",3);
				$this->ssock = $client;							// Send replies for client to this address
				
				$buf = @socket_read($client, 2048, PHP_BINARY_READ);
				if ($buf === false ) 
				{
					// Error,  close socket and display message
					$err = socket_last_error($client);
					
					if ($err === 104) {
						$log->lwrite("s_recv:: socket_read failed: ".$this->sockadmin[$ckey]['ip']." - Connection reset by peer");		
						$this->s_close($ckey);
					}
					else {
						$log->lwrite("s_recv:: socket_read failed: ".socket_strerror($err));
					}
					$log->lwrite("s_recv:: socket marked unset: ".$key." error: ".$err,3);
					// We need to find the key in clients and NOT in read!!!
					unset($this->clients[$ckey]);
					unset($this->sockadmin[$ckey]);
					continue;
				}
				
				// Select returns client with empty messages, means closed connection
				//
				else 
				if (empty($buf)) {
					socket_getpeername($client, $clientIP, $clientPort);
					$log->lwrite("s_recv:: buffer empty for key: ".$key.", IP".$clientIP.":".$clientPort,3);
					// empty read means..... should be closing socket....
					$this->s_close($ckey);
					unset($this->clients[$ckey]);
					unset($this->sockadmin[$ckey]);
					continue;
				}
				
				// Websockets send a header back upon connect to upgrade the connection
				// First see if this is a websocket request, and do the upgrade connection. 
				// First characters are 'GET' for Websockets
				//
				if (substr($buf,0,3) == "GET" ) {
					$this->sockadmin[$ckey]['type'] = 'websocket';
					socket_getpeername($client, $clientIP, $clientPort);
					$log->lwrite("s_recv:: Upgrade request for ".$this->sockadmin[$ckey]['ip'].":".$this->sockadmin[$ckey]['port'],3);
					$log->lwrite("s_recv:: Upgrade request for ".$clientIP.":".$clientPort." \n".$buf." ",3);
					$this->s_upgrade($buf, $client, $serverIP, $rcv_daemon_port); //perform websocket handshake
					continue;
				}
				
				// If this is an upgraded connection, use s_unmask and json_decode to view buffer
				//
				$log->lwrite("s_recv:: ckey: ".$ckey.", clientIP: ".$clientIP,3);
				$log->lwrite("s_recv:: ckey: ".$ckey.", this clientIP: ".$this->clientIP,3);
				$log->lwrite("s_recv:: sockettype: ".$this->sockadmin[$ckey]['type'],3);
				$log->lwrite("s_recv:: sockadmin ip: ".$this->sockadmin[$ckey]['ip'].", trusted:".$this->sockadmin[$ckey]['trusted'],3);
				
				$this->clientIP = $this->sockadmin[$ckey]['ip'];
				if ($this->sockadmin[$ckey]['type'] == 'websocket' ) 
				{
					$ubuf = $this->s_unmask($buf);
					return($ubuf);							// json array object
				}
				
				// type must be a rawsocket
				else if ($this->sockadmin[$ckey]['type'] == 'rawsocket' ) 
				{
					if ($debug>2) {
							$i2=time();
							socket_getpeername($client, $clientIP, $clientPort);
							$log->lwrite("s_recv:: Raw buf from IP: ".$clientIP.":".$clientPort
									.", buf: <".$buf.">, in ".($i2-$i1)." seconds");
					}
					return($buf);
				}
				
				// Unknown type (I guess)
				else {
					$i2=time();
					$log->lwrite("ERROR s_recv:: Unknown type buf ".$this->sockadmin[$ckey]['type']."from IP: ".$clientIP.":".$clientPort
									.", buf: <".$buf.">, in ".($i2-$i1)." seconds",1);
				}
		}//for
		return(-1);	
	}// s_recv
	

	
	// Do we trust the current client?
	//
	//
	public function s_trusted() {
		global $debug;
		global $log;
		
		$akey = array_keys($this->clients, $this->ssock);
		if (count($akey) == 0) {
			$log->lwrite("s_trusted:: Socket not present anymore in client array",3);
			return(0);
		}
		$ckey = $akey[0];
		$log->lwrite("s_trusted:: ckey: ".$ckey." checking clientIP: ".$this->clientIP,3);
		$log->lwrite("s_trusted:: ckey: ".$ckey." checking sockadmin IP: ".$this->sockadmin[$ckey]['ip'],3);
		$log->lwrite("s_trusted:: ckey: ".$ckey." checking sockadmin Trusted: ".$this->sockadmin[$ckey]['trusted'],3);
		if (( $this->sockadmin[$ckey]['trusted'] == "1" ) ||
			( $this->clients[$ckey]['socket'] == $this->rsock) ||				 
			( $this->clientIP == "127.0.0.1") ) 
		{
			$log->lwrite("s_trusted returned success for IP ".$this->sockadmin[$ckey]['ip'],3);
			return(1);						// trust
		}
		return(0);
	}
	
	// This function ONLY sets the wait time for the next SELECT call
	// and prepares the listening structure for the SELECT call
	//
	public function s_wait($sec) {
		global $debug;
		global $log;
		global $interval;
		
		if (!is_resource($this->rsock)) {						// Not really necessary now
			$log->lwrite("s_wait:: Reopening socket",1);
            $this->s_open();
        }
		if (!is_resource($this->usock)) {						// Need to open this socket some time
            $this->s_uopen();
		}
		$this->read = array();
		$this->read[] = $this->usock;							// Listen to the datagram socket
		$this->read[] = $this->rsock;							// Listen to the general stream receive socket
		$this->read = array_merge($this->read,$this->clients);
		
		// Could be that due to longer execution the first queue item timed by qtime should
		// already be running. Su qtime is 0 or even -1 or so. In this case make it 0, and usecs 100.
		if ($sec < 0) $sec=0;
		if ($sec > $interval) $sec = $interval;
		
		$log->lwrite( "s_wait:: set wait to ".$sec." seconds",3);
		$this->wait = $sec;
		return(0);
	}//s_wait
	
} //class Sock

?>
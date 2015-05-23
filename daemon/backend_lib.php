<?php 
require_once( dirname(__FILE__).'/../config/backend_cfg.php' );

// This file contains a number of supporting functions for the LamPI-daemon.php process.
// - Database Functions
// - Initialization, 
// - Login and Cookies
// - Device Commununication functions
//error_reporting(E_ALL);
error_reporting(E_ERROR | E_PARSE | E_NOTICE);				// For a daemon, suppress warnings!!

header("Cache-Control: no-cache");
header("Content-type: application/json");					// Input and Output are XML coded

session_start();
if (!isset($_SESSION['debug']))	{ $_SESSION['debug']=1; }
if (!isset($_SESSION['tcnt']))	{ $_SESSION['tcnt'] =0; }

// ************************* Supporting Functions **********************************

//	--------------------------------------------------------------------------------	
//	function decho. 
//	Subsitute of echo function. Does only print if the level 
//	specified is larger than the value in the session var.
//	Session var can be set on URL with yoursite.com?debug=2
//	--------------------------------------------------------------------------------	*/
function decho($str,$lev=2) 
{
	global $apperr;
	
	if ($_SESSION['debug'] >= $lev ) {
//		echo $str;
		$apperr .= $str."\n";
	}
}



/** ---------------------------------------------------------------------------------- 
 * Check if a client IP is in our Server subnet
 *
 * @param string $client_ip
 * @param string $server_ip
 * @return boolean
 *
 * Original function taken from internet, but modified to read server address from ifconfig
 * It provides a solution, even for multiple adpters, provided they are all in same subnet.
 * If we use PHP as a server, then we are NOT sure about the used IP address, 
 * especially if we rely on /etc/hosts as a guide (127.0.1.1)
 * as we might manually set the IP address in /etc/network/interfaces
 * Therefore, best is to use ifconfig output and scan for that interface that has a Bcast
 * next to the inet address.
 */
function clientInSameSubnet($client_ip=false,$server_ip=false) {
	global $log;
    if (!$client_ip)
        $client_ip = $_SERVER['REMOTE_ADDR'];
    //if (!$server_ip) {
    //    $server_ip = $_SERVER['SERVER_ADDR'];	// For a daemon, this does NOT work
	//}
    // Extract broadcast and netmask from ifconfig
    if (!($p = popen("/sbin/ifconfig","r"))) return false;
    $out = "";
    while(!feof($p))
        $out .= fread($p,1024);
    
    $match  = "/^.*inet addr:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})";
    $match .= ".*Bcast:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})";
    $match .= ".*Mask:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/im";
	
    if (!preg_match($match,$out,$regs)) {
		$log->lwrite("clientInSameSubnet preg_match failed");
        return false;
	}
	$log->lwrite("clientInSameSubnet:: Inet: ".$regs[1].", Bcast: ".$regs[2].", Mask: ".$regs[3],3);
	$server_ip = $regs[1];
    $bcast = ip2long($regs[2]);
    $smask = ip2long($regs[3]);
    $ipadr = ip2long($client_ip);
	if ($client_ip == '127.0.0.1') return(1);				// localhost is local subnet too.
    $nmask = $bcast & $smask;
    return (($ipadr & $smask) == ($nmask & $smask));
}




// --------------------------------------------------------------------------------------
// Logging class:
// - contains lfile, lwrite and lclose public methods
// - lfile sets path and name of log file
// - lwrite writes message to the log file (and implicitly opens log file)
// - lclose closes log file
// - first call of lwrite method will open log file implicitly
// - message is written with the following format: [d/M/Y:H:i:s] (script name) message
//
class Logging {

    // declare log file and file pointer as private properties
    private $log_file, $fp;
	
    // set log file (path and name)
    public function lfile($path) {
        $this->log_file = $path;
    }
	
    // write message to the log file
    public function lwrite($message,$dlevel=false) {
		global $debug;
		// If we specify a minimum debug level required to log the message
		if (($dlevel) && ($dlevel>$debug)) return(0);
        // if file pointer doesn't exist, then open log file
        if (!is_resource($this->fp)) {
            $this->lopen();
        }
        // define script name
        $script_name = pathinfo($_SERVER['PHP_SELF'], PATHINFO_FILENAME);
        // define current time and suppress E_WARNING if using the system TZ settings
        // (don't forget to set the INI setting date.timezone)
        $time = @date('[d/M/y, H:i:s]');
        // write current time, script name and message to the log file
        fwrite($this->fp, "$time ($script_name) $message" . PHP_EOL);
    }
	
    // close log file (it's always a good idea to close a file when you're done with it)
    public function lclose() {
        fclose($this->fp);
    }
	
    // open log file (private method)
    private function lopen() {
        // in case of Windows set default log file
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $log_file_default = 'c:/php/logfile.txt';
        }
        // set default log file for Linux and other systems
        else {
            $log_file_default = '/tmp/logfile.txt';
        }
        // define log file from lfile method or use previously set default
        $lfile = $this->log_file ? $this->log_file : $log_file_default;
        // open log file for writing only and place file pointer at the end of the file
        // (if the file does not exist, try to create it)
        $this->fp = fopen($lfile, 'a') or exit("Can't open $lfile!");
    }
}



//	-----------------------------------------------------------------------------------	
//	The function received/reads a jSon message from the client
//	side and decodes it. After decoding, the resulting
//	datastructure will be written to file.
//	The datastructure describes the configuration of the ICS-1000/PI controller
//	----------------------------------------------------------------------------------	*/
function store_database($inp)
{
	$dec = json_decode($inp);
	return(2);	
}


// ---------------------------------------------------------------------------------
// function parse_controller_cmd(cmd);
//
// XXX We may have to update the devices object every now and then,
// in order to sync with the front-end...
//
function parse_controller_cmd($cmd_str)
{	global $log;
	global $debug;
	global $devices;
	global $brands;
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON =>  
	$brand="-1";
	// Decode the room, the device and the value from the string
	list( $room, $dev, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$dev = "D".$dev;												// All devices recorded have D1--D16 as id
	for ($i=0; $i<count($devices); $i++) {
		$log->lwrite("parse_controller_cmd:: room: ".$devices[$i]['room'].", dev: ".$devices[$i]['id'].", brand: ".$devices[$i]['brand'],3);
		if ( ($devices[$i]['room']==$room) && ($devices[$i]['id']==$dev)) {
			$bno = $devices[$i]['brand'];
			$brand=$brands[$bno]['fname'];				// XXX NOTE: The index in brand array IS the id no!!!
			if ($debug>0) $log->lwrite("parse_controller_cmd:: room: ".$room.", dev: ".$dev.", brand: ".$brand);
			break;
		}
	}
	return($brand);
}

// *********************************** JSON AND CODING FUNCTIONS *********************************************


function json_clean_decode($json, $assoc = false, $depth = 512, $options = 0) {
    // search and remove comments like /* */ and //
    $json = preg_replace("#(/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*+/)|([\s\t]//.*)|(^//.*)#", '', $json);
   
    if(version_compare(phpversion(), '5.4.0', '>=')) {
        $json = json_decode($json, $assoc, $depth, $options);
    }
    elseif(version_compare(phpversion(), '5.3.0', '>=')) {
        $json = json_decode($json, $assoc, $depth);
    }
    else {
        $json = json_decode($json, $assoc);
    }

    return $json;
}


// *********************************** SOCKET AND DAEMON FUNCTIONS *********************************************


//	--------------------------------------------------------------------------------------------------	
// function send_2_daemon. (... send it to the daemon to sort it out ....)
//
// Send a command to the LamPI daemon process for execution. For the moment we'll stick to the 
// protocol that is used by the ICS-1000 controller, but we might over time change to json format.
//
// Return values: -1 if fail, transaction number if success
//
// Since version 1.4 we use json, so for the LamPI daemon the message format has changed somewhat.
//
// In the first release of daemon command, it is used to send scene commands to the daemon,
// that will be parsed and then the individual commands in the scene will be inserted in the run 
// queue.
//
// $myIP is optional parameter specifying the IP address that the command should be sent to.
//
// XXX timer commands will be handled by the daemon itself as it parses the timer database
// about every minute for changed or new scene items.
// So the Queue is used for scenes (run now, or a time from now and for timers (run on some
// (or several) moment (agenda) in the future
// -----------------------------------------------------------------------------------------------------
function send_2_daemon($cmd,$myIP=false)
{
// Initializations
	global $apperr;
	global $appmsg;
	global $rcv_daemon_port;
	global $snd_daemon_port;
	global $log;
	global $debug;
	
    $rport = $rcv_daemon_port;								// Remote Port for the client side, to recv port server side
	
    $_SESSION['tcnt']++;
    if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }		// Overflow

	// We will use json for encoding the messages to the daemon 
	// Message looks as follows:
	$snd = array(
    	'tcnt' => $_SESSION['tcnt'],
    	'action' => 'gui',
		'type' => 'raw',
		'message'=> $cmd
    );
	$cmd_pkg = json_encode($snd);
	
    if ($debug>=2) $apperr .= "daemon_cmd:: cmd_pkg: $cmd_pkg";
    
    $ok='';
    $from='';
    $buf="1";
    $rec=0;

// Initiate Networking

    // socket_set_option($ssock, SOL_SOCKET, SO_BROADCAST, 1); 
	
    $rsock = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
    if (!socket_set_option($rsock, SOL_SOCKET, SO_REUSEADDR, 1)) // Re-use the port, do not block
    { 
		$apperr .= socket_strerror(socket_last_error($rsock)); 
		return(-1); 
    }

	// Get IP for this host ... As this is the webserver, we can find out which address to use
	//$ip = $_SERVER['SERVER_ADDR'];
	//$ip = '192.168.2.51';
	//$ip = '127.0.0.1';					// Works for webservices but not for remote work
	
	$ip = '0.0.0.0';
	// overrule in case we did specify an IP address as optional argument to the function
	if ($myIP) $ip = $myIP;
	if (socket_connect($rsock, $ip, $rport) === false)			
    {
       socket_close($rsock);
       $apperr .= 'socket_connect to '.$ip.':'.$rport.' failed: '.socket_strerror(socket_last_error())."\n";
	   return (-1);
    }
	
    $apperr = "socket_connect to address:port ".$ip.":".$rport." success<br>";	

    if (false === socket_write($rsock, $cmd_pkg, strlen($cmd_pkg)))
    {
      $apperr .= 'socket_send address - failed: ' ."<br>";
      socket_close($rsock);
      return(-1);
    }
    $apperr = "socket_send address - success<br>, buffer sent: ".$cmd_pkg;

	if(!socket_set_block($rsock))
    {
      socket_close($rsock);
      $apperr .= "socket_set_block: Error<br>";
	  return(-1);
    }							
	
	// Set timeout for command
	$timeo = array('sec' => 2, 'usec' => 0);
	if ( ! socket_set_option($rsock,SOL_SOCKET,SO_RCVTIMEO, $timeo)) {
		$apperr .= "Cannot set socket option TIMEO on receive socket<br>";
		return(-1);
	}
	
	// We may receive an answer immediately (just an ack) or we can timeout in 2 secs or so
    //if (!socket_recvfrom($rsock, $buf, 1024, MSG_WAITALL, $from, $rport))
	;
	if (false === ( $len = socket_recv($rsock, $buf, 1024, 0)))
    {
      $err = socket_last_error($rsock);
      $apperr .= 'socket_recv failed with error '.$err.': '.socket_strerror($err) . "<br>";
	  socket_close($rsock);
	  return(-1);
    };
	$apperr .= "bytes read: ".$len;
	$apperr .= ", buf: <".$buf.">";

// Need to check if the confirmation from the server matches the transaction id

	if (null == ($rcv = json_decode($buf, true) )) {
		$apperr .= " NULL ";
	}
	$ok = $rcv['message'];
	$tn = $rcv['tcnt'];

	$apperr .= "message <".$rcv['message'].">";
    //$apperr .= "Sent <$cmd_pkg> , rcvd <".$buf.">, transaction ".$tn." is ".$ok;
    
	if (socket_shutdown($rsock) == false) {
			$apperr .= "send_2_daemon:: socket shutdown failed";
	}
    socket_close($rsock);

	if (strcmp($ok,"OK") == 0) {
		return($tn); 
	} 
	else {
		$apperr .= "Nah";
		return(-1); 
	}
}



// ********************************** DEVICE HANDLING FUNCTIONS *******************************************
//
// XXX NOTE: Device functions are handled by LamPI-receiver program from now ...
// Functions below become obsolete
//
// Although I have written some wiringPI code myself, I must rely on shell programs
// written by others as well (see the sources in ~/src/xxxxx for more detail.
//
//	kaku_cmd
//	action_cmd:		IMPULS switches bought from action in the Netherlands
//	old_kaku_cmd
//	blokker_cmd		XXX not tested, I do not have these myself, so may have to adapt
//
// **********************************************************************************


// ---------------------------------------------------------------------------------- 
// Function kaku_cmd
//
// Handles a specific Kaku command like !R3D10F1 which means Room 3, Device 10, Lamp on
// The sytax of the commands is equal to that which is sent to the iCS_1000 controller
// for compatibility reasons.
// Should we not already have a ICS-1000, then json would have been a better option!
//
function kaku_cmd($cmd_str)
{
	// Initializations
	global $apperr;
	global $appmsg;
	global $wiringPi_snd;					// pin number set in backend_cfg.php file
	global $log;
	
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON => ./kaku -g 100 -n 2 on 
	
	$_SESSION['tcnt']++;
	if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow
	
	// Make a translation table
	$ttable = array(
		'1'  => '100', 		'2'  => '101',		'3'  => '102',		'4'  => '103',
		'5'  => '104',		'6'  => '105',		'7'  => '106',		'8'  => '107',
		'9'  => '108',		'10' => '109',		'11' => '110',		'12' => '111',
		'13' => '112',		'14' => '113',		'15' => '114',		'16' => '115'		
		);
	// Decode the room, the device and the value from the string
	list( $room, $device, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$result  = " -p ".$wiringPi_snd;
	$result .= " -g ".$ttable[$room];
	$result .= " -n ".$device." " ;
	
	// In case it is a dim command
	if (substr($value, 0, 2 ) == "dP" ) {
		$value = ceil( (substr($value, 2) /2)) -1;				// Command line interface accepts 4 bits !!
		$result .= $value;
	} else 
	// in face F1
	if ($value == '1' ) {
		$result .= "on";
	} 
	else if ($value == 'o') {
		// Fo, use last dimmer value
		// XXX not yet, and not needed at the moment
		$result .= "on";
	}
	else {
		// F0, switch off
		$result .= "off";
	}
	
	$apperr = "kaku_cmd cmd_str: ".$cmd_str." , room: ".$room." device: ".$device." value: ".$value."\n";
	//store_device(); // QQQ 
	
	// sudo ./kaku string ...... Recompiled kaku to echo "OK" when returning
	// successfully. Necessary, if shell_exec executes command without output
	// then return value will be NULL (for some strange reason)
	$exec_str = 'cd /home/pi/exe; ./kaku '.$result ;
	// $log->lwrite("kakucmd:: ".$exec_str);
	
	if (shell_exec($exec_str . " 2>&1 && echo ' '")  === NULL ) {
		$apperr .= "\nERROR: kaku " . $result . "\n ";
		return (-1);
	}
	return($_SESSION['tcnt']);
}

// -----------------------------------------------------------------------------------------------
// Function old_kaku_cmd
//
// XXX Handles calls to old kaku equipment.
//
function old_kaku_cmd($cmd_str)
{
	// Initializations
	global $apperr;
	global $appmsg;
	global $wiringPi_snd;					// pin number set in backend_cfg.php file
	global $log;
	
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON => ./kaku A 
	
	$_SESSION['tcnt']++;
	if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow
	
	// Make a translation table
	$ttable = array(
		'1'  => 'A', 		'2'  => 'B',		'3'  => 'C',		'4'  => 'D',
		'5'  => 'E',		'6'  => 'F',		'7'  => 'G',		'8'  => 'H',
		'9'  => 'I',		'10' => 'J',		'11' => 'K',		'12' => 'L',
		'13' => 'M',		'14' => 'N',		'15' => 'O',		'16' => 'P'		
		) ;
	list( $room, $device, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$result = $ttable[$room] . " " . $device . " " ;
	
	// In case it is a dim command
	if (substr($value, 0, 2 ) == "dP" ) {
		$value = substr($value, 2);
		$result .= $value;
	} else 
	// in case F1
	if ($value == '1' ) {
		$result .= "on";
	} else {
	// mus be F0
		$result .= "off";
	}
	
	$apperr = "\nold_kaku:: cmd_str: ".$cmd_str." , room: ".$room." device: ".$device." value: ".$value."\n";	
	$appmsg .= ", result rasp_cmd: " . $result . ".";	
	
	// sudo ./kaku string ...... then webuser must be in sudoers
	$exec_str = 'cd /home/pi/exe; ./kakuold '. $result .'' ;
	
	if (shell_exec($exec_str . " 2>&1")  === NULL ) {
		$apperr .= "\nERROR: Shell_exec: " . $exec_str . "\n ";
		return (-1);
	}
	return($_SESSION['tcnt']);
}

// -----------------------------------------------------------------------------------------------
// FUNCTION ACTION_CMD
//
// Handles calls to Action/Impuls equipment.
// 
//
function action_cmd($cmd_str)
{
	// Initializations
	global $apperr;
	global $appmsg;
	global $wiringPi_snd;					// pin number set in backend_cfg.php file
	global $log;
	
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON => ./action 1 B on 
	
	$_SESSION['tcnt']++;
	if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow

	// Make a translation table
	$ttable = array(
		'1'  => 'A', 		'2'  => 'B',		'3'  => 'C',		'4'  => 'D',
		'5'  => 'E',		'6'  => 'F',		'7'  => 'G',		'8'  => 'H',
		'9'  => 'I',		'10' => 'J',		'11' => 'K',		'12' => 'L',
		'13' => 'M',		'14' => 'N',		'15' => 'O',		'16' => 'P'		
		) ;
	
	list( $room, $device, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$result  = " -p ".$wiringPi_snd;
	$result .= " -g ".$room;
	$result .= " -n ".$ttable[$device]." " ;
	//$result = $room . " " . $ttable[$device] . " " ;
	
	// In case it is a dim command
	if (substr($value, 0, 2 ) == "dP" ) {
		$value = substr($value, 2);
		$result .= $value;
	} else 
	// in case F1
	if ($value == '1' ) {
		$result .= "on";
	} else {
	// F0
		$result .= "off";
	}
	
	//$apperr .= "\nparse cmd_str: ".$cmd_str." , room: ".$room." device: ".$device." value: ".$value."\n";	
	$appmsg .= ", result rasp_cmd: ".$result.".";	
	
	// sudo ./action string ...... 
	$exec_str = 'cd /home/pi/exe; ./action '.$result.'' ;
	$log->lwrite("action_cmd:: ".$exec_str);
	if (shell_exec($exec_str . " 2>&1 && echo ' '") === NULL ) {
		$apperr .= "\nERROR: Shell_exec: ".$exec_str."\n ";
		return (-1);
	}
	return($_SESSION['tcnt']);
}

// -----------------------------------------------------------------------------------------------
// FUNCTION ELRO_CMD
//
// Handles calls to Elro equipment.
// 
//
function elro_cmd($cmd_str)
{
	// Initializations
	global $apperr;
	global $appmsg;
	global $wiringPi_snd;					// pin number set in backend_cfg.php file
	global $log;
	
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON => ./kaku A 
	
	$_SESSION['tcnt']++;
	if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow

	// Make a translation table
	$ttable = array(
		'1'  => 'A', 		'2'  => 'B',		'3'  => 'C',		'4'  => 'D',
		'5'  => 'E',		'6'  => 'F',		'7'  => 'G',		'8'  => 'H',
		'9'  => 'I',		'10' => 'J',		'11' => 'K',		'12' => 'L',
		'13' => 'M',		'14' => 'N',		'15' => 'O',		'16' => 'P'		
		) ;
	
	list( $room, $device, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$result = $room . " " . $ttable[$device] . " " ;
	
	// In case it is a dim command
	if (substr($value, 0, 2 ) == "dP" ) {
		$value = substr($value, 2);
		$result .= $value;
	} else 
	// in face F1
	if ($value == '1' ) {
		$result .= "on";
	} else {
		// F0
		$result .= "off";
	}
	
	//$apperr .= "\nparse cmd_str: ".$cmd_str." , room: ".$room." device: ".$device." value: ".$value."\n";	
	$appmsg .= ", result rasp_cmd: " . $result . ".";	
	
	// sudo ./action string ...... 
	//
	$exec_str = 'cd /home/pi/exe; ./elro '. $result .'' ;
	if (shell_exec($exec_str . " 2>&1 && echo ' '") === NULL ) {
		$apperr .= "\nERROR: Shell_exec: " . $exec_str . "\n ";
		return (-1);
	}
	return($_SESSION['tcnt']);
}

// -----------------------------------------------------------------------------------------------
// FUNCTION BLOKKER_CMD
//
// Handles calls to Blokker equipment.
// 
//
function blokker_cmd($cmd_str)
{
	// Initializations
	global $apperr;
	global $appmsg;
	global $wiringPi_snd;					// pin number set in backend_cfg.php file
	global $log;
	
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON => ./kaku A 
	
	$_SESSION['tcnt']++;
	if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow

	// Make a translation table
	$ttable = array(
		'1'  => 'A', 		'2'  => 'B',		'3'  => 'C',		'4'  => 'D',
		'5'  => 'E',		'6'  => 'F',		'7'  => 'G',		'8'  => 'H',
		'9'  => 'I',		'10' => 'J',		'11' => 'K',		'12' => 'L',
		'13' => 'M',		'14' => 'N',		'15' => 'O',		'16' => 'P'		
		) ;
	
	list( $room, $device, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$result = $room . " " . $ttable[$device] . " " ;
	
	// In case it is a dim command
	if (substr($value, 0, 2 ) == "dP" ) {
		$value = substr($value, 2);
		$result .= $value;
	} else 
	// in face F1
	if ($value == '1' ) {
		$result .= "on";
	} else {
		// F0
		$result .= "off";
	}
	
	//$apperr .= "\nparse cmd_str: ".$cmd_str." , room: ".$room." device: ".$device." value: ".$value."\n";	
	$appmsg .= ", result rasp_cmd: " . $result . ".";	
	
	// sudo ./action string ...... 
	//
	$exec_str = 'cd /home/pi/exe; ./blokker '. $result .'' ;
	if (shell_exec($exec_str . " 2>&1 && echo ' '") === NULL ) {
		$apperr .= "\nERROR: Shell_exec: " . $exec_str . "\n ";
		return (-1);
	}
	return($_SESSION['tcnt']);
}

// ---------------------------------------------------------------------------------- 
// Function livolo_cmd
//
// Handles a specific Kaku command like !R3D10F1 which means Room 3, Device 10, Lamp on
// The sytax of the commands is equal to that which is sent to the iCS_1000 controller
// for compatibility reasons.
// Should we not already have a ICS-1000, then json would have been a better option!
//
function livolo_cmd($cmd_str)
{
	// Initializations
	global $apperr;
	global $appmsg;
	global $wiringPi_snd;					// pin number set in backend_cfg.php file
	global $log;
	
	// Parse the cmd_str on the ICS way and translate to Raspberry commands
	// !R1D2F1 Room 1, Device 2, ON => ./kaku -g 100 -n 2 on 
	
	$_SESSION['tcnt']++;
	if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow
	
	// Make a translation table
	$ttable = array(
		'1' => '23783', 
		'2' => '23783'		
		);
	
	// Decode the room, the device and the value from the string
	list( $room, $device, $value ) = sscanf ($cmd_str, "!R%dD%dF%s" );
	$result  = " -p ".$wiringPi_snd;
	$result .= " -g ".$ttable['1'];								// XXX This is not correct, need to extract the addr
	$result .= " -n ".$device." " ;
	
	// In case it is a dim command
	if (substr($value, 0, 2 ) == "dP" ) {
		$value = ceil( (substr($value, 2) /2)) -1;				// Command line interface accepts 4 bits !!
		$result .= $value;
	} else 
	// in face F1
	if ($value == '1' ) {
		$result .= "on";
	} 
	else if ($value == 'o') {
		// Fo, use last dimmer value
		// XXX not yet, and not needed at the moment
		$result .= "on";
	}
	else {
		// F0, switch off
		$result .= "off";
	}
	
	$apperr = "livolo_cmd cmd_str: ".$cmd_str." , room: ".$room." device: ".$device." value: ".$value."\n";
	//store_device(); // QQQ 
	
	// sudo ./kaku string ...... Recompiled kaku to echo "OK" when returning
	// successfully. Necessary, if shell_exec executes command without output
	// then return value will be NULL (for some strange reason)
	$exec_str = 'cd /home/pi/exe; ./livolo '.$result ;
	
	if (shell_exec($exec_str . " 2>&1 && echo ' '")  === NULL ) {
		$apperr .= "\nERROR: livolo " . $result . "\n ";
		return (-1);
	}
	
	return($_SESSION['tcnt']);
}


?>
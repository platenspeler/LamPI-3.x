<?php 
require_once ( dirname(__FILE__) . '/../config/backend_cfg.php' );
require_once ( dirname(__FILE__) . '/frontend_lib.php' );

// This is the backend php script for th e handling of ICS-1000 communication.
// I do have the program more or less up and running, but one of the near future
// extentions will be that I like to have an alternative 433 MHZ transmitter
// installed thta will be connected to a Raspberry.
// At that time the iCS will not be the only KAKU controller in my home
// KAKU commands will be dealt with by another backend program then.

// The ICS-1000 is a statefule machine where scenes and timers are concerned,
// but because the KAKU protocol is stateless all device interactions may or
// may not take place.

// NOTE: The calling ajax front-end can specify ANY function, but only these are supported
// by this file as specified below:

// Functions:
//
// load_database(); Load all rooms, devices, scenes and config FROM database
// store_database();	-- recognized but not yet implemenented --
// store_device(room_id, device_id, device); Store ONE device record in the database, keys room_id and device_id
//
// delete_room(room_id)
// delete_device(device_id)
// store_scene(scene_id, scene)
// store_timer(timer_id, timer)

/*	-------------------------------------------------------	
	Note: Program to switch klikaanklikuit and coco equipment
	Author: Maarten Westenberg
	Date: August 16, 2013

	-------------------------------------------------------	*/
error_reporting(E_ALL);
header("Cache-Control: no-cache");
header("Content-type: application/json");					// Input and Output are XML coded


session_start();
if (!isset($_SESSION['debug']))	{ $_SESSION['debug']=0; }
if (!isset($_SESSION['tcnt']))	{ $_SESSION['tcnt'] =0; }

$apperr = "";	// Global Error. Just append something and it will be sent back
$appmsg = "";	// Application Message (from backend to Client)


/*	-------------------------------------------------------	
	function lamp_cmd. 
	Execute one command for the ICS-1000 system.
	input: The command string for the ICS-1000 (see documentation)
	return: -1 if fail,
			transaction number if success
	-------------------------------------------------------	*/
function ics_cmd($cmd_str)
{
// Initializations
	global $apperr;
	global $appmsg;
	
    $sport = "9760";										// Send Port
    $rport = 0;												// Receive port
    $_SESSION['tcnt']++;
    if ($_SESSION['tcnt']==999) { $_SESSION['tcnt'] = 1; }	// Overflow

    $cmd_pkg = sprintf('%03d,%s\r\n', $_SESSION['tcnt'] , $cmd_str); 
    decho("The cmd_pkg is: $cmd_pkg<br>", 3);
    
    $ok='';
    $from='';
    $buf="1";
    $rec=0;

// Initiate Networking
					
    $ssock = socket_create(AF_INET, SOCK_DGRAM, SOL_UDP); 
    socket_set_option($ssock, SOL_SOCKET, SO_BROADCAST, 1); 
    decho("socket_set_options for sending success<br>",3);

    $rsock = socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
    if (!socket_set_option($rsock, SOL_SOCKET, SO_REUSEADDR, 1)) // Re-use the port, do not block
    { 
		echo socket_strerror(socket_last_error($rsock)); 
		return(-1); 
    }

//  $ip = getHostByName(php_uname('n'));					// Get IP for this host ...
//	if (!socket_bind($rsock, $ip, 9761))					// Set listen port to 9761, on my IP
    if (!socket_bind($rsock, '0.0.0.0', 9761))				// Set listen port to 9761, on any address
//    if (!socket_bind($rsock, '192.168.2.159', 9761))		// Set listen port to 9761, on my IP
    {
       socket_close($rsock);
       decho('socket_bind failed: '.socket_strerror(socket_last_error())."\n",2);
    }
    decho("socket_bind success<br>",3);						// print at debug level 3 or higher
    if(!socket_set_block($rsock))
    {
	  socket_close($ssock);
      socket_close($rsock);
      decho("socket_set_block: Error<br>",3);
	  return(-1);
    }							
    
    decho("Broadcasting message <$cmd_pkg>. <br>",3);				
    if (!socket_sendto($ssock, $cmd_pkg, strlen($cmd_pkg), 0, '255.255.255.255', $sport))
    {
      decho('socket_sendto failed: ' ."<br>",3);
      socket_close($ssock);
      socket_close($rsock);
      return(-1);
    }
    decho("socket_sendto success<br>",3);

    if (!socket_recvfrom($rsock, $buf, 1024, MSG_WAITALL, $from, $rport))
    {
      $err = socket_last_error($rsock);
      echo 'socket_recvfrom failed: Error nr is:' . $err . '<br>' ;
      echo 'socket_recvfrom failed: '.socket_strerror($err)."<br>";
    };

// Need to check if the confirmation from the server matches the transaction id

    decho("Received <$buf> from remote address <$from> and remote port <$rport><br>", 1);
    $len=strlen($buf);

    $i = strpos($buf,',');
	$tn = (int)substr($buf,0,$i); 
	$ok = substr($buf,$i+1,2);

    decho("Sent <$cmd_pkg> , received <$buf>, len=$len. transaction $tn is $ok<br>", 1);
    
    socket_close($ssock);
    socket_close($rsock);

	if (strcmp($ok,"OK")==0) {
		return($tn); 
	} 
	else {
		$apperr .= $buf;
		return(-1); 
	}
}

//
// At this moment we have two parsing functions defined which strictly spoken is nonsense
// Both $_GET and $_POST are supported, and both are in a separate function
// $_POST would be the best choice for this app, because although we use it probably in 
// a family friendly environment, we don't want anyone tampering ith the systm through the 
// URL
// That said, for testing $_GET offers a sort of command-line to set the backend in a controlled
// and defined state, and allows for setting debug vars etc. and therefore it is still threre

// NOTE: It is wuite good possible to route one command ONLY through get and the other ONLY
// through post. Or support both.

/*	-------------------------------------------------------
	function post_parse()
	
	-------------------------------------------------------	*/
function post_parse()
{
  global $appmsg;
  global $apperr;
  global $action;
  global $tim;
  global $icsmsg;
  
//  decho("Starting function post_parse";
		
	if (empty($_POST)) { 
		decho("No POST, ",1);
		return(-1);
	}

	foreach ( $_POST as $ind => $val )
	{
		switch ( $ind )
		{
			case "action":
				$action = $val;
			break;			
			
			case "message":
				$icsmsg = $val;
			break;			
		} // switch $ind
	} // for
} // function

/*	-------------------------------------------------------	
	function get_parse. 
	Parse the $_GET  for commands
	Commands may be lamp, load, message, style, debug
		In case of lamp, message contains its parameters
	-------------------------------------------------------	*/
function get_parse() 
{
  global $appmsg;
  global $apperr;
  global $action;
  global $tim;
  global $icsmsg;


  foreach ($_GET as $ind => $val )
//  foreach ($_POST as $ind => $val )
  {
    decho ("get_parse:: index: $ind and val: $val<br>",1);

    switch($ind) 
	{
	case "action":
			$action = $val;
	break;	
	case "message":
			$icsmsg = $val;
	break;
	case "debug":
		$_SESSION['debug'] = $val;
		decho("get_parse:: setting debug: $val <br>",2);
		if ($val > 1) 
		{
			$_SESSION['style'] = "/mwinc/style_debug.css";
		}
	break;
    } //   Switch ind
  }	//  Foreach
  
  return(0);
  
} // Func


/*	=======================================================	
	MAIN PROGRAM

	=======================================================	*/
//
// If necessary we can fake any background device operation and just
// return a success code as if the device has been sent a code
//
if ($fake == 1) 
{
	$send = array(
    'tcnt' => 100,
	'appmsg'=> 'Command Success',
    'status' => 'OK',
	'apperr'=> 'No Error',
    );
	$output=json_encode($send);
	echo $output;
	exit(0);
}

$ret = 0;

// Parse the URL sent by client
// post_parse will parse the commands that are sent by the java app on the client
// $_POST is used for data that should not be sniffed from URL line, and
// for changes sent to the devices
$ret = post_parse();

// Parse the URL sent by client
// get_parse will parse more than just the commands that are sent by the java app on the client
// it will also respond to other $_GET commands if you call the php file directly
// The URL commands are shown in the get_parse function
$ret = get_parse(); 


// Do Processing
switch($action)
{	case "kaku":
	case "lamp":
	case "scene":
		$appmsg .= "\naction: ";
		$appmsg .= $action;
		$appmsg .= ", icsmsg: ";
		$appmsg .= $icsmsg;
		$ret = ics_cmd($icsmsg); 
	break;
	
	case "action":
	case "blokker":
	case "alecto":
	case "elro":
		$apperr = "ICS-1000 controller does not do ".$action." commands\n" ;
		$apperr = "change controller to Rapsberry in config menu\n" ;
	break;
	
	default:
		$appmsg .= "action: " . $action;
		$apperr .= ", default, no command or command not recognized\n";
		$ret = 0; 
}

if ($ret >= 0) 
{
	$send = array(
    'tcnt' => $ret,
	'appmsg'=> $appmsg,
    'status' => 'OK',
	'apperr'=> $apperr,
    );
	$output=json_encode($send);
}
else
{	
	$apperr .= "ics_cmd returns error code";
	$send = array(
    	'tcnt' => $ret,
		'appmsg'=> $appmsg,
    	'status' => 'ERR',
		'apperr' => $apperr,
    );
	$output=json_encode($send);
}
echo $output;
flush();

?>
<?php 
require_once( dirname(__FILE__) . '/../config/backend_cfg.php' );
require_once( dirname(__FILE__) . '/frontend_lib.php' );

/* 
RASP
This is the backend php script for the handling of Raspberry communication.

NOTE: The calling ajax front-end can specify ANY function, but only these are supported
by this file as specified below:

Devices Commands:
- Every device must be coupled to a room/channel and to a free device code.
- Channels/Rooms are coded from A to M
- Channels 

Functions:
- kaku_cmd()	Execute ONE device command. The argument/command is following the 
				ICS-1000 command Set (v 1.3, feb 2012)

**** Other brands ***
Starting with release .3 of the code, other brands are supported as well.
- Action switches (3 switches for 8 Euro including a 5-channel remote)
				   
*/


/*	-------------------------------------------------------	
	Note: Program to switch klikaanklikuit and coco equipment
	Author: Maarten Westenberg
	Date: August 16, 2013

	-------------------------------------------------------	*/

$apperr = "";	// Global Error. Just append something and it will be sent back
$appmsg = "";	// Application Message (from backend to Client)

/*	-------------------------------------------------------
*	function post_parse()
*	
*	-------------------------------------------------------	*/
function post_parse()
{
	global $appmsg, $apperr, $action, $dmon_msg;	
	if (empty($_POST)) { 
		decho("call function post_parse without post",1);
		return(-1);
	}
	foreach ( $_POST as $ind => $val ) {
		switch ( $ind )
		{
			case "action":
				$action=$val;			// switch val
			break;
			
			case "message":
				$dmon_msg = $val;
			break;			
		} // switch $ind
	} // for
} // function



/*	=================================================================================	
	MAIN PROGRAM
	=================================================================================	*/

$ret = 0;

// Parse the URL sent by client
// post_parse will parse the commands that are sent by the java app on the client
// $_POST is used for data that should not be sniffed from URL line, and
// for changes sent to the devices

$ret = post_parse();


// Do Processing
switch($action)
{
	// Device commands are handled by the backend PHP programs
	case "kaku":
		$appmsg .= "\nkaku: ".$action.", dmon_msg: ".$dmon_msg;
		$ret = send_2_daemon($dmon_msg);
	break;
	
	case "action":
		$appmsg .= "\naction: ".$action.", dmon_msg: ".$dmon_msg;
		$ret = send_2_daemon($dmon_msg);
	break;
	
	// Scenes will be forwarded to the daemon
	case "scene":
		$appmsg .= "scene:: send_2_daemon: " .$dmon_msg. "\n";
		$ret = send_2_daemon($dmon_msg); 								// See above
	break;
	
	// Generic command to the daemon ... if necessary use json to format the command nicely
	case "send_2_daemon":
		$appmsg .= "send_2_daemon:: send_2_daemon: " .$dmon_msg. "\n";
		$ret = send_2_daemon($dmon_msg);
	break;
	
	default:
		$appmsg .= "action: " . $action;
		$apperr .= ", Rasp:".$action.", command not recognized\n";
		$ret = -1; 
}

if ($ret >= 0) 
{
	$send = array(
		'tcnt' => $ret,
		'status' => 'OK',
		'appmsg'=> $appmsg,
		'apperr'=> $apperr
    );
	$output=json_encode($send);
}
else
{	
	//$apperr .= $appmsg;
	$apperr .= "\nrasp returns error \n".$ret;
	$send = array(
    	'tcnt' => $ret,
    	'status' => 'ERR',
		'appmsg'=> $appmsg,
		'apperr'=> $apperr
    );
	$output=json_encode($send);
}
echo $output;
flush();

?>
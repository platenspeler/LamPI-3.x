<?php
define('__ROOT__', dirname(__FILE__)); 	// Find www root dir

require_once( dirname(__FILE__) . '/../config/backend_cfg.php' );
require_once( dirname(__FILE__) . '/frontend_lib.php' );

/*	------------------------------------------------------------------------------	
	Note: Program to switch klikaanklikuit and coco equipment
	Author: Maarten Westenberg
	Version 1.0 : August 16, 2013
	Version 1.2 : August 30, 2013 removed all init function from file into a separate file
	Version 1.3 : September 6, 2013 Implementing first version of Daemon process
	Version 1.4 : Sep 20, 2013
	Version 1.5 : Oct 20, 2013
	Version 1.6 : NOv 10, 2013
	Version 1.7 : Dec 2013
	Version 1.8 : Jan 18, 2014
	Version 1.9 : Mar 10, 2014
	Version 2.1 : Jul 31, 2014

NOTE: Starting release 1.3 the functions in this file will be called by .php AJAX handlers
	of the client side AND by the LamPI-daemon.php process. As of release 1.4 probably parts
	of the ajax code will disappear in favor of socket communication to daemon that will
	then handle further requests.
	
NOTE:
	Start initiating the database by executing: http://localhost/coco/frontend_set.php?load=1
	this will initialize the MySQP database as defined in init_dbase()
	
NOTE: This php file has NO memory other than what we store in SQL. This file is freshly
	called by the client for every database-like transaction. So do not expect arrays or other
	variables to have a certain value (based on previous actions)

Functions:
	load_database();			return code 1
	store_database; 			return code 2 reserved, not yet implemented 
	
	store_device($device);		return code 3 upon success, store new value of a device
	delete_device($device);		return code 4 upon succes, delete complete device
	store_scene($scene);		return code 8	
	add_room($room)				return code 7
	store_setting($setting);	return code 5 upon success
	add_device($device);		return code 6
	add_scene($scene)			return code 9
	delete_room($room)			return code 10
	delete_scene($scene)		return code 11
	add_timer($timer)			return code 12
	store_timer($timer);		return code 13
	
	-------------------------------------------------------------------------------	*/


$apperr = "";	// Global Error. Just append something and it will be sent back
$appmsg = "";	// Application Message (from backend to Client)


// ---------------------------------------------------------------------------------
// load_database()
//
// Load the complete database from mySQL into ONE $config object!
// 
// NOTE: This function is VERY sensitive to the right fields of the objects etc.
//		So make sure you have exactly the right number of argument and if you change
// the record/object definition in the configuration object, make sure that MySQL
// follows (frontend_set.php)
//
function load_database()
{
	// We assume that a database has been created by the user. host/name/passwd in backend_cfg.php
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	$config = array();
	$devices = array();
	$rooms = array();
	$scenes = array();
	$timers = array();
	$handsets = array();
	$settings = array();
	$controllers = array();
	$brands = array();
	$weather = array();
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL on host ".$dbhost." (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return(-1);
	}
	//mysqli_free_result($query);
	
	$sqlCommand = "SELECT * FROM devices";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$devices[] = $row ;
	}
	mysqli_free_result($query);
	
	$sqlCommand = "SELECT * FROM rooms";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$rooms[] = $row ;
	}
	mysqli_free_result($query);
	
	$sqlCommand = "SELECT * FROM scenes";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$scenes[] = $row ;
	}
	mysqli_free_result($query);

	$sqlCommand = "SELECT * FROM timers";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$timers[] = $row ;
	}
	mysqli_free_result($query);
	
	$sqlCommand = "SELECT * FROM settings";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$settings[] = $row ;
	}
	mysqli_free_result($query);	
	
	$sqlCommand = "SELECT * FROM handsets";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$handsets[] = $row ;
	}
	mysqli_free_result($query);

	$sqlCommand = "SELECT * FROM controllers";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$controllers[] = $row ;
	}
	mysqli_free_result($query);
	
	$sqlCommand = "SELECT * FROM brands";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$brands[] = $row ;
	}
	mysqli_free_result($query);
	
	$sqlCommand = "SELECT * FROM weather";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$weather[] = $row ;
	}
	mysqli_free_result($query);
	
	$config ['rooms']   = $rooms;
	$config ['devices'] = $devices;
	$config ['scenes']  = $scenes;
	$config ['timers']  = $timers;
	$config ['handsets']  = $handsets;
	$config ['settings']= $settings;
	$config ['controllers']= $controllers;
	$config ['brands']= $brands;
	$config ['weather']= $weather;
	
	mysqli_close($mysqli);
	$apperr = "";										// No error
	return ($config);
}


// ----------------------------------------------------------------------------------
//
// Store a device object as received from the ajax call and update mySQL
//
function store_device($device)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "store_device:: device id: ".$device[id]." room: ".$device[room]." val: ".$device[val]."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (".$mysqli->connect_errno.") ".$mysqli->connect_error, 1);
		return (-1);
	}
	
	// Update the database
	if (!mysqli_query($mysqli,"UPDATE devices SET gaddr='{$device[gaddr]}', val='{$device[val]}', lastval='{$device[lastval]}', name='{$device[name]}', brand='{$device[brand]}' WHERE room='$device[room]' AND id='$device[id]'" ))
	{
		$apperr .= "mysqli_query error" ;
//		$apperr .= "mysqli_query Error: " . mysqli_error($mysqli) ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "store_device successful\n" ;
	return(3);
}

/*	-----------------------------------------------------------------------------------
	Delete a device record from the database. This is one of the element functions
	needed to synchronize the database with the memory storage in the client, and
	prevents information loss between reloads of the screen.
	
	-----------------------------------------------------------------------------------	*/
function delete_device($device)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr = "delete_device:: id: ".$device[id]." room: ".$device[room]." val: ".$device[val]."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
	}
	
	$msg = "DELETE FROM devices WHERE id='$device[id]' AND room='$device[room]'";
	$apperr .= $msg;
	if (!mysqli_query($mysqli, "DELETE FROM devices WHERE id='$device[id]' AND room='$device[room]'" ))
	{
		$apperr .= "mysqli_query error" ;

	}
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "delete_device successful\n" ;
	return(4);
}

// ----------------------------------------------------------------------------------
//
// Add a device object as received from the ajax call and update mySQL
//
// ----------------------------------------------------------------------------------- */
function add_device($device)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr = "add_device:: id: ".$device[id]." room: ".$device[room]." val: ".$device[val]."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (".$mysqli->connect_errno.") ".$mysqli->connect_error,1);
		return (-1);
	}
	
	if (!$mysqli->query("INSERT INTO devices (id, gaddr, room, name, type, val, lastval, brand) VALUES ('" 
							. $device[id] . "','" 
							. $device[gaddr] . "','"
							. $device[room] . "','"
							. $device[name] . "','"
							. $device[type] . "','"
							. $device[val] . "','"
							. $device[lastval] . "','"
							. $device[brand] . "')"
							) 
			)
	{
		$apperr .= "mysqli_query INSERT error(" . $mysqli->errno . ") " . $mysqli->error . "\n" ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "add_device successful\n" ;
	return(6);
}


// ----------------------------------------------------------------------------------
//
// Add a room object as received from the ajax call and update mySQL
//
// ----------------------------------------------------------------------------------- */
function add_room($room)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr = "add_room:: id: ".$room[id]." name: ".$room[name]."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return (-1);
	}
	
	if (!$mysqli->query("INSERT INTO rooms (id, name) VALUES ('" 
							. $room[id]	. "','" 
							. $room[name] . "')"
							) 
			)
	{
		$apperr .= "mysqli_query INSERT error(" . $mysqli->errno . ") " . $mysqli->error . "\n" ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "add_room successful\n" ;
	return(7);
}

/*	-----------------------------------------------------------------------------------
	Delete a room record from the database. This is one of the element functions
	needed to synchronize the database with the memory storage in the client, and
	prevents information loss between reloads of the screen.
	
	-----------------------------------------------------------------------------------	*/
function delete_room($room)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "room id: " . $room[id] . " name: " . $room[name]  . "\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
	}
	
	$msg = "DELETE FROM rooms WHERE id='$room[id]' ";
	$apperr .= $msg;
	if (!mysqli_query($mysqli, "DELETE FROM rooms WHERE id='$room[id]' " ))
	{
		$apperr .= "mysqli_query error" ;

	}
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "delete_room successful\n" ;
	return(10);
}


//	--------------------------------------------------------------------------------
//	Function read scene from MySQL
//
//	Lookup the scene with the corresponding name
//	-----------------------------------------------------------------------------------
function read_scene($name)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	$res = array();
	// We need to connect to the database for start

	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
	}
	
	$sqlCommand = "SELECT id, val, name, seq FROM scenes WHERE name='$name' ";
	//$sqlCommand = "SELECT seq FROM scenes WHERE name='$name' ";
	$query = mysqli_query($mysqli, $sqlCommand) or die (mysqli_error());
	while ($row = mysqli_fetch_assoc($query)) { 
		$res[] = $row ;
	}

	mysqli_free_result($query);
	mysqli_close($mysqli);
	
	// NOTE: Assuming every sequence/scene name is unique, we return ONLY the first scene
	//	remember for seq only to use result['seq'] for sequence only
	if (count($res) == 0) {
		$apperr .= "ERROR read_scene: scene $name not found\n";
		return(-1);
	}
	else {
		// Only return ONE scene (there should only be one btw)
		return ($res[0]);
	}
}

// ----------------------------------------------------------------------------------
//
// Add a scene object as received from the ajax call and update mySQL
//
// ----------------------------------------------------------------------------------- */
function add_scene($scene)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "scene id: " . $scene[id] . " name: " . $scene[name] . "\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return (-1);
	}
	
	if (!$mysqli->query("INSERT INTO scenes (id, val, name, seq) VALUES ('" 
							. $scene[id] . "','" 
							. $scene[val]. "','"
							. $scene[name]. "','"
							. $scene[seq]. "')"
							) 
			)
	{
		$apperr .= "mysqli_query INSERT error(" . $mysqli->errno . ") " . $mysqli->error . "\n" ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "add_scene successful\n" ;
	return(9);
}


//	-----------------------------------------------------------------------------------
//	Store the scene record in the MySQL database
//	
//	-----------------------------------------------------------------------------------
function store_scene($scene)
{	
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "Scene id: ".$scene[id]." name: ".$scene[name]." val: ".$scene[val].", seq".$scene[seq]."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") ".$mysqli->connect_error , 1);
		return (-1);
	}
//
	$test = "UPDATE scenes SET val='{$scene[val]}', name='{$scene[name]}', seq='{$scene[seq]}' WHERE id='$scene[id]' ";
	$apperr .= $test;
	if (!mysqli_query($mysqli,"UPDATE scenes SET val='{$scene[val]}', name='{$scene[name]}', seq='{$scene[seq]}' WHERE  id='$scene[id]' " ))
	{
		$apperr .= "Error: Store scene, ";
		$apperr .= "mysqli_query error" ;
	//		apperr .= "mysqli_query Error: " . mysqli_error($mysqli) ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "store_scene successful\n" ;
	return(8);
}


//	-----------------------------------------------------------------------------------
//	Delete a scene record from the database. This is one of the element functions
//	needed to synchronize the database with the memory storage in the client, and
//	prevents information loss between reloads of the screen.
//	
//	-----------------------------------------------------------------------------------
function delete_scene($scene)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "scene id: " . $scene[id] . " name: " . $scene[name]  . "\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
	}
	
	$msg = "DELETE FROM scenes WHERE id='$scene[id]' ";
	$apperr .= $msg;
	if (!mysqli_query($mysqli, "DELETE FROM scenes WHERE id='$scene[id]' " ))
	{
		$apperr .= "mysqli_query error" ;

	}
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "delete_scene successful\n" ;
	return(11);
}

// ----------------------------------------------------------------------------------
//
// Add a timer object as received from the ajax call and update mySQL
//
// ----------------------------------------------------------------------------------- */
function add_timer($timer)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "timer id: " . $timer[id] . " name: " . $timer[name] . "\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return (-1);
	}
	if (!$mysqli->query("INSERT INTO timers (id, name, scene, tstart, startd, endd, days, months, skip) VALUES ('" 
							. $timer[id]. "','" 
							. $timer[name]. "','"
							. $timer[scene]. "','"
							. $timer[tstart]. "','"
							. $timer[startd]. "','"
							. $timer[endd]. "','"
							. $timer[days]. "','"
							. $timer[months]. "','"
							. $timer[skip]. "')"
							) 
			)
	{
		$apperr .= "mysqli_query INSERT error(" . $mysqli->errno . ") " . $mysqli->error . "\n" ;
		mysqli_close($mysqli);
		return (-1);
	}
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	$appmsg .= "add_timer successful\n" ;
	return(12);
}

//	-----------------------------------------------------------------------------------
//	Store the scene object in the database
//	
//	-----------------------------------------------------------------------------------
function store_timer($timer)
{	
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return (-1);
	}
//
	if (!mysqli_query($mysqli,"UPDATE timers SET name='{$timer[name]}', scene='{$timer[scene]}', tstart='{$timer[tstart]}', startd='{$timer[startd]}', endd='{$timer[endd]}', days='{$timer[days]}', months='{$timer[months]}', skip='{$timer[skip]}' WHERE  id='$timer[id]' " ))
	{
		$apperr .= "Error: Store timer, ";
		$apperr .= "mysqli_query error" ;
	//		apperr .= "mysqli_query Error: " . mysqli_error($mysqli) ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "store_timer successful\n" ;
	return(13);
}

//-----------------------------------------------------------------------------------
//	Delete a timer record from the database. This is one of the element functions
//	needed to synchronize the database with the memory storage in the client, and
//	prevents information loss between reloads of the screen.
//	XXX Maybe we shoudl work with addr+unit+val instead of id+unit+val
//	-----------------------------------------------------------------------------------
function delete_timer($timer)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "timer id: ".$timer['id']." name: ".$timer['name']."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (".$mysqli->connect_errno.") ".$mysqli->connect_error,1);
	}
	if (!mysqli_query($mysqli, "DELETE FROM timers WHERE id='$timer[id]' " ))
	{
		$apperr .= "delete_timer:: mysqli_query error for timer: ".$timer['name'] ;
		return(-1);
	}
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "delete_timer successful\n" ;
	return(11);
}


// ----------------------------------------------------------------------------------
//
// Add a handset object as received from the ajax call and update mySQL
//
// -----------------------------------------------------------------------------------
function add_handset($handset)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr = "handset id: ".$handset[id]." name: ".$handset[name].", addr".$handset[addr]."\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return (-1);
	}
	
	if (!$mysqli->query("INSERT INTO handsets (id, name, brand, addr, unit, val, type, scene) VALUES ('" 
							. $handset[id] . "','" 
							. $handset[name]. "','"
							. $handset[brand]. "','"
							. $handset[addr]. "','"
							. $handset[unit]. "','"
							. $handset[val]. "','"
							. $handset[type]. "','"
							. $handset[seq]. "')"
							) 
			)
	{
		$apperr .= "mysqli_query INSERT error(" . $mysqli->errno . ") " . $mysqli->error . "\n" ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "add_handset successful\n" ;
	return(17);
}


// -----------------------------------------------------------------------------------
//	Store the handset record in the MySQL database
//	
//	-----------------------------------------------------------------------------------
function store_handset($handset)
{	
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") ".$mysqli->connect_error , 1);
		return (-1);
	}
//
	$test = "UPDATE handsets SET brand='{$handset[brand]}', addr='{$handset[addr]}',  name='{$handset[name]}', type='{$handset[type]}', scene='{$handset[scene]}' WHERE id='$handset[id]' AND unit='$handset[unit]' AND val='$handset[val]' ";
	$apperr = $test;
	
	if (!mysqli_query($mysqli,"UPDATE handsets SET brand='{$handset[brand]}', addr='{$handset[addr]}',  name='{$handset[name]}', type='{$handset[type]}', scene='{$handset[scene]}' WHERE id='$handset[id]' AND unit='$handset[unit]' AND val='$handset[val]' " ))
	{
		$apperr .= "Error: Store_handset:: mysqli_query error: ";
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "store_handset successful\n" ;
	return(15);
}


/*	-----------------------------------------------------------------------------------
	Delete a handset record from the database. This is one of the element functions
	needed to synchronize the database with the memory storage in the client, and
	prevents information loss between reloads of the screen.
	
	-----------------------------------------------------------------------------------	*/
function delete_handset($handset)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "handset id: " . $handset[id] . " name: " . $handset[name]  . "\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
	}
	
	$msg = "DELETE FROM handsets WHERE id='$handset[id]' AND unit='$handset[unit]' AND val='$handset[val]' ";
	$apperr .= $msg;
	if (!mysqli_query($mysqli, "DELETE FROM handsets WHERE id='$handset[id]' AND unit='$handset[unit]' AND val='$handset[val]' " ))
	{
		$apperr .= "mysqli_query error" ;

	}
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "delete_handset successful\n" ;
	return(16);
}



/*	-----------------------------------------------------------------------------------
	Store the setting object in the database
	
	-----------------------------------------------------------------------------------	*/
function store_setting($setting)
{
	global $dbname, $dbuser, $dbpass, $dbhost;	
	global $appmsg, $apperr;
	
	// We need to connect to the database for start
	$apperr .= "Setting id: ".$setting[id] ." name: ".$setting[name] ." val: " . $setting[val] . "\n";
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		decho("Failed to connect to MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error , 1);
		return (-1);
	}
	
	$test = "UPDATE settings SET val='{$setting[val]}' WHERE id='$setting[id]' ";
	$apperr .= $test;
	if (!mysqli_query($mysqli,"UPDATE settings SET val='{$setting[val]}' WHERE  id='$setting[id]' " ))
	{
		$apperr .= "mysqli_query error" ;
//		apperr .= "mysqli_query Error: " . mysqli_error($mysqli) ;
		mysqli_close($mysqli);
		return (-1);
	}
	
//	mysqli_free_result($result);
	mysqli_close($mysqli);
	
	$appmsg .= "store_setting successful\n" ;
	return(5);
}





// -------------------------------------------------------------------------------
// DBASE_PARSE(
//
function dbase_parse($cmd,$message)
{
	//
	switch($cmd)
	{
		case "add_device":
			$ret= add_device($message);
		break;
		case "delete_device":
			$ret= delete_device($message);
		break;
		case "add_room":
			$ret= add_room($message);
		break;
		case "delete_room":
			$ret= delete_room($message);
		break;
		case "add_scene":
		break;
		case "delete_scene":
		break;
		case "upd_scene":
		break;
		case "add_timer":
		break;
		case "delete_timer":
		break;
		case "store_timer":
		break;
		case "add_handset":
		break;
		case "delete_handset":
		break;
		case "store_handset":
		break;
		case "add_weather":
		break;
		case "delete_weather":
		break;
		case "store_setting":
		break;
		
		default:
	}
	if ($ret >= 0) {									// Prepare structure to send back to the calling ajax client (in stdout)
		$send = array(
    		'tcnt' => $ret,
			'appmsg'=> $appmsg,
    		'status' => 'OK',
			'apperr'=> $apperr,
    	);
		$output=json_encode($send);
	}
	else {												//	Functions need to fill apperr themselves!	
		$send = array(
    		'tcnt' => $ret,
			'appmsg'=> $appmsg,
    		'status' => 'ERR',
			'apperr' => $apperr,
		);
		$output=json_encode($send);
	}
	return $output;
}


/*	-------------------------------------------------------
	function get_parse()
	
	-------------------------------------------------------	*/
function get_parse()
{
	global $appmsg;
	global $apperr;
	global $action;
	global $icsmsg;
  
//  decho("Starting function post_parse";	
	if (empty($_GET)) { 
		decho("No _GET, ",1);
		$apperr .= "get_parse:: empty _GET message\n";
		return(-1);
	}
	foreach ( $_GET as $ind => $val )
	{
		switch ( $ind )
		{
			case "action":
				$action = $val;
			break;
			
			case "message":
				$icsmsg = $val;
				//$icsmsg = json_decode($val);				// MMM Decode json message ecndoed by client
			break;
			
		} // switch $ind
	} // for
	return(0);
} // function



/*	-------------------------------------------------------
	function post_parse()
	
	-------------------------------------------------------	*/
function post_parse()
{
	global $appmsg;
	global $apperr;
	global $action;
	global $icsmsg;
  
//  decho("Starting function post_parse";	
	if (empty($_POST)) { 
		decho("No _post, ",1);
		$apperr .= "post_parse:: empty _POST message\n";
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
				//$icsmsg = json_decode($val);				// MMM Decode json message ecndoed by client
			break;
			
		} // switch $ind
	} // for
	return(0);
} // function


/*	=======================================================	
	MAIN PROGRAM

	=======================================================	*/

$ret = 0;

// Parse the URL sent by client
// post_parse will parse the commands that are sent by the java app on the client
// $_POST is used for data that should not be sniffed from URL line, and
// for changes sent to the devices

if ($debug>0) $ret = get_parse();
$ret = post_parse();

// Do Processing
// XXX Needs some cleaning and better/consistent messaging specification
// could also include the setting of debug on the client side
switch($action)
{	
	// Functions on the whole database
	case "load_database":
		$apperr .= "Load: msg: ".$icsmsg."\n";
		$appmsg = load_database();
		if ($appmsg == -1) { $ret = -1 ; $apperr .= "\nERROR Loading Database"; }
		else { $ret = 0; $apperr = "Configuration Loaded"; }

	break;
	case "store":
		// What happens if we receive a complex datastructure?
		$apperr .= "Calling store: icsmsg: $icsmsg\n";
		$appmsg = store_database($icsmsg);
		$apperr .= "\nStore ";
		$ret = 0;
	break;
	
	// Store the complete devices object at once
	case "store_device":
		$tcnt = store_device($icsmsg);
		$apperr .= "\nStore device \n";
		$ret = $tcnt;
	break;
	case "delete_device":
		$tcnt = delete_device($icsmsg);		
		$apperr .= "\nDelete device \n";
		$ret = $tcnt; 
	break;
	case "add_device":	
		$apperr .= "Calling add_device:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = add_device($icsmsg);
		$apperr .= "\nAdd device ";
		$ret = $tcnt;
	break;	
	
	// Room commands
	case "add_room":	
		$apperr .= "Calling add_room:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = add_room($icsmsg);
		$apperr .= "\nAdd room ";
		$ret = $tcnt;
	break;
	case "delete_room":	
		$apperr .= "Calling delete_room:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = delete_room($icsmsg);
		$apperr .= "\ndelete room ";
		$ret = $tcnt;
	break;
	
	// Scene commands
	case "add_scene":	
		$apperr .= "Calling add_scene:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = add_scene($icsmsg);
		$apperr .= "\nScene added ";
		$ret = $tcnt;
	break;
	case "upd_scene":
		$apperr .= "Calling upd_scene:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = store_scene($icsmsg);
		$apperr .= "\nScene updated ";
		$ret = $tcnt;
	break;
	case "store_scene":
		$apperr .= "Calling store_scene:: jsonmsg: ".jason_decode($icsmsg)."\n";
		$tcnt = store_scene($icsmsg);
		$apperr .= "\nScene stored ";
		$ret = $tcnt; 
	break;	
	case "delete_scene":
		$apperr .= "Calling delete_scene:: json: ".json_decode($icsmsg)."\n";
		$tcnt = delete_scene($icsmsg);		
		$apperr .= "\nScene deleted ";
		$ret = $tcnt; 
	break;
	
	// Timer database functions
	case "add_timer":	
		$apperr .= "Calling add_timer:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = add_timer($icsmsg);
		$apperr .= "\nAdd timer ";
		$ret = $tcnt;
	break;
	case "store_timer":	
		$apperr .= "Calling store_timer:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = store_timer($icsmsg);
		$apperr .= "\nStore timer ";
		$ret = $tcnt;
	break;
	case "delete_timer":	
		$apperr .= "Calling delete_timer:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = delete_timer($icsmsg);
		$apperr .= "\nDelete timer ";
		$ret = $tcnt;
	break;
	
	// Handset Functions
	//
	case "add_handset":	
		$apperr .= "Calling add_handset:: icsmsg: ".$icsmsg.", json: ".json_decode($icsmsg)."\n";
		$tcnt = add_handset($icsmsg);
		$apperr .= "\nAdd handset ";
		$ret = $tcnt;
	break;
	case "store_handset":
		$apperr .= "Calling store_handset:: icsmsg json: ".json_decode($icsmsg)."\n";
		$tcnt = store_handset($icsmsg);
		$appmsg = " Handset stored ";
		$ret = $tcnt; 
	break;	
	case "delete_handset":
		$apperr .= "Calling delete_handset:: json: ".json_decode($icsmsg)."\n";
		$tcnt = delete_handset($icsmsg);		
		$apperr .= "\nHandset deleted ";
		$ret = $tcnt; 
	break;
	
	// Store the complete settings array at once.
	// There may not be a reason to load settings, as we load setting
	// during init.
	case "store_setting":
		$apperr .= "Calling store_setting:: icsmsg: $icsmsg\n";
		$tcnt = store_setting($icsmsg);		
		$apperr .= "\nSetting updated ";
		$ret = $tcnt; 
	break;	
	
	// If the command is not defined above, this is treated as a error
	default:
		$appmsg .= "action: ".$action;
		$apperr .= "\n<br />default, command not recognized: ,".$action.",\n";
		$ret = -1; 
}

if ($ret >= 0) {									// Prepare structure to send back to the calling ajax client (in stdout)
	$send = array(
    	'tcnt' => $ret,
		'appmsg'=> $appmsg,
    	'status' => 'OK',
		'apperr'=> $apperr,
    );
	$output=json_encode($send);
}
else {												//	Functions need to fill apperr themselves!	
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
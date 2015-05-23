<?php 
require_once( dirname(__FILE__) . '/../config/backend_cfg.php' );
require_once( dirname(__FILE__) . '/backend_lib.php' );
require_once( dirname(__FILE__) . '/backend_sql.php' );


/*	======================================================================================	
	Note: Program to switch klikaanklikuit and coco equipment
	Author: Maarten Westenberg
	Version 1.0 : August 16, 2013
	Version 1.3 : August 30, 2013
	Version 1.4 : 
	Version 1.5 : Oct 20, 2013
	Version 1.6 : Nov 10, 2013
	Version 1.7 : Dec 2013
	Version 1.8 : Jan 17, 2014
	Version 2.0 : Jun 15, 2014
	Versio  2.1 : Jul 31, 2014

	This is a supporting file for LamPI-x.x.js backent end application
	It allows for settings, reading (database) files and storing etc.
	
	It is called ONLY at the moment for setting and retrieving setting[] parameters
	in the config screen of the application.
	1. Read a configuration from file
	2. Store a configuration to file
	3. List the skin files in config
	
NOTE:
	Start initiating the database by executing: ~/scripts/PI-run -i
	this will initialize the MySQL database as defined below in init_dbase()
	
	======================================================================================	*/
//error_reporting(E_ALL);
header("Cache-Control: no-cache");
header("Content-type: application/json");					// Input and Output are XML coded

if (!isset($_SESSION['debug']))	{ $_SESSION['debug']=0; }
if (!isset($_SESSION['tcnt']))	{ $_SESSION['tcnt'] =0; }

$apperr = "";	// Global Error. Just append something and it will be sent back
$appmsg = "";	// Application Message (from backend to Client)

/*	======================================================================================	
	Function write complete database to file
	
	======================================================================================	*/
function file_database($fname, $cfg)
{
	global $log;
	$ret = file_put_contents ( $fname, json_encode($cfg, JSON_PRETTY_PRINT));
	if ( $ret === false )
	{
		$log->lwrite("file_database:: ERROR file_put_contents");
	}
	else {
		$log->lwrite("file_database:: Success",1);
	}
	return ($ret);
}

/*	======================================================================================	
	Function read complete database from file
	
	======================================================================================	*/
function read_database($fname)
{
	global $log;
	$log->lwrite("read_database:: ".$fname);
	$ret = file_get_contents ( $fname );
	if ( $ret === false )
	{
		$log->lwrite("read_database:: ERROR read_database from file: ".$fname);
		return(false);
	}
	else {
		$log->lwrite("read_database:: Success read_database");
	}
	$cfg = json_clean_decode($ret, true);
	return ($cfg);
}


/*	======================================================================================	
	Function to create a database, and fill it with values as specified in its parameters
	For testing purposes, we want to be able to reset the database,
	and reread some initial values that make sense in my (your)
	home.
	
	The array below contains such an initial database, after
	reading it, we want to populate the MySQL database with these values
	======================================================================================	*/
function fill_database($cfg)
{
	$rooms = $cfg['rooms'];
	$devices = $cfg['devices'];
	$scenes = $cfg['scenes'];
	$timers = $cfg['timers'];
	$settings = $cfg['settings'];
	$controllers = $cfg['controllers'];
	$handsets = $cfg['handsets'];
	$brands = $cfg['brands'];
	$weather = $cfg['weather'];
	
	 // We assume that a database has been created by the user
	global $log;
	global $dbname;
	global $dbuser;
	global $dbpass;
	global $dbhost;
	
	// We need a table rooms, devices, scenes and timers to start
	
	$mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
	if ($mysqli->connect_errno) {
		$log->lwrite("Fill_database:: Failed to connect to MySQL: host ".$dbhost." (".$mysqli->connect_errno.") ".$mysqli->connect_error);
	}
	// Success,  so we can start filling the database
	
	// --------------------------------------------------------------------------
	// Create table rooms
	// Please note that drop command needs special permissions 
	
	if (!$mysqli->query("DROP TABLE IF EXISTS rooms") ||
    	!$mysqli->query("CREATE TABLE rooms(id INT, name CHAR(20) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation rooms failed: (".$mysqli->errno.") ".$mysqli->error, 1);
		return(false);
	}
	for ($i=0; $i < count($rooms); $i++)
	{
		if (!$mysqli->query("INSERT INTO rooms (id, name) VALUES ('" 
							. $rooms[$i]['id']. "','" 
							. $rooms[$i]['name']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert failed: (".$mysqli->errno.") ".$mysqli->error . "\n", 1);
		}
	}
	
	// ----------------------------------------------------------
	// create table devices
	if (!$mysqli->query("DROP TABLE IF EXISTS devices") ||
    	!$mysqli->query("CREATE TABLE devices(id CHAR(3), unit CHAR(3), gaddr CHAR(12), room CHAR(12), name CHAR(20), type CHAR(12), val INT, lastval INT, brand CHAR(20) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation devices failed: (" . $mysqli->errno . ") " . $mysqli->error);
	}
	// Insert devices	
	for ($i=0; $i < count($devices); $i++)
	{
		if (!$mysqli->query("INSERT INTO devices (id, unit, gaddr, room, name, type, val, lastval, brand) VALUES ('" 
							. $devices[$i]['id']. "','" 
							. $devices[$i]['unit']. "','"
							. $devices[$i]['gaddr']. "','"
							. $devices[$i]['room']. "','"
							. $devices[$i]['name']. "','"
							. $devices[$i]['type']. "','"
							. $devices[$i]['val']. "','"
							. $devices[$i]['lastval']. "','"
							. $devices[$i]['brand']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}
	
	// ----------------------------------------------------------
	// Insert SCENES
	// Fr now we declare seq string 255 which is the max for mySQL. ICS specs mention 256(!) chars max 
	if (!$mysqli->query("DROP TABLE IF EXISTS scenes") ||
    	!$mysqli->query("CREATE TABLE scenes(id INT, val INT, name CHAR(20), seq CHAR(255) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation scenes failed: (" . $mysqli->errno . ") " . $mysqli->error);
	}
	// Scenes
	for ($i=0; $i < count($scenes); $i++)
	{
		if (!$mysqli->query("INSERT INTO scenes (id, val, name, seq ) VALUES ('" 
							. $scenes[$i]['id']. "','" 
							. $scenes[$i]['val']. "','"
							. $scenes[$i]['name']. "','"
							. $scenes[$i]['seq']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}

	// -------------------------------------------------------
	// Timers
	//  
	if (!$mysqli->query("DROP TABLE IF EXISTS timers") ||
    	!$mysqli->query("CREATE TABLE timers(id INT, name CHAR(20), scene CHAR(20), tstart CHAR(20), startd CHAR(20), endd CHAR(20), days CHAR(20), months CHAR(20), skip INT )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation timers failed: (" . $mysqli->errno . ") " . $mysqli->error);
	}
	// Insert Timers
	for ($i=0; $i < count($timers); $i++)
	{
		if (!$mysqli->query("INSERT INTO timers (id, name, scene, tstart, startd, endd, days, months, skip ) VALUES ('" 
							. $timers[$i]['id']. "','" 
							. $timers[$i]['name']. "','"
							. $timers[$i]['scene']. "','"
							. $timers[$i]['tstart']. "','"
							. $timers[$i]['startd']. "','"
							. $timers[$i]['endd']. "','"
							. $timers[$i]['days']. "','"
							. $timers[$i]['months']. "','"
							. $timers[$i]['skip']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert Timers failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}
	
	// --------------------------------------------------------------------
	// Handsets
	//  
	if (!$mysqli->query("DROP TABLE IF EXISTS handsets") ||
    	!$mysqli->query("CREATE TABLE handsets(id INT, name CHAR(20), brand CHAR(20), addr CHAR(20), unit INT, val INT, type CHAR(20), scene CHAR(255) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation handsets failed: (" . $mysqli->errno . ") " . $mysqli->error);
	}
	// Insert Handsets
	for ($i=0; $i < count($handsets); $i++)
	{
		if (!$mysqli->query("INSERT INTO handsets (id, name, brand, addr, unit, val, type, scene ) VALUES ('" 
							. $handsets[$i]['id']. "','" 
							. $handsets[$i]['name']. "','"
							. $handsets[$i]['brand']. "','"
							. $handsets[$i]['addr']. "','"
							. $handsets[$i]['unit']. "','"
							. $handsets[$i]['val']. "','"
							. $handsets[$i]['type']. "','"
							. $handsets[$i]['scene']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert handsets failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}
	
	// -------------------------------------------------------------
	// Settings 
	if (!$mysqli->query("DROP TABLE IF EXISTS settings") ||
    	!$mysqli->query("CREATE TABLE settings(id INT, val CHAR(128), name CHAR(20) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation setting failed: (" . $mysqli->errno . ") " . $mysqli->error);
	}
	// Insert Settings
	for ($i=0; $i < count($settings); $i++)
	{
		if (!$mysqli->query("INSERT INTO settings (id, val, name ) VALUES ('" 
							. $settings[$i]['id']. "','" 
							. $settings[$i]['val']. "','"
							. $settings[$i]['name']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert settings failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}
	
	// -------------------------------------------------------------
	// Controllers
	if (!$mysqli->query("DROP TABLE IF EXISTS controllers") ||
    	!$mysqli->query("CREATE TABLE controllers(id INT, name CHAR(20), fname CHAR(128) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation controllers failed: (".$mysqli->errno . ") ".$mysqli->error);
	}
	// Insert Controllers
	for ($i=0; $i < count($controllers); $i++)
	{
		if (!$mysqli->query("INSERT INTO controllers (id, name, fname ) VALUES ('" 
							. $controllers[$i]['id']. "','" 
							. $controllers[$i]['name']. "','" 
							. $controllers[$i]['fname']. "')"
							) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert controllers failed: (".$mysqli->errno.") ".$mysqli->error);
		}
	}
	
	// --------------------------------------------------------------
	// Brands
	if (!$mysqli->query("DROP TABLE IF EXISTS brands") ||
    	!$mysqli->query("CREATE TABLE brands(id INT, name CHAR(20), fname CHAR(128) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation brands failed: (".$mysqli->errno.") ".$mysqli->error);
	}
	// Insert Brands
	for ($i=0; $i < count($brands); $i++)
	{
		if (!$mysqli->query("INSERT INTO brands (id, name, fname ) VALUES ('" 
					. $brands[$i]['id']. "','" 
					. $brands[$i]['name']. "','" 
					. $brands[$i]['fname']. "')"
					) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert brands failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}
	
	// --------------------------------------------------------------
	// Weather
	if (!$mysqli->query("DROP TABLE IF EXISTS weather") ||
    	!$mysqli->query("CREATE TABLE weather(id INT, name CHAR(20), location CHAR(20), brand CHAR(20), address CHAR(20), channel CHAR(8), temperature CHAR(8), humidity CHAR(8), airpressure CHAR(8), windspeed CHAR(8), winddirection CHAR(8), rainfall CHAR(8) )") )
	{
    	$log->lwrite("fill_database:: ERROR Table creation weather failed: (" . $mysqli->errno . ") " . $mysqli->error);
	}
	// Insert weather data
	for ($i=0; $i < count($weather); $i++)
	{
		if (!$mysqli->query("INSERT INTO weather (id, name, location, brand, address, channel, temperature, humidity, airpressure, windspeed, winddirection, rainfall ) VALUES ('" 
					. $weather[$i]['id']. "','" 
					. $weather[$i]['name']. "','"
					. $weather[$i]['location']. "','"
					. $weather[$i]['brand']. "','"
					. $weather[$i]['address']. "','"
					. $weather[$i]['channel']. "','"
					. $weather[$i]['temperature']. "','"
					. $weather[$i]['humidity']. "','"
					. $weather[$i]['airpressure']. "','"
					. $weather[$i]['windspeed']. "','"
					. $weather[$i]['winddirection']. "','"
					. $weather[$i]['rainfall']. "')"
					) 
			)
		{
			$log->lwrite("fill_database:: ERROR Table Insert weather failed: (" . $mysqli->errno . ") " . $mysqli->error . "\n");
		}
	}
	return(1);
}


/*	=======================================================================================	
	Function to print a database, 
	
	=======================================================================================	*/
function print_database($cfg)
{
	global $log;
	//
	$log->lwrite(" print database opened succesfully : \n") ;

	$rooms = $cfg["rooms"];
	$devices = $cfg["devices"];
	$scenes = $cfg["scenes"];
	$timers = $cfg["timers"];
	$handsets = $cfg["handsets"];
	$settings = $cfg["settings"];
	$controllers = $cfg["controllers"];
	$brands = $cfg["brands"];
	$weather = $cfg["weather"];
	// XXX
	//var_dump (get_object_vars($cfg));
	
	$log->lwrite(" print database started succesfully",1);
	// Rooms
	$log->lwrite("Count of rooms: " . count($rooms). "\n",1);
	for ($i=0; $i < count($rooms); $i++) {
		$log->lwrite("index: $i, id: " . $rooms[$i]['id'] . ", data: " . $rooms[$i]['name'],1);
	}
	$log->lwrite("\n");
	
	// Devices
	$log->lwrite("Count of devices: " . count($devices) . "\n");
	for ($i=0; $i < count($devices); $i++) 	{
		$log->lwrite("index: $i id: ".$devices[$i]['id'].", unit: ".$devices[$i]['unit'].", gaddr: ".$devices[$i]['gaddr'].
					", room: ".$devices[$i]['room'].", data: ".$devices[$i]['name'].
					", brand: ".$devices[$i]['brand'].", type: ".$devices[$i]['type']
					);
	}
	$log->lwrite("\n");	
	
	// Scenes
	$log->lwrite("Count of scenes: " . count($scenes) . "\n");
	for ($i=0; $i < count($scenes); $i++) {
		$log->lwrite("index: $i id: ". $scenes[$i]['id'].", name: ".$scenes[$i]['name'].", seq: ".$scenes[$i]['seq']);
	}
	$log->lwrite("\n");
	
	// Timers
	$log->lwrite("Count of timers: ".count($timers)."\n");
	for ($i=0; $i < count($timers); $i++) {
		$log->lwrite("index: $i id: ". $timers[$i]['id'].", name: ".$timers[$i]['name'].
					", scene: ". $timers[$i]['scene'].", startd: ".$timers[$i]['startd'].", endd: ".$timers[$i]['endd'].
					", tstart: ". $timers[$i]['tstart'].", days: ".$timers[$i]['days'].", months: ".$timers[$i]['months'].
					", skip: ". $timers[$i]['skip']
					);
	}
	$log->lwrite("\n");
	
	// Handsets
	$log->lwrite("Count of handsets: " . count($handsets) . "\n");
	for ($i=0; $i < count($handsets); $i++) {
		$log->lwrite("index: $i id: ". $handsets[$i]['id'].", name: ".$handsets[$i]['name'].", brand: ".$handsets[$i]['brand'].
					", addr: ".$handsets[$i]['addr'].", seq: ".$handsets[$i]['unit'].
					", val: ".$handsets[$i]['val'].  ", type: ".$handsets[$i]['type'].", scene: ".$handsets[$i]['scene']
					);
	}
	$log->lwrite("\n");
	
	// Settings
	$log->lwrite("Count of settings: ".count($settings)."\n");
	for ($i=0; $i < count($settings); $i++) {
		$log->lwrite("index: $i id: " . $settings[$i]['id'].", val: ".$settings[$i]['val'].", name: ".$settings[$i]['name']);
	}
	$log->lwrite("\n");
	
	// Controllers
	$log->lwrite("Count of controllers: ".count($controllers)."\n");
	for ($i=0; $i < count($controllers); $i++) {
		$log->lwrite("index: $i id: ".$controllers[$i]['id'].", name: ".$controllers[$i]['name'].", fname: ".$controllers[$i]['fname']);
	}
	$log->lwrite("\n");
	
	// Brands
	$log->lwrite("Count of brands: " . count($brands) . "\n");
	for ($i=0; $i < count($brands); $i++) {
		$log->lwrite("index: $i id: ".$brands[$i]['id'].", name: ".$brands[$i]['name'].", fname: ".$brands[$i]['fname']);
	}
	$log->lwrite("\n");
	
	// weather
	$log->lwrite("Count of weather: " . count($weather) . "\n");
	for ($i=0; $i < count($weather); $i++) {
		$log->lwrite("index: $i id: ".$weather[$i]['id']
				.", name: ".$weather[$i]['name']
				.", location: ".$weather[$i]['location']
				.", brand: ".$weather[$i]['brand']
				.", address: ".$weather[$i]['address']
				.", channel: ".$weather[$i]['channel']
				.", temperature: ".$weather[$i]['temperature']
				.", humidity: ".$weather[$i]['humidity']
				.", windspeed: ".$weather[$i]['windspeed']
				.", winddirection: ".$weather[$i]['winddirection']
				.", rainfall: ".$weather[$i]['rainfall']
				);
	}
	
	$log->lwrite("print_database:: Sucess\n\n");
}


/*	=======================================================================================	
	Function to get a directory listing of config for the client. 
	
	=======================================================================================	*/
function list_skin($dirname)
{
	global $apperr;
	global $appmsg;
	
	if ( $dirname == "" ) $apperr.="list_skin:: dirname is empty\n";
	
	$appmsg = glob($dirname . '*.css',GLOB_BRACE);
	$apperr += "list_skin:: glob returned: ";
	return(1);
}


/*	=======================================================================================	
	Function to get a directory listing of config for the client. 
	
	=======================================================================================	*/
function list_config($dirname)
{
	global $log;
	global $apperr;
	global $appmsg;
	
	if ( $dirname == "" ) $apperr.="list_config:: dirname is empty\n";
	
	$appmsg = glob($dirname . '*.cfg',GLOB_BRACE);
	$apperr += "list_config:: glob returned: ";
	return(1);
}

// -------------------------------------------------------------------------------
// SETTING_PARSE()
// ALL (!) Setting functions to be called by the GUI are parsed in this function.
//
function setting_parse($cmd,$message)
{
	global $pisql, $dbhost, $dbuser, $dbpass, $dbname;
	global $log;									// Used by daemon
	global $apperr, $appmsg;						// For ajax usage
	
	//if ( (!$pisql) || (!$pisql->ping()) ) {
	//	$log->lwrite("dbase_parse:: Ping failed, making new pisql connection to server", 1);
	//	$pisql = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
    //}
	// If there is an error 
	//if ($pisql->connect_errno) {
	//	$log->lwrite("setting_parse:: Failed to connect to MySQL: (".$pisql->connect_errno.") ".$pisql->connect_error,1);
	//	return (-1);
	//}
	
	// For logging only	
	if (is_array($message)) {
		$str="";
		foreach ($message as $key => $val) {
			$str.=" {".$key.":".$val."}," ;
		}
		$log->lwrite("setting_parse:: ".$cmd.": ".$str,1);
	}
	else {
		$log->lwrite("setting_parse:: message: ".$cmd.": ".$message,1);
	}
	//
	// Depending on $cmd execute database function
	switch($cmd)
	{
	case "load":
		$cfg = read_database($config_dir . "database.cfg");			// Load $cfg Object from File
		$ret = print_database($cfg);
		$ret = fill_database($cfg);									// Fill the MySQL Database with $cfg object
		$ret = file_database($config_dir . "newdbms.cfg", $cfg);	// Make backup to other file
	break;
	
	case "store":
		$cfg = load_database();										// Fill $cfg from MySQL
		$ret = file_database($config_dir . "database.cfg", $cfg);
	break;	
	
	case "list_config":												// Read the config directory
		$ret = list_config($config_dir);
		$apperr .= "list_config returned\n";
	break;	

	case "list_skin":												// Read the configfile into the system
		$ret = list_skin($skin_dir);
		$apperr .= "list_skin returned\n";
	break;	
	
	case "load_config":												// Read the configfile into the system
		$cfg = read_database($icsmsg);
		$ret = fill_database($cfg);
		$appmsg .= 'Success';										// Return code to calling client call
		$apperr .= "load_config of ".$icsmsg." returned OK";
		$ret = 1;
	break;
	
	case "store_config":											// Read the configfile into the system
		$cfg = load_database();
		$ret = file_database($config_dir.$icsmsg, $cfg);
		$appmsg .= 'Success';										// Return code to calling client call
		$apperr .= "store_config of ".$icsmsg." returned OK";
		$ret = 1;
	break;		
	
	default:
		$appmsg .= "action: ".$action;
		$apperr .= "\n<br />command not recognized: ".$action."\n";
		$ret = -1; 
	}

	if ($ret >= 0) {								// Prepare structure to send back to the calling ajax client (in stdout)
		$send = array(
    		'tcnt' => $ret,
			'appmsg'=> $appmsg,
    		'status' => 'OK',
			'apperr'=> $apperr,
    	);
		$output=json_encode($send);
	}
	else {											//	Functions need to fill apperr themselves!	
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



//$log = new Logging();
//$log->lfile($log_dir.'/backend_set.log');
//$cfg = read_database($config_dir . "database.cfg");			// Load $cfg Object from File
//$ret = fill_database($cfg);									// Fill the MySQL Database with $cfg object
//$ret = file_database($config_dir . "newdbms.cfg", $cfg);	// Make backup to other file
//$ret = print_database($cfg);


?>
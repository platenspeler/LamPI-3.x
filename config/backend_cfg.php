<?php
define('__ROOT__', dirname(__FILE__)); 	// Find www root dir
/* -------------------------------------------------------------------------------
	This file contains the settings for the backend_xxxxxx.php files
	that are used by the LamPI-daemon.php Controller program
	
	(c) 2014, Author: Maarten Westenberg
	mw12554@hotmail.com
*/

// Use this var as a way to determine what details are logged and what not...  
// Val 0: No Debug, Only Errors and logging of events in queue
// Val 1: Verbose mode
// Val 2: Normal Debug level
// Val 3: Detail debugging info. Will fill up the logfile Quickly
	$debug = 1;

// Use rrdtool for making graphs
	$use_rrd = 1;
	
// Are we still debugging or testing or operational? 
// $_GET is not allowed in operational!!
// Set to 0 for operational, and to 1 for testing
	$testing=1;
	
// Set to 1 in order to fake any communication to devices
	$fake=0;	

// ----------------------------------------------------------------------------------------
// MySQL DATABASE SETTINGS
//
// Default server is localhost for most situations. However, should you want to run the
// database on a separate server, please specify it's host and access details below.
// Specify the database name, username, password and host
// Please run ~/scripts/PI-run -i after changing the setting to localhost
	$dbname = "dorm";						// This one is not easy to guess
	$dbuser = "coco";
	$dbpass = "coco";
	$dbhost = "192.168.2.11";				// standard this should be "localhost"

// ----------------------------------------------------------------------------------------
// USER ADMIN SETTINGS
//
// USER ADMIN SETTINGS (could be in database too, but this is easy as well)
// In future we could add a function to the database, in the user CLASS
	$u_admin = array (
					array (
						'login' => 'maarten',
						'password' => '5143' , 
						'server' => '' ,
						'trusted' => '2'
					),
					array (
						'login' => 'annemarie',
						'password' => '5143' , 
						'server' => '' ,
						'trusted' => '1'
					),
					array (
						'login' => 'laurens',
						'password' => '5143' , 
						'server' => '' ,
						'trusted' => '1'
					),
					array (
						'login' => 'marloes',
						'password' => '5143' , 
						'server' => '' ,
						'trusted' => '1'
					) 
			);
	
// ----------------------------------------------------------------------------------------
// DIRECTORY DEFINITIONS
//				
// Looking from the webhost directory, where are other important directories.
// But also works for LamPI-daemon.php in the daemon directory
	$home_dir	= "/home/pi/";
	$log_dir	= $home_dir."log/";					// Logging for the LamPI-system
	$rrd_dir	= $home_dir."rrd/";					// rrdtool top directory
	$www_dir	= $home_dir."www/";					// Directory for the apache server
	
	$config_dir	= $home_dir."config/";				// Contains the database.cfg file
	$skin_dir	= "styles/";						// Defined to GUI and Daemon together


// ----------------------------------------------------------------------------------------
// LAMPI DAEMON SETTINGS
//
// Server listens to ALL incoming hosts. So if we want to limit access
// XXX We have to build an accept/authorization mechanism in the daemon
// Address 0.0.0.0 works for the daemon!
	$serverIP = "0.0.0.0";
// Port Settings for the LamPI Daemon (!) LamPI-daemon.php file
	$rcv_daemon_port = "5000";										
    $udp_daemon_port = "5001";

// ----------------------------------------------------------------------------------------
// RASPI GPIO SETTING
//
// Pin number of the GPIO (We use the wiringPi number scheme). As we move the actual receiver handling
// outide the PHP files in a faster c-based daemon LamPI-receiver, the settings below might be obsolete,
// But as these settings are so important, we should probably put them in a dedicated config file 
// (and read it on startup).
	$wiringPi_snd = "15";
	$wiringPi_rcv = "1";
	
// ----------------------------------------------------------------------------------------
// RAZBERRY / ZWAY SETTINGS
//
// The IP address of the Razberry machine. The Razberry is used to
// relay and handle all Z-Wave 868MHz messaging to connected Z-Wave
// devices and sensors
	$razberry = "192.168.2.52";
//
?>
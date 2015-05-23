<?php 
require_once( dirname(__FILE__) . '/../config/backend_cfg.php' );
require_once( dirname(__FILE__) . '/backend_lib.php' );
require_once( dirname(__FILE__) . '/backend_sql.php' );
require_once( dirname(__FILE__) . '/backend_set.php' );
require_once( dirname(__FILE__) . '/backend_sock.php' );
//error_reporting(E_ALL);
error_reporting(E_ERROR | E_PARSE | E_NOTICE);				// For a daemon, suppress warnings!!

//	------------------------------------------------------------------------------	
// LamPI-daemon.php, Daemon Program for LamPI, controller for 868MHz Z-Wave (Fibaro) 
// and 433MHz (klikaanklikuit and action) equipment
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
// Version 2.5, Nov 20, 2014 LamPI-daemon changed mysqli connection, LamPI-gate rewrote from zautomation to zwayAPI
// Version 2.6, Jan 15, 2015 Remowork of the css system
// Version 2.7, Jan 26, 2015 Several bugs fixed
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
				

// Global setting vars
//
$interval = 30;								// If no messages on socket and NO scheduled timing events, sleep

$apperr = "";								// Global Error. Just append something and it will be sent back
$appmsg = "";								// Application Message (from backend to Client)

$timers=  array();
$rooms=   array();
$scenes=  array();
$devices= array();
$settings=array();
$handsets=array();
$brands = array();
$weather= array();

// --------------------------------------------------------------------------------------
//	CLASS Sensor
//	The class for rrdtool functions. 
// If necessary create a rrdtool database and add data to it.
//	
//
class Sensor {
	
	// private $rrd_log=$rrd_dir."log/";
	// Lookup the name of the weather entry based on value of address+channel
	//
	private function lookup($data) {
		global $log;
		global $weather;
		
		for ($i=0; $i < count($weather); $i++) {
			if (($data['address'] == $weather[$i]['address']) &&
				($data['channel'] == $weather[$i]['channel'])) {
				return($weather[$i]['name']);
			}
		}
		return(0);
	}
	
	// If a database does not yest exist, create one
	// We create all weather related fields of the specific sensor 
	// At a later stage we might have to check this.
	//   Note: If the first ever message does not contain all fields for that sensor,
	// we will generate a database without the omitted field!
	public function rrdcreate($db, $sensor) {
		global $log;
		
		if ($debug>=1) {
			foreach ( $sensor as $ind => $val ) {
				$log->lwrite("rrdcreate:: sensor[".$ind."] => ".$val);
			}
		}
		// We take care not to define fields that we do not need!!
		// Not that we need the storage, but it will enhance performance

		switch ($sensor['action'] )
		{
		case 'weather':
			// Weather Sensors
			$exec_str  = "rrdtool create " . $db . " ";
			$exec_str .= "--step 180 ";
			if (array_key_exists('temperature', $sensor))		$exec_str .= "DS:temperature:GAUGE:600:-20:95 ";
			if (array_key_exists('humidity', $sensor))			$exec_str .= "DS:humidity:GAUGE:600:0:100 ";
			if (array_key_exists('airpressure', $sensor))		$exec_str .= "DS:airpressure:GAUGE:600:900:1100 ";
			if (array_key_exists('altitude', $sensor))			$exec_str .= "DS:altitude:GAUGE:600:-100:1200 ";
			if (array_key_exists('windspeed', $sensor))			$exec_str .= "DS:windspeed:GAUGE:600:0:200 ";
			if (array_key_exists('winddirection', $sensor))		$exec_str .= "DS:winddirection:GAUGE:600:0:359 ";
			if (array_key_exists('rainfall', $sensor))			$exec_str .= "DS:rainfall:GAUGE:600:0:25 ";
			$exec_str .= "RRA:AVERAGE:0.5:1:480 ";			// Day: every 3 min sample counts, 20 per hour, 20*24=480 a day
			$exec_str .= "RRA:AVERAGE:0.5:5:672 ";			// Week: 3 min sample, consolidate 5 (=15 min); thus 4 per hour * 24 hrs * 7 day
			$exec_str .= "RRA:AVERAGE:0.5:20:744 ";			// Month: Every 3 minutes -> 20 samples per hour, * 24 hrs * 31 days
			$exec_str .= "RRA:AVERAGE:0.5:480:365 ";		// Year: 3 min sample * 20 (=hour) * 24 = consolidate per day. Do 365 days a year
			$exec_str .= "RRA:MIN:0.5:20:720 ";		
			$exec_str .= "RRA:MAX:0.5:20:720 ";				
			$exec_str .= "RRA:AVERAGE:0.5:20:720 ";			
		break;
			
		case 'energy':
		// Energy Sensors
			$exec_str  = "rrdtool create " . $db . " ";
			$exec_str .= "--step 20 ";
			if (array_key_exists('kw_hi_use',  $sensor))		$exec_str .= "DS:kw_hi_use:COUNTER:600:0:999999999 ";
			if (array_key_exists('kw_lo_use',  $sensor))		$exec_str .= "DS:kw_lo_use:COUNTER:600:0:999999999 ";
			if (array_key_exists('kw_hi_ret',  $sensor))		$exec_str .= "DS:kw_hi_ret:COUNTER:600:0:999999999 ";
			if (array_key_exists('kw_lo_ret',  $sensor))		$exec_str .= "DS:kw_lo_ret:COUNTER:600:0:999999999 ";
			if (array_key_exists('gas_use',    $sensor))		$exec_str .= "DS:gas_use:COUNTER:600:0:999999999 ";
			if (array_key_exists('kw_act_use', $sensor))		$exec_str .= "DS:kw_act_use:GAUGE:600:0:999999 ";
			if (array_key_exists('kw_act_ret', $sensor))		$exec_str .= "DS:kw_act_ret:GAUGE:600:0:999999 ";
			if (array_key_exists('kw_ph1_use', $sensor))		$exec_str .= "DS:kw_ph1_use:GAUGE:600:0:999999 ";
			if (array_key_exists('kw_ph2_use', $sensor))		$exec_str .= "DS:kw_ph2_use:GAUGE:600:0:999999 ";
			if (array_key_exists('kw_ph3_use', $sensor))		$exec_str .= "DS:kw_ph3_use:GAUGE:600:0:999999 ";
			$exec_str .= "RRA:AVERAGE:0.5:1:360 ";			// Hour: every 10 secs sample, consolidate 1 -> 360 per hour
			$exec_str .= "RRA:AVERAGE:0.5:90:96 ";			// Day: every 10 secs sample, consolidate 90 (15min) -> 4 per hour, 4*24= 96 a day
			$exec_str .= "RRA:AVERAGE:0.5:360:168 ";		// Week: 10 sec sample, consolidate 360 (= 1hr);  24 hrs * 7 day
			$exec_str .= "RRA:AVERAGE:0.5:1080:248 ";		// Month: 10 sec sample consolidate 1080 samples (3 hr) -> 8 pday * 31 days
			$exec_str .= "RRA:AVERAGE:0.5:8640:365 ";		// Year: 10 sec sample * 360 (=hour) * 24 = consolidate per day. Do 365 days a year
			// Week low and high values (hourly sample)
			$exec_str .= "RRA:MIN:0.5:360:720 ";			// MIN: 360 samples per hour, consolidate per hour, 24 hrs * 30 days = 720
			$exec_str .= "RRA:MAX:0.5:360:720 ";			// MAX
			// $exec_str .= "RRA:AVERAGE:0.5:360:720 ";		// AVG
		break;
		
		default:
			$log->lwrite("rrd create:: ERROR Unknown action found: ".$sensor['action']);
			return(-1);
		}
		$log->lwrite("rrd create:: command: ".$exec_str,1);
		if (shell_exec( $exec_str . " 2>&1 && echo ' '")  === NULL ) {
			$log->lwrite("rrdcreate:: ERROR: " . "Exec failed. " . "\n ");
			return (-1);
		}
		$log->lwrite("rrd create of db: ".$db." successful",1);
	}
	
	// Log a sensor value to its own rrd database. 
	//
	// $data['brand'], $data['address'], $data['channel'], $data['temperature'], $data['humidity'], 
	// $data['windspeed'], $data['winddirection'], $data['rainfall']
	//
	public function rrdupdate($sensor){
		global $log;
		global $rrd_dir;
		$rrd_db = $rrd_dir."db/";
		
		// Lookup the name of the sensor
		// NOTE Take care! Make sure that at least address and channel are found in databaae.cfg
		if (! ($name = $this->lookup($sensor))) {
			$log->lwrite("rrdupdate:: ERROR Sensor not found: ".$sensor['address'].":".$sensor['channel']);
			return(0);
		}
		// Does the directory dbd exist?
		if (! file_exists($rrd_db)) { 
			$log->lwrite("rrdupdate:: Creating database directory: ".$rrd_db,1);
			mkdir($rrd_db, 0775 );
		}
		// Does the database file exist already?
		$db = $rrd_db.$name.".rrd";
		$log->lwrite("rrdupdate:: Checking for .rrd file: ".$db,2);
		if (! file_exists($db)) { 
			$log->lwrite("rrdupdate:: Creating database file: ".$db,1);
			$this->rrdcreate($db, $sensor);
		}
		$values  = "";
		if (array_key_exists('temperature', $sensor))	$values .= ":".$sensor['temperature'];
		if (array_key_exists('humidity',$sensor))		$values .= ":".$sensor['humidity'];
		if (array_key_exists('airpressure',$sensor))	$values .= ":".$sensor['airpressure'];
		if (array_key_exists('altitude',$sensor))		$values .= ":".$sensor['altitude'];
		if (array_key_exists('windspeed',$sensor))		$values .= ":".$sensor['windspeed'];
		if (array_key_exists('winddirection',$sensor))	$values .= ":".$sensor['winddirection'];
		if (array_key_exists('rainfall',$sensor))		$values .= ":".$sensor['rainfall'];
		//
		// Make sure values are integer for counter type values
		//
		if (array_key_exists('kw_hi_use',$sensor))		$values .= ":".intval($sensor['kw_hi_use']*1000,10);
		if (array_key_exists('kw_lo_use', $sensor))		$values .= ":".intval($sensor['kw_lo_use']*1000,10);
		if (array_key_exists('kw_hi_ret', $sensor))		$values .= ":".intval($sensor['kw_hi_ret']*1000,10);
		if (array_key_exists('kw_lo_ret', $sensor))		$values .= ":".intval($sensor['kw_lo_ret']*1000,10);
		if (array_key_exists('gas_use', $sensor))		$values .= ":".intval($sensor['gas_use']*1000,10);
		if (array_key_exists('kw_act_use', $sensor))	$values .= ":".$sensor['kw_act_use']*1000;
		if (array_key_exists('kw_act_ret', $sensor))	$values .= ":".$sensor['kw_act_ret']*1000;
		if (array_key_exists('kw_ph1_use', $sensor))	$values .= ":".$sensor['kw_ph1_use']*1000;
		if (array_key_exists('kw_ph2_use', $sensor))	$values .= ":".$sensor['kw_ph2_use']*1000;
		if (array_key_exists('kw_ph3_use', $sensor))	$values .= ":".$sensor['kw_ph3_use']*1000;

		$exec_str = "rrdtool update ".$db." N".$values;
		
		$log->lwrite("rrdupdate:: cmd: ".$exec_str,2);
		
		if (($ret = shell_exec($exec_str . " 2>&1 && echo ' '"))  === NULL ) {
			$log->lwrite("rrdupdate:: ERROR: exec failed. ".": ".$exec_str);
			return (-1);
		}
		else if ($ret == -1) {
			$log->lwrite("rrdupdate:: ERROR: rrdtool returned error -1. ".": ".$exec_str);
		}
	}
}



// --------------------------------------------------------------------------------------
//	Some user related functions needed for credential checking etc.
//	The class is extensible
//
class User {
	
	// Password Check function
	public function pwcheck($data)
	{
		global $u_admin;			// Declared in the backend_cfg.php file
		for ($i=0; $i< count($u_admin); $i++)
		{
			if (($data['login'] == $u_admin[$i]['login']) &&
				($data['password'] == $u_admin[$i]['password']))
			{
					return(1);
			}
		}
		return(0);
	}
	
}

// ----------------------------------------------------------------------------------
// ZWAVE class
// XXX tbd further
//
 
class Zwave {
	
	public function scan($msg) {
		// Not implemented
	}
	
	public function send($msg) {
		global $log;
		global $razberry;
	
		//	$zwcmd = array (				
		//					'action' => "set",					// code for remote command. upd tells we update a value
		//					'type'   => $device['type'],		// type either switch or dimemer.
		//					'confirm' => "1",					// for Z-Wave may be 1
		//					'gaddr'  => $device['gaddr'],
		//					'uaddr'  => $dev."",				// From the sscanf command above, cast to string
		//					'brand'  => $brand,					// NOTE brand is a string, not an id here
		//					'val'    => $sndval				// Value is "on", "off", or a number (dimvalue) 1-32
		//					);
	
		$log->lwrite("zwave_send:: started\n",2);
	
		// Normally device address is 1 less than the address in the user interface
		// so $addr = $msg['uaddr'] - 1; but NOT for zwave!!!
		$addr = $msg['uaddr'];

		$ch = curl_init();
		if ($ch == false) {
			$log->lwrite("zwave_send:: curl error",0);
			return(-1);
		}
	
		$p = '';
	
		// Switch base on the message value and the type of the device
		switch ($msg['type']) {
		case 'dimmer':
			switch ($msg['val']) {
				case 'on':
					$p = 99;					// Maximum value in percentage
				break;
				case 'off':
					$p = 0;						// Minimum percentage
				break;
				default:
					$p = $msg['val']/32*99;		// Change from 0-31 to 0-99 base
			}
			$log->lwrite("zwave_send:: razberry is: ".$razberry.", uaddr: ".$addr.", val: ".$p,1);
			if ($msg['type'] == 'dimmer' ) {
				curl_setopt_array (
					$ch, array (
					// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchMultilevelSet/'.$addr.'/0/'.$p ,
					CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].commandClasses[38].Set('.$p.')',
					CURLOPT_RETURNTRANSFER => true
				));
			}
		break;

		case 'switch':
			switch ($msg['val']) {
				case "on":
				case "1":
					$p = "on";
					$log->lwrite("zwave_send:: Switching switch on, addr: ".$addr);
					curl_setopt_array (
						$ch, array (
						// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchBinaryOn/'.$addr.'/0',
						CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].commandClasses[37].Set(1)',
						CURLOPT_RETURNTRANSFER => true
					));
				break;
				case "off":
				case "0":
					$p = "off";
					$log->lwrite("zwave_send:: Switching switch on, addr: ".$addr);
					// Still have to interpret the return value
					curl_setopt_array (
						$ch, array (
						// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchBinaryOff/'.$addr.'/0',
						CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].commandClasses[37].Set(0)',
						CURLOPT_RETURNTRANSFER => true
					));
				break;
				default:
					$log->lwrite("zwave_send:: Unknown message value for switch: ".$msg['val']);
			}
		break;
		
		case 'thermostat':
			switch ($msg['val']) {
				case 'on':
					$p = 99;					// Maximum value in percentage
				break;
				case 'off':
					$p = 15;					// Minimum dwvalue
				break;
				default:
					$p = $msg['val'];			// Change from 0-31 to 0-99 base
			}
			$log->lwrite("zwave_send:: razberry is: ".$razberry.", uaddr: ".$addr.", val: ".$p,1);
			if ($msg['type'] == 'thermostat' ) {
				curl_setopt_array (
					$ch, array (
					// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchMultilevelSet/'.$addr.'/0/'.$p ,
					CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].ThermostatSetPoint.Set(1,'.$p.')',
					CURLOPT_RETURNTRANSFER => true
				));
			}
		break;
		
		default:
			$log->lwrite("zwave_send:: Unknown device type: ".$msg['type']);
		}
	
		$output = curl_exec($ch);
	
		if ($output === false) {
			$log->lwrite("zwave_send:: curl_exec Razberry execution error",0);
			curl_close($ch);
			return(-1);
		}
		else {
			$info = curl_getinfo($ch);
			if (!empty($info['http_code'])) {
				switch ($info['http_code'] ) {
					// Code OK
					case 200:
						$log->lwrite("\t*** zwave->send:: http code 200, <OK>",2);
						$output = ceil($output/99*32);
						return(1);
					break;
					// Internal Error
					case 500:
						// This could be a sign of degrading webserver performance
						$log->lwrite("\t*** zwave->send for ".$dev." returned http code 500, internal error",1);
						return(false);
					break;
					default:
						$log->lwrite("\t*** zwave->send returned http code ".$info['http_code'],1);
						return(false);
					break;
				}
			}
			else {
				$log->lwrite("\tzway_dim_val returned value ".$vv,1);
				curl_close($ch);
				return(1);
			}
		}

		
		if ($output == '"'.$p.'"') {
			$log->lwrite("zwave_send:: curl_exec set correctly to: ".$output,2);
		}
		else {
			$log->lwrite("zwave_send:: ERROR:: curl_exec expected ".$p." but set returned to: ".$output,1);
			curl_close($ch);
			return(-1);
		}
		$log->lwrite("zwave_send:: Output is: ".$output,2);	
		curl_close($ch);
		return(1);	
	}//send
	
}// Class


// ---------------------------------------------------------------------------------- 
// Send the $,sg to the Razberry machine. At this moment we have the Razberry server
// as a separeate device on the network.
// The function returns 1 on success.
//
function zwave_send($msg) {
	global $log;
	global $razberry;
	
	//	$zwcmd = array (				
	//					'action' => "set",					// code for remote command. upd tells we update a value
	//					'type'   => $device['type'],		// type either switch or dimemer.
	//					'confirm' => "1",					// for Z-Wave may be 1
	//					'gaddr'  => $device['gaddr'],
	//					'uaddr'  => $dev."",				// From the sscanf command above, cast to string
	//					'brand'  => $brand,					// NOTE brand is a string, not an id here
	//					'val'    => $sndval				// Value is "on", "off", or a number (dimvalue) 1-32
	//					);
	
	$log->lwrite("zwave_send:: started\n",2);
	
	// Normally device address is 1 less than the address in the user interface
	// so $addr = $msg['uaddr'] - 1; but NOT for zwave!!!
	$addr = $msg['uaddr'];
	
	$ch = curl_init();
	if ($ch === false) {
		$log->lwrite("zwave_send:: curl error",0);
		return(-1);
	}
	
	$p = '';
	
	// Switch base on the message value and the type of the device
	switch ($msg['type']) {
		case 'dimmer':
			switch ($msg['val']) {
				case 'on':
					$p = 99;					// Maximum value in percentage
				break;
				case 'off':
					$p = 0;						// Minimum percentage
				break;
				default:
					$p = $msg['val']/32*99;		// Change from 0-31 to 0-99 base
			}
			$log->lwrite("zwave_send:: razberry is: ".$razberry.", uaddr: ".$addr.", val: ".$p,1);
			if ($msg['type'] == 'dimmer' ) {
				curl_setopt_array (
					$ch, array (
					// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchMultilevelSet/'.$addr.'/0/'.$p ,
					CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].commandClasses[38].Set('.$p.')',
					CURLOPT_RETURNTRANSFER => true
				));
			}
		break;

		case 'switch':
			switch ($msg['val']) {
				case "on":
				case "1":
					$p = "on";
					$log->lwrite("zwave_send:: Switching switch on, addr: ".$addr);
					curl_setopt_array (
						$ch, array (
						// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchBinaryOn/'.$addr.'/0',
						CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].commandClasses[37].Set(1)',
						CURLOPT_RETURNTRANSFER => true
					));
				break;
				case "off":
				case "0":
					$p = "off";
					$log->lwrite("zwave_send:: Switching switch on, addr: ".$addr);
					// Still have to interpret the return value
					curl_setopt_array (
						$ch, array (
						// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchBinaryOff/'.$addr.'/0',
						CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].commandClasses[37].Set(0)',
						CURLOPT_RETURNTRANSFER => true
					));
				break;
				default:
					$log->lwrite("zwave_send:: Unknown message value for switch: ".$msg['val']);
			}
		break;
		
		case 'thermostat':
			switch ($msg['val']) {
				case 'on':
					$p = 99;					// Maximum value in percentage
				break;
				case 'off':
					$p = 15;					// Minimum dwvalue
				break;
				default:
					$p = $msg['val'];			// Change from 0-31 to 0-99 base
			}
			$log->lwrite("zwave_send:: razberry is: ".$razberry.", uaddr: ".$addr.", val: ".$p,1);
			if ($msg['type'] == 'thermostat' ) {
				curl_setopt_array (
					$ch, array (
					// CURLOPT_URL => 'http://'.$razberry.':8083/ZAutomation/OpenRemote/SwitchMultilevelSet/'.$addr.'/0/'.$p ,
					CURLOPT_URL => 'http://'.$razberry.':8083/ZWaveAPI/Run/devices['.$addr.'].instances[0].ThermostatSetPoint.Set(1,'.$p.')',
					CURLOPT_RETURNTRANSFER => true
				));
			}
		break;
			
		default:
			$log->lwrite("zwave_send:: Unknown device type: ".$msg['type']);
			return(false);
	}
	
	$output = curl_exec($ch);
	
	if ($output === false) {
		$log->lwrite("zwave_send:: curl_exec Razberry execution error",0);
		curl_close($ch);
		return(-1);
	}
	else {
		$info = curl_getinfo($ch);
		if (!empty($info['http_code'])) {
				switch ($info['http_code'] ) {
					// Code OK
					case 200:
						$log->lwrite("\t*** zwave->send:: http code 200, <OK>",1);
						return(1);
					break;
					// Internal Error
					case 500:
						// This could be a sign of degrading webserver performance
						$log->lwrite("\t*** zwave->send for ".$addr." returned http code 500, internal error",1);
						return(false);
					break;
					default:
						$log->lwrite("\t*** zwave->send returned http code ".$info['http_code'],1);
						return(false);
					break;
				}
		}
		else {
			$log->lwrite("\tzway_dim_val returned value ".$vv,1);
			curl_close($ch);
			return(1);
		}
	}
	
	
	if ($output == '"'.$p.'"') {
		$log->lwrite("zwave_send:: curl_exec set correctly to: ".$output,2);
	}
	else {
		$log->lwrite("zwave_send:: ERROR:: curl_exec expected ".$p." but set returned to: ".$output,1);
		curl_close($ch);
		return(-1);
	}
	$log->lwrite("zwave_send:: Output is: ".$output,2);	
	curl_close($ch);
	return(1);
}


/* ---------------------------------------------------------------------------------------------
* CLASS	Queue definition for device actions that are in timing queue
*
* Item to insert ($item):
*	- scene: name of the scene, may be empty for single device actions
*	- cmd: Device command
*	- secs (interval between several elements in same scene). Maye be now == time() for immediate action
*
*
* Queue element is object { scene, cmd, time }
*	- scene: The scene name that this command belongs to
*	- cmd: the command itself (ICS-1000 message), but at this moment e assume only device messages !RxDxFx or !RxDxFdPyy
*	- time: Amount of seconds before the cmd has to fire
*
* NOTE: For other commands like RxFa (all OFF in room x) we translate upon reception. The queue stays clean.
*
*/
class Queue {
	
	private $q_list = [];
	// Insert based on timing. This takes extra time initially, but makes our live later easier
	// We know then that all actions in queue are sorted on time, first coming soonest
	public function q_insert($item) {
		global $log;
		global $debug;
		
		for ($i=count($this->q_list); $i>0 ; $i--) {
			if ( $this->q_list[$i-1]['secs'] < $item['secs'] ) {
				
				break;
			}
			$this->q_list[$i] = $this->q_list[$i-1] ;
		}
		$this->q_list[$i] = $item;
		if ($debug>2) $log->lwrite("q_insert:: Splicing queue at position: ".$i);
	}
	
	// Print the items in the queue
	public function q_print() {
		global $log;
		$tim = time();
		$log->lwrite("q_print:: Listing Queue, starting on: ".date('[d/M/Y:H:i:s]',$tim));
		
		for ($i=0; $i< count($this->q_list); $i++) {
			$log->lwrite("q_print:: Item: ".$i."::".$this->q_list[$i]['scene'].",".$this->q_list[$i]['cmd'].",".date('[d/M/Y:H:i:s]',$this->q_list[$i]['secs']));
		}
	}
	
	// If current time is > than the timestamp of an item in the queue
	// we should pop that item from the queue (can be multiple) and return those records.
	public function q_pop() {
		global $debug;
		global $log;
		$tim = time();
		$result = [];
		$i = 0;
		$log->lwrite("q_pop:: looking for runnable items on queue",3);
		for ($i=0; $i<count($this->q_list); $i++) {
			if ($this->q_list[$i]["secs"] > $tim ) {
				break;
			}
			$log->lwrite("q_pop:: pop Item ".$i.": ".$this->q_list[$i]['action'],2);
		}
		$result = array_splice($this->q_list,0,$i);
		return($result);
	}// q_pop
	
	// Returns the number of seconds to go before the next item on queue becomes runnable
	public function q_tim() {
		global $debug;
		global $log;
		if (count($this->q_list) > 0)
			return($this->q_list[0]['secs']);
		else
			return(-1);
	}
	
}// Class QUEUE



/* -----------------------------------------------------------------------------------
* CLASS DEVICE 
* 
*  This class contains all device related functions such as "add", "update", "delete", "get"
* We need device functions to update the status of devices once the daemon starts executing
* commands in the queue.
*
* The client will only see these changes if the page is reloaded or devices are reloaded for
* some reason.
*/
class Device {
	private $d_list = [];
	private $mysqli;
	
	// SQL connection remains open during the daemon running. 
	private function sql_open() {
		global $log;
		global $dbuser, $dbpass, $dbname, $dbhost;
		$this->mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
		if ($this->mysqli->connect_errno) {
			$log->lwrite("sql_open:: failed to connect to MySQL: (".$this->mysqli->connect_errno.") ".$this->mysqli->connect_error);
			return (-1);
		}
		return(0);
	}
	
	// Add a new device record/object
	//
	public function add() {
		global $log;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
	}
	
	// Lookup by id
	//
	public function get($room_id, $unit_nr) {
		global $debug, $log;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
		
		$sqlCommand = "SELECT * FROM devices WHERE unit='$unit_nr' AND room='$room_id'";
		$query = mysqli_query($this->mysqli, $sqlCommand) or die (mysqli_error());
		while ($row = mysqli_fetch_assoc($query)) { 
			$log->lwrite("get:: found device: ".$row['name'],2);
			return($row) ;
		}
		$log->lwrite("get:: Did not find device with unit_nr: ".$unit_nr,1);
		mysqli_free_result($query);
		return(false);
	}
	
	// update device object in sql
	//
	public function upd($device) {
		global $log, $devices;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
		// Write to internal structure
		
		// Write to SQL
		$query = "UPDATE devices SET val='".$device['val']."', 
									lastval='".$device['lastval']."', 
									name='".$device['name']."', 
									brand='".$device['brand']."' 
				WHERE room='$device[room]' AND id='$device[id]' " ;
		if (!mysqli_query($this->mysqli, $query))
		{
			$log->lwrite( "upd:: mysqli_query error" );
			return (-1);
		}
		return(0);
	}
	
	// XXX Delete a device not yet implemented
	//
	public function del($device) {
		global $log;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
	}
}



/* -----------------------------------------------------------------------------------
* CLASS WEATHER
* 
* This class contains weather related functions such as "add", "update", "delete", "get"
* We need weather functions to update the status of weather sensors once the daemon  
* starts executing commands in the queue.
*
* The client will only see these changes if the page is reloaded or weather are
* reloaded for some reason.
*/
class Weather {
	private $w_list = [];
	private $mysqli;
	
	// SQL connection remains open during the daemon running. 
	private function sql_open() {
		global $log;
		global $dbuser, $dbpass, $dbname, $dbhost;
		$this->mysqli = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
		if ($this->mysqli->connect_errno) {
			$log->lwrite("sql_open:: failed to connect to MySQL: ("
						.$this->mysqli->connect_errno.") "
						 .$this->mysqli->connect_error);
			return (-1);
		}
		return(0);
	}
	
	// Add a new device record/object
	//
	public function add() {
		global $log;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
		// XXX Not necessary
	}
	
	// Lookup by address and channel combination
	//
	public function get($address, $channel) {
		global $debug, $log;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
		
		if ($debug>1) $log->lwrite("get:: room: ".$address.", dev: ".$channel);
		
		$sqlCommand = "SELECT * FROM weather WHERE address='$address' AND channel='$channel'";
		$query = mysqli_query($this->mysqli, $sqlCommand) or die (mysqli_error());
		while ($row = mysqli_fetch_assoc($query)) { 
			if ($debug>1) $log->lwrite("get:: found weather sensor: ".$row['name']);
			return($row) ;
		}
		$log->lwrite("get:: Did not find weather");
		mysqli_free_result($query);
	}
	
	// update device object in sql
	//
	public function upd($w) {
		global $log, $weather;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
		// Remove unassigned value and replace with empty element
		foreach ($w as $value) { if ($value === 'undefined') $value=""; }
		// Assign every key a value (code works without but this is neater
   		if (! array_key_exists ( 'temperature' , $w ))		$w['temperature'] = "";
		if (! array_key_exists ( 'humidity' , $w ))			$w['humidity'] = "";
		if (! array_key_exists ( 'airpressure' , $w ))		$w['airpressure'] = "";
		if (! array_key_exists ( 'windspeed' , $w ))		$w['windspeed'] = "";
		if (! array_key_exists ( 'winddirection' , $w ))	$w['winddirection'] = "";
		if (! array_key_exists ( 'rainfall' , $w ))			$w['rainfall'] = "";
		
		// Write to log
		$log->lwrite("Weather upd:: address: ".$w['address'].", channel: ".$w['channel']
												.", temperature: ".$w['temperature']
												.", humidity: ".$w['humidity']
												.", airpressure: ".$w['airpressure']
												,2);

		// Write to SQL. For the moment we write ALL fields in the table, even if not used
		// XXX Check for existence of these indexes
		$query = "UPDATE weather SET 
									temperature='".$w['temperature']."',
									humidity='".$w['humidity']."',
									airpressure='".$w['airpressure']."',
									windspeed='".$w['windspeed']."',
									winddirection='".$w['winddirection']."',
									rainfall='".$w['rainfall']."' 
												   
				WHERE address='$w[address]' AND channel='$w[channel]' " ;
				
		if (!mysqli_query($this->mysqli, $query))
		{
			$log->lwrite( "Weather upd:: mysqli_query error" );
			return (-1);
		}
		return(0);
	}
	
	// Delete a device XXX not yet implemented
	//
	public function del($weather) {
		global $log;
		if (!is_resource($this->mysqli)) {
            $this->sql_open();
        }
		// XXX Not implemented yet
	}
}// class Weather


/*	--------------------------------------------------------------------------------	
	function get_parse. 
	Parse the $_GET  for commands
	Commands may be lamp, load, message, style, debug
		In case of lamp, message contains its parameters
	--------------------------------------------------------------------------------	*/
function get_parse() 
{
  global $apperr, $action, $icsmsg;
  global $log;
  global $doinit, $doreset, $dofile;
  
  $shortopts = "r";						// options without argument, r=reset
  $shortopts.= "i::";					// Options with optional argument, l=load with optional argument "file"
  $shortopts.= "f:";						// Required value argument
  $longopts  = array(
    "required:",     					// Required value
    "init::",    						// Optional value, init the database again
    "reset",        					// No value
	);
  $options = getopt($shortopts, $longopts);
  
  foreach ($options as $ind => $val )
  {
    $log->lwrite ("get_parse:: index: $ind and val: $val<br>");
    switch($ind) 
	{
		case "init":
		case "i":
			$doinit = true;
			$dofile = $val;
		break;
		case "reset":
		case "r":
			$doreset = true;
		break;
    } //   Switch ind
  }	//  Foreach
  return(true);
} // Func



/* ---------------------------------------------------------------------------------
* Console_Message
*
* Parse a message coming from the outside world on a socket.
* and parse it for commands. Commands are console/management action
* 
*/
function console_message($request) {
	global $log;
	global $sock;
	global $home_dir;
	global $log_dir;
	
	$ret='';
	
	$ret = "";
	switch($request) {
		
		case 'clients':
			$ret = '<br>';
			foreach ($sock->clients as $key => $val ) {
				$ret .= "IP: ".$sock->sockadmin[$key]['ip'].":".$sock->sockadmin[$key]['port'];
				//$ret .=	", type ".$sock->sockadmin[$key]['type']."\n";
				$ret .=	", type ".$sock->sockadmin[$key]['type']."<br>";
			}
		break;
		
		case 'logs':
			$rr = array();
			$ret = '<br>Logdata for the LamPI-daemon: <div style="font-size:10px;">';
			$err = exec('tail -30 '.$log_dir.'LamPI-daemon.log', $rr);
			$log->lwrite("console_message:: Return value logs for logdir: <".$log_dir.">, exec: <".$err.">",1);
			foreach ( $rr as $v )
			{
				//$ret .= $v."\n";
				$ret .= $v."<br>";
			}
			$ret .= '</div>';
			$log->lwrite("console_message:: Result value logs exec: <".$ret.">",1);
		break;
		
		case 'zlogs':
			$rr = array();
			$ret = '<br>Zway log for the LamPI-daemon: <div style="font-size:10px;">';
			$err = exec('tail -30 '.$log_dir.'LamPI-gate.log', $rr);
			$log->lwrite("console_message:: Return value zlogs exec: <".$err.">");
			foreach ( $rr as $v )
			{
				//$ret .= $v."\n";
				$ret .= $v."<br>";
			}
			$ret .= '</div>';
		break;
		
		case 'rebootdaemon':
			// Actually it will take max a minute before the crontab kicks in
			$ret = "Reboot the daemon process .. this may take a minute";
			$ret .= system($home_dir.'scripts/PI-run -r &');
		break;
		
		case 'reloadconfig':
			// Actually it will take max a minute before the crontab kicks in
			$ret = "Reload config and restart daemon process .. this may take a minute";
			$ret .= system($home_dir.'scripts/PI-run -r -c &');
		break;
		
		case 'sunrisesunset':
			$ret = '<br>';
			$ret .= "Sunrise on : ".date('H:i:s',date_sunrise(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1))."<br>";
			$ret .= "Sunset on : ".date('H:i:s',date_sunset(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1))."<br>";
		break;
		
		default:
			$ret = "console_message:: Not recognized: <".$request.">";
		break;
	}
	return($ret);
}


/* ---------------------------------------------------------------------------------
* MESSAGE_PARSE a GUI or HANDSET message
*
* Parse a message coming from the outside world on a socket.
* and parse it for commands. Commands may either be events for the run Queue
* or changes to the database/settings that will influence the timer
* 
* XXX This function could/needs to be extended so it can parse json too
*
* Commands:
*	!RxDyFz, where x is room number 1-16, y is device number 0-31 and z is
*			either 1 (On) or 0 (Off)
*	!AxxxxxxxxDyFz, Handset command, arriving on Address xxxx and for button
*			pair y with value z (0 or 1)
*	!FqP"scene", Run scene with the name "scene"
*
*/
function message_parse($cmd) {
	
	global $debug, $log, $queue;
	global $devices, $scenes, $handsets;

	$log->lwrite("message_parse:: starting for command ".$cmd,1);
	// XXX use json to properly receive commands?
	$tim = time();
	switch ( substr($cmd,0,2) ) 
	{
	// All scene and timer commands start with !F
	case '!F':
	
		switch ( substr($cmd,2,2) )
		{
		// Queue and start a scene
		case "qP":
			$scene_name = substr($cmd, 5, -1);					// Get rid of quotes around name 
			$log->lwrite("message_parse:: FqP Scene Queue cmd: ".$scene_name,1);
			
			$scene = read_scene($scene_name);
			if ($scene == -1) { 								// Command not found in database
				$log->lwrite("message_parse:: Cannot find scene: ".$scene_name." in the database");
				break; 
			}
			$scene_seq = $scene['seq'];
			if ($scene_seq == "") {
				$log->lwrite("message_parse:: Scene: ".$scene_name." found, but sequence empty (must save first)");
				break;
			}
			$log->lwrite("message_parse:: Scene found, reading sequence: ".$scene_seq);
			// Split the Scene sequence into 2 elements separated bu comma (!RxxDxxFxyy,hh:mm:ss);
			$splits = explode(',' , $scene_seq);
			
			for ($i=0; $i< count($splits); $i+=2) {
				// $cmd = $splits[$i];
				// If $cmd is a ALL OFF command, we need to substitue the command with
				// a string of device commands that need to be switched off.....
				
				$log->lwrite("cmd  : " . $i . "=>" . $splits[$i],2);
				$log->lwrite("timer: " . $i . "=>" . $splits[$i+1],2);
				
				list ( $hrs, $mins, $secs ) = explode(':' , $splits[$i+1]);
				$log->lwrite("message_parse:: Cmnd wait for $hrs hours, $mins minutes and $secs seconds",1);
				
				// sleep(($hrs*3600)+($mins*60)+$secs);
				// We cannot sleep in the background now, it will give a timeout!!
				// we'll have to implement something like a timeer through cron or so
				$item = array(
					'action'=> "gui",
    				'scene' => $scene_name,
    				'cmd'   => $splits[$i],
					'secs'  => ($hrs*3600)+($mins*60)+$secs+ $tim
   				);
				$queue->q_insert($item);
				$queue->q_print();
			}
		break;
		
		// Store a Scene in the database
		case "eP":	
			$log->lwrite("message_parse:: FeP Scene Store cmd: ".$cmd,1 );
		break;
		
		case "cP":
			$log->lwrite("message_parse:: FcP Scene Cancel cmd: ".$cmd,1 );
		break;
		
		case "xP":
			$log->lwrite("message_parse:: FxP Scene Delete cmd: ".$cmd,1 );
		break;
		
		default:
			$log->lwrite("message_parse:: Daemon does not recognize command: ".$cmd,1 );
		}//switch(2,2)
	break;	
	//	
	// All room and device commands start with !R
	// These room commands are received from the GUI application.
	//
	case "!R":
		list( $room, $value ) = sscanf ($cmd, "!R%dF%s" );
		if ($debug>1) $log->lwrite("parse:: Room: ".$room.", Value: ".$value);
		if (substr($value,0,1) == "a") {
			// All OFF
			$log->lwrite("message_parse:: All OFF:: Room: ".$room,1);
			for ($i=0; $i< count($devices); $i++) {
				// Make sure that only switch and dimmers are part of ALL OFF command
				if (($devices[$i]['room'] == $room ) && ($devices[$i]['type'] != "thermostat" )) {
					
					$devices[$i]['val']=0;
					// We expand the Fa command, look up all devices in that room and
					// insert a F0 OFF command for every device in the queue
					$item = array(
    					'scene' => "",
						'action' => "gui",
    					'cmd'   => "!R".$room."D".$devices[$i]['unit']."F0",
						'secs'  => time()
   					);
					$queue->q_insert($item);
				}
			}
			break;
		}
	
		list( $room, $dev, $value ) = sscanf ($cmd, "!R%dD%dF%s" );
		if ($debug>1) $log->lwrite("parse:: Room: ".$room.", Device: ".$dev.", Value: ".$value);	
		if (substr($value,0,1) == "0") {
			// Device OFF
			$log->lwrite("message_parse:: Device OFF:: Room: ".$room.", Dev: ".$dev.", Val: ".$value);
			$item = array(
    			'scene' => "",
				'action' => "gui",
    			'cmd'   => $cmd,
				'secs'  => time()
   			);
			$queue->q_insert($item);
			break;
		}
		else if (substr($value,0,1) == "1") {
			// Device ON
			$log->lwrite("message_parse:: Device ON:: Room: ".$room.", Dev: ".$dev.", Val: ".$value);
			$item = array(
    			'scene' => "",
				'action' => "gui",
    			'cmd'   => $cmd,
				'secs'  => time()
   			);
			$queue->q_insert($item);
			break;
		}
		else {
			// Device Dim, skip first 2 chars
			$log->lwrite("message_parse:: Device Dim:: Room: ".$room.", Dev: ".$dev.", Val: ".substr($value,2));
			$item = array(
    			'scene' => "",
				'action' => "gui",
    			'cmd'   => $cmd,
				'secs'  => time()
   			);
			$queue->q_insert($item);
			break;
		}
	break;
	
	// All handsets and remote commands start with an address of the device
	// Message format: "!AxxxxxxxxDyyGz" for Group code "!AxxxxxxxxDyyFz for Device codes"
	// We do NOT accept dimmers at the moment, although we could do something
	// when we receive a wireless signal from another device.
		
	case "!A":
	
		list( $address, $dev, $value ) = sscanf ($cmd, "!A%dD%dF%s" );
		if ($debug>1) $log->lwrite("message_parse:: Address: ".$address.", Dev: ".$dev.", Value: ".$value);
		
		// Lookup the address, unit, value combination in array $handsets
		// If we find the corresponsing scene, execute that scene by calling this function again
		// recursively
		if (($handsets = load_handsets()) == -1) {
			$log->lwrite("message_parse:: load handsets failed");
		}
		if ($debug>2) $log->lwrite("message_parse:: load handsets success, count: ".count($handsets) );
		
		for ($i=0; $i<count($handsets); $i++) 
		{	
			if ($debug>2) $log->lwrite("message_parse:: Handset ".$handsets[$i]['addr'].":".$handsets[$i]['unit'].":".$handsets[$i]['val']." found, scene: ".$handsets[$i]['scene']);
			
			// If the handset matches with the address, unit and the value (=button pressed) 
			// then execute the scene
			if ( ($handsets[$i]['addr'] == $address) &&
				 ($handsets[$i]['unit'] == $dev ) &&
				 ($handsets[$i]['val'] == $value ))
			{
				$splits = explode(',' , $handsets[$i]['scene']);
			
				for ($j=0; $j< count($splits); $j+=2) {
				
					// If $cmd is a ALL OFF command, we need to substitue the command wit
					// a string of device commands that need to be switched off.....
				
					if ($debug > 1) $log->lwrite("cmd  : " . $j . "=>" . $splits[$j]);
					if ($debug > 1) $log->lwrite("timer: " . $j . "=>" . $splits[$j+1]);
				
					list ( $hrs, $mins, $secs ) = explode(':' , $splits[$j+1]);
					$log->lwrite("message_parse:: Cmd wait for $hrs hours, $mins minutes and $secs seconds");
				
					// sleep(($hrs*3600)+($mins*60)+$secs);
					// We cannot sleep in the background now, it will give a timeout!!
					// we'll have to implement something like a timeer through cron or so
					$item = array(
    					'scene' => $handsets[$i]['name'],
						'action' => "gui",
    					'cmd'   => $splits[$j],
						'secs'  => ($hrs*3600)+($mins*60)+$secs+ $tim
   					);
					$queue->q_insert($item);
					$queue->q_print();
				}//for all splits
				
			}//if addres match
		}//for count handsets
		$log->lwrite("message_parse:: !A message finished");
		
	break;
	
	case "!Q":
		//if (substr($value,0,1) == "0") {
			// Group OFF
			//if ($debug>0) $log->lwrite("parse:: All OFF:: Room: ".$room.", Val: ".$value);
			//for ($i=0; $i< count($devices); $i++) {
				//if ($devices[$i]['room'] == $room ) {
					//$devices[$i]['val']=0;
					// We expand the Fa command, look up all devices in that room and
					// insert a F0 OFF command for every device in the queue
					//$item = array(
    				//	'scene' => "",
    				//	'cmd'   => "!R".$room.$devices[$i]['id']."F0",
					//	'secs'  => time()
   					//);
					//$queue->q_insert($item);
				//}
			//}
			//break;
		//}//if
	
		list( $address, $dev, $value ) = sscanf ($cmd, "!G%dD%dG%s" );
		if ($debug>1) $log->lwrite("message_parse:: Address: ".$address.", Device: ".$dev.", Value: ".$value);	
		if (substr($value,0,1) == "0") {
			// Device OFF
			$log->lwrite("message_parse:: Device OFF:: Address: ".$address.", Dev: ".$dev.", Val: ".$value);
			$item = array(
    			'scene' => "",
				'action' => "gui",
    			'cmd'   => $cmd,
				'secs'  => time()
   			);
			$queue->q_insert($item);
			break;
		}
		else if (substr($value,0,1) == "1") {
			// Device ON
			$log->lwrite("message_parse:: Device ON:: Address: ".$address.", Dev: ".$dev.", Val: ".$value);
			$item = array(
    			'scene' => "",
				'action' => "gui",
    			'cmd'   => $cmd,
				'secs'  => time()
   			);
			$queue->q_insert($item);
			break;
		}
	break;
	
	default:
		$log->lwrite("message_parse:: Command not recognized: ".$cmd);
	
	}//switch cmd substr(0,2)
}//function


/*	==============================================================================	
*	MAIN PROGRAM
*
* The main program and control flow is as follows:
* 
* 0. Initially the code initializes variables and parses the commandline for special commands
* 1. The communication socket is read, and incoming messages are parsed. the messages can be:
*	- Simple commands for devices (on/off/dimlevel)
*	- Group commands such as ALL OFF in a room
*	- Scene execution commands
*   The commands received are inserted in a queue, with timing for execution
*
* 2. We execute the queue for commands that need execution based on their timing info
*	- Some information sich as the brand is retrieved during queue execution
*
* 3. We read the timers database to see if there are timers that fire. 
*	- If a timer expires, we lookup the corresponding scene
*	- We decompose/explode the commandstring of the scene into separate command/time pairs
*	- Each command/timer pair is inserted in the queue
*/

/*	==============================================================================	*/
$ret = 0;
set_time_limit(0);							// NO execution time limit imposed
ob_implicit_flush();

$log = new Logging();						// Logging class initialization, maybe init at declaration
$sensor = new Sensor();						// Weather Log

$queue = new Queue();
$sock = new Sock();
$dlist = new Device();						// Class for handling of device specific commands
$wthr = new Weather();						// Class for Weather handling in database

// set path and name of log file (optional)
$log->lfile($log_dir.'/LamPI-daemon.log');
$log->lwrite("-------------- STARTING DAEMON ----------------------");
sleep(2);

// Open the SQL handler to the mysql daemon
$pisql = new mysqli($dbhost, $dbuser, $dbpass, $dbname);
if ($pisql->connect_errno) {
	$log->lwrite("LamPI-daemon:: Failed to connect to MySQL: (".$pisql->connect_errno.") ".$pisql->connect_error,1);
	exit (1);
}

// Some variables that are probably (re)set by get_parse();
$doinit=false;
$doreset=false;
$dofile="";

// Parse the comamndline (starting) for commandparameters
	// 1. Parse the URL sent by client (not working, but could restart itself later version)
	// XXX Need to adapt get_parse to also read URL-like (should that be necessary)

	if ( get_parse() )
	{
		// Do some Processing of commandline arguments. For init, the standard filename IS database.cfg
		// could also include the setting of debug on the client side
		if ( $doinit ) {
			$dbfile = $config_dir . "database.cfg";
			if ($dofile != "") {
				$dbfile = $dofile;
			}
			$log->lwrite("main:: Option do_init selected, reading db file: ".$dofile,1);
			$cfg = read_database($dbfile);			// Load $cfg Object from File
			$ret = fill_database($cfg);									// Fill the MySQL Database with $cfg object
			$ret = file_database($config_dir . "newdbms.cfg", $cfg);	// Make backup to other file
			$ret = print_database($cfg);
		}
		if ($doreset) {
			$log->lwrite("main:: Option do_reset selected",1);
			
		}

		$log->lwrite("Done processing command parameters at ".date("r")."\n",2);
	}
	else {
		$log->lwrite("main:: get_parse had no commandline parameters ".date("r")."\n",1);
	}
	
// Start with loading the database into a local $config structure. This takes 
// time once , but once we are in the loop it will save us time every loop.

$log->lwrite("main:: Loading the database");
$config = load_database();					// load the complete configuration object
if ($config == -1) 
{
	$log->lwrite("main:: FATAL Error loading database, exiting now");
	exit(1);
}
else 
	$log->lwrite("main:: database successfully loaded",1);

$devices     = $config['devices'];
$scenes      = $config['scenes'];
$timers      = $config['timers'];			// These will be refreshed IN the loop to get up-to-date timers
$rooms       = $config['rooms'];
$handsets    = $config['handsets'];
$brands      = $config['brands'];
$settings    = $config['settings'];
$controllers = $config['controllers'];
$weather     = $config['weather'];

$time_last_run = time();					// Last time we checked the queue. Initial to current time

// Loop forever, daemon like behaviour. For testing, we will use echo commands
// once the daemon is running operational, we should only echo to a logfile.

$log->lwrite("Sunrise on : ".date('H:i:s',date_sunrise(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1)));
$log->lwrite("Sunset on : ".date('H:i:s',date_sunset(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1)));

while (true):
							
// three scenarios/phases during the loop:
//
// 1. Read and parse the socket for for SCENE commands.
//		Run device commands immediately (set timeout or so), and add scene commands to the queue
//		(timer commands do not go through this interface but through MySQL directly)
// 2. Once a scene sequence is fired, the individual commands in the sequence might be timed later 
// 		(We can read when the next action in the QUEUE needs to fire, since QUEUE is stored on timestamp)
// 3. Timers from scenes stored in MySQL will fire. This needs to run every minute or so
//		but not more, since the timers have a one minute resolution in the database
// 
//		This is why timers and scenes live in same space in ICS-1000. Scenes are
//		just timers without start time

	$log->lwrite("------------------ Loop ------------------------",1);

	$tim = time();				// Get seconds since 1970. Timestamp
	$qtim = $queue->q_tim();
	
	//
	// Determine whether and how long we can wait, waiting on the socket uses less cpu cycles..... 
	//	- Until max the Queue time for next option. sleep($qtim - $tim) seconds.
	//  - Until max the next minute to the timer objects (scan every minute as in $interval )
	// 		sleep($interval - ($ntim-$tim) - 1);
	//  - If during waiting data arrives at the socket we will process, and then sleep again here...
	//
	// Calculate wait time for the socket:
	// Specify a waittime in the socket which is (1) less than $interval && (2) less than $qtim-$tim.
	// So that we wait no longer than the start time of next queue event...
	
	if ($debug > 2) $log->lwrite("tim: ".$tim.", qtim: ".$qtim);
	
	if ($qtim > 0) {
		if ( $sock->s_wait( min($interval,($qtim-$tim)) ) == -1) {
			$log->lwrite("Failure to set waittime on socket: ");
		}
	}
	else {
	// If there is nothing on the queue, items only are inserted over sockets or over the timer,
	// run every $interval second.
		if ( $sock->s_wait( $interval ) === -1) {
			if (debug>=1) $log->lwrite("main:: Failure to set wait time on socket: ");
		}
	}
	
	// -------------------------------
	// 1. STAGE 1 - LISTEN TO THE SOCKET LAYER FOR INCOMING MESSAGES
	
	// Lets look to the socket layer and see whether there are messages for use
	// and handle these messages. We will put actions in a QUEUE based on timestamp.
	// As long as there is data, continue reading
	
	while ( ($buf = $sock->s_recv() ) != -1 )
	{
		// The data structure read is decoded into a human readible string. jSon or raw
		//
		$log->lwrite("main:: s_recv returned Json with ".count($buf)." elements",3 );
		
		// Once we receive first message, read for more messages later, but without!! a timeout
		if ( $sock->s_wait(0) == -1) {
			$log->lwrite("ERROR main:: Failure to set wait (time=0) on socket: ");
		}
		
		// Make sure that if two json messages are present in the buffer
		// that we decode both of them.. determine position of  "}" in buffer
		$i = 0;
		// There may be nested json messages in the buffer. Therefore we cannot rely on either
		// the first (1) or the last (2) position of a } character in the buffer.
		// 1. { ... { ... } ... } would not work
		// 2. { ... }{ ......} will not be decoded correctly
		// The second form is not corect json for a string anyway. So the solution might be to substr() for "}{" and make sure we
		// decode these strings one by one. And expect in between these are valid json constructs.
		// XXX A situation arises when the json buf is multilevel yet still incomplete. Chances are few
		while (($pos = strrpos($buf,"}",$i)) !== FALSE )
		{
			// The first occurrence of }{ means we have at least 2 jSon messages
			if (($pos2 = strpos($buf,"}{",$i)) !== FALSE )
			{
				$pos = $pos2;
			}
			$log->lwrite("s_recv:: decoding substr: ".substr($buf,$i,($pos+1-$i)),1 );
			
			$data = json_decode(substr($buf,$i,($pos+1-$i)), true);
			$tcnt = $data['tcnt'];						// Must be present in every communication
			
			if ($data == null) {
				switch (json_last_error()) {
							case JSON_ERROR_NONE:
            					$log->lwrite(" - No errors");
        					break;
        					case JSON_ERROR_DEPTH:
        					    $log->lwrite(" - Maximum stack depth exceeded");
       						break;
       						case JSON_ERROR_STATE_MISMATCH:
            					$log->lwrite(" - Underflow or the modes mismatch");
        					break;
        					case JSON_ERROR_CTRL_CHAR:
            					$log->lwrite(" - Unexpected control character found");
        					break;
        					case JSON_ERROR_SYNTAX:
            					$log->lwrite(" - Syntax error, malformed JSON: ");
        					break;
        					case JSON_ERROR_UTF8:
            					$log->lwrite(" - Malformed UTF-8 characters, possibly incorrectly encoded");
        					break;
        					default:
            					$log->lwrite(" - Unknown error");
        					break;
				}
			}

			// Print the fields in the jSon message
			if ($debug>=3) {
				$msg = "";
				foreach ($data as $key => $value) {
					$msg .= " ".$key."->".$value.", ";
				}
				$log->lwrite("main:: Rcv json msg: <".$msg.">");
			}
			
			// Check if this is a trusted Internal IP connection. Every address inside our home network
			// is trusted. Trustlevel needs to be larger than 0 to pass.
			// If we receive a message and our trustlevel is too low, we will not continue until
			// the user first "repairs" that trust. As a result, the last command from the client
			// will probably be lost, as all communication is async ...
			//
			if ( $sock->s_trusted() <= 0 ) 
			{
				// Here is for when we do not trust the client
				// It could be however that the client just sent his login data, therefore
				// we check for these first
				//
				$log->lwrite("main:: external client ".$sock->clientIP." not trusted",3);
				
				// If user has aleady set local storage/cookie for this IP for the password, 
				// he/she will be done quickly
				//
				if ($data['action'] == "login" ){
					$log->lwrite("main:: received login request from ip ".$sock->clientIP.
							", action: ".$data['action'].", login: ".$data['login'].", password: ".$data['password'],2);
					if (User::pwcheck($data) > 0)
					{
							$akey = array_keys($sock->clients, $sock->ssock);
							$ckey = $akey[0];
							$sock->sockadmin[$ckey]['trusted'] = "1" ;
							$sock->sockadmin[$ckey]['login'] = $data['login'];
							$log->lwrite("main:: Password Correct, user: ".$sock->sockadmin[$ckey]['login']." @ IP: ".$sock->sockadmin[$ckey]['ip'],2);
							$i = $pos+1;
							if ($pos >= strlen($buf)) break;
							continue;
					}
					else
					{
						$log->lwrite("main:: Incorrect Password for user: ".$data['login']." IP: ".$sock->sockadmin[$ckey]['ip'],1);
						// So what are we going to do when we receive a wrong password
					}
				}
				
				// If we do NOT have a cookie, we need to use a login form 
				// cause only if we connect from remote, we'll need to login first
				// This is async, we only write the request, the answer will arrive in time
				// 
				$logmsg = array (
							'tcnt' => $tcnt."",
							'action' => 'login',
							'type' => 'raw',
							'address' => $sock->clientIP
				);
				if ( false === ($message = json_encode($logmsg)) ) {
					$log->lwrite("ERROR main:: json_encode failed: <".$logmsg['tcnt'].", ".$logmsg['action'].">");
				}
				$log->lwrite("Json encoded login: ".$message,2);
				// $answer = $sock->s_encode($message);
				if ( $sock->s_send($message) == -1) {
					$log->lwrite("ERROR main:: failed writing login message on socket");
				}
				$log->lwrite("main:: writing message on socket OK",2);
			}
			
			// Else we trust the client, ans will continue to serve gui messages
			else {
				$log->lwrite("main:: client is trusted: ".$sock->clientIP,2);
			
				// Compose ACK reply for the client that sent us this message.
				// At this moment we use the raw message format in message ...	
				$reply = array (
					'tcnt' => $tcnt."",
					'type' => 'raw',
					'action' => "ack",
					'message' => "OK"
				);
				if ( false === ($message = json_encode($reply)) ) {
					$log->lwrite("ERROR main:: json_encode reply: <".$reply['tcnt'].",".$reply['action'].">",1);
				} 
				// First check whether this is necessary. Some raw sockets are not websockets encoded
				$log->lwrite("main:: json reply : <".$message."> len: ".strlen($message),2);

				// Send the reply	
				if ( $sock->s_send($message) == -1) {
					$log->lwrite("ERROR main:: failed writing answer on socket");
				}
				// -----------
				// Take action on the message received based on the action field of the message
				//
				switch ($data['action']) 
				{
				case "alarm":
					// send reply with /message to the clients
					// contains: 
					// Device[]
					// message[] and 
					// scene[] with a ICS coded scene message
					$log->lwrite("main:: ALARM received, ".$data['scene'],0);
					message_parse('!FqP"'.$data['scene'].'"');			// parse and queue command
					
					$bcast = array (
						'secs'  => time(),					// Set execution time to now or asap
						'tcnt' => $tcnt."",					// Transaction count
						'action' => 'alarm',
						'message' => $data['message'],
						'type' => 'json',					// We want a json message & json encoded values.
						'scene' => $data['scene'],
						// These are the standard and required fields, we will add more fields to array
						// when there are more values read
					);
					if ( false === ($answer = json_encode($bcast)) ) {
								$log->lwrite("ERROR main:: broadcast encode: <".$bcast['tcnt']
									.",".$bcast['action'].">");
							}
					$sock->s_bcast($answer);				// broadcast this command back to connected clients
				break;
				
				case "ping":
					$log->lwrite("main:: PING received",2);
				break;
				
				case "gui":
					// GUI message, probably in ICS coding
					// For compatibility with raw message format, we just use ICS format
					// NOTE that we have full json support implemented in LamPI-x.y.js, but NOT tested
					message_parse($data['message']);
				break;
				
				case "dbase":
					// All commands that are sent to the daemon concerned with
					// updating the datebase configuration
					dbase_parse($data['cmd'],$data['message']);
				break;
				
				case "setting":
					// called by send2set
					setting_parse($data['cmd'],$data['message']);
				break;
				
				case "handset":
					// For compatibility with raw message format, we just use ICS format
					// to encode all content in a message field.
					message_parse($data['message']);
				break;
				
				case "weather":
					// Weather station/sensor message recognized.
					// Send something to the client GUI, and updated the database
					$item = array (
						'secs'  => time(),					// Set execution time to now or asap
						'tcnt' => $tcnt."",					// Transaction count
						'action' => 'weather',
						'brand' => $data['brand'],
						'type' => 'json',					// We want a json message & json encoded values.
						'address' => $data['address'],
						'channel' => $data['channel']
						// These are the standard and required fields, we will add more fields to array
						// when there are more values read
					);
					if (array_key_exists('temperature',$data))	$item['temperature']=$data['temperature'];
					if (array_key_exists('humidity',$data))		$item['humidity']=$data['humidity'];
					if (array_key_exists('airpressure',$data))	$item['airpressure']=$data['airpressure'];
					if (array_key_exists('windspeed',$data))	$item['windspeed']=$data['windspeed'];
					if (array_key_exists('winddirection',$data)) $item['winddirection']=$data['winddirection'];
					if (array_key_exists('rainfall',$data))		$item['rainfall']=$data['rainfall'];
					
					// If we push this message on the Queue with time==0, it will
					// be executed in phase 2
					$log->lwrite("main:: q_insert action: ".$item['action'].", temp: ".$item['temperature'],2);
					$queue->q_insert($item);
				break;

				case "energy":
				case "sensor":
					// Received a message from a sensor
					// Send something to the client GUI, and updated the database
					$item = array (
						'secs'    => time(),					// Set execution time to now or asap
						'tcnt'    => $tcnt."",					// Transaction count
						'type'    => 'json',					// We want a json message & json encoded values.
						'action'  => 'energy',
						'brand'   => $data['brand'],
						'address' => $data['address'],
						'channel' => $data['channel'],
						// The lines below make sure the indexes exist even if there are no values!
						// This is because energy records are always same size
						'kw_hi_use'  => "",
						'kw_lo_use'  => "",
						'kw_hi_ret'  => "",
						'kw_lo_ret'  => "",
						'gas_use'    => "",
						'kw_act_use' => "",
						'kw_act_ret' => "",
						'kw_ph1_use' => "",
						'kw_ph2_use' => "",
						'kw_ph3_use' => "",
						'kw_ph1_ret' => "",
						'kw_ph2_ret' => "",
						'kw_ph3_ret' => ""
					);
					if (array_key_exists('kw_hi_use',$data)) $item['kw_hi_use']=$data['kw_hi_use'];
					if (array_key_exists('kw_lo_use',$data)) $item['kw_lo_use']=$data['kw_lo_use'];
					if (array_key_exists('kw_hi_ret',$data)) $item['kw_hi_ret']=$data['kw_hi_ret'];
					if (array_key_exists('kw_lo_ret',$data)) $item['kw_lo_ret']=$data['kw_lo_ret'];
					
					if (array_key_exists('kw_act_use',$data)) $item['kw_act_use']=$data['kw_act_use'];
					if (array_key_exists('kw_act_ret',$data)) $item['kw_act_ret']=$data['kw_act_ret'];
					
					if (array_key_exists('kw_ph1_use',$data)) $item['kw_ph1_use']=$data['kw_ph1_use'];
					if (array_key_exists('kw_ph2_use',$data)) $item['kw_ph2_use']=$data['kw_ph2_use'];
					if (array_key_exists('kw_ph3_use',$data)) $item['kw_ph3_use']=$data['kw_ph3_use'];
					if (array_key_exists('kw_ph1_ret',$data)) $item['kw_ph1_ret']=$data['kw_ph1_ret'];
					if (array_key_exists('kw_ph2_ret',$data)) $item['kw_ph2_ret']=$data['kw_ph2_ret'];
					if (array_key_exists('kw_ph3_ret',$data)) $item['kw_ph3_ret']=$data['kw_ph3_ret'];
					
					if (array_key_exists('gas_use',$data)) $item['gas_use']=$data['gas_use'];
					
					// If we push this message on the Queue with time==0, it will
					// be executed in phase 2
					$log->lwrite("main:: q_insert action: ".$item['action'].", kw_act_use: ".$item['kw_act_use'],2);
					$queue->q_insert($item);
					$log->lwrite("main:: action: ".$item['action'],2);
				break;

				case "load_database":
					// Load the MySQL Database.
					//
					$log->lwrite("main:: action: ".$item['action'],1);
					
					// XXX Should we have to do this, or just assume that $config is already up to date
					// In which case we should always work with $config and nog with derivates such as $weather
					$config = load_database();					// load the complete configuration object
					if ($config == -1) 
					{
						$log->lwrite("main:: Error loading database, error: ".$apperr);
						$log->lwrite("main:: FATAL, exiting now\n");
						exit(1);
					}
					else 
						$log->lwrite("main:: Loaded the database, err: ".$apperr,1);
						
					$response = array (
							'tcnt'     => $tcnt."",
							'type'     => 'raw',
							'action'   => 'load_database',
							'request'  => $data['request'],
							'response' => $config
						);
					if ( false === ($message = json_encode($response)) ) {
						$log->lwrite("ERROR main:: json_encode failed: <"
									 .$response['tcnt'].", ".$response['action'].">");
					}
					$log->lwrite("Json encoded console: ".$response['response'],2);
					
					if ( $sock->s_send($message) == -1) {
						$log->lwrite("ERROR main:: failed writing login message on socket");
						continue;
					}
					$log->lwrite("main:: writing load_database message on socket OK",2);	
				break;
				
				// In case we receive pro-active messages for login
				case "login":
					// Received a message for login. As the server will initiate this request
					// and as we do the client is still untrusted, this will probably never happen.
					// Could be used to increase trustlevel from level 1 to level 2
					// 
					$log->lwrite("main:: login request: ".$data['login'].", password".$data['password'],1);
				break;
				
				// Client can send a number of supported "console" messages. Console messages are recognized
				// and return values sent back to the calling GUI client.
				// Supported messages are for logfile inspection, listing connected clients, reset saemon etc etc
				case "console":
					// Handling of LamPI operation. Fields:
					// action=="console", request=="clients","logs",
					$log->lwrite("main:: Received console message: ".$data['action'].", request: ".$data['request'],2);
					
					$list = console_message($data['request']);
					
					$response = array (
							'tcnt' => $tcnt."",
							'type' => 'raw',
							'action' => 'console',
							'request' => $data['request'],
							'response' => $list
					);
					if ( false === ($message = json_encode($response)) ) {
						$log->lwrite("ERROR main:: json_encode failed: <".$response['tcnt'].", ".$response['action'].">",0);
					}
					$log->lwrite("Json encoded console: ".$response['response'],2);
					
					if ( $sock->s_send($message) == -1) {
						$log->lwrite("ERROR main:: failed writing login message on socket",1);
						continue;
					}
					$log->lwrite("main:: writing console message on socket OK",2);
				break;

				default:
					$log->lwrite("ERROR main:: json data action: ".$data['action'].", type: <".$data['type']
									."> not found using raw message",0);
					$cmd = $data['message'];
				}
			}
			
			// Advance the index in current buffer (multiple messages may be possible in
			// one buffer) but also messgae might be split over several buffers...
			//
			$i = $pos+1;
			if ($pos >= strlen($buf)) {
				$log->lwrite("main:: No more messages in buffer, break",1);
				break;
			}
		}// while !end of encoded string read
		
		// test for empty message XXX strlen() only for strings. $data is an object? count()?
		if (strlen($data) == 0) 
		{
			$log->lwrite("main:: s_recv returned empty data object",3);
			break;
		}
		
		// NORMAL RAW SOCKET, no websocket but use json to encode the response
		// But json encode in ICS format
		//
		else 
		{
			$log->lwrite("ERROR main:: Rcv raw data cmd on rawsocket: <".$data.">",1);
			list ($tcnt, $cmd) = explode(',' , $data);
			// 
			// Messages start with a tcnt number, then a command, Then an argument all comma separated
			switch ($cmd) {
				case "PING":
					$log->lwrite("main:: PING received",2);
				break;
				
				default:
					$log->lwrite("main:: Unknown command received: ".$cmd,2);
					continue;
				break;
			}

			$reply = array (
				'tcnt' => $tcnt."",
				'action' => "ack",
				'type' => 'raw',
				'message' => "OK"
				);
			if ( false === ($answer = json_encode($reply)) ) {
				$log->lwrite("ERROR main:: json_encode failed: <".$reply['tcnt'].",".$reply['action'].">");
			}
		
			// Reply to the client with the transaction number just received
			if ( $sock->s_send($answer) == -1) {
				$log->lwrite("ERROR main:: failed writing reply on socket, tcnt: ".$tcnt,1);
			}
			$log->lwrite("main:: success writing reply on socket. tcnt: ".$tcnt,3);
		
			// Actually, although we might expect more messages we should also
			// be able to "glue" 2 buffers together if the incoming message is split by TCP/IP
			// message_parse parses the $cmd string and will push the commands
			// to the queue.
			$log->lwrite("main:: raw cmd to parse: ".$cmd,2);
			message_parse($cmd);
		}
	}// while not EOF s_recv


	// --------------------------------------------------------------------------------
	// 2. STAGE 2 RUN THE READY QUEUE OF COMMANDS
	//	If there is a queue of scene device commands, for example in a timer that have delayed execution,
	//	we need to keep track of those actions until all of them are started.
	// If none need starting, we can use the start-time of the next item in the QUEUE to calculate
	// the max waiting time for listening on the socket before waking-up...
	

	$tim = time();				// Get seconds since 1970. Timestamp. Makes sure that current time 
								// is at least as big as the time recorded for the queued items.
	
	if ($debug >= 3) {
		$log->lwrite("main:: printing and handling queue");
		$queue->q_print();
	}
	
	for ($j=0; $j<count($queue); $j++) {
		// Queue records contain scene name, timers (in secs) and commands (ready for kaku_cmd)
		// New records are put to the end of the queue, with timer being the secs to wait from initialization
		$log->lwrite("main:: Handling queue, timestamp : ".date('[d/M/Y:H:i:s]',$tim),2);
		
		$items = $queue->q_pop();
		
		// We now have an array of items (commands in the scene). However commands may be complex (all out)...
		// Also, the queue can store any kind of message, be it raw or a jsons array so we have
		// to find out what we have here
		
		for ($i=0; $i< count($items); $i++) 
		{
			// For every item ...
			// Do we have the latest list of devices??
			// run-a-command-to-get-the-latest-list-of-devices;;
			
			// What to do if the command is all off. We have to expand the command to include all
			// the devices currently in the room. Since all off might be a popular command in scene and timer
			// commands we need to ensure correct timing. Because if the daemon runs with old data
			// we might miss a switch off of a devices that were added later to the scene.
			
			// Make use of the feature that the condition in the loop is re-evaluated for every iteration. SO
			// "explode" the ALL-OFF command, and replace it with the individual device commands, en put them at
			// the back of the queue-list being executed
			switch($items[$i]['action'])
			{
				case "weather":
					$log->lwrite("main:: Recognized WEATHER Message",3);
					// Write the received values to the rrd database file, and update all fields.
					$sensor->rrdupdate($items[$i]);
					// Update the weather structure in the MySQL database
					$wthr->upd($items[$i]);
					// make broadcst
					$bcst = array (	
						// First part of the record specifies this message type and characteristics
						'tcnt' => "0",
						'action' => "weather",				// code for weather
						'type'   => "json",					// type either raw or json, we code content here too. 
						// Remainder of record specifies device parameters
						'brand'			=> $items[$i]['brand'],
						'address'		=> $items[$i]['address'],
						'channel'		=> $items[$i]['channel']
					);
					if (array_key_exists('temperature',$items[$i]))		$bcst['temperature']=$items[$i]['temperature'];
					if (array_key_exists('humidity',$items[$i]))		$bcst['humidity']=$items[$i]['humidity'];
					if (array_key_exists('airpressure',$items[$i]))		$bcst['airpressure']=$items[$i]['airpressure'];
					if (array_key_exists('windspeed',$items[$i]))		$bcst['windspeed']=$items[$i]['windspeed'];
					if (array_key_exists('winddirection',$items[$i]))	$bcst['winddirection']=$items[$i]['winddirection'];
					if (array_key_exists('rainfall',$items[$i]))		$bcst['rainfall']=$items[$i]['rainfall'];
					
					if ( false === ($answer = json_encode($bcst)) ) {
						$log->lwrite("main:: error weather broadcast encode: <".$bcst['tcnt']
									.",".$bcst['action'].">",1);
					}
					$sock->s_bcast($answer);
					//continue;
				break;
				
				case "energy":
					$log->lwrite("main:: Recognized ENERGY Message",3);
					// Update the energy structure in the rrd database
					// $wthr->upd($item);
					// Write the received values to the rrd database file, and update all fields.
					$sensor->rrdupdate($items[$i]);
					// We can  forward to the GUI for example
					// XXX At the moment we do NOT have a meaningful use for forwarding
					// XXX Later we can use GUI action for updating the dials
					$bcst = array (	
						// First part of the record specifies this message type and characteristics
						'tcnt' 			=> "0",
						'action' 		=> "energy",				// code for energy
						'type'   		=> "json",					// type either raw or json, we code content here too. 
						'address' 		=> $items[$i]['address'],
						'channel' 		=> $items[$i]['channel'],
						'brand'			=> $items[$i]['brand'],
						// Remainder of record specifies device parameters
						'kw_hi_use'		=> $items[$i]['kw_hi_use'],
						'kw_lo_use'		=> $items[$i]['kw_lo_use'],
						'kw_hi_ret'		=> $items[$i]['kw_hi_ret'],
						'kw_lo_ret'		=> $items[$i]['kw_lo_ret'],
						'kw_act_use'	=> $items[$i]['kw_act_use'],
						'kw_act_ret'	=> $items[$i]['kw_act_ret'],
						'kw_ph1_use'	=> $items[$i]['kw_ph1_use'],
						'kw_ph2_use'	=> $items[$i]['kw_ph2_use'],
						'kw_ph3_use'	=> $items[$i]['kw_ph3_use'],
						'kw_ph1_ret'	=> $items[$i]['kw_ph1_ret'],
						'kw_ph2_ret'	=> $items[$i]['kw_ph2_ret'],
						'kw_ph3_ret'	=> $items[$i]['kw_ph3_ret'],
						'gas_use'		=> $items[$i]['gas_use']
					);
					if ( false === ($answer = json_encode($bcst)) ) {
						$log->lwrite("main:: error energy broadcast encode: <".$bcst['tcnt']
									.",".$bcst['action'].">",1);
					}
					$log->lwrite("main:: broadcasting energy message: ".$answer,2);
					$sock->s_bcast($answer);
					//continue;
				break;
				
				case "gui":
					if ($debug>1) {
							$log->lwrite("main:: q_pop: ".$items[$i]['secs'].", scene: ".$items[$i]['scene']
							.", cmd: ".$items[$i]['cmd']);
					}
					$log->lwrite("main:: Recognized GUI message",2);
					$cmd = "";
					if (substr($items[$i]['cmd'],-2,2) == "Fa") {
						list( $room, $value ) = sscanf ($items[$i]['cmd'], "!R%dF%s" );
						for ($j=0; $j<count($devices);$j++) {
							
							if (($devices[$j]['room']==$room) && ($devices[$j]['type'] != "thermostat")) {
								$log->lwrite("ALL OFF queueing device: ".$devices[$j]['name'].", type: ".$devices[$j]['type'],1);
								// add to the items array 
								$item = array(
    							'scene' => $items[$i]['scene'],
								'action' => $items[$i]['action'],
    							'cmd'   => "!R".$room . $devices[$j]['unit']."F0",
								'secs'  => $items[$i]['secs']
   				 				);
								$items[] = $item;					// Add this item to end of array
								$log->lwrite("main: Queue: cmd: ".$item['cmd'],1);
							}
						}
						continue;									// End this iteration of the loop
					}
					// If not an ALL OFF command Fa, this is probably a normal device command
					// of form !RxDyFz or !RxDyFdPz (dimmer)
					else {
						$log->lwrite("main:: Action: time: ".$items[$i]['secs']
									.", scene: ".$items[$i]['scene'].", cmd: ".$items[$i]['cmd'],2);
						$cmd = $items[$i]['cmd'];
					}
					
					// If we have all devices, $devices contains list of devices
					// It is possible to look the device up through room and device combination!!
					list( $room, $dev, $value ) = sscanf ($items[$i]['cmd'], "!R%dD%dF%s\n" );
					$log->lwrite("main:: room: ".$room." ,device: ".$dev." value: ".$value,1);
					
					// Search the correct unit in the room. Thus dev is here the unit number
					$device = $dlist->get($room, $dev);

					// For which room, device is it, and what is the action?
					if (substr($value, 0, 2) == "dP" ) {
						$value = substr($value, 2);
						$device['val'] = $value;
						$device['lastval'] = $value;
						$sndval = $value;
					} 
					
					// Must be a switch turned on
					else if ($value == '1') { 						// in case F1
						if ($device['type'] == "switch") $device['val']='1';
						else $device['val']=$device['lastval'];
						$sndval = "on";
					} 
					
					// Must be a switch turned off
					else { 
						$device['val']= "0"; 						// F0
						$sndval="off";
					}
					
					$log->lwrite("sql device upd: ".$device['name'].", id: "
							.$device['id'].", unit: ".$device['unit'].", room: ".$device['room'].", val: ".$device['val'],1);
					$dlist->upd($device);							// Write new value to database
					
					$brand = $brands[$device['brand']]['fname'];	// if is index for array (so be careful)
					
					// Important: The database is FIRST updated and then we send bcast.

					
					// XXX It is difficult to determine whether we should keep this here or put it in a
					// separate function and call the bcast function from there.....
					// Initially I did not have many zwave devices, but as their number increases we
					// might want the LamPI-receiver process to take care of communications, asynchronously from the daemon.
					
					if ($brand == "zwave") {
						
						$zwcmd = array (
						'id'  => $dev."",					// GUI id used by LamPI front-end
						'action' => "set",					// code for remote command. upd tells we update a value
						'type'   => $device['type'],		// type either switch or dimmer.
						'confirm' => "1",					// for Z-Wave may be 1
						'gaddr'  => $device['gaddr'],
						'uaddr'  => $device['unit'],		// Unit	is physical ID on ZWave
						'brand'  => $brand,					// NOTE brand is a string, not an id here
						'val'    => $sndval					// Value is "on", "off", or a number (dimvalue) 1-32
						);
						// For zwave we use a different protocol. Sending to transmitter.c does not help, we
						// will then have all Raspberries react. We only need the dedicated Razberry device 
						// with Razberry to act on this command. (As defined in backend_cfg.php)
						// We use $bcast array as it is available already (and not the coded Json $answer)
						if (zwave_send($zwcmd) < 0) {	
							$log->lwrite("main:: zwave_send error: ".$items[$i]['action']);
							
							// Send something to the connected GUI clients
							$response = array (
							'tcnt' => $tcnt."",
							'type' => 'raw',
							'action' => 'alert',
							//'request' => $data['request'],
							'message' => "Z-Wave message failed for device: ".$zwcmd['uaddr']." set to: ".$zwcmd['val'].""
							);
							if ( false === ($answer = json_encode($response)) ) {
								$log->lwrite("ERROR main:: broadcast encode: <".$response['tcnt']
									.",".$response['action'].">");
							}
							$sock->s_bcast($answer);				// broadcast this command back to connected clients
						}
						else {
							$log->lwrite("main:: zwave_send command success: ".$items[$i]['action'],2);
							$bcst['confirm'] = "1";
						}
					}
					
					
					// Start building the broadcast message to be sent to the other connected GUI's and the LampI-transmitter
					//
					$bcst = array (							// build broadcast message
					// First part of the record specifies this message type and characteristics
						'id'  => $dev."",				// From the sscanf command above, cast to string
						'tcnt' => "0",
						'action' => "upd",					// code for remote command. upd tells we update a value
						'type'   => "raw",					// type either raw or json.
						'confirm' => "0",					// For 433MHz devices always 0, for Z-Wave may be 1
						// Remainder of record specifies device parameters
						'gaddr'  => $device['gaddr'],
						'uaddr'  => $device['unit'],		// Unit	Address is physical ID of device
						'brand'  => $brand,					// NOTE brand is a string, not an id here
						'val'    => $sndval,				// Value is "on", "off", or a number (dimvalue) 1-32
						'message' => $items[$i]['cmd']		// The GUI message, ICS-1000 encoded
					);
					
					if ( false === ($answer = json_encode($bcst)) ) {
						$log->lwrite("ERROR main:: broadcast encode: <".$bcst['tcnt']
									.",".$bcst['action'].">");
					}
					
					$sock->s_bcast($answer);				// broadcast this command back to connected clients
					// XXX We need to define a json message format that is easier on the client.
					
					// Actually, broadcasting to all clients could include
					// broadcasting to the LamPI-receiver process where we can read the command
					// and call the correct handler directly.
				break;
				
				// QQQ
				default:
					$log->lwrite("main:: NO DEFINED ACTION: ".$items[$i]['action']);
			}//switch	

		}//for i
		
	}//for j
	if ($debug >= 3) {
		$log->lwrite("main:: queue finished ");
		$queue->q_print();
	}
	
	
	// -----------------------------------------------------------------------
	// 3. STAGE 3, RUN TIMERS FROM MYSQL
	
	// Process timers scenes in MySQL and see whether they need activation... 
	// Other processing based on content of timers in MySQL?
	// This part only needs to run once every 60 seconds or so, since the timer resolution in in MINUTES!
	// What influences the timing are sensors of weather stations, but that is compensated for ..
	
	$log->lwrite("",2);
	$log->lwrite("main:: Entering the SQL Timers section on ".date('l jS \of F Y h:i:s A',time()),2);
	$timers = load_timers();					// This is a call to MSQL
	
	$tim = time();
	
	// mktime(hour,minute,second,month,day,year,is_dst) NOTE is_dst daylight saving time
	// For EVERY object in the timer array, look whether we should take action
	//
	for ($i=0; $i < count($timers); $i++)
	{
		$log->lwrite("Timer index: $i, id: ".$timers[$i]['id'].", name: ".$timers[$i]['name'],3);
		//
		list ( $start_hour, $start_minute) = sscanf($timers[$i]['tstart'], "%2d:%2d" );
		list ( $start_day, $start_month, $start_year ) = sscanf($timers[$i]['startd'], "%2d/%2d/%2d" );
		list ( $end_day, $end_month, $end_year ) = sscanf($timers[$i]['endd'], "%2d/%2d/%2d" );
		
		$start_second = "00";
		
		// The timing codes received for dusk/dawn are same as defined for the ICS-1000
		// Are the start times dawn (=twillight before sunrise) and dusk (=after Sunset)
		// The minutes are multiplied by 30 minutes to compute the actual start/stop time
		// Apeldoorn 52° 13' 0" N / 5° 58' 0" E
		
		if (    $start_hour == "96") 		// 96:: dawn - m * 30
			{ $secs_today = date_sunrise(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1)-($start_minute*30*60); }		
		else if($start_hour == "97") 		// 97:: dawn + m * 30 
			{ $secs_today = date_sunrise(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1)+($start_minute*30*60); }
		else if($start_hour == "98") 		// 98: dusk - m * 30
			{ $secs_today = date_sunset(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1)-($start_minute*30*60); }
		else if($start_hour == "99") 		// 99: dusk + m * 30
			{ $secs_today = date_sunset(time(), SUNFUNCS_RET_TIMESTAMP, 52.13, 5.58, 90+50/60, 1)+($start_minute*30*60); }
		else // No special time set, so we calculate a normal time
			{ $secs_today = mktime($start_hour,$start_minute,$start_second); }
		
		// Start action if time interval between now - timer < 0
		
		$secs_start = mktime($start_hour,$start_minute,$start_second,$start_month,$start_day,$start_year);
		$secs_stop  = mktime($start_hour,$start_minute,$start_second,$end_month,  $end_day,  $end_year);
		
		// First check whether time should run this month and on this weekday!
		// The is a string of 'days' and 'months' that contain either characters of the month or
		// an "x" for blackout of a certain day of month.
		// $time = @date('[d/M/Y:H:i:s]');
		$months = $timers[$i]['months'];
		$days   = $timers[$i]['days'];
		
		$log->lwrite ("DEBUG MONTH : ".$i." ".substr($months,@date('n')-1,1) , 3 );
		$log->lwrite ("DEBUG DAY :   ".$i." ".substr($days,  @date('N')-1,1) , 3 );
		
		// Look of we have to skip this execution because either month, day of week or
		// cancel once is active. If so, we write to log and do not further execute this timer
		
		if (substr($timers[$i]['months'],@date('n')-1,1) == "x" ) {
			$log->lwrite ("Main:: Timer: ".$timers[$i]['name'].", this month is blocked from timer execution",2);
		}
		else
		if ( substr($timers[$i]['days'],@date('N')-1,1) == "x" ) {
			$log->lwrite ("main:: Timer: ".$timers[$i]['name'].", Today is blocked from timer execution",2);
		}
		
		// If the stoptime has passed, we do not have to do anything.
		// Only if some long-lasting programs would still be running in the background on the queue(naah)
		else
		if ( $tim > $secs_stop ) {
			if ($time_last_run > $secs_stop) {
				$log->lwrite("Timer has possibly already stopped, so we should not proceed any further",2);
			}
			else {
				$log->lwrite ("TIMER STOPPED: ".$timers[$i]['name'],1);	// probably stopped last time
			}
		}
		
		// If current time passes the start time of today, know that the command MIGHT be running
		// The timer is still 'LIVE'
		else 
		if (($tim > $secs_start) && ($tim > $secs_today)) {
				
			if ($time_last_run > $secs_today ) {
				// We have already started at least one loop before
				$log->lwrite("Timer ". $timers[$i]['name']."  planned at: ".date('l jS \of F Y h:i:s A',$secs_today)." started already before ".date('l jS \of F Y h:i:s A',$time_last_run)."\n",3);
			}
			// Need to make sure ONLY when time > timer sttime
			// Need to push skip value back to database so next time we tun again !!!
			else if ( $timers[$i]['skip'] == "1" ) {
				$log->lwrite ("main:: Timer Cancel Once execution was active",1);
				$timers[$i]['skip'] = "0";
				store_timer($timers[$i]);
			}
			else {
				// make the command and queue it (in step 1)
				$log->lwrite("STARTING TIMER ".$timers[$i]['name'].", scene: ".$timers[$i]['scene']." at ".date('Y-m-d', $tim),1);
				$log->lwrite("STARTING TIMER   last_run: ".date('l jS \of F Y h:i:s A',$time_last_run).", tim: ".date('l jS \of F Y h:i:s A',$tim),2);
				$log->lwrite("STARTING TIMER secs_start: ".date('l jS \of F Y h:i:s A',$secs_start).", tim: ".date('l jS \of F Y h:i:s A',$tim),2);
				$log->lwrite("STARTING TIMER secs_today: ".date('l jS \of F Y h:i:s A',$secs_today).", tim: ".date('l jS \of F Y h:i:s A',$tim),2);
				
				$scene = load_scene($timers[$i]['scene']);
				if ($scene == -1) { 								// Command not found in database
					$log->lwrite("main:: Cannot find scene: ".$timers[$i]['scene']." in the database",1);
					break; 
				}
				$scene_name = $scene['name'];
				$scene_seq = $scene['seq'];
				if ($scene_seq == "") {
					$log->lwrite("-- Scene: ".$scene['name']." found, but sequence empty (must save first)",1);
					//break;
				}
				$log->lwrite("-- Scene found, reading sequence: ".$scene_seq);
				$splits = explode(',' , $scene_seq);
				for ($j=0; $j < count($splits); $j+=2) {
					$log->lwrite("cmd  : " . $j . "=>" . $splits[$j],2);
					$log->lwrite("timer: " . $j . "=>" . $splits[$j+1],2);
				
					list ( $hrs, $mins, $secs ) = explode(':' , $splits[$j+1]);
					$log->lwrite("Wait for $hrs hours, $mins minutes and $secs seconds",2);
				
					// sleep(($hrs*3600)+($mins*60)+$secs);
					// We cannot sleep in the background now, it will give a timeout!!
					// we'll have to implement something like a timer through cron or so
					$item = array(
    					'scene' => $scene_name,
						'action' => 'gui',
    					'cmd'   => $splits[$j],
						'secs'  => ($hrs*3600)+($mins*60)+$secs+ $tim
   				 	);
					$queue->q_insert($item);
					if ($debug>=2) $queue->q_print();
				}//for
			}//if
		}//if
		// $time_last_run = $tim; // XXX 
	}//for
	
	$time_last_run = $tim;									// Last time that we completely finished a timer run 
	
endwhile;// ========= END OF LOOP ==========
 
// close log file
$log->lclose();
?>
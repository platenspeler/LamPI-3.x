<?php 
//define('__ROOT__', dirname(dirname(__FILE__)));
require_once(dirname(__FILE__) .'/../../config/backend_cfg.php'); 
require_once(dirname(__FILE__) .'/../frontend_lib.php' );

// LamPI, Javascript/jQuery GUI for controlling 434MHz devices (e.g. klikaanklikuit, action, alecto)
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg, all rights reserved
//
// Contributions:
//
// Version 1.6, Nov 10, 2013. Implemented connections, started with websockets option next (!) to .ajax calls.
// Version 1.7, Dec 10, 2013. Work on the mobile version of the program
// Version 1.8, Jan 18, 2014. Start support for (weather) sensors
// Version 1.9, Mar 10, 2014, Support for wired sensors and logging, and internet access ...
// Version 2.0, Jun 15, 2014, Initial support for Z-Wave devices through Razberry slave device.
// Version 2.1, Jul 31, 2014, Weather support
//
// This is the code to animate the front-end of the application. The main screen is divided in 3 regions:
//
// Copyright, Use terms, Distribution etc.
// =========================================================================================
//  This software is licensed under GNU Public license as detailed in the root directory
//  of this distribution and on http://www.gnu.org/licenses/gpl.txt
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
//
$log = new Logging();
$logfile='/home/pi/log/EnerPI.log';
$log->lfile($logfile);
$log->lwrite("Starting energy.php script. __ROOT__ is ".__ROOT__);

$apperr = "";				// Global Error. Just append something and it will be sent back
$appmsg = "";				// Application Message (returned from backend to Client)
$graphAction = "";			// Must be "graph" only initially
$graphType = "";			// T emperature, H umidity, P airPressure
$graphPeriod = "";			// 1d 1w 1m 1y
$graphSensors = array();	// List of sensor values we like to graph


// ----------------------------------------------------------------------------
// MAKE GRAPH
// Ajax function for generating a graph .png file
// Type: 
// Period: 1d 1w 1m 1y
// Sensors: nvt
function make_energy_graph ($type, $period, $sensors)
{
	global $log, $logfile, $appmsg, $apperr, $ret;
	$rrd_dir='/home/pi/rrd/db/';			// Database directory
	$rrd_db='e350.rrd';						// Database filename
	$output='/home/pi/www/graphs/';			// Directory to output the graph
	$DEFpart='';
	$LINEpart='';
	$GPRINTpart='';
	$valUnit='';
	$valStack='';
	$width='750';							// width of graph
	$height='400';
	$eol='';								// Either empty or cntains code for CR LF
	$sensorType='';							// "T" emperature, "H" umidity, air "P" ressure
	$graphName='';
	$graphColor = array(					// Predefined array of line colors
			0 => "ff0000",
			1 => "111111",
			2 => "00ff00",
			3 => "0000ff",
			4 => "ff00ff",
			5 => "666666",
			6 => "00ffff",
			7 => "ff3399",
			8 => "ffff00"
		);				

	$log->lwrite("make_energy_graph:: Starting .. type: ".$type.", period: ".$period);

	// Check on permissions for "graphs" directory. owner=pi, group=www-data, mode: 664
	// Start with teh setting of the right group for the directory
	//
	$grp = posix_getgrgid(filegroup($output));
	if ($grp['name'] != "www-data") 
	{
		$log->lwrite("graphs.php:: make_energy_graph ERROR, group of dir ".$output." not www-data but ".$grp['name'].", gid: ".filegroup($output));
		$apperr="graphs.php:: make_energy_graph ERROR, group of ".$output." not www-data";
		$log->lwrite("make_energy_graphs: Trying to set group rights for dir ".$output." only when pi is owner of the dir");
		// Try to set the gid to the gid of the calling process (www-data);
		$ownr = posix_getpwuid(fileowner($output));
		$i = 'make_energy_graphs: Cannot set group of '.$output.' to www-data. Please do "sudo chgrp www-data '.$output.'" from the commandline';
		if ($ownr['name']=="pi") {
			$log->lwrite("make_energy_graphs: Try setting the group of ".$output." to ".posix_getgid() );
			if (!chgrp ($output, posix_getgid() )) {
				$log->lwrite($i);
				$apperr=$i;
				$ret = -1;
				return (false);
			}
		}
		else {
			$log->lwrite($i);
			$apperr=$i;
			$ret = -1;
			return (false);
		}
	}
	// Are the right permissions set? Remember thsi is ONLY of immediate importance if there is not
	// yet a writable output file present. If there is, we can use that file.
	//
	$perms = fileperms($output);
	if (!($perms & 0x0010)) {
		$log->lwrite("graphs.php:: make_energy_graph ERROR, directory ".$output." not writable for group www-data");
		$apperr="graphs.php:: make_energy_graph ERROR, directory ".$output." not writable for group www-data, trying to fix";
		// If owner is pi, then we can try to set the permissions. But we probably are not pi!!!
		$i = 'Cannot set the permissions of directory, please do a "sudo chmod 775 '.$output.'" from the commandline';
		$ownr = posix_getpwuid(fileowner($output));
		if ($ownr['name']=="pi") {
			$log->lwrite("make_energy_graphs: Try setting the mode of ".$output." to 775" );
			// We do nto return an unsuccessful value as we do not know
			if (! chmod ($output, 0775 )) {
				$log->lwrite($i);
				$apperr=$i;
				$ret=-1;
				return(false);
			}
		}
		else {
			$log->lwrite($i);
			$apperr=$i;
			$ret = -1;
			return (false);
		}
	}
	// Check whether rrdtool exists
	
	// Check which type of sensor we want to display and set the commands accordingly
	//
	switch($type) {
		// Gas usage
		case 'E_GAS':
			$sensorType="gas use";
			$graphName="gas_use";
			$valUnit="m3";
		break;
		case 'E_ACT':
			$sensorType="pwr act";
			$graphName="pwr_act";
			$valUnit="kWhr";
		break;
		case 'E_USE':
			$sensorType="pwr use";
			$graphName="pwr_use";
			$valUnit="kWhr";
		break;
		case 'E_PHA':
			$sensorType="phase use";
			$graphName="pwr_pha";
			$valUnit="kWhr";
		break;
		default:
			$log->lwrite("make_energy_graph:: Unknown graph type",1);
	}
	
	switch($period) {
		case '1h':
			$pstep='';
		break;
		case '1d':
			$pstep='';
		break;
		case '1w':
			$log->lwrite("make_energy_graph:: Using override step for 1w period ",1);
			$pstep=':step=3600';						// Step is one hour
			//$pstep=':step=8640';
		break;
		case '1m':
			$log->lwrite("make_energy_graph:: Using override step for 1m period ",1);
			$pstep=':step=8640';						// Step is 3 hours
			//$pstep=':step=8640';
		break;
		case '1y':
			$pstep=':step=21300';
		break;
		default:
			$pstep='';
			$log->lwrite("make_energy_graph:: Unknown period definition ".$period,1);
	}
	
	// Make all definitions for the sensors, each sensor has its own DEF line
	// and its own LINE part 
	$log->lwrite("make_energy_graph:: There are ".count($sensors)." sensors in sensors var",2);
	for ($i=0; $i< count($sensors); $i++) {
		if (($i + 1) == count($sensors) ) {
			$eol='\n';
			$log->lwrite("Setting newline for index ".$i,2);
		} 
		else {
			$eol="";
		}
		// if (($i>0) && ($type == 'E_PHA')) $valStack=":STACK";	// Optional Stacking of graphs
		// Define which sensors to graph
		$DEFpart .= 'DEF:t'.($i+1).'='.$rrd_dir.$rrd_db.':'.$sensors[$i].':AVERAGE'.$pstep.' ';
		// Update graph color based on colors in $graphColor array ($i modulus sizeof array)
		$LINEpart .= 'LINE2:t'.($i+1).'#'.$graphColor[$i % count($graphColor)].':"'.$sensors[$i].$eol.$valStack.'" ';
		// this line is sensitive to correct syntax, especially the last part
		$GPRINTpart .= 'GPRINT:t'.($i+1).':LAST:"'.$sensors[$i].'\: %1.0lf '.$valUnit.$eol.'" ';
	}
	
	// Build the exec string, this where the actual command is built
	//
	$exec_str = '/usr/bin/rrdtool graph '.$output.$graphName.'_'.$period.'.png' ;
	$exec_str .= ' -s N-'.$period.' -a PNG -E --title="'.$sensorType.' readings" ';
	$exec_str .= '--vertical-label "'.$sensorType.'" --width '.$width.' --height '.$height.' ';
	$exec_str .= $DEFpart ;
	$exec_str .= $LINEpart ;
	$exec_str .= $GPRINTpart ;
	
	$log->lwrite($exec_str);
	$log->lwrite("Output of execution below");
	
	// The shell is executed and its output is directed to our logfile
	if (shell_exec($exec_str . " >> ".$logfile." 2>&1 && echo ' '")  === NULL ) {
			$log->lwrite("make_energy_graph:: ERROR executing rrdtool");
			$apperr .= "\nERROR: generate_graphs ".$graphsPeriod."\n ";
			$ret = -1;
			return(false);
	}
	
	$log->lwrite("Command rrdtool executed");
	$ret = 1;
	return(true);
}


/*	-------------------------------------------------------
*	function post_parse()
*	
*	-------------------------------------------------------	*/
function post_parse()
{
	global $log, $appmsg, $apperr;
	global $graphAction, $graphType, $graphPeriod, $graphSensors;	
	if (empty($_POST)) { 
		decho("call function post_parse without argument",1);
		return(false);
	}
	foreach ( $_POST as $ind => $val ) {
		
		switch ( $ind )
		{
			case "action":
				$log->lwrite("post_parse:: ind: ".$ind.", val: ".$val."",2);
				$graphAction = $val;			// switch val
			break;
			case "gtype":
				$graphType = $val;
			break;
			case "gperiod":
				$graphPeriod = $val;
			break;
			case "gsensors":
				$graphSensors = $val;
			break;
		} // switch $ind
	} // for
	$log->lwrite("post_parse:: completed OK",1);
	return(true);
} // function

// -------------------------------------------------------------------------------------------
// For debuggging on the commandsline this is an alternative function for GET processing
// Make sure to NOT use this in production
//
function get_parse()
{
	global $log, $appmsg, $apperr;
	global $graphAction, $graphType, $graphPeriod, $graphSensors;	
	if (empty($_GET)) { 
		$log->lwrite("get_parse:: call function without arguments",1);
		return(false);
	}
	foreach ( $_GET as $ind => $val ) {
		$log->lwrite("get_parse:: ind: ".$ind.", val: ".$val);
		switch ( $ind )
		{
			case "action":
				$graphAction =$val;			// switch val
			break;
			case "gtype":
				$graphType = $val;
			break;
			case "gperiod":
				$graphPeriod = $val;
			break;
			case "gsensors":
				$graphSensors = $val;
			break;
		} // switch $ind
	} // for
	return(true);
} // function



/*	=================================================================================	
										MAIN PROGRAM
	=================================================================================	*/

$ret = -1;



// Parse the URL sent by client
// post_parse will parse the commands that are sent by the java app on the client
// $_POST is used for data that should not be sniffed from URL line, and
// for changes sent to the devices

$log->lwrite("Starting Log record EnerPI");

if (($ret = get_parse()) === false) {
	$log->lwrite("No _GET message was found");
	$ret = post_parse();
}
$log->lwrite("Starting Main Program, graphAction: ".$graphAction);

// Do Processing
switch($graphAction)
{
	// We generate a "STANDARD" temperature graph. Obsolete for most applications. 
	// XXX Can be called as a standalone program by external script.
	
	// In case the user defines his own graph
	case "sensor":
	case "weather":
		$log->lwrite("Starting weather specific graphs, type: ".$graphType.", period: ".$graphPeriod);
		if (! make_energy_graph ($graphType,$graphPeriod,$graphSensors) ) {
			$appmsg .="user error. ";
		}
		else {
			$appmsg .="Success generate_graphs\n";
			$ret = 1;
		}
	break;
	
	// In case the user defines his own energy graph
	case "energy":
		$log->lwrite("Starting energy specific graphs, type: ".$graphType.", period: ".$graphPeriod);
		if (! make_energy_graph ($graphType,$graphPeriod,$graphSensors) ) {
			$appmsg .="user error. ";
		}
		else {
			$appmsg .="Success generate_graphs\n";
			$ret = 1;
		}
	break;
	
	default:
		$appmsg .= ", action: ".$graphAction;
		$apperr .= ", graph: ".$graphAction.", command not recognized\n";
		$ret = -1; 
}

// Test the return values for the several commands
//
if ($ret >= 0) 
{
	$send = array(
		'tcnt' => $ret,
		'status' => 'OK',
		'result'=> $appmsg,
		'error'=> $apperr
    );
	$output=json_encode($send);
}
else
{	
	$send = array(
    	'tcnt' => $ret,
    	'status' => 'ERR',
		'result'=> $appmsg,
		'error'=> $apperr
    );
	$output=json_encode($send);
}
$log->lwrite("Closing Log\n");
$log->lclose();
echo $output;
flush();

?>
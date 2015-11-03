// TemPI, Javascript/jQuery GUI for graphing temperature, humidit and other sensors
// TemPI is part of the LamPI project, a system for controlling 434MHz devices (e.g. klikaanklikuit, action, alecto)
//
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg, all rights reserved
//
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
// Dcumentation: http://platenspeler.github.io
//
// Function init, Initialises variables as far as needed
// NOTE:: Variables can be changed in the index.html file before calling start_TemPI
//
// DIV class="class_name"  corresponds to .class_name in CSS
// DIV id="id_name" corresponds to #id_name above
//

// ----------------------------------------------------------------------------
// SETTINGS!!!
// XXX: For adaptation to jqmobile changed all pathnames of backend to absolute URL's
// XXX We started the codebase with a copy of LamPIxxxxx.js and still have to cleanup
//
var fake=0;												// Set to 1 if we fake communication 
var tcnt=0;
//
// WebSocket definitions
//
var w_url = location.host; 								// URL of webserver
var w_port = '5000'; 									// port
var w_uri;
var w_sock;												// Socket variable
var w_tcnt = 0;											// Transaction counter

// ----------------------------------------------------------------------------
// Mobile settings, used for Android or other jQueryMobile device
// The three settings below determine what GUI libraries to use
// and how to communicate with the daemon.
//
var phonegap=0;											// Phonegap setting, init to no phonegap
var jqmobile=0;											// This specifies what jQuery library file be used
var dynamicIP=1;										// Use a static IP for daemon or a dynamicIP (standard)
var murl='/';											// For Phonegap and Ajax usage, build a url. DO NOT CHANGE!
var healthcount = 5;									// Needs to be above 0 to show activity

// ----------------------------------------------------------------------------
// 
//
var skin = "";
var debug = "1";										// debug level. Higher values >0 means more debug
var cntrl = "1";										// ICS-1000== 0 and Raspberry == 1

// ----------------------------------------------------------------------------
// s_STATE variables. They keep track of current room, scene and setting
// The s_screen variable is very important for interpreting the received messages
// of the server. 
// State changes of device values need be forwarded to the active screen
// IF the variable is diaplayed on the screen
//
var s_sensor_id = 0;									// bmp085-1 or other idents
var graphType = "T";									// temperature, humidity, airpressure
var graphPeriod = "1d";
var graphSensors = {}; 
	graphSensors['T'] = [ 'cv-warm', 'cv-cold' ];		// Inital displayed sensor values

var sensors = {};
var energy = {};

var s_screen = 'room';									// Active screen: 1=room, 2=scene, 3=timer, 4=config
var s_room_id =1;										// Screen room_id
var s_scene_id =1;
var s_timer_id = 1;
var s_handset_id = 1;
var s_setting_id = 0;
var s_recorder = '';									// recording of all user actions in a scene. 
var s_recording = 0;									// Set to 1 to record lamp commands
var s_sensor_id = 0;

// -----------------------------------------------------------------------------
// Set limits for the program for using resources
//
var max_rooms = 16;										// Max nr of rooms. ICS-1000 has 8
var max_scenes = 16;									// max nr of scenes. ICS-1000 has 20
var max_devices = 16;									// max nr. of devices per room. ICS-1000 has 6
var max_timers = 16;
var max_handsets = 8;

// --------------------------------------------------------------------------
// Prototype function to keep arrays and clear them
//
Array.prototype.clear = function() {
  while (this.length > 0) {
    this.pop();
  }
};

// --------------------------------------------------------------------------
// MAIN FUNCTION called from extern.
//
function start_TEMPI()
{
  // This function first needs to be executed						
  // --------------------------------------------------------------------------
  $(window).load(function(){

	// --------------------------------------------------------------------------
	// HEADER SENSOR SELECTION
	// Handle the rrd header selection buttons above the graph
	//
	$("#gui_header").on("click", ".hs_button", function(e){
		e.preventDefault();
//		e.stopPropagation();
		selected = $(this);
			
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			
		if ( $(this).hasClass("hover")) {
			message("Unselecting "+value);
			$( this ).removeClass( 'hover' );
		}
		else {
			message("Selecting "+value);
			$( this ).addClass ( 'hover' );
		}
		//alert("Id: "+id+", Value: "+value+", Class: "+$( this ).attr( "class" ));
			
		// Make the list of current sensors active (Hover) 
		var sensor_type='';
		switch(graphType) {
			case "T":
				sensor_type = 'T';
			break;
			case "H":
				sensor_type = 'H';				// Humidity
			break;
			case "P":
				sensor_type = 'P';
			break;
			case "B":
				sensor_type = 'B';				// Battery Sensor
			break;
			case "L":
				sensor_type = 'L';				// Luminescense
			break;
			default:
		}
		var sensornames=[];
		$( "#gui_header .hs_button" ).each(function( index ) {
  				console.log( index + ": " + $( this ).val() );
				if ( $( this ).hasClass("hover")){
					var sensorname = $( this ).val();
					sensornames.push( sensorname );
				}
		});
		graphSensors[sensor_type] = sensornames;
		console.log("sensor button:: sensornames newly defined: "+graphSensors[sensor_type]);

		make_graphs("sensors",graphType,graphPeriod,graphSensors[sensor_type]);
	});
						  
						  
						  
	// --------------------------------------------------------------------------
	// HEADER TIME PERIOD SELECTION
	// Handle the rrd header selection buttons above the graph
	//
	$("#gui_header").on("click", ".hp_button", function(e){
		e.preventDefault();
//		e.stopPropagation();
		selected = $(this);
			
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		$( '.hp_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );

		switch (id )
		{
			case "P1":	
				graphPeriod="1d";
			break;
			case "P2":
				graphPeriod="1w";
			break;
			case "P3":
				graphPeriod="1m";
			break;
			case "P4":	
				graphPeriod="1y";	
			break;
			default:
				alert("Header Button: Unknown button "+id);
				return(0);
		}
		// First display asap the latest known version of the graph
		display_graph (graphType, graphPeriod);
		// Then make a new one, and display as soon as ready
		make_graphs("sensors", graphType, graphPeriod, graphSensors[graphType]);
		return(1);
	});	
	
	// --------------------------------------------------------------------------
	// MENU BUTTONS HANDLING
	// Handle clicks in the menu area with DIV hm_button
	//
	$("#gui_menu").on("click", ".hm_button", function(e){
		e.preventDefault();
//		e.stopPropagation();
		selected = $(this);
		but = "";
		
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		$( '.hm_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		
		switch(id)
		{
			case "T1":						// TEMPERATURE
					graphType="T";				
			break;	
			case "T2":						// HUMIDITY
					graphType="H";
			break;
			case "T3":						// AIR PRESSURE
					graphType="P";
			break;
			case "T4":						// WIND SPEED
					//graphType="S";
					logger("Windspeed not yet implemented",1);
					return;
			break;
			case "T7":						// Luminescense
					graphType="L";
			break;
			case "T8":						// Battery
					graphType="B";
			break;
			case "T5":
				init_settings();
			break;
			case "T6":
				console.log("menu_buttons:: Closing current window");
				window.history.back();
				close();
			break;
			default:
				message('menu_buttons:: id: ' + id + ' not a valid menu option');
				return(0);
		}
		// First display the last known version of the graph
		display_graph(graphType, graphPeriod);
		init_sensors(graphType);
		// and make a new version in the background
		make_graphs("sensors", graphType, graphPeriod, graphSensors[graphType]);
	}); 
	
	// Start the logic of this page	
	if ( jqmobile == 1 ) 
	{

	}
	//
	// The solution is to start init_lamps, init_rooms and init_menu 
	// in the result function of the AJAX call in load_database
	// Upon success, we know that we have read the whole database, and have all buttons etc.
	// without the database being present, nothing will be displayed
	//
	else {
		if (typeof(Storage) !== "undefined") {
			logger("Loading user and database settings from localStorage",1);
			var uname= localStorage.getItem("uname");		// username
			var pword= localStorage.getItem("pword");		// pin
			var saddr= localStorage.getItem("saddr");		// Server address

			rooms	= localStorage.getObject('rooms'); 		// logger("rooms[0]: "+rooms[0]['name'],1);
			devices	= localStorage.getObject('devices');
			scenes	= localStorage.getObject('scenes');
			timers	= localStorage.getObject('timers');
			handsets= localStorage.getObject('handsets');
			brands	= localStorage.getObject('brands');
			sensors	= localStorage.getObject('sensors');
			//users   = localStorage.getObject('users');
			settings= localStorage.getObject('settings');	// Needs to be defined to call init()
		}
	}
	init_websockets();									// For regular web based operations we start websockets here
	var ret = load_database("init");
	if (ret<0) {
		alert("Error:: loading database failed");
	}
	
  });
  console.log("Start TEMPI done");
}



// -------------------------------------------------------------------------------------
// FUNCTION INIT
// This function is the first function called when the database is loaded
// It will setupt the menu area and load the first room by default, and mark 
// the button of that room
// See function above, we will call from load_database !!!
//
function init() {
	debug = settings[0]['val'];
	cntrl = settings[1]['val'];
	
	if (jqmobile != 1) { 
		skin = settings[4]['sett']['styles']['val'];
	}
	else {
		skin = settings[4]['sett']['mobile']['val'];
	}
	$("link[href^='/styles']").attr("href", skin);		// /styles only if the html file uses /styles too
	logger("init:: debug: "+debug+", skin: "+skin, 1);
	
	graphType = "T";									// temperature, humidity, airpressure
	graphPeriod = "1d"									// Init to 1 day
	
	// Setup the two rows in the header area
	html_msg = '<div id="gui_sensors"></div><div id="gui_periods"></div>';
	$("#gui_header").append( html_msg );
	
	// Initial startup config
	init_menu(graphType);
	init_periods(graphPeriod);
	init_sensors(graphType);
	init_graph(graphType, graphPeriod);
	make_graphs("sensors", graphType, graphPeriod, graphSensors[graphType]);
}

// -------------------------------------------------------------------------------------
//
function init_graph(type, period) {

	var but="";
	if (debug >= 2) console.log("init graph:: type: "+type+", period: "+period+".");
	$("#gui_content").empty();
	switch (type) {
		case "T":
			but += '<div><img id="graph" src="all_temp_'+period+'.png" width="750" height="400"></div>';
		break;
		case "H":
			but += '<div><img id="graph" src="all_humi_'+period+'.png" width="750" height="400"></div>';
		break;
		case "P":
			but += '<div><img id="graph" src="all_press_'+period+'.png" width="750" height="400"></div>';
		break;
		case "L":
			but += '<div><img id="graph" src="all_lumi_'+period+'.png" width="750" height="400"></div>';
		break;
		case "B":
			but += '<div><img id="graph" src="all_battery_'+period+'.png" width="750" height="400"></div>';
		break;
		case "S":
			alert("Error Windspeed sensor not yet implemented");
			return(0);
		default:
			console.log("display_graph:: Unknown graph type: "+type);
			return(0);
		break;
	}
	$("#gui_content").append(but);
	console.log("init graph:: graph done for but: "+but);
	return(1);
}


// ------------------------------------------------------------------------------------------
// Setup the main menu (on the right) event handling
//

function init_menu(type) 
{
	html_msg = '<table border="0">';
	$( "#gui_menu" ).empty();
	$( "#gui_menu" ).append( html_msg );
	var table = $( "#gui_menu" ).children();		// to add to the table tree in DOM
	console.log("init_menu started");
	
	// For all menu buttons, write all to a string and print string in 1 time
	if (jqmobile == 1) {
		var but =  ''
		+ '<tr><td>'
		+ '<input type="submit" id="T1" value= "Temperature" class="hm_button hover">' 
		+ '<input type="submit" id="T2" value= "Humidity" class="hm_button">'
		+ '<input type="submit" id="T3" value= "Airpress" class="hm_button">'
		+ '<input type="submit" id="T4" value= "Windspeed" class="hm_button">'
		+ '<input type="submit" id="T7" value= "Luminescense" class="hm_button">'
		+ '<input type="submit" id="T8" value= "Battery" class="hm_button">'
		+ '<input type="submit" id="T5" value= "Settings" class="hm_button">'
		+ '</td></tr>'
		;
		$(table).append(but);
	}
	else {
		var but =  ''	
		+ '<tr class="switch"><td><input type="submit" id="T1" value= "Temperature" class="hm_button hover"></td>' 
		+ '<tr class="switch"><td><input type="submit" id="T2" value= "Humidity" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T3" value= "Airpressure" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T4" value= "Windspeed" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T7" value= "Luminescense" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T8" value= "Battery" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T5" value= "Settings" class="hm_button"></td>'
		;

		// Do we have energy records in database.cfg?
		but += '<tr><td></td>'
		+ '<tr><td></td>'
		+ '<tr class="switch"><td><input type="submit" id="T6" value= "Go Back" class="hm_button"></td>'
		;
		$(table).append(but);
	}
	if (debug >= 2) console.log("init_menu buttons defined");
}


// -------------------------------------------------------------------------------------
// INIT SENSORS
// Make sure that every temperature, humidity, pressure etc sensor has its own
// button on the header section. So that user can pick and choose the sensor he/she 
// likes to graph
//
function init_sensors(type)
{
	$("#gui_sensors").empty( );
	html_msg = '<table border="0">';
	$("#gui_sensors").append( html_msg );
	
	var table = $("#gui_sensors").children().last();		// to add to the table tree in DOM
	var hover = "hover";
	if (debug >= 2) console.log("init_sensors started");
	
	but = "<tr><td>";
	for (var i=0; i< sensors.length; i++) {
		switch (type) {
			case "T":
				if ((type=="T") && ('temperature' in sensors[i]['sensor']) ) {
					// alert("init_sensors:: found: "+sensors[i]['name']);
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(sensors[i]['name'],graphSensors['T']) != -1) {
						logger("init_sensors:: selected: "+sensors[i]['name']+" in graphSensors",2);
						hover="hover";
					} else {
						logger("init_sensors:: NOT selected: "+sensors[i]['name']+" in graphSensors", 2);
						hover = "";
					}
					but += '<input type="submit" id="T'+i+'" value= "'+sensors[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			case "H":
				if ((type=="H") && ('humidity' in sensors[i]['sensor']) ) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(sensors[i]['name'],graphSensors['H']) != -1) {
						console.log("init_sensors:: Found: "+sensors[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+sensors[i]['name']+" in graphSensors");
						hover = "";
					}
					// alert("init_sensors:: found: "+sensors[i]['name']);
					but += '<input type="submit" id="H'+i+'" value= "'+sensors[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">'; 
				}
			break;
			case "P":
				if ((type=="P") && ('airpressure' in sensors[i]['sensor']) ) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(sensors[i]['name'],graphSensors['P']) != -1) {
						console.log("init_sensors:: Found: "+sensors[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+sensors[i]['name']+" in graphSensors");
						hover = "";
					}
					// alert("init_sensors:: found: "+sensors[i]['name']);
					but += '<input type="submit" id="P'+i+'" value= "'+sensors[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			case "L":
				if ((type=="L") && ('luminescense' in sensors[i]['sensor']) ) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(sensors[i]['name'],graphSensors['L']) != -1) {
						console.log("init_sensors:: Found: "+sensors[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+sensors[i]['name']+" in graphSensors");
						hover = "";
					}
					// alert("init_sensors:: found: "+sensors[i]['name']);
					but += '<input type="submit" id="L'+i+'" value= "'+sensors[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			case "B":
				if ((type=="B") && ('battery' in sensors[i]['sensor']) ) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(sensors[i]['name'],graphSensors['B']) != -1) {
						console.log("init_sensors:: Found: "+sensors[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+sensors[i]['name']+" in graphSensors");
						hover = "";
					}
					// alert("init_sensors:: found: "+sensors[i]['name']);
					but += '<input type="submit" id="B'+i+'" value= "'+sensors[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			default:
				alert("Sensor Type "+type+" not yet supported");
		}
	}
	but += "</td></tr>";
	$(table).append(but);
}


// -------------------------------------------------------------------------------------
//
// Functions below to initialise menu choices for sensor graphs
//
function init_periods(period)
{
	if (debug >= 2) console.log("init periods");

	html_msg = '<table border="0">';
	$( "#gui_periods" ).append( html_msg );
	var table = $( "#gui_periods" ).children();		// to add to the table tree in DOM
	
	if (jqmobile == 1) {
		var but =  ''
		+ '<tr><td>'
		+ '<input type="submit" id="P1" value= "Day" style="max-width:50px;" class="hp_button hover">' 
		+ '<input type="submit" id="P2" value= "Week" style="max-width:50px;" class="hp_button">'
		+ '<input type="submit" id="P3" value= "Month" style="max-width:50px;" class="hp_button">'
		+ '<input type="submit" id="P4" value= "Year" style="max-width:50px;" class="hp_button">'
		+ '</td></tr>'
		;
		$(table).append(but);
	}
	else {
		var but =  '<tr class="switch"><td>'	
		+ '<input type="submit" id="P1" value= "Day" style="max-width:50px; max-height:30px;" class="hp_button hover">' 
		+ '<input type="submit" id="P2" value= "Week" style="max-width:50px; max-height:30px;" class="hp_button">'
		+ '<input type="submit" id="P3" value= "Month" style="max-width:50px; max-height:30px;" class="hp_button">'
		+ '<input type="submit" id="P4" value= "Year" style="max-width:50px; max-height:30px;" class="hp_button">'
		+ '</td>'
		;
		$(table).append(but);
	}
	return(1);
}



// -------------------------------------------------------------------------------------
//
function display_graph(type, period) {
	console.log("display graph:: type: "+type+", period: "+period+".");
	var but="";
	var image;
	//$("#gui_content").empty();
	switch (type) {
		case "T":
			document.getElementById("graph").src='all_temp_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "H":
			document.getElementById("graph").src='all_humi_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "P":
			document.getElementById("graph").src='all_press_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "S":
			alert("Error Windspeed sensor not yet implemented");
			return(0);
		break;
		case "L":
			document.getElementById("graph").src='all_lumi_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "B":
			document.getElementById("graph").src='all_battery_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		default:
			console.log("display_graph:: Unknown graph type: "+type);
			return(0);
		break;
	}
	//$("#gui_content").append(but);
	console.log("display graph:: graph done");
	return(1);
}


// ---------------------------------------------------------------------------------------
//	Function MAKE-GRAPHS interfaces with backend to make new graphs
//
//
function make_graphs(gcmd,gtype,gperiod,gsensors) 
{
	logger("make_graphs:: Started with gcmd: "+gcmd+", gtype: "+gtype+", gperiod: "+gperiod+", gsensors: "+gsensors,1);
	var graph = {
		tcnt: ""+tcnt++ ,
		type: "json",
		action: "graph",							// actually the class of the action
		gcmd: gcmd,
		gtype: gtype,								// Contains the brandname for the device!!
		gperiod: ""+gperiod,
		gsensors: gsensors	
	}
	w_sock.send(JSON.stringify(graph));
	return;
}


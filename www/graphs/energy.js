// TemPI, Javascript/jQuery GUI for graphing temperature, humidit and other sensors
// TemPI is part of the LamPI project, a system for controlling 434MHz devices (e.g. klikaanklikuit, action, alecto)
//
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg, all rights reserved
//
// LamPI Releases:
//
// Version 1.6, Nov 10, 2013. Implemented connections, started with websockets option next (!) to .ajax calls.
// Version 1.7, Dec 10, 2013. Work on the mobile version of the program
// Version 1.8, Jan 18, 2014. Start support for (weather) sensors
// Version 1.9, Mar 10, 2014, Support for wired sensors and logging, and internet access ...
// Version 2.0, Jun 15, 2014, Initial support for Z-Wave devices through Razberry slave device.
// Version 2.1, Jul 31, 2014, Use of rrdtool to make graphs for Sensors.First release of TemPI
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

// ----------------------------------------------------------------------------
// 
//
var skin = "";
var debug = "1";										// debug level. Higher values >0 means more debug
var persist = "1";										// Set default to relaxed
var mysql = "1";										// Default is using mySQL
var cntrl = "1";										// ICS-1000== 0 and Raspberry == 1
var tcnt= 0;

// ----------------------------------------------------------------------------
// s_STATE variables. They keep track of current room, scene and setting
// The s_screen variable is very important for interpreting the received messages
// of the server. 
// State changes of device values need be forwarded to the active screen
// IF the variable is diaplayed on the screen
//
var healthcount = 5;									// Needs to be above 0 to show activity
var s_sensor_id = 0;									// bmp085-1 or other idents
var graphType = "E_ACT";								// temperature, humidity, airpressure
var graphPeriod = "1d";
var graphSensors = {}; 
graphSensors['E_USE'] = [ 'kw_hi_use', 'kw_lo_use', 'kw_hi_ret', 'kw_lo_ret' ];
graphSensors['E_ACT'] = [ 'kw_act_use', 'kw_act_ret' ];
graphSensors['E_PHA'] = [ 'kw_ph1_use', 'kw_ph2_use', 'kw_ph3_use' ];
graphSensors['E_GAS'] = [ 'gas_use' ];

var sensors = {};
var energy = {};

var s_screen = 'room';									// Active screen: 1=room, 2=scene, 3=timer, 4=config
var s_room_id =1;										// Screen room_id
var s_scene_id =1;
var s_timer_id = 1;
var s_handset_id = 1;
var s_weather_id = '';									// Init empty
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
var max_weather = 8;									// Maximum number of weather stations receivers

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
function start_ENERPI()
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
//			e.stopPropagation();
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
						case "E_USE":
							sensor_type = 'E_USE';
						break;
						case "E_ACT":
							sensor_type = 'E_ACT';
						break;
						case "E_PHA":
							sensor_type = 'E_PHA';
						break;
						case "E_GAS":
							sensor_type = 'E_GAS';
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
			make_graphs("energy",graphType,graphPeriod,graphSensors[sensor_type]);
	});
						  
						  
						  
	// --------------------------------------------------------------------------
	// HEADER TIME PERIOD SELECTION
	// Handle the rrd header selection buttons above the graph
	//
	$("#gui_header").on("click", ".hp_button", function(e){
			e.preventDefault();
//			e.stopPropagation();
			selected = $(this);
			
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			$( '.hp_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			//activate_room(id);
			
			switch (id )
			{
				case "P0":	
						graphPeriod="1h";
				break;
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
			make_graphs("energy", graphType, graphPeriod, graphSensors[graphType]);
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
			case "E_ACT":						// TEMPERATURE
					graphType="E_ACT";				
			break;	
			case "E_USE":						// HUMIDITY
					graphType="E_USE";
			break;
			case "E_GAS":						// AIR PRESSURE
					graphType="E_GAS";
			break;
			case "E_PHA":						// WIND SPEED
					graphType="E_PHA";	
			break;
			case "E_BAK":
				// Go Back to LamPI
				window.history.back();
				//close();
			break;
			case "E_SET":
				init_settings();
			break;
			default:
				message('init_menu:: id: ' + id + ' not a valid menu option');
				return(0);
		}
		// First display the last known version of the graph
		display_graph(graphType, graphPeriod);
		init_sensors(graphType);
		// and make a new version in the background
		make_graphs("energy", graphType, graphPeriod, graphSensors[graphType]);
	}); 
	
	// Do the only and first action!!!
	var ret = load_database("init");	
	
  });
  //init();
  
  console.log("Start ENERPI done");
  		// Start the logic of thsi page	
	if ( jqmobile == 1 ) 
	{
		init_websockets();									// For regular web based operations we start websockets here
		var ret = load_database("init");					// Just send the message
		if (ret<0) {
			alert("Error:: loading database failed");
		}
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
		init_websockets();									// For regular web based operations we start websockets here
		var ret = load_database("init");
		if (ret<0) {
			alert("Error:: loading database failed");
		}
	}	
	
  // Once every 60 seconds we update graphs based on the current
  // value of the energy database (which might change due to incoming messages
  // over websockets.
		var id;
		id = setInterval(function()
		{
			// Do work if we are on 1 minute interval
			if ( graphPeriod == '1h' )
			{
				console.log("start_ENERPI:: periodic interval making graphs");
				make_graphs("energy",graphType,graphPeriod,graphSensors[graphType]);
				display_graph(graphType, graphPeriod);
			}
			else
			{
				// Kill this timer temporarily
				clearInterval(id);
				message("Suspend udates");
				console.log("activate_energy:: graphPeriod is: "+graphPeriod)
			}
		}, 60000);		// 60 seconds (in millisecs)
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
	mysql = settings[2]['val'];
	//persist = settings[3]['val'];
	
	if (jqmobile != 1) { 
		skin = '/'+settings[4]['val'];
		$("link[href^='/styles']").attr("href", skin);
		console.log("init:: Old Skin:"+$("link[href^='/styles']").attr("href")+", Skin replace: "+skin);
	}
	
	graphType = "E_ACT";									// temperature, humidity, airpressure
	graphPeriod = "1d"									// Init to 1 day
	
	// Setup the two rows in the header area
	html_msg = '<div id="gui_sensors"></div><div id="gui_periods"></div>';
	$("#gui_header").append( html_msg );
	
	// Initial startup config
	init_menu(graphType);
	init_periods(graphPeriod);
	init_sensors(graphType);
	init_graph(graphType, graphPeriod);
	make_graphs("energy", graphType, graphPeriod, graphSensors[graphType]);
}

// -------------------------------------------------------------------------------------
//
function init_graph(type, period) {
	console.log("init graph:: type: "+type+", period: "+period+".");
	var but="";
	$("#gui_content").empty();
	switch (type) {
		case "E_USE":
			but += '<div><img id="graph" src="pwr_use_'+period+'.png" width="750" height="500"></div>';
		break;
		case "E_ACT":
			but += '<div><img id="graph" src="pwr_act_'+period+'.png" width="750" height="500"></div>';
		break;
		case "E_PHA":
			but += '<div><img id="graph" src="pwr_pha_'+period+'.png" width="750" height="500"></div>';
		break;
		case "E_GAS":
			but += '<div><img id="graph" src="gas_use_'+period+'.png" width="750" height="500"></div>';
		break;
		case "E_SET":
			alert("Error Settings of sensor not yet implemented");
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
		+ '<input type="submit" id="E_ACT" value= "Power Actual" class="hm_button hover">' 
		+ '<input type="submit" id="E_USE" value= "Power Use" class="hm_button">'
		+ '<input type="submit" id="E_PHA" value= "Phase Use" class="hm_button">'
		+ '<input type="submit" id="E_GAS" value= "Gas Use" class="hm_button">'
		+ '<input type="submit" id="E_SET" value= "Settings" class="hm_button">'
		+ '<input type="submit" id="E_BAK" value= "Back" class="hm_button">'
		+ '</td></tr>'
		;
		$(table).append(but);
	}
	else {
		var but =  ''	
		+ '<tr class="switch"><td><input type="submit" id="E_ACT" value= "Pwr Actual" class="hm_button hover"></td>' 
		+ '<tr class="switch"><td><input type="submit" id="E_USE" value= "Pwr Usage" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="E_PHA" value= "Phase Use" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="E_GAS" value= "Gas usage" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="E_PHA" value= "Phase" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="E_BAK" value= "Back" class="hm_button"></td>'
		;

		// Do we have energy records in database.cfg?
		but += '<tr><td></td>'
		+ '<tr><td></td>'
		+ '<tr class="switch"><td><input type="submit" id="T6" value= "Settings" class="hm_button"></td>'
		;
		$(table).append(but);
	}
	console.log("init_menu buttons defined");
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
	console.log("init_sensors started");
	
	but = "<tr><td>";
	
	switch (type) {
			case "E_ACT":
				console.log("init_sensors:: E_ACT found, length: "+graphSensors['E_ACT'].length);
				for (var i=0; i< graphSensors['E_ACT'].length; i++)
				{
					hover="hover";
					but += '<input type="submit" id="E_ACT'+i+'" value= "'+graphSensors['E_ACT'][i]+'" style="max-width:80px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			case "E_USE":
				console.log("init_sensors:: E_USE found");
				for (var i=0; i< graphSensors['E_USE'].length; i++) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					hover="hover";
					// alert("init_sensors:: found: "+weather[i]['name']);
					but += '<input type="submit" id="E_USE'+i+'" value= "'+graphSensors['E_USE'][i]+'" style="max-width:80px; max-height:25px;" class="hs_button '+hover+'">'; 
				}
			break;
			case "E_PHA":
				console.log("init_sensors:: E_PHA found");
				for (var i=0; i< graphSensors['E_PHA'].length; i++) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					hover="hover";
					// alert("init_sensors:: found: "+weather[i]['name']);
					but += '<input type="submit" id="E_PHA'+i+'" value= "'+graphSensors['E_PHA'][i]+'" style="max-width:80px; max-height:25px;" class="hs_button '+hover+'">'; 
				}
			break;
			case "E_GAS":
				console.log("init_sensors:: E_GAS found");
				for (var i=0; i< graphSensors['E_GAS'].length; i++) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					hover="hover";
					// alert("init_sensors:: found: "+weather[i]['name']);
					but += '<input type="submit" id="E_GAS'+i+'" value= "'+graphSensors['E_GAS'][i]+'" style="max-width:80px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			default:
				alert("init_sensors:: Sensor Type "+type+" not yet supported");
	}// switch
	
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
	$( "#gui_periods" ).empty();
	$( "#gui_periods" ).append( html_msg );
	var table = $( "#gui_periods" ).children();		// to add to the table tree in DOM
	
	if (jqmobile == 1) {
		var but =  ''
		+ '<tr><td>'
		+ '<input type="submit" id="P0" value= "Hour" style="max-width:50px;" class="hp_button">' 
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
		+ '<input type="submit" id="P0" value= "Hour" style="max-width:50px; max-height:30px;" class="hp_button">'
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
// DISPLAY_GRAPH
// This function takes care of the graphical processing
//
function display_graph(type, period) {

	var but="";
	var image;
	if (debug >= 2) console.log("display graph:: type: "+type+", period: "+period+".");
	//$("#gui_content").empty();
	switch (type) {
		case "E_USE":
			document.getElementById("graph").src='pwr_use_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "E_ACT":
			document.getElementById("graph").src='pwr_act_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "E_PHA":
			document.getElementById("graph").src='pwr_pha_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "E_GAS":
			document.getElementById("graph").src='gas_use_'+period+'.png';
			image = document.getElementById("graph");
			image.src = image.src.split("?")[0] + "?" + new Date().getTime();
		break;
		case "E_SET":
			alert("Error sensor settings not yet implemented");
			return(0);
		default:
			console.log("display_graph:: Unknown graph type: "+type);
			return(0);
		break;
	}

	return(1);
}


// ---------------------------------------------------------------------------------------
//	Function MAKE-GRAPHS interfaces with backend to make new graphs
//
//  This is the only AJAX function in the file that is sort of synchronous.
//	This because we need the values before we can setup rooms, devices, debug etc settings
//
function make_graphs(gcmd,gtype,gperiod,gsensors) 
{
	var test=true;
	if (test) {
		logger("make_graphs:: Started");
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
}



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
//var w_port = '5000'; 									// port
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
var debug = 1;										// debug level. Higher values >0 means more debug
var persist = "1";										// Set default to relaxed
var mysql = "1";										// Default is using mySQL
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
graphSensors['T'] = [ 'Outside', 'Living', 'Extension' ];	// Inital display sensor values

var s_screen = 'room';									// Active screen: 1=room, 2=scene, 3=timer, 4=config
var s_controller = murl + 'frontend_rasp.php';			// default device handles transmits to the lamps/devices
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
						case "T":
							sensor_type = 'T';
						break;
						case "H":
							sensor_type = 'H';
						break;
						case "P":
							sensor_type = 'P';
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

			make_graphs("weather",graphType,graphPeriod,graphSensors[sensor_type]);
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
			make_graphs("weather", graphType, graphPeriod, graphSensors[graphType]);
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
					graphType="S";	
			break;
			case "T5":
				init_settings();
			break;
			case "T6":
				console.log("weather.js:: Closing current window");
				window.history.back();
				close();
			break;
			default:
				message('init_menu:: id: ' + id + ' not a valid menu option');
				return(0);
		}
		// First display the last known version of the graph
		display_graph(graphType, graphPeriod);
		init_sensors(graphType);
		// and make a new version in the background
		make_graphs("weather", graphType, graphPeriod, graphSensors[graphType]);
	}); 	
	// Do the only and first action!!!
	var ret = load_database("init");							
  });
  console.log("Start TEMPI done");
}

// ----------------------------------------------------------------------------------------
//	function message, displays a message down in the gui_messages area
//	Input Parameter is now just the text to display
//
function message(txt,lvl) 
{
	if (debug >2 ) alert("Message called: "+txt+", lvl: "+lvl+", debug: "+debug);
	if (typeof lvl != 'undefined') {
		// alert("defined");
	}
	else {
		// alert("undefined");
		lvl = debug ;
		//alert("setting debug in message");
	}
	if (lvl <= debug) {
		$( "#gui_messages" ).empty("")
		txt = '<div id="comment">' + txt + '</div>'
		$( "#gui_messages" ).append( txt );	
	}
	return(0);
}


// -------------------------------------------------------------------------------------
// FUNCTION INIT
// This function is the first function called when the database is loaded
// It will setupt the menu area and load the first room by default, and mark 
// the button of that room
// See function above, we will call from load_database !!!
//
function init() {
	console.log("init started");
	//debug = settings[0]['val'];
	cntrl = settings[1]['val'];
	s_controller = murl + 'backend_rasp.php';

	mysql = settings[2]['val'];
	//persist = settings[3]['val'];
	
	if (jqmobile != 1) { 
		skin = '/'+settings[4]['val'];
		$("link[href^='/styles']").attr("href", skin);
	}
	
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
	make_graphs("weather", graphType, graphPeriod, graphSensors[graphType]);
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
	for (var i=0; i< weather.length; i++) {
		switch (type) {
			case "T":
				if ((type=="T") && (weather[i]['temperature'] != "")) {
					// alert("init_sensors:: found: "+weather[i]['name']);
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(weather[i]['name'],graphSensors['T']) != -1) {
						console.log("init_sensors:: Found: "+weather[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+weather[i]['name']+" in graphSensors");
						hover = "";
					}
					but += '<input type="submit" id="T'+i+'" value= "'+weather[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">';
				}
			break;
			case "H":
				if ((type=="H") && (weather[i]['humidity'] != "")) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(weather[i]['name'],graphSensors['H']) != -1) {
						console.log("init_sensors:: Found: "+weather[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+weather[i]['name']+" in graphSensors");
						hover = "";
					}
					// alert("init_sensors:: found: "+weather[i]['name']);
					but += '<input type="submit" id="H'+i+'" value= "'+weather[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">'; 
				}
			break;
			case "P":
				if ((type=="P") && (weather[i]['airpressure'] != "")) {
					// Find out whether this button is in the list of graphsSensors['graphType']
					if (jQuery.inArray(weather[i]['name'],graphSensors['P']) != -1) {
						console.log("init_sensors:: Found: "+weather[i]['name']+" in graphSensors");
						hover="hover";
					} else {
						console.log("init_sensors:: NOT Found: "+weather[i]['name']+" in graphSensors");
						hover = "";
					}
					// alert("init_sensors:: found: "+weather[i]['name']);
					but += '<input type="submit" id="P'+i+'" value= "'+weather[i]['name']+'" style="max-width:60px; max-height:25px;" class="hs_button '+hover+'">';
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

// ---------------------------------------------------------------------------------------
//	Function database inits all communication with the database backend
//
//  This is the only AJAX function in the file that is sort of synchronous.
//	This because we need the values before we can setup rooms, devices, debug etc settings
//
function load_database(dbase_cmd) 
{
	var sqlServer = murl + 'frontend_sql.php';
	if (debug>=2) alert("load_database:: sqlServer:: " + sqlServer);
	else console.log("load_database:: sqlServer: "+ sqlServer);
	
	$.ajax({
        url: sqlServer,	
		async: false,					// Synchronous operation 
		type: "POST",								
        dataType: 'json',
		data: {
			action: "load_database",
			message: dbase_cmd
		},
		timeout: 8000,
        success: function( data )
		{
			// XXX Future improvement: Only get one room or scene at a time, not the whole array !!
			// On the other hand, for TCP/IP sending a large array or just a smaller one
			// does not make a lot of difference in time and processing
			rooms = data.appmsg['rooms'];			// Array of rooms
			devices = data.appmsg['devices'];		// Array of devices			
			scenes = data.appmsg['scenes'];
			timers = data.appmsg['timers'];
			handsets = data.appmsg['handsets'];
			settings = data.appmsg['settings'];
			brands = data.appmsg['brands'];
			weather = data.appmsg['weather'];		// we want the id and name values

			// For all rooms write a button to the document
			$("#gui_header").append('<table border="0">');	// Write table def to DOM
			var table = $( "#gui_header" ).children();		// to add to the table tree in DOM

			// Send debug message is desired
			if (debug >= 2) {							// Show result with alert		
          			alert('Ajax call load_database success. '
					+ '\nTransaction Nr: ' + data.tcnt
				  	+ ',\nStatus: ' + data.status 
					+ '.\nApp Msg: ' + data.appmsg 
					+ '.\nApp Err: ' + data.apperr 
				);
			}
			// Function finished successfully
			but = 'Load_database success' ;
			if (debug > 1) {
				but += "<br>AppErr: " + data.apperr;
			}
			message(but);
			// INIT IS THE ONLY FUNCTION DONE AFTER LOADING THE DATABASE
			// FIRST TIME. AND BY PUTTING IT IN SUCCESS WE MAKE IT SYNCHRONOUS!
			init();
			
			return(0);
        }, 
		error: function(jqXHR, textStatus, errorThrown)
		{
          	// data.responseText is what you want to display, that's your error.
			if (debug >= 2) {
          		alert("load_database:: Error " + sqlServer
					+ " sending cmd:: " + dbase_cmd
					+ "\nError: " + jqXHR.status
					+ "\nTextStatus: "+ textStatus
					+ "\nerrorThrown: "+ errorThrown
					+ "\n\nFunction will finish now!" );
			}
			else
				alert("Timeout connecting to database on "+sqlServer);
			return(-1);
         }
	});		
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
	var result;
	var graphServer = murl + 'graphs/weather.php';
	if (typeof gsensors == 'undefined') {
		message("make_graphs:: gsensors not specified");
	}
	if (debug>=2) alert("make_graphs:: server:: " + graphServer+", gtype: "+gtype+", gperiod: "+gperiod);
	else console.log("make_graphs:: server: "+ graphServer+", gtype: "+gtype+", gperiod: "+gperiod);
	
	message("make_graphs:: making graph for "+gsensors);
	console.log("make_graphs:: json gsensors: "+gsensors);
	
	$.ajax({
        url: graphServer,	
		async: true,							// Asynchronous operation 
		type: "POST",								
        dataType: 'json',
		data: {
			action: gcmd,						// "graph"
			gtype: gtype,						// "T", "H", "P"
			gperiod: gperiod,					// "1d" "1w" "1m" "1y"
			gsensors: gsensors	// { 'temperature': {}, 'humidity': {} }
		},
		timeout: 30000,
        success: function( data )
		{
			// XXX Future improvement: Only get one room or scene at a time, not the whole array !!
			// On the other hand, for TCP/IP sending a large array or just a smaller one
			// does not make a lot of difference in time and processing
			result = data.result;							// Array of rooms

			// Send debug message is desired
			if (debug >= 2) {								// Show result with alert		
          		alert('Ajax call make_graphs success. '
					+ '\nTransaction Nr: ' + data.tcnt
				  	+ ',\nStatus: ' + data.status 
					+ '.\nApp Msg: ' + data.result 
					+ '.\nApp Err: ' + data.error 
				);
			}
			// Function finished successfully. This may take some time to process
			// but as soon as we have an updated chart, display it in the content area.
			switch (data.status) {
					case "OK":
						console.log("make_graph:: Returned OK, displaying new graph");
						display_graph(gtype,gperiod);
						return(data.result);
					break;
					case "ERR":
						alert("\t\tweather.js:: make_graphs: ERROR\n\nresult: "+data.result+",\n\nERROR MSG: "+data.error);
						return(data.error);
					break
			}
			return(0);
        }, 
		error: function(jqXHR, textStatus, errorThrown)
		{
          	// data.responseText is what you want to display, that's your error.
			if (debug>=2) {
          		alert("make graphs:: Error " + graphServer
					+ " sending type:: " + graphType+", period: "+gperiod
					+ "\nError: " + jqXHR.status
					+ "\nTextStatus: "+ textStatus
					+ "\nerrorThrown: "+ errorThrown
					+ "\n\nFunction will finish now!" );
			}
			else
				logger("Timeout connecting to graph server on "+graphServer);
			return(-1);
         }
	});		
}


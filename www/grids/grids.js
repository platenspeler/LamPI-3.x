// Grids is part of LamPI
//
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg, all rights reserved
//
// LamPI Releases:
// Version 3.3, Jul 01, 2015. Start making grids/tiles
//
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

// XXX Stop animations when initi or redraw of grid
// XXX Find a way to update a device or any other widget without a complete redraw

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
var jqmobile=0;											// This specifies what jQuery library file be used
var phonegap=0;											// Phonegap setting, init to no phonegap
var dynamicIP=1;										// Use a static IP for daemon or a dynamicIP (standard)
var murl='/';											// For Phonegap and Ajax usage, build a url. DO NOT CHANGE!

// ----------------------------------------------------------------------------
// 
//
var skin = "";
var debug = "1";										// debug level. Higher values >0 means more debug
var mysql = "1";										// Default is using mySQL
var cntrl = "1";										// ICS-1000== 0 and Raspberry == 1
var loginprocess=false;									// Is there a login process going on?

// ----------------------------------------------------------------------------
// Grid specific declaratons
var gridster;
var gSort = ['g_none'];										// No sorting initially
var gScreen = [ 'g_devices' ];
s_screen="g_grid";

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
function start_Grids()
{
  // This function first needs to be executed						
  // --------------------------------------------------------------------------
  $(window).load(function(){

	// --------------------------------------------------------------------------
	// HEADER SORT GRID SELECTION
	// Handle the selection for the grid (.hr_buttons used)
	// NOTE: We use gui_header as its chidren are NOT known yet at this moment
	//
	$("#gui_header").on("click", ".hr_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			logger("event row2",1);
			selected = $(this);
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			$( '.hr_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			switch(id)
			{
			case "g_none":  gSort = [ "g_none" ]; break;
			case "g_room":	if (! gSort.contains("g_room")) gSort.push("g_room"); break;
			case "g_type":  if (! gSort.contains("g_type")) gSort.push("g_type"); break;
			case "g_alpha":  if (! gSort.contains("g_alpha")) gSort.push("g_alpha"); break;
			default:
				message('click header:: id: ' + id + ' not a valid menu option');
			}
			init_grid(gScreen, gSort);
	});					  
	
	// --------------------------------------------------------------------------
	// WIDGETS BUTTONS HANDLING
	// Handle clicks in the SORTING area with DIV hs_button (borrowed from header scene)
	//
	$("#gui_header").on("click", ".hs_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		logger("event row1",1);
		selected = $(this);
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		//$( '.hm_button' ).removeClass( 'hover' );
		$( this ).toggleClass ( 'hover' );
		switch(id)
		{
			case "s_devices": gToggle(gScreen,"g_devices"); break;
			case "s_scenes": gToggle(gScreen,"g_scenes"); break;
			case "s_timers": gToggle(gScreen,"g_timers"); break;
			case "s_handsets": gToggle(gScreen,"g_handsets"); break;
			case "s_sensors": gToggle(gScreen,"g_sensors"); break;
			case "s_energy": gToggle(gScreen,"g_energy"); break;
			case "s_reset": $('.hs_button').removeClass( 'hover' ); gScreen=[] ; break;
			default:
				message('click menu:: id: ' + id + ' not a valid menu option');
		}
		init_grid(gScreen,gSort)
	}); 

	// --------------------------------------------------------------------------
	// MENU BUTTONS HANDLING
	// Handle clicks in the menu area with DIV hm_button
	//
	$("#gui_menu").on("click", ".hm_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		logger("event menu",1);
		but = "";
		selected = $(this);
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		//$( '.hm_button' ).removeClass( 'hover' );
		$( this ).toggleClass ( 'hover' );
		switch(id)
		{
			case "M1": gToggle(gScreen,"g_devices"); break;
			case "M2": gToggle(gScreen,"g_scenes"); break;
			case "M3": gToggle(gScreen,"g_timers"); break;
			case "M4": gToggle(gScreen,"g_handsets"); break;
			case "M6": gToggle(gScreen,"g_sensors"); break;
			case "M7": gToggle(gScreen,"g_energy"); break;
			case "M5": init_settings(); break;
			default:
				message('click menu:: id: ' + id + ' not a valid menu option');
		}
		init_grid(gScreen,gSort)
	}); 

	
	// --------------------------------------------------------------------------
	// SWITCH Click HANDLING
	// The click returns the id of the switch which is rrDddS where rr is room id and
	// dd is device id. The 'D' is easy as separator, and S is the Switch indicator of the Grid
	$("#gui_content").on("click", ".dbuttons", function(e){
	  e.preventDefault();
	  e.stopPropagation();						// Make sure that the parent (=widget) is not selected
	  id = $(e.target).attr('id');
	  logger("button event:: click "+id,1);

	  var gridId = "#"+id;
	  logger("Event switch:: gridId: "+gridId+", id: "+id.slice(0,-1),1);
	  var ind = findDevice(id.slice(0,-1));
	  var type = lroot['devices'][ind]['type'];
	  var value = lroot['devices'][ind]['val']
	  switch (type) {
		case "switch":
		  if (value == 0) {						// If the current value is 0, make it 1
			lroot['devices'][ind]['val'] = 1;
			but_val = "ON";
			$(gridId ).addClass( 'hover' );
		  } else {
			lroot['devices'][ind]['val'] = 0;
			but_val = "OFF";
			$(gridId).removeClass ( 'hover' );
		  }
		  var ics = "!R"+lroot['devices'][ind]['room']+"D"+lroot['devices'][ind]['uaddr']+"F"+lroot['devices'][ind]['val'];
		  var brand_id = lroot['devices'][ind]['brand'];
		  var cmd = brands[brand_id]['fname'];
		  send2daemon("gui",cmd,ics);
		  $(gridId).val(but_val);
		 break;
		 default:
		 	logger("button event:: Unknow type device: "+type,1);
	  }
	});


	// --------------------------------------------------------------------------
	// WIDGET Single Click HANDLING
	// NOTE: Not necessary as gridster will itself make these event handlers
	//
	//$("#gui_content").on("click", ".widget", function(e){
	//  id = $(e.target).attr('id');
	//  logger("grid event:: click "+id,1);
	// So now grow the widget when necessary ready to perform actions
	

	// Clicking it again should bring it back to original size
	//});
	
	// --------------------------------------------------------------------------
	// WIDGET Double Click HANDLING
	// $(this) is the widget selected
	$("#gui_content").on("dblclick", ".widget", function(e){
	  e.preventDefault();
	  e.stopPropagation();						// Make sure that the parent (=widget) is not selected
	  id = $(e.target).attr('id');
	  console.log("grid event:: dblclick "+id+", this",$(this));
	  // console.log( $(".gridster ul").data("gridster").serialize() );
	  // So now grow the widget when necessary ready to perform actions
	  var dimensions = $(".gridster ul").data("gridster").serialize($(this))[0];
	  if (debug >= 2) alert("Existing width: " + dimensions.size_x + ", height: " + dimensions.size_y);
	  if ((dimensions.size_x ==1) && (dimensions.size_y==1)) {
		gridster.resize_widget( $(this), 2, 2);
		gridster.disable(); 
		gridster.disable_resize();
		
	  } else {
		// Do work
		gridster.resize_widget( $(this), 1, 1);
		gridster.enable(); 
		gridster.enable_resize();
	  }
	  // Clicking it again should bring it back to original size
	});

	// =============================
	// Start the logic of this page	
	if ( jqmobile == 1 ) {

	}
	else {
		if (typeof(Storage) !== "undefined") {
			logger("Loading user and database settings from localStorage",1);
			var uname= localStorage.getItem("uname");		// username
			var pword= localStorage.getItem("pword");		// pin
			var saddr= localStorage.getItem("saddr");		// Server address
		}
	}
	init_websockets();									// For regular web based operations we start websockets here
	var ret = load_database("init");
	if (ret<0) {
		alert("Error:: loading database failed");
	}
  });
  // function init() i called by load_datase in the LamPIlib.js file
}

// -------------------------------------------------------------------------------------
// gToggle values in the gScreen
//
function gToggle (o, e) {
		if (o.contains(e)) {
			var i;
			for (i=0; i<o.length; i++) { if (e == o[i]) break; }
			o.splice(i,1);
		}
		else {
			o.push(e);
		}
}
	
// -------------------------------------------------------------------------------------
// INIT
// This function is the first function called when the database is loaded
// It will setupt the menu area and load the first room by default, and mark 
// the button of that room
// See function above, we will call from load_database !!!
//
function init() {
	console.log("init:: started");
	debug = settings[0]['val'];
	//cntrl = settings[1]['val'];

	logger("setting skin",1);
	if (jqmobile != 1) { 
		skin = '/'+settings[4]['val'];
		logger("init:: Skin selected: "+skin,1);
		$("link[href^='/styles']").attr("href", skin);
	}

	// Initial startup config
	init_menu();
	init_header();
	init_grid(gScreen,gSort);
}


// ------------------------------------------------------------------------------------------
// INIT MENU
// Setup the main menu (on the right) event handling
//
function init_menu(cmd) 
{
	$("#gui_menu").empty();
	// For all menu buttons, write all to a string and print string in 1 time
	if (jqmobile == 1) {
		var txt = '<div data-role="fieldcontain" class="ui-hide-label">';
		txt += '<label for="select-choice-1" class="select hm_button">menu</label> ';
		txt += '<select name="select-choice-1" id="select-choice-1"> ';
		txt += '<option value="Rooms">Rooms</option>';
		txt += '<option value="Scenes">Scenes</option>';
		txt += '<option value="Timers">Timers</option>';
		txt += '<option value="Handsets">Handsets</option>';
		if (sensors.length > 0) { txt += '<option value="Sensor">Sensors</option>'; }
		if (use_energy) { txt += '<option value="Energy">Energy</option>'; }
		txt += '<option value="Config">Config</option>';
		txt += '</select></div>';
		$("#gui_menu").append( txt );
		
		$("#select-choice-1").change(function() {
    		var selected = $(this).val(); // or this.value
			switch(selected) {
			case "Rooms": init_rooms ("init"); break;
			case "Scenes": init_scenes(s_scene_id); break;
			case "Timers": init_timers(); break;
			case "Handsets": init_handsets(); break;
			case "Config": init_settings(); break;
			case "Sensor": init_sensors(); break;
			case "Energy": init_energy(); break;
			default: message('init_menu:: id: ' + selected + ' not a valid menu option');
			}
		});
	}
	else { // No jqmobile
		html_msg = '<table border="0">';
		$("#gui_menu").append( html_msg );
		var table = $( "#gui_menu" ).children();		// to add to the table tree in DOM
		var but =  '';
		but +=  '<tr><td><input type="submit" id="M1" value= "Rooms" class="hm_button hover"></td>';
		but +=  '<tr><td><input type="submit" id="M2" value= "Scenes" class="hm_button"></td>';
		but +=  '<tr><td><input type="submit" id="M3" value= "Timers" class="hm_button"></td>';
		but +=  '<tr><td><input type="submit" id="M4" value= "Handsets" class="hm_button"></td>';
		// Do we have sensors definitions in database.cfg file?
		if (sensors.length > 0) {
			but += '<tr><td><input type="submit" id="M6" value= "Sensors" class="hm_button"></td>'
		}
		// Do we have energy definitions in database.cfg file?
		if (use_energy) {
			but += '<tr><td><input type="submit" id="M7" value= "Energy" class="hm_button"></td>'
		}
		but += '<tr><td></td>'
		+ '<tr><td></td>'
		+ '<tr><td><input type="submit" id="M5" value= "Config" class="hm_button"></td>'
		+ '</table>'
		;
		$(table).append(but);
		

	}
	// EVENT HANDLER
}

// ----------------------------------------------------------------------------------------
// INIT HEADER
function init_header() {
	$("#gui_header").empty();
	html_msg = '<div id="gui_header_row1"></div><div id="gui_header_row2"></div>';
	$("#gui_header").append(html_msg);
	
	var html_msg = "";
	logger("init_header:: started ",1);
	//html_msg += "Widget: ";
	html_msg += '<input type="submit" id="s_reset" value= "Reset" class="hs_button">' ;
	html_msg += '<input type="submit" id="s_devices" value= "Devices" class="hs_button hover">' ;
	html_msg += '<input type="submit" id="s_scenes" value= "Scenes" class="hs_button">';
	//html_msg += '<input type="submit" id="s_timers" value= "Timers" class="hs_button">';
	//html_msg += '<input type="submit" id="s_handsets" value= "Handsets" class="hs_button">';
	// Do we have sensors definitions in database.cfg file?
	if (sensors.length > 0) {
		html_msg += '<input type="submit" id="s_sensors" value= "Sensors" class="hs_button">';
	}
	// Do we have energy definitions in database.cfg file?
	if (use_energy) {
		html_msg += '<input type="submit" id="s_energy" value= "Energy" class="hs_button">';
	}
	$("#gui_header_row1").append(html_msg);
	
	html_msg = "";
	//html_msg += "Sort  &nbsp;&nbsp;&nbsp;: ";
	html_msg += '<input type="submit" id="g_none" value= "no sort" class="hr_button ">';
	html_msg += '<input type="submit" id="g_room" value= "rooms" class="hr_button ">';
	html_msg += '<input type="submit" id="g_type" value= "type" class="hr_button ">';
	html_msg += '<input type="submit" id="g_alpha" value= "alpha" class="hr_button ">';
	$("#gui_header_row2").append(html_msg);
	logger("init_header:: ended ",1);
}


// ----------------------------------------------------------------------------------------
// FIND DEVICE
function findDevice(id) {
	var splits = id.split('D');
	for (var i=0; i< lroot['devices'].length; i++) {
		if ((lroot['devices'][i]['room'] == splits[0]) && ( lroot['devices'][i]['id'] == ('D'+splits[1]) )) return(i)
	}
	return(-1);
}

// ----------------------------------------------------------------------------------------
// SORT GRID
// Filter the grid based on criteria in gScreen array and make widget.
//
function sort_grid(widgets, gSort) {
  var owidgets = [];
  function sortByKey(array, key) {
    return array.sort(function(a, b) {
        var x = a[key]; var y = b[key];
        if (typeof x == "string") {
            x = x.toLowerCase(); y = y.toLowerCase();
        }
        return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    });
  }
  for (var si=0; si<gSort.length; si++) {
	switch(gSort[si]) {	
		case "g_none":
			logger("sort_grid:: recognized: "+gSort[si],1);
			for (var i=0; i< widgets.length; i++) { owidgets[i]=widgets[i]; }
		break;
		case "g_rooms":
			logger("sort_grid:: recognized: "+gSort[si],1);
		break;
		case "g_type":
			logger("sort_grid:: recognized: "+gSort[si],1);
		break;
		case "g_alpha":
			logger("sort_grid:: recognized: "+gSort[si],1);
			owidgets = sortByKey(widgets,'name');
		break;
		default:
			logger("sort_grid:: Unknow sort key: "+gSort[si],1);
	}//switch
  }//for
  return(owidgets);
}

// ----------------------------------------------------------------------------------------
// FILTER GRID
// Filter the grid based on criteria in gScreen array and make widget.
//
function filter_grid(widgets, gScreen) {
  // for the moment assume that the widgets array is empty
  for (var si=0; si<gScreen.length; si++) {
	switch (gScreen[si]) {
	  case "g_devices":
		logger("filter_grid:: g_devices adding", 1);
		for (var i=0; i<lroot['devices'].length; i++) widgets.push(lroot['devices'][i]);
	  break;
	  case "g_scenes":
		logger("filter_grid:: g_scenes adding", 1);
		for (var i=0; i<lroot['scenes'].length; i++) widgets.push(lroot['scenes'][i]);
	  break;
	  case "g_timers":
		logger("filter_grid:: g_timers adding", 1);
		for (var i=0; i<lroot['timers'].length; i++) widgets.push(lroot['timers'][i]);
	  break;
	  case "g_handsets":
		logger("filter_grid:: g_handsets adding", 1);
		for (var i=0; i<lroot['handsets'].length; i++) widgets.push(lroot['handsets'][i]);
	  break;
	  case "g_sensors":
	    // As sensors might have multiple su sensors, put each one in the widget list
		logger("filter_grid:: g_sensors adding", 1);
		for (var i=0; i<lroot['sensors'].length; i++) {
			 var j=0;
			var len = lroot['sensors'][i]['sensor'].length;
			for ( var key in lroot['sensors'][i]['sensor'] ) {
				var o={};
				jQuery.extend(o,lroot['sensors'][i]);				// copy NOT by reference
				var sKey = Object.keys(o['sensor'])[j++];
				o['sensor'] = {};
				o['sensor'][sKey] = lroot['sensors'][i]['sensor'][sKey] ;		// sKey eg temperature
				widgets.push(o);
			}
		}//for
	  break;
	  default: 
	  	logger("filter_grid:: gScreen id not recognized: "+gScreen[si],1);
	}
  }
  return(widgets);
}

// ----------------------------------------------------------------------------------------
// MAKE GRID
// Make the grid based on criteria in gScreen array and make widget.
//

function make_grid(widgets) {
  logger("make_grid:: Counting "+widgets.length+" widgets",1);
  // Based on the parameter received we fill the grid
  for (var si=0; si<widgets.length; si++) {
	  
	logger("make_grid:: widget: "+si+", name: "+widgets[si].name+", type:"+widgets[si]['type'],2);
	var widget = "";
	widget += '<li class="widget" id='+si+'><table>';
	
	switch(widgets[si]['type']) {
		case 'switch':
			var gridId = widgets[si]['room']+widgets[si]['id'];	// Devices start their id with a 'D' so all id are like xxDyy
			var device_name = widgets[si]['name'];
			var device_val = widgets[si]['val'];
			//widget += '<tr class="devrow switch">' ;
			widget += '<tr class="switch">';
			widget += '<th colspan="2">'+device_name+'</th>';
			widget += '</tr><tr>'
			widget += '<td><image width="25" height="25" src="/styles/images/switch.png"> </image></td>';
			var but_val = (device_val ==0?"OFF":"ON ");
			var but_hov = (device_val ==0?'':'hover');
			widget += '<td><input type="submit" id="'+gridId+'S" value= "'+but_val+'" class="dbuttons '+but_hov+'">,</td>';
			widget += '</tr>';
		break;
		case 'dimmer':
		    var gridId = widgets[si]['room']+widgets[si]['id'];	// Devices start their id with a 'D' so all id are like xxDyy
			// Fill each widget with the sa,e standard content based on devices (or tbd sensors).
			var device_name = widgets[si]['name'];
			var device_val = widgets[si]['val'];
			widget += '<tr class="devrow dimrow">';
			widget += '<th colspan="2">'+device_name+'</th>';
			widget += '</tr><tr>';
			widget += '<td width="16%"><image width="25" height="25" src="/styles/images/lamp.png"> </image></td>';
			if (jqmobile) {
				
				widget += '<td><input type="number" data-type="range" style="min-width:32px;" id="'+gridId+'D" name="'+gridId+'Fl" value="'+device_val+'" min=0 max=31 data-highlight="true" data-mini="true" class="ddimmer"/></td>';
				
			} else {
				widget += '<td><div id="' +gridId + 'D" class="slider slider-widget dimmer"></div></td>';

			}
			widget += '</tr>';
		break;
		case 'thermostat':
		    var gridId = widgets[si]['room']+widgets[si]['id'];	// Devices start their id with a 'D' so all id are like xxDyy
			var device_val = widgets[si]['val'];
			var device_name = widgets[si]['name'];
			widget += '<tr class="switch">';
			widget += '<th colspan="3">'+device_name+'</th>';
			widget += '</tr><tr>';
			widget += '<td><image width="25" height="25" src="/styles/images/thermometer.png"> </image></td>';
			widget += '<td><input type="submit" id="'+gridId + 'T" value= "'+device_val +"\u00B0"+'" class="dbuttons thermostat '+but_hov+'">,</td>';
			widget += '</tr>';
			message("thermostat");
		break;
		case 'scene':
			var widget_val = widgets[si]['val'];
			var widget_name = widgets[si]['name'];
			widget += '<tr class="switch">';
			widget += '<th colspan="3">'+widget_name+'</th>';
			widget += '</tr><tr>';
			widget += '<td><image width="25" height="25" src="/styles/images/scene.png"> </image></td>';
			widget += '<td><input type="submit" id="X'+widgets[si]['id']+'" value= "'+widget_val+"\u00B0"+'" class="dbuttons thermostat '+but_hov+'">,</td>';
			widget += '</tr>';
		break;
		case 'sensor':
			logger("make_grid:: sensors ",1);
			var sKey = Object.keys(widgets[si]['sensor'])[0]; 
			var sUnit = "";
			var sLbl = "";
			switch (sKey) {
				case "temperature": sUnit = "\u00B0"; sLbl = "Temp: "; break;
				case "airpressure": sUnit = "hPa"; sLbl = "Baro: "; break;
				case "humidity": sUnit = "%"; sLbl = "Humi: "; break;
				case "luminescense": sUnit = "Lum"; sLbl = "Lumi: "; break;
				default:
			};
			var device_val = widgets[si]['sensor'][sKey]['val'];
			console.log("make_grid:: sensor key: ",sKey+", device_val: "+device_val);
			var device_name = widgets[si]['name'];
			widget += '<tr class="switch">';
			widget += '<th colspan="2">'+device_name+'</th>';
			widget += '</tr><tr>';
			widget += '<td><image width="25" height="25" src="/styles/images/sensor.png"> </image></td>';
			widget += '<td>'+sLbl+'<input type="submit" id="S'+widgets[si]['id']+'" value= "'+device_val+sUnit+'" class="dbuttons '+'"></td>';
			widget += '</tr>';
		break;
		default:
			message("init_grid:: device type "+widgets[si]['type']+" not recognized");
		break;
	  }//switch
	  
	  widget += '</table></li>'
	  //widgets.push(gridster.add_widget(widget, 1, 1));	// Tis is the actual code to make a widget
	  gridster.add_widget(widget, 1, 1);
	  	
	  // This function initialization must be AFTER putting the slider on the screen (otherwise will not work).
	  // function can be executed LONG after initialization. Therefore ALL variabls need to be
	  // dynamic and generated from the parameters passed from the .slider() function.
	  if (jqmobile==1) {
		var slidid="#"+gridId+"D";
		$(slidid).slider ({
			stop: function( event, ui ) {
				var id = $(event.target).attr('id');
				var val = $(event.target).val();
				var ind = findDevice(id);
				if (ind <0) return;
				var brand_id = lroot['devices'][ind]['brand'];	// brand contains name of script
				var cmd = brands[brand_id]['fname'];
				var ics = "!R"+lroot['devices'][ind]['room']+"D"+lroot['devices'][ind]['uaddr']+"FdP"+val;
				send2daemon("gui",cmd,ics);
				lroot['devices'][ind]['val'] = val;
			}
		});
		//$(slidid).next().find('.ui-slider-handle').hide();
		$(slidid).slider("refresh");
	  }
	  else {
		 
	  	$(function() {
			var gridId = widgets[si]['room']+widgets[si]['id'];	// Devices start their id with a 'D' so all id are like xxDyy
			var label ="#"+gridId; 
			var slidid="#"+gridId+"D";				// # is for DIV, D to recognize dimmer
			logger("Starting Grid Widget Slider function for slider: "+slidid,2);
			$( slidid ).slider({
			  range: "max",
			  min: 0,
			  max: 31,
			  value: widgets[si]['val'],
    		  slide: function( event, ui ) {
      			$( slidid ).val( ui.value );
			  },
			  stop: function( event, ui ) {
				var val = ui.value;
				var id = $(event.target).attr('id');
				logger("slider stop:: id: "+id+", val: "+val,1);
				
				var ind = findDevice(id);
				if (ind <0) return;
				
				var brand_id = lroot['devices'][ind]['brand'];	// brand contains name of script
				var cmd = brands[brand_id]['fname'];
				var ics = "!R"+lroot['devices'][ind]['room']+"D"+lroot['devices'][ind]['uaddr']+"FdP"+val;
				send2daemon("gui",cmd,ics);
				lroot['devices'][ind]['val'] = val;
			  }
			});// slider (every slider its own definition)
	    }); // function
	  }//if jqmobile
  }//for
  return (widgets);
}


// ----------------------------------------------------------------------------------------
// INIT GRIDS
// This function will fill the grid (for the first time). 
// For the moment the grid is (only) filled with the devices array.
// Parameter: s selects the info displayed in the grid, is an array of keywords
// The sorting parameter provides, if present, the fields to sort grid on 
//		(effectively this could mean differnet grids ...)
//
// We NEED a function to remove the current grid in order to reshuffle content.
//
function init_grid(gScreen,gSort) {
  var widgets = [];
  
  // Start cleanup 
  $("#gui_content").css( "overflow-y", "auto" );	// Use a vertical slidebar when necessary
  if (gridster !== undefined) {
	//gridster.remove_widget($(".widget"));			// do not clear gui_content
	gridster.destroy(true);							// Destroy the COMPLETE gridster
	$(".gridster").append('<ul></ul>')				// Lay foundation for new gridster
  }
  
  // gridster creation start
  $(".gridster ul").gridster({
	//autogenerate_stylesheet: false,			// XXX Performance
	widget_margins: [3, 3],
	widget_base_dimensions: [150, 100],
	helper: 'clone',
	animate: false,
	resize: {
	  enabled: true,
	  stop: function (e, ui, $widget) {
		var newDimensions = this.serialize($widget)[0];
		logger("New width: " + newDimensions.size_x + ", New height: " + newDimensions.size_y,2);
      }
    }
  });
  gridster= $(".gridster ul").gridster().data('gridster');
  //gridster.generate_stylesheet({ rows: 30; cols: 5 });

  widgets = filter_grid(widgets, gScreen);			// Select all relevant items from system and put in array widgets
  widgets = sort_grid(widgets, gSort)				// Sort the widgets array based on criteria in gSort
  widgets = make_grid(widgets);
    
  if (debug>2) console.log( $(".gridster ul").data("gridster").serialize() );
  return($(".gridster ul").data("gridster").serialize() );
}

// ----------------------------------------------------------------------------------------
// When the GUI or rules update the devices array
// update the grid with these new values.
// XXX For the moment assume there is an update in "gui", so one of the devices has changed
//	coming in from the websocket. The function is called on "gui" event with 'ind' being the 
//	index of the device that has changed!
//	So we look for a slider or a switch with that index. Alls grid idexes are "room"+"id"
//
function update_grid(ind) {
	var value = lroot['devices'][ind]['val'];
	var type = lroot['devices'][ind]['type'];
	logger("update_grid:: updating device "+lroot['devices'][ind][name]+" with val: "+value,1);
	var gridId = "#"+lroot['devices'][ind]['room']+lroot['devices'][ind]['id'];
	switch (type) {
	  case "switch":
	    gridId+="S";
		if (value == 0) {
			but_val = "OFF";
			$(gridId ).removeClass( 'hover' );
		} else {
			but_val = "ON";
			$(gridId).addClass ( 'hover' );
		}
		$(gridId).val(but_val);	
	  break;
	  case "dimmer":
	    gridId+="D"
		$(gridId).val(value);
		$(gridId).slider("option", "value", value );
	  break;
	  case "themostat":
	    gridId+="T";
	  	if (value == 0) {
			but_val = value;
			$(gridId).removeClass( 'hover' );
		} else {
			but_val = value;
			$(gridId).addClass ( 'hover' );
		}
		$(gridId).val(but_val);
	  break;
	  case "scenes":
	  case "sensors":
	  	logger("update_grid:: ERROR type "+type+" not recognized",1);
	  break;
	  default:
	  	logger("update_grid:: Unknow device type: "+type,1);
	}
}

// TemPI, Javascript/jQuery GUI for graphing temperature, humidit and other sensors
// TemPI is part of the LamPI project, a system for controlling 434MHz devices (e.g. klikaanklikuit, action, alecto)
//
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg, all rights reserved
//
// LamPI Releases:
// Version 1.6, Nov 10, 2013. Implemented connections, started with websockets option next (!) to .ajax calls.
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
var debug = 1;										// debug level. Higher values >0 means more debug
var persist = "1";										// Set default to relaxed
var mysql = "1";										// Default is using mySQL
var cntrl = "1";										// ICS-1000== 0 and Raspberry == 1
var healthcount = 5;									// Needs to be above 0 to show activity

// ----------------------------------------------------------------------------
// s_STATE variables. They keep track of current room, scene and setting
// The s_screen variable is very important for interpreting the received messages
// of the server. 
// State changes of device values need be forwarded to the active screen
// IF the variable is diaplayed on the screen
//
var s_sensor_id = 0;									// bmp085-1 or other idents
var s_screen = 'config';								// Active screen: 1=room, 2=scene, 3=timer, 4=config
var s_setting_id = 0;
var s_recorder = '';									// recording of all user actions in a scene. 
var s_recording = 0;									// Set to 1 to record lamp commands
var s_sensor_id = 0;
var s_rule_id = 0;

var lroot={};			// XXX just like in the LamPI-node.js program we need a root object
var rooms={};			// For most users, especially novice this is the main/only screen
var devices={};			// Administration of room devices (lamps or switches)
var scenes={};			// Series of device actions that are grouped and executed together
var timers={};			// Timing actions that work on a defined scene
var brands={};			// All brands of equipment that is recognized by the daemon
var handsets={};		// Handsets or transmitters of code. Action/Impuls, Klikaanklikuit supported
var energy={};			// Energy sensors and values
var settings={};		// Set debug level and backup/restore the configuration
var sensors={};
var rules={};
var users={};

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
function start_Rules()
{
  // This function first needs to be executed						
  // --------------------------------------------------------------------------
  $(window).load(function(){

	// --------------------------------------------------------------------------
	// HEADER RULES SELECTION
	// Handle the rules header selection buttons above the graph
	//
	$("#gui_header").on("click", ".hs_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
			
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		s_rule_id = id.substr(1);
			
		// if ($(this).hasClass("hover"))
		message("Selecting "+value);
		logger("Selecting "+value+", with id: "+s_rule_id,1);
		$( this ).addClass( 'hover' );
		// Make this rule active and read its representation on the screen
 
		//Before we can switch between rules, we NEED to clear the workspace
		Blockly.mainWorkspace.clear();
			
		restore_blocks();

		//alert("Id: "+id+", Value: "+value+", Class: "+$( this ).attr( "class" ));
		console.log("rules button:: selected: "+s_rule_id);
		init_rules();
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
			case "T1":						// Run just once
				eval( rules[s_rule_id].jrule );				
			break;	
			case "T2":						// Load
				//
				// Rules can be loaded directly from the rules objectate
				// Maybe use this for active rules
				rules[s_rule_id].active = (rules[s_rule_id].active=="Y"?"N":"Y");
				init_rules();
				send2daemon("dbase","store_rule", rules[s_rule_id]);
			break;
			case "T3":						// Store
				// send rules to database
				var cmd="store_rule";
				var message = rules[s_rule_id];
							// Now ask for a new for the new room
			// The for asks for 2 arguments, so maybe we need to make a change later
			// and make the function askForm more generic
			var frm='<form><fieldset>'
				+ '<p>You like to save rule ' + s_rule_id + '. Please specify name for your new room</p>'
				+ '<label for="val_1">Name: </label>'
				+ '<input type="text" name="val_1" id="val_1" value="'+rules[s_rule_id].name
				+ '" class="text ui-widget-content ui-corner-all" />'
				+ '</fieldset></form>';
				askForm(
					frm,
					// Create
					function (ret) {
						// OK Func, need to get the value of the parameters Add the device to the array
						// SO what are the variables returned by the function???
						if (debug > 2) alert(" Dialog returned Name,Type: " + ret);	
						rules[s_rule_id].name = ret[0];
						myAlert("<br>rule: "+rules[s_rule_id].name+"<br>jrule: <br>"+rules[s_rule_id].jrule
											+"<br><br>brule: <br>"+JSON.stringify(rules[s_rule_id].brule));
						send2daemon("dbase","store_rule", rules[s_rule_id]);
						init_rules();
						return(1);	//return(1);
						
					// Cancel	
  					}, function () {
							init_rules();
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Create'
				); // askForm
			break;
			case "T4":						// New ..
				// Make new rules record  ...
				s_rule_id = rules.length;
				rules.push({ descr: "", name: "new ", id: s_rule_id, jrule:{}, brule: {}});	
				send2daemon("dbase","add_rule", rules[s_rule_id]);
				Blockly.mainWorkspace.clear();
				init_rules();
				// Make blockly area clean
			break;
			case "T5":						// Delete ..
				// Delete 
				send2daemon("dbase","delete_rule", rules[s_rule_id]);
				rules.splice(s_rule_id, 1);
				if (s_rule_id>0) s_rule_id--;
			break;
			case "T6":
				console.log("rules.js:: Closing current window");
				window.history.back();
				close();
			break;
			default:
				message('init_menu:: id: ' + id + ' not a valid menu option');
				return(0);
		}
		init_rules();
		// and make a new version in the background
	}); 

	// Start the logic of this page	
	if ( jqmobile == 1 ) 
	{
		var ret = load_database("init");
		if (ret<0) {
			alert("Error:: loading database failed");
		}
		init_websockets();			// For regular web based operations we start websockets here
	}
	//
	// The solution is to start init_lamps, init_rules and init_menu 
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
		}
		init_websockets();									// For regular web based operations we start websockets here
		var ret = load_database("init");
		if (ret<0) {
			alert("Error:: loading database failed");
		}
	}							
  });
  
  console.log("Start_rules done");
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
	//cntrl = settings[1]['val'];

	mysql = settings[2]['val'];
	//persist = settings[3]['val'];
	
	logger("setting skin",1);
	if (jqmobile != 1) { 
		skin = '/'+settings[4]['val'];
		logger("init:: Skin selected: "+skin,1);
		$("link[href^='/styles']").attr("href", skin);
	}

	// Initial startup config
	init_blockly();
	init_menu();
	init_rules();

}


// ------------------------------------------------------------------------------------------
// Setup the main menu (on the right) event handling
//

function init_menu() 
{
	html_msg = '<table border="0">';
	$( "#gui_menu" ).append( html_msg );
	var table = $( "#gui_menu" ).children();		// to add to the table tree in DOM
	console.log("init_menu started");
	
	// For all menu buttons, write all to a string and print string in 1 time
	if (jqmobile == 1) {
		var but =  ''
		+ '<tr><td>'
		+ '<input type="submit" id="T1" value= "Run" class="hm_button hover">' 
		+ '<input type="submit" id="T2" value= "Activate" class="hm_button">'
		+ '<input type="submit" id="T3" value= "Store" class="hm_button">'
		+ '<input type="submit" id="T4" value= "New .." class="hm_button">'
		+ '<input type="submit" id="T5" value= "Delete .." class="hm_button">'
		+ '</td></tr>'
		;
		$(table).append(but);
	}
	else {
		var but =  ''
		+ '<tr class="switch"><td><input type="submit" id="T1" value= "Run" class="hm_button hover"></td>' 
		+ '<tr class="switch"><td><input type="submit" id="T2" value= "Activate" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T3" value= "Store" class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T4" value= "New .." class="hm_button"></td>'
		+ '<tr class="switch"><td><input type="submit" id="T5" value= "Delete .." class="hm_button"></td>'
		;

		// Do we have energy records in database.cfg?
		but += '<tr><td></td>'
		+      '<tr><td></td>'
		+ '<tr class="switch"><td><input type="submit" id="T6" value= "Go Back" class="hm_button"></td>'
		;
		$(table).append(but);
	}
	if (debug >= 2) console.log("init_menu buttons defined");
}


// -------------------------------------------------------------------------------------
// INIT SENSORS
//
function init_rules()
{
	$("#gui_header").empty( );
	html_msg = '<table border="0">';
	$("#gui_header").append( html_msg );
	
	var table = $("#gui_header").children().last();		// to add to the table tree in DOM
	var hover = "hover";
	var border="";
	logger("init_rules started",2);
	
	but = "<tr><td>";
	for (var i=0; i< rules.length; i++) {
		logger("init_rules:: rule #"+i+", "+rules[i].name+", jrule: "+rules[i].jrule,1);
		if (rules[i].active == "Y") {
			border=" border-color:red; ";
		} else {
			border=" ";
		}
		if ( s_rule_id == i ) {
			// This is the rule we are working with
			console.log("init_rules:: hover: "+rules[i]['name']+" in rules");
			hover="hover";
		} else {
			hover = "";
		}
		but +='<input type="submit" id="R'+i+'" value="'+rules[i]['name']+'" style="max-width:60px; max-height:25px;'+border+'" class="hs_button '+hover+'">';			
	}
	but += "</td></tr>";
	$(table).append(but);
}

// ----------------------------------------------------------------------------------------
// INIT_ BLOCKLY
//
function init_blockly() {

	var toolbox = '<xml>';
	//toolbox += '<xml id="toolbox" style="display: none">';
	toolbox += "<category name='controls'>";
		toolbox += '<block type="controls_if"></block>';
		toolbox += '<block type="controls_repeat_ext"></block>';
		toolbox += '<block type="controls_whileUntil"></block>';
		toolbox += '<block type="controls_when"></block>';
	toolbox += '</category>';
	
	toolbox += "<category name='logic'>";
		toolbox += '<block type="logic_compare"></block>';
		toolbox += '<block type="math_number"></block>';
		toolbox += '<block type="math_arithmetic"></block>';
	toolbox += '</category>';
	
	toolbox += "<category name='text'>";
		toolbox += '<block type="text"></block>';
		toolbox += '<block type="text_print"></block>'
		toolbox += '<block type="text_console"></block>';
		toolbox += '<block type="text_alert"></block>';
		toolbox += '<block type="text_length"></block>';
		toolbox += '<block type="text_append"></block>';
	toolbox += '</category>';
	
	toolbox += "<category name='sensors'>";
		toolbox += '<block type="sensors_alarm"></block>';
		toolbox += '<block type="sensors_temperature"></block>';
		toolbox += '<block type="sensors_humidity"></block>'; 
	toolbox += '</category>';
		
	toolbox += "<category name='devices'>";
		toolbox += '<block type="devices_switch"></block>';
		toolbox += '<block type="devices_set"></block>';
	toolbox += '</category>';
	
	toolbox += "<category name='times'>";
		toolbox += '<block type="times_now"></block>';
		toolbox += '<block type="times_sunrise"></block>';
		toolbox += '<block type="times_sunset"></block>';
		toolbox += '<block type="times_offset"></block>';
	toolbox += '</category>';

	toolbox += '</xml>';
	
	var blocklyDiv = document.getElementById('blocklyDiv');
	Blockly.JavaScript.addReservedWords('code');
	var workspace = Blockly.inject(blocklyDiv,{toolbox: toolbox })
	restore_blocks();	

	function myUpdateFunction() {
		var code = Blockly.JavaScript.workspaceToCode(workspace);
		rules[s_rule_id].jrule=code;
		document.getElementById('gui_messages').value = code;
		logger("myUpdateFunction:: Change rule_id "+s_rule_id+" to "+code,1);
		$("#gui_messages").empty();
		$("#gui_messages").append(code);
		backup_blocks();							// To rules[]
	}
	workspace.addChangeListener(myUpdateFunction);
}

// ----------------------------------------------------------------------------
// backup code blocks
//
function backup_blocks() {
	var xml = Blockly.Xml.workspaceToDom( Blockly.mainWorkspace );
	rules[s_rule_id].brule = Blockly.Xml.domToText( xml );
	logger("backup_blocks to brule: ",rules[s_rule_id].brule,2);
//	rules[s_rule_id].jrule = 
//	if(typeof(Storage)!=="undefined")
//	{
//		localStorage.setItem('blocks',Blockly.Xml.domToText( xml ));
//		console.log("backup success");
//	} else {
//		// Sorry! No web storage support..
//	}
}

// ----------------------------------------------------------------------------
// restore code blocks
// XXX Make sure that the block still exists before referencing to unknown
//	part in the localstorage
function restore_blocks() {

	logger("restore_blocks for rule_id: "+s_rule_id,2);
	logger("restore_blocks for brule: ",rules[s_rule_id].brule,2);
	if (rules[s_rule_id].brule === null) {
		logger("restore_blocks:: brule is null",1);
		return;
	}
	try {
		var xml = Blockly.Xml.textToDom(rules[s_rule_id].brule);
	}
	catch(e) {
		logger("restore_blocks:: ERROR :"+e,1);
		return;
	}
	Blockly.Xml.domToWorkspace( Blockly.mainWorkspace, xml );
	logger("restored for s_rule_id: "+s_rule_id,1);
	return;
	
//  if(typeof(Storage)!=="undefined"){
//   if(localStorage.blocks!=null){
//      var xml = Blockly.Xml.textToDom(localStorage.blocks);
//      Blockly.Xml.domToWorkspace( Blockly.mainWorkspace, xml );
//      console.log("restore success");
//    }
//  } else {
//    // Sorry! No web storage support..
//  }
}


// ----------------------------------------------------------------------------------------
//	function logger, displays a message on the standard log
//	Input Parameter is now just the text to display
//	The lvl parameter specifies the minimum debug leve necessary to log the txt
//
function logger(txt,lvl) 
{
	if (debug >=3 ) alert("Message called: "+txt+", lvl: "+lvl+", debug: "+debug);
	if (typeof lvl === 'undefined') {
		// alert("undefined");
		lvl = debug ;
	}
	if (lvl <= debug) {
		console.log(txt);	
	}
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


// ----------------------------------------------------------------------------------------
//
// localStorage does not store objects, this one does
//
Storage.prototype.setObject = function(key, value) {
	logger("setObject:: key: "+key+":"+JSON.stringify(value),2);
    this.setItem(key, JSON.stringify(value));
}

//
//
Storage.prototype.getObject = function(key) {
    var value = this.getItem(key);
	logger("getObject:: type: "+typeof(value)+", key: "+key+":"+JSON.stringify(value),2);
	if (value == null) return (null);
	try {
		var ret = JSON.parse(value);
	} catch (e) {
		// Error occurred
		logger("getObject:: Exception error JSON parse");
		return(null);
	}
    return value && JSON.parse(value);
}



// ---------------------------------------------------------------------------------------
//	Function database inits all communication with the database backend
//
//
function load_database(dbase_cmd) 
{
	logger("load_database:: Calling send2daemon with load_database, "+dbase_cmd+" , "+dbase_cmd,2);
	// Make the buffer we'll transmit. Most GUI messages are really simple
	// and be same as ICS-1000, and will not be full-blown json.
	var id;
	id = setInterval(function() {
				// Make a new connection and start registering the various actions,
				// State 0: Not ready (yet), connection to be established
				// State 1: Ready
				// State 2: Close in progress
				// State 3: Closed
			var state = w_sock.readyState;
			if (state != 1) {
					logger("load_database Websocket:: ERROR. State is: "+state,1);
					message("load_database:: Websocket:: ERROR. State is: "+state);
					//w_sock = new WebSocket(w_uri);
			}
			else {
				clearInterval(id);				// Kill this timer if state is 1 (=connected)
				message("load_database:: sending load_database request");
				send2daemon("load_database",dbase_cmd,dbase_cmd);
			}
	}, 500);		// 1/2 seconds (in millisecs)
	return(1);
}

// ---------------------------------------------------------------------------------------
// SEND2DAEMON
//
// Universal function for sending buffers to the daemon for websockets only.
// action: "gui","dbase","login", "set"
// This function is called by function message_device()
//
function send2daemon(action,cmd,message) 
{
	logger("send2daemon: action: "+action+", cmd: "+cmd,2);
	// Make the buffer we'll transmit. As you see, the message(s) are really simple
	// and be same as ICS-1000, and will not be full-blown json.
	var data = {
		tcnt: ++w_tcnt%1000+"",
		type: "raw",
		action: action,				// actually the class of the action
		cmd: cmd,					// The command for that class (gui dbase login).
		message: message			// Message contains the parameter(s) necessary
	};
	//if (debug>=1) logger("send2daemon:: jSon: "+JSON.stringify(data));
		
	// Now check the state of the socket. This could take forever, have to build a limit ...
	// In practice, this sending part will likely NOT find out that the connection is lost,
	// but the registered receiver handler (somewhere around line 1800) will.
	
	for (var i=0; i<4; i++) {				
		switch (w_sock.readyState) {
		// 0: Not yet ready, wait for connect
		case 0:
			setTimeout( function() { logger("send2daemon:: socket not ready: "+w_sock.readyState,2); }, 1000);
		break;
		// 1: socket is ready, send the data
		case 1: 
			logger("send2daemon:: sending: "+JSON.stringify(data),2);
			w_sock.send(JSON.stringify(data));
			return(0);
		break;
		// 2: close in progress
		// Must wait the disconnect out?
		case 2:
			setTimeout( function() { logger("send2daemon:: socket not ready: "+w_sock.readyState,2); }, 1000);
		break;
		// 3: closed. if closed, reopen the socket again
		case 3:
			setTimeout( function() { logger("send2daemon:: socket not ready: "+w_sock.readyState,2); }, 1000);
		break;
		default:
			logger("send2daemon:: readystate not defined: "+w_sock.readyState,1);
		}
	}// for
	logger("send2daemon:: unable to transmit message 4 times: "+w_sock.readyState,1);
	return(-1);
}

// -------------------------------------------------------------------------------------
// Dialog Box, Ask for  details as specified in function paramters
// 1. Your dialog text,including the button specification (see activate_room for a description)
// 2. The function to execute when user has provided input
// 3. The function to execute when operation is cancelled
// 4. The title of your dialog
//
// Input Values (only val_1 is required, other optional for more or less input fields
// val_1, val_2, val_3 etc 
// Return values is an array in var ret, So ret[0] may contain values just as many as val_x
//
function askForm(dialogText, okFunc, cancelFunc, dialogTitle) {
  if (jqmobile == 1) {
		$( "#header" ).empty();
		var $popUp = $("<div/>").popup({
			id: "popform",
			dismissible : false,
			theme : "b",
			overlayTheme : "a",
			title: dialogTitle || 'Confirm',
			maxWidth : "500px",
			dialogClass: 'askform',
			transition : "pop"
		}).bind("popupafterclose", function() {
			//remove the popup when closing
			$(this).remove();
		});
		$("<div/>", {
			text : dialogTitle
		}).appendTo($popUp);
		$(dialogText,{}).appendTo($popUp);
	
		// Submit Button
		$("<a>", {
			text : "Submit"
		}).buttonMarkup({
			inline : true,
			icon : "check"
		}).bind("click", function() {
			if (typeof (okFunc) == 'function') {
				// Return max of 5 results (may define more)...
				var ret = [ $("#val_1").val(), $("#val_2").val(), $("#val_3").val(), $("#val_4").val(), , $("#val_5").val() ];
				setTimeout(function(){ okFunc(ret) }, 50);
			}
			if (debug>=2) alert("Submit");
			$popUp.popup("close");
			//that.subscribeToAsset(callback);
		}).appendTo($popUp);

		// Back button
		$("<a>", {
			text : "CANCEL",
			"data-jqm-rel" : "back"
		}).buttonMarkup({
			inline : true,
			icon : "back"
		}).bind("click", function() {
			if (typeof (cancelFunc) == 'function') {
				setTimeout(cancelFunc, 50);
			}
			$popUp.popup("close");
			if (debug>1) alert("cancel");
			//that.subscribeToAsset(callback);
		}).appendTo($popUp);
		$popUp.popup("open");
	}
  
  // jQuery UI style of dialog
  
	else {
		$('<div style="padding: 10px; max-width: 500px; word-wrap: break-word;">'+dialogText+'</div>').dialog({
			draggable: false,
			modal: true,
			resizable: false,
			width: 'auto',
			title: dialogTitle || 'Confirm',
			minHeight: 120,
			dialogClass: 'askform',
			buttons: {
				OK: function () {
					//var bValid = true;
	//				bValid = bValid && checkLength( name, "name", 3, 16 );
        			if (typeof (okFunc) == 'function') {
						// Return max of 5 results (may define more)...
						var ret = [ $("#val_1").val(), $("#val_2").val(), $("#val_3").val(), $("#val_4").val(), $("#val_5").val() ];
						setTimeout(function(){ okFunc(ret) }, 50);
					}
					$(this).dialog('destroy');
				},
				Cancel: function () {
					if (typeof (cancelFunc) == 'function') {
						setTimeout(cancelFunc, 50);
        			}
					$(this).dialog('destroy');
				}
			},
			close: function() {
				$(this).dialog('destroy');
			}
		});
		// logger(" name: "+name.val);
	}
} // askForm end


function init_websockets() {
	// ** These are the handlers for websocket communication.
	// ** We only use either websockets or regular/normal sockets called by .ajax/php handlers
	// ** User can specify/force bahaviour by setting a variable
	//
		// Make a new connection and start registering the various actions,
		// State 0: Not ready
		// State 1: Ready
		// State 2: Close in progress
		// State 3: Closed
	// Apparently, after closing the socket will reopen automatically (in a while)
	//
		var urlParts = w_url.split(':');					// remove the calling port number
		logger("init_websockets:: Splitting url and port: "+urlParts[0],1);
		w_uri = "ws://"+urlParts[0]+":"+w_port;				// and add the port number of server
		logger("init_websockets:: new WebSocket w_uri: "+w_uri,1);
		w_sock = new WebSocket(w_uri);						// Create a socket for server communication
		
		w_sock.onopen = function(ev) { 						// connection is open 
			logger("Websocket:: Opening socket "+w_uri,1);	// notify user
			message("websocket reopen",1);
		};
		w_sock.onclose	= function(ev){
			logger("Websocket:: socket closed "+w_uri+", code: "+ev.code,1);
			message('<DIV style="textdecoration: blink; background-color:yellow; color:black;">Restarting the Websocket. Please wait ...</DIV>');
			setTimeout( function() { message(''); }, 500);

			// w_sock.close();
			//message("",0);
			setTimeout( function() { init_websockets(); }, 1000);
			logger("Websocket:: socket re-opened: "+w_sock.readyState);
		};
		w_sock.onerror	= function(ev){
			var state = w_sock.readyState;
			logger("Websocket:: error. State is: "+state);
			// message("websocket:: error: "+state,1);
		};
		
		// This is one of the most important functions of this program: It receives asynchronous
		// messages from the daemon and needs to process them for the GUI.
		// ALL(!) Messages are in json format, but type field defines whether the content is also
		// in json or in ICS format (for historical and backward compatibility reasons).
		// 
		// As all messages are received async, we need to "forward" or temporarily store info
	  	// before it is being handled by the client. The easy way: store in a var and depending on 
		// the current open screen in the client decide what to do...
		//
		w_sock.onmessage = function(ev) 
		{
			if (healthcount < 10) healthcount++;// Make the health indicator greener
			if (debug >= 2) { logger("Websocket:: message received: "); console.log(ev.data); }
			var rcv = JSON.parse(ev.data);		//PHP sends Json data
			logger("Websocket:: message rcv: "+rcv.action,2); 
			if (debug >= 2) console.log(rcv); 
			// First level of the json message is equal for all
			var tcnt   = rcv.tcnt; 				// message transaction counter
			var type   = rcv.type;				// type of content part, either raw or json
			var action = rcv.action; 			// message text: handset || sensor || gui || weather || energy
												// || login || console || alert || alarm
			// Now we need to parse the message and take action.
			// Best is to build a separate parse function for messages
			// and route them to the approtiate screen
			switch (action) 
			{	
				// ack messages ae just confirmations and may be further discarded
				case "ack":
					if (debug>=3) {
						message("action: "+action+", tcnt: "+tcnt+", mes: "+msg+", type: "+type,3);
					}
					else {
						logger("action: "+action+", tcnt: "+tcnt+", mes: "+msg+", type: "+type,2);
					}
				break;
				// The daemon wants to display something on the message area, or if the debug level
				// is high enough will display through an alert.
				case "alert":
					myAlert("Server msg:: "+rcv.message);
				break;
				// Display the alarm, or take other action
				case "alarm":
					myAlert("Server msg:: "+rcv.message);
				break;
				// Update messages can contain updates of devices, scenes, timers or settings.
				// And this is list is sorted on urgency as well. changes in device values need to be
				// reflected on the dashboard immediately.
				// Changes in settings are less urgent and frequent
				case "upd":
				case "gui":
					logger("gui message received",2);
				break;
				case 'sensor':
					logger("Lampi.js:: received sensor message",2);
				break;
				// Support for energy systems is tbd
				case 'energy':
					logger("Energy message, kw_act_use: "+rcv.kw_act_use,2);
				break;
				//
				// Console functions; messages that relate to the console option in the config section
				case 'console':
					logger("console message received"+rcv.message,2);
					myAlert("Console Message :<br>"+rcv.message,rcv.request+" Output");
				break;
				// List all users and "jump" (back) to the setting page
				case 'list_user':
					logger("list_user message received",1);
					users = rcv.message;
					activate_setting("2b");						// XXX Hardcoded setting!
				break;
				// The login message coming from the server tells us whether the user credentials
				// are sufficient. If so, the level of trust is reported.
				case 'login':
					var uname;
					var pword;
					if (loginprocess) break;								// We do not want more than one menu displayed
					loginprocess=true;
					
					if(typeof(Storage)!=="undefined") {
  						// Code for localStorage/sessionStorage.
						uname= localStorage.getItem('uname');				// username
						pword= localStorage.getItem('pword');				// pin
						if (debug>=1) {
							logger("Support for localstorage, uname: "+uname);
						}
						if (uname === null) uname = "";
						if (pword === null) pword = "";
 					}
					else {
  						// Sorry! No Web Storage support..
						logger("No local storage in browser",1);
						message("No local storage in browser");
						uname="login";
						pword="****";
 					}//storage
					
					//var saddr= window.localStorage.getItem("saddr");		// Server address
					if (rcv.message !== undefined)
						logger("Lampi.js:: received login request, message"+rcv.message,1);
					else { logger("Lampi.js:: received login request",1); 
						rcv.message = "Please logon ";
					}
					
					askForm('<form id="addRoomForm"><fieldset>'		
					+ '<p>Since your computer <'+rcv.address+'> might be outside our network, we ask '
					+ 'you to logon to the system and prove your identity <br><br>'
					+ rcv.message+'</p>'
					+ '<label for="val_1">Login: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="'+uname+'" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					+ '<label for="val_2">Password: </label>'
					+ '<input type="text" name="val_2" id="val_2" value="'+pword+'" class="text ui-widget-content ui-corner-all" />'
					+ '</fieldset></form>'
					// Create
					,function (ret) {
						// OK Func, need to get the value of the parameters
						// Add the device to the array
						// SO what are the variables returned by the function???
						if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);	
						
						// All OK? 
						var login_msg = {
							tcnt: ++w_tcnt%1000,
							type: 'raw',
							action: 'login',
							login:  ret[0],
							password:  ret[1]
						}
						w_sock.send(JSON.stringify(login_msg));
						
						logger(login_msg);
						if(typeof(Storage)!=="undefined")
  						{
  							// Code for localStorage/sessionStorage.
  							localStorage.setItem('uname',ret[0]);
							localStorage.setItem('pword',ret[1]);
							logger("localstorage:: uname: "+ret[0]);
 						}				
						// Send the password back to the daemon
						// message("Login and Password sent to server",1);
						if (debug >= 2) myAlert("Submit login: "+ret[0]+", password: "+ret[1]);
						loginprocess=false;
						logger("s_screen is: "+s_screen,1);
						return(1);								//return(1);
						
						// Cancel	
  					}, function () {
						if (debug >= 2) myAlert("Submit login Cancelled");
						loginprocess=false;
						return(0); 								// Avoid further actions for these radio buttons 
  					},
  					'Confirm Login'
					); // askFor
				break;
				case 'load_database':
					logger("Receiving load_database message",2);
					lroot = rcv.response;
					rooms = rcv.response['rooms'];			// Array of rooms
					devices = rcv.response['devices'];		// Array of devices			
					scenes = rcv.response['scenes'];
					timers = rcv.response['timers'];
					handsets = rcv.response['handsets'];
					settings = rcv.response['settings'];
					sensors = rcv.response['sensors'];
					brands = rcv.response['brands'];
					rules = rcv.response['rules'];
					//energy = rcv.response['energy'];
					
					init();									// XXX init must be here before localstorage to work

					message("database received: #rooms: "+rooms.length+", #devices:"+devices.length);
				break;
				case 'upd_config':						// Update the configuration with new data, might be partial tree
					logger("rcv:: upd_config message received",1);
					Object.keys(rcv.message).forEach(function(key) {
						lroot[key]=rcv.message[key];		// Replace this set of values
						switch (key) {
							case 'rooms':	settings = rcv.message[key]; break;
							case 'devices':	devices = rcv.message[key]; break;
							case 'scenes':	scenes = rcv.message[key]; break;
							case 'timers':	timers = rcv.message[key]; break;
							case 'handsets':	handsets = rcv.message[key]; break;
							case 'brands':	brands = rcv.message[key]; break;
							case 'settings': settings = rcv.message[key]; break;
							case 'rules': rules = rcv.message[key]; break;
							default:
								myAlert("rcv upd_config:: received unknown message key: "+key);
							break;
						}
					})
					activate(s_screen);
				break;
				default:
					message("Unknown message: action: "+action+", tcnt: "+tcnt+", mes: "+msg+", type: "+type);
			}
			//return(0);
		};// on-message
		
		logger("Websocket:: readyState: "+w_sock.readyState,1);	
}//function init_websockets

// ----------------------------------------------------------------------------
// Alert Box
// Difference from alert() is that this does not stop program execution of other
// threads. Also, breaks in lines not with \n but with </br>
//
function myAlert(msg, title) {

  $('<div style="padding:10px; min-width:350px; max-width:800px; min-height:400px; max-height:500px; overflow:scroll; word-wrap:break-word;">'+msg+'</div>').dialog({
    draggable: false,
    modal: true,
    resizable: false,
    width: 'auto',
    title: title || 'Confirm',
    minHeight: 75,
	dialogClass: 'askform',
    buttons: {
      OK: function () {
        //if (typeof (okFunc) == 'function') {
         // setTimeout(okFunc, 1);
        //}
        $(this).dialog('destroy');
      }
    }
  });
}
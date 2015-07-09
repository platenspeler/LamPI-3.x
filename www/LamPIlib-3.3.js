// ========================================================================================
// This "library File" does dontain the socket communication which should
// be the same across all LamPI related programs suchs as sensor and energy charts 
// and the rules editor.
// Please note that not all functions are used in every sub page, so be careful with
// function and variable references
// ========================================================================================
// 
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg 2014-2015, all rights reserved
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

// ----------------------------------------------------------------------------------------
// VARIABLES
//
var use_energy = 0;						// Initialize the value on 0
var loginprocess=false;					// Is there a login process going on?
		



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
//	The lvl parameter specifies the minimum debug leve necessary to log the txt
//	XXX The tim parameter specifies how long the message should be displayed (net yet used) 
//
function message(txt,lvl,tim) 
{
	if (debug >2 ) alert("Message called: "+txt+", lvl: "+lvl+", debug: "+debug);
	if (typeof lvl === 'undefined') {
		// alert("undefined");
		lvl = debug ;
	}
	if (lvl <= debug) {
		$( "#gui_messages" ).empty("")
		txt = '<div id="comment">' + txt + '</div>'
		$( "#gui_messages" ).append( txt );	
	}
	return(0);
}

function isFunction(possibleFunction) {
  return typeof(possibleFunction) === typeof(Function);
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

// ----------------------------------------------------------------------------------------
// TIME
//	Get the time
//
function getTime() {
  var date = new Date();
  return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2);
}

//
// Read Integers from a string
// 
function parse_int(s) {
	return(s.match(/\d+\.?\d*/g));					// returns array with values
}

//
// Read First integer value from a string
//
function read_int(s) {								// Read only first in in string
	var ret = s.match(/\d+\.?\d*/g);
	return (ret[0]);
}

// ----------------------------------------------------------------------------------------
// DEVICES
// Find the device in the devices array and return the array index
// based on the id as used in the GUI
//
function find_device(rm_id, dev_id) {
	for (var j = 0; j<devices.length; j++ ) {
  		var device_id = devices[j]['id'];
		var room_id = devices[j]['room'];
       	if (( room_id == rm_id ) && ( device_id == dev_id )) {
			return(j);
		}
	}
	return(-1);		
}

// Find the uaddr addr which is used on a physical level
//
function lookup_uaddr(rm_id, dev_id) {
	for (var j = 0; j<devices.length; j++ ) {
  		var device_id = devices[j]['uaddr'];
		var room_id = devices[j]['room'];	
       	if (( room_id == rm_id ) && ( device_id == dev_id )) {
			return(j);
		}
	}
	logger("lookp_uaddr:: No index in devices found for room: "+rm_id+", dev id: "+dev_id,1);
	return(-1);		
}

// -------------------------------------------------------------------------------
// Helper function for askForm
//
function checkLength( o, n, min, max ) {
	if ( o.val().length > max || o.val().length < min ) {
		o.addClass( "ui-state-error" );
		updateTips( "Length of " + n + " must be between " +
		min + " and " + max + "." );
		return false;
	} else {
		return true;
	}
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




// ----------------------------------------------------------------------------------------
//	INIT WEBSOCKETS communication
//	Especially the handlers for websockets etc, that need to test the state of the connection
//	
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
	logger("init_websockets:: Splitting url and port: "+urlParts[0],2);
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
		var rcv = JSON.parse(ev.data);		//PHP sends Json data
		logger("Websocket:: message rcv: "+rcv.action,2); 
		if (debug >= 2) console.log(rcv); 
		// First level of the json message is equal for all
		var tcnt   = rcv.tcnt; 				// message transaction counter
		var type   = rcv.type;				// type of content part, either raw or json
		var action = rcv.action; 			// message text: handset || sensor || gui || sensors || energy
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
			// ALARM ALARM ALARM
			// Display the alarm, or take other action
			case "alarm":
				myAlert("Server msg:: "+rcv.message);
				// also .scene would be possible for a scene to start when the alarm is in effect
			break;
			// Update messages can contain updates of devices, scenes, timers or settings.
			// And this is list is sorted on urgency as well. changes in device values need to be
			// reflected on the dashboard immediately.
			// Changes in settings are less urgent and frequent
			case "upd":
			case "gui":
				var msg   = rcv.message;
				// if content is coded in json, decode rest of message
				switch (type) {
					case 'json': 
						logger("onmessage:: read upd message. Type is: "+type+". Json is not supported yet",1);
						var room   = rcv.room;
						var gaddr  = rcv.gaddr;				// Group address of the receiver
						var uaddr  = rcv.uaddr;				// Unit address of the receiver device
						var val    = rcv.val;
						var brand  = rcv.brand;				// Brand of the receiver device
						var ind = lookup_uaddr(room, uaddr);
						devices[ind]['val']=val;
						if ((room == s_room_id) && (s_screen == 'room')) {
							activate_room(s_room_id);
						}
					break;
					case 'raw':
						var msg    = rcv.message;		// The message in ICS format e.g. "!RxDyFz"
						logger("onmessage:: read upd message. Type is: "+type,1);
						var pars = parse_int(msg);	// Split into array of integers
													// This function works for normal switches AND dimmers
													// Only for dimmers string is longer !RxxDxxFdPxx
						// As we receive updates for devices
						if ( msg.substr(0,2) == "!R" ) {
							var room = pars[0];
							var uaddr = pars[1];
							// find the correct device index based on the unit address
							var ind = lookup_uaddr(room, uaddr); 
							// Now we need to check if it's a dim or F1 command. If dim
							// we need not use value 1 but last used value in devices!
							// XXX
							var val;
							if (msg.search("FdP") > -1) {
								val = pars[2];
							}
							else {
								val = pars[2];
							}
							logger("onmessage:: room: "+room+", device: "+uaddr+", val: "+val+", ind: "+ind,2);
							devices[ind]['val']=val;
							if ((room == s_room_id) && (s_screen == 'room')) {
								activate_room(s_room_id);
							}
						}//if
					break;
					default: 
						logger("onmessage:: read upd message. Unknown type: "+type,1);
				}
				// After updating the switch or the slider in the content area
				// Now print more information in the message area for the user
				if (debug == 0) {
					// For debug equal to 0, print human readable message
					message("Update: "+devices[ind]['name']+" to value: "+val,0);
				}
				else {
					// For debug type of messages, print devices codes etc
					message("action: "+action+", tcnt: "+tcnt+", mes: "+msg+", type: "+type,1);
				}
			break;
			// If we receive a sensors message, we scan the incoming message based
			// on the addr/channel combination and look those up in the sensors array.
			// If the sensors station is not present in the array, we will not show its values !!!
			// The sensors stations that we allow for receiving are specified in the 
			// database.cfg file (and in the database).
			case 'weather':	
				alert("UNEXPECTED WEATHER MESSAGE RECEIVED");
				var j;
				// Compare address and channel to identify a weather sensor
				// Decided not to use the name for this :-)
				for (j = 0; j<weather.length; j++ ) {
       				if (( weather[j]['address'] == rcv.address ) &&
						( weather[j]['channel'] == rcv.channel )) {
						// return value of the object
						break;
					}
				}
				// if we found a match, j will be smaller than length of array
				// So we have the record that partly describes the current sensor
				// and partly needs to be filled with the latest sensor values received.
				if (j<weather.length) {
						weather[j]['temperature']	=rcv.temperature;
						weather[j]['humidity']		=rcv.humidity;
						weather[j]['airpressure']	=rcv.airpressure;
						weather[j]['windspeed']		=rcv.windspeed;
						weather[j]['winddirection']	=rcv.winddirection;
						weather[j]['rainfall']		=rcv.rainfall;
						var msg="";
						if (debug >=2)
						{
							msg += "Weather "+weather[j]['name']+"@ "+weather[j]['location'];
							msg += ": temp: "+weather[j]['temperature'];
							msg += ", humi: "+weather[j]['humidity']+"%<br\>";
							
							logger("Weather "+weather[j]['name']+"@"+weather[j]['location']
								+": temp: "+weather[j]['temperature']
								+", humi: "+weather[j]['humidity']+"%");
						}
						message(msg);
				}
			break;
			// Generic sensor messages, such as connected one wire systems to the RasPI
			// At the moment most wire sensors are in fact further treated as sensors sensors.
			case 'sensor':
				logger("Sensor message from "+rcv.address+":"+rcv.channel,1);
				var j;
				// Compare address and channel to identify a sensors sensor
				// Decided not to use the name for this :-)
				for (j = 0; j<sensors.length; j++ ) {
       				if (( sensors[j]['address'] == rcv.address ) &&
						( sensors[j]['channel'] == rcv.channel )) {
						break;// return value of the object
					}
				}
				// if we found a match, j will be smaller than length of array
				if (j<sensors.length) {
					if (rcv.hasOwnProperty('temperature')) sensors[j]['sensor']['temperature']['val']=rcv.temperature;
					if (rcv.hasOwnProperty('humidity')) sensors[j]['sensor']['humidity']['val']		 =rcv.humidity;
					if (rcv.hasOwnProperty('airpressure')) sensors[j]['sensor']['airpressure']['val']=rcv.airpressure;
					if (rcv.hasOwnProperty('windspeed')) sensors[j]['sensor']['windspeed']['val']=rcv.windspeed;
					if (rcv.hasOwnProperty('winddirection')) sensors[j]['sensor']['winddirection']['val']=rcv.winddirection;
					if (rcv.hasOwnProperty('rainfall')) sensors[j]['sensor']['railfall']['val']=rcv.railfall;
						
					//sensors[j]['winddirection']	=rcv.winddirection;
					//sensors[j]['rainfall']		=rcv.rainfall;
						
					var msg="";
					if (debug >=2) {
						msg += "Sensor "+sensors[j]['name']+"@ "+sensors[j]['location'];
						msg += ": temp: "+sensors[j]['temperature'];
						msg += ", humi: "+sensors[j]['humidity']+"%<br\>";
						
						logger("Sensor "+sensors[j]['name']+"@"+sensors[j]['location']
							+": temp: "+sensors[j]['temperature']
							+", humi: "+sensors[j]['humidity']+"%");
					}
					message(msg);
				}
			break;
			// Support for energy systems is tbd
			case 'energy':
				if (!use_energy) { use_energy = true; init_menu(s_setting_id); }
				logger("Energy message, kw_act_use: "+rcv.kw_act_use,1);
				energy['kw_hi_use']	=rcv.kw_hi_use;
				energy['kw_lo_use']	=rcv.kw_lo_use;
				energy['kw_hi_ret']	=rcv.kw_hi_ret;
				energy['kw_lo_ret']	=rcv.kw_lo_ret;
				energy['gas_use']	=rcv.gas_use;
				energy['kw_act_use']=rcv.kw_act_use;
				energy['kw_act_ret']=rcv.kw_act_ret;
				energy['kw_ph1_use']=rcv.kw_ph1_use;
				energy['kw_ph2_use']=rcv.kw_ph2_use;
				energy['kw_ph3_use']=rcv.kw_ph3_use;
			break;
			//
			// Console functions; messages that relate to the console option in the config section
			case 'console':
					logger("console message received"+rcv.message,2);
					myAlert("<br>"+rcv.message,rcv.request+" Output");
			break;
			// Function graph only can be called by sensor.js or energy.js but just in case
			// Both functions must use the same interface and parameters!
			case 'graph':
				logger("rcv:: graph response received, ",1);
				if (typeof display_graph == 'function') display_graph(rcv.gtype, rcv.gperiod);
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
					loger("No local storage in browser",1);
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
						// SO what are the variables returned by the function?
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
						return(1);									//return(1);
						
						// Cancel	
  					}, function () {
						if (debug >= 2) myAlert("Submit login Cancelled");
						loginprocess=false;
						return(0); 									// Avoid further actions for these radio buttons 
  					},
  					'Confirm Login'
				); // askFor
			break;
			case 'load_database':
				logger("Receiving load_database message",2);
				
				rooms = rcv.response['rooms'];			// Array of rooms
				devices = rcv.response['devices'];		// Array of devices			
				scenes = rcv.response['scenes'];
				timers = rcv.response['timers'];
				handsets = rcv.response['handsets'];
				settings = rcv.response['settings'];
				brands = rcv.response['brands'];
				weather = rcv.response['sensors'];		// XXX MGW we want the id and name values
				//energy = rcv.response['energy'];
				sensors = rcv.response['sensors'];
				rules = rcv.response['rules'];
				
				init();									// init must be here before localstorage to work
					
				// If there is local storage, fill it with the received values
				if (typeof(Storage) !== undefined) {
					localStorage.setObject('rooms',rooms);
					localStorage.setObject('devices',devices);
					localStorage.setObject('scenes',scenes);
					localStorage.setObject('timers',timers);
					localStorage.setObject('handsets',handsets);
					localStorage.setObject('settings',settings);
					localStorage.setObject('brands',brands);
					localStorage.setObject('sensors',sensors);
				}
				message("database received: #rooms: "+rooms.length+", #devices:"+devices.length);

			break;
			case 'upd_config':							// Update the configuration with new data, might be partial tree
				logger("rcv:: upd_config message received",1);
				Object.keys(rcv.message).forEach(function(key) {
					lroot[key]=rcv.message[key];		// Replace this set of values
					switch (key) {
						case 'rooms':	settings = rcv.message[key]; break;
						case 'devices':	devices = rcv.message[key]; break;
						case 'scenes':	scenes = rcv.message[key]; break;
						case 'timers':	timers = rcv.message[key]; break;
						case 'handsets':	handsets = rcv.message[key]; break;
						case 'sensors':	sensors = rcv.message[key]; break;
						case 'brands':	brands = rcv.message[key]; break;
						case 'settings': settings = rcv.message[key]; break;
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

// ---------------------------------------------------------------------------------------
//	Function database inits all communication with the database backend
//
//  This is the only AJAX function in the file that is sort of synchronous.
//	This because we need the values before we can setup rooms, devices, debug etc settings
//
//  This function is available as AJAX function and support for websockets is in beta.
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

	
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
var loginprocess=false;									// Is there a login process going on?

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
					+ '<p>You like to save rule ' + s_rule_id + '. Please specify name for your this rule</p>'
					+ '<label for="val_1">Name: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="'+rules[s_rule_id].name
					+ '" class="text ui-widget-content ui-corner-all" />'
					+ '</fieldset></form>';
				askForm(
					frm,
					function (ret) {
						rules[s_rule_id].name = ret[0];	// Name of the rule (XXX any criteria?)
						if (debug>=2) 
							myAlert('rule:: <pre><code>'+JSON.stringify(rules[s_rule_id].jrule,null,2)+'</code></pre>');
						send2daemon("dbase","store_rule", rules[s_rule_id]);
						init_rules();
						return(1);	//return(1);
						
					// Cancel	
  					}, function () {
							init_rules();
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Save Rule'
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
	$( "#gui_menu" ).empty();
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
		toolbox += '<block type="controls_stoprule"></block>';
		toolbox += '<block type="controls_timeout"></block>';
	toolbox += '</category>';
	
	toolbox += "<category name='logic'>";
		toolbox += '<block type="logic_compare"></block>';
		toolbox += '<block type="math_arithmetic"></block>';
		toolbox += '<block type="math_number"></block>';
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
		toolbox += '<block type="sensors_temperature"></block>';
		toolbox += '<block type="sensors_humidity"></block>'; 
	toolbox += '</category>';
		
	toolbox += "<category name='devices'>";
		toolbox += '<block type="devices_switch"></block>';
		toolbox += '<block type="devices_dimmer"></block>';
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
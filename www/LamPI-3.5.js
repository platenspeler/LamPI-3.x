// LamPI, Javascript/jQuery GUI for controlling 434MHz devices (e.g. klikaanklikuit, action, alecto)
// Author: M. Westenberg (mw12554 @ hotmail.com)
// (c) M. Westenberg 2014-2015, all rights reserved
//
// This is the code to animate the front-end of the application. 
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
// WebSocket definitions
//
var w_url = location.host; 								// URL of webserver
var w_svr = 'LamPI-node.js';							// webserver filename
var w_port = '5000'; 									// port, should make this one dynamic!
var w_uri;
var w_sock;												// Socket variable
var w_tcnt = 0;											// Transaction counter

// ----------------------------------------------------------------------------
// Mobile settings, used for Android or other jQueryMobile device
// The three settings below determine what GUI libraries to use
// and how to communicate with the daemon.
//
var jqmobile=0;											// This specifies what jQuery library file be used
var murl='/';											// For Phonegap and Ajax usage, build a url. DO NOT CHANGE!

// ----------------------------------------------------------------------------
// 
var skin = "";											// settings[4]['val'] or localStorage get ('skin')
var debug = "1";										// debug level. Higher values >0 means more debug
var alarmStatus = "2";									// Set default to relaxed



// ---------------------------------------------------------------------------------
//	This function waits until the document DOM is ready and then 
//	it listens for an event where the user presses a button.
//	Buttons are defined in separate functions based on their location in the document.
//	This function references by id, so that when we change the label code keeps working
//
function start_LAMP(){
//	
// What to do on reload or user closing page
	$(window).on('beforeunload', function(){
		logger("beforeunload closing the socket");
    	w_sock.close();
	});

//  $(document).ready(function(){
// This function loads first before anything else. All definitions and actions
// in this function will be finished before the page is officially considered to be loaded.
//
  $(window).load(function(){

	// One of the difficult things here is the load_database function.
	// Several global variables such as devices and rooms are sized based on the data returned 
	// by the async AJAX call. As a result, you cannot!!!! rely on variables values as these functions 
	// may refer to these variables before load_database is finished.
	
	function onLine() {
		alert("onLine");
		//document.addEventListener("online", onLinePopup, false);
	}
	
	function onDeviceReady() {
		alert("onDeviceReady");
		//document.addEventListener("online", onLine, false);
	}
	
	// These functions need to be defined only once, and will from that moment on be 
	// available once their conditions (mostly on click) are met
	// Some callback functions are still present in the activate_xxxxx functions,
	// such as sorting etc. but these can be moved over to this $(window).load() function later

// --------------------------------------------------------------------------
//
// Handle the Header Room (HR) selection buttons (which room)
//
	$("#gui_header").on("click", ".hr_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
						
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			$( '.hr_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			activate_room(id);
	}); 

// --------------------------------------------------------------------------
//	
// Handle Command Room (CR) buttons (new, delete)
//
	$("#gui_header").on("click", ".cr_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.cr_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			
		switch (id )
		{
		case "Add":											// Need to change to add a new room
			var ret;
			var new_room_id;
			var ind = 1;
				
			// Search for a roomid that is unused between 2 existing rooms
			// Look for matching indexes. This is a time-exhausting operation, but only when adding a device
			while (ind <= max_rooms) { 
				for (var i=0; i< rooms.length; i++) {
					if ( ( rooms[i]['id'] == ind )) {		// We found this index is used!
						break; 								// exit for loop
					}
				}
				// If we are here, then we did not find device with id == "D"+ind
				// So the ind is unused, we use it
				if (i == rooms.length){		
					break; // while
				}
				ind++;
			}
			// Now we have an index either empty slot in between room records, or append the current array
			if ( ind > max_rooms ) {
				alert("Unable to add more rooms");
				return(-1);
			}
			if (debug > 2) alert("Add Room: New index found: " + ind);
	
			// Now ask for a new for the new room
			// The for asks for 2 arguments, so maybe we need to make a change later
			// and make the function askForm more generic
			var frm='<form><fieldset>'
				+ '<p>You have created room nr ' + ind + '. Please specify name for your new room</p>'
				+ '<label for="val_1">Name: </label>'
				+ '<input type="text" name="val_1" id="val_1" value="" class="text ui-widget-content ui-corner-all" />'
				+ '</fieldset></form>';
			askForm(
					frm,
					// Create
					function (ret) {
						// OK Func, need to get the value of the parameters
						if (debug > 2) alert(" Dialog returned Name,Type: " + ret);	
						var newroom = {
							id: ind,
							name: ret[0]
						}
						rooms.push(newroom);			// Add record newdev to devices array
						s_room_id = ind;				// Make the new room the current room
						
						send2daemon("dbase","add_room", newroom);
						// And add the line to the #gui_devices section, go to the new room
						// activate_room(new_room_id);
						// XXX Better would be just to add one more button and activate it in #gui_header !!
						init_rooms("init");
						return(1);
					// Cancel	
  					}, function () {
						activate_room(s_room_id);
						return(1);
  					},
  					'Confirm Create'
			); // askForm
		break;
			
		// DELETE a room
		case "Del":
				var list = [];
				var str = '<label for="val_1">Delete Room: </label>'
						+ '<select id="val_1" value="val_1" >' ;   // onchange="choice()"
					
				// Allow selection, but first let the user make a choice
				for (i=0; i< rooms.length; i++) {
					str += '<option>' + rooms[i]["name"] + '</option>';
				}
				str += '</select>';
				
				// The form returns 2 arguments, we only need the 1st one now
				var frm='<form><fieldset>'
					+ '<br />You are planning to delete a room from the system. If you do so, all actions '
					+ 'associated with the room must be deleted too.\n'
					+ 'Please start with selecting a room from the list on top of the screen.'
					+ 'Please click on the room you wish to delete from the system.<br /><br />'
					+ str
					+ '<br />'
					+ '</fieldset></form>';
				askForm(
					frm,
					// Create
					function (ret) {							// ret value is an array of return values
						// OK Func, need to get the value of the parameters
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);		
						var rname = ret[0];
						
						for (var i=0; i< rooms.length; i++) {
								if (rooms[i]['name'] == rname) {
									break;
								}
						}
						// Is the room empty?
						var room_id = rooms[i]['id'];
						for (var j=0; j< devices.length; j++) {
							if ( devices[j]['room'] == room_id ) {
								alert("Room " + rname + " is not empty\nWe cannot delete this room\nSorry");
								return(0);
							}
						}
						// Remove the room from the array. removed is array of removed array elements
						var removed = rooms.splice(i ,1);		
						// If we deleted the current room, maake the current room the first room in array
						if (s_room_id == room_id) s_room_id = rooms[0]['id'];
						
						logger(removed[0],2);
						// Remove the room from MySQL
						send2daemon("dbase","delete_room", removed[0]);
						if (debug>=2)
							alert("Removed from dbase:: id: " + removed[0]['id'] + " , name: " + removed[0]['name']);
						// 
						init_rooms("init");						// As we do not know which room will be first now
						return(1);	//return(1);
						
					// Cancel	
  					}, function () {
							activate_room(s_room_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Delete Room'
				); // askForm
				// Popup: Are you sure? If Yes: delete row
				// Are we sure that all devices in the room are deleted as well?
		break;
		case "Help":
			helpForm('Room',"This form allows you to control the lighting in a particular room. " 
				+ "Select the room that you like to control with the buttons in the top header area. " 
				+ "For every device in the room, whether dimmer or switch, users can change the light "
				+ "setting.\n"
				+ "The small buttons in the top right corner are special buttons. "
				+ "The leftmost green one allows you to add a device to the active room.\n"
				+ "The red X allows you to delete a device from the room. Press the X and you'll see "
				+ "small selection buttons on the left of every device line. Press one and you'll "
				+ "be able to delete the device.\n"
			);
			$( '.cr_button' ).removeClass( 'hover' );
		break;
		}
		$( this ).removeClass ( 'hover' );
	});

// --------------------------------------------------------------------------------
// SCENE	
// *** Handle the Header Scene buttons
//
	$("#gui_header").on("click", ".hs_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.hs_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		activate_scene(id);
	}); 

// -----------------------------------------------------------------------------
// SCENE
//	*** Handle the Command Scene (CS) buttons (add, delete, help)
//
	$("#gui_header").on("click", ".cs_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.cs_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		switch (id)
		{	// Add a new scene. So we have to record a sequence
			case "Add":
				// Search for a scene id that is unused between 2 existing scenes
				var ind = 1;
				while (ind <= max_scenes) { 
					for (var i=0; i< scenes.length; i++) {
						if ( ( scenes[i]['id'] == ind )) {
						// We found this index is used!
							break; // for
						} // if
					} // for
					// If we are here, then we did not find scnene id equal to ind 
					// So the ind is unused, we use it
					if (i == scenes.length){
						break; // break the while
					}
					ind++;
				}//while
				// Now we have an index either empty slot in between scene records, or append the current array
				if ( ind > max_scenes ) {
					alert("Unable to add more scenes");
					return(-1);
				}
					
				// Now ask for a name for the new scene
				var frm='<form><fieldset>'
					+ '<p>You have created scene nr ' + ind + '. Please specify name for your new scene</p>' 
					//+ '<p>You have created a new scene. Please specify name for your new scene</p>'
					+ '<label for="val_1">Name: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					+ '</fieldset></form>';
				askForm(
					frm,
					// Create
					function (ret) {
						// OK Func, need to get the value of the parameters
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);		
						var newscene = { id: ind, name: ret[0], type: "scene", val: "0", seq: "" };
						scenes.push(newscene);			// Add record newdev to devices array
						send2daemon("dbase","add_scene", newscene);
						// And add the line to the #gui_devices section, Go to the new scene
						s_scene_id = ind;
						init_scenes("init");
						return(1);	//return(1);
					// Cancel	
  					}, function () {
						activate_scene (s_scene_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Create'
				); // askForm	
			break;
				
			// Remove the current scene. Means: Remove from the scenes array, and reshuffle the array. 
			// What it means for SQL need to sort out later .....
			case "Del":
				
				var list = [];
				var str = '<label for="val_1">Delete Scene: </label>'
						+ '<select id="val_1" value="val_1" >' ;   // onchange="choice()"	
				// Allow selection, but first let the user make a choice
				for (i=0; i< scenes.length; i++) {
					str += '<option>' + scenes[i]["name"] + '</option>';
				}
				str += '</select>';
				
				// The form returns 2 arguments, we only need the 1st one now
				var frm='<form><fieldset><br>'
					+  'You are planning to delete a scene from the system. If you do so, all actions '
					+ 'associated with the scene must be deleted too.\n'
					+ 'Please start with selecting a scene from the list.<br /><br />'
					+ str
					+ '<br></fieldset></form>';
				askForm(
					frm,
					// Create
					function (ret) {							// ret value is an array of return values
						// OK Func, need to get the value of the parameters
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);		
						var sname = ret[0];
						for (var i=0; i< scenes.length; i++) {
							if (scenes[i]['name'] == sname) {
								break;
							}
						}
						var scene_id = scenes[i]['id'];
						var removed = scenes.splice(i ,1);		// Removed is an array too, one element only
						logger(removed[0]);
						// Remove the room from MySQL
						send2daemon("dbase","delete_scene", removed[0]);
						if (debug>1)
								alert("Removed from dbase:: id: " + removed[0]['id'] + " , name: " + removed[0]['name']);
						s_scene_id = scenes[0]['id'];				// If there are no scenes, we are in trouble I guess
						init_scenes("init");						// As we do not know which room will be first now
						return(1);
					// Cancel	
  					}, function () {
							activate_scene (s_scene_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Delete Scene'
				); // askForm
	
				// Popup: Are you sure?
				// If Yes: delete row
			break;
			case "Help":
					helpForm('Scene',"This is the Help screen for Scenes (or sequences if you wish).\n\n"
						+ "In the header section you see an overview of your scenes defined, "
						+ "which enables you to view/change or add to a scene of your choice. \n\n"
						+ "The Context section in the middle shows for each defines scene the sequence "
						+ "of actions that will be performed when you RUN that scene with the blue > button. \n"
						+ "If you add or remove a device action to a scene this will NOT be stored unless you "
						+ "use the store function which will write the sequence to the database. "
						);
					$( '.cs_button' ).removeClass( 'hover' );
			break;
			default:
					alert("Error:: click id " + id + " not recognized");
			}
		
			
// Sortable Gui_header on tbody

		// Make the room header table sortable. It allows us to define a table with buttons above that are 
		// Not sortable but still look quite the same as these ... And for button handling it does
		// not see the difference.
		if (jqmobile == 1) {							// Sortable works different for jqmobile, do later
		
			// **** XXX SORTABLE NOT IMPLEMENTED FOR JQMOBILE ***
		}
		else 
		{										// jQuery UI Sortable
		  $("#gui_header tbody").sortable({

			start: function (event, ui) {
            	$(ui.item).data("startindex", ui.item.index());
        	},
			// NOTE: index 0 contains the header and is undefined, DO NOT USE IT
			stop: function (event, ui) {
				var mylist;
				// Go over each element and record the id
				$( "#gui_devices tr" ).each(function( index ) {
					if ( index != 0) {
						logger( index + ": " + $(this ).children().children('.dlabels').attr('id') );
						// ---YYY--
						// problem is that we have to change the order in the database
						// whereas you're never sure which record will be fetched first
					}
					else {
						logger( index + ": " + "Header" );
					}
				}); // each
            	//self.sendUpdatedIndex(ui.item);
        	}//stop	 
		  }).disableSelection();
		}//else
		$( this ).removeClass( 'hover' );
	}); // Handler


// ---------------------------------------------------------------------------------------
// TIMER
// ** HANDLER FOR HEADER TIMER BUTTONS	
	
	$("#gui_header").on("click", ".ht_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
			$( '.ht_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			activate_timer(id);
			if (debug > 2) alert("init_timer:: Button event");
	}); 	

// --------------------------------------------------------------------------------------
// TIMER
// ** HANDLER FOR CONTROL TIMER BUTTONS	
		
	$("#gui_header").on("click", ".ct_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.ct_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		switch (id)
		{	
			case "Add":
				// We start with making a new row in the timer array, give it a name etc.
				var ind = 1;
				// Search for a timerid that is unused between 2 existing timer records
				// Look for matchins indexes. This is a time-exhausting operation, but only when adding a timer
				while (ind <= max_timers) { 
					for (var i=0; i< timers.length; i++) {
						if ( ( timers[i]['id'] == ind )) { break; }
					}
					if (i == timers.length){ break; }		// So the ind is unused, we use it
					ind++;
				}//while
				
				// Now we have an index either empty slot in between timer records, or append the current array
				if ( ind > max_timers ) {
					alert("Unable to add more timers");
					return(-1);
				}
					
				// Now ask for a name for the new timer
				var frm='<form><fieldset>'
					+ '<p>You have created timer nr' + ind + '. Please specify name for your new timer</p>' 
					+ '<label for="val_1">Name: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					+ '</fieldset></form>';
				askForm(
					frm,
					// Create
					function (ret) {
						// OK Func, need to get the value of the parameters
						// Add the timer to the array
						// So what are the variables returned by the function???
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);			
						var newtimer = {
							id: ind,
							name: ret[0],
							type: "timer",
							scene: "",
							tstart: "00:00:00",
							startd: "01/01/13",
							endd: "",
							days: "mtwtfss",
							months: "jfmamjjasond",
							skip: "0"
						}
						timers.push(newtimer);			// Add record newdev to devices array

						send2daemon("dbase","add_timer", newtimer);
						// And add the line to the #gui_devices section
						// XXX Better would be just to add one more button and activate it in #gui_header !!
						s_timer_id = ind;
						init_timers ("init");
						return(1);	
					// Cancel	
  					}, function () {
							activate_timer(s_timer_id);
						return(1); 					// Avoid further actions for these radio buttons 
  					},
  					'Confirm Create'
				); // askForm
					
			break;
				
			// Remove the current timer. Means: Remove from the timers array
			// and reshuffle the array. 
			// What it means for SQL need to sort out later .....
			case "Del":
				
				var list = [];
				var str = '<label for="val_1">Delete Timer: </label>'
					+ '<select id="val_1" value="val_1" >' ;   // onchange="choice()"
				
				// Allow selection, but first let the user make a choice
				for (i=0; i< timers.length; i++) {
					str += '<option>' + timers[i]["name"] + '</option>';
				}
				str += '</select>';
			
				// The form returns 2 arguments, we only need the 1st one now
				var frm='<form><fieldset>'
					+ '<br />You are planning to delete a timer from the system. If you do so, all actions '
					+ 'associated with the timer are deleted too.\n'
					+ 'Please start with selecting a timer from the list.<br /><br />'
					+ str
					+ '<br />'
					+ '</fieldset></form>';
				askForm(
					frm,
					// Create
					function (ret) {							// ret value is an array of return values
						// OK Func, need to get the value of the parameters
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);		
						var tname = ret[0];
						
						for (var i=0; i< timers.length; i++) {
							if (timers[i]['name'] == tname) {
								break;
							}
						}
						// Is the room empty? Maybe we do not care, everything for scene is IN the record itself
						var timer_id = timers[i]['id'];
						var removed = timers.splice(i ,1);		// Removed is an array(!), one element only
						logger(removed[0],2);
						// Remove the timer from MySQL
						send2daemon("dbase","delete_timer", removed[0]);
						if (debug>1)
								alert("Removed from dbase:: id: " + removed[0]['id'] + " , name: " + removed[0]['name']);
						s_timer_id=timers[0]['id'];
						// 
						init_timers("init");					// As we do not know which timer will be first now
						return(1);	//return(1);
					
					// Cancel	
  					}, function () {
						activate_timer (s_timer_id);
						return(1); // Avoid further actions 
  					},
  					'Confirm Delete Timer'
				); // askForm
				// Popup: Are you sure
			break;
				
				//
				// Help for Timer setting
				//
			case "Help":
					helpForm('Timers', "This is the Help screen for Timers.\n\n"
						+ "In the header section you see an overview of your timers defined, "
						+ "selecting one enables you to view/change or add to a timer. \n\n"
						+ "The Content section in the middle shows its settings: Which scene should be started, "
						+ "on what time, and on whichs days or months. \n"
						+ "If you change a timer setting this will NOT be stored unless you "
						+ "use the store function which will write the timer to the database. "
						);
					
					$( '.ct_button' ).removeClass( 'hover' );
			break;
				
			default:
					alert("Error:: click id " + id + " not recognized");
		} // switch
		$( this ).removeClass ( 'hover' );
	});	// CT Timer Handler


// ------------------------------------------------------------------------------
// HANDSET
// Handle the Header Handset (=remote) selection buttons
// This function deals with the handset buttons diaplayed in the header section.
// If the user selects one of these buttons, the corresponding handset screen is activated.
//
	$("#gui_header").on("click", ".hh_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
						
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			$( '.hh_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			activate_handset(id);
	}); 

// -----------------------------------------------------------------------------
// HANDSET
//	*** Handle the Command Handset (CH) buttons (add, delete, help)
// This function implements the small action buttons (add, delete, help) in the upper right corner
// of the screen.
//
	$("#gui_header").on("click", ".ch_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.ch_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		switch (id)
		{	
			// Add a new handset. 
			case "Add":
				// We start with making a new row in the handset array, and give it a name etc.
				// Then we need to transfer control to the user
				// Find a free handset id:
				
				// Search for a handset id that is unused in array of existing handsets
				// Look for matching indexes. This is a time-exhausting operation, but only when adding a handset
				var ind = 1;
				while (ind <= max_handsets) { 
					for (var i=0; i< handsets.length; i++) {
						if ( ( handsets[i]['id'] == ind )) {
						// alert("found this ind: "+ind+" on pos "+i+", );
						// We found this index is used!
							break; // for
						} // if
					} // for
					// If we are here, then we did not find handset id equal to ind 
					// So the ind is unused, its free for us to use it
					if (i == handsets.length){
						break; // while
					}
					ind++;
				}//while
				
				// Now we have an index either empty slot in between scene records, or append the current array
				if ( ind > max_handsets ) {
					alert("Unable to add more handsets");
					return(-1);
				}
				
				// Now ask for a name for the new handset
				// The for asks for 2 arguments, so maybe we need to make a change later
				var frm='<form><fieldset>'
					+ '<br />DRAFT:'
					+ '<p>You have created handset nr ' + ind + '. Please specify name for your new remote</p>' 
					+ '<label for="val_1">Name: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br /><br />'
					+ '<label for="val_2">Address: </label>'
					+ '<input type="text" name="val_2" id="val_2" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					+ '</fieldset></form>';
					
				askForm(
					frm,
					// Create
					function (ret) {
						// OK Func, need to get the value of the parameters
						// Add the device to the array
						// So what are the variables returned by the function???
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);
						var handset_name = ret[0];
						var handset_addr = ret[1];
						for (var i=0; i< handsets.length; i++) {
							if (handsets[i]['addr']==handset_addr) {
								break;
							}
						}
						if (i!=handsets.length){
							alert("The handset address "+handset_addr+" is already registered");
							return(0);
						}
						if (debug>1) alert("New handset on ind: "+ind+", name: "+handset_name+", addr: "+handset_addr);
						var newhandset = {
							id: ind,
							name: handset_name,
							brand: "",
							addr: handset_addr,
							unit: "0",
							val: "0",
							type: "handset",
							scene: ""						// we should start with empty Scene
						}
						handsets.push(newhandset);			// Add record newdev to devices array
						logger("Added new handset "+newhandset['name']);
						send2daemon("dbase","add_handset", newhandset);
						// And add the line to the #gui_devices section
						// Go to the new scene
						s_handset_id = ind;
						// activate_handset(new_hndset_id);
						// XXX Better would be just to add one more button and activate it in #gui_header !!
						init_handsets("init");
						return(1);	//return(1);
						
					// Cancel	
  					}, function () {
							activate_handset (s_handset_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Create'
				); // askForm
				
			break;
				
			// Remove the current handset. Means: Remove from the handset array, and shuffle the array. 
			// As there are multiple records with the same id, we need to make a 
			// list first, and after selection delete all records with that id.
			//
			// What it means for SQL need to sort out later .....
			case "Del":
				
				var list = [];
				var str = '<label for="val_1">Delete Handset: </label>'
						+ '<select id="val_1" value="val_1" >' ;   // onchange="choice()"
				
				// Allow selection, but first let the user make a choice
				// Make sure every name only appears once
				var hset_list=[];
				for (i=0; i< handsets.length; i++) {
					if ( $.inArray(handsets[i]['id'],hset_list) == -1) {
						str += '<option>' + handsets[i]["name"] + '</option>';
						hset_list[hset_list.length]= handsets[i]['id'];
					}
				}
				str += '</select>';
				
				// The form returns 2 arguments, we only need the 1st one now
				var frm='<form><fieldset>'
					+ '<br>DRAFT:</br>'
					+ '<br />You are planning to delete a handset from the system. If you do so, all actions '
					+ 'associated with the handset must be deleted too.\n'
					+ 'Please start with selecting a handset from the list.<br /><br />'
					+ str
					+ '<br />'
					+ '</fieldset></form>';
					
				askForm(
					frm,
					// Create
					function (ret) {							// ret value is an array of return values
						// OK Func, need to get the value of the parameters
						if (debug>2) alert(" Dialog returned val_1,val_2: "+ret);		
						var sname = ret[0];
						
						// There might be more than one record with the same id
						// We work our way back in the array, so index i remains consistent
						for (var i=handsets.length-1; i>=0; i--) {
							if (debug>2) alert("working with i: "+i+", handset id: "+handsets[i]['name']);
							if (handsets[i]['name'] == sname) {
								// Is the room empty? Maybe we do not care, 
								//everything for scene is IN the record itself
								var handset_id = handsets[i]['id'];
								// Removed is an array too, one element only
								var removed = handsets.splice(i ,1);
								
								logger(removed[0]);
								// Remove the room from MySQL
								send2daemon("dbase","delete_handset", removed[0]);
								if (debug>1)
									myAlert("Removed from dbase:: id: "+removed[0]['id']+" , name: "+removed[0]['name']);
							}
						}
						// As we do not know which room will be first now
						// If there are no handsets, we are in trouble I guess
						s_handset_id = handsets[0]['id'];
						init_handsets("init");
						return(1);						
					// Cancel	
  					}, function () {
							activate_handset (s_handset_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Delete Handset'
				); // askForm
				// Popup: Are you sure?
				
				// If Yes: delete row
			break;
			case "Help":
					helpForm('Handsets',"This is the Help screen for Handsets or Remote controls.<BR>"
						+ "In the header section you see an overview of your handsets defined, "
						+ "which enables you to view/change or add to a handset of your choice. \n\n"
						+ "The Content section in the middle shows for each defined handset the button "
						+ "definitions. "
						+ "If you add or remove a device action to a handset these will NOT be stored unless you "
						+ "use the store function which will write the sequence to the database. "
						);
					$( '.ch_button' ).removeClass( 'hover' );
			break;
				
			default:
					alert("Error:: click id " + id + " not recognized");
			}		
			
// Sortable Gui_header on tbody

		// Make the handset header table sortable. It allows us to define a table with buttons above that are 
		// Not sortable but still look quite the same as these ... And for button handling it does
		// not see the difference.
		if (jqmobile == 1) {							// Sortable works different for jqmobile, do later
		
			// **** SORTABLE NOT IMPLEMENTED FOR JQMOBILE ***
		}
		else 
		{										// jQuery UI Sortable
		  $("#gui_header tbody").sortable({

			start: function (event, ui) {
            	$(ui.item).data("startindex", ui.item.index());
        	},
			// NOTE: index 0 contains the header and is undefined, DO NOT USE IT
			stop: function (event, ui) {
				var mylist;
				// Go over each element and record the id
				$( "#gui_devices tr" ).each(function( index ) {
					if ( index != 0) {
						logger( index + ": " + $(this ).children().children('.dlabels').attr('id') );
						// ---YYY--
						// problem is that we have to change the order in the database
						// whereas you're never sure which record will be fetched first
					}
					else {
						logger( index + ": " + "Header" );
					}
				}); // each
            	//self.sendUpdatedIndex(ui.item);
        	}//stop function	 
		  }).disableSelection();
		}//else
		$( this ).removeClass ( 'hover' );
	}); // Handler for remotes handsets

// ------------------------------------------------------------------------------
// Sensor
// Handle the Header Sensor (=remote) selection buttons (formerly hw for header-weather)
// This function deals with the sensor buttons diaplayed in the header section.
// If the user selects one of these buttons, the corresponding sensor screen is activated.
//
	$("#gui_header").on("click", ".hw_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
						
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			$( '.hw_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			activate_sensors(id);
	}); // sensor

// ------------------------------------------------------------------------------
// Sensors (formerly Weather)
// Handle the Weather (=remote) selection in the Content area
// This function deals with the Command Weather (cw) buttons diaplayed in the content section.
// If the user selects one of these buttons, the sensors GRAPH action is activated.
//
	$("#gui_content").on("click", ".cw_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
						
			value=$(this).val();							// Value of the button
			id = $(e.target).attr('id');					// should be id of the button (array index substract 1)
			$( '.cw_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			//activate_sensors(id);
			var win=window.open('http://'+w_url+'/graphs/sensor.html', '_parent');
			$( this ).removeClass( 'hover' );
	}); // sensor


// ----------------------------------------------------------------------------
// WEATHER and Sensors
//	*** Handle the Command Weather (CW) buttons (add, delete, help)
// This function implements the small action buttons (add, delete, help) in the upper right corner
// of the screen.
//
	$("#gui_header").on("click", ".cw_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.cw_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();						// Value of the button
		id = $(e.target).attr('id');				// should be id of the button (array index substract 1)
		switch (id)
		{	
			// Add a new Sensor station. 
			case "Add":
				// We start with making a new row in the sensors array, give it a name etc.
				// Search for a sensors id that is unused in array of existing sensors
				var ind = 1;
				while (ind <= max_sensors) { 
					for (var i=0; i< sensors.length; i++) {
						if ( ( sensors[i]['id'] == ind )) {
							break; 	//for			// We found this index is used!
						} // if
					} // for
					// So the ind is unused, its free for us to use it
					if (i == sensors.length){
						break;
					}
					ind++;
				}//while
				
				// Now we have an index either empty slot in between scene records, or append the current array
				if ( ind > max_sensors ) {
					alert("Unable to add more weather sensors");
					return(-1);
				}
				
				// Now ask for a name for the new sensors
				// The for asks for 2 arguments, so maybe we need to make a change later
				var frm='<form><fieldset>'
					+ '<br />DRAFT:'
					+ '<p>You have created sensors device nr ' + ind + '. Please specify name</p>' 
					+ '<label for="val_1">Name: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br /><br />'
					+ '<label for="val_2">Address: </label>'
					+ '<input type="text" name="val_2" id="val_2" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					+ '</fieldset></form>';
					
				askForm(
					frm,
					// Create
					function (ret) {
						// OK Func, add device to array
						if (debug > 2) alert(" Dialog returned val_1,val_2: " + ret);
						var sensors_name = ret[0];
						var sensors_addr = ret[1];
						for (var i=0; i< sensors.length; i++) {
							if (sensors[i]['addr']==sensors_addr) {
								break;
							}
						}
						if (i!=sensors.length){
							alert("The sensors address "+sensors_addr+" is already registered");
							return(0);
						}
						if (debug>=1) alert("New sensor on ind: "+ind+", name: "+sensors_name+", addr: "+sensors_addr);
						var newsensors = {
							id: ind,
							name: sensors_name,
							type: "sensor",
							brand: "",
							addr: sensors_addr,
							unit: "0",
							val: "0",
							type: "switch",
							scene: ""						// we should start with empty Scene
						}
						sensors.push(newsensors);			// Add record newdev to devices array
						logger("Added new sensor "+nesensors['name']);
						send2daemon("dbase","add_sensors", newsensors);
						// And add the line to the #gui_devices section, and go to the new sensors
						s_sensor_id = ind;
						// activate_sensors(new_sensors_id);
						// XXX Better would be just to add one more button and activate it in #gui_header !!
						init_sensors("init");
						return(1);	//return(1);
						
					// Cancel	
  					}, function () {
							activate_sensors (s_sensor_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Create'
				); // askForm
				
			break;
				
			// Remove the current sensor. Means: Remove from the sensor
			// array, and reshuffle the array. 
			// As there are multiple records with the same id, we need to make a 
			// list first, and after selection delete all records with that id.
			//
			// What it means for SQL need to sort out later .....
			case "Del":
				
				var list = [];
				var str = '<label for="val_1">Delete Sensor: </label>'
						+ '<select id="val_1" value="val_1" >' ;   // onchange="choice()"
				// Allow selection, but first let the user make a choice
				// Make sure every name only appears once
				var sensors_list=[];
				for (i=0; i< sensors.length; i++) {
					if ( $.inArray(sensors[i]['id'],sensors_list) == -1) {
						str += '<option>' + sensors[i]["name"] + '</option>';
						sensors_list[sensors_list.length]= sensors[i]['id'];
					}
				}
				str += '</select>';
				
				// The form returns 2 arguments, we only need the 1st one now
				var frm='<form><fieldset>'
					+ '<br>DRAFT:</br>'
					+ '<br />You are planning to delete a sensor from the system. If you do so, all actions '
					+ 'associated with the sensor must be deleted too.\n'
					+ 'Please start with selecting a sensor from the list.<br /><br />'
					+ str
					+ '<br />'
					+ '</fieldset></form>';
					
				askForm(
					frm,
					// Create
					function (ret) {							// ret value is an array of return values
						// OK Func, need to get the value of the parameters
						if (debug>2) alert(" Dialog returned val_1,val_2: "+ret);		
						var sname = ret[0];
						
						// There might be more than one record with the same id
						// We work our way back in the array, so index i remains consistent
						for (var i=sensors.length-1; i>=0; i--) {
							if (debug>2) alert("working with i: "+i+", sensors id: "+sensors[i]['name']);
							if (sensors[i]['name'] == sname) {
								// Is the array empty? Maybe we do not care, 
								//everything for sensors is IN the record itself
								var sensors_id = sensors[i]['id'];
								var removed = sensors.splice(i,1);	// Removed is an array, one element only
								logger("Sensor removed: "+removed[0],1);
								send2daemon("dbase","delete_sensors", removed[0]);	// Remove the sensors from MySQL
								if (debug>=2)
									myAlert("Removed from dbase:: id: "+removed[0]['id']+" , name: "+removed[0]['name']);
							}
						}
						
						// As we do not know which sensors record will be first now
						// If there are no sensors, we are in trouble I guess
						s_sensor_id = sensors[0]['id'];
						init_sensors("init");
						return(1);						
					// Cancel	
  					}, function () {
						activate_sensors (s_sensor_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Delete sensor'
				); // askForm
				// Popup: Are you sure?
				
				// If Yes: delete row
			break;
			case "Help":
					helpForm('Sensor',"This is the Help screen for sensors stations and sensors<br>"
						+ "In the header section you see an overview of your sensors defined, "
						+ "which enables you to view/change or add sensors to a station of your choice. <br>"
						+ "The Content section in the middle shows for each defined station the dials, "
						+ "it will only show those sensors available for a station. "
						+ "It is quite good possible to change the layout of the dials, as well as color etc. "
						+ "At the moment these style definitions are part of the steel subdirectory"
						);
					$( '.cw_button' ).removeClass( 'hover' );
			break;
			default:
					alert("Error:: click id " + id + " not recognized");
			}
			
	// Sortable Gui_header on tbody

		// Make the sensor header table sortable. It allows us to define a table with buttons above that are 
		// Not sortable but still look quite the same as these ... And for button handling it does
		// not see the difference.
		if (jqmobile == 1) {							// Sortable works different for jqmobile, do later
		
			// **** SORTABLE sensors is NOT IMPLEMENTED FOR JQMOBILE ***
		}
		else 
		{										// jQuery UI Sortable
		  $("#gui_header tbody").sortable({

			start: function (event, ui) {
            	$(ui.item).data("startindex", ui.item.index());
        	},
			// NOTE: index 0 contains the header and is undefined, DO NOT USE IT
			stop: function (event, ui) {
				var mylist;
				// Go over each element and record the id
				$( "#gui_devices tr" ).each(function( index ) {
					if ( index != 0) {
						logger( index + ": " + $(this ).children().children('.dlabels').attr('id') );
						// ---YYY--
						// problem is that we have to change the order in the database
						// whereas you're never sure which record will be fetched first
					}
					else {
						logger( index + ": " + "Header" );
					}
				}); // each
            	//self.sendUpdatedIndex(ui.item);
        	}//stop function	 
		  }).disableSelection();
		}//else
		$( this ).removeClass ( 'hover' );
	}); // Handler for sensors


// ------------------------------------------------------------------------------
// Energy
// Handle the energy (=remote) selection in the Content area
// This function deals with the Command Energy (ce) buttons diaplayed in the content section.
// If the user selects one of these buttons, the corresponding energy action is activated.
//
	$("#gui_content").on("click", ".ce_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
						
			value=$(this).val();							// Value of the button
			id = $(e.target).attr('id');					// should be id of the button (array index substract 1)
			$( '.ce_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			//activate_energy(id);
			var win=window.open('http://'+w_url+'/graphs/energy.html', '_parent');
			//$.getScript("graphs/enerpi.js", function(){
			//		start_ENERPI();
			//		alert("start_ENERPI finished");
			//	});
			$( this ).removeClass( 'hover' );
	}); // energy

// ----------------------------------------------------------------------------
// CONFIG
// ** HANDLER FOR HEADER CONFIG BUTTONS
//
	$("#gui_header").on("click", ".hc_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
			
			$( '.hc_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );	
			
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			activate_setting(id);
		});

// -------------------------------------------------------------------------------
// CONFIG
// ** HANDLER FOR CONTROL CONFIG BUTTONS	
		
	$("#gui_header").on("click", ".cc_button", function(e){
		e.preventDefault();
		e.stopPropagation();
		selected = $(this);
		$( '.cc_button' ).removeClass( 'hover' );
		$( this ).addClass ( 'hover' );
		value=$(this).val();								// Value of the button
		id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
		switch (id)
		{	
			// Add a new configuration. This is NOT applicable to config at the moment
			case "Add":
				// We start with making a new row in the setting array,
				// give it a name etc.
				// Then we need to transfer control to the user
				alert("Add a Setting");	
				// Find a free setting id:
				var ind = 1;
			break;
			// Remove from the settings array, and reshuffle the array. 
			// What it means for SQL need to sort out later .....
			case "Del":
			
			break;
			case "Help":
					alert("This is the Help screen for Setting Configuration\n\n"
						+ "In the header section you see buttons to select a configuration item, "
						+ "each one will show a form where you can change certain settings. "
						);
					$( '.cc_button' ).removeClass( 'hover' );
			break;
			default:
					alert("Error:: click id " + id + " not recognized");
		} // switch
		
	});	// CC Config Handler


// -------------------------------------------------------------------------------
// SCENE We have to setup an event handler for this screen.
// After all, the user might like to change things and press some buttons
// NOTE::: This handler runs asynchronous! So after click we need to sort out for which scene :-)
// Therefore, collect all scene data again in this handler.
//
	$( "#gui_content" ).on("click", ".scene_button" ,function(e) 
	{
		e.preventDefault();
		e.stopPropagation();
		value=$(this).val();									// Value of the button pressed (eg its label)
		var but_id = $(e.target).attr('id');					// id of button
		var scene = get_scene(s_scene_id);						// s_scene_id tells us which scene is active
		var scene_name = scene['name'];
		var scene_seq = scene['seq'];
		var scene_split = scene_seq.split(',');					// Do in handler
		logger("scene handler:: scene_name: "+scene_name,2);
		// May have to add: Cancel All timers and Delete All timers
		switch (but_id.substr(0,2))
		{
			// START button, queue scene
			case "Fq":
						// Send to the device message_device
						var scene_cmd = '!FqP"' + scene['name'] + '"';
						// Send to device. In case of a Raspberry, we'll use the backend_rasp
						// to lookup the command string from the database
						message_device("scene", "run_scene", scene );
			break;	
			// STORE button
			case "Fe":
						var scene_cmd = '!FeP"' + scene['name'] + '"=' + scene['seq'];
						send2daemon("dbase","store_scene", scene);
			break;		
			// DELETE scene action, ONE of the actions in the seq!!!
			case "Fx":
						if (debug > 2) alert("Activate_screen:: Delete Fx button pressed");
						var msg = "Deleted actions ";
						// Go over each TR element with id="scene" and record the id
						// We need to go reverse, as removing will mess up indexes above,
						// this will not matter if we work up the array
						$($( "#gui_scenes .scene" ).get().reverse()).each(function(index) {
																
							var id = 	$(this ).children().children('.dlabels').attr('id');		
							var ind = parse_int(id)[1];			// id contains two numbers in id, we need 2nd
							if ( $(this ).children().children('input[type="checkbox"]').is(':checked') ) {
								if (debug > 1) alert ("delete scene id: "+id+", index: "+ind+" selected");
								var removed = scene_split.splice(2*(ind-1),2);
								ind --;		// After deleting from scene_split, adjust the indexes for rest of the array	
								if (debug > 1) alert("removed:"+removed[0]+ "," +removed[1]+": from seq: "+scene_split );
								msg += ind + " : " + decode_scene_string( removed[0] ) + "; " ;
							}
						});
						message(msg);
						// We need to find the index of array scenes to update. As we are in a handler
						// we cannot rely on the j above but need to find the index from 'id' field in scenes
						for (var j=0; j<scenes.length; j++) {
							if (scenes[j]['id'] == s_scene_id ) {
								// Now concatenate all actions and timers again for the scene_split
								if (typeof(scene_split) == "undefined") {
									if (debug>2) alert("activate_scene:: case FX: scene_split undefined");
								}
								else {
									scenes[j]['seq']=scene_split.join();
									if (debug>2) alert("seq: " + scenes[j]['seq']);
								}
								break;
							}
						}
								
						// We will NOT store to the dabase unless the user stores the sequence by pressing the STORE button
						activate_scene(s_scene_id);							
			break;
			// CANCEL scene button
			case "Fc":
			// Do we want confirmation?
				var scene_cmd = '!FcP"' + scene['name'] + '"';
				alert("Cancel current Sequence: " + scene['name']
					+ "\nScene cmd: " + scene_cmd
					);
				message_device("scene", "cancel_scene", scene);
			break;	
			// Recording
			case "Fr":
				if (debug > 2) alert("Activate_screen:: Add Fr button pressed, start recording ...");
				myConfirm('You are about to add a new action to the scene. If you continue, the system ' 
				+ 'will be in recording mode until you have selected a device action. Then you are returned '
				+ 'to this scene screen again. Please confirm if you want to add a device. ', 
				// Confirm
				function () {
					// DO nothing....
					// Maybe make the background red during device selection or blink or so
					// with recording in the message area ...
					message('<p style="textdecoration: blink; background-color:red; color:white;">RECORDING</p>');
					// Cancel	
  					}, function () {
						s_recording = 0;
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Adding a Device action?'
				);
				s_recording = 1;							// Set the recording flag on!
				s_recorder = "";							// Empty the recorder
				init_rooms("init");
			break;	
			// Change a timing value in the scene screen
			case "Ft":
	// XXX In LamPI, Scene id can be higher than 9, thus 2 chars (make function read_int(s,i) )
						var val= $(e.target).val();
						//alert("scene current time val is: "+val);
						
						var hh=""; for(var i=0;i<24;i++) {
							if (i==val.substr(0,2)) hh +='<option selected="selected">'+("00"+i).slice(-2)+'</option>';
							else hh +='<option>'+("00"+i).slice(-2)+'</option>';
						}
						var mm=""; for(var i=0;i<60;i++) {
							if (i==val.substr(3,2)) mm +='<option selected="selected">'+("00"+i).slice(-2)+'</option>';
							else mm +='<option>'+("00"+i).slice(-2)+'</option>';
						}
						var ss=""; for(var i=0;i<60;i++) {
							if (i==val.substr(6,2)) ss +='<option selected="selected">'+("00"+i).slice(-2)+'</option>';
							else ss +='<option>'+("00"+i).slice(-2)+'</option>';
						}
						var ret;
						var frm = '<form id="addRoomForm"><fieldset>'
							+ '<p>You can change the timer settings for this action. Please use hh:mm:ss</p>'
							+ '<br />'
							+ '<label style="width:50px;" for="val_1">hrs: </label>'
							+ '<select id="val_1" value="'+val.substr(0,2)+'" >' + hh +'</select>'
							+ '<label style="width:50px;" for="val_2">mins: </label>'
							+ '<select id="val_2" value="' + val.substr(3,2)+ '">' + mm +'</select>'
							+ '<label style="width:50px;" for="val_3">secs: </label>'
							+ '<select id="val_3" selectedIndex="10" value="'+ val.substr(6,2)+'">' + ss +'</select>'
							+ '</fieldset></form>'
							;	
						askForm(
							frm,
							function(ret){
							// OK Func, need to get the value of the parameters
							// Add the device to the array
							// SO what are the variables returned by the function???
							if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);
						
							// Value of the button pressed (eg its label)
							var laval = ret[0]+":"+ret[1]+":"+ret[2];
							$(e.target).val(laval);
							if (debug>2) alert("Timer changed from "+ val+" to: "+ $(e.target).val() );
						
						// Now change its value in the sequence string of timers also
						// use but_id= $(e.target).attr('id') to get the index number ...							
							var ids = parse_int(but_id);					// Second number is gid, first scene_id
							var gid = ids[1];
							scene_split [((gid-1)*2) + 1] = laval;
							var my_list = '';
							// Go over each element and assemble the list again.
							$( "#gui_scenes .scene" ).each(function( index ) {
								var id = 	$(this ).children().children('.dbuttons').attr('id');	
								var ind = parse_int(id)[1];
								//logger( "scn: " + scn + " html index: " + index + " scene ind: " + ind );
								my_list += scene_split [(ind-1)*2] + ',' + scene_split [((ind-1)*2) + 1] + ',' ;
							});
							my_list = my_list.slice(0,-1);			// remove the last ","
							var sindex = idx_scene(s_scene_id);		// Find array index for scene id 
							logger("store_scene:: sindex: "+sindex+",my_list :" + my_list);
							logger("store_scene: "+sindex+", " +scenes[sindex]['name']+", my_list: "+my_list);
							scenes[sindex]['seq'] =  my_list;
							if (debug>2) alert("new scene_list:: "+my_list);
							return (0);	
  						},
						function () {
							return(1); // Avoid further actions for these radio buttons 
  						},
  						'Confirm Change'
					); // askForm
			break;	
			default:
				alert("Sequence action unknown: " + but_id.substr(-2) );
		}
	});


	// --------------------- MAIN init part FOR start_LAMPI -----------------------------------------
	//
	// For jqmobile and regular jqueryUI there are differences,
	if ( jqmobile == 1 ) 
	{
		var ret = load_database("init");
		if (ret<0) {
			alert("Error:: loading database failed");
		}
		init_websockets();			// For regular web based operations we start websockets here
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
  }); // Doc Ready end

} //start_LAMP() function end


// ========================================================================================
// Below this line, only functions are declared.
// The only program started is found in the document.ready() function above
// -------------------------------------------------------------------------------------
// FUNCTION INIT
// This function is the first function called when the database is loaded
// It will setupt the menu area and load the first room by default, and mark 
// the button of that room
// See function above, we will call from load_database when $ajax success or 
// when using websockets from init_websockets !!!
//
function init() {
	// The settings array must be there and initialized!
	debug = settings[0]['val'];
	use_energy = ( energy.length > 0 ? true : false );			// Will we use energy display, only when P1-sensor is working
		
	// Load Skin for the website
	// XXX Why we would this only for non-jqmobile use is not clear.
	if (jqmobile != 1) {
		// LocalStorage Use
		if(typeof(Storage)!=="undefined") {
  			// Code for localStorage/sessionStorage.
			skin = localStorage.getItem('skin');				// Skin Setting
			logger("init:: localStorage, skin: "+skin,1);
		}
		else {
			logger("init:: No localStorage support for skin",1);
		}
		if (skin == null) skin = settings[4]['val'];
		$("link[href^='styles']").attr("href", skin);
	}

	// Set the interval so that every 10 seconds the system decreases the healthcount variable
	setInterval( function() { 
		send2daemon("ping","","") ;
			if (healthcount > 0) healthcount--;
			logger("healthcount:: "+healthcount,2);
			if (jqmobile==1) {
				logger("healthcount mobile:: "+healthcount,1);
				$("#health-slider").val(healthcount).slider("refresh");
			}
			else {
				logger("healthcount ui:: "+healthcount,1);
				$("#health-slider").val(healthcount);
				$("#health-slider").slider("option", "value", healthcount );
			}
	}, 10000);
	
	// XXX This type of init it not flexible.. Fortunately number and type of fields
	// used for energy is fixed. All of these fields are present in a modern Energy P1 meter
	energy['kw_hi_use'] = 0;
	energy['kw_lo_use'] = 0;
	energy['kw_hi_ret'] = 0;
	energy['kw_lo_ret'] = 0;
	energy['gas_use'] = 0;
	energy['kw_act_use'] = 0;
	energy['kw_act_ret'] = 0;
	energy['kw_ph1_use'] = 0;
	energy['kw_ph2_use'] = 0;
	energy['kw_ph3_use'] = 0;
	
	// Sort the devices array on the "id" field
	//sort(devices);
	// XYZ
	function idsort(a,b) {
		if (a.id < b.id)
			return -1;
  		if (a.id > b.id)
    		return 1;
  		return 0;
	}

	devices.sort(idsort);
	if (debug >= 2) {
		for (var i=0; i< devices.length; i++) {
			logger("devices i: "+i+", id: "+devices[i]['id']+", name: "+devices[i]['name']);
		}
	}
	init_rooms(s_room_id);										// Initial startup config
	init_menu(s_setting_id);
}

// ----------------------------------------------------------------------------------------
// Based on the value of s_screen, activate the screen again
// ----------------------------------------------------------------------------------------
function activate (s_screen) {
	switch (s_screen) {
		case "room":
			activate_room(s_room_id);
		break;
		case "screne":
			activate_scene(s_scene_id);
		break;
		case "timer":
			activate_timer(s_timer_id);
		break;
		case "sensor":
			activate_sensors(s_sensor_id);
		break;
		case "energy":
			activate_energy(s_energy_id);
		break;
		case "config":
			activate_setting(s_setting_id);
		break;
	}
}


// -------------------------------------------------------------------------------
// Help specific form function (see askForm below for more info
// This form will display a help form on the screen with two
// buttons: More Info, Done
// Based on the screen currently loaded, the more info button will
// display the URL of the help function on the screen
//
function helpForm(dialogTitle, dialogText, moreFunc, doneFunc ) {
	if (jqmobile == 1) {
	//alert("helpForm jqmobile");
	// We assume that for jqmobile setting we receive a dialogtext
	// that contains jQM correct html tags so that we can use this
	// functions semi-generic for jQuery mobile and jQuery UI

		$( "#header" ).empty();
		var $popUp = $("<div/>").popup({
			id: "popform",
        	dismissible : false,
        	theme : "a",
        	overlayTheme : "a",
			maxWidth : "400px",
			dialogClass: 'askform',
        	transition : "pop"
		}).bind("popupafterclose", function() {
			//remove the popup when closing
			$(this).remove();
		});
		//create a title for the popup
		$("<h2/>", {
			text : dialogTitle
		}).appendTo($popUp);
	
		$("<p/>", {
			text : dialogText
		}).appendTo($popUp);
		
		// Submit Button
		$("<a>", {
			text : "Read More"
		}).buttonMarkup({
			inline : true,
			icon : "check"
		}).on("click", function() {
		
			if (typeof (moreFunc) == 'function') {
				// Return max of 4 results (may define more)...
				var ret = [ $("#val_1").val(), $("#val_2").val(), $("#val_3").val(), $("#val_4").val() ];
				setTimeout(function(){ moreFunc(ret) }, 50);
        	}
			var s="http://platenspeler.github.io/LamPI-3.0/UserGuide/";
			switch (s_screen) {
				case 'room': var win=window.open(s+'rooms.html', '_blank'); win.focus(); break;
				case 'scene': var win=window.open(s+'scenes.html', '_blank'); win.focus(); break;
				case 'timer': var win=window.open(s+'timers.html', '_blank'); win.focus(); break;
				case 'handset': var win=window.open(s+'handsets.html', '_blank'); win.focus(); break;
				case 'sensor': var win=window.open(s+'weather.html', '_blank'); win.focus(); break;
				case 'energy': var win=window.open(s+'energy.html', '_blank'); win.focus(); break;
				default:				
			}
			if (debug>=2) alert("Read More for screen: "+s_screen);
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
		}).on("click", function() {
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
    title: dialogTitle || 'Help',
    minHeight: 120,
    buttons: {
    	More: function () {
        	if (typeof (moreFunc) == 'function') {
				// Return max of 4 results (may define more)...
				//var ret = [ $("#val_1").val(), $("#val_2").val(), $("#val_3").val(), $("#val_4").val() ];
				setTimeout(function(){ moreFunc(ret) }, 50);
        	}
			switch (s_screen) {
				case 'room':
					var win=window.open('http://platenspeler.github.io/LamPI-3.0/UserGuide/rooms.html', '_blank');
					win.focus();
				break;
				case 'scene':
					var win=window.open('http://platenspeler.github.io/LamPI-3.0/UserGuide/scenes.html', '_blank');
					win.focus();
				break;
				case 'timer':
					var win=window.open('http://platenspeler.github.io/LamPI-3.0/UserGuide/timers.html', '_blank');
					win.focus();
				break;
				case 'handset':
					var win=window.open('http://platenspeler.github.io/LamPI-3.0/UserGuide/handsets.html', '_blank');
					win.focus();
				break;
				case 'sensor':
					var win=window.open('http://platenspeler.github.io/LamPI-3.0/UserGuide/weather.html', '_blank');
					win.focus();
				break;
				case 'energy':
					var win=window.open('http://platenspeler.github.io/LamPI-3.0/UserGuide/energy.html', '_blank');
					win.focus();
				break;
				default:			
			}
      		$(this).dialog('destroy');
      	},
		Done: function () {
      		if (typeof (doneFunc) == 'function') {
      			setTimeout(doneFunc, 50);
        	}
			switch (s_screen) {
				case 'room':
					// alert("Done room screen help");
				break;
				default:			
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
} // helpForm end


// ---------------------------------------------------------------------------------
// Setup the rooms event handling. The ini_function is mere concerned with building
// the header section of the room screen, so selecting rooms, adding and deleting
// rooms.
//
// After work done, it will call the activate_room function to handle the content area
//
// The handler for init-room headers is found in the document ready function at the top
//
function init_rooms(cmd) 
{
	// The rooms variable, and devices for rooms are filled in load_database()
	// First define the handler, and then activate_room() will make buttons for those devices
	//<input type="submit" id="' + id + '" value= "'+ val + '" class="buttons">
	$("#gui_header").empty();
	html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
	$("#gui_header").append(html_msg);
						 
	// For all rooms write a button to the document
	var but = '';
	for (var i = 0; i < rooms.length; i++ ) 
	{
		room_name = rooms[i]['name'];
		room_id = rooms[i]['id'];
		if (room_id == s_room_id) {
			but += room_button(room_id, room_name, "hover");
		}
		else {
			but += room_button(room_id, room_name);				// Write a room button to the document
		}
	}
	$("#gui_header_content").append(but);

	// Now do the buttons on the right: add, delete, help and the slider for the health indication
	but  = '<input type="submit" id="Add"  value= "+"  class="cr_button new_button">' ;
	but += '<input type="submit" id="Del"  value= "X"  class="cr_button del_button">' ;
	but += '<input type="submit" id="Help" value= "?" class="cr_button help_button">' ;
	$("#gui_header_controls").append(but);
	
	if (jqmobile==1) {
		but  = '<div data-role="fieldcontain" class="container-health">';
		but += '<label for="health-slider"></label>';
		but += '<input type="range" name="health-slider" id="health-slider" value='+healthcount+' min="0" max="9" data-mini="true"  data-highlight="true" class="slider-health"/></div>';
		$("#gui_header_controls").append(but);
		
		logger("Starting Healthcount Slider function",2);
		$("#health-slider").slider();
		$("#health-slider").next().find('.ui-slider-handle').hide();
		$("#health-slider").slider("refresh");
	}
	else {
		but  = '';
		but += '<div id="health-slider" class="slider-health" ></div>' ;
		$("#gui_header_controls").append(but);
	
		$(function() {
			logger("Starting Healthcount Slider function",2);
			$( "#health-slider" ).slider({
				range: "max",
				min: 0,
				max: 9,
				value: healthcount,
    			slide: function( event, ui ) {
      				$( "#health-slider" ).val( ui.value );
					// var x = $( "#health-slider" ).val();
					var x = healthcount;
					if (x <= 2) {
						$(".slider-health").css("background", "#4ea6cf");
					}
					else if (x > 2 && x <= 3) {
						$(".slider-health").css("background", "#5ac5cf");
					}
					else if (x > 3 && x <= 4) {
						$(".slider-health").css("background", "#7dd7bf");
					}
					else if (x > 4 && x <= 5) {
						$(".slider-health").css("background", "#b1cfa1");
					}
					else if (x > 5 && x <= 6) {
						$(".slider-health").css("background", "#e5bf7c");
					}
					else if (x > 6 && x <= 7) {
						$(".slider-health").css("background", "#d79168");
					}
					else if (x > 7 && x <= 8) {
						$(".slider-health").css("background", "#cd7159");
					}
					else if (x > 8) {
						$(".slider-health").css("background", "#c4463a");
					};
				}
			});
			//$( ".active" ).val( $( "#slider" ).slider( "value"));
		});
	}
	//	Display the devices for the room at the first time run
	s_screen='room';
	activate_room(s_room_id);		
}

// -----------------------------------------------------------------------------------------
// Setup the scenes event handling
//
function init_scenes(cmd) 
{
	$("#gui_header").empty();
	html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
	$("#gui_header").append(html_msg);
	
	var msg = 'Init Scenes, scenes read: ';			
	var but = '';
	for (var j = 0; j<scenes.length; j++ ){
		var scene_id = scenes[j]['id'];
		var scene_name = scenes[j]['name'];
		var scene_seq = scenes[j]['seq'];
		msg += j + ', ';
		if (scene_id == s_scene_id ) {
			but +=  scene_button(scene_id, scene_name, "hover");
		}
		else {
			but +=  scene_button(scene_id, scene_name);
		}		
	}
	if (debug>1) message(msg);
	$("#gui_header_content").append(but);
	
	// Add special buttons for controlling the scenes
	but  = '<input type="submit" id="Add" value= "+" class="cs_button new_button">'  ;
	but += '<input type="submit" id="Del" value= "X" class="cs_button del_button">'  ;
	but += '<input type="submit" id="Help" value= "?" class="cs_button help_button">'  ;

	$("#gui_header_controls").append(but);
	s_screen='scene';					// Active sreen is a scene screen now
	activate_scene(s_scene_id);			// Activate the first scene with the id s_scene_id
}

// --------------------------------------------------------------------------------------
//
// Setup the timers event handling
//
function init_timers(cmd) 
{
	$("#gui_header").empty();
	html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
	$("#gui_header").append(html_msg);
	
	var msg = 'Init Timers, timers read: ';	
	var but = '' ;
	for (var j = 0; j<timers.length; j++ ){
		var timer_id = timers[j]['id'];
		var timer_name = timers[j]['name'];
		var timer_seq = timers[j]['seq'];
		msg += j + ', ';
		if (timer_id == s_timer_id ) {
			but +=  timer_button(timer_id, timer_name, "hover");
		}
		else {
			but +=  timer_button(timer_id, timer_name);
		}			
	}
	if (debug>1) message(msg);
	$("#gui_header_content").append(but);
	but  =  '';
	but += '<input type="submit" id="Add" value= "+" class="ct_button new_button">'  ;
	but += '<input type="submit" id="Del" value= "X" class="ct_button del_button">'  ;
	but += '<input type="submit" id="Help" value= "?" class="ct_button help_button">'  ;
	$("#gui_header_controls").append(but);
	s_screen = 'timer';
	activate_timer(s_timer_id);
}

// --------------------------------------------------------------------------------------
//
// Setup the handsets event handling
//
function init_handsets(cmd) 
{
		$("#gui_header").empty();
		html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
		$("#gui_header").append(html_msg);
		var msg = 'Init Handsets, handsets read: ';	
		var but = '' ;
		var hset_list=[];										// Array of names that we like to put in the header
		for (var j = 0; j<handsets.length; j++ )
		{
			// If this handset is already in our list ...
  			if ( $.inArray(handsets[j]['id'],hset_list) == -1) {
				var handset_id    = handsets[j]['id'];
				var handset_name  = handsets[j]['name'];
				var handset_addr  = handsets[j]['addr'];
				var handset_unit  = handsets[j]['unit'];
				var handset_val   = handsets[j]['val'];
				var handset_scene = handsets[j]['scene'];
				msg += j + ', ';
				// Check whether this is a new handset
			
				// in_array?
				if (handset_id == s_handset_id ) {
					but +=  handset_button(handset_id, handset_name, "hover");
				}
				else {
					but +=  handset_button(handset_id, handset_name);
				}
				hset_list[hset_list.length]= handsets[j]['id'];
			}
		}
		if (debug>1) message(msg);
		$("#gui_header_content").append(but);
		// Add special buttons for controlling the handsets
		but  =  '';
		but += '<input type="submit" id="Add" value= "+" class="ch_button new_button">'  ;
		but += '<input type="submit" id="Del" value= "X" class="ch_button del_button">'  ;
		but += '<input type="submit" id="Help" value= "?" class="ch_button help_button">'  ;	
		$("#gui_header_controls").append(but);
		s_screen = 'handset';
		activate_handset(s_handset_id);
}

// ------------------------------------------------------------------------------------------
// Setup the sensors event handling
// Display only sensors buttons for unique locations. SO in the header section
// there will be one button for a loction. Sensor dials will be sorted to locations as well
function init_sensors(cmd) 
{
		$("#gui_header").empty();
		html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
		$("#gui_header").append(html_msg);
		
		var msg = 'Init sensors, config read: ';
		var but = '' ;
		if (s_sensor_id == "") { 
			s_sensor_id = sensors[0]['location']; 
		}
		
		var sensor_list=[];
		for (var j = 0; j<sensors.length; j++ ){
			// Create only unique buttons
  			if ( $.inArray(sensors[j]['location'],sensor_list) == -1) {
				//alert("adding id: "+j);
				var sensors_id = sensors[j]['id'];
				var location = sensors[j]['location'];
				//var temperature = sensors[j]['sensor']['temperature']['val'];
				msg += j + ', ';
				if ( location == s_sensor_id ) {
					//but +=  sensors_button(sensors_id, location, "hover");
					but +=  sensors_button(location, location, "hover");
				}
				else {
					//but +=  sensors_button(sensors_id, location);
					but +=  sensors_button(location, location);
				}
				sensor_list[sensor_list.length]= sensors[j]['location'];
			}
		}
		if (debug>1) message(msg);
		$("#gui_header_content").append(but);	
		but =  '';
		//but += '<input type="submit" id="Add" value= "+" class="cw_button new_button">';
		//but += '<input type="submit" id="Del" value= "X" class="cw_button del_button">';
		but += '<input type="submit" id="Help" value= "?" class="cw_button help_button">';
		$("#gui_header_controls").append(but);	
		s_screen = 'sensor';
		activate_sensors(s_sensor_id);	
}

// ------------------------------------------------------------------------------------------
// Setup the energy sensors event handling
// Display only sensors buttons for unique locations. SO in the header section
// there will be one button for a loction. Sensor dials will be sorted to locations as well
function init_energy(cmd) 
{
		$("#gui_header").empty();
		html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
		$("#gui_header").append(html_msg);
		
		var msg = 'Init energy, config read: ';
		var but = '';
		$("#gui_header_content").append(but);
		
		if (debug>1) message(msg);
		but= '';
		//but += '<input type="submit" id="Add" value= "+" class="cw_button new_button">';
		//but += '<input type="submit" id="Del" value= "X" class="cw_button del_button">';
		but += '<input type="submit" id="Help" value= "?" class="cw_button help_button">';
		$("#gui_header_controls").append(but);	

		s_screen = 'energy';
		activate_energy(s_energy_id);	
}

// ------------------------------------------------------------------------------------------
// Setup the settings event handling
//
function init_settings(cmd) 
{
	$("#gui_header").empty();
	html_msg = '<div id="gui_header_content"></div><div id="gui_header_controls"></div>';
	$("#gui_header").append(html_msg);
	var msg = 'Init Config, config read: ';	
	var but = '';
	for (var j = 0; j<settings.length; j++ ){
		var setting_id = settings[j]['id'];
		var setting_name = settings[j]['name'];
		var setting_val = settings[j]['val'];
		msg += j + ', ';
		if ( setting_id == s_setting_id ) {
			but +=  setting_button(setting_id, setting_name, "hover");
		}
		else {
			but +=  setting_button(setting_id, setting_name);
		}	
	}
	$("#gui_header_content").append(but);
	but  = '';
	but += '<input type="submit" id="Help" value= "?" class="cc_button help_button">'  ;
	but += '</td>';
	$("#gui_header_controls").append(but);	
	s_screen = 'config';
	activate_setting(s_setting_id);	
}


// ------------------------------------------------------------------------------------------
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
		if (sensors.length > 0) { txt += '<option value="Sensor">Sensor</option>'; }
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
	else {
		html_msg = '<table border="0">';
		$("#gui_menu").append( html_msg );
		var table = $( "#gui_menu" ).children();		// to add to the table tree in DOM
		var but =  ''	
		+ '<tr><td><input type="submit" id="M1" value= "Rooms" class="hm_button hover"></td>' 
		+ '<tr><td><input type="submit" id="M2" value= "Scenes" class="hm_button"></td>'
		+ '<tr><td><input type="submit" id="M3" value= "Timers" class="hm_button"></td>'
		+ '<tr><td><input type="submit" id="M4" value= "Handsets" class="hm_button"></td>'
		;
		// Do we have sensors definitions in database.cfg file?
		if (sensors.length > 0) {
			but += '<tr><td><input type="submit" id="M6" value= "Sensor" class="hm_button"></td>'
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
		
		$("#gui_menu").on("click", ".hm_button", function(e){
			e.preventDefault();
			e.stopPropagation();
			selected = $(this);
			value=$(this).val();								// Value of the button
			id = $(e.target).attr('id');						// should be id of the button (array index substract 1)
			$( '.hm_button' ).removeClass( 'hover' );
			$( this ).addClass ( 'hover' );
			switch(id)
			{
			case "M1": init_rooms ("init"); break;
			case "M2": init_scenes(s_scene_id); break;
			case "M3": init_timers(); break;
			case "M4": init_handsets(); break;
			case "M5": init_settings(); break;
			case "M6": init_sensors(); break;
			case "M7": init_energy(); break;
			default:
				message('init_menu:: id: ' + id + ' not a valid menu option');
			}
		}); 
	}
}


// --------------------------------------------------------------------------------
// Select a room and change rooms
//		Input is the id number for the new room
// If selectable is set, the devices in the room will be displayed with select boxes 
//
function activate_room(new_room_id, selectable) 
{
	var html_msg;	
	var room_name;
	// Maybe we should make sure that we do not change to the current room
	// where new_room_id == s_room_id. 
	// If we do so, s_room_id must not be initialized on 1

	for (var i=0; i< rooms.length; i++) {
		if (rooms[i]['id']== new_room_id) {
				room_name = rooms[i]['name'];
				break;
		}
	}
	// 	Clean the DOM area where we want to output devices
	// Empty the parent works best in changing rooms
	$("#gui_content").empty();
	$("#gui_content").css( "overflow-y", "auto" );
	// XXX We might have to destroy the old sliders, depending on whether the memory is
	// re-used for the sliders or we keep on allocating new memory with every room change
	html_msg = '<div id="gui_devices"></div>';
	$( "#gui_content" ).append(html_msg);

	// First table contains special button "ALL OFF"
	// Start writing the table code to DOM
	html_msg = '<table border="0">';
	$( "#gui_devices" ).append( html_msg );
	var table = $( "#gui_devices" ).children();		// to add to the table tree in DOM	
	
	var but = '<thead><tr class="headrow switch">' ;
	if (selectable == "Del") { but+= '<td colspan="2">' ; }
		else {but += '<td>' };
	// class dbuttons belongs to device screen and defines round corners etc.
	but += '<input type="submit" id="Rx" value="X" class="dbuttons del_button" >'
		+  '<input type="submit" id="Ra" value="+" class="dbuttons new_button" >'
		+  '</td>'
		;
	but += '<td class="filler" align="center">'+room_name+'</td>';
	if (jqmobile == 1) {
		but += '<td><input type="submit" id="Fa" value="ALL OFF" class="dbuttons all_off_button" ></td>';
	}
	else {
		but +='<td></td>';					// Because in non jqmobile dimmers display value in this column
		but += '<td><input type="submit" id="Fa" value="ALL OFF" class="dbuttons all_off_button" ></td>';
	}
	$(table).append(but);
	$(table).append('</tr>');
			
	// Now start a second table body for the room items to be sortable
	html_msg = '</thead><tbody>';	
	$(table).append(html_msg);
	table = $( "#gui_devices tbody" ).last();
		
	for (var j = 0; j<devices.length; j++ ){
		var device_id = devices[j]['id'];
		var room_id = devices[j]['room'];
			
       	if( room_id == new_room_id )
		{
			var device_name = devices[j]['name'];
			var device_type = devices[j]['type'];
			var device_val  = devices[j]['val'];				// Do NOT use lastval here!
			var offbut, onbut;
				
			if ( device_val == 0 )	{ offbut = " hover"; onbut = ""; }
			else					{ offbut = ""; onbut = " hover"; }
				
			// add the html of button, depending on the type switch or dimmer
			switch (device_type) 
			{ 
			  case "switch": 
				// Below is the on/off device. Some code double, but better readable
				// For jqmobile the layout, but also slider difinitions are different
				if (jqmobile == 1) {
					var but =  '<tr class="devrow switch">' ;
					if (selectable == "Del") 
						but+= '<td><input type="checkbox" id="'+device_id+'c" name="cb'+device_id+'" value="yes" class="dbuttons"></td>';
					but += '<td colspan="2"><input type="text" id="'+device_id+'" value="'+device_name+'" class="dlabels"></td>';
					but += '<td><input type="submit" id="'+device_id+'F0'+'" value="OFF" class="dbuttons off_button'+offbut+'">';
					but += '<input type="submit" id="'+device_id+'F1'+'" value="ON" class="dbuttons on_button'+onbut+'"></td>';
				}		
				// NOT jqmobile
				else {
					var but =  '<tr class="devrow switch">' ;
					if (selectable == "Del") 
						but+= '<td><input type="checkbox" id="'+device_id+'c" name="cb'+device_id+'" value="yes" class="dbuttons"></td>';
					but += '<td colspan="2"><input type="submit" id="'+device_id+'" value= "'+device_name+'" class="dlabels"></td>';
					but += '<td></td>';	
					but += '<td><input type="submit" id="'+device_id+'F0'+'" value= "'+"OFF" +'" class="dbuttons off_button'+offbut+'">';
					but += '    <input type="submit" id="'+device_id+'F1'+'" value= "'+"ON" +'" class="dbuttons on_button'+onbut+'"></td>';
				}
				$(table).append(but);
				// Set the value read from load_device in the corresponding button
			  break;
			
			  case "dimmer":	
					// Unfortunately, code for jqmobile and Web jQuery UI is not the same
				if (jqmobile == 1) {	
					var slid = '<tr class="devrow dimrow">';
					if (selectable == "Del")
						slid += '<td><input type="checkbox" id="'+device_id+'c" name="cb'+device_id+'" value="yes" class="dbuttons"></td>';	
					slid += '<td colspan="2"><label for="'+device_id+'Fd">'+device_name+'</label>';
					slid += '<input type="number" data-type="range" style="min-width:32px;" id="'+device_id+'Fd" name="'+device_id+'Fl" value="'+device_val+'" min=0 max=31 data-highlight="true" data-mini="false" class="ddimmer"/></td>';
					slid += '<td><input type="submit" id="'+device_id+'F0'+'" value= "OFF" class="dbuttons off_button'+offbut+'" />';
					slid += '<input type="submit" id="'+device_id+'F1'+'" value= "ON" class="dbuttons on_button'+onbut+'" /></td>';
					slid += '</tr>';
				}
				else // This is the jQuery UI normal
				{
					var slid = '<tr class="devrow dimrow">' ;
					if (selectable == "Del")
						slid += '<td><input type="checkbox" id="'+device_id+'c" name="cb'+device_id+'" value="yes" class="dbuttons"></td>';
					slid += '<td><input type="submit" id="' +device_id+ '" value= "'+device_name+ '" class="dlabels"></td>'
						+ '<td><div id="' +device_id + 'Fd" class="slider slider-dimmer"></div></td>'	
						+ '<td><input type="text" id="' +device_id+'Fl" class="slidval"></td>'
						// On/Off buttons
						+ '<td><input type="submit" id="'+device_id+'F0'+'" value="OFF" class="dbuttons off_button'+offbut+'">'
						+ '    <input type="submit" id="'+device_id+'F1'+'" value="ON" class="dbuttons on_button'+onbut+'"></td>'
						+ '</tr>'
						;
				}
				table.append(slid);
							
				//XXX		
				// eventhandler for the slider. Use a div and id to make distinct sliders
				// This function works only if the handler is put AFTER the sliders generated
					
				var label ="#"+device_id+"Fl"; 
				var slidid="#"+device_id+"Fd";

				//XXX	Dimmer/Slider handling must be here for the moment. Every slider is "static" and belongs to
				//		and is declared for a specific device
				//		Move to doc ready section when possible 

				// eventhandler for the slider. Use a div and id to make distict sliders
				// This function works only if the handler is put AFTER the sliders generated
				// NOTE:: The handler is asynchronous, you never know when it is called
				// and it's context at that moment is unknown wrt variables in this function
				if (jqmobile==1) 
				{ 					// SLIDER FOR MOBILE
				  $(function() 
				  {
					var val = load_device(room_id, device_id);
					if (val == 'F0') { val = 0; }
					$( slidid ).slider
					({
					 	stop: function( event, ui ) {
							// This is where it happens for the value of the action
							var id = $(event.target).attr('id');
							var val = $(event.target).val();
							//var val2 = ui.value;
		
							// For slider==0 a special case. We want to switch OFF the device
							// As the dimmer command only accepts values 1-32, for value 0 we
							// make a special case and set the value of button OFF to hover.
							if ( val == 0 ) { 								
								// strip id and change val "D1Fd"+"P0" ==>> "D1"+"F0"
								handle_device( id.slice(0,-2), "F" + val );		 
								// Remove hover from "ON" and put the hover on the OFF button
								$("#"+id.slice(0,-2)+"F1").removeClass('hover');
								$("#"+id.slice(0,-2)+"F0").addClass('hover');
							} 
							else { 
								handle_device( id, "P" + val );				// id ="D1Fd", value = "P31"
								$("#"+id.slice(0,-2)+"F0").removeClass('hover');
								$("#"+id.slice(0,-2)+"F1").addClass('hover');
							}
							// Update the devices[][] array
							store_device(s_room_id, id.slice(0,-2), val);
						}
					});
					$( slidid ).slider("refresh");
				  });
				}
				else			// NORMAL SLIDER, 
				$(function() 
				{
					// Load database value
					var val = load_device(room_id, device_id);
					// If the OFF buton is pressed, put the slider to lowest position
					if (val == 'F0') { val = 0; }
  					$( slidid ).slider
					({
						range: "max",
						main: 1,
						min: 0,
						max: 32,
						value: val,
						slide: function( event, ui ) {
							// This is where it happens for the label
							// Problem is we need to update the correct label
							var id = $(event.target).attr('id');
							// strip last character of id of slider object
							// and replace with a l for the label object
							// For more than 9 devices, may be 4! chars eg. string ="D10F"							
							var lid = '#' + id.slice(0,-1) + 'l';
							$( lid ).val (ui.value);
						},
						stop: function( event, ui ) {
							// This is where it happens for the value of the action
							var id = $(event.target).attr('id');
							var val = ui.value;
							// For slider==0 a special case. We want to switch OFF the device
							// As the dimmer command only accepts values 1-32, for value 0 we
							// make a special case and set the value of button OFF to be pressed.
							if ( val == 0 ) 
							{ 
								val = 0 ;	
								// strip id and change val "D1Fd"+"P0" ==>> "D1"+"F0"
								handle_device( id.slice(0,-2), "F" + val );		 
								// Remove old hover from the current button (probably "ON") and place new hover
								$( this ).parent().siblings().children().removeClass( 'hover' );
								$( this ).parent().siblings().children("#"+id.slice(0,-2)+"F0").addClass( 'hover' );
							} 
							else { 
								handle_device( id, "P" + val );				// id ="D1Fd", value = "P31"
								$( this ).parent().siblings().children().removeClass( 'hover' );
								$( this ).parent().siblings().children("#"+id.slice(0,-2)+"F1").addClass( 'hover' );
							}
							// Update the devices[][] array
							store_device(s_room_id, id.slice(0,-2), val);
						}
					});
					// Initial value of the slider at time of definition
					$( label ).val( val );
  				}); // Slider Function
				
			  break;
			
			  case "thermostat":
					// Unfortunately, code for jqmobile and Web jQuery UI is not the same
				if (jqmobile == 1) {	
					var slid = '<tr class="devrow dimrow">';
					if (selectable == "Del")
						slid += '<td><input type="checkbox" id="'+device_id+'c" name="cb'+device_id+'" value="yes" class="dbuttons"></td>';	
					slid += '<td colspan="2"><label for="'+device_id+'Fd">'+device_name+'</label>';
					slid += '<input type="number" data-type="range" style="min-width:32px;" id="'+device_id+'Fd" name="'+device_id+'Fl" value="'+device_val+'" min=15 max=25 data-highlight="true" data-mini="false" data-theme="b" class="ddimmer"/></td>';
					slid += '<td></td>';
					slid += '</tr>';
				}
				else // This is the jQuery UI normal
				{
					var slid = '<tr class="devrow dimrow">' ;
					if (selectable == "Del")
						slid += '<td><input type="checkbox" id="'+device_id+'c" name="cb'+device_id+'" value="yes" class="dbuttons"></td>';
						
					slid += '<td><input type="submit" id="' +device_id 
						+ '" value= "'+device_name + '" class="dlabels"></td>'
						+ '<td><div id="' +device_id + 'Fd" class="slider slider-thermo"></div></td>'	
						+ '<td><input type="text" id="' +device_id+'Fl" class="slidval"></td>'
						// On/Off buttons do not apply for thermostat
						+ '<td></td>'
						// + '<td></td>'
						+ '</tr>'
						;
				}
				table.append(slid);
							
				//XXX Thermostat
				// eventhandler for the slider. Use a div and id to make distict sliders
				// This function works only if the handler is put AFTER the sliders generated
				// So if we want to connect to a
				var label ="#"+device_id+"Fl"; 
				var slidid="#"+device_id+"Fd";

				//XXX	Slider handling must be here for the moment. Every slider is "static" and belongs to
				//		and is declared for a specific device
				//		Move to doc ready section as soon as possible 

				// eventhandler for the slider. Use a div and id to make distict sliders
				// This function works only if the handler is put AFTER the sliders generated
				// NOTE:: The handler is asynchronous, you never know when it is called
				// and it's context at that moment is unknown wrt variables in this function
				if (jqmobile==1) 
				{ 					// THERMOSTAT SLIDER FOR MOBILE
				  $(function() 
				  {
					var val = load_device(room_id, device_id);
					if (val == 'F0') { val = 0; }
					$( slidid ).slider
					({
					 	stop: function( event, ui ) {
							// This is where it happens for the value of the action
							var id = $(event.target).attr('id');
							var val = $(event.target).val();
							//var val2 = ui.value;
		
							// For slider==0 a special case. We want to switch OFF the device
							// As the dimmer command only accepts values 1-32, for value 0 we
							// make a special case and set the value of button OFF to be pressed.
							if ( val == 0 ) { 								
								// strip id and change val "D1Fd"+"P0" ==>> "D1"+"F0"
								handle_device( id.slice(0,-2), "F" + val );		 
								// Remove hover from "ON" and put the hover on the OFF button
								$("#"+id.slice(0,-2)+"F1").removeClass( 'hover' );
								$("#"+id.slice(0,-2)+"F0").addClass( 'hover' );
							} 
							else { 
								handle_device( id, "P" + val );				// id ="D1Fd", value = "P31"
								$("#"+id.slice(0,-2)+"F0").removeClass( 'hover' );
								$("#"+id.slice(0,-2)+"F1").addClass( 'hover' );
							}
							store_device(s_room_id, id.slice(0,-2), val);
						}
					});
					$( slidid ).slider("refresh");
				  });
				}
				else			// REGULAR THERMOSTAT SLIDER, 
				$(function() 
				{
					// Load database value
					var val = load_device(room_id, device_id);
					// If the OFF buton is pressed, put the slider to lowest position
  					$( slidid ).slider
					({
						range: "max",
						main: 1,
						min: 15,
						max: 25,
						value: val,
						slide: function( event, ui ) {
							// This is where it happens for the label
							// Problem is we need to update the correct label
							var id = $(event.target).attr('id');
							// strip last character of id of slider object
							// and replace with a l for the label object
							// For more than 9 devices, may be 4! chars eg. string ="D10F"							
							var lid = '#' + id.slice(0,-1) + 'l';

							$( lid ).val (ui.value);
						},
						stop: function( event, ui ) {
							// This is where it happens for the value of the action
							var id = $(event.target).attr('id');
							var val = ui.value;
							handle_device( id, "P" + val );				// id ="D1Fd", value = "P31"
							store_device(s_room_id, id.slice(0,-2), val);
						}
					});
					// Initial value of the slider at time of definition
					$( label ).val( val );
  				});// Slider Function
			  break;
			
			  default:
					alert("lamp_button, type: "+device_type+" unknown");
			}// switch	
				
		}// room
	};//for		
					
	s_room_id = new_room_id;				
				
	// Listen to ALL (class) buttons for #gui_devices which is subclass of DIV #gui_content
	$( "#gui_devices" ).on("click", ".dbuttons" ,function(e) 
	{
			e.preventDefault();
//			e.stopPropagation();
			value=$(this).val();									// Value of the button
			var but_id = $(e.target).attr('id');					// id of the device (from the button_id)
			
			switch ( but_id )
			{
			// ROOM ADD BUTTON (Adds a DEVICE to a ROOM)
			case "Ra":
				if (debug>2) alert("activate_room:: Add Device Button: "+but_id);
				// Find an empty device['id'] for this room, and if none left, create a new one
				// at the end of the devices array, provided we do not have more than 16 devices
				// for this room. We could make this a function...
				var ind = 1;
				// Look for matching indexes. This is a time-exhausting operation, but only when adding a device
				while (ind <= max_devices) { 
					for (var i=0; i< devices.length; i++) {
						if (( devices[i]['room'] == s_room_id ) && ( devices[i]['id'].substr(1) == ind )) {
							// alert("found this ind: "+ind+" on pos "+i+", room: "+s_room_id);
							// We found this index is already used!
							break; // for
						}
					}
					// If we are here, then we did not find device with id == "D"+ind
					// So the ind is unused, we use it
					if (i == devices.length){
						
						break; // while
					}
					ind++;
				}
				if (debug > 1) alert("Add device:: room:"+s_room_id+", device: "+ind+", devices.length: "+devices.length);
				// Let user fill in a form at this point!
				
				// Prepare for additional selectbox: The brand of the receiver
				var list = [];
				var str = '<label for="val_3">  Select Brand: </label>'
						+ '<select id="val_3" value="kaku">' ;   // onchange="choice()"
				for (var i=0; i<brands.length; i++) {
					str += '<option>' + brands[i]['name'] + '</option>';
				}
				str += '</select><br />';
				
				// Generate the complete form for adding a device
				// XXX Need to improve and add field for address for example
				//
				var ret;
				var gaddr = Number(s_room_id) + 99;
				askForm('<form id="addRoomForm"><fieldset>'
					+ '<p>You have created a new device, please give it a name and specify its type and brand. '
					+ 'Optionally, the group address can be set if this device address is different from the room address</p>'
					
					+ '<label for="val_1">Name: </label>'
					+ '<input type="text" name="val_1" id="val_1" value="" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					
					+ '<label for="val_2">Type: </label>'
					+ '<select id="val_2" value="switch" ><option selected="selected">switch</option>'
					+ '<option>dimmer</option><br /><option>thermostat</option></select>'
					+ '<br />'
					+ str
					+ '<label for="val_4">Group addr: </label>'
					+ '<input type="text" name="val_4" id="val_4" value="'+ gaddr+'" class="text ui-widget-content ui-corner-all" />'
					+ '<br />'
					
					+ '<label for="val_5">Unit addr: </label>'
					+ '<input type="text" name="val_5" id="val_5" value="'+ ind +'" class="text ui-widget-content ui-corner-all" />'
					+ '</fieldset></form>'
					
					// Return Values in ret[]:
					//	0: Name
					//	1: Type (devices[xxx]['type]'
					//	2: Brand (in str)
					//	3: Group
					//	4: Unit device[xxx]['uaddr'] device address (can be different from the LamPI devices[xxx]['id'] )
					
					// Create
					,function (ret) {
						// OK Func, need to get the value of the parameters
						// Add the device to the array
						// SO what are the variables returned by the function?
						if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);	
						
						// Now figure out the fname for the brand name
						var brnd_id, brnd_nm;
						for (var i=0; i<brands.length; i++) {
							if (brands[i]['name'] == ret[2]) {
								brnd_id = brands[i]['id'];
								brnd_nm = brands[i]['fname'];
							}
						}
						
						// Validate response. Dimmer type is not always allowed. For the moment we trust the user 
						// more or less
						if ((ret[1]=="dimmer") &&  ((brnd_nm != "kaku")&&(brnd_nm != "zwave")) ) {
							alert("Type dimmer is not supported for brand "+brnd_nm);
							return(1);
						}
						if ((ret[1]=="thermostat") && (brnd_nm != "zwave")) {
							alert("Type thermostat is not supported for brand "+brnd_nm);
							return(1);
						}
						
						// All OK? Make a new device in the room
						var newdev = {
							id: "D"+ind,
							room: ""+s_room_id+"",
							gaddr: ret[3],					// Initial Value, is room_id + 99
							name:  ret[0],
							type:  ret[1],
							uaddr: ret[4],
							val: "0",
							lastval: "0", 
							brand: brnd_id
						}
						devices.push(newdev);			// Add record newdev to devices array
						logger(newdev,2);
						send2daemon("dbase","add_device", newdev);
						// And add the line to the #gui_devices section
						activate_room(s_room_id);
						return(1);	//return(1);
						
					// Cancel	
  					}, function () {
							activate_room(new_room_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Create'
				); // askForm
				return(1);		

			break; // Ra add a device to room
			
			case "Rx":
				// We allow deletion of only ONE roomdevice at a time
				// Would like to blur background and disable ALL further activities in room until user clicks on a row
				
				message('<p style="textdecoration: blink; background-color:yellow; color:black;">Click a button to delete ...</p>');
				// alert("Delete a device: \nPlease select the device you like to delete by clicking its radio button left on line. ");

				// Calling this function with parmeter Del does the trick				
				activate_room(new_room_id, "Del");
				// After executing this function recursively, it comes back to this place
				return(1);
			break;
			
			// All OFF in room works; command is sent to daemon who updates the database too.
			case "Fa":
				
				// Send the All Off message to the daemon (or handle with Ajax)
				handle_device( "", "Fa" );
				// for every device in this room set memory value to off, exception for thermostats
				for (var j=0; j< devices.length; j++) {
					if ((devices[j]['room'] == s_room_id ) && (devices[j]['type'] != "thermostat" )) {
						//
						// store_device updates the devices[][] array
						store_device(s_room_id, devices[j]['id'], "OFF"); // Was F0
						logger("activate_room:: All Off command for device: "+devices[j]['uaddr'],2);
					}
				}
				// And update the page, or update row. Given that all devices are
				// affected by this command, we will redraw the page
				activate_room(s_room_id);
				return(1);
			break;
			
			default:
				// DO NOTHING, must be a device button pressed, so continue reading below
			}
			
			// Now first see if we have a special case with op selectable boxes
			// DEL Delete action by pressing a line when the checkbox is open.
			if ((selectable == "Del") && ( $(this).attr("type" ) == "checkbox") ) 
			{ 
				if (debug < 1) $("#gui_messages").empty();			// Clear messages
				// Button id pressed = D1c -> D16c
				var id = but_id.slice(0,-1);						// As device id may range D1-D16, only strip the last 'c'
				var dev_index = find_device(s_room_id,id);
				var that = $(this);
				message("Device to delete: id Name" + devices[dev_index]['name'], 0);
				
				myConfirm('You have selected device '+devices[dev_index]['name']+' for deletion. Do you really want to delete this device?', 
					// Confirm
					function () {
						that.closest("tr").remove() ;
						// remove that device from the devices array. Send removed back to the backend to persist
						var removed = devices.splice(dev_index ,1);
						logger(removed[0]);
						send2daemon("dbase","delete_device", removed[0]);
						if (debug>1)
								alert("Removed from dbase:: id: " + removed[0]['id'] + " , name: " + removed[0]['name']);
						
						// Sync devices array to the database OR send it the device to-be-removed
						if (debug > 1)
							alert ("Removed object id:" + id );
							// Should do the trick as there is no further device to handle
							activate_room(new_room_id);
						return(1);
					// Cancel	
  					}, function () {
							activate_room(new_room_id);
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Confirm Delete'
				);
				// Return here as there is no device to handle
				return(1);
			}

			// SEL Select a row, for example to be used inside a scene
			//
			if (( selectable == "Sel" ) && ( $(this).attr("type") == "checkbox")) 
			{
				message("Device Add",1);
				alert ("Device Add\nid: " + id );
				return(1); // Must be the last line in this IF
			}
			
			// ELSE :: THIS IS A REGULAR DEVICE BUTTON 
			// Assume that one of the device buttons were pressed on the #gui_devices
			// screen. So just normal operation. Perform the button actions
			
			// Although a button is pressed, the behaviour for ON and OFF
			// is different for switches and dimmers:
			// A switch will just ON/OFF like the default code.
			// NOTE: value contains the value of the button (OFF or ON) on screen
			
			// Translate the value of button to a meaningful device message to be sent to backend
			// Button ID, affected are D1F0 -> D16F0.
			var but_id = $(this).attr("id"); 
			id = but_id.slice(0,-2);							// XXX Take last 2 chars off from button ID to get device ID
			value=$(this).val();
			
			handle_device(id, value);							// id like "D1", button value like "ON" or "OFF"
			
			// Store device will also deal with ON and OFF. It stores in SQL
			store_device(s_room_id, id, value);
			
			// Now we want to mark the buttons as selected
			if (jqmobile==1) {
				var hif;
				if (but_id.substr(-1,1) =="0") hif = but_id.slice(0,-1)+"1"; 
				else 						hif = but_id.slice(0,-1)+"0";
				$( "#"+hif ).removeClass( 'hover' );
				$( this ).addClass ( 'hover' );
			}
			else {
				// parents are the <td>, their siblings the other <td>, the children of <td> are the "<input> elements
				$( this ).parent().siblings().children().removeClass( 'hover' );
				$( this ).addClass ( 'hover' );
			}

			// This will return ALL classes for button attribute
			button_class = $(e.target).parent().parent().attr('class');
			
			// Update the slider of the dimmer to match the button pressed
			if (button_class == 'devrow dimrow' )
			{
				// dimmer specific button
				var slid_id="#" + id +"Fd";			
				value = load_device(s_room_id, id);
				// If lamp is OFF, set the slider to left position. Use slider value 0 for this.
				if ( value == "OFF" ) { value = 0; }
				
				if ( jqmobile==1 ) {
					$ ( slid_id ).val( value ) ;
					$ ( slid_id ).slider("refresh");			// Needed for jQuery mobile to actualize sliders
				}
				else {
					
					// Set the slider in the right position after button press (either most left, or on last value)
					$( slid_id ).slider("option", "value", value );
					// Set the input label field also on correct value
					var label="#"  + id +"Fl";
					$ ( label ).val( value ) ;
					// alert("init_lamps:: class: "+button_class+"\nslid_id"+ slid_id + "\nvalue: "+value+"\nlabel: "+label);
				}
			} else
			{
			// This is a regular button. if there are special commands for this situation they go here

			}
	}); // End of button Handler
		
	// SORTABLE
		// Make the table sortable. It allows us to define a table with buttons above that are 
		// Not sortable but still look quite the same as these ... And for button handling it does
		// not see the difference.
	if(jqmobile == 1) {								// For jqmobile make a different sortable (later)
		
			// *** SORTABLE NOT IMPLEMENTED YET FOR MOBILE ***
		
	}
	else
	{// Sortable works different for mobile and webbased
		var start_pos;
		$("#gui_devices tbody").last().sortable({

			start: function (event, ui) {
            	$(ui.item).data("startindex", ui.item.index());
				start_pos = ui.item.index();
				logger( "Start pos: " + start_pos );
        	},
			// NOTE: index 0 contains the header and is undefined, DO NOT USE IT
			stop: function (event, ui) {
				var mylist;
				var stop_pos = ui.item.index();
				var stop_index;
				var start_index;
				
				logger( "sortable:: start_pos: "+start_pos+", stop_pos: "+stop_pos);
            	//self.sendUpdatedIndex(ui.item);
				j=0;
				for (var i=0; i<devices.length; i++) {
						if (devices[i]['room'] != s_room_id) {		// Find next device in THIS room
							continue;
						}
						if (j==start_pos) { 
							start_index = i;
						}
						else if (j==stop_pos) {
							stop_index = i;
						}
						j++;
				}//for
				logger( "room: "+s_room_id+",start_index: "+start_index+", stop_index: "+stop_index);
				logger( "room: "+s_room_id+",start_pos:   "+start_pos+", stop_pos:     "+stop_pos);
				
				// start_index en stop_index contain indexes of the elements
				// that will be involved in the move !!
				var removed = devices.splice(start_index,1);
				var effe = devices.splice(stop_index,0,removed[0]);
				
				logger( "name of device moved: "+removed[0]['name']);
				
				// Need to update the database (ever) for every stop event!
				var j=1
				for (var i=0; i<devices.length; i++) {
					if (devices[i]['room'] != s_room_id) {		// Find next device in THIS room
							continue;
					}
					// Might have to remove the old content of the database table first
					// After all, when removing devices there might be holes in the index table.
					// send2daemon("dbase","delete_device", devices[i]);
					// Then add the correct values
					devices[i]['id']="D"+j;
					logger( "storing device: id: "+devices[i]['id']+", name: "+devices[i]['name']);
// XXX					send2daemon("dbase","store_device", devices[i]);
					
					j++;
				}
        	}// stop 
		}).disableSelection();
		// Sorting done, updated the devices array to reflect the changes, 	
	}//else
} // activate_room


// ---------------------------------------------------------------------------------------
//
// Change a scene based on the index of the menu button pressed on top of page
// For each secen we record a set of user actions.
// For the moment we can show the complete sequence, delete it and/or record a new sequence
//
function activate_scene(scn)
{
	$( "#gui_content" ).empty();
	$( "#gui_content" ).css( "overflow-y", "auto" );	
	html_msg = '<div id="gui_scenes"></div>';
	$( "#gui_content" ).append (html_msg);
	
	var offbut, onbut;	
		// For all devices, write all to a string and print string in 1 time
	for (var j = 0; j<scenes.length; j++ )
	{
		var scene_id = scenes[j]['id'];		
		if (scn == scene_id )
		{
			if (debug > 2) alert("Activate_screen:: Making buttons for scene: " + scene_id);
			// Start a table for the control buttons
			html_msg = '<table border="0">';
			$( "#gui_scenes" ).append( html_msg );
	
			var table = $( "#gui_scenes" ).children();		// to add to the table tree in DOM
			var scene_name = scenes[j]['name'];
			var scene_seq = scenes[j]['seq'];

			// By making first row head, we make it non sortable as well!!
			var but =  '<thead>'	
					+ '<tr class="switch">'
					+ '<td colspan="2">'
					+ '<input type="submit" id="Fx'+scene_id+'" value="X" class="dbuttons scene_button del_button">'
					+ '<input type="submit" id="Fr'+scene_id+'" value="+" class="dbuttons scene_button new_button">'
					+ '</td>'
					+ '<td colspan="2"><input type="input"  id="Fl'+scene_id+'" value= "'+scene_name+'" class="dlabels"></td>' 
					
					+ '<td><input type="submit" id="Fc'+scene_id+'" value="STOP" class="dbuttons scene_button">'
					+ '<input type="submit" id="Fe'+scene_id+'" value="Store" class="dbuttons scene_button">'
					+ '<input type="submit" id="Fq'+scene_id+'" value=">" class="dbuttons scene_button play_button">'
					+ '</td></thead>'
					;
			$(table).append(but);
			$(table).append('<tbody>');
			
			if (scene_seq != "")  {									// Test for empty array
			  var scene_split = scene_seq.split(',');				// If NO elements found, it still retuns empty array!!
			  for (var k = 0; k < scene_split.length; k+=2 )
			  {
				var ind = ((k/2)+1);			// As k is always even, the result will be rounded to integer
				
				// scene sequence: !FeP"name"=,!R1D1F1,00:00:15,!R1D2F1,00:00:05, .......
				// So we need to split the sequence by the comma and then display 2 lines for every command
				var scmd = decode_scene_string( scene_split[k] );
				var stim = decode_scene_string( scene_split[k+1]);
				but = '<tr class="scene">'
					+ '<td><input type="checkbox" id="s'+scene_id+'c" name="cb'+ind+'" value="yes"></td>'
					+ '<td> ' + ind
					+ '<td><input type="input" id="Fs'+scene_id+'i'+ind+'" value= "'+scene_split[k]+'" class="dlabels sval"></td>'
					+ '<td><input type="text" id="Ft'+scene_id+'t'+ind+'" value= "'+scene_split[k+1]+'" class="dbuttons scene_button sval"></td>'
					+ '<td>' + scmd 
					;
				$(table).append(but);
			  } // for
			}// if
			else {
				ind=0;												// First in row
			}
			
			// If we were recording actions, this is the moment to add a new command to the 
			// Scene or sequence 
			
			if (s_recording == 1) {
				
				scmd = decode_scene_string(s_recorder);
				
				// Return here as there is no device to handle
				
				logger("Need to decode s_recorder");
				// Should we do this, or keep on recording until the user presses the recording button again?
				s_recording = 0;
				ind++;												// If list was empty, ind was 0, becomes 1

				but = '<tr class="scene">'
					+ '<td><input type="checkbox" id="s'+scene_id+ 'c" name="cb' + ind +'" value="yes"></td>'
					+ '<td>' + ind
					+ '<td><input type="input" id="Fs'+scene_id+'i'+ind+'" value= "'+s_recorder+'" class="dlabels sval"></td>'
					+ '<td><input type="text" id="Ft'+scene_id+'t'+ind+'" value= "'+"00:00:10"+'" class="dbuttons scene_button sval"></td>'
					+ '<td colspan="2">' + scmd 
					;
				$(table).append(but);
				
				// Make sure to sync the new record to the array
				// Or should we use the global var s_scene_id?
				if (ind == 1) {
					// First device in the scene.seq
					scenes[j]['seq'] = s_recorder + ",00:00:10";
				}
				else {
					// All other device commands are separated with a ","
					scenes[j]['seq']+= "," + s_recorder + ",00:00:10";
				}
				
			    if (debug>2) alert("Recorder adding:: j: "+j+", s_scene_id: "+s_scene_id+"\n"
					  + "\n id: "+scenes[j]['id']+"\nval: "+scenes[j]['val']
					  + "\n name: "+scenes[j]['name']+"\nseq: "+scenes[j]['seq']);
				
				
				// If this is the first line in the scene database
				send2daemon("dbase","store_scene", scenes[j]);
				message("Device command added to the scene");	
			}// if recording
		}// if 
	}// for
	// ------SORTABLE---REQUIRES MORE WORK -------
	// Sortable put at the end of the function
	// The last() makes sure only the second table is sortable with the scene elements
	
	// Note: Unsure if we should use scene_split var, as this function is async!
	// however, scene_split is in the scope of this function, and contains the
	// scurrent values on the screen...... but it works!
	if (jqmobile == 1) {
		
		// jmobile scenes NOT sortable at the moment
		
	}
	else {
	  $("#gui_scenes tbody").sortable({

		start: function (event, ui) {
            $(ui.item).data("startindex", ui.item.index());
        },
		// Make sure we select the second table!
		stop: function (event, ui) {

			var my_list = '';
			// Go over each element and record the id
			$( "#gui_scenes .scene" ).each(function( index ) {
				var id = 	$(this ).children().children('.dbuttons').attr('id');	
				// XXX Assumption that scene id is only 1 digit!!
				var ind = id.substr(4);
			// XXX Need to implement sortable
				logger( "scn: " + scn + " html index: " + index + " scene ind: " + ind );
				
				my_list += scene_split [(ind-1)*2] + ',' + scene_split [((ind-1)*2) + 1] + ',' ;
			});
			// Now we need to remove the last ","
			logger("my_list :" + my_list);
			my_list = my_list.slice(0,-1);
			logger("scene: " + scn + ", " + scenes[scn-1]['name'] + ", my_list: " + my_list );
			// XXX OOPS, not nice, should look up the index, not assume ind[1] is same as array index 0
			scenes[scn-1]['seq'] =  my_list;
        }	 
	  }).disableSelection();
	}
	
	s_scene_id = scn;
} // activate scene


// ------------------------------------------------------------------------------
// Activate Timer
// 
// Let the user specify timing parameters for execution of a particular Scene
// Next to the obvious startdate/emdate and a timer settings it also allows
// complex timing setting such as sunrise/sunset and block out days or months 
// in the timing
// 
function activate_timer(tim)
{
	if (debug>2) alert("activate_timer");
	$( "#gui_content" ).empty();
	
	html_msg = '<div id="gui_timers"></div>';
	$( "#gui_content" ).append (html_msg);
	
	var offbut, onbut;	
		// For all devices, write all to a string and print string in 1 time
	for (var j = 0; j<timers.length; j++ )
	{
		
		var timer_id = timers[j]['id'];		
		if (tim == timer_id )
		{
			var timer = timers[j];
			// Start a table for the control buttons
			html_msg = '<table border="0">';
			$( "#gui_timers" ).append( html_msg );
	
			var table = $( "#gui_timers" ).children();		// to add to the table tree in DOM
			var timer_name = timers[j]['name'];
			
			// alert("activate_timer:: id:"+timer_id+"\nname: "+timer_name+"\nSeq: "+timer_seq);
			
			// By making first row head, we make it non sortable as well!!
			// Here we define the header row with the edit buttons
			var but =  '<thead>'	
					+ '<tr class="switch">'
					+ '<td><input type="submit" id="'+timer_id+'Fe" value="Store" class="dbuttons play_button" style="min-width:100px;"></td>'
					+ '<td><input type="input"  id="'+timer_id+'Fl" value="'+timer_name+'" class="dlabels"></td>' 
					+ '<td>'
					+ '<input type="submit" id="' + timer_id + 'Fx" value="Cancel Once" class="dbuttons stop_button" >'
					//+ '<input type="submit" id="' + timer_id + 'Fr" value="+" class="dbuttons new_button" >'
					+ '</td></thead>'
					;
			$(table).append(but);
			$(table).append('<tbody>');

			// SELECT SCENE. First the scene selected 
			var str  = '<tr>' ;
				str += '<td><label for="scene">Select Scene: </label></td>' ;
				str	+= '<td><select id="scene" value="scene" style="font-size:normal;" class="dlabels">' ; 
			for (i=0; i< scenes.length; i++) {
				if (scenes[i]["name"] == timer['scene'] ) {
					str += '<option class="dlabels" value="'+scenes[i]["name"]+'" selected>' +scenes[i]["name"]+ '</option>';
				} else {
					str += '<option class="dlabels" value="'+scenes[i]["name"]+'" >' +scenes[i]["name"]+ '</option>';
				}
			}
			str += '</select></td>'
			// Now we have option info, we can build the form
			but = '<tr class="timer">'
					+ '<form><fieldset name="scene_select">'
					+ str
					+ '<br />'
					+ '</fieldset></form>' 	
				;
			$(table).append(but); 
			
			// SELECT Start Time
			var spl = timer['tstart'].split(":");
			// Label
			var str1 = '<tr><td><label for="tstart">Start time: </label></td>'
			// Value box
			var str2  = '<td><input type="text" id="Tv" value= "';
			switch (spl[0]) {
				// Sunrise - min * 30 
				case "96":
					str2 += "Sunrise - "+spl[1]*30 +" minutes";
				break;
				// Sunrise + min * 30
				case "97":
					str2 += "Sunrise + "+spl[1]*30+" minutes";
				break;
				// Sun Dawn - min * 30
				case "98":
					str2 += "Sunset - "+spl[1]*30+" minutes";
				break;
				// Sundawn + min * 30
				case "99":
					str2 += "Sunset + "+spl[1]*30+" minutes";
				break;
				// Regular Time notation
				default:
					str2 += ("00"+spl[0]).slice(-2)+":"+("00"+spl[1]).slice(-2);
			}
			str2 += '" class="dlabels sval" style="width:120px;">';				// Just label value
			//str2 += '" class="dlabels dbuttons" style="width:150px;">';		// clickeable
			str2 += '</td>';
			
			str3  = '<td>';
			str3 += '<input type="submit" id="Ts" value="Time" class="dbuttons timbut">';
			str3 += '<input type="submit" id="Tr" value="SunRise" class="dbuttons timbut" >';
			str3 += '<input type="submit" id="Td" value="SunSet" class="dbuttons timbut" >';
			str3 += '</select></td>';
			
			// Now we have option info, we can build the form
			but = '<tr class="timer">'
				+ str1
				+ str2
				+ '<form><fieldset>'
				+ str3
				+ '<br />'
				+ '</fieldset></form>' 
				+ '</tr>'
				;
			$(table).append(but); 
			//
			// Highlight the correct button
			$( '.timbut' ).removeClass( 'hover' );
			if ((spl[0]=="96") || (spl[0]=="97")) { $('#Tr').addClass( 'hover' ); }
			else if ((spl[0]=="98") || (spl[0]=="99")) { $('#Td').addClass( 'hover' ); }
			else { $('#Ts').addClass( 'hover' ); }
			
			// SELECT STARTD
			// alert("timer startd: " + timer['startd']);
			str  = '<td>Start Date: </td>';
			// QQQ
			
			//alert("startd:: 20"+yy+mm+dd);
			if (jqmobile != 1) {
				str += '<td><input  class="dlabels" type="text" id="startd" value="'+timer['startd']+'"/></td>';
				but = '<tr class="timer">'
					+ '<form><fieldset>'
					+ str
					+ '</fieldset></form>'
					+'</tr>'
				;
				$(table).append(but); 
			 	$(function() {
					$( "#startd" ).datepicker({ dateFormat: "dd/mm/y" });
				});
			}
			else { // jqmobile version not yet released ..
				var dd = timer['startd'].substr(0,2);
				var mm = timer['startd'].substr(3,2);
				var yy = timer['startd'].substr(6,2);
				str += '<td><input  class="dlabels" type="text" min="2013-12-15" id="startd" value="20'+yy+'-'+mm+'-'+dd+'"/></td>';
				but = '<tr class="timer">'
					+ '<form><fieldset>'
					+ str
					+ '</fieldset></form>'
					+'</tr>'
				;
				$(table).append(but); 
				startd = $("#startd").mobipick({
        				dateFormat: "dd/MM/yy"
    			});
				startd.on("change",function() {
						timer['startd']= $( "#startd").val();
						alert("startd:: "+timer['startd']);
				});
			 	//$(functirt("res:: "+res);on() {
				//	$( "#startd" ).datepicker({ dateFormat: "dd/mm/y" });
				//});
			}
			
			// SELECT ENDD
			// alert("timer endd: " + timer['endd']);
			str  = '<td>End Date: </td>';
			if (jqmobile != 1) {
				str += '<td><input  class="dlabels" type="text" id="endd" value="'+timer['endd']+'"/></td>';
				but = '<tr class="timer">'
					+ '<form><fieldset>'
					+ str
					+ '</fieldset></form>'
					+'</tr>'
				;
				$(table).append(but); 
			 	$(function() {
					$( "#endd" ).datepicker({ dateFormat: "dd/mm/y" });
				});
			}
			else {
				var dd = timer['endd'].substr(0,2);
				var mm = timer['endd'].substr(3,2);
				var yy = timer['endd'].substr(6,2);
				str += '<td><input  class="dlabels" type="text" min="2013-12-15" id="endd" value="20'+yy+'-'+mm+'-'+dd+'"/></td>';
				but = '<tr class="timer">'
					+ '<form><fieldset>'
					+ str
					+ '</fieldset></form>'
					+'</tr>'
				;
				$(table).append(but); 
				endd = $('#endd').mobipick({
        				dateFormat: "dd/MM/yy"
    			});
				endd.on("change",function() {
					timer['endd']= $( "#endd").val();
				});
			}
			
			// Now we need to setup days of the week
			str  = '<td colspan="3"><br /><div class="days">' ;   	
			var dd = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];
			for (var i=0; i<7 ;i++) {	
				if ( timer['days'].substr(i,1) != 'x' ) {
					str += ' '+dd[i]+'<input type="checkbox" id="'+i+'" name="'+dd[i]+'" value="'+i+'" checked="checked" >';
				}
				else {
					str += ' '+dd[i]+'<input type="checkbox" id="'+i+'" name="'+dd[i]+'" value="'+i+'" >';
				}
			}
			str += '</div></td>';
			but  = '<tr><td colspan="3"><p>On what days of the week?</p></td></tr>';
			but += '<tr class="timer">' + str +'<br></tr>' ;
			$(table).append(but);
			
			// Now we need to setup Months selected
			str  = '<tr><td colspan="3"><a>What months should the timer run?</a></td></tr>';
			str += '<tr class="timer"><td colspan="3"><br /><div class="months">';   	
			var mm = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
			for (var i=0; i<12 ;i++) {	
				if ( timer['months'].substr(i,1) != 'x' ) {
					str +=' '+mm[i]+'<input type="checkbox" id="'+i+'" name="'+mm[i]+'" value="'+i+'" checked="checked">' ;
				}
				else {
					str +=' '+mm[i]+'<input type="checkbox" id="'+i+'" name="'+mm[i]+'" value="'+i+'">' ;
				}
			}
			str += '</div></td><br></tr>';
			$(table).append(str); 
			
			// We have to setup am event handler for this timer screen.
			// After all, the user might like to change things and press some buttons
			// NOTE::: This handler runs asynchronous! So after click we need to sort out for which device :-)
			//
			$( "#gui_timers" ).on("click", ".dbuttons" ,function(e) 
			{
				e.preventDefault();
//				e.stopPropagation();
				value=$(this).val();									// Value of the button pressed (eg its label)
				var but_id = $(e.target).attr('id');					// id of button
			
				// s_timer_id tells us which timer is active
				var timer = get_timer(s_timer_id);
				// May have to add: Cancel All timers and Delete All timers
				switch (but_id.substr(-2))
				{					
					//
					// STORE timer button !!! 
					// THIS ONE IS IMPORTANT. We'll LET THE USER PLAY UNTIL HE PRESSES THIS BUTTON!!!
					// So this mans that changes will not be final to the database until this button is pressed.
					case "Fe":	
						var arr = $.map($('.days :input:checkbox:checked'), 
									function(e, i) {
        								return +e.value;
    							});
						//alert("days: " + arr);
						var res = "xxxxxxx";
						var mm  = "mtwtfss";
						for (var i = 0; i< arr.length; i++) {
							res = res.substr(0,arr[i]) + mm.substr(arr[i],1) + res.substr(arr[i]+1);
						}
						timer['days'] = res;
						
						var arr = $.map($('.months :input:checkbox:checked'), 
									function(e, i) {
        								return +e.value;
    							});
						// alert("month: " + arr);
						var res = "xxxxxxxxxxxx";
						var mm  = "jfmamjjasond";
						for (var i = 0; i< arr.length; i++) {
							res = res.substr(0,arr[i]) + mm.substr(arr[i],1) + res.substr(arr[i]+1);
						}
						timer['months'] = res;
						
						timer['scene'] = $("#scene").val() ;
						//timer['tstart'] = $("#Tv").val(); // XXX? timers is update for every change
						timer['startd'] = $("#startd").val();
						timer['endd'] = $("#endd").val();
						
						var str = ''
						+ 'STORE timer::\n'
						+ ", scene: " + timer['scene'] + "\n" 
						+ ", tstart: " + timer['tstart'] + "\n"			// ONly the hrs!!
						+ ", startd: " + timer['startd'] + "\n"
						+ ", endd: " + timer['endd'] + "\n"
						+ ", days: " + timer['days'] + "\n"				// Undefined
						+ ", months: " + timer['months'] + "\n"
						+ ", skip: " + timer['skip'] + "\n"				// Skip one time
						;
						if (debug >=1) logger("store_timer"+str);
						send2daemon("dbase","store_timer", timer); 
						
						// Send to controller
						//message_device("timer", "set", timer_cmd );
					break;
						
					// CANCEL DELETE timer, but instead for timers and for this application we use 
					// Cancel Once
					case "Fx":
						$( '.timbut' ).removeClass( 'hover' );
						$('#Fx').addClass( 'hover' );

						myConfirm('You are about to cancel this timer. If you continue, the system ' 
							+ 'will for one time skip this timer action', 
							// Confirm
							function () {
								// DO nothing....
								// Maybe make the background red during device selection or blink or so
								// with recording in the message area ...
								message('Skipping');
							// Cancel	
  							}, 
							function () {
								message("Not Skipping"); // Avoid further actions for these radio buttons 
								return(0);
  							},
  							'Cancel this timer once?'
						);
						timer['skip']="1";
						set_timer(s_timer_id,timer);
						send2daemon("dbase","store_timer", timer);
						$('#Fx').removeClass( 'hover' );
					break;//Cancel
					
					// Recording
					case "Fr":
						myConfirm('You are about to add a new action to the timer. If you continue, the system' 
						+ 'will be in recording mode until you have selected a device action. Then you are returned'
						+ 'to this timer screen again. Please confirm if you want to add a device.', 
						// Confirm
						function () {
							// DO nothing but blink....
							message('<p style="textdecoration:blink; background-color:red; color:white;">RECORDING</p>');	
  						}, function () {
						// Cancel
								s_recording = 0;
								return(1); // Avoid further actions for these radio buttons 
  						},
  							'Adding a Timer action?'
						);
						s_recording = 1;							// Set the recording flag on!
						s_recorder = "";							// Empty the recorder
						init_rooms("init");
					break;
					
					// Timer Setting
					case "Ts":
						$( '.timbut' ).removeClass( 'hover' );
						$('#Ts').addClass( 'hover' );
						// Find the text field for input and to output to
						var val= $("#Tv").val();
						var hh=""; for (i=0; i<24; i++) {
							if (i==12) hh +='<option selected>'+("00"+i).slice(-2)+'</option>';
							else hh +='<option>'+("00"+i).slice(-2)+'</option>';
						}
						var mm=""; for (i=0; i<60; i++) mm +='<option>'+("00"+i).slice(-2)+'</option>';
			
						var ret=0;
						var frm='<form id="addRoomForm"><fieldset>'
							+ '<p>You can change the timer settings for this action. Please use hh:mm</p>'
							+ '<br />'
							+ '<label for="val_1">hrs: </label>'
							+ '<select id="val_1" value="'+val.substr(0,2)+ '" >' + hh +'</select>'
							+ '<label for="val_2">mins: </label>'
							+ '<select id="val_2" value="' + val.substr(3,2)+ '">' + mm +'</select>'
							+ '</fieldset></form>';
						askForm(
						frm,
						function (ret) {
							// OK Func, need to get the value of the parameters
							// Add the device to the array
							// SO what are the variables returned by the function???
							if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);
						
							// Value of the button pressed (eg its label)
							var laval = ret[0]+":"+ret[1];
							
							// Check the right target
							$("#Tv").val(laval);
							timer['tstart']=laval;
							if (debug>1) alert("Timer changed from "+ val+" to: "+ laval ); 
							// Need to put value back in Array timers
							set_timer(s_timer_id,timer);
							//return(0);	
  						}, 	
						// Cancel
						function () {
							//return(1); // Avoid further actions for these radio buttons 
  						},
  						"Confirm Change"
						);
					break;
					
					// Sunrise/Sundawn Timer Setting
					case "Tr":
						$( '.timbut' ).removeClass( 'hover' );
						$('#Tr').addClass( 'hover' );
						//alert ("SunRise button pressed");
						var val= $("#Tv").val();
						var mm=""; for (i=-4; i<5; i++) {
							if (i==0) mm += '<option selected>'+("00"+i).slice(-2)*30+'</option>';
							else mm += '<option>'+("00"+i).slice(-2)*30+'</option>';
						}
						var ret=0;
						var frm='<form id="addRoomForm"><fieldset>'
							+ '<p>Setting the timer to start at SunRise</p>'
							+ '<br />'
							+ '<label for="val_1">Sunrise offset in minutes: </label>'
							+ '<select id="val_1" value="' + val.substr(3,2)+ '">' + mm +'</select>'
							+ '</fieldset></form>';
						askForm(
						frm,
						function (ret) {
							// OK Func, need to get the value of the parameters
							// Add the device to the array
							// SO what are the variables returned by the function???
							if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);
						
							// Value of the button pressed (eg its label)
							if (ret[0]<0) {
							
									laval = "SunRise - " + ret[0].substr(1) + " minutes";
									timer['tstart']="96:"+("00"+ret[0]/-30).slice(-2);
							}
							else {
									laval = "SunRise + " + ret[0] + " minutes";
									timer['tstart']="97:"+("00"+ret[0]/30).slice(-2);
							}
							
							// Check the right target
							$("#Tv").val(laval);
							if (debug>1) alert("Timer changed from "+ val+" to: "+ laval);
							 
							// write back new value to array object timers
							set_timer(s_timer_id,timer);
							//return(0);	
  						}, 	
						// Cancel
						function () {
							//return(1); // Avoid further actions for these radio buttons 
  						},
  						"Set Sunrise Timer"
						);
					break;
					
					// Sunset/Sundusk timing setting
					case "Td":
						$( '.timbut' ).removeClass( 'hover' );
						$('#Td').addClass( 'hover' );
						
						var val= $("#Tv").val();
						var mm=""; for (i=-4; i<5; i++) {
							if (i==0) mm += '<option selected>'+("00"+i).slice(-2)*30+'</option>';
							else mm += '<option>'+("00"+i).slice(-2)*30+'</option>';
						}
						var ret=0;
						var frm='<form id="addRoomForm"><fieldset>'
							+ '<p>Setting the timer to start at SunSet</p>'
							+ '<br />'
							+ '<label for="val_1">Sunset offset in minutes: </label>'
							+ '<select id="val_1" value="' + val.substr(3,2)+ '">' + mm +'</select>'
							+ '</fieldset></form>';
						askForm(
						frm,
						// Create
						function (ret) {
							// OK Func, need to get the value of the parameters
							// Add the device to the array
							// SO what are the variables returned by the function???
							if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);
						
							// Value of the button pressed (eg its label)
							if (ret[0]<0) {
							
									laval = "SunSet - " + ret[0].substr(1) + " minutes";
									timer['tstart']="98:"+("00"+ret[0]/-30).slice(-2);
							}
							else {
									laval = "SunSet + " + ret[0] + " minutes";
									timer['tstart']="99:"+("00"+ret[0]/30).slice(-2);
							}
							
							// Check the right target
							$("#Tv").val(laval);
							if (debug>1) alert("Timer changed from "+ val+" to: "+ laval);
							 
							// write back new value to array object timers
							if (set_timer(s_timer_id,timer) < 0)
								alert("Cannot set timer values in object");	
  						}, 	
						// Cancel
						function () {
							
  						},
  						"Set Sunset Timer"
						);
					break;
					// If we press the timevalue field (must be of class dbuttons to work)
					// Then start with either time of dusk value based upon which one is highlighted!
					case "Tv":
						// Which button is hover?
						// Do the appropriate action?
						if ( $( '#Ts' ).hasClass( "hover" ) ) {alert("Ts time")} ;
						if ( $( '#Tr' ).hasClass( "hover" ) ) {alert("Tr sunrise")} ;
						if ( $( '#Td' ).hasClass( "hover" ) ) {alert("Td sunsetk")} ;	
					break;
					
					default:
					// Could be users editing sequence in input field (yuk)
						alert("Sequence action unknown: "+but_id.substr(-2) );
				}
			})
		}
	}
	s_timer_id = tim;
	
} //activate_timer




// ---------------------------------------------------------------------------------------
//
// Change a handset based on the index of the menu button pressen on top of page
// For each handset we record a scene per button.
//
function activate_handset(hset)
{
	$( "#gui_content" ).empty();
	$( "#gui_content" ).css( "overflow-y", "auto" );
	//html_msg = '<div id="gui_handsets" style="overflow-y:scroll;"></div>';
	html_msg = '<div id="gui_handsets"></div>';
	$( "#gui_content" ).append (html_msg);
	
	var offbut, onetime, onbut;
	// For all handsets, write all to a string and print string in 1 time
	onetime=0;
	for (var j= 0; j<handsets.length; j++ )
	{
		var handset_id = handsets[j]['id'];	
		// If the definition is for the active handset handset_id
		if (hset == handset_id )
		{
			if (debug > 2) alert("Activate_handset:: Making buttons for handset: " + handset_id);
			var handset_name  = handsets[j]['name'];
			var handset_scene = handsets[j]['scene'];
			var handset_addr   = handsets[j]['addr'];
			var handset_unit  = handsets[j]['unit'];
			var handset_val   = handsets[j]['val'];
			
			// Start a table for the control buttons
			// Since we have multiple records with the same id, do this only once
			if (onetime == 0) 								
			{
				html_msg = '<table border="0">';
				$( "#gui_handsets" ).append( html_msg );
	
				var table = $( "#gui_handsets" ).children();		// to add to the table tree in DOM
			
				// alert("activate_handset:: id:"+handset_id+"\nname: "+handset_name+"\nSeq: "+handset_seq);
				// By making first row head, we make it non sortable as well!!
				var but =  '<thead>'	
					+ '<tr class="switch">'
					+ '<td colspan="2">'
					+ '<input type="submit" id="Fx'+handset_id+'" value="X" class="dbuttons del_button">'
					+ '<input type="submit" id="Fr'+handset_id+'" value="+" class="dbuttons new_button">'
					// + '<input type="submit" id="Fq'+handset_id+'" value=">" class="dbuttons play_button">'
					+ '</td>'
					+ '<td colspan="2"><input type="input"  id="Fl'+handset_id+'" value= "'+handset_name+'" class="dlabels"> addr: '+handset_addr+'</td>' 
					+ '<td>'
					+ '<input type="submit" id="Fe'+handset_id+'" value="Store" class="dbuttons"></td>'
					+ '</thead>'
					;
				$(table).append(but);
				$(table).append('<tbody>');
				onetime=1;												// Do not print the header row again.
			}
			
			// Output the buttons for this handset
			// Test for empty array
			if (handset_scene != "")  {	
			  
			  var handset_split = handset_scene.split(',');			// If NO elements found, it still retuns empty array!!
			  for (var k = 0; k < handset_split.length; k+=2 )
			  {
				var ind = ((k/2)+1);			// As k is always even, the result will be rounded to integer
				var onoff; if (handset_val==0 ) onoff="off"; else onoff="on";
				// scene sequence: !FeP"name"=,!R1D1F1,00:00:15,!R1D2F1,00:00:05, .......
				// So we need to split the sequence by the comma and then display 2 lines for every command
				var scmd = decode_scene_string( handset_split[k]  );
				var stim = decode_scene_string( handset_split[k+1]);
				but = '<tr class="handset">'
					+ '<td><input type="checkbox" id="s'+handset_id+'c" name="cb'+ind+'" value="yes"></td>'
					+ '<td>But ' + handset_unit +' '+ onoff + '</td>'
					+ '<td><input type="input" id="Fs'+handset_id+'u'+handset_unit+'v'+handset_val+'i'+ind+'" value= "'+handset_split[k]+'" class="dlabels sval"></td>'
					+ '<td><input type="text" id="Ft'+handset_id+'u'+handset_unit+'v'+handset_val+'i'+ind+'" value= "'+handset_split[k+1]+'" class="dbuttons sval"></td>'
					+ '<td>' + scmd 
					;
				$(table).append(but);
			  } // for
			}// if
			else {
				ind=0;												// First in row
			}
			
			// If we were recording actions, this is the moment to add a new command to the 
			// Scene or sequence 
			
			if (s_recording == 1) {
				
				scmd = decode_scene_string(s_recorder);
				
				// Return here as there is no device to handle
				logger("Decode s_recorder to: "+scmd);
				// Should we do this, or keep on recording until the user presses the recording button again?
				s_recording = 0;
				ind++;												// If list was empty, ind was 0, becomes 1

				but = '<tr class="handset">'
					+ '<td><input type="checkbox" id="s'+handset_id+ 'c" name="cb' + ind +'" value="yes"></td>'
					+ '<td>But ' + ind
					+ '<td><input type="input" id="Fs'+handset_id+'u'+handset_unit+'v'+handset_val+'i'+ind
					  +'" value= "'+s_recorder+'" class="dlabels sval"></td>'
					+ '<td><input type="text" id="Ft'+handset_id+'u'+handset_unit+'v'+handset_val+'i'+ind
					  +'" value= "'+"00:00:10"+'" class="dbuttons sval"></td>'
					+ '<td colspan="2">' + scmd 
					;
				$(table).append(but);
				
				// Make sure to sync the new record to the array
				// Or should we use the global var s_handset_id?
				if (ind == 1) {
					// First device in the handset.seq
					handsets[j]['scene'] = s_recorder + ",00:00:10";
				}
				else {
					// All other device commands are separated with a ","
					handsets[j]['scene']+= "," + s_recorder + ",00:00:10";
				}
				
			    if (debug>2) alert("Recorder adding:: j: "+j+", s_handset_id: "+s_handset_id+"\n"
					  + "\n id: "+handsets[j]['id']+"\nval: "+handsets[j]['val']
					  + "\n name: "+handsets[j]['name']+"\nseq: "+handsets[j]['scene']);
				
				
				// If this is the first line in the scene database
				send2daemon("dbase","store_handset", handsets[j]);
				message("Device command added to the handsets",1);
				
			} // if recording

			// We have to setup an event handler for this handsets.
			// After all, the user might like to change things and press some buttons
			
		}// if a handset is s_handset_id
	}// for each handset
	
	// NOTE::: This handler runs asynchronous! No values above might be valid!!
	// So after click we need to sort out for which handler, which scene etc :-)
	// Therefore, collect all scene data again in this handler.
	//
	$( "#gui_handsets" ).on("click", ".dbuttons", function(e) 
	{
		e.preventDefault();
//		e.stopPropagation();
		value=$(this).val();									// Value of the button pressed (eg its label)
		var but_id = $(e.target).attr('id');					// id of button
		var cmd_id = parse_int(but_id)[0]; 
		//alert ("s_handset_id: " + s_handset_id + ", but_id: " + but_id + ", cmd_id: " + cmd_id);
		
		// id="Fx2u3v1"
		// First chars of the button id contain the action to perform
		// Then we have the id of the handset, followed by "u" and unit number
		// and "v"<value>
		switch (but_id.substr(0,2))
		{
			// START button, queue scene
			//
			//case "Fq":
			// Fq not used for handsets!!
				// Send to the device message_device
			//	var handset_cmd = '!FqP"' + handset['name'] + '"';
				// Send to device. In case of a Raspberry, we'll use the backend_rasp
				// to lookup the command string from the database
			//	message_device("handset", "run", handset_cmd );

			//break;
					
			// STORE button, only for Raspi Controllers
			case "Fe": //  works, 131120
				
				var handset = get_handset(s_handset_id);
				var handset_name = handset['name'];	
				
				// XXX We might have deleted handsets entries during delete that are NOT
				// deleted from the MySQL database. Need to keep these insync.
				// EITHER during store_hangset (first delete all records with this id, then add the new range)
				// OR by deleting these entries in the Fx section already....
				for (var j=0; j<handsets.length; j++) 
				{
					if (handsets[j]['id'] == s_handset_id) {
						logger("Fe Storing handset:: "+handset_name+":"+handsets[j]['unit']+":"+handsets[j]['val'] );
						// Send to database and update the current scene record
						send2daemon("dbase","store_handset", handsets[j]);
					}
				}
				// Not Applicable for the ICS-1000 controller
				// So we need not to do the next lines for ICS-1000
				// var handset_cmd = '!FeP"' + handset['name'] + '"=' + handset['scene'];
				// message_device("handset", "set", handset_cmd );
			break;

			//
			// DELETE handset line, ONE of the actions in the seq!!! for the button
			case "Fx": // Works, 131120
	
				if (debug > 2) alert("Activate_handset:: Delete Fx button pressed" );
				// NOTE:: See activate_handset, if the last element of a scene is deleted, we have an
				// empty remote button defined without further action(s).
				// When ading new handset have to check for already existing empty handsets/buttons
				
				var msg = "Deleted actions ";
				if (debug>0) {
					
					myConfirm('You are about to delete one or more button actions for this handset. '
					+ 'If you continue, all lines that you checked will be deleted from the system '
					+ 'and this will be synchronized with the database.\n'
					+ 'Please keep in mind that you will delete ALL lines that you checked and and its corresponding actions '
					, 
					// Confirm
					function () {
						// Confirm
						
						// Go over each TR element with id="handset" and record the id
						// We need to go reverse, as else removing will mess up higher indexes to come,
						// this will not be the case if we work down the array.
						// NOTE: Index == 0 for last element of array!!
						$($( "#gui_handsets .handset" ).get().reverse()).each(function( index ){
																
							var id    = $(this ).children().children('.dlabels').attr('id');
							var value = $(this ).children().children('.dlabels').attr('value');
					
							var handset_id   = parse_int(id)[0];
							var handset_unit = parse_int(id)[1];
							var handset_val  = parse_int(id)[2];
							var ind          = parse_int(id)[3];
					
							handset = get_handset_record(handset_id,handset_unit,handset_val);
							handset_scene = handset['scene'];
							var handset_split = handset_scene.split(',');				// Do in handler
					
							// Lookup value and put index in ind
							var ind = handset_split.indexOf(value);
							//
							// This part is different for handsets than it is for scenes!

							if ( $(this ).children().children('input[type="checkbox"]').is(':checked') ) {

								if (debug > 1) alert ("delete handset button: "+handset_name+
									"\nid: "+id+", scene ind: "+ind+" selected, index: "+index+
									"\nHandset id: "+handset_id+", unit: "+handset_unit+", val: "+handset_val+
									"\nScene: "+handset_scene
								);
								// Finding the index of the item and time to delete is difficult!
								var removed = handset_split.splice(ind,2);
								ind --;				// After deleting from handset_split, adjust the indexes for
													// rest of the array	
								if (debug > 1) alert("removed:"+removed[0]+ "," +removed[1]+": from seq: "+handset_split );
								msg += ind + " : " + decode_scene_string( removed[0] ) + "; " ;
						
								// Now updat the handsets array again to reflact the change
								// We need to find the index of array handsets to update. As we are in a handler
								// we cannot rely on the j above but need to find the index from 'id' field in handsets
				
								//alert("Updating id:unit:val: "+handset_id+":"+handset_unit+":"+handset_val);
								for (var j=0; j<handsets.length; j++) {
									if (   (handsets[j]['id']   == handset_id) 
										&& (handsets[j]['unit'] == handset_unit) 
										&& (handsets[j]['val']  == handset_val) )
									{
										// We found a match id,unit,val
										// Now concatenate all actions and timers again for the scene_split
										if (typeof(handset_split) == "undefined") {
											if (debug>2) alert("activate_handset:: case FX: handset_split undefined");
										}
										else {
											handsets[j]['scene']=handset_split.join();
											if (debug>2) alert("scene: " + handsets[j]['scene']);
										}
										break;
									}
								}// for
							}// if checkbox
						});//for all handsets on screen
				
						message(msg);
						activate_handset(s_handset_id);	
  					}, function () {
						// Cancel
							activate_handset(s_handset_id);	
							return(0); 					// Avoid further actions for these radio buttons 
  					},
  					'Continue Deleting Handet(s)?'
					);
				}
				// Do NOT store in dabase unless the user stores the sequence by pressing the STORE button							
			break;
			//
			// ADD Recording, ADD
			//
			case "Fr":
				// FIRST!!! 
				// Make sure that one of the checkboxes is selected as we want to insert AFTER
				// If there are NO buttons at all, create one, other wise append to current button.
				// this entry
				
				// Display dialog box
				if (debug > 2) alert("Activate_handset:: Add Fr button pressed, start recording ...");
				
				myConfirm('You are about to add an action to this handset. If you continue, the system ' 
				+ 'will be in recording mode until you have selected a device action. Then you are returned '
				+ 'to this scene screen again. Please confirm if you want to add actions to this handset. ', 
				// Confirm
				function () {
					// DO nothing....
					// Maybe make the background red during device selection or blink or so
					// with recording in the message area ...
					message('<p style="textdecoration: blink; background-color:red; color:white;">RECORDING</p>');
					// Before we can records, let's hope we know where to insert the 
					// new action
					s_recording = 1;							// Set the recording flag on!
					s_recorder = "";							// Empty the recorder
					init_handsets("init");
					
					// Cancel	
  					}, function () {
						s_recording = 0;
						return(1); // Avoid further actions for these radio buttons 
  					},
  					'Adding a handset action?'
				);
			break;
			//
			// Change a time value in the handset screen. The time field is an input action field.
			//
			case "Ft":	// XXX Works 131122
			
				// This is the current value of the time field
				var val= $(e.target).val();
				
				//alert("scene current time val is: "+val);
				
				var hh=""; for(i=0;i<24;i++) {
					if (i==val.substr(0,2)) hh +='<option selected="selected">'+("00"+i).slice(-2)+'</option>';
					else hh +='<option>'+("00"+i).slice(-2)+'</option>';
				}
				var mm=""; for(i=0;i<60;i++) {
					if (i==val.substr(3,2)) mm +='<option selected="selected">'+("00"+i).slice(-2)+'</option>';
					else mm +='<option>'+("00"+i).slice(-2)+'</option>';
				}
				var ss=""; for(i=0;i<60;i++) {
					if (i==val.substr(6,2)) ss +='<option selected="selected">'+("00"+i).slice(-2)+'</option>';
					else ss +='<option>'+("00"+i).slice(-2)+'</option>';
				}
				var ret;
				var frm = '<form id="addRoomForm"><fieldset>'
					+ '<p>You can change the timer settings for this action. Please use hh:mm:ss</p>'
					+ '<br />'
					+ '<label style="width:50px;" for="val_1">hrs: </label>'
					+ '<select id="val_1" value="'+val.substr(0,2)+'" >' + hh +'</select>'
					+ '<label style="width:50px;" for="val_2">mins: </label>'
					+ '<select id="val_2" value="' + val.substr(3,2)+ '">' + mm +'</select>'
					+ '<label style="width:50px;" for="val_3">secs: </label>'
					+ '<select id="val_3" selectedIndex="10" value="'+ val.substr(6,2)+'">' + ss +'</select>'
					+ '</fieldset></form>'
					;	
				askForm(
					frm,
					function(ret){
					// OK Func, need to get the value of the parameters
					// Add the device to the array
					// SO what are the variables returned by the function???
					if (debug > 2) alert(" Dialog returned val_1,val_2,val_3: " + ret);
						
					// Value of the button pressed (eg its label)
					var laval = ret[0]+":"+ret[1]+":"+ret[2];
					$(e.target).val(laval);
					if (debug>2) alert("Timer changed from "+ val+" to: "+ $(e.target).val() );
						
					// Now change its value in the sequence string of timers also
					// use but_id= $(e.target).attr('id') to get the index number ...							
					var ids = parse_int(but_id);
					// 1st handset_id, 2nd number is unit, 3rd val
					var j;
					for (j=0; j<handsets.length; j++) {
						if (   (handsets[j]['id'] == ids[0] ) 
							&& (handsets[j]['unit'] == ids[1] )
							&& (handsets[j]['val'] == ids[2] ) ) {
							break;					
						}
					}
					// j contains the correct record index
					var handset_split = handsets[j]['scene'].split(',');
					var tid = $(e.target).attr('id');
					var sid = "Fs" + tid.substr(2);
					var sval = $( "#"+sid).val(); //xxx
					alert("tid: "+tid+", sid: "+sid+", sval: "+sval);
					
					// Lookup value and put index in ind
					var ind = handset_split.indexOf( sval );
					alert("split ind: "+ind);
					handset_split [ind+1] = laval;
					handsets[j]['scene']=handset_split.join();
					
					return (0);	
  				},
				function () {
					return(1); // Avoid further actions for these radio buttons 
  				},
  				'Confirm Change'
			); // askForm
			break;
					
			default:
				alert("Sequence action unknown: " + but_id.substr(-2) );
		}
	})// on-click handler XXX can be moved to document.ready part of the program
	
	// ------SORTABLE---REQUIRES MORE WORK -------
	// Sortable put at the end of the function
	// The last() makes sure only the second table is sortable with the scene elements
	
	// Note: Unsure if we should use scene_split var, as this function is async!
	// however, scene_split is in the scope of this function, and contains the
	// scurrent values on the screen...... but it works!
	if (jqmobile == 1) {
		
		// jmobile handsets are NOT sortable at the moment
	}
	else {
	  $("#gui_handsets tbody").sortable({
		start: function (event, ui) {
            $(ui.item).data("startindex", ui.item.index());
        },
		// Make sure we select the second table!
		stop: function (event, ui) {
			var my_list = '';
			// Go over each element and record the id
			$( "#gui_handsets .scene" ).each(function( index ) {
				var id = 	$(this ).children().children('.dbuttons').attr('id');	
				// XXX Assumption that scene id is only 1 digit!!
				var ind = id.substr(4);
			// XXX Need to implement sortable	
				logger( "scn: " + hset + " html index: " + index + " scene ind: " + ind );
				my_list += scene_split [(ind-1)*2] + ',' + scene_split [((ind-1)*2) + 1] + ',' ;
			});
			// Now we need to remove the last ","
			logger("my_list :" + my_list);
			my_list = my_list.slice(0,-1);
			logger("scene: " + hset + ", " + handsets[hset-1]['name'] + ", my_list: " + my_list );
			
			// XXX OOPS, not nice, should look up the index, not assume ind[1] is same as array index 0
			handsets[hset-1]['scene'] =  my_list;
        }	 
	  }).disableSelection();
	}//else
	
	s_handset_id = hset;
} // activate handset

// --------------------------------- ACTIVATE SENSORS -------------------------------------
// With 3 sensors we'll have a good layout on the screen, otherwise we'll scroll.
// In next release of LamPI, we should sort the sensors in locations... as we do with
// rooms. These will not so much the real physical location (probably is), but will be
// container to assure we have the sensors grouped together as we want...
//
function activate_sensors(location)
{
	// Cleanup work area
	$( "#gui_messages" ).empty();
	$( "#gui_content" ).empty();					// Empty our drawing area
	$( "#gui_content" ).css( "overflow-x", "auto" );
	html_msg = '<div id="gui_sensors"></div>';
	$( "#gui_content" ).append (html_msg);	
	html_msg = '<table border="0">';
	$( "#gui_sensors" ).append( html_msg );
	
	var table = $( "#gui_sensors" ).children();		// to add to the table tree in DOM
	var offbut, onbut;
	
	// We want the length not be the sensors length but the number of unique locations in the
	// array sensors (which equals actually the number of buttons in the header area)
	//alert("activate_sensors:: location: "+location);
	var wl = 0; 
	for (var i= 0; i < sensors.length; i++) {
		if (sensors[i]['location'] == location) {
			wl++;									// Determines the number of dials on the active screen
		}
	}			
	//var wl = sensors.length;						// Determines the number of dials on screen
	var buf = '<tbody>' ;
	var wi = 100/wl;

	// At the moment we only do temperature and humidity. 
	// First row; Create the canvasses and make room for the temprature dials..	
	buf += '<tr>';
	for (var i=0; i< wl; i++) {
		buf += '<td width="'+wi+'%" class="cw_button">';
        buf += '<canvas id="canvasRadial'+(i+1)+'" width="201" height="201"></canvas>';
		buf += '</td>';
	}
	buf += '</tr>';
	// This is the second row, with the dials for humidity
	buf += '<tr>';
	for (var i=0; i< wl; i++) {
		var canv = 'canvasRadial'+(wl+i+1)+'';
		buf += '<td width="'+wi+'%" class="cw_button">';
        buf += '<canvas id="'+canv+'" width="201" height="201">No canvas in your browser...</canvas>';
		buf += '</td>';
	}
	buf += '</tr>';
	buf += '</tbody></table>';
	
	// XXX for windspeed etc. if the row dimensions are larger than 2
	
	$(table).append(buf);							// Display the table with canvas
	//$( "#gui_sensors" ).append( buf );
	
	// We load the .js file for steel animation. This is done in jQuery so that once
	// loaded all functions are available, but the functions are no integral/permanent part
	// of the code
	$.getScript("steel/steelseries-min.js", function(){
	//$.getScript("steel/steelseries.js", function(){			// For debugging
		
		// sections are used for:
		var sections = [steelseries.Section( 0, 25, 'rgba(0, 0, 220, 0.3)'),
                    	steelseries.Section(25, 50, 'rgba(0, 220, 0, 0.3)'),
                    	steelseries.Section(50, 75, 'rgba(220, 220, 0, 0.3)') ],
		
			baro_sections = [steelseries.Section( 950, 990, 'rgba(0, 0, 220, 0.3)'),
                    	steelseries.Section(990, 1030, 'rgba(0, 220, 0, 0.3)'),
                    	steelseries.Section(1030, 1050, 'rgba(220, 220, 0, 0.3)') ],
			
            // Define one area
            areas = [steelseries.Section(75, 100, 'rgba(220, 0, 0, 0.3)')],
			baro_areas = [steelseries.Section(1050, 1100, 'rgba(220, 0, 0, 0.3)')],

            // Define value gradient for bargraph temperature
            tempGrad = new steelseries.gradientWrapper(  -20,
                                                        40,
                                                        [ 0, 0.20, 0.40, 0.85, 1],
                                                        [ new steelseries.rgbaColor(0, 0, 200, 1),
                                                          new steelseries.rgbaColor(0, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1) ]),
			
			valGrad = new steelseries.gradientWrapper(  0,
                                                        100,
                                                        [ 0, 0.33, 0.66, 0.85, 1],
                                                        [ new steelseries.rgbaColor(0, 0, 200, 1),
                                                          new steelseries.rgbaColor(0, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1) ]),
			pressGrad = new steelseries.gradientWrapper( 950,
                                                        1100,
                                                        [ 0, 0.33, 0.66, 0.85, 1],
                                                        [ new steelseries.rgbaColor(0, 0, 200, 1),
                                                          new steelseries.rgbaColor(0, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1) ]);
		
		var radial={};
		var i=0;
		// Now we'll start placing the dials
		for (var j=0; j< sensors.length; j++)
		{
			if (sensors[j]['location'] == location ) 
			{
				// temperature
				// XXX We assume that we ALWAYS have a temperature as part of the sensor
				// reading. This may NOT be true in which case the radial below needs to be
				// conditional as with the humidity
				if (('temperature' in sensors[j]['sensor']) 
//					&& (typeof sensors[j]['sensor']['temperature'] !== 'undefined')  
//					&& (sensors[j]['sensor']['temperature'] !== "")
				)
				{
					radial[i] = new steelseries.RadialBargraph('canvasRadial'+(i+1), {
                            	gaugeType: steelseries.GaugeType.TYPE4,
                            	size: 201,
								minValue: -20,							// Set the min value on the scale
								maxValue: 40,
                            	valueGradient: tempGrad,
                            	useValueGradient: true,
                            	titleString: sensors[j]['name']+"@"+sensors[j]['location'],
                            	unitString: 'Temp C',
								threshold: 30,
                            	lcdVisible: true
                        });
					radial[i].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
					radial[i].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
					radial[i].setValueAnimated(sensors[j]['sensor']['temperature']['val']);
				}
				else {
					logger("sensors temperature "+i+" is not defined");
				}
				
				// humidity radial gauges
				
				if (('humidity' in sensors[j]['sensor'])  
				//	&& (typeof sensors[j]['sensor']['humidity'] !== 'undefined') 
				//	&& (sensors[j]['sensor']['humidity'] !== "")
				)
				{
					//logger("iradial "+ (i+wl) +",j: "+j+" set humidity: "+sensors[j]['sensor']['humidity']['val']);
					radial[i+wl] = new steelseries.RadialBargraph('canvasRadial'+(i+wl+1), {
                            	gaugeType: steelseries.GaugeType.TYPE4,
                            	size: 201,
                            	valueGradient: valGrad,
                            	useValueGradient: true,
                            	titleString: sensors[j]['location'],
                            	unitString: 'Humidity %',
								threshold: 80,
                            	lcdVisible: true
                        });
					radial[i+wl].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
					radial[i+wl].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
					radial[i+wl].setValueAnimated(sensors[j]['sensor']['humidity']['val']);
				}
				else {
					logger("sensors humidity "+i+" is not defined");
				}
				
				// Airpressure radial gauges. 
				
				if (('airpressure' in sensors[j]['sensor'])  
				//	&& (typeof sensors[j]['sensor']['airpressure']['val'] !== 'undefined') 
				//	&& (sensors[j]['sensor']['airpressure']['val'] !== '') 
				)
				{
					logger("iradial "+ (i+wl) +",j: "+j+" set airpressure: "+sensors[j]['sensor']['airpressure']['val']);
					radial[i+wl] = new steelseries.RadialBargraph('canvasRadial'+(i+wl+1), {
                            	gaugeType: steelseries.GaugeType.TYPE3,
                            	size: 201,
								minValue: 950,							// Set the min value on the scale
								maxValue: 1100,
 								area: baro_areas,
								section: baro_sections,
								useSectionColors: true,
                            	//valueGradient: pressGrad,
                            	//useValueGradient: true,
                            	titleString: sensors[j]['location'],
                            	unitString: 'Pressure Pa',
								threshold: 80,
                            	lcdVisible: true
                        });
					radial[i+wl].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
					radial[i+wl].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
					radial[i+wl].setValueAnimated(sensors[j]['sensor']['airpressure']['val']);
				}
				else {
					logger("sensors airpressure "+i+" is not defined");
				}

				// windspeed radial gauges
				// XXX Make sure that the gauge is defined above
				// before making this selectable
				//if (sensors[j]['windspeed'] != "")
				//{
				//	logger("sensors windspeed "+i+" is true");
				//	radial[i+wl*2] = new steelseries.RadialBargraph('canvasRadial'+(i+wl*2+1), {
                //            	gaugeType: steelseries.GaugeType.TYPE4,
                //            	size: 201,
                //            	valueGradient: valGrad,
                //           	useValueGradient: true,
                //            	titleString: sensors[j]['location'],
                //            	unitString: 'Windspeed %',
                //            	lcdVisible: true
                //        });
				//	radial[i+wl*2].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
				//	radial[i+wl*2].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
				//	radial[i+wl*2].setValueAnimated(sensors[j]['windspeed']);
				//}
				//else {
				//	logger("sensors windspeed "+i+" is not defined");
				//}
				i++;
			}
		}
		
		// Once every 2 seconds we update the gauge meters based on the current
		// value of the sensors array (which might change due to incoming messages
		// over websockets.
		var id;
		id = setInterval(function()
		{
			// Do work if we are in the sensors screen
			if (s_screen == "sensor" )
			{
				var i = 0;
				for (var j=0; j< sensors.length; j++) 
				{
					if (sensors[j]['location'] == location)
					{
						// First row of dials!!
						if (('temperature' in sensors[j]['sensor']) && 
							(sensors[j]['sensor']['temperature']['val'] !== undefined) && 
							(sensors[j]['sensor']['temperature']['val'] != "")) {
							radial[i].setValueAnimated(sensors[j]['sensor']['temperature']['val']);
						}
						else { message("not set temperature. ",3); }
						
						// Second row of dials
						if (('humidity' in sensors[j]['sensor']) && 
							(sensors[j]['sensor']['humidity']['val'] !== undefined) && 
							(sensors[j]['sensor']['humidity']['val'] != "")) {
							message("radial "+ (i+wl) +",j: "+j+" set humidity: "+sensors[j]['sensor']['humidity']['val'],2);
							radial[i+wl].setValueAnimated(sensors[j]['sensor']['humidity']['val']);
						}
						else { message("not set humidity. ",3); }
						
						// Experience shows that most if not all sensors show only two values
						// Temperature+ humidity is most existent, but temperature + airpressure os also possible for example
						// therefore, we assume that if humidity is not used, we can use that dial for other readings...
						if (('airpressure' in sensors[j]['sensor']) && 
							(sensors[j]['sensor']['airpressure']['val'] !== undefined ) &&
							(sensors[j]['sensor']['airpressure']['val'] != "" )) {
							message("airpressure: " + sensors[j]['sensor']['airpressure']['val'],2);
							radial[i+wl].setValueAnimated(sensors[j]['sensor']['airpressure']['val']);
						}
						else { message("not set airpressure. ",3); }
						
						// Windspeed
						//if (('windspeed' in sensors[j]) && (sensors[j]['sensor']['windspeed']['val'] != "" )) {
						//	logger("windspeed: " + sensors[j]['sensor']['windspeed']['val']);
						//	radial[i+wl].setValueAnimated(sensors[j]['sensor']['windspeed']['val']);
						//}
						//else if (debug>=3) { logger("not set windspeed."); }
						
						i++;
					}
				}
				// Make a new connection and start registering the various actions,
				// State 0: Not ready (yet), connection to e established
				// State 1: Ready
				// State 2: Close in progress
				// State 3: Closed
				var state = w_sock.readyState;
				if (state != 1) {
					logger("Websocket:: error. State is: "+state);
					message("Websocket:: error. State is: "+state);
					//w_sock = new WebSocket(w_uri);
				}
			}
			else {
				// Kill this timer temporarily
				clearInterval(id);
				message("Suspend Dials");
			}
		}, 2000);		// 2 seconds (in millisecs)
	});
}


// --------------------------------- ACTIVATE ENERGY -------------------------------------
//
// It is quite good possible to config the sceen so that for 2 or 4 or 6 sensors
// With 3 we will have a good layout on the screen, otherwise we'll scroll.
//
// THere are only a few sensors in the SMART meter that are interesting to me
// Actual Power usage (and return)
// Gas Usage
//
function activate_energy(location)
{
	// Cleanup work area
	$( "#gui_messages" ).empty();
	$( "#gui_content" ).empty();					// Empty our drawing area
	$( "#gui_content" ).css( "overflow-x", "auto" );
	html_msg = '<div id="gui_energy"></div>';
	$( "#gui_content" ).append (html_msg);	
	html_msg = '<table border="0">';
	$( "#gui_energy" ).append( html_msg );
	
	var table = $( "#gui_energy" ).children();		// to add to the table tree in DOM
	var offbut, onbut;
	
	// We take rows of 3 positions and vertical as many as needed
	var wl = 4; 		
	var wi = 100/wl;
	
	// Do two rows with each 4 dials/gauges
	// First row; Create the canvasses and make room for the temprature dials..	
	var buf = '<tbody><tr>';
	for (var i=0; i< wl; i++) {
		canv = 'canvasRadial'+(i+1)+'';
		buf += '<td width="'+wi+'%" class="ce_button">';
        buf += '<canvas id="'+ canv +'" width="201" height="201">No canvas in your browser...1</canvas>';
		buf += '</td>';
	}
	buf += '</tr>';
	
	// This is the second row, with the dials for electricity in and out and gas use
	buf += '<tr>';
	for (var i=0; i< wl; i++) {
		var canv = 'canvasRadial'+(wl+i+1)+'';
		buf += '<td width="'+wi+'%" class="ce_button">';
        buf += '<canvas id="'+canv+'" width="201" height="201">No canvas in your browser...2</canvas>';
		buf += '</td>';
	}
	buf += '</tr>';
	//buf += '</tbody></table>';
	
	// This is the third row, with the odometer for electricity use and gas use
	buf += '<tr>';
	for (var i=0; i< wl; i++) {
		var canv = 'canvasRadial'+(2*wl+i+1)+'';
		buf += '<td width="'+wi+'%" class="ce_button">';
        buf += '<canvas id="'+canv+'" style="align:center;" width="201" height="35">No canvas in your browser...3</canvas>';
		buf += '</td>';
	}
	buf += '</tr>';
	
	// This is the fourth row, with the odometer for electricity in
	buf += '<tr>';
	for (var i=0; i< wl; i++) {
		var canv = 'canvasRadial'+(3*wl+i+1)+'';
		buf += '<td width="'+wi+'%" class="ce_button">';
        buf += '<canvas id="'+canv+'" style="align:center;" width="201" height="35">No canvas in your browser...3</canvas>';
		buf += '</td>';
	}
	buf += '</tr>';
	
	buf += '</tbody></table>';
	
	$(table).append(buf);							// Display the table with canvas
	
	// We load the .js file for steel animation. This is done in jQuery so that once
	// loaded all functions are available, but the functions are no integral/permanent part
	// of the code
	$.getScript("steel/steelseries-min.js", function(){
	//$.getScript("steel/steelseries.js", function(){
		

		// sections are used for:
		var sections = [steelseries.Section( 0, 25, 'rgba(0, 0, 220, 0.3)'),
                    	steelseries.Section(25, 50, 'rgba(0, 220, 0, 0.3)'),
                    	steelseries.Section(50, 75, 'rgba(220, 220, 0, 0.3)') ],

			pwr_sections = [steelseries.Section( 950, 990, 'rgba(0, 0, 220, 0.3)'),
                    	steelseries.Section(990, 1030, 'rgba(0, 220, 0, 0.3)'),
                    	steelseries.Section(1030, 1050, 'rgba(220, 220, 0, 0.3)') ],
			
            // Define one area
            areas = [steelseries.Section(75, 100, 'rgba(220, 0, 0, 0.3)')],
			pwr_areas = [steelseries.Section(1050, 1100, 'rgba(220, 0, 0, 0.3)')],

            // Define value gradient for total electricity and gas usage (max 10000)
            pwrGrad = new steelseries.gradientWrapper(  0,
                                                        10000,
                                                        [ 0, 0.25, 0.50, 0.75, 1],
                                                        [ new steelseries.rgbaColor(0, 0, 200, 1),
                                                          new steelseries.rgbaColor(0, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 200, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1),
                                                          new steelseries.rgbaColor(200, 0, 0, 1) ]),
			// Define value gradient for actual use ( 0 - 3500 kw per phase
			valGrad = new steelseries.gradientWrapper(  0,
                                                        3.5,
                                                        [ 0, 0.15, 0.30, 0.50, 1],
                                                        [ new steelseries.rgbaColor(0, 0, 200, 1),			// Blauw
                                                          new steelseries.rgbaColor(0, 200, 0, 1),			// Groen
                                                          new steelseries.rgbaColor(200, 200, 0, 1),		// Geel
                                                          new steelseries.rgbaColor(200, 0, 0, 1),			// Rood
                                                          new steelseries.rgbaColor(200, 0, 0, 1) ]);		// rood

		var radial={};
		var i=0;
		// dial 1 (Power actual use
		radial[0] = new steelseries.RadialBargraph('canvasRadial'+(0+1), {
                            	gaugeType: steelseries.GaugeType.TYPE4,
                            	size: 201,
								minValue: 0,							// Set the min value on the scale
								maxValue: 3.5,
                            	valueGradient: valGrad,
                            	useValueGradient: true,
                            	titleString: 'Actual',
                            	unitString: 'kW',
								threshold: 30,
                            	lcdVisible: true
                        });
		radial[0].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[0].setValueAnimated(energy['kw_act_use']);
		radial[0].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);

		// PHA 1 radial gauges
		radial[1] = new steelseries.RadialBargraph('canvasRadial'+(1+1), {
                            	gaugeType: steelseries.GaugeType.TYPE4,
                            	size: 201,
								minValue: 0,							// Set the min value on the scale
								maxValue: 3.5,
                            	valueGradient: valGrad,
                            	useValueGradient: true,
                            	titleString: 'Phase 1',
                            	unitString: 'kW',
								threshold: 75,
                            	lcdVisible: true
                        });
		radial[1].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[1].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
		radial[1].setValueAnimated(energy['kw_ph1_use']);

		// PHA 2 radial gauges
		radial[2] = new steelseries.RadialBargraph('canvasRadial'+(2+1), {
                            	gaugeType: steelseries.GaugeType.TYPE4,
                            	size: 201,
								minValue: 0,							// Set the min value on the scale
								maxValue: 3.5,
                            	valueGradient: valGrad,
                            	useValueGradient: true,
                            	titleString: 'Phase 2',
                            	unitString: 'kW',
								threshold: 75,
                            	lcdVisible: true
                        });
		radial[2].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[2].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
		radial[2].setValueAnimated(energy['kw_ph2_use']);

		// PHA 3 radial gauges
		radial[3] = new steelseries.RadialBargraph('canvasRadial'+(3+1), {
                            	gaugeType: steelseries.GaugeType.TYPE4,
                            	size: 201,
								minValue: 0,							// Set the min value on the scale
								maxValue: 3.5,
                            	valueGradient: valGrad,
                            	useValueGradient: true,
                            	titleString: 'Phase 3',
                            	unitString: 'kW',
								threshold: 75,
                            	lcdVisible: true
                        });
		radial[3].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[3].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
		radial[3].setValueAnimated(energy['kw_ph3_use']);


		// HI USE  radial gauges
		//
		radial[0+wl] = new steelseries.RadialBargraph('canvasRadial'+(0+wl+1), {
                          	gaugeType: steelseries.GaugeType.TYPE4,
                          	size: 201,
							minValue: 0,							// Set the min value on the scale
							maxValue: 9999,
                            valueGradient: pwrGrad,
                            useValueGradient: true,
                            titleString: 'Hi Use',
                            unitString: 'kWhr',
							threshold: 75,
                            lcdVisible: true
                        });
		radial[0+wl].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[0+wl].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
		radial[0+wl].setValueAnimated(energy['kw_hi_use']);

		// Lo Use
		radial[1+wl] = new steelseries.RadialBargraph('canvasRadial'+(1+wl+1), {
                          	gaugeType: steelseries.GaugeType.TYPE4,
                          	size: 201,
							minValue: 0,							// Set the min value on the scale
							maxValue: 9999,
                            valueGradient: pwrGrad,
                            useValueGradient: true,
                            titleString: 'Lo Use',
                            unitString: 'kWhr',
							threshold: 75,
                            lcdVisible: true
                        });
		radial[1+wl].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[1+wl].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
		radial[1+wl].setValueAnimated(energy['kw_lo_use']);
		
		// Gas Use
		radial[3+wl] = new steelseries.RadialBargraph('canvasRadial'+(3+wl+1), {
                          	gaugeType: steelseries.GaugeType.TYPE4,
                          	size: 201,
							minValue: 0,							// Set the min value on the scale
							maxValue: 9999,
                            valueGradient: pwrGrad,
                            useValueGradient: true,
                            titleString: 'Gas Use',
                            unitString: 'm3',
							threshold: 75,
                            lcdVisible: true
                        });
		radial[3+wl].setFrameDesign(steelseries.FrameDesign.GLOSSY_METAL);
		radial[3+wl].setBackgroundColor(steelseries.BackgroundColor.BRUSHED_METAL);
		radial[3+wl].setValueAnimated(energy['gas_use']);	
		
		// Some likem, other do not. Odometer is beta for the moment.
		radial[0+(wl*2)] = new steelseries.Odometer('canvasRadial'+(0+wl*2+1), {  });
		radial[0+(wl*2)].setValue(energy['kw_hi_use']);
		
		radial[1+(wl*2)] = new steelseries.Odometer('canvasRadial'+(1+wl*2+1), {  });
		radial[1+(wl*2)].setValue(energy['kw_lo_use']);
		
		radial[3+(wl*2)] = new steelseries.Odometer('canvasRadial'+(3+wl*2+1), {  });
		radial[3+(wl*2)].setValue(energy['gas_use']);
		
		radial[0+(wl*3)] = new steelseries.Odometer('canvasRadial'+(0+wl*3+1), {  });
		radial[0+(wl*3)].setValue(energy['kw_hi_ret']);
		
		radial[0+(wl*3)] = new steelseries.Odometer('canvasRadial'+(1+wl*3+1), {  });
		radial[0+(wl*3)].setValue(energy['kw_lo_ret']);

		// Once every 2 seconds we update the gauge meters based on the current
		// value of the sensors array (which might change due to incoming messages
		// over websockets.
		var id;
		id = setInterval(function()
		{
			// Do work if we are in the sensors screen
			if (s_screen == "energy" )
			{
				radial[0].setValueAnimated(energy['kw_act_use']);
				radial[1].setValueAnimated(energy['kw_ph1_use']);
				radial[2].setValueAnimated(energy['kw_ph2_use']);
				radial[3].setValueAnimated(energy['kw_ph3_use']);
				radial[0+wl].setValueAnimated(energy['kw_hi_use']);
				radial[1+wl].setValueAnimated(energy['kw_lo_use']);
				//radial[2+wl].setValueAnimated(energy['kw_ph2_use']);
				radial[3+wl].setValueAnimated(energy['gas_use']);

				// Make a new connection and start registering the various actions,
				// State 0: Not ready (yet), connection to e established
				// State 1: Ready
				// State 2: Close in progress
				// State 3: Closed
				var state = w_sock.readyState;
				if (state != 1) 
				{
					logger("Websocket:: error. State is: "+state);
					message("Websocket:: error. State is: "+state);
					//w_sock = new WebSocket(w_uri);
				}
			}
			else
			{
				// Kill this timer temporarily
				clearInterval(id);
				message("Suspend Dials");
				logger("activate_energy:: s_screen is: "+s_screen)
			}
		}, 2000);		// 2 seconds (in millisecs)
		
	});
}


// -------------------------------------------------------------------------------
// Activate the Settings screen for a certain setting
// identified with sid.
//
// XXX NOTE: Settings work on id AND on index of the settings array as defined in database.cfg
//
function activate_setting(sid)
{
	// Cleanup work area
	s_setting_id = sid;
	$( "#gui_content" ).empty();
	var offbut, onbut;	
	switch (sid+"")
	{
		// DEBUG level
		// Set the debug level and store in the settings variable
		case "0":
			var debug_help = ' <br>'
					+ 'This is some text to explain the use of the debug parameter. '
					+ 'During normal operation, the parameter should  be set to 0, which means no debug messages are displayed '
					+ 'and only a condensed set of status messages will be shown. '
					+ '<li>Level 1: Will set debug level so that more messages are displayed in the message area </li>'
					+ '<li>Level 2: Will add popup alerts for the main things/buttons/events </li>'
					+ '<li>Level 3: All error and comment messages are displayed </li><br><br>'
					;
			if (jqmobile==1) {
				$("#gui_content").append('<span>' + debug_help + '</span>');
				but = ''
					//+ '<td>'
					//+ '<div data-role="fieldcontain">'
					+ '<fieldset data-role="controlgroup" data-type="horizontal">'
					+ '<legend>Select the LamPI debug level: </legend>'
					+ '<input type="radio" name="radio-choice" id="rd0" value="0" checked="checked">'
					+ '<label for="rd0">L0</label>'
					+ '<input type="radio" name="radio-choice" id="rd1" value="1">'
					+ '<label for="rd1">L1</label>'
					+ '<input type="radio" name="radio-choice" id="rd2" value="2">'
					+ '<label for="rd2">L2</label>'
					+ '<input type="radio" name="radio-choice" id="rd3" value="3">'
					+ '<label for="rd3">L3</label>'
					+ '</fieldset>'
					//+ '</div>'
					//+ '</td>'
					;
				$("#gui_content").append(but);
				
				$("input[type='radio']").bind( "change", function(event, ui) {
						debug = $("input[name*=radio-choice]:checked").val();
						//$(this).attr("checked",true).checkboxradio("refresh");
						//$(this).prop("checked",true).checkboxradio("refresh");
						settings[0]['val'] = debug;
						send2daemon("dbase","store_setting", settings[0]);
						message("Debug set to: "+debug);
				});
				//$("input[type='radio']").prop("checked",true).checkboxradio("refresh");
				//var value = $("input[name*=radio-choice]:checked").val();
			}
			else {
				html_msg = '<table border="0">';
				$( "#gui_content" ).append( html_msg );
				var table = $( "#gui_content" ).children();		// to add to the table tree in DOM
				$(table).append('<tr><td><span>' + debug_help + '</span>');			
				var but =  ''	
					+ '<tr class="switch">'
					+ '<td>'
					+ 'Select the debug level: ' 
					+ '</td>'
					;
				$(table).append(but);
				but = ''	
					+ '<td>'
					+ '<span id="choice" class="buttonset">'
					+ '<input type="radio" name="choice" id="d0" value="0" class="buttonset" checked="checked"><label for="d0">L0</label>'
					+ '<input type="radio" name="choice" id="d1" value="1" class="buttonset"><label for="d1">L1</label>'
					+ '<input type="radio" name="choice" id="d2" value="2" class="buttonset"><label for="d2">L2</label>'
					+ '<input type="radio" name="choice" id="d3" value="3" class="buttonset"><label for="d3">L3</label>'
					+ '</span></td>'
					;
				$(table).append(but);
				debug = settings[0]['val'];
				$('#choice').buttonset();
				$('#d'+ debug).attr('checked',true).button('refresh');
				$('#choice input[type=radio]').change(function() {
					debug = this.value;
					// XXX Ooops, should not update based on index but on id value
					settings[0]['val'] = debug;
				
					// Write the settings to database
					if (debug>0) myAlert("Set : " + settings[0]['name']+' to '+settings[0]['val'],"DEBUG LEVEL");
					send2daemon("dbase","store_setting", settings[0]);	
					message("debug level set to "+ debug);
				})
			}
		break; //0
			
		// LAYOUT SETTING
		// Select what layout to use in the main screen
		case "1":
			var debug_help = ' <br>'
					+ 'This menu option allows users to choose how the devices and sensors are laid out on the screen. '
					+ 'The standard screen layout is with rows for the devices and using dials for the sensors.'
					+ 'The rows layout is most used on hi-resolution tables and PCs. '
					+ 'Mobile is a special variant of rows but for mobile devices. '
					+ 'But alternatively the user may select that all devices are resented as tiles on the screen. '
					+ '<li>Rows: ....  </li>'
					+ '<li>Mobile: ..... </li>'
					+ '<li>Tiles: ....  </li><br><br>'
					;
			if (jqmobile == 1){
				logger("activate_setting:: layout jquerymobile",1);
								$("#gui_content").append('<span>' + debug_help + '</span>');
				but = ''
					//+ '<td>'
					//+ '<div data-role="fieldcontain">'
					+ '<fieldset data-role="controlgroup" data-type="horizontal">'
					+ '<legend>Select the LamPI debug level: </legend>'
					+ '<input type="radio" name="radio-choice" id="rd0" value="0" checked="checked">'
					+ '<label for="rd0">L0</label>'
					+ '<input type="radio" name="radio-choice" id="rd1" value="1">'
					+ '<label for="rd1">L1</label>'
					+ '<input type="radio" name="radio-choice" id="rd2" value="2">'
					+ '<label for="rd2">L2</label>'
					+ '<input type="radio" name="radio-choice" id="rd3" value="3">'
					+ '<label for="rd3">L3</label>'
					+ '</fieldset>'
					//+ '</div>'
					//+ '</td>'
					;
				$("#gui_content").append(but);
				$("input[type='radio']").bind( "change", function(event, ui) {
						settings[1]['val'] = $("input[name*=radio-choice]:checked").val();
						//$(this).attr("checked",true).checkboxradio("refresh");
						//$(this).prop("checked",true).checkboxradio("refresh");
						jqmobile = settings[1]['val'];
						send2daemon("dbase","store_setting", settings[1]);
						message("Layout set to: "+settings[1]['val']);
				});
				//$("input[type='radio']").prop("checked",true).checkboxradio("refresh");
				//var value = $("input[name*=radio-choice]:checked").val();
			}
			else {
				html_msg = '<table border="0">';
				$( "#gui_content" ).append( html_msg );
				var table = $( "#gui_content" ).children();		// to add to the table tree in DOM
				$(table).append('<tr><td><span>' + debug_help + '</span>');			
				var but =  ''	
					+ '<tr class="switch">'
					+ '<td>'
					+ 'Select the screen layout mode: ' 
					+ '</td>'
					;
				$(table).append(but);
				but = ''	
					+ '<td>'
					+ '<span id="choice" class="buttonset">'
					+ '<input type="radio" name="choice" id="d0" value="0" class="buttonset" checked="checked"><label for="d0">Rows</label>'
					+ '<input type="radio" name="choice" id="d1" value="1" class="buttonset"><label for="d1">Mobile</label>'
					+ '<input type="radio" name="choice" id="d2" value="2" class="buttonset"><label for="d2">Tiles</label>'
					+ '</span></td>'
					;
				$(table).append(but);
				$('#choice').buttonset();
				$('#d'+ settings[1]['val']).attr('checked',true).button('refresh');
				$('#choice input[type=radio]').change(function() {
					settings[1]['val'] = this.value;
				
					// Write the settings to database
					if (debug>=1) myAlert("The Layout mode " + settings[1]['name']+' has been set to '+settings[1]['val'],"LamPI Layout Mode");
					send2daemon("dbase","store_setting", settings[1]);
					jqmobile = settings[1]['val'];
					message("The LamPI Layout mode has been set to "+ settings[1]['val']+"<br>");
				})
			}
		break; //1

		// 2 USERS SETTING, Since May 2015 this entry is used for 'users' !!!
		case "2":
			logger("activate_setting:: users selected",2);
			send2daemon("dbase","list_user", settings[2] );
		// XXX AAhhh a trick
		case "2b":
			$( "#gui_content" ).empty();
			html_msg = '<div id="gui_uset"></div>';			// sensors set
			$( "#gui_content" ).append (html_msg);
		
			var uset_help = "<br>"
					+ "This page allows you to perform some user setting functions.<br>"
					;
			$(table).append('<tr><td colspan="2"><span>'+uset_help+'</span></td>');	

			if (debug > 2) alert("Activate_setting 2:: Making buttons for setting: " + sid);
			// Start a table for the control buttons
			html_msg = '<table border="0">';
			$( "#gui_uset" ).append( html_msg );
	
			var table = $( "#gui_uset" ).children();		// to add to the table tree in DOM

			// By making first row head, we make it non sortable as well!!
			var but =  '<thead>'	
					+ '<tr class="switch">'
					+ '<td colspan="2">'
					+ '<input type="submit" id="Fx'+sid+'" value="X" class="dbuttons scene_button del_button">'
					+ '<input type="submit" id="Fr'+sid+'" value="+" class="dbuttons scene_button new_button">'
					+ '</td>'
					+ '<td colspan="2"><input type="input"  id="Fl'+sid+'" value= "'+"Users"+'" class="dlabels"></td>' 
					+ '<td>'
					+ '<input type="submit" id="Fe'+sid+'" value="Store" class="dbuttons scene_button">'
					+ '</td></thead>'
					;
			$(table).append(but);
			$(table).append('<tbody>');

			for (var k = 0; k < users.length; k++ ){
				but = '<tr class="scene">'
					+ '<td><input type="checkbox" id="s'+sid+'c" name="cb'+k+'" value="yes"></td>'
					+ '<td> ' + k
					+ '<td> ' + users[k]['name']
					+ '<td><input type="text" id="Fs'+sid+'i'+k+'" value= "'+users[k]['login']+'" class="dlabels sval"></td>'
					+ '<td><input type="text" id="Ft'+sid+'t'+k+'" value= "'+users[k]['passw']+'" class="dbuttons scene_button sval"></td>'
					//+ '<td>' + scmd 
					;
				$(table).append(but);
			} // for

			// Handle the content of the Backup/Restore screen
			$( "#gui_uset" ).on("click", ".dbuttons" ,function(e) 
			{

				bak = this.value;
				message("Backup Restore function chosen "+ bak);
				
				switch ( bak ) {
					case "store":
						var config_file = $( "#store_config").val();
						if (config_file.substr(-4) != ".cfg") config_file += ".cfg" ;
						send2daemon("setting","store_config",config_file);
						if (debug>0) myAlert("Backup: "+ config_file);
					break;
						
					case "load":
						var config_file = $( "#load_config").val();
						//alert("config_file: "+config_file);
						send2daemon("setting","load_config",config_file);
						if (debug>=1) myAlert("The configuration file is now set to: "+config_file,"CONFIGURATION");
						else message("Configuration file loaded "+config_file)
					break;
					default:
						myAlert("Unknown option for Users Setting: "+bak);
				}
			})
		break; //2
		
		// ALARM 3
		case "3":
			html_msg = '<table border="0">';
			$( "#gui_content" ).append( html_msg );
	
			var table = $( "#gui_content" ).children();		// to add to the table tree in DOM
			var but = ''	
					+ '<tr class="switch">'	+ '<td>Alarm status: </td>'
					;
			$(table).append(but);
			but = ''	
					+ '<td><span id="choice" class="buttonset">'
					+ '<input type="radio" name="choice" id="d0" value="0" class="buttonset"><label for="d0">Armed</label>'
					+ '<input type="radio" name="choice" id="d1" value="1" class="buttonset"><label for="d1">Home</label>'
					+ '<input type="radio" name="choice" id="d2" value="2" class="buttonset" checked="checked"><label for="d2">Disarmed</label>'
					+ '</span></td>'
					;
			$(table).append(but);

			var debug_help = "<br>"
				+ "		This parameter deals with the status of the alarm system. "
				+ "<li>Armed: The system is armed and every alarm will reach the main subscriber of alarm events."
				+ "<li>Home: The alarm system is armed, but only on outgoing sensors and on places that are not "
				+ "		used in the house during night. "
				+ "<li>Disarmed: The alarm system is switched of. All sensors are not active."
				+ "<br><br>"
			;
			$(table).append('<tr><td><span>' + debug_help + '</span>');	
			
			alarmStatus = settings[3]['val'];
			//console.log("alarm: "+settings[3]['login']+":"+settings[3]['passw']);
			$('#choice').buttonset();
			$('#d'+ alarmStatus).attr('checked',true).button('refresh');
			$('#choice input[type=radio]').change(function() {
					alarmStatus = this.value;
					settings[3]['val'] = alarmStatus;
					message("alarmStatus value set to "+ alarmStatus);
					// Write the settings to database
					if (debug >= 1) alert("Set : " + settings[3]['name'] + ' to ' + settings[3]['val']);
					send2daemon("dbase","store_setting", settings[3]);
			});
			// Init the current value of the button
		break; //3
		
		// 4 SKIN
		case "4":
			$( "#gui_content" ).empty();
			html_msg = '<div id="gui_skin"></div>';
			$( "#gui_content" ).append (html_msg);

			html_msg = '<table border="0">';
			$( "#gui_skin" ).append( html_msg );
			
			if(typeof(Storage)!=="undefined") {
  				 var effe = localStorage.getItem('skin');				// Skin setting
 			}
			
			var table = $( "#gui_skin" ).children();		// to add to the table tree in DOM
					
			var but = ''	
				+ '<thead><tr class="switch"><td colspan="2">Choose your Style/Skin setting </td></tr></thead>'
				;
			$(table).append(but);

			var skin_help = "This option allows you to set the skin for your LamPI application. ";
			skin_help += "It will allow you to make your own selection of skins in a /styles/yourskin.css file, ";
			skin_help += "and make it the style of choice for your setting.<br><br>";
			skin_help += "Note: Not supported on mobile devices!<br>";
			skin_help += "Note: Better not choose a files for use on mobile devices ...<br><br>";
			
			$(table).append('<tr><td colspan="2"><span>' + skin_help + '</span>');	
			
			$(table).append( '<tr><td colspan="2">current skin is: <a class="dlabels">' + skin + '</a></td></tr><br><br><br>' );
			
			//var list = [];
			var str = '<fieldset><label for="load_skin">Select File: </label>'
						+ '<select id="load_skin" value="styles/classic-blue.css" style="width:300px;" class="select-file">'; 
			var files = [];
			// files = send2daemon("setting","list_skin","*css");	// XXX Synchronous does not work for node and websockets
			// The message reception takes place elsewhere, so we have to wait for the correct
			// message to arrive. Name of the active skin is in settings[4]['val']
			var dir = "styles";							// XXX This is a temporary fix since root directory of node is /home/pi and not /home/pi/wwww
			var fileextension=".css";
			logger("Calling dir read for: "+dir,0);
			logger("Host: "+window.location.host,1);
			var h = window.location.host.split(":");	// XXX Remove the special port and use standard Apache port nr. 80
			
			$.ajax({
    			//This will retrieve the contents of the folder if the folder is configured as 'browsable'
				url: "http://"+h[0] + "/" +dir,
    			success: function (data) {
        		//List all jpg files on the page
            		$(data).find("a:contains(" + fileextension + ")").each(function () {
             			var filename = this.href.replace(window.location.host,"").replace(window.location.pathname, "").replace("http://","");
            			var len = files.push(dir + "/"+filename);
						logger("Filename: "+filename+", new files length: "+len);

        			});
					logger("Skin selection #files: "+files.length);
					//files = settings[4]['files'];
					// List the files
					for (var i=0; i<files.length; i++) {
						if (files[i] == settings[4]['val']) str += '<option selected>' + files[i] + '</option>';
						else str += '<option>' + files[i] + '</option>';
					}
					str += '</select>';
					str += '</fieldset>';
			
					but = ''
					+ '<tr><td>'
					+ '<input type="submit" name="load_button" id="d1" value="load" class="dbuttons cc_button">'
					+ '<label for="d1">Load Configuration</label>'
					+ '<td><form action="">'
					+ str
					+ '</form>'
					+ '</td></tr>'
					;
					$(table).append(but);
    			}
			});

			// Handle the content of the skin selection screen
			$( "#gui_skin" ).on("click", ".dbuttons" ,function(e) 
			{
				var skin_val = this.value;
				message("Skin selected "+ skin_val);
				switch ( skin_val ) {
						
					case "load":
						skin = $( "#load_skin" ).val();
						// Trick!! only replace hrefs that start with our styles directory!!!
						$("link[href^='styles']").attr("href", skin);
						myConfirm('Do you want to set the '+skin+' Skin file as your default skin for users that start the application? ' +
									  'Otherwise the existing default skin '+settings[4]['val']+' will be used. ' +
									  'Please note that if you press cancel this skin will still be used in your current browser sesssion until you load another skin',
							// Confirm
							function () {
								// Update the database
								message('updating the database');
								settings[4]['val'] = skin;
								send2daemon("dbase","store_setting", settings[4]);
  							}, 
							// Cancel	
							function () {
								message("Not updated");
								return(0);
  							},
  							'Set Default?'
						);
						if(typeof(Storage)!=="undefined") {
  							// Code for localStorage/sessionStorage.
							// alert("Support for localstorage");
							localStorage.setItem('skin', skin);				// Skin setting
							if (debug>=1) {
								logger("Set localstorage skin: "+skin);
							}
 						}
						activate_setting(4);
					break;
						
					default:
						myAlert("Unknown option for Skin/Styles Setting: "+bak);
				}
			})
			// XXX make sure we write this to the mysql backend too!
	
		break; //4 skin
		
		// Backup and Restore
		//
		case "5": 
			// We use another mehod to read a remote directory as found in skins (settings[4]).
			// If the list of files is not yet found, we send a message to teh server asking for another list
			// Upon receiving a directory list of config files the receiver program will re-start this function
			// disadvantage .. if another directory entry is created we must re-ask the server for a config list.
			$( "#gui_content" ).empty();
			html_msg = '<div id="gui_backup"></div>';
			$( "#gui_content" ).append (html_msg);
		
			html_msg = '<table border="0">';
			$( "#gui_backup" ).append( html_msg );
	
			var table = $( "#gui_backup" ).children();		// to add to the table tree in DOM
			// Cosmetically not the most beautiful solution but it works great for the moment
			var but =  ''	
					+ '<thead><tr class="switch">'
					+ '<td colspan="2">'
					+ 'What Backup or Restore action can we organize for you ' 
					+ '</td></tr></thead>'
					;
			$(table).append(but);
			
			var debug_help = "<br>"
					+ "This page allows you to perform some backup and restore functions.<br>"
					+ "It allows you to restore your database to a previous/known state,"
					+ "for example if you messed up.<br>"
					+ "Making regular backups of your configuration to file will greatly help "
					+ "in restoring to a useful state if something goes wrong.<br/><br/>"
					+ "The database.cfg file is one of the default files for the system, "
					+ "so please use another name for your backup.<br/><br/>"
					+ "NOTE: At this moment we do not check for overwriting existing files.<br/>"
					;
			$(table).append('<tr><td colspan="2"><span>'+debug_help+'</span></td>');	

			var files = {};
			// XXX Have to add timing also, if not renewed for more than a minute for example, renew!
			if (settings[5].list == undefined)	{
				send2daemon("setting","list_config","*cfg");				// Ask for listing config
			}
			else  {
				files = settings[5].list ;
			}
			var str = '<fieldset><label for="load_config">Select File: </label>'
						+ '<select id="load_config" value="load" class="dlabels" style="width:200px;">' ;   // onchange="choice()"			
			for (var i=0; i<files.length; i++) {
					str += '<option>' + files[i] + '</option>';
			}
			str += '</select></fieldset>';
			
			but = ''
					+ '<tr><td>'

					+ '<input type="submit" name="store_button" id="d0" value="store" class="dbuttons buttonset">'
					+ '<label for="d0">Backup the configuration</label>'
					+ '</td><td><fieldset>To File &nbsp&nbsp:&nbsp&nbsp<input type="input" id="store_config" value="" class="dlabels" style="width:200px;"></fieldset>'
					+ '</td></tr>'
					+ '<tr><td>'
					+ '<input type="submit" name="load_button" id="d1" value="load" class="dbuttons cc_button">'					
					+ '<label for="d1">Load Configuration</label>'
					+ '</td>'
					+ '<td>'
					+ '<form action="">'
					+ str
					+ '</form>'
					+ '</td></tr>'
					;
			$(table).append(but);	
			// Handle the content of the Backup/Restore screen
			$( "#gui_backup" ).on("click", ".dbuttons" ,function(e) 
			{

				bak = this.value;
				message("Backup Restore function chosen "+ bak);
				
				switch ( bak ) {
					case "store":
						var config_file = $( "#store_config").val();
						if (config_file.substr(-4) != ".cfg") config_file += ".cfg" ;
						send2daemon("setting","store_config",config_file);
						if (debug>0) myAlert("Backup: "+ config_file);
						send2daemon("setting","list_config","*cfg");				// Ask for updated listing config
					break;
						
					case "load":
						var config_file = $( "#load_config").val();
						//alert("config_file: "+config_file);
						send2daemon("setting","load_config",config_file);
						if (debug>=1) myAlert("The configuration file is now set to: "+config_file,"CONFIGURATION");
						else message("Configuration file loaded "+config_file)
					break;
					default:
						myAlert("Unknown option for Backup Setting: "+bak);
				}
			})
		break; //5
		//
		// Console
		//
		case "6": 
		
			$( "#gui_content" ).empty();
			html_msg = '<div id="gui_console"></div>';
			$( "#gui_content" ).append (html_msg);
		
			html_msg = '<table border="0">';
			$( "#gui_console" ).append( html_msg );
			var table = $( "#gui_console" ).children();		// to add to the table tree in DOM

			// Create a few buttons and call frontend_set.php directly!!
			// Cosmetically not the most beutiful solution but it works great for the moment
			var but =  ''	
					+ '<thead><tr class="switch">'
					+ '<td colspan="2">'
					+ 'Select your console function' 
					+ '</td></tr></thead>'
					;
			$(table).append(but);

			// Start writing the table code to DOM
			var but = '<thead><tr class="switch">' ;
						
			if (jqmobile == 1) {
				but += '<td><input type="submit" id="Cc" value="Clients" class="dbuttons" ></td>';
			}
			else {
				but += '<td>';
				but += '<input type="submit" id="Cc" value="Connected Clients" class="dbuttons" >';
				but += '<input type="submit" id="Cs" value="Sunrise Sunset" class="dbuttons" >';
				but += '<input type="submit" id="Cl" value="Daemon log" class="dbuttons" >';
				but += '<input type="submit" id="Cz" value="Zway log" class="dbuttons" >';
				but += '<input type="submit" id="Cr" value="Daemon Restart" class="dbuttons" >';
				but += '<input type="submit" id="Cp" value="Config Print" class="dbuttons" >';
				but += '</td>';
			}
			$(table).append(but);
			$(table).append('</tr>');

			// Now define the callback function for this config screen
			//
			$( "#gui_console" ).on("click", ".dbuttons", function(e) 
			{
				e.preventDefault();
		//		e.stopPropagation();
				value=$(this).val();									// Value of the button pressed (eg its label)
				var but_id = $(e.target).attr('id');					// id of button

				//alert ("s_setting_id: " + s_handset_id + ", but_id: " + but_id + ", cmd_id: " + cmd_id);
		
				// id="Fx2u3v1"
				// First chars of the button id contain the action to perform
				// Then we have the id of the handset, followed by "u" and unit number
				// and "v"<value>
				switch (but_id.substr(0,2))
				{
					case "Cl": 
						//alert("Activate_setting:: console - Log pressed" );
						var client_msg = {
							tcnt: ++w_tcnt%1000,
							action: 'console',
							request: 'logs'
						}
						logger(client_msg);
						// Send the password back to the daemon
						message("Console Log request sent to server",1);
						w_sock.send(JSON.stringify(client_msg));	
					break;

					case "Cz": 
						//alert("activate_setting:: console - Zway Log pressed" );
						var client_msg = {
							tcnt: ++w_tcnt%1000,
							action: 'console',
							request: 'zlogs'
						}
						logger(client_msg);
						// Send the zwave log request back to the daemon
						message("Console ZLog request sent to server",1);
						w_sock.send(JSON.stringify(client_msg));	
					break;

					case "Cs":
						var client_msg = {
							tcnt: ++w_tcnt%1000,
							action: 'console',
							request: 'sunrisesunset'
						}
						logger(client_msg);
						// Send the sunset request back to the daemon
						message("Console Sunrise/Sunset request sent to server",1);
						w_sock.send(JSON.stringify(client_msg));
					break;
					//
					// Client button, list all active clients on the daemon
					//	
					case "Cc": 
						var client_msg = {
							tcnt: ++w_tcnt%1000,
							action: 'console',
							request: 'clients'
						}
						logger(client_msg);
						// Send the password back to the daemon
						message("Console Clients request sent to server",1);
						w_sock.send(JSON.stringify(client_msg));						
					break;
					
					// Reboot the Daemon
					case "Cr":
						var client_msg = {
							tcnt: ++w_tcnt%1000,
							action: 'console',
							request: 'rebootdaemon'
						}
						logger(client_msg);
						// Send the password back to the daemon
						message("Console Client request rebootDaemon sent to server",1);
						w_sock.send(JSON.stringify(client_msg));
					break;
					case "Cp":
						var client_msg = {
							tcnt: ++w_tcnt%1000,
							action: 'console',
							request: 'printConfig'
						}
						logger(client_msg);
						// Send the password back to the daemon
						message("Console Client request printConfig sent to server",1);
						w_sock.send(JSON.stringify(client_msg));
					break;
					
					default:
						alert("Console action unknown: " + but_id.substr(-2) );
					break;
				}
			})// on-click handler XXX can be moved to document.ready part of the program
			
		break; //6
		//
		// rules
		//
		case '7':
			logger("activate_setting:: rules selected for w_url: "+w_url,2);
			var win=window.open('http://'+w_url+'/rules/index.html', '_parent');

		break; //7
		default:
			myAlert("Config encountered internal error: unknown button "+sid);
		break;
	}
}// activate_setting


// --------------------------------- BUTTONS ----------------------------------------------
//		Print a room button to DOM
//		Please not that the id of the room buttons is only defined here
//		id = id of the button as defined in the JaSON structure 
//			The button is placed in a table element <td>
//		val: The value or 'label' on the button
//		hover: If specified, contains css class (String) to add to the button
//
function room_button(id, val, hover) 
{
	var but = ''
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="hr_button '+hover+'">'
	return ( but );
}

//
// Scene button: Print the buttons in the header page. The contents of the scene
// is handled by the activity_button function.
//
function scene_button(id, val, hover) 
{
	var but = ''
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="hs_button '+hover+'">'
	return ( but );	
}
//
// Menu button
//
function menu_button(id, val, hover) 
{
	var but = ''
	+ '<td>'
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="hm_button '+hover+'">'
	+ '</td>'
	return ( but );	
}
//
// Print a timer button
//
//
function timer_button(id, val, hover) 
{
	var but = ''
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="ht_button '+hover+'">'
	return ( but );	
}
//
// Print a handset button
//
//
function handset_button(id, val, hover) 
{
	var but = ''
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="hh_button '+hover+'">'
	return ( but );	
}
//
// Print a sensors button
//
//
function sensors_button(id, val, hover) 
{
	var but = ''
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="hw_button '+hover+'">'
	return ( but );	
}
//
// Re use of button class
//
//
function setting_button(id, val, hover) 
{
	var but = ''
	+ '<input type="submit" id="'+id+'" value= "'+val+'" class="hc_button '+hover+'">'
	return ( but );	
}

// ------------------------------------- DEVICES -----------------------------------------
//
// STORE_DEVICE
//
// Store the value of the device_id in the GUI back in the devices object 
// Local on the client. The daemon will as of release 1.4 take care of syncing the value
// to the database 
//
// Inputs:
//	room: The room id of the object in the devices array (is a number)
//	dev_id: The device id in the object devices. This is a 2-character index
//	val: The value to store. This is a number for sliders and "ON" "OFF" for buttons
//
// This way, when changing rooms it is possible to "remember" slider and buttons settings
// between sessions
//
function store_device(room, dev_id, val) 
{
	for (var j = 0; j<devices.length; j++ )
	{
  		var device_id = devices[j]['id'];
		var room_id = devices[j]['room'];
			
       	if (( room_id == room ) && ( device_id == dev_id ))
		{
//			var device_name = devices[j]['name'];
			var device_type = devices[j]['type'];
			// add value to the devices object
			
			// This would then not be a switch in OFF
			if (( val == 'OFF' ) && (device_type == "switch")) { 
				devices[j]['val'] = 0; 
			}
			else if (( val == 'ON' ) && (device_type == "switch")) { 
				devices[j]['val'] = 1; 
			}
			else if (( val == 'ON' ) && (device_type == "dimmer")) { 
				devices[j]['val'] = devices[j]['lastval'] ; 
			}
			else if (( val == 'OFF') && (device_type == "dimmer")) {
				devices[j]['val'] = 0 ; 
			}													   			
			else { 
				devices[j]['val'] = val ;  
				devices[j]['lastval'] = val;
			}
			return(1);								// Stop loop
		}
	}// for
	return(1);	
}


// -------------------------------------------------------------------------
// Load the value of a device from the gui variable
// Inputs:
//			rm_id: The index for the room to load (probably the active room)
//			dev_id: The index of the device in the object array
// XXX we need to change the load/store functions so that they store
// complete object of one device: array of values for that rm_id and that dev_id
//
function load_device(rm_id, dev_id) {
	for (var j = 0; j<devices.length; j++ ) {
  		var device_id = devices[j]['id'];
		var room_id   = devices[j]['room'];	
       	if (( room_id == rm_id ) && ( device_id == dev_id )) {
			// add value to the devices object
			var val = devices[j]['val'];
			return( val );						// Stop loop
		}
	}
	return(1);		
}

// ---------------------------------- SCENES ------------------------------------

// This function takes the id of a scene ( index 0-31 in the array, id 1-32 in the database )
// and returns the corresponding scene in the database
// We could (sometimes) have worked with the index -1, but this would then not allow
// us to shuffle sequences (where at a moment the scene with id 6 might be located in scenes[2])
//
function get_scene(scn_id) {
	for (var j = 0; j<scenes.length; j++ ) 	{
       	if ( scenes[j]['id'] == scn_id ) {
			return( scenes[j] );
		}
	}
	return(-1);		
}

function idx_scene(scn_id) {
	for (var j = 0; j<scenes.length; j++ ) {
       	if ( scenes[j]['id'] == scn_id ) {
			return(j);
		}
	}
	return(-1);		
}

// ---------------------------------- HANDSETS -------------------------------------
//
// Same function but now for handset
//
function get_handset(hs_id) {
	for (var j = 0; j<handsets.length; j++ ) {
       	if ( handsets[j]['id'] == hs_id ) {
			return( handsets[j] );
		}
	}
	return(1);		
}

// ---------------------------------------------------------------------------------
//
// Get Handset object
//
function get_handset_record(hs_id,hs_unit,hs_val) {
	for (var j = 0; j<handsets.length; j++ ) {
       	if ((handsets[j]['id'] == hs_id) && (handsets[j]['unit'] == hs_unit) && (handsets[j]['val'] == hs_val)) {
			return( handsets[j] );
		}
	}
	return(1);		
}

// ---------------------------------- GET TIMER ------------------------------------
// This function takes the id of a scene ( index 0-31 in the array, id 1-32 in the database )
// and returns the corresponding scene in the database
// We could (sometimes) have worked with the index -1, but this would then not allow
// us to shuffle sequences (where at a moment the scene with id 6 might be located in scenes[2])
//
function get_timer(tim_id) {
	for (var j = 0; j<timers.length; j++ ) {
       	if ( timers[j]['id'] == tim_id ) {
			return( timers[j] );				// return value of the object
		}
	}
	return(-1);		
}

// ---------------------------------- SET TIMER ------------------------------------
//
function set_timer(tim_id,timer) {
	for (var j = 0; j<timers.length; j++ ) {
       	if ( timers[j]['id'] == tim_id ) {
			timers[j]=timer;					// add value to the  object
			return(0);
		}
	}
	return(-1);		
}

// ---------------------------------------------------------------------------------------
// Decode a timers scene 'seq' command string in ICS format back to human readable form so that we can build 
// a scene listing 
//
function decode_scene_string (str)
{
	logger("decode_scene_string: " + str,2);
	var pos1, room, dev, cmd, res;
	pos1 = 0;
	switch (str.substr(pos1,1))
	{
	// Device command
	case '!':
		pos1++;
		// room
		res = '';
		if ( str.substr(pos1,1) == 'R' ) { 
			pos1++;
			var nxt = str.substr(pos1+1,1);
			// If room number is only one position, as char+1 is alread a D or F
			if  (( nxt == "D" ) || ( nxt == "F" )) {
				room = str.substr(pos1,1); 
				pos1++; 
			}
			else { 
			// Room number is 2 positions
				room = str.substr(pos1,2); 
				pos1+=2; 
			}
		} // if 'R'
		else { 
			alert("decode_scene: Room not found in command string"); 
		};

		// Lookup the room in the memory database
		for (var i=0; i < rooms.length; i++ ) {
			if ( rooms[i]['id'] == room ) { res += rooms[i]['name'] }; 
		}
		// Char at current position
		// if command is D we have a device command
		// The D1 -- D32 device ident is OPTIONAL in the syntax.
		if ( str.substr(pos1,1) == 'D' ) { 
			res += ', ';
			pos1++;
			if (str.substr(pos1+1,1) == 'F' ) { 
				dev = str.substr(pos1,1); 
				pos1++; }
			else { 
				// Shift one position for rooms 10-31
				dev = str.substr(pos1,2); 
				pos1+=2; 
			}
			for (var i=0; i < devices.length; i++ ) {
				if ((devices[i]['uaddr'] == dev ) && (devices[i]['room'] == room )) { 
					res += devices[i]['name'] 
					switch (devices[i]['type']) {
						case "dimmer": 
							res += ', dimmer' ;
						break;
						case "switch":
							res += ', switch' ;
						break;
						// Sunblinds and energy not implemented 
						default:
							alert("decode_scene:: Unsupported devicetype: " + devices[i]['type']);
					}
				} 
			} 
			// Is this an all off or all on command, F code?
			if ( str.substr(pos1,1) == 'F' ) {
				pos1++;
				cmd = str.substr(pos1,1);
				switch (cmd) {
					case 'a': 	res += ', ALL OFF'; break;
					case 'o':	res += ', set dimmer'; break;
					case '0':	res += ', OFF'; break;
					case '1':	res += ', ON'; break;
					case 'k': 	res += ', Man. Lock'; break;
					case 'l':	res += ', Full Lock'; break;
					case 'd':	
						pos1++; if (str.substr(pos1,1) == 'P') {
						pos1++;	res += ', dim value: ' + str.substr(pos1);
						}
					break;
				}
			}
		}
		// nxt must be a F command for all off or Moods setting
		else if ( str.substr(pos1,1) == "F" ) {
			res += ', All off' ;
		}
		else { // XXX
			alert("Unknown syntax: " + nxt + " at this position. cmd:: "+str);
		}	
	break;
	
	// Timing delay
	case '0':
		res = 'Timing delay ' + str.substr(1) ;
	}
	return (res);
}


// -------------------------------------------------------------------------------------------------------------
// Handle incoming device requests, translate to a standard message and send to device 
// This function translate the id's used by the LamPI GUI to the device uaddr addresses
//
//	Input: The id of the calling button (!). Which for ICS in general is the same id as the real device name
//			in the ICS appliance. 
// In order to be independent of id's used by this LamPI gui, we translate its id's to "uaddr" addresses that will
// be used by the physical devices.
//
function handle_device(id,val) 
{
	// We know the current room s_room_id and the current device_id is passed by the handler to this function
	//
	var str = "";
	var action = "";
	var cmdString = "";	

	// Decode val and validate/correct its value
	if ( debug>=3 ) alert ("handle_device:: \nid: " + id + "\nval: " + val );
	
	switch (val) {
		case "Fo":
			str = str + "Fo";
		break;
		// For type dimmer/slider we  have set the behaviour so that
		// pressing the ON button twice will not start dimming up/down, but
		// only restore to last light setting
		case "ON":
		case "F1":
			//logger("handle_device:: F1 recognized");
			for (var i=0; i< devices.length; i++) {
				if (( devices[i]['id'] == id) && (devices[i]['room'] == s_room_id)) {
					if (devices[i]['type'] == "dimmer") {
						//alert ("handle_device:: dimmer translate");
						str = str + "FdP" + devices[i]['lastval'];
						break;
					}
					else {
						str = str + "F1";
						break;
					}
				}//if
			}//for
		break;
		// Switch OFF command
		case "OFF":
		case "F0":
			str = str + "F0";
		break;
		case "DUP":
			str = str + "S1";
		break;
		case "D":
			alert("handle_device:: " + val + " command not recognized");
		break;
		// All Off command
		case "Fa":
			cmdString = "!R" + s_room_id + "Fa";
			message_device("gui", action, cmdString);
			return(1);
		break;
		// If not a switch, it must be a dimmer (or thermostat)
		default:
			// must be dimmer, val is P0 through P32
			// Need to have better pasing of the arguments
			str = str + "Fd" + val;
	}	
	// str is now complete. Next we need to find out where to send the command string to.

	for (var i=0; i< devices.length; i++) {
		if (( devices[i]['id'] == id.substr(0,2) ) && ( devices[i]['room'] == s_room_id )) {
			
			var uaddr = devices[i]['uaddr'];
			var brand_id = devices[i]['brand'];
			// The message_device() function will use the brand name as the action description
			action = brands[brand_id]['fname'];
			// str bcomes something like: !R1D2FdP16"
			cmdString = "!R" + s_room_id + "D" + uaddr + str;
			break;
		}
	}
	logger("handle_device:: action is: "+action+", lamp command code is: "+cmdString);
	message_device( "gui", action, cmdString);	
} 


// -----------------------------------------------------------------------------------	
//	This is a universal piece of code for sending commands for lamp devices
//  The function only knows about devices "id" 's. Commands for switching on/off
//  are based on those buttons
//
// input : STRING action setting "device", "scene", "timer" makes easier for backend
// input : STRING controller_cmd (only ics) in the form of "!R1D2F1" or "!R1D2FdP15" for dimmers
//
function message_device(action, cmd, controller_cmd) 
{
	// We could also put this part at the end of the function. Then the command
	// would be executed, now we exit without sending the command
	if ( s_recording ) {
		s_recorder += controller_cmd;
		activate_scene(s_scene_id);
		return(1);
	}
	logger("message_device:: Calling send2daemon with "+action+", "+cmd+", "+controller_cmd,1);
	// Make the buffer we'll transmit. As you see, the GUI messages are really simple
	// and be same as ICS-1000, and will not be full-blown json.
	send2daemon(action,cmd,controller_cmd);
	return(1);
}

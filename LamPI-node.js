/************* LamPI Node Module **************************************************

Author: M. Westenberg (mw12554@hotmail.com)
LamPI Version:
	3.0.0; Mar 01, 2015; Webserver
	3.0.1; Mar 22, 2015; Rewriting PI-gate for node
	3.0.2; May 10, 2015; Rewriting LamPI-daemon for node
	3.0.3; May 26, 2015; Adding support for Woonveilig Alarm system
	3.5; Jul 29, 2015
	3.6; Sep 1, 2015

***********************************************************************************	*/
// Configuration
var debug = 1;						// 0 is nothing, 1 is normal >= 2 is serious debugging
var init = 0;						// Set to 1 if the init process is running. Stop daemons and ignore incoming messages.

var poll_interval =   6000;			// Determine how often we poll the devices for changed values
var log_interval  = 120000;			// Determines how often Z-Wave values are logged in the logfile
var alarm_interval=   2000;			// Determines how often we scan sensors for changed values
var timer_interval=  30000;			// Timer resolution in LamPI timers (crontab) is about 1 minute

var webPort  = 8080;				// The generic http webserver port
var sockPort = 5000;				// Websockets (gui)
var udpPort  = 5001;				// UDP sensors this is port 5001
var tcpPort  = 5002;				// RAW connected sensors: Port for net raw tcp connections

// Variables
var tcnt = 0;						// transaction counter
var zroot = {};						// Z-Wave root object (devices is one of its children)
var devices = {};					// The Z-Wave array of devices
var clients = [];					// Keep track of all connected clients
var loops = [];						// Keep track of running loop id's
var config={};						// This is the overall LamPI configuration array root
var lampi_admin=[];

var par   = require('./config/params');
var mysql = require('mysql'); console.log("mySQL loaded");
var fs    = require("fs"); console.log("fs loaded");
var strip = require("strip-json-comments"); console.log("strip-json-comments loaded");
var async = require("async"); console.log("ssync loaded");

var logDir  = par.homeDir+"/log"
var rrdDir  = par.homeDir+"/rrd"
var wwwDir  = par.homeDir+"/www"


var connection = mysql.createConnection({
  host     : par.dbHost ,
  user     : par.dbUser ,
  password : par.dbPassword ,
  database : par.dbName
});

// --------------------------------------------------------------------------------
// Logging function
// --------------------------------------------------------------------------------
function logger(txt,lvl) {
	lvl = lvl || debug;
	if (debug >= lvl) {
		var d = new Date();
		var dd =  ("00" + (d.getMonth() + 1)).slice(-2) + "/" + 
			("00" + d.getDate()).slice(-2) + "/" + 
			d.getFullYear() + " " + 
			("00" + d.getHours()).slice(-2) + ":" + 
			("00" + d.getMinutes()).slice(-2) + ":" + 
			("00" + d.getSeconds()).slice(-2);
		console.log("["+dd+"] "+txt);
	}
}

// Supportive functions
Array.prototype.contains = function(element){
    return this.indexOf(element) > -1;
};

// --------------------------------------------------------------------------------
// COMMAND LINE ARGUMENTS
// --------------------------------------------------------------------------------
process.argv.forEach(function (val, index, array) {
  
  if (index < 2) logger("process.argv["+index+"] skipping: "+val);		// Skip node command and the LamPI-node.js script
  else switch (val) {
	case "-i":
		init = 1;							// We are doing an init operation
		logger("Calling init",1);
		// init, read config file and make new database
		for (var i=0; i<loops.length; i++) clearInterval(loops[i]);		// Skip command and path
		logger('Suspending '+loops.length+' timers');
		config = readConfig();
		//console.log("config: ",config);
		createDbase(function (err, result) {
			if (err) { logger("init:: ERROR: "+err ); return; }
			logger("init:: createDbase returned "+result,1);
			Object.keys(config).forEach(function(key) {
				logger("createDbase: "+key+", length: "+config[key].length);
			});
			// nested, as we can start loading once the database is created
			logger("init:: Starting loadDbase");
			loadDbase( function (err, result) { 
				if (err == null) logger("init:: loadDbase returned successful "+result,1);
				var str = "";
				str += printConfig();
				str += '<br>init:: done, restarting loops';
				logger(str,2);						// Can only send results to web client once
				start_loops();
				init = 0;							// Enable connections to accept messages
			});
		});
		
	break;
	case "-r":
		// Only re-read the database into the config structure
		var str = "";
		init = 1;
		for (var i=0; i<loops.length; i++) clearInterval(loops[i]); // Stop the loops
		
		logger("reload:: read the configuration",1);
		loadDbase( function (err, result) { 
				if (err == null) logger("init:: loadDbase returned successful "+result,1);
				str += printConfig();
				str += '<br>init:: done, restarting loops';
				logger(str,2);						// Can only send results to web client once
				start_loops();
				init = 0;
		});
	break;
	default:
		logger("Process argv:: Unknown commandline argument "+val,1);
	break;
  }
});


// --------------------------------------------------------------------------------
// Put regular startup require dependencies here
// --------------------------------------------------------------------------------

var http  = require('http'); console.log("http loaded");
var net   = require('net');	console.log("net loaded");					// Raw Sockets Server
var dgram = require("dgram"); console.log("dgram loaded");
var express= require('express'); console.log ("express loaded");		// Middleware
var S     = require("string"); console.log("string loaded");
var exec  = require('child_process').exec; console.log("child_process loaded");
var serveStatic= require('serve-static'); console.log("serve-static loaded");
var WebSocketServer = require('ws').Server; console.log ("ws loaded");

// External apps
var SunCalc = require('suncalc'); console.log("suncalc loaded");

// Own Local modules
var alarmRouter = require('./modules/alarmRouter'); console.log("alarmRouter loaded");
var woonveilig = require('./modules/woonveilig'); console.log("woonveilig loaded");

console.log("All required modules loaded");


// --------------------------------------------------------------------------------
// EXPRESS middleware
// With help of express we can make routes to separate sections too (and make a REST interface)
// --------------------------------------------------------------------------------
//
var app = express();

// Re-read the database from the init file database.cfg, temporary suspend all loops
// 
app.all('/init', function (req, res, next) {
	init = 1;									// We are doing an init operation
	logger('Accessing the init section ...',1);
	var str = "";
	str += 'init started<br>';
	str += 'Suspending '+loops.length+' timers<br>';
	for (var i=0; i<loops.length; i++) clearInterval(loops[i]);
	config = readConfig();						// Read the config file first
	createDbase(function (err, result) {
		if (err) { logger("init:: ERROR: "+err ); return; }
		logger("init:: createDbase returned "+result,1);
		// nested, as we can start loading once the database is created
		logger("init:: Starting loadDbase");
		loadDbase( function (err, result) { 
			if (err == null) logger("init:: loadDbase returned successful "+result,1);
			str += printConfig();
			str += '<br>init:: done, restarting loops';
			logger(str,2);
			res.send(str);							// Can only send results to web client once
			start_loops();							// Restart the timer loops
			init = 0;								// Enable the receivers
		});
	});
  //next(); // pass control to the next handler
});

// (re)load the database for LamPI.
app.all('/load', function (req, res, next) {
	logger('Accessing the reload section ...',1);
	var str = "";
	str += 'reload started<br>';
	str += 'Suspending '+loops.length+' timers<br>';
  
	for (var i=0; i<loops.length; i++) clearInterval(loops[i]);
  	loadDbase( function (err, result) { 
			if (err == null) logger("load:: loadDbase returned successful "+result,1);
			str += printConfig();
			str += '<br>load:: done, restarting loops';
			logger(str,2);
			res.send(str);							// Can only send results to web client once
			start_loops();
	});
  //next(); // pass control to the next handler
});

//  ROUTE to sensors
app.all('/sensors', function (req, res, next) {
  console.log('Accessing the sensors section ...');
  res.send('sensors');
  //next(); // pass control to the next handler
});

//  ROUTE to config
app.all('/config', function (req, res, next) {
  console.log('Printing configuration ...');
  res.send(printConfig());
  //next(); // pass control to the next handler
});

//  ROUTE to alarm
app.use('/alarm', alarmRouter);


// --------------------------------------------------------------------------------
// Initiate Filesystem and define related functions
// Read the standard database configuration file and return the config array object

function readConfig() {
	var dbCfg = par.homeDir + "/config/" + par.configFile;			// database.cfg
	var ff = fs.readFileSync(dbCfg, 'utf8');
	var obj = JSON.parse(strip(ff));
	if (debug>=3) { logger("readConfig:: config read: ",3); console.log(obj); }
	return(obj);
}

function writeConfig(cfile) {
	logger("writeConfig:: wrinting configuration to file "+cfile,1);
	var json = JSON.stringify(config, null, 2);
	fs.writeFileSync(par.homeDir + "/config/" + cfile, json);
	return;
}

function listConfigDir() {
	return(fs.readdirSync(par.homeDir + "/config"));
}

function printConfig() {
	var str="<!DOCTYPE html>";
	Object.keys(config).forEach(function(key) {	
		str += '<h1>'+key+'</h1>';
		logger("printConfig: "+key+", length: "+config[key].length);
		str += '<table style="max_width: 100%; border: 1px solid black; border-collapse: collapse;" class="config_table">';
		str += '<tr class="config_line">';
		switch(key) {
			case "settings":
			case "brands":
			case "rooms":
			case "timers":
			case "scenes":
			case "handsets":
			case "devices":
			case "sensors":
			case "controllers":
			case "rules":
				Object.keys(config[key][0]).forEach(function(item) {
					str	+= '<th style="background-color: green; color: white;">'+item+'</th>'
				});
			break;
		}
		str += '</tr>'
		for (j=0; j<config[key].length; j++) {
			str += '<tr>';
			switch (key) {
				case "settings":
				case "brands":
				case "sensors":
				case "rooms":
				case "scenes":
				case "devices":
				case "timers":
				case "handsets":
				case "controllers":
				case "rules":
					var lupdate;
					var sns="";
					Object.keys(config[key][j]).forEach(function(item) {
						switch(item) {
						case 'lastUpdate':
							str += '<td style="border: 1px solid black;">&nbsp'+printTime(config[key][j][item])+'</td>';
						break;
						case 'sensor': 
							Object.keys(config[key][j]['sensor']).forEach(function(sens) {
								sns += '<td style="border: 1px solid black;">';
								lupdate = printTime(config[key][j]['sensor'][sens]['lastUpdate']);
								sns += sens+": "+parseFloat(config[key][j]['sensor'][sens]['val']).toFixed(1);
								sns+= '</td>';
							});
							sns = '<td style="border: 1px solid black;">'+lupdate+'</td>'+sns;
						break;
						case "seq":
							//str += '<td style="border: 1px solid black;">&nbsp'+config[key][j][item]+'</td>';
							str += '<tr><td style="min-width=100px;">';
							var strips = config[key][j]['seq'].split(",");
							for (var k=0; k<strips.length; k+=2) {
								str += "<tr><td>";
								str += "<td>, ics: "+strips[k]+"</td>";
								str += "<td>, time: "+strips[k+1]+"</td>";
								var r = /\d+/;
								var room = strips[k].match(r);
								if (strips[k].indexOf('Fa') != -1) {					// XXX Room must exist
									if (idRoom(room) >= 0)
										str += "<td>, Room "+config['rooms'][idRoom(room)]['name']+" All Off"+"</td>";
									continue;
								}
								var s = strips[k].indexOf('D');
								var uaddr = strips[k].substr(s+1,2).match(r);
								var ind = findDevice(room, uaddr);
								if (ind >= 0) 
									str += '<td style="border: 1px solid black;">, '+config['devices'][ind]['name']+'</td>';
								else str += '<td style="border: 1px solid black;">, CHECK THE DEVICE, MAY NOT EXTIST</td>';
							}
						break;
						case "jrule":
							str += '<tr><td>';
							str += '<td style="border: 1px solid black;" colspan="4">, jrule: '+JSON.stringify(config[key][j]['jrule'])+'</td>';
						break;
						case "brule":
							str += '<tr><td>';
							str += '<td style="border: 1px solid black;" colspan="4">, brule: '+JSON.stringify(config[key][j]['brule'])+'</td>';
						break;
						default: 
							str += '<td style="border: 1px solid black;">&nbsp'+config[key][j][item]+'</td>';
						}
					})
					str += sns;
				break;
			}
			str += '</tr>'			
		}//for
		str += '<br></table>';				// Between sub objects
	});
	
	// Now print the program parameters as well
	str += '<H1>Parameters</H1>';
	str +='<table>';
	Object.keys(par).forEach(function(key) {	
		str += "<tr>"
		str += "<td>"+ key +"</td>";
		str += "<td>: "+ par[key] +"</td>";
		str += "</tr>";									 
	});
	str += "<br></table>";				// Between sub objects	
	return(str);
}

// ============================================================================
// CURL: How to call (curl style) the Z-Wave JS API?
//	We can do this to retrieve the configuration of Z-Wave 
//	The http request can be called multiple times
// ----------------------------------------------------------------------------
function zwave_init (cb) {
	var zwave_init_options = {
		host: par.zHost,
		path: '/ZWaveAPI/Data/0',		// To get ALL Z-Wave data, the URL must end with 0
		port: '8083',
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	};
	// Get ALL data from the Zwave controller and put in zroot!
	var zwave_init_cb = function(response) {
		var statusCode = response.statusCode;
		if (statusCode === 404 || statusCode === 403) {
            // Send default image if error
			logger("wave_init:: Page not found\n");
			cb("No Page", null);
        }
		var str = '';
		//another chunk of data has been recieved, so append it to `str`
  		response.on('data', function (chunk) {
    		str += chunk;
		});
		response.on('end', function () {
    		if (debug>=3) console.log(str);
			zroot = JSON.parse(str);
			devices = zroot.devices;
			logger("Successfully read Z-Wave Data, #devices: "+Object.keys(devices).length,1);
			cb(null,"zwave_init done");
  		});
	}
	var req = http.request(zwave_init_options, zwave_init_cb);
	req.on('error', function(e) {
		logger("zwave_init:: ERROR opening connection to zwave host, "+e.message,1);
		cb("zwave no connection",null);
	})
	req.end();
}


// For GETting data changed from a certain moment
var zwave_upd_options = {
	host: par.zHost,
	path: '/ZWaveAPI/Data/'+(Math.floor(Date.now()/1000) - alarm_interval),
	port: '8083',
	method: 'GET',
	headers: { 'Content-Type': 'application/json' }
};

// Get ONLY updates drom the ZWave controller
//
var zwave_upd_cb = function(response) {
	var str = '';
	//another chunk of data has been recieved, so append it to `str`
  	response.on('data', function (chunk) {
    	str += chunk;
	});
	response.on('end', function () {
    	if (debug>=3) console.log(str);
		var js = JSON.parse(str);
		
		Object.keys(js).forEach(function(key) {
			var pobj = zroot;							// NOTE Zroot MUST have been initialize before
			var pe_arr = key.split('.');
			
			for (var i=i; i< (pe_arr.length-1); i++) {
			//for (var pe in pe_arr.slice(0,-1)) {
					pe = pe_arr[i];				// Only when not using for in loop (en that uses 1 additional loop)
                	pobj = pobj[pe_arr[pe]];
            };
			if (pobj === undefined ) logger("pobj is null line 340, "+pe_arr.slice(-1),1);
			pobj[pe_arr.slice(-1)] = js[key];
		});
		logger("Successfully read the Z-Wave Data stucture, Read "+ Object.keys(js).length +" records",2);
  	});
}

// ================================================================================
// BROADCAST Send a message to all clients/sockets
// Make sure that broadcasts are timed so that there be no collissions of transmissions
// and each broadcast to slaves is dealt with correctly
// --------------------------------------------------------------------------------
function broadcast(message, sender, mask) {	// MMM
	logger("broadcast:: message: "+message, 2);
	var funcs = [];
	var args  = [];
	// If you don't want to send back to sender, such as sensors
	// At the moment we need broadcast to confirm actions to the initiating GUI
	clients.forEach(function (client) {

	  args.push (client);
	  funcs.push( function(callback) { 				// Push the function code for later use
		setTimeout(function() {
			var cl = args.shift();
			//if ((cl !== sender) || ( cl.type == "ws" )) {
				if ((mask != undefined ) && (mask.indexOf(cl.type) >= 0 )) {	// if masked for this type of message
					logger("broadcast:: Masking for socket: "+cl.name+", type: "+cl.type,3);
					callback(null , cl.name+"-masked");
				}
				else
		  		switch (cl.type) {
				case "raw":
					logger("Broadcast to Rawsocket: "+cl.name,2);
					if (cl.write(message) != true) {
						logger("broadcast:: raw socket error",1);
						callback("broadcast raw error" , null)
					}
					else {
						logger("broadcast :: raw client: "+cl.name,3);
						callback(null, cl.name);
					}
				break;
				case "ws":
					cl.send(message, function ack(error) {
						if (error) { 
							logger("broadcast:: ws send error: "+error,1); 
							callback(error, null) 
						}
						else {
							logger("broadcast :: web client: "+cl.name,3);
							callback(null, cl.name);
						}
					});
				break;
				default:
					logger("broadcast:: unknown type: "+cl.type,2);
					callback("broadcast:: Unknown type: "+cl.type, null);
				break;
		  		}//switch
				//callback("broadcast:: Error Unknown type: "+cl.type, null);
			//}//if
		}, 300);//setTimeout
	  });// funcs
	});// forEach
	
	async.series(funcs, function(err, results) {
		if (err) logger("broadcast:: ERROR ERROR: "+err,1);
		else logger("broadcast:: finished, results: "+results,2);
	});
	return;
}

// --------------------------------------------------------------------------------
// RAW SOCKET Server, listen for incoming connections
// The TCP server below defines the actual listening address
// --------------------------------------------------------------------------------
var HOST = "0.0.0.0";

var server = net.createServer(function(socket) { //'connection' listener									  
	// Upon incoming request
	socket.name = socket.remoteAddress + ":" + socket.remotePort;
	socket.type = "raw";
	socket.trusted = 1;									// raw sockets from sensors are trusted by default
	logger('SOCKET:: socket server connected to: '+socket.name,1);
	clients.push(socket);								// Push this new client in the list
	socket.on('end', function() {						// End of connection
		logger("SOCKET:: socket server "+socket.name+" disconnected",1);
		clients.splice(clients.indexOf(socket), 1);
	});
	socket.on('text', function(txt) {
		logger('SOCKET:: socket server received text: '+txt,1);
	});
	socket.on('data', function(data) {				// This function is calld when receiving data from sensors
		logger("SOCKET:: socket data received: "+ data+", trusted: "+socket.trusted, 2);
		//socket.write(200,{ 'Content-Type': 'text/html' });"
		if (init==0) socketHandler(data,socket);
		else logger("socket:: Discard incoming message",1);
	});
	socket.on('message', function(data) {
		logger("SOCKET:: socket message received: "+ data,2);
		//socket.write(200,{ 'Content-Type': 'text/html' });
		if (init==0) socketHandler(data,socket);
		else logger("socket:: Discard incoming message",1);
	});
	socket.on('upgrade', function(request, sock, head) {
		logger("SOCKET:: socket upgrade received: "+ request,1);
		var data = {
			tcnt: 868,
			type: "json",
			action: "alarm",						// actually the class of the action
			scene: "",								// Scene name to be executed
			message: "NODE ALARM"					// Message to popup in 
		};
		var ret = sock.write(JSON.stringify(data));
	});
	socket.on('error', function(e) {
		logger("SOCKET:: Error: "+e,1);
	});
	socket.on('connect', function() {
		logger("SOCKET:: socket Connection Established ",1);
	});
});

server.listen(tcpPort, HOST, function() { 			//'listening' listener	
	logger('TCP server listening to addr:port: '+HOST+":"+tcpPort);
});



// ----------------------------------------------------------------------------
// WEBSOCKET SERVER
//		Here we receive the messages from the GUI
//		Since the GUI will normally only start AFTER static webserver has started
//		timing is no issue here
// ----------------------------------------------------------------------------
function checkIP(ip) {
	var ips = ip.split("."); 
	ips[0] = ips[0].split("//")[1];			// We know that the ip address starts with "http://"
	var zips = par.thisHost.split(".");	
	if ((zips[0] == ips[0]) && (zips[1] == ips[1]) && (zips[2] == ips[2]) ) {
		logger("checkIP:: client is from local network",1);
		return(1);
	}
	logger("checkIP:: client is from remote network: "+ips[0]+" "+ips[1]+" "+ips[2],1);
	return(0);
};

var wss = new WebSocketServer({port: sockPort});
wss.on('connection', function(ws) {
	ws.name = ws.upgradeReq.headers.origin;			// In general the address and port of our webserver
	ws.type = "ws";									// Add the type ws (websocket)
	ws.trusted = checkIP(ws.upgradeReq.headers.origin);	// Guest is 0 status, 1 if on local IP
	logger("WS:: new socket connected: "+ ws.name,1);
	clients.push(ws);								// Put this new client in the list
	ws.on('message', function(message) {
		if (debug >=2) console.log('WS rcv msg, trusted: '+ws.trusted+': %s', message);
		if (init==0) socketHandler(message, ws);
		else logger("websocket:: Discard incoming message",1);
	});
	// ws.send('ping');
	ws.on('close',function() {
		logger("WS:: socket "+ws.name+" disconnected",1);
		clients.splice(clients.indexOf(ws), 1);
	});
}); 

// ----------------------------------------------------------------------------
// UDP Server
// Bind to a well known address and listen to incoming DGRAM messages
// The listener is started in the main loop to avoid reference to uninitialized objects
// ----------------------------------------------------------------------------
var userver = dgram.createSocket("udp4");

userver.on("error", function (err) {
  console.log("UDP server error:\n" + err.stack);
  userver.close();
});
userver.on("message", function (msg, rinfo) {
  logger("UDP message from " + rinfo.address + ":" + rinfo.port,2);
  logger("UDP server  msg: " + msg,3);
  rinfo.name = rinfo.address + ":" + rinfo.port;
  rinfo.type = "udp";
  if (init==0) { socketHandler(msg, rinfo); }
  else { logger("udp:: Discard message",1); }
});
userver.on("listening", function () {
  var address = userver.address();
  logger("UDP server listening to addr:port: " + address.address + ":" + address.port,1);
});

// ============================================================================
// NODE_MYSQL: How to call database functions
// 	The call to the database is used to retrieve the list of devices used by LamPI
// 	In principle we do this once (and may be repeated to get the device
//	definitions and address to name translation for Z-Wave devices in our
//	network
// ----------------------------------------------------------------------------

function connectDbase(cbk) {
	connection.connect(function(err) {
	// connected! (unless `err` is set)
		if (!err) {
			logger("Connected to the MySQL Database",1);
			cbk(null, "mysql connected");
		}
		else {
			logger("ERROR:: Connecting to the MySQL Database, make sure database exists and permissions are OK",1);
			logger("connectDbase:: err: "+err,1);
			cbk("connectDbase error","null");
		}
	});
}

// ----------------------------------------------------------------------------
// Perform a single SELECT query, and callback function
// ----------------------------------------------------------------------------
function queryDbase(qry,cbk) {
  var query = connection.query(qry, function(err, rows, fields) {
	if (!err) {
		if (debug >= 3) { console.log('queryDbase:: is: \n', rows); }
		cbk(null, rows);
	}
	else {
		console.log('queryDbase:: err: '+err+', query: <'+qry+">");
		cbk("queryDbase err: "+err,null);
	}
  });
}

// ----------------------------------------------------------------------------
// Insert in DB
// ----------------------------------------------------------------------------
function insertDb(table, obj, cbk) {
	var query = connection.query('INSERT INTO '+table+' SET ?', obj, function(err, result) {
  		if (!err) {
  			if (debug >= 3) { console.log('insertDb success:: result: \n', result); }
			cbk(null,result);
  		}
		else {
			console.log('insertDb:: err: '+err+', query ',query.sql);
			cbk("Error: "+err,null);
		}
  	});	
}

// ----------------------------------------------------------------------------
// update in DB
// ----------------------------------------------------------------------------
function updateDb(table, obj, cbk) {
	var query = connection.query('UPDATE '+table+' SET ? WHERE id=?', [ obj, obj.id ], function(err, result) {
  		if (!err) {
  			if (debug >= 3) { console.log('updateDb success:: result: \n', result); }
			cbk(null,result);
  		}
		else {
			console.log('updateDb:: err: '+err+', query ',query.sql);
			cbk(err,result);
		}
  	});	
}

// ----------------------------------------------------------------------------
// Delete item in DB, based on correct id
// ----------------------------------------------------------------------------
function deleteDb(table, obj, cbk) {
	var query = connection.query('DELETE FROM '+table+' WHERE id=?', obj.id, function(err, result)  {
  		if (!err) {
  			if (debug >= 3) { console.log('deleteDb success:: result: \n', result); }
			cbk(null,result);
  		}
		else {
			console.log('deleteDb:: err: '+err+', query ',query.sql);
			cbk(err,result);
		}
  	});	
}

// ----------------------------------------------------------------------------
// Delete Device(!) in DB, based on correct room and id
// ----------------------------------------------------------------------------
function delDevDb(table, obj, cbk) {
	var query = connection.query('DELETE FROM '+table+' WHERE id=? and room=?', [ obj.id, obj.room ], function(err, result)  {
		//logger("delDevDb:: query: "+query);
  		if (!err) {
  			if (debug >= 3) { console.log('deleteDb success:: result: \n', result); }
			cbk(null,result);
  		}
		else {
			console.log('delDevDb:: err: '+err+', query ',query.sql);
			cbk(err,result);
		}
  	});	
}

// ----------------------------------------------------------------------------
// update Device(!) in DB
// ----------------------------------------------------------------------------
function updDevDb(table, obj, cbk) {
	var query = connection.query('UPDATE '+table+' SET ? WHERE id=? AND room=?', [ obj, obj.id, obj.room ], function(err, result) {
  		if (!err) {
  			if (debug >= 3) { console.log('updDevDb success:: result: \n', result); }
			cbk(null,result);
  		}
		else {
			console.log('updDevDb:: err: '+err+', query ',query.sql);
			cbk(err,result);
		}
  	});	
}

// ----------------------------------------------------------------------------
// Create Database, belongs to init function
// ----------------------------------------------------------------------------
function createDbase(cb) {
  async.series(
  [
    // ONLY! when there is no table users, create it and add the users from the database.cfg file.
	// in other case, edit the database table by hand!! If the table exists, we do not overwrite
	// its cnotent.
	function (callback) {
		queryDbase('CREATE TABLE IF NOT EXISTS users(id INT, descr CHAR(128), type CHAR(32), name CHAR(20), login CHAR(20), passw CHAR(32), class INT )',function(err, ret) { 
			var u = [];
			if (!err) {
				queryDbase('SELECT * FROM users', function(err, ret, fields) {
					if (!err) {
						if (ret.length == 0) {
							for (var i=0; i< config['users'].length; i++) { 
								insertDb("users", config['users'][i], function(cb) { u.push("u"); }); 	
							}
							callback(err,'uers made, sizeof users is:  '+config['users'].length);
						}
						else {
							logger("createDbase:: WARNING: There are already users in the user table");
							callback(err,"existing users");
						}
					}
					else { callback(err,null); }
				});
			}
			else { callback(err,null); }
		});
	},
	function (callback) {
		queryDbase('DROP TABLE IF EXISTS rooms',function(err, ret) { 
			queryDbase('CREATE TABLE rooms(id INT, descr CHAR(128), name CHAR(20) )', function(err, ret) {
				callback(err,'rooms made');
			});
		});
	},
	function (callback) {
		queryDbase('DROP TABLE IF EXISTS devices',function(err, ret) { 
			queryDbase('CREATE TABLE devices(id CHAR(3), descr CHAR(128), uaddr CHAR(3), gaddr CHAR(12), room CHAR(12), name CHAR(20), type CHAR(32), val INT, lastval INT, lastUpdate INT, brand CHAR(20) )',function(err, ret) {																																	
				callback(err,'devices made');
			});
		});
	},
  function(callback) {
	queryDbase('DROP TABLE IF EXISTS scenes',function(err, ret) { 
		queryDbase('CREATE TABLE scenes(id INT, descr CHAR(128), val INT, name CHAR(20), type CHAR(32), seq CHAR(255) )',function(err, ret) {
			callback(err,"scenes made");
		});
	});
  },
  function (callback) {
	queryDbase('DROP TABLE IF EXISTS timers',function(err, ret) { 
		queryDbase('CREATE TABLE timers(id INT, descr CHAR(128), name CHAR(20), type CHAR(32), scene CHAR(20), tstart CHAR(20), startd CHAR(20), endd CHAR(20), days CHAR(20), months CHAR(20), skip INT )',function(err, ret) {
			callback(err,'timers made');
		});
	});
  },
  function (callback) {
	queryDbase('DROP TABLE IF EXISTS handsets',function(err, ret) { 
		queryDbase('CREATE TABLE handsets(id INT, descr CHAR(128), name CHAR(20), brand CHAR(20), addr CHAR(20), unit INT, val INT, type CHAR(20), scene CHAR(255) )',function(err, ret) {
			callback(null,'handsets made');
		});
	});
  },
  function (callback) {
	queryDbase('DROP TABLE IF EXISTS settings',function(err, ret) { 
		queryDbase('CREATE TABLE settings(id INT, descr CHAR(128), val CHAR(128), name CHAR(20), sett CHAR(255) )',function(err, ret) {
			callback(null,'settings made');
		});
	});
  },
  function (callback) {
	queryDbase('DROP TABLE IF EXISTS controllers',function(err, ret) { 
		queryDbase('CREATE TABLE controllers(id INT, descr CHAR(128), name CHAR(20), fname CHAR(128) )',function(err, ret) {
			callback(null,'controllers made');
		});
	});
  },
  function (callback) {
	queryDbase('DROP TABLE IF EXISTS brands',function(err, ret) { 
		queryDbase('CREATE TABLE brands(id INT, descr CHAR(128), name CHAR(20), fname CHAR(128) )',function(err,ret) {
			callback(null,'brands made');
		});
	});
  },
  function (callback) {
	queryDbase('DROP TABLE IF EXISTS sensors',function(err, ret) { 
		queryDbase('CREATE TABLE sensors(id INT, descr CHAR(128), name CHAR(20), room CHAR(12), location CHAR(20), brand CHAR(20), address CHAR(20), channel CHAR(8), type CHAR(32), sensor CHAR(255) )',function(err,ret) {
			callback(null,'sensors made');
		});
	});
  },
  function (callback) {
    queryDbase('DROP TABLE IF EXISTS rules',function(err, ret) { 
		queryDbase('CREATE TABLE rules(id INT, descr CHAR(128), name CHAR(20), type CHAR(32), active CHAR(1), jrule TEXT(65000), brule TEXT(65000) )',function(err,ret) {
  		callback(null,'rules made');
		});
  	});
  },
  //
  // Now all tables are made, we can start filling the databases
  function (callback) { var r = [];
	logger("createDb starting for devices, #devices: "+config['devices'].length);
	for (var i=0; i< config['devices'].length; i++) { 
		insertDb("devices", config['devices'][i], function(err,result) { r.push("d"); }); }
	callback(null, 'devices: '+r);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['sensors'].length; i++) { 
		var obj = config['sensors'][i];
		obj.sensor = JSON.stringify(config['sensors'][i]['sensor']);
		insertDb("sensors", obj, function(cb) { r.push("w"); }); 	
	}
	callback(null, 'sensors: '+r);
  },
  function (callback) { var r = [];
	logger("createDb starting for rooms, #rooms: "+config['rooms'].length);
	for (var i=0; i< config['rooms'].length; i++) { 
		insertDb("rooms", config['rooms'][i], function(cb) { r.push("r") }); }
	callback(null, 'fill rooms'+config['rooms'].length);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['scenes'].length; i++) { 
		insertDb("scenes", config['scenes'][i], function(cb) { r.push("s"); }); }
	callback(null, 'scenes: '+r);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['timers'].length; i++) { 
		insertDb("timers", config['timers'][i], function(cb) { r.push("t"); }); }
	callback(null, 'timers: '+r);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['handsets'].length; i++) { 
		insertDb("handsets", config['handsets'][i], function(cb) { r.push("h"); }); }
	callback(null, 'handsets: '+r);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['settings'].length; i++) { 
		var obj = config['settings'][i];
		obj.sett = JSON.stringify(config['settings'][i]['sett']);
		insertDb("settings", config['settings'][i], function(cb) { r.push("x") }); }
	callback(null, 'settings: '+r);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['controllers'].length; i++) { 
		insertDb("controllers", config['controllers'][i], function(cb) { r.push("c"); }); }
	callback(null, 'controllers: '+r);
  },
  function (callback) { var r = [];
	for (var i=0; i< config['brands'].length; i++) { 
		insertDb("brands", config['brands'][i], function(cb) { r.push("b"); }); 	}
	callback(null, 'brands: '+r);
  },
  function (callback) { var r = [];
    for (var i=0; i< config['rules'].length; i++) {
		var obj = config['rules'][i];
		obj.jrule = JSON.stringify(config['rules'][i]['jrule']);
		obj.brule = JSON.stringify(config['rules'][i]['brule']);
 		insertDb("rules", obj, function(cb) { r.push("s"); }); 	
	}
	callback(null, 'rules: '+r);
  }
  ], // end of async part
  function (err, result) { 
  	if (err) { 
		logger("createDbase:: ERROR: "+err); 
		cb(err,result);
	}
  // Now the databases are created, we can read the database.cfg file, JSON.parse
	else {
  		logger("createDbase:: Databases created, result: ",1); console.log(result);
		cb(null,result);
	}
  });
}

// ----------------------------------------------------------------------------
// LOAD DATABASE
// Read the config object with all database data
// NOTE: Only users is NOT exported
// ----------------------------------------------------------------------------
function loadDbase(db_callback) {
  async.series([			  
	function(callback) {
	  queryDbase('SELECT * from devices',function(err, dev) { 
		if (!err) {
		  config['devices']=dev;  
		  for (var i=0; i< config['devices'].length; i++) {		// Init the lampi_admin array
			if (config['devices'][i]['gaddr'] == "868") {		// Is this a Z-Wave device
				var rec = {										// every rec is defined only once
					val: config['devices'][i]['val'],
					checks: 3
				}
				var unit = config['devices'][i]['uaddr'];
				lampi_admin[unit] = rec;
			}//if 868
		  }//for
		  callback(null,'devices '+dev.length);
		}
		else {
			logger("loadDbase:: ERROR reading devices table, "+err,1);
			callback("loadDbase ERROR reading devices",null);
		}
	  });
	},
	function(callback) {
		queryDbase('SELECT * from sensors',function(err, arg) { 
			if (arg === null) { 
				logger("loadDbase:: select sensors returns 0",1);
				callback("loadDbase sensors error",null); 
			} else {
				config['sensors']=arg; 
				for (var i=0; i<arg.length; i++) { arg[i]['sensor'] = JSON.parse(arg[i]['sensor'] ); }
				callback(null,'sensors '+arg.length); 
			}
		});
	},
	// Do the CURL request to Z-Wave to load the devices data
	function(callback) {
		queryDbase('SELECT * from rooms',function(err, arg) { 
			config['rooms']=arg; callback(null,'rooms '+arg.length); });
	},
	function(callback) {
		queryDbase('SELECT * from scenes',function(err, arg) { 
			config['scenes']=arg; callback(null,'scenes '+arg.length); });
	},
	function(callback) {
		queryDbase('SELECT * from timers',function(err, arg) { 
			config['timers']=arg; callback(null,'timers '+arg.length); });
	},
	function(callback) {
		queryDbase('SELECT * from settings',function(err, arg) { 
			config['settings']=arg; 
			for (var i=0; i<arg.length; i++) { arg[i]['sett'] = JSON.parse(arg[i]['sett'] ); }			// XXX Not always working
			callback(null,'settings '+arg.length); });
	},
	function(callback) {
		queryDbase('SELECT * from brands',function(err, arg) { 
			config['brands']=arg; callback(null,'brands '+arg.length); });
	},
	function(callback) {
		queryDbase('SELECT * from handsets',function(err, arg) { 
			config['handsets']=arg;callback(null,'handsets '+arg.length); });
	},
	function(callback) {
		queryDbase('SELECT * from rules',function(err, arg) {
			if (arg === null) { 
				logger("loadDbase:: select rules returns 0",1);
				callback("loadDbase rules error",null); 
			} else {
			  for (var i=0; i<arg.length; i++) { 
				try { arg[i]['jrule'] = JSON.parse(arg[i]['jrule'] ); }
				catch(e) {
					logger("JSON error parsing jrule",1);
					console.log(e);
					callback("loadDbase jrule error",null); 
				}
				try { arg[i]['brule'] = JSON.parse(arg[i]['brule'] ); }
				catch(e) {
					logger("JSON error parsing brule",1);
					console.log(e);
					callback("loadDbase brule error",null); 
				}
			  }
			  config['rules']=arg;
			  callback(null,'rules '+arg.length); 
			}
		});	
	},
	function(callback) {
		queryDbase('SELECT * from controllers',function cbk(err, arg) { 
			config['controllers']=arg; callback(null,'controllers '+arg.length); });
	}
  ], function(err, result) {
		db_callback(null, result) 
  });	
}


// --------------------------------------------------------------------------------
// Options for Setting Z-Wave values
//  ldev is the index in the LamPI device array
//	val is the new value for this devices
//	zdev is the index in the zway device structure
// --------------------------------------------------------------------------------
function deviceSet (ldev, val) {
	var zdev = config['devices'][ldev]['uaddr'];
	var type = config['devices'][ldev]['type'];
	var zval = Math.floor( val * 99 / 32);
	var opt4set = {
		host: par.zHost,
		path: '',
		port: '8083',
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	};
	callSet = function(response) {
		response.on('data', function (chunk) {		
			logger("WARNING deviceSet received data: "+chunk, 2);
		});
		response.on('end', function () {
			logger("deviceSet has ended",2);
		});
		response.on('error', function () {
			logger("deviceSet ERROR Updating dev: "+zdev+"", 1);
  		});
	}
	logger("deviceSet:: setting zdev: "+zdev+" to "+val,1);
	switch (type) {
		case "dimmer":
			opt4set.path = '/ZWaveAPI/Run/devices['+zdev+'].instances[0].commandClasses[38].Set('+zval+')';
		break;
		case "switch":
			opt4set.path = '/ZWaveAPI/Run/devices['+zdev+'].instances[0].commandClasses[37].Set('+zval+')';
		break;
		case "thermostat":	// data 1 is set point
			opt4set.path = '/ZWaveAPI/Run/devices['+zdev+'].instances[0].commandClasses[67].ThermostatSetPoint.Set(1,'+zval+')';
		break;
		default:
			logger("deviceSet:: Unknown type "+type);
		break
	}
	// Update the admin
	//lampi_admin[zdev]['val'] = val;								// Update the admin array asap

	// Call the function
	//http.request(opt4set, callSet).end();
	var req = http.request(opt4set, callSet);
		
	req.on('error', function(e) {
		logger("deviceSet:: ERROR making connection to zwave host, "+e.message,1);
	})
	
	req.end();
}

// --------------------------------------------------------------------------------
//	DeviceGet
//	Make sure that we have the latest value of the device in our Z_Wave data structure
//	The dev parameter defines the device that we like to update 
// ldev is index of device in LamPI devices array
// --------------------------------------------------------------------------------
function deviceGet(ldev,ltype) {	
	var dev  = config['devices'][ldev]['uaddr'];	// LamPI Device address
	var lVal = config['devices'][ldev]['val'];		// LamPI gui value
	var aVal = lampi_admin[dev]['val'];			// NOTE: This array is indexed like the Z-Way(!) devices[] array
	var newVal, lastUpdate, inValid;
	var opt4get = {
		host: par.zHost,
		path: '/ZWaveAPI/Run/devices['+dev+'].Basic.Get()',
		port: '8083',
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	};
	var callget = function(response) {
		
		// In principle this function does not return anything
  		response.on('data', function (chunk) {		
			logger("ERROR deviceGet received data: "+chunk, 3);
		});
		
		//the whole response has been recieved, so we just print it out here
		response.on('end', function () {
			
			if (devices[dev] == undefined) {
				logger("deviceGet:: Device "+dev+" not read yet from ZWave", 2);
				return;
			}
			logger("deviceGet:: device: "+dev+", lampi dev index: "+ldev, 2);
			// If new value <> old value --->> Change 
			// And If new value <> LamPI-value -->> Update LamPI, we have a manual change
			switch (ltype) {
				case "switch": 
					if (devices[dev].instances[0].commandClasses[37].data.interviewDone.value == false) {
						console.log("ERROR:: Switch device "+dev+" Dead");
						return;
					}
					newVal = devices[dev].instances[0].commandClasses[37].data.level.value + 0;
					lastUpdate = devices[dev].instances[0].commandClasses[37].data.level.updateTime +0;
					inValid = devices[dev].instances[0].commandClasses[37].data.level.invalidateTime +0;
				break;
				case "dimmer":
					if (devices[dev].instances[0].commandClasses[38].data.interviewDone.value === false) {
						console.log("ERROR:: Dimmer device "+dev+" Dead");
						return;
					}
					newVal = Math.ceil(devices[dev].instances[0].commandClasses[38].data.level.value/99*32);
					lastUpdate = devices[dev].instances[0].commandClasses[38].data.level.updateTime + 0;
					inValid = devices[dev].instances[0].commandClasses[38].data.level.invalidateTime + 0;
				break;
				case "thermostat":
					if (devices[dev].instances[0].commandClasses[67] == undefined) {
						logger("ERROR:: Thermostat device "+dev+" not defined");
						return;
					}
					if (devices[dev].instances[0].commandClasses[67].data.interviewDone.value === false) {
						logger("ERROR:: Thermostat device "+dev+" Dead",2);
						return;
					}
					newVal = devices[dev].instances[0].commandClasses[67].data[1].val.value;
					lastUpdate = devices[dev].instances[0].commandClasses[67].data[1].val.updateTime;
					inValid = devices[dev].instances[0].commandClasses[67].data[1].val.invalidateTime;
					return;
				break;
				default:
					logger("ERROR lampi type not supported: "+ltype);
					return;
				break;
			}// switch
			logger("Dev: "+dev+", lVal: "+lVal+", aVal: "+aVal+", zVal: "+newVal,2);
			
			// The Z-Wave newVal, the LamPI lVal and the administratie value are equal
			if (( newVal == lVal ) && ( aVal == lVal )) { 	
				logger ("X X X, all values of device "+dev+" are equal",3);
				return;
			}
			// The Z-Wave newVal and the LamPI lVal both changed are the LamPI admin value needs updating
			else if (( newVal == lVal ) && ( aVal != lVal )) { 
				logger ("Y X Y, updating device "+dev+" to zVal: "+newVal,1);
				lampi_admin[dev]['val'] = newVal;				
			}
			// Gui Action
			// The LamPI gui value lVal is different from the administrative value and Z-Wave measured value newVal
			else if (( lVal != newVal ) && ( aVal == newVal )) { 
				logger("Y X X, The gui valui of "+dev+" has changed",1);
				config['devices'][ldev]['val'] = lVal;							// Change value in working array
				updDevDb("devices", config['devices'][ldev], function(cbk) { 	// Store in MySQL
						logger("deviceGet:: store_device "+dev+" finished OK",1); });
				// prepare a broadcast message for all connected gui's
				var ics = "!R"+config['devices'][ldev]['room']+"D"+dev+"F";
				if (lVal == 0) ics = ics+"0"; else ics = ics + "dP" + lVal;
				var data = {
					tcnt: ""+tcnt++ ,
					type: "raw",				// Json not fully implemented
					action: "gui",				// actually the class of the action
					cmd: "zwave",
					gaddr: "868",
					uaddr: ""+dev,
					val: ""+lVal,
					message: ics	
				};
				logger("deviceGet:: to icsHandler: "+JSON.stringify(data),1);
				var ret = icsHandler(data, null);	
			}
			// The Z-Wave value newVal has changed (human touch) and the LamPI lVal and administrative value
			// need updating to this change
			else if (( newVal != lVal ) && ( aVal == lVal ))						  
			{
				logger("X X Y, Z-Wave changed; Update lampi gui for device "+dev+" to value "+newVal,1);
				var data = {
							tcnt: ""+tcnt++ ,
							type: "raw",
							action: "gui",				// actually the class of the action
							cmd: "zwave",
							gaddr: "868",
							uaddr: ""+dev,
							val: ""+newVal,
							message: "!R"+config['devices'][ldev]['room']+"D"+dev+"F"+newVal	// switch
				};
				switch (ltype) {
					case "switch":
						data.message = "!R"+config['devices'][ldev]['room']+"D"+dev+"F"+newVal;
					break;
					case "dimmer":
						data.message = "!R"+config['devices'][ldev]['room']+"D"+dev+"FdP"+newVal ;	// Message parameter(s) ICS code
					break;
					default:
						logger("No Manual Update Action defined");
					break;
				}//switch
				logger("Sending data to icsHandler: "+JSON.stringify(data),1);
				var ret = icsHandler(data, null );
				//lampi_admin[dev]['val'] = newVal;
				logger("Updated device to "+newVal+", cmd string: "+data.message,1);
			}//if laval != zval
			else {
				logger("Y X Z, reset admin for device "+dev+" to lampi defined value "+lVal,1);
				lampi_admin[dev]['val'] = lVal;
			}
  		});//.on end
		
		response.on('error', function () {
    		//console.log(str);
			logger("deviceGet:: ERROR Updating dev: "+dev+"", 1);
  		});
		
		response.on('timeout', function () {
  		// Timeout happened. Server received request, but not handled it
  		// (i.e. doesn't send any response or it took to long). You don't know what happend.
  		// It will emit 'error' message as well (with ECONNRESET code).
  			logger("deviceGet:: TIMEOUT");
  			response.abort();						// XXX This may be just too much
		});
		response.setTimeout(5000);
	}
	// Call the function
	var req = http.request(opt4get, callget);
		
	req.on('error', function(e) {
		logger("deviceGet:: ERROR opening connection to zwave host, "+e.message,1);
	})
	
	req.end();

}

// --------------------------------------------------------------------------------
//	TIME Functions, get the time in string format or as ticks
// --------------------------------------------------------------------------------
//
function getTime() {
	var date = new Date();
	return S(date.getHours()).padLeft(2,'0').s+ ':' +S(date.getMinutes()).padLeft(2,'0').s+ ':' +S(date.getSeconds()).padLeft(2,'0').s ;
}

// We use the time but devide the time by 1000 to work in milliseconds to our timers
function getTicks() {
	//var date = new Date();
	return (Math.floor(Date.now()/1000));
}

function getSunRise() {
	var times = SunCalc.getTimes(new Date(), 51.5, -0.1);
	return (Math.floor(times.sunrise.getTime()/1000));
}

function getSunSet() {
	var times = SunCalc.getTimes(new Date(), 51.5, -0.1);
	return (Math.floor(times.sunset.getTime()/1000));
}

function printTime(t) {
	var date = new Date(t*1000);
	return ("00"+(date.getMonth()+1)).slice(-2) +"/"+ ("00"+date.getDate()).slice(-2) +"/"+ date.getFullYear()+ " " + S(date.getHours()).padLeft(2,'0').s+ ':' +S(date.getMinutes()).padLeft(2,'0').s+ ':' +S(date.getSeconds()).padLeft(2,'0').s ;
}

// --------------------------------------------------------------------------------
// HANDSET helper functions
//		a is the address, u is the unit (button id)
// --------------------------------------------------------------------------------
function findHandset (a, u, v) {
	var hsets = config['handsets'];
	logger("findHandset:: length: "+hsets.length+", addr: "+a+", unit: "+u,2);
	var i;
	for (i=0; i < hsets.length; i++) {
		if ((hsets[i]['addr'] == a ) && (hsets[i]['unit'] == u )&& (hsets[i]['val'] == v )) { break; }
	}
	if (i < hsets.length) return(i);
	return(-1);
}

// --------------------------------------------------------------------------------
// DEVICE helper functions
// 		Function returns an index to the devices or scenes in the config array
// 		Use config instead of the lampi-devices shortcut!
// --------------------------------------------------------------------------------
function findDevice (room, uaddr) {
	var devs = config['devices'];
	logger("findDevice:: length: "+devs.length+", room: "+room+", uaddr: "+uaddr,2);
	var i;
	for (i=0; i < devs.length; i++) {
		if ((devs[i]['room'] == room ) && (devs[i]['uaddr'] == uaddr )) { break; }
	}
	if (i < devs.length) return(i);
	return(-1);
}

// Find index on room and id
function idDevice (room, id) {
	logger("idDevice:: length: "+config['devices'].length+", room: "+room+", id: "+id,2);
	var i;
	for (i=0; i < config['devices'].length; i++) {
		if ((config['devices'][i]['room'] == room ) && (config['devices'][i]['id'] == id )) { break; }
	}
	if (i < config['devices'].length) return(i);
	return(-1);
}

// select on gaddr + uaddr
function gaddrDevice (gaddr, uaddr) {
	logger("gaddrDevice:: length: "+config['devices'].length+", gaddr: "+gaddr+", uaddr: "+uaddr,2);
	var i;
	for (i=0; i < config['devices'].length; i++) {
		if ((config['devices'][i]['gaddr'] == gaddr ) && (config['devices'][i]['uaddr'] == uaddr )) {
			break;
		}
	}
	if (i < config['devices'].length) return(i);
	return(-1);
}

// --------------------------------------------------------------------------------
// SCENE helper functions
// --------------------------------------------------------------------------------
function findScene (name) {
	var i;
	for (i=0; i < config['scenes'].length; i++) {
		if (config['scenes'][i]['name'] == name ) {
			break;
		}
	}
	if (i < config['scenes'].length) return(i);
	return(-1);
}

// --------------------------------------------------------------------------------
// ROOM helper functions
// --------------------------------------------------------------------------------
function idRoom (id) {
	var i;
	for (i=0; i < config['rooms'].length; i++) {
		if (config['rooms'][i]['id'] == id ) {
			return(i);
		}
	}
	return(-1);
}
  
// --------------------------------------------------------------------------------
// SENSOR helper functions
// --------------------------------------------------------------------------------
function addrSensor (address, channel) {
	logger("addrSensor:: address: "+address+", channel: "+channel,2);
	if (config['sensors'] == undefined) return -1;
	var i;
	for (i=0; i < config['sensors'].length; i++) {
		if ((config['sensors'][i]['address'] == address ) && (config['sensors'][i]['channel'] == channel )) {
			break;
		}
	}
	if (i < config['sensors'].length) return(i);
	return(-1);
}

// --------------------------------------------------------------------------------
// Delete a value based on id !! from the (config) array
function delFromArray(arr, element) {
	var i;
	for (i=0; i<arr.length; i++) {
		if (arr[i]['id'] == element['id'] ) break;
	}
	arr.splice(i,1);
}

// --------------------------------------------------------------------------------
// Update a value in the (config) array based on id !! 
// 
function updInArray(arr, element) {
	var i;
	for (i=0; i<arr.length; i++) {
		if (arr[i]['id'] == element['id'] ) { arr[i] = element; break; }
	}
}

function iArray (arr, element) {
	var i;
	for (i=0; i<arr.length; i++) {
		if (arr[i]['id'] == element['id'] ) { return i; }
	}
	return -1;
}

// --------------------------------------------------------------------------------
// ALLOFF handling
//	Switch all devices in room 'room' off
//	Use async serial to assure synchronized execution of broadcasts with 2 sec interval
// NOTE we should only accept from OR send messages to trusted devices.
// --------------------------------------------------------------------------------
function allOff(room, socket) {
	var series =[];
	var str=[];
	for (var i=0; i<config['devices'].length; i++) {
		if ((config['devices'][i]['room'] == room) && (config['devices'][i]['type'] != "thermostat")) {
			var brandi = config['devices'][i]['brand'];
			var data = {
				tcnt: ""+tcnt++ ,
				type: "raw",
				action: "gui",								// actually the class of the action
				cmd: config['brands'][brandi]['fname'],
				gaddr: ""+config['devices'][i]['gaddr'],
				uaddr: ""+config['devices'][i]['uaddr'],
				val: "0",
				message: "!R"+room+"D"+config['devices'][i]['uaddr']+"F0"
			};
			str.push(JSON.stringify(data));					// The message array that must survive async operation
			series.push( function(callback) { 				// Push the function code for later use
				setTimeout( function(){ 
					var msg = str.shift();
					logger("allOff:: timeout str: "+msg); 
					socketHandler(msg, socket);				// Better than boradcast only. Handle the database update too
					callback(null, "yes"); 
				}, 2000); 
			});
			if (config['devices'][i]['gaddr'] == "868" ) deviceSet(i, "0");	// zwave only
		}
	}
	// Now call the execution
	async.series(series, function(err, results) {
		if (err) logger("allOFF:: ERROR: "+err,1);
		else logger("allOff:: OKE finished, results: "+results,2);
	});
	return;
}

// --------------------------------------------------------------------------------
// ALARM Handler
// --------------------------------------------------------------------------------
function alarmHandler(buf, socket) {
	logger("alarmHandler:: buf: "+buf,1);
}

// --------------------------------------------------------------------------------
// CONSOLE Handler
// --------------------------------------------------------------------------------
function consoleHandler(request, socket) {
	logger("consoleHandler:: request: "+request,1);
	var list="";					// Conrains response string with html newline <br> added
	switch (request) {
		case "logs":
			exec('tail -30 '+logDir+'/PI-node.log', function (error, stdout, stderr) {
				if (error === null) { list += stdout.split("\n").join("<br>") + "<br><br>" + stderr; }
				else  { list += "<br>  CONSOLE ERROR:   "+ error + "     <br>  " + stderr; }
				var response = {
					tcnt: ""+tcnt++,
					type: 'raw',
					action: 'console',
					request: request,
					message: list
				};
				var ret = socket.send(JSON.stringify(response));
			});
			return;
		break;
		case "zlogs":
			// TBD
		break;
		case "sunrisesunset":
			var times = SunCalc.getTimes(new Date(), 51.5, -0.1);
			var sunriseStr = times.sunrise.getHours() + ':' + ("00"+times.sunrise.getMinutes()).slice(-2);
			var sunsetStr = times.sunset.getHours() + ':' + ("00"+times.sunset.getMinutes()).slice(-2);
			list = "<br>Sunrise: "+sunriseStr+" Hrs<br>Sunset: "+sunsetStr+" Hrs<br>";
		break;
		case "clients":
			logger("Active socket Clients:: ",1);
			list = "<br>";
			clients.forEach(function (client) {
				list += client.name + " : " + client.type + "    <br>";
			});
		break;
		case "rebootdaemon":
			list="<br>Rebooting Node Daemon Now<br><br>this will take a minute<br>";
			setTimeout(function(){
				exec('nohup '+par.homeDir+'/scripts/PI-node -r &', function (error, stdout, stderr) {
				});
			}, 2000);
		break;
		case "printConfig":
			var list = printConfig();
		break;
		default:
			logger("consoleHandler:: Unknown request: "+request);
			list = "Unknown request<br>";
		break;
	}
	var response = {
		tcnt: ""+tcnt++,
		type: 'raw',
		action: 'console',
		request: request,
		message: list
	};
	var ret = socket.send(JSON.stringify(response));
}

// --------------------------------------------------------------------------------
// DBASE Handler
// --------------------------------------------------------------------------------
function dbaseHandler(cmd, args, socket) {
	logger("dbaseHandler:: cmd: "+cmd, 1);
	if(debug >= 2) {
		logger("dbaseHandler:: cmd: "+cmd+", args: ", 2);
		console.log(args);
	}
	switch (cmd) {
		case 'add_room':					//  add a new room
			insertDb("rooms", args, function(result) { logger("add_room finished OK "+result,1); });
			config['rooms'].push(args);
		break;
		case 'delete_room':
			deleteDb("rooms", args, function(result) { logger("delete_room finished OK "+result,1); });
			delFromArray(config['rooms'],args);
		break;
		case 'add_scene':
			insertDb("scenes", args, function(result) { logger("add_scene finished OK "+result,1); });
			config['scenes'].push(args);
		break;
		case 'delete_scene':
			deleteDb("scenes", args, function(result) { logger("delete_scenes finished OK "+result,1); });
			delFromArray(config['scenes'],args);
		break;
		case 'store_scene':					// Process updated scene
			updateDb("scenes", args, function(result) { logger("store_scenes finished OK "+result,1); });
			updInArray(config['scenes'],args);
		break;
		case 'add_timer':
			insertDb("timers", args, function(result) { logger("add_timer finished OK "+result,1); });
			config['timers'].push(args);
		break;
		case 'delete_timer':
			deleteDb("timers", args, function(result) { logger("delete_timers finished OK "+result,1); });
			delFromArray(config['timers'],args);
		break;
		case 'store_timer':
			updateDb("timers", args, function(result) { logger("store_timers finished OK "+result,1); });
			updInArray(config['timers'],args);
		break;
		case 'add_handset':
			insertDb("handsets", args, function(result) { logger("add_handset finished OK "+result,1); });
			config['handsets'].push(args);
		break;
		case 'delete_handset':
			deleteDb("handsets", args, function(result) { logger("delete_handsets finished OK "+result,1); });
			delFromArray(config['handsets'],args);
		break;
		case 'list_user':
			var response = {};
			if (socket.trusted >= 3) {
				var query = connection.query("Select * FROM users", function (err,rows,fields) {
					if(err){logger("list_user:: ERROR: "+err);} 
					else {
						response = {
							tcnt: tcnt++ ,
							type: "raw",
							action: "list_user",				// actually the class of the action	
							message: rows
						};
						logger("list_user returning: "+response);
						var ret = socket.send(JSON.stringify(response),function (error){
							if (error !== undefined) { 
								logger("list_user:: ERROR sending user data "+error,1);
								logger("list_user:: Socket: "+socket.name+", type: "+socket.type,1);
							}
						});	
					}
				});
			}
			else { 
				response = {
					tcnt: tcnt++ ,
					type: "raw",
					action: "login",				// actually the class of the action	
					message: "Please login with a user that has a higher trustlevel"
				};
				var ret = socket.send(JSON.stringify(response),function (error){
							if (error !== undefined) { 
								logger("list_user:: ERROR responding load database "+error,1);
								logger("list_user:: Socket: "+socket.name+", type: "+socket.type,1);
							}
				});	
				logger("list_user:: trust level socket "+socket.name+" insufficient: "+socket.trusted); 
			}
		break;
		case 'add_user':
			insertDb("users", args, function(result) { logger("add_user finished OK "+result,1); });
			config['users'].push(args);
		break;
		case 'delete_user':
			deleteDb("users", args, function(result) { logger("delete_user finished OK "+result,1); });
			delFromArray(config['users'],args);
		case 'store_user':
			updateDb("users", args, function(result) { logger("store_user finished OK "+result,1); });
			updInArray(config['users'],args);
		break;
		case 'add_sensor':
			insertDb("sensors", args, function(result) { logger("add_sensor finished OK "+result,1); });
			config['sensors'].push(args);
		break;
		case 'delete_sensor':
			deleteDb("sensors", args, function(result) { logger("delete_sensor finished OK "+result,1); });
			delFromArray(config['sensors'],args);
		break;
		case 'add_rule':
			config['rules'].push(args);
			var upd = { 
				name: args.name, 
				id:args.id, 
				type:"rule",
				descr: args.descr,
				jrule: JSON.stringify(args.jrule),
				brule: JSON.stringify(args.brule)
			};
			insertDb("rules", upd, function(result) { logger("add_rule finished OK "+result,1); });
		break;
		case 'store_rule':
			updInArray(config['rules'],args);
			var upd = { 
			name:  args.name, 
			type: "rule",
			id:    args.id,
			active:args.active,
			descr: args.descr,
			jrule: JSON.stringify(args.jrule),
			brule: JSON.stringify(args.brule)
			};
			updateDb("rules", upd, function(result) { logger("store_rule finished OK "+result,1); });
		break;
		case 'delete_rule':
			deleteDb("rules", args, function(result) { logger("delete_rule finished OK "+result,1); });
			delFromArray(config['rules'],args);
		break;
		case 'store_setting':
			// specific actions to take when settings change
			if (args['name'] == "debug") debug = Number(args['val']);
			if (args['name'] == "alarm") {
				if (socket.trusted >= 3)
					woonveilig.wvSet(args['val'], function(err,res){ logger("Alarm set to: "+res)},1);
				else {
					var response = { tcnt: tcnt++ , type: "raw", action: "login", 
						message: "Alarm can only be set with a user that has a higher trustlevel"
					};
					var ret = socket.send(JSON.stringify(response),function (error){
						if (error !== undefined) { 
							logger("store_setting:: ERROR sending login request "+error,1);
							logger("store_setting:: Socket: "+socket.name+", type: "+socket.type,1);
						}
					});	
					
					var i = iArray(config['settings'], args);
					args['val'] = config['settings'][i]['val'];		// reverse value to value in config
					logger("store_setting:: trust of "+socket.name+" too low: "+socket.trusted+"to change "+config['settings'][i]['name'],1);
					//break;										// No update
				}
			}//alarm
			// Generic: 
			updInArray(config['settings'],args);
			// Substitute complex object, make a physical copy first
			var upd = {
				descr: args.descr,
            	id: args.id,
            	val: args.val,
            	name: args.name,
				sett: JSON.stringify(args.sett)
			}
			// Update the database
			updateDb("settings", upd, function(result) { 
				logger("store_setting finished OK "+result,1); 
				var lroot = {};
				lroot.settings = config['settings'];
				var msg = { tcnt: tcnt++ , type: "json", action: "upd_config", message: lroot }; 
				var ret = socket.send(JSON.stringify(msg),function (error){
						if (error !== undefined) { 
							logger("store_setting:: ERROR sending settings "+error,1);
							logger("store_setting:: Socket: "+socket.name+", type: "+socket.type,1);
						}
				});
			});
		break;
		// Devices are special, they do not have one unique key, but need room + id to make unique
		case 'add_device':
			insertDb("devices", args, function(result) { logger("add_device finished OK",1); });
			config['devices'].push(args);
		break;
		case 'delete_device':
			delDevDb("devices", args, function(result) { logger("delete_device finished OK",1); });
			var i = idDevice(args.room, args.id);
			if (i != -1) config['devices'].splice(i,1);
			else logger("dbaseHandler:: delete_device failed for index: "+i+", room: "+args.room+", id: "+args.id);
		break;
		case 'store_device':
			updDevDb("devices", args, function(result) { logger("store_device finished OK",1); });
			var i = idDevice(args.room, args.id);
			if (i != -1) config['devices'][i] = args;
			else logger("dbaseHandler:: store_device failed for index: "+i);
		break;
		// Read the config structure (or database) and backup to file
		case 'backup_db':
			//backupDv(args.name);
		break;
		// Read from txt file
		case 'restore_db':
		break;
		
		default:
			logger("dbaseHandler:: Unknown command: "+cmd,1);
		break;
	}
}

// --------------------------------------------------------------------------------
// ENERGY Handler RRDTOOL based
// Buf is an object with a standard set of fields
// --------------------------------------------------------------------------------
function createEnergyDb (db, buf, socket) {
	var str=[];
	logger("createEnergyDb:: ",1);
	str += ((buf['kw_hi_use']  !== undefined) ? "DS:kw_hi_use:COUNTER:600:0:999999999 " : "");
	str += ((buf['kw_lo_use']  !== undefined) ? "DS:kw_lo_use:COUNTER:600:0:999999999 " : "");
	str += ((buf['kw_hi_ret']  !== undefined) ? "DS:kw_hi_ret:COUNTER:600:0:999999999 " : "");
	str += ((buf['kw_lo_ret']  !== undefined) ? "DS:kw_lo_ret:COUNTER:600:0:999999999 " : "");
	str += ((buf['gas_use']    !== undefined) ? "DS:gas_use:COUNTER:600:0:999999999 " : "");
	str += ((buf['kw_act_use'] !== undefined) ? "DS:kw_act_use:GAUGE:600:0:999999 " : "");
	str += ((buf['kw_act_ret'] !== undefined) ? "DS:kw_act_ret:GAUGE:600:0:999999 " : "");
	str += ((buf['kw_ph1_use'] !== undefined) ? "DS:kw_ph1_use:GAUGE:600:0:999999 " : "");
	str += ((buf['kw_ph2_use'] !== undefined) ? "DS:kw_ph2_use:GAUGE:600:0:999999 " : "");
	str += ((buf['kw_ph3_use'] !== undefined) ? "DS:kw_ph3_use:GAUGE:600:0:999999 " : "");
	
	str += "RRA:AVERAGE:0.5:1:360 ";		// Hour: every 10 secs sample, consolidate 1 -> 360 per hour
	str += "RRA:AVERAGE:0.5:30:288 ";		// Day: every 10 secs sample, consolidate 30 (5min) -> 12 per hour, 12*24= 288 a day
	str += "RRA:AVERAGE:0.5:90:672 ";		// Week: 10 sec sample, consolidate 90 (= 15 min);  4 * 24 hrs * 7 day
	str += "RRA:AVERAGE:0.5:360:744 ";		// Month: 10 sec sample consolidate 360 samples (1 hr) -> 24 pday * 31 a month
	str += "RRA:AVERAGE:0.5:216:1460 ";		// Year: 10 sec sample * 360 (=hour) * 24 = consolidate 4 per day. 365 days a year
	// Week low and high values (hourly sample)
	str += "RRA:MIN:0.5:90:672 ";			// MIN: 10 sec sample, consolidate 90 (= 15 min);  4 * 24 hrs * 7 day
	str += "RRA:MAX:0.5:90:672 ";			// MAX
	// str += "RRA:AVERAGE:0.5:360:720 ";	// AVG
	
	var execStr = "rrdtool create "+db+" --step 20 "+str;
	logger("createEnergyDb:: execStr: "+execStr,1);
	exec(execStr, function (error, stdout, stderr) {
		if (error === null) { 
			logger("createEnergyDb:: ok, stdout: "+ stdout + "; stderr: " + stderr , 2); 
			energyHandler(buf, socket);				// sort of callback mechanism. But only 1 time
		}
		else  { logger("createEnergyDb:: ERROR: "+ error  + "; stderr: " + stderr ); 
		}
	});		
}

// --------------------------------------------------------------------------------
// ENERGY HANDLER
function energyHandler(buf, socket) {
	var db = rrdDir + "/db/" +"e350.rrd";
	
	var str=[];
	
	var index = addrSensor(buf.address,buf.channel);
	if (index <0) { 
		logger("energyHandler:: ERROR index for energy: "+buf.address+":"+buf.channel,1);
		return;
	} else {
		logger("energyHandler index: "+index+" name: "+config['sensors'][index]['name'],2);
	}
	var name = config['sensors'][index]['name'];
	// for all sensors defined in database, keep value and last time (eg Gas, Electricity
	Object.keys(config['sensors'][index]['sensor']).forEach(function(sensor) {								  
		if ( buf.hasOwnProperty(sensor)) {
			logger("sensorHandler:: found: "+sensor+" in config",2);
			config['sensors'][index]['sensor'][sensor]['val'] = buf[sensor];
			config['sensors'][index]['sensor'][sensor]['lastUpdate'] = getTicks();
		}
		else {
			// skip tcnt and other message details, only look for existing sensor keywords
			logger("energyHandler:: ERROR: "+sensor+" not found in config",1);
		}
	});
	
	logger("energyHandler:: action: "+ buf.action+", brand: "+buf.brand+", name: "+name,1);
	
	// One time creation action
	if (!fs.existsSync(db)) {
		logger("energyHandler:: rrdtool db "+db+" does not exist ... creating",1);
		createEnergyDb(db,buf);
	}
	str += ":" + Math.floor(Number(buf['kw_hi_use'])*1000);
	str += ":" + Math.floor(Number(buf['kw_lo_use'])*1000);
	str += ":" + Math.floor(Number(buf['kw_hi_ret'])*1000);
	str += ":" + Math.floor(Number(buf['kw_lo_ret'])*1000);
	str += ":" + Math.floor(Number(buf['gas_use'])*1000);
	str += ":" + Math.floor(Number(buf['kw_act_use'])*1000);
	str += ":" + Math.floor(Number(buf['kw_act_ret'])*1000);
	str += ":" + Math.floor(Number(buf['kw_ph1_use'])*1000);
	str += ":" + Math.floor(Number(buf['kw_ph2_use'])*1000);
	str += ":" + Math.floor(Number(buf['kw_ph3_use'])*1000);
		
	var execStr = "rrdtool update "+db+" N" +str;
	logger("energyHandler:: execStr: "+execStr,2)
	exec(execStr, function (error, stdout, stderr) {
		if (error === null) { 
			logger("energyHandler:: stdout: "+ stdout + "; stderr: " + stderr, 2 ); 
		}
		else  { logger("energyHandler:: ERROR: "+ error  + "; stderr: " + stderr ); 
		}
	});
	broadcast(JSON.stringify(buf), socket, "raw");			// Mask the raw clients, these are receivers themselves
}

// --------------------------------------------------------------------------------
// GRAPH HANDLER
// --------------------------------------------------------------------------------
function graphHandler(buf,socket) {
	var gcmd = buf.gcmd;
	var gtype = buf.gtype;
	var gperiod = buf.gperiod;
	var gsensors = buf.gsensors;
	var pstep, eol;
	var valStack="";
	var width = '750'; var height='500';		// Image is 3 by 2, and should be resizable at the client side
	var graphName, valUnit;
	var rrd_dir=par.homeDir+'/rrd/db/';				// Database directory
	var output=par.homeDir+'/www/graphs/';
	var rrd_db='e350.rrd';						// Database filename
	var graphColor = ["ff0000","111111","00ff00","0000ff","ff00ff","666666","00ffff","ff3399","ffff00"];
	
	logger("graphHandler:: Starting for "+gcmd+":"+gtype+":"+gperiod+":"+gsensors);
	if (gsensors == undefined) { 
		logger("graphHandler:: No sensors defined",1);
		gsensors = [];
		//return;
	}
	switch(gcmd) {
		// Energy specific rrd stuff
	  case 'energy':
	  	switch(gtype) {
		case 'E_GAS': sensorType="gas_use"; graphName="gas_use"; valUnit="M3"; 		break;
		case 'E_ACT': sensorType="pwr act"; graphName="pwr_act"; valUnit="kWhr"; break;
		case 'E_USE': sensorType="pwr use"; graphName="pwr_use"; valUnit="kWhr"; break;
		case 'E_PHA': sensorType="phase use"; graphName="pwr_pha"; valUnit="kWhr";
		break;
		}

	  break;
	  // For sensors make some mods as well
	  case 'weather':
	  case 'sensors':
		switch (gtype) {
		case 'T': sensorType='temperature'; graphName='all_temp'; valUnit="C"; break;
		case 'H': sensorType="humidity"; graphName="all_humi"; valUnit=" %%"; break;
		case 'P': sensorType="airpressure"; graphName="all_press"; valUnit="hPa"; break;
		}
	  break;
	}
	switch(gperiod) {
		case '1h': pstep=""; break;
		case '1d': pstep=""; break;
		case '1w': pstep=":step=3600"; break;		// One hour
		case '1m': pstep=":step=8640"; break;		// 3 hours
		case '1y': pstep=":step=21300"; break;
		default: logger("graphHandler:: ERROR unknown period: "+gperiod,1);
	}
	var DEFpart = ""; var LINEpart= ""; var GPRINTpart="";
	for (var i=0; i<gsensors.length; i++) {
		if ((i+1) == gsensors.length) {				// last one, no newline
			eol = '\\n';
		}
		else { eol=""; }
		if (gcmd == "energy") {
			rrd_db = "e350.rrd";
			DEFpart+= 'DEF:t'+(i+1)+'='+rrd_dir+rrd_db+':'+gsensors[i]+':AVERAGE'+pstep+' ';
		} else {
			rrd_db = gsensors[i]+'.rrd';
			DEFpart += 'DEF:t'+(i+1)+'='+rrd_dir+rrd_db+":"+sensorType+':AVERAGE ';
		}
		LINEpart+= 'LINE2:t'+(i+1)+'#'+graphColor[i % graphColor.length]+':"'+gsensors[i]+eol+valStack+'" ';
		GPRINTpart+= 'GPRINT:t'+(i+1)+':LAST:"'+gsensors[i]+' %3.0lf '+valUnit+eol+'" ';
	}
	var execStr = '/usr/bin/rrdtool graph '+output+graphName+'_'+gperiod+'.png' ;
	execStr += ' -s N-'+gperiod+' -a PNG -E --title="'+sensorType+' readings" ';
	execStr += '--vertical-label "'+sensorType+'" --width '+width+' --height '+height+' ';
	execStr += DEFpart ;
	execStr += LINEpart ;
	execStr += GPRINTpart ;
	logger("graphHandler:: \n"+execStr,2);
	exec(execStr, function (error, stdout, stderr) {
		if (error === null) { 
			logger("graphHandler:: ok, stdout: "+ stdout + "; stderr: " + stderr , 2); 
			broadcast(JSON.stringify(buf), socket, "raw");
		}
		else  { logger("graphHandler:: ERROR: "+ error  + "; stderr: " + stderr ); 
		}
	});		
}


// --------------------------------------------------------------------------------
// GUI Handler
// Same as icsHandler but then for type=='json'
// --------------------------------------------------------------------------------
function guiHandler(buf, socket) {
	logger("guiHandler:: buf: "+buf,1);
	var index = gaddrDevice(buf.gaddr, uaddr);		// which gaddr matches the received gaddr in config['devices'] array
	if (config['devices'][index]['gaddr'] == "868" ) deviceSet(index, buf.val);	// zwave only 
	// Have to make a good data.ics value (cannot assume that a json message has a good ics)
	var ics = "!R"+config['devices'][index]['room']+"D"+config['devices'][index]['uaddr']+"F";
	if (buf.val == 0) ics = ics+"0";
	else ics = ics + "dP" + buf.val;
	var data = {
		tcnt: ""+tcnt++ ,
		type: "json",
		action: "gui",				// actually the class of the action
		cmd: buf.cmd,
		gaddr: ""+buf.gaddr,
		uaddr: ""+buf.uaddr,
		val: ""+buf.val,
		message: buf.ics	
	};
	logger("guiHandler:: to broadcast: "+JSON.stringify(data),2);
	var ret = broadcast(JSON.stringify(data), socket);	// XX works for websocket that is initiating the GUI request
}

// --------------------------------------------------------------------------------
// ICS Handles incoming messages on a socket, relevant data is in ICS coded string
// Could be devices and sensors LamPI gui commands
// --------------------------------------------------------------------------------
// Fields received from the LamPI GUI buf
// 'tcnt'    :	<Transaction Count>
// 'type'    : 'raw'
// 'cmd'     : 'kaku', 'livolo', 'zwave'
// 'action'  : 'gui'
// 'message' : '<ICS 1000 message format>' -> F0 translated to off at device, F1 to on. FdP10 to value 10
function icsHandler(buf, socket) {
	//logger("icsHandler:: receiving message: "+buf.message,2);
	var ics =    buf.message;
	var type =   buf.type;
	var action = buf.action;
	var ldev = config['devices'];
	//if (buf.message == undefined) logger("icsHandler ERROR:: receiver message ics",1);
	var r = /\d+/;
	///\d+\.?\d*/g
	switch (ics.substr(0,2)) {
		case '!R':	// Room commands !RxxDyyFz !RxxDyyFdPzz
			// value and val are mostly the same. Only as the JSON message does not see difference
			// between switches and dimmers (yet), we send "on" and "off" for switches in val.
			var val = "";									// The return value in Json for device
			var room = ics.match(r);
			if (ics.indexOf('Fa') != -1) {					// All Off !RxFa received
				allOff(room, socket);
				break;
			}
			var s = ics.indexOf('D');
			var uaddr = ics.substr(s+1,2).match(r);
			logger("icsHandler:: uaddr: "+uaddr,2);
			s = ics.indexOf('FdP');
			var value;
			if (s != -1) {									// Dimmer
				value = Number(ics.substr(s+3,2).match(r));
				val = value;
				logger("icsHandler:: Found dimmer value: "+value ,2);
			}
			else {											// This is a switch
				s = ics.indexOf('F');
				value = ics.substr(s+1,2).match(r);
				if (value == 0) val = "off";
				if (value == 1) val = "on";
				logger("icsHandler:: Found switch value: "+value ,2);
			}
			var index = findDevice(room,uaddr);
			if ((index <0) || (index> config['devices'].length)) {
				logger("icsHandler:: ERROR for index: "+index+", #devices: "+config['devices'].length+" room: "+room+", uaddr: "+uaddr+", ics: "+ics,1);
				return;
			}
			var gaddr = config['devices'][index]['gaddr'];	// which gaddr is ok (send to 433 or 868 device handler)
			var brand = config['brands'][ config['devices'][index]['brand'] ]['fname']; 
			var data = {
				tcnt: ""+tcnt++,
				type: "raw",
				action: "gui",								// actually the class of the action
				cmd: brand,									// Contains the brandname for the device!!
				gaddr: ""+gaddr,
				uaddr: ""+uaddr,
				val: ""+val,								// Val is for sending to device: 0-32, on and off
				message: ics	
			};
			config['devices'][index]['val']=value;			// Set the value in the config object
			config['devices'][index]['lastUpdate']=getTicks();
			logger("icsHandler:: Room: "+room+", Dev: "+uaddr+", Val: "+value,0);
			if (gaddr == "868" ) deviceSet(index, value);	// zwave only
			updDevDb("devices", config['devices'][index], function(result) { 	// Mysql
				logger("icsHandler:: updDevDb ics "+ics+" finished OK",1); });	// only for PI-node restart	
			logger("icsHandler:: to broadcast: "+JSON.stringify(data),2);
			// Send to the LamPI-receiver and connected sockets GUI's and Sensors
			var ret = broadcast(JSON.stringify(data), socket);
		break
		case '!F': // Scene commands
			// !FcP"scene name" ; Stop a scene
			// !FqP"scene name" ; Start a scene
			logger("icsHandler:: !F Scene handler",1);
			queue.qinsert({ticks: getTicks(), scene: "gui", seq: "!R1D1FdP10,00:00:01"});
		break
		case '!T': // Timer command, deal with time, sunrise, sunset
			// Find correct syntax for Timer messages
			logger("icsHandler:: Timer command");
			queue.qinsert({ticks: getTicks(), scene: "gui", seq: "!R1D1F0"});
		break
		case '!A':
			var addr = ics.match(r);
			var s = ics.indexOf('D');
			var unit = ics.substr(s+1,2).match(r);
			
			var s = ics.indexOf('F');
			var val = ics.substr(s+1,2).match(r);
			logger("icsHandler:: Handset addr: "+addr+",unit: "+unit+", val: "+val+", sender: "+socket.name,0);
			var i = findHandset(addr, unit, val);
			if (i>=0) {
				var h = config['handsets'][i];
				switch (h.type ) {
					case "handset":
					case "scene":
						var scene = {
							id: null, val: 0, name: null,
							type: 'scene',
							seq: h.scene
						}
						queueScene(scene);
					break;
					default:
						logger("icsHandler:: handset type not recognized: "+h.type,1);
					break;
				}
			}
			else { logger("icsHandler:: Handset "+addr+" not found",1);	}
		break
		case '!Q':
			logger("icsHandler:: All Off Q command",1);
		break
		default:
			logger("icsHandler:: Unknown command ics code: <"+ics+">" , 1);	
		break
	}
}

// --------------------------------------------------------------------------------
// LOGIN Handler
// --------------------------------------------------------------------------------
function loginHandler(buf, socket) {
	// Lookup the user password combination in the database, and if found
	// update the trusted parameter for this connection with the database value
	// Not the most trusted solution, but OK for non commercial home use.
	var login = buf.login.toLowerCase();
	var passw = buf.password;
	logger("loginHandler:: login: "+login,1);
	var query = connection.query('SELECT * FROM users WHERE login=?', [ login ], function(err, rows, fields) {
		if (!err) {
			if (debug >= 1) { console.log('loginHandler:: returns: \n', rows); }
			if (rows.length == 0) { 							// No password match
				logger("loginHandler:: ERROR not results for user "+buf.login,1); 
				buf.action="login";
				if (init==0) socketHandler(JSON.stringify(buf), socket);
			}
			else if (rows.length > 1) { 						// Should be impossible, more than 1 match
				logger("loginHandler:: ERROR returning "+rows.length+" values",1); 
			}
			else if (rows[0]['passw'] == buf.password) {		// Passwords match
				logger("loginHandler:: checked user name: "+rows[0]['name'],1);
				// If the existing trustlevel == 0, we have an "outside line" with initial login request
				// Therefore we still need to send the database
				if (socket.trusted == 0) {
					var dbs = { tcnt: tcnt++, type: "json", action: "load_database", cmd: "", response: config };
					var ret = socket.send(JSON.stringify(dbs),function (error){
						if (error !== undefined) { 
							logger("loginHandler:: ERROR responding load database "+error,1);
							logger("loginHandler:: Socket: "+socket.name+", type: "+socket.type,1);
						}
					});
				}
				else {
					// User did have lower trust level before, give confirmation
					var msg = { tcnt:buf.tcnt, type:'raw', action:'alert', 
						message:'Login Success<br>Depending on your trustlevel services will be enabled' };
					socket.send(JSON.stringify(msg), socket);
				}
				socket.trusted = rows[0]['class'];
			}
			else {
				logger("loginHandler:: ERROR wrong password ",1); 
				buf.action="login";
				buf.message="Wrong Password"
				socket.send(JSON.stringify(buf));	// Only for websockets!!
			}
		}
		else {
			console.log('queryDbase:: err: '+err+', query: <'+query.sql+">");
		}
  	});
}// loginHandler

// --------------------------------------------------------------------------------
// New function to handle incoming sensor data with teh new sensor structure
// sensor message: {"tcnt":"INT","action":"sensor","brand": "x","type":"json","address":"y","channel":"z","temperature":"" }
//
function sensorHandler(buf, socket) {
	var index = addrSensor(buf.address,buf.channel);
	if (index <0) { 
		logger("sensorHandler:: ERROR unknown index for sensor: "+buf.address+":"+buf.channel,1);
		return;
	} else {
		logger("sensorHandler index: "+index+" name: "+config['sensors'][index]['name'], 2);
	}
	var name = config['sensors'][index]['name'];
	
	// Save all values coming in the config array and update lastUpdated
	// We can also forEach in [ 'temperature', 'humidity' ] etc
	// which is less univesal but faster...
	//Object.keys(buf).forEach(function(sensor) {
	//if ( config['sensors'][index]['sensor'].hasOwnProperty(sensor)) {
		
	Object.keys(config['sensors'][index]['sensor']).forEach(function(sensor) {								  
		if ( buf.hasOwnProperty(sensor) ) {
			logger("sensorHandler:: found: "+sensor+" in config",2);
			config['sensors'][index]['sensor'][sensor]['val'] = buf[sensor];
			config['sensors'][index]['sensor'][sensor]['lastUpdate'] = getTicks();
		}
		else {
			// skip tcnt and other message details, only look for existing sensor keywords
			logger("sensorHandler:: ERROR: "+sensor+" not found in config",1);
		}
	});
	
	// XXX Other and new sensors come here!
	var db = rrdDir + "/db/"+name+".rrd";
	var str=[]; var sname;
	if ((socket !== undefined) && (socket !== null)) sname = socket.name; else sname = "datagram";
	
	logger("sensorHandler:: index: "+index+", from: "+sname+", name: "+ name+", addr: "+buf.address+", chan: "+buf.channel+", temp: "+buf.temperature,0);
	
	if (!fs.existsSync(db)) {
		logger("sensorHandler:: rrdtool db "+db+" does not exist ... creating",1);
		createSensorDb(db,buf, socket);	
	}
 
	// If a key does not exits, use empty value and print NO colon
	str += ((buf['temperature'] !== undefined)	? ":"+Number(buf['temperature']) : "");
	str += ((buf['humidity'] !== undefined)		? ":"+Number(buf['humidity']) : "");
	str += ((buf['airpressure'] !== undefined)	? ":"+Number(buf['airpressure']) : "");
	str += ((buf['altitude'] !== undefined)		? ":"+Number(buf['altitude']) : "");
	str += ((buf['windspeed'] !== undefined)	? ":"+Number(buf['windspeed']) : "");
	str += ((buf['winddirection'] !== undefined) ? ":"+Number(buf['winddirection']) : "");
	str += ((buf['rainfall'] !== undefined)		? ":"+Number(buf['rainfall']) : "");
	str += ((buf['luminescense'] !== undefined)	? ":"+Number(buf['luminescense']) : "");
	var execStr = "rrdtool update "+db+" N"+str;
	logger("sensorHandler:: execStr: "+execStr,2);
	exec(execStr, function (error, stdout, stderr) {
		if (error === null) {
			logger("sensorHandler:: stdout: "+ stdout + "; stderr: " + stderr , 2); 
		}
		else  { 
			logger("sensorHandler:: ERROR: for rrd str: "+str+"\n Rrd Error: "+ error  + "; stderr: " + stderr ,0);
			console.log("sensorHandler:: string: ",buf);
		}
	});
	broadcast(JSON.stringify(buf) ,socket, "raw");			// Send only to websockets, mask all raw sockets
}// sensorHandler

// --------------------------------------------------------------------------------
// SENSOR Handlers with RRDTOOL
// The db parameter contains full file name, based on name!!! of the sensor!
// So you can shuffle a sensor in location as long as the name stays the same
// --------------------------------------------------------------------------------
function createSensorDb(db,buf,socket) {
	var str=[];
	logger("createSensorDb:: ",1);
	str += ((buf['temperature'] !== undefined) ? "DS:temperature:GAUGE:600:-20:95 " : "");
	str += ((buf['humidity'] !== undefined) ? "DS:humidity:GAUGE:600:0:100 " : "");
	str += ((buf['airpressure'] !== undefined) ? "DS:airpressure:GAUGE:600:900:1100 " : "");
	str += ((buf['altitude'] !== undefined) ? "DS:altitude:GAUGE:600:-100:1200 " : "");
	str += ((buf['windspeed'] !== undefined) ? "DS:windspeed:GAUGE:600:0:200 " : "");
	str += ((buf['winddirection'] !== undefined) ? "DS:winddirection:GAUGE:600:0:359 " : "");
	str += ((buf['rainfall'] !== undefined) ? "DS:rainfall:GAUGE:600:0:25 " : "");
	str += ((buf['luminescense'] !== undefined) ? "DS:luminescense:GAUGE:600:0:400 " : "");
	
	str += "RRA:AVERAGE:0.5:1:480 ";		// Day: every 3 min sample counts, 20 per hour, 20*24=480 a day
	str += "RRA:AVERAGE:0.5:5:672 ";		// Week: 3 min sample, consolidate 5 (=15 min); thus 4 per hour * 24 hrs * 7 day
	str += "RRA:AVERAGE:0.5:20:744 ";		// Month: Every 3 minutes -> 20 samples per hour, * 24 hrs * 31 days
	str += "RRA:AVERAGE:0.5:480:365 ";		// Year: 3 min sample * 20 (=hour) * 24 = consolidate per day. Do 365 days a year
	str += "RRA:MIN:0.5:20:720 ";		
	str += "RRA:MAX:0.5:20:720 ";				
	str += "RRA:AVERAGE:0.5:20:720 ";	
	
	var execStr = "rrdtool create "+db+" --step 180 "+str;	// Steps of 180 secs is 3 minutes
	logger("createSensorDb:: execStr: "+execStr,1);
	exec(execStr, function (error, stdout, stderr) {
		if (error === null) { 
			logger("createSensorDb:: ok, stdout: "+ stdout + "; stderr: " + stderr , 2); 
			sensorHandler(buf, socket);		// sort of callback mechanism. But only 1 time
		}
		else { logger("createSensorDb:: ERROR: "+ error  + "; stderr: " + stderr ); 
		}
	});		
}

// -------------------------------------------------------------------------------
// SCENE HANDLER
// XXX Needs more work
// -------------------------------------------------------------------------------
function sceneHandler(buf, socket) {
	switch (buf.cmd) {
		case 'run_scene':
			var scene = buf.message;
			logger("sceneHandler:: run scene selected, scene: "+scene.name,0);
			// MGW
			queueScene(scene);
		break;
		case 'cancel_scene':
			logger("sceneHandler:: cancel scene selected",1);
		break;
		default:
			logger("sceneHandler:: Command not recognized, "+buf.cmd,1);
	}
}// sceneHandler


// -------------------------------------------------------------------------------
// SETTING HANDLER
// XXX Needs more work
// -------------------------------------------------------------------------------
function settingHandler(buf, socket) {
	switch (buf.cmd) {
		case 'store_config':
			logger("settingHandler:: store_config database name selected: "+buf.name,1);
			writeConfig(buf.message);
		break;
		case 'load_config':
			logger("settingHandler:: load_config database name selected: "+buf.name,1);
			config = readConfig();
		break;
		case 'list_config':
			// Read the config directory.
			var list = listConfigDir();
			var response = {};
			logger("settingHandler:: list_config database name selected", 1);
			response = { tcnt: tcnt++, type: "raw", action: "list_config", cmd: "", list: list };
			logger("socketHandler:: Sending "+response.action+" message to socket: "+ socket.name);

			var ret = socket.send(JSON.stringify(response),function (error){
				if (error !== undefined) { 
					logger("settingHandler:: ERROR responding list config: "+error,1);
					logger("settingHandler:: Socket: "+socket.name+", type: "+socket.type,1);
				}
			});
		break;
	}
}// settingHandler

// -------------------------------------------------------------------------------
// SOCKET HANDLER: Handle incoming messages over the socket
// 	This is a generic fuction to read messages from socket. The separate gui/sensor specific
//	functions are found above.
// The data variable is a json string.
// -------------------------------------------------------------------------------
//
function socketHandler(data,socket) {
	var str = data+"";						// String termination is required for search() and probably JSON too
	//console.log("dat: "+str);
	var s = str.search(/\}{/);				// With raw sockets 2 concatenated messages may arrive (or half a message)
	if (s != -1) {										// Split data and call recursively
		var str1 = str.substr(0,s+1);
		var str2 = str.substr(s+1);
		logger("socketHandler:: string 1: "+str1,2);
		logger("socketHandler:: string 2: "+str2,2);
		socketHandler(str1,socket);
		socketHandler(str2,socket);			// Should there be another combined message this will handle it.
		return;
	};
	logger("socketHandler:: Starting with data: "+data,2);
	try {
		var buf = JSON.parse(str);
	} catch(e){
		logger("socketHandler:: JSON parse error: "+e,1);
		return;
	}
	if (socket == undefined) {				// UDP message most likely, or queueHandler
		logger("socketHandler socket undefined. action: "+buf.action,2);
		if (debug >= 2) console.log("data: ",str);
		socket = null;
	}
	logger("Handler:: Action: "+buf.action,2);
	switch (buf.action) {
		case 'alarm':
			logger("socketHandler:: alarm received",1);
			// Do something :-)
		break;
		case 'console':		// request can be: "logs", "zlogs", "sunrisesunset", "clients", "rebootdaemon"
			consoleHandler(buf.request, socket);
		break;
		case 'dbase':							// cmd can be: delete_device, etc etc
			dbaseHandler(buf.cmd, buf.message, socket);
		break;
		case 'energy':							// cmd can be: energy
			energyHandler(buf, socket);			// Do something: such as store in RRD etc
		break;
		case 'graph':
			graphHandler(buf,socket);
		break;
		case 'gui':			//
			if (buf.type == "raw")  icsHandler(buf, socket);			// ics type messages
			if (buf.type == "json") guiHandler(buf, socket);			// JSON style message (better, but not common)
		break;
		case 'handset':
			if (buf.type == "raw")  icsHandler(buf, socket);			// This should work for handsets too!
			if (buf.type == "json") guiHandler(buf, socket);			// XXX Not tested yet
		break;
		case 'login':
			logger("socketHandler:: login message received");
			loginHandler(buf, socket);
		break;
		case 'load_database':					// A gui requests to read the database
			logger("socketHandler:: load_database received",1);
			// If the socket is new and not trusted, ask user to authorize
			var response = {};
			if (socket.trusted == 0) {
				logger("socketHandler:: Socket is not trusted: "+ socket.name,1);
				response = { tcnt: tcnt++ , type: "raw", action: "login", message: "Please login first" };
			}
			else {
				logger("socketHandler:: Socket is trusted: "+ socket.name,1);
				response = { tcnt: tcnt++, type: "raw", action: "load_database", cmd: "", response: config };
			}
			logger("socketHandler:: Sending "+response.action+" message to socket: "+socket.name)
 	
			var ret = socket.send(JSON.stringify(response),function (error){
				if (error !== undefined) { 
					logger("socketHandler:: ERROR responding load database "+error,1);
					logger("socketHandler:: Socket: "+socket.name+", type: "+socket.type,1);
				}
			});	
		break;
		case 'ping':							// Respond to ping with ack to requestor only => healthcount++
		case 'PING':
			// Send back to sender
			logger("socketHandler:: ping received",2);
			var response = {
				tcnt: tcnt++,
				action: "ack",
				type: "raw",
				message: "OK"
			};
			if (socket.type == "ws") { var ret = socket.send(JSON.stringify(response)); }
		break;
		case 'scene':
			logger("socketHandler:: scene command received",2);
			sceneHandler(buf, socket);
		break;
		case 'setting':										// Several settings from gui
			logger("socketHandler:: setting received: "+buf.cmd,2);
			settingHandler(buf, socket);
		break;
		case 'user':
			logger("socketHandler:: user command received",1);
		break;
		case 'weather':
			logger("socketHandler:: WARNING weather received, type: "+buf.type+", addr:chan: "+buf.address+":"+buf.channel,0);
			buf.action = 'sensor';
		case 'sensor':
			sensorHandler(buf, socket);
		break;
		default:
			logger("SocketHandler:: action not recognized: "+buf.action,1);
		break;
	}
}

// --------------------------------------------------------------------------------
// Queue a scene string.
// put the command of the scene in the run queue, in parts based on the individual device commands
// XXX At the moment only ICS commands are queued -> must change
// parameter scene is a scene object
// --------------------------------------------------------------------------------
function queueScene(scene) {
	// This means that ics strings have a time component in the scene array. Make sure
	// every timer is copied on the queue as well
	var cmds = scene.seq;
	var splits = cmds.split(",");
	for (var k=0; k< splits.length; k+=2) {
		var tmp = splits[k+1].split(":");
		var sticks = +(tmp[0]*3600)+(tmp[1]*60)+tmp[2];
		logger("queueScene item: "+(k/2)+", sticks: "+sticks+", scene: "+splits[k]+", time: "+splits[k+1],1);
		// Use gui as name as we have a gui ICS seq here. 
		// The queue can handle scene names as well but then leave the seq field empty
		queue.qinsert({ ticks: Number(sticks) + getTicks(), name: "gui", seq: splits[k] });
	}//for k
}

// --------------------------------------------------------------------------------
// Function to put a device setting in the queue.
// dev is a device index, val is new value, start is "hh:mm:ss" time
// XXX function for times still to be implemented
// --------------------------------------------------------------------------------
function queueDevice(dev, val, start, freq, times) {
	var tmp = start.split(":");
	var sticks = +(tmp[0]*3600)+(tmp[1]*60)+tmp[2];
	var dimmer= config['devices'][dev]['type']=="dimmer"?"FdP":"F";
	var theItem = "!R"+config['devices'][dev]['room']+config['devices'][dev]['id']+dimmer+val;
	logger("queueDevice:: item: "+theItem+", dev: "+config['devices'][dev].name+", val: "+val+", time: "+start,1);
	queue.qinsert({ ticks: Number(sticks) + getTicks(), name: "gui", seq: theItem });
}

// --------------------------------------------------------------------------------
// QUEUE Object definitions (singleton stye as a function)
// The queue contains a list of actions that are outstanding
// --------------------------------------------------------------------------------
var queue = new function() {
	this.qlist= [];
	// Need to use the splice function here
	this.qpush= function (sc) {
		var item = {
			ticks: getTicks(),
			name: sc.name,
			seq: sc.seq
		}
		this.qlist.push(item)
	};
	this.qinsert= function(item) {
		var i;
		for (i=0; i< this.qlist.length; i++) {
			if (this.qlist[i].ticks > item.ticks) break;
		}
		this.qlist.splice(i,0,item);
	}
	this.qpop= function () {
		var i;
		var tim = getTicks();
		for (i=0; i< this.qlist.length; i++) {
			if (this.qlist[i].ticks > tim) break;
		}
		return(this.qlist.splice(0,i) );
	};
	this.qprint= function () {
		var ticks = getTicks();
		var tim = queue.qtim();
		if (tim == null) return;				// No itms
		logger("print queue for ticks: "+ticks+", next runnable: "+tim+" secs",1);
		for (var i=0; i<this.qlist.length; i++) {
			console.log("\t\t",this.qlist[i]);
		}
	};
	this.qtim= function() {
		if (this.qlist.length == 0) return (null);
		var tim = getTicks();
		return (this.qlist[0].ticks - tim);
	}
}

// --------------------------------------------------------------------------------
// QUEUE Loop with interval
//
// As from that moment on the config['devices'] will be in memory and always available
// XXX At the moment, for gui only ICS raw coded commands are stored in Queue
// XXX Todo: We can put whatever task we want in the queue, including thermostat, emails etc etc.
// task = { name: STRING, seq: STRING } 
//
function queueHandler() {
	var task = queue.qpop();		
	while ((task != null) && (task.length > 0)) {				// Might be more than one task runnable
		if (debug>=2) console.log("queueHandler:: pop task: ",task);
		for (var i=0; i< task.length; i++) {					// For every scene runnable after pop(), could be 0 or N
			var cmds;
			logger("queueHandler:: processing task: ",task[i].name,1);
			switch (task[i].name) {
				case "gui":										// We use this fake name for separate ICS commands
					cmds = task[i].seq.split(",");				// Get all ICS commands in the scene, could be allOff
					// For each cmd in the seq separately call the handler
					for (var j = 0; j<cmds.length; j=j+2) {
						var data = {
							tcnt: ""+tcnt++ ,
							type: "raw",
							action: "gui",						// actually the class of the action
							cmd:   "",							// Optional ics messages, otherwise kaku, zwave, livolo etc.
							gaddr: "",							// Optional
							uaddr: "",							// Optional
							val:   "",							// Optional
							message: cmds[j]
						};
					};	
					socketHandler(JSON.stringify(data)); 		// generic handle function
				break;
				case "scene":									// If this is a scene, split all separate cmds and execute
					// cmds = task[i].seq.split(",");
					logger("queueHandler:: scene found",1);	
				case "rule":
					// seq contains the info we are looking for (I guess). 
					// Not the rules itself is put on the queue, but its activation is.
					logger("queueHandler:: Executing rule: "+task[i].seq.id+", "+task[i].seq.cmd,2);
					switch ( task[i].seq.cmd ) {	
						case "active":
							config['rules'][task[i].seq.id].active = task[i].seq.val ;
						break;
						default:
							logger("queueHandler:: rule command unrecognized: "+task[i].seq.cmd,1);
					}
				break;
				default: // name of a scene, not a fixed name
					// Lookup scene or task and Send to connected sockets
					logger("queueHandler:: executing: "+task[i].name,1);
					var index = findScene(task[i].name);
					cmds = config['scenes'][index].seq.split(",") ;
					// For each cmd in the seq separately call the handler
					for (var j = 0; j<cmds.length; j=j+2) {
						var data = {
							tcnt: ""+tcnt++ ,
							type: "raw",
							action: "gui",						// actually the class of the action
							cmd:   "",							// Optional ics messages, otherwise kaku, zwave, livolo etc.
							gaddr: "",							// Optional
							uaddr: "",							// Optional
							val:   "",							// Optional
							message: cmds[j]
						};
					}	
					socketHandler(JSON.stringify(data)); 		// generic handle function
				break;
			}//switch
		}//for
		task = queue.qpop();									// Next pop
	}//while
	if (debug>=2) queue.qprint();
}

// --------------------------------------------------------------------------------
// RULE HANDLER Loop with interval
//
function ruleHandler() {
	if (config['rules'] == undefined ) {
		logger("ruleHandler:: ERROR rules not defined",1);
		return;
	}
	for (var i = 0; i< config['rules'].length; i++) {
		if (config['rules'][i].active == "Y") {
			logger("ruleHandler:: rule "+config['rules'][i]['name']+" is active",2);
			try {
				logger("ruleHandler:: eval "+config['rules'][i]['name'],1);
				logger("ruleHandler:: "+config['rules'][i]['jrule'],3);
				var val = eval( config['rules'][i]['jrule'] );
				logger ("ruleHandler:: eval rule "+config['rules'][i]['name']+" returned: "+val,3);
				
				if (val == "stopRule") config['rules'][i].active = "N"; // User now has to activate rule first 
				if (val === parseInt(val, 10)) { 			// delay!!
					config['rules'][i].active = "N"; 
					queue.qinsert({ ticks: Number(val)+getTicks(), name: "rule", seq: {id: i, cmd: "active", val:"Y" } });
				};
			}
			catch (e) {
				logger("ruleHandler:: Error evaluating rule "+config['rules'][i]['name']+", error: "+e,1);
			}
		}
		else {
			logger("ruleHandler:: rule "+config['rules'][i]['name']+" not active",3);
		}
	}
	logger("ruleHandler:: Ended",2);
}


// ================================================================================
//                                MAIN part
// ================================================================================
logger("MAIN part started",1);

// INIT Put all functions for init here, after that, main() is started.
async.series([
	function (callback) {
		connectDbase(callback);
	},
	// Do the CURL request to Z-Wave to load the devices data
	function(callback) {
		zwave_init(function(err,result) { callback(null,result); } );
	},
	// Load the database to get the LamPI data
	function(callback) {
		loadDbase(callback);
	}
], function(err,results)  {
	main(err,results); 
})

// Simple function to restart the loops. This function is called
// by main, but also by the /init functions
function start_loops() {
	loops = [];
	logger("All Init functions done",1); 
	alarm_loop();						// Every 2 seconds handle alarms
	timer_loop();						// Every 60 seconds timer queue and logging
	poll_loop();						// Every 6 seconds test changed values from Z-Wave
	zwave_loop();
}

// Callback function after done all relevant initialization functions
function main(err,results) {
	if (debug>= 1) console.log("Return values: \n",results);
	// Delayed bind makes sure all initializations are finished
	userver.bind(udpPort);
	// If init is running, do not start the loops, init will do this when finished
	if (! init) {
		logger("Starting Loops");
		start_loops();
	}
	logger("Starting Static Webserver");
	// NOTE: All pathnames are relative to the Node Installation directory
	app.use(serveStatic(__dirname + '/www')); app.listen(webPort);
}

// --------------------------------------------------------------------------------
// TIMER LOOP
// Logging loop with interval of around 30-60 seconds.
// Prequisites:: The config['devices'] array must be present
// 1. Re-init the Z-Wave data structure
// 2. The Timer Array of LamPI will be read every xx seconds and when necessary timers activate scenes
//    that are ready will be put on the run Queue.
function timer_loop() {
  var i = 0;
  logger("Starting timer_loop",1);
  var id = setInterval ( function() {
	var now = new Date();						  
	var ticks = Math.floor(now.getTime()/1000);
	// logger('Loop '+i+", ticks: "+ticks+", devices: "+Object.keys(devices).length,2); 

	logger("----------- TIMER EXPIRED? ------------",1);
	// Refresh timers AND scenes from database from database
	queryDbase('SELECT * from timers',function (err, timers) {
	  if (err) {
		  logger("timer_loop:: ERROR table timers not found, "+err,1);
		  return;
	  }
	  config['timers']=timers; 
	  logger("timer_loop:: #timers: "+timers.length,2); 
	  queryDbase('SELECT * from scenes',function (err, scenes) {
		config['scenes']=scenes;
		logger("timer_loop:: now   date: "+now,1);
		var scalc = SunCalc.getTimes(now, 52.13, 5.58);				// This is for Apeldoorn
		for (var i=0; i<timers.length; i++) {
			var st = timers[i].tstart.split(":"), start_hour = st[0], start_minute = st[1];
			var st = timers[i].startd.split("\/");
			var start_day = st[0], start_month = st[1], start_year = Number(st[2])+2000;
			st = timers[i].endd.split("\/");
			var end_day = st[0], end_month = st[1], end_year = Number(st[2])+2000;

			var hour, minute, day, month, year, corr;
			day = now.getDate();			// Day of month 1 to 31
			month = now.getMonth();			// From 0 to 11
			year = now.getFullYear();		// 4 digits
			switch (start_hour) {			// Correct hours and minutes when sundawn or dusk is specified for timer
				case '96':
					corr = -Number(start_minute)*30*60;	// Correction
					hour = scalc.sunrise.getHours();
					minute = scalc.sunrise.getMinutes() ;
				break
				case '97':
					corr = Number(start_minute)*30*60;
					hour = scalc.sunrise.getHours();
					minute = scalc.sunrise.getMinutes();
				break
				case '98':
					corr = -Number(start_minute)*30*60;
					hour = scalc.sunset.getHours() ;
					minute = scalc.sunset.getMinutes();
				break
				case '99':
					corr = Number(start_minute)*30*60;
					hour = scalc.sunset.getHours();
					minute = scalc.sunset.getMinutes();
				break
				default:
					corr = 0;
					hour = start_hour;
					minute = start_minute;
				break
			}
			var td = Math.floor(new Date(year, month, day, hour, minute, 0, 0).getTime()/1000) + corr;
			logger("Timer correction is: "+corr,2);
			logger("timer_loop:: run   date: "+td,2);
			logger("timer_loop:: now   date: "+ticks,2);
			if ((td-ticks) > 0) logger("timer_loop:: name: "+timers[i]['name']+", runnable in: "+(td-ticks)+" secs",1);
			if (ticks < td) {logger("Timer not yet started ",2) ; continue; };
			
			var ed = Math.floor( new Date(end_year, end_month-1, end_day, 0, 0, 0, 0).getTime()/1000); 
			logger("timer_loop:: end date:   "+ed,2);
			if (ticks > ed) {logger("Timer enddate reached: "+ed,1) ; continue; };
			
			var sd = Math.floor( new Date(start_year, start_month-1, start_day, start_hour, start_minute, 0, 0).getTime()/1000);
			logger("timer_loop:: start date: "+sd,2);
			if (ticks < sd) {logger("Timer before start date",1) ; continue; };
			
			if ((ticks - td) > (timer_interval/500 + 1 )) { logger("Timer already started some time ago",2); continue; };
			if ((ticks - td) > (timer_interval/1000 )) { logger("Timer already started",2); continue; };
			
			// Look whether day off week or month is a blackout
			if (timers[i]['months'][Number(now.getMonth())-1] == 'x') { logger("Timer, this is a blackout month",1); continue; }
			if (timers[i]['days'][Number(now.getDay())-1] == 'x') { logger("Timer, this is a blackout day",1); continue; }

			// If we are here, at least we knowthat we can start this timer. 
			logger("timer_loop:: Starting timer name: "+timers[i]['name'],1);

			// Now for every command in the scene make sure that it is put on the queue and its timer is copied on the queue as well	
			// 
			var j; var splits;
			for (j=0; j<config['scenes'].length; j++) {
				if ( scenes[j]['name'] == timers[i]['scene'] ) {
					splits = scenes[j]['seq'].split(",");
					for (var k=0; k< splits.length; k+=2) {
						logger("scene item: "+(k/2)+", val: "+splits[k]+", time: "+splits[k+1],1);
						var effe = splits[k+1].split(":");
						var sticks = +(effe[0]*3600)+(effe[1]*60)+effe[2];
						logger("qinsert:: ticks: "+sticks+", name: "+scenes[j]['name']+", seq: "+splits[k],1);
						// Use gui as name as we have a gui ICS seq here. 
						// The queue can handle scene names as well but then leave the seq field empty
						queue.qinsert({ ticks: Number(sticks) + getTicks(), name: "gui", seq: splits[k] });
					}//for k
				}//if
			}//for j
		}//for i
	  });//scenes
	});//timers
  }, timer_interval );
  loops.push(id);
}

// --------------------------------------------------------------------------------
// ZWAVE LOGGING LOOP
// 1. Display log value of Z-Wave devices based on complete init
// 2. We update values in the Z-Wav and LamPI environment and update database
// 3. We broadcast values of sensors to connected gui clients
function zwave_loop() {
  logger("Starting zwave_loop");
  var i=0;
  var id = setInterval ( function() {							  
	// Display Active clients
	if (debug >= 2) {
		logger("----------- ACTIVE CLIENTS ------------",1);
		logger("Active socket Clients:: ",1);
		clients.forEach(function (client) {
			console.log(client.type+" Client: "+client.name);
		});
	}
	logger("----------- ACTIVE ZWAVE DEVICES ------------",1);
	// Do a complete init of the datastructure every 60 seconds just to be sure we didnt miss updates
	// NOTE: The program will continu while waiting for the outcome...
	zwave_init(function(err,result) {
		if (err) {
			logger("zwave_loop:: ERROR unable to run zwave_init, "+err,1);
			return;
		}
		logger("zwave_loop:: zwave_init: "+result,1); 
	}); 
	var ticks = Math.floor(Date.now()/1000);

	// Logging of all Z-Wave devices in the zroot data structure
	Object.keys(devices).forEach(function(key) {
		if (key > 1) {												// Skip over controller id=1
			logger("key: " + key,1);
			var classes = devices[key].instances[0].commandClasses;
			if (debug>2) console.log(classes);
			Object.keys(classes).forEach(function(cl) {	
				switch(cl) {
					case '37':									// SWITCH
					// If not a Battery get the value of the device
						var val        = classes[cl].data.level.value + 0;
						var lupdate    = classes[cl].data.level.updateTime;
						var invalidate = classes[cl].data.level.invalidateTime;
						logger("\tCl: "+cl+" Switch           , val "+val+", upd: "+printTime(lupdate)+", inval: "+printTime(invalidate),2);
					break;
					case '38':									// DIMMER
						var val = classes[cl].data.level.value + 0;
						var lupdate = classes[cl].data.level.updateTime;
						var invalidate = classes[cl].data.level.invalidateTime;
						logger("\tCl: "+cl+" Dimmer           , val "+val+", upd: "+printTime(lupdate)+", inval: "+printTime(invalidate),2);
					break;
					case '39':
						//var val = classes[cl].data.level.value + 0;
						logger("\tCl: "+cl+" Dimmer?          , val "+val,2);
					break;
					case '48':									// Sensor Binary -> PIR alarm
						if (classes[cl].data.interviewDone.value == false) {
							logger("WARNING:: Device "+cl+" Dead",1);
							break;
						}
						var val = classes[cl].data[1].level.value + 0;
						var lupdate = classes[cl].data[1].level.updateTime;
						logger("\tCl: "+cl+" PIR              , val "+val+", upd: "+printTime(lupdate),2);
					break;
					case '49':									// Sensor Multilevel -> Luminescense
						if (classes[cl].data.interviewDone.value == false) {
							logger("WARNING:: Device "+cl+" Dead",0);
							break;
						}
						var buf = {				// Actual sensor data is added below when present
							tcnt: ""+tcnt++,
							action: "sensor",
							type: "json",
							address: key+"",
							channel: "0"
						};
						if( 1 in classes[cl].data) {			// Temperature
							var val = classes[cl].data[1].val.value + 0;
							logger("\tCl: "+cl+" Temp             , val "+val,1);
							var index = addrSensor(key,0);
							config['sensors'][index]['sensor']['temperature']['val'] = val;
							config['sensors'][index]['sensor']['temperature']['lastUpdate'] = classes[cl].data[1].val.updateTime;
							buf.temperature = val;
						}
						if( 3 in classes[cl].data) {			// Luminescense
							var val = classes[cl].data[3].val.value + 0;
							logger("\tCl: "+cl+" Lumi             , val "+val,1);
							var index = addrSensor(key,0);
							config['sensors'][index]['sensor']['luminescense']['val'] = val;
							config['sensors'][index]['sensor']['luminescense']['lastUpdate'] = classes[cl].data[3].val.updateTime;
							buf.luminescense = val;
						}
						if( 5 in classes[cl].data) {			// Humidity
							val = classes[cl].data[5].val.value + 0;
							logger("\tCl: "+cl+" Humi             , val "+val,1);
							var index = addrSensor(key,0);
							config['sensors'][index]['sensor']['humidity']['val'] = val;
							config['sensors'][index]['sensor']['humidity']['lastUpdate'] = classes[cl].data[5].val.updateTime;
							buf.humidity = val;
						}
						logger("zwave_loop:: starting sensor handler for device: "+key,2);
						sensorHandler( buf )
					break;
					case '67':									// Thermostat
						if (classes[cl].data.interviewDone.value == false) {
							logger("WARNING: Thermostat device "+key+" Dead",0);
							break;
						}
						var val = classes[cl].data[1].val.value+0;
						logger("\tCl: "+cl+" Thermostat       , val "+val,1);
					break;
					case '112':
						logger("\tCl: "+cl+" Configuration",2);
					break;
					case '128':
						var val = classes[cl].data.last.value;
						var lupdate = classes[cl].data.last.updateTime;
						logger("\tCl: "+cl+" Battery         , "+val+"%, upd: "+printTime(lupdate),1);
					break;
					case '132':
						logger("\tCl: "+cl+" Wakeup",2);
					break;
					case '133':
						logger("\tCl: "+cl+" Association",2);
					break;
					case '142':
						logger("\tCl: "+cl+" MultiCh Assoc",2);
					break;
					case '143':
						logger("\tCl: "+cl+" MultiCh Assoc",2);
					break;
					case '156':
						logger("\tCl: "+cl+" Alarm Sensor",1);
					break;
					default:
						logger("\tCl: "+cl+" Device not yet handled",2);
					break;
				}
			});
		}
	});
	i++;
  }, log_interval );
  loops.push(id);
}

// --------------------------------------------------------------------------------
// POLL Loop with interval
// Go through the devices tree and for each 868 device get the status from Razberry.
// This may not be necessary once we take over the daemon function as well
// As from that moment on the config['devices'] will be in memory and always available
//
function poll_loop() {
  logger("Starting poll_loop");
  var id = setInterval ( function() {
	logger("-----------       POLL      ------------",1);
	connection.query('SELECT * from devices', function(err, rows, fields) {
		if (err) { 
			logger("poll_loop:: ERROR reading devices, "+err,1);
			// throw err;
			return;
		}
		config['devices'] = rows;
  		if (debug >= 3) console.log('query devices:: is: \n', rows);
		// Loop in our list of devices (not sensors) and make sure that for every one we take action
		for (var i=0; i< config['devices'].length; i++) {
			if (config['devices'][i]['gaddr'] == "868") {				// Is this a Z-Wave device
				// Remember this IS async so do not assume below we have a changed value
				deviceGet(i,config['devices'][i]['type']);				// Update the Z-Wave device tree asynchronous
			}//if 868
		}//for
	});
  }, poll_interval );
  loops.push(id);
}

// --------------------------------------------------------------------------------
// ALARM loop with interval
// 
// As alarms do not need a polling of the data (the value gets pushed to the Z-Wave controller)
// we need to make SURE that all data has been read or the function might fail.
// Also, as the alarm loop has finest timing granularity, we read the ready queue for runnable commands!
// ? Maybe start with binding functions to changed values
//
// TBD Put the rest of the function in the callback function of http.request!
//		so that we do ONLY execute when http.request is successful
function alarm_loop()
{
  logger("Starting alarm_loop",1);
  var resilient = 0;
  var id = setInterval ( function() {
								  
	var	zTime = Math.floor(Date.now()/1000);					// 
	logger("alarm_loop:: zTime: "+(zTime-alarm_interval),2);
	
	logger("----------- QUEUE HANDLER -------------",2);
	queueHandler();							// Handle the run queue of LamPI commands
	
	logger("----------- RULES HANDLER -------------",2);
	ruleHandler();
	
	// Only when devices are defined by zwave_init will we get updates ...!
	// Once the zwave host comes on-line, zwave_init will be called and devices will be defined ...
	if (( devices == undefined ) || (Object.getOwnPropertyNames(devices).length == 0)) {
		logger("alarm_loop:: ERROR No devices found, or zwave gateway down",2);
		return;
	}
	else {
	  // As alarm polling takes place most often, the main poll look is in this function too!
	  // Put changed values in the devices array through callback function
	  zwave_upd_options.path = '/ZWaveAPI/Data/'+(zTime - alarm_interval);
	  var req = http.request(zwave_upd_options, zwave_upd_cb);
	  req.on('error', function(e) {
		logger("alarm_loop:: ERROR no connection to zwave host, "+e.message,1);
	  })
	  req.end();
	  // XXX Alarm sensors are still too static, need global configuration in database.cfg
	  // maybe make an alarm type "ALARM" in sensors
	  var alarm1 = devices[9].instances[0].commandClasses[48].data[1].level.value;
	  if (alarm1 === true) {
		console.log("Fibaro ALARM");
		var data = {
			tcnt: 868,
			type: "json",
			action: "alarm",									// actually the class of the action
			scene: "Living on",									// Scene name to be executed
			message: "Fibaro ALARM"								// Message to popup in the GUI
		};
		if (resilient == 0 ) {
			resilient = 1;
			var ret = broadcast(JSON.stringify(data), null);
			logger("FIBARO ALARM",0);
			var id2 = setTimeout ( function() { resilient = 0; },240000 );
		}
	  }
	  var alarm2 = devices[11].instances[0].commandClasses[48].data[1].level.value;
	  if (alarm2 === true) {
		var data = {
			tcnt: 868,
			type: "json",
			action: "alarm",									// actually the class of the action
			scene: "",											// Scene name to be executed
			message: "AEON ALARM"								// Message to popup in the GUI
		};
		if (resilient == 0 ) {
			resilient = 1;
			var ret = broadcast(JSON.stringify(data), null);
			logger("AEON ALARM",0);
			var id2 = setTimeout ( function() { resilient = 0; },240000 );
		}
		// Maybe LamPI-node needs to do something itself with the alarm.
		// Gui's get a broadcast only every 4 minutes
		logger("AEON ALARM",0);
		// Switch off the alarm XXX not elegant. Should tell the device to be silent 30 secs after first alarm
	  }
	}// if undefined

  }, alarm_interval );
  loops.push(id);
}
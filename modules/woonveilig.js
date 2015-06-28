// --------------------------------------------------------------------------------
// woonveilig modules
// Version 1.0; May 24, 2015 
//

console.log("Starting woonveilig module");

var http    = require('http');
var async   = require('async');
var request = require('request');

var debug = 1;

// Woonveilig login data
var whost = '192.168.2.113';
var wlogin= "platenspeler";
var wpassw= "Apeldoorn16";

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

//
// As we set module.exports, we can call the function directly with the "require" value
//
var wv_options = {
		host: whost,
		path: 'http://'+whost+'/action/panelCondGet',
		port: '80',
		method: 'GET',
		auth: wlogin + ':' + wpassw,
		headers: { 'Content-Type': 'application/json' }
	};

// --------------------------------------------------------------------
// Externally visible
// Function to read the status of the alarm system
exports.wvStatus = function(cb) {	
	var ret = "";
	console.log("wvStatus started");
	async.series([
		function (callback) {
			wv_options.path = 'http://' + whost + '/action/panelCondGet';
			console.log("wv_options.path: "+wv_options.path);
				
			http.request(wv_options, function(response) {
				console.log("http.request started callback");
				var str = '';
				//another chunk of data has been recieved, so append it to `str`
  				response.on('data', function (chunk) {
  	  				str += chunk;
				});
				response.on('end', function () {
						if (str.search("<html>") >= 0) {
							console.log('Woonveilig ERROR: '+str);
							exports.wvStatus(cb);
						}
						else {
							console.log("wvStatus:: response: ",str);
    						var result = str.replace("/*-secure-","");
							result = result.replace("*/","");
							//var js = JSON.parse(result);
							var obj = eval("(" + result + ")");		// XXX Ooops, eval is dangerous
							callback(null,obj.updates.mode_st);
						}
  				});
				response.on('error', function (err) {
						console.log("Error woonveilig, "+err);
  				});

			}).end();//http.request
		}//callback
	], function(err,res) { 
			if (err) { console.log("wvStat ERROR"); }
			console.log("async returning value: "+res);
			ret = res;
			cb(null, "wvStatus : "+ret);
	});
};


// --------------------------------------------------------------------
// Module to set the alarm system in a certain state
// Makes use f the request library module
//
exports.wvSet = function(par, cb) {
	var ret = "";
	console.log("wvSet started par: "+par);
	async.series([
		function (callback) {
			wv_options.path = 'http://' + whost + '/action/panelCondPost ';
			console.log("wv_options.path: "+wv_options.path);
			
			request({
    			url: 'http://' + whost + '/action/panelCondPost ',
    			method: "POST",
				json: true,   // <--Very important!!!
				auth: { 'user': wlogin , 'pass': wpassw , 'sendImmediately': false },
				//body: { mode: ""+par }
				form: { mode: ""+par }
			}, function (error, response, body){
			    // console.log(response);
				console.log("<"+body+">");
				callback(null,body);
			});
		}//callback
	], function(err,res) { 
			if (err) { console.log("wvStat ERROR"); }
			console.log("async returning value: "+res);
			ret = res;
			cb(null, "wvSet : "+ret);
	});
};

// --------------------------------------------------------------------
// Module to set the alarm siren on or off
//
exports.wvSiren = function(par, cb) {
	var ret = "";
	console.log("wvSiren started par: "+par);
	async.series([
		function (callback) {

			console.log("wv_options.path: "+wv_options.path);
			
			request({
    			url: 'http://' + whost + '/action/sndSirenPost ',
    			method: "POST",
				json: true,   // <--Very important!!!
				auth: { 'user': wlogin , 'pass': wpassw , 'sendImmediately': false },
				form: { sndsiren_onoff: ""+par }
			}, function (error, response, body){
			    // console.log(response);
				console.log("<"+body+">");
				callback(null,body);
			});
		}//callback
	], function(err,res) { 
			if (err) { console.log("wvStat ERROR"); }
			console.log("async returning value: "+res);
			ret = res;
			cb(null, "wvSet : "+ret);
	});
};

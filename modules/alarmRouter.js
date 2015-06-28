// --------------------------------------------------------------------------------
// alarmRouter modules
// Version 1.0; May 24, 2015 
//

console.log("Starting alarmRouter module");

var express    = require('express');
var http       = require('http');
var woonveilig = require('./woonveilig');		// Relative to this module

var debug = 1;
var router = express.Router();

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


// ROUTER
//
// middleware specific to this router
router.use(function timeLog(req, res, next) {
//  console.log('Woonveilig Time: ', Date.now());
  logger('alarmRouter');
  next();
});
// define the home page route
router.get('/', function(req, res) {
  res.send('alarmRouter home page');
});
// define the about route
router.get('/status', function(req, res) {
  woonveilig.wvStatus( function(err, result) {
	console.log("alarmRouter status: "+result);
	res.send('alarmRouter status: '+result);
  });
});

// Disarm the alarm panel
router.get('/disarm', function(req, res) {
  woonveilig.wvSet( 2, function(err, result) {
	console.log("alarmRouter status: "+result);
	res.send('alarmRouter status: '+result);
  });
});
// Arm when Home alarm
router.get('/armhome', function(req, res) {
  woonveilig.wvSet( 1, function(err, result) {
	console.log("alarmRouter status: "+result);
	res.send('alarmRouter status: '+result);
  });
});
// Arm alarm
router.get('/arm', function(req, res) {
  woonveilig.wvSet( 0, function(err, result) {
	console.log("alarmRouter status: "+result);
	res.send('alarmRouter status: '+result);
  });
});

// Alarm siren on
router.get('/sirenon', function(req, res) {
  woonveilig.wvSiren( 0, function(err, result) {
	console.log("alarmRouter status: "+result);
	res.send('alarmRouter status: '+result);
  });
});
// Alarm siren off
router.get('/sirenoff', function(req, res) {
  woonveilig.wvSiren( 1, function(err, result) {
	console.log("alarmRouter status: "+result);
	res.send('alarmRouter status: '+result);
  });
});

// As we set module.exports, we can call the function directly with the "require" value
module.exports = router;

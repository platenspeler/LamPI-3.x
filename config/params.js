// JavaScript Document
//
var os = require('os');
var par = module.exports = {};

par.homeDir = process.env.HOME || '/home/pi'

par.dbHost = process.env.DBHOST || 'localhost';
par.dbUser = process.env.DBUSER || 'coco';
par.dbPassword = process.env.PASSWD || 'coco';

par.zHost = process.env.ZHOST || '192.168.1.52';

par.wHost = process.env.WHOST || 'myaddress';
par.wLogin= process.env.WLOGIN || 'login';
par.wPasswd= process.env.WPASSWD || 'password';

var ifaces = os.networkInterfaces();
Object.keys(ifaces).forEach(function (ifname) {
  var alias = 0;
  ifaces[ifname].forEach(function (iface) {
    if ('IPv4' !== iface.family || iface.internal !== false) {
      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
      return;
    }
    if (alias >= 1) {
      console.log(ifname + ':' + alias, iface.address);
	  par.thisHost = iface.address;	// this single interface has multiple ipv4 addresses, pick last one ...
	} else {
	  par.thisHost = iface.address;	// this interface has only one ipv4 adress, we take it
    }
  });
});
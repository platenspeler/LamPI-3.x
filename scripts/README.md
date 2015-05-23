This is the Script directory for LamPI, a controller for 433MHz receivers.

(c) Maarten Westenberg (aka Platenspeler)
mw12554 @ hotmail.com

Introduction:
=============
This directory contains a few scritps that can be used to install LamPI,
and to start/restart/stop a few daemons on a regular basis.

I do not use the services/init.d or inetd method to start and stop processes,
but use the cron system for the moment. Of course, adapting the system can always be 
later without too much problem.

Components:
===========


PI-install
----------
PI-install will automate some parts of the LamPI installation and configuration process.
It will update your Linux repository, install required packages, install GIT, install wiringPI
library and try to configure parts of the LamPI configuration (do a crontab -e).

NOTE: Not all of the installation is automated by now, and really it should not in the first 
place as many choices regarding installation directories, web-root etc are not mine anyways.

But Linux enthusiasts can read the file to figure out what actions to perform themselves.

PI-run (-r)
------
Will (re)start the LamPI-daemon process "php ~/www/LamPI-daemon.php".
Note that the daemon is implemented in PHP which works quite well as the daemon process is
not so critical wrt timing. The system will respond to incoming socket messages from the
GUI (LamPI-x.y.js) normally within a second, or within 2 secs if the daemon is busy with
timer execution involving a number of device commands.

PI-rcv (-r)
-----------
Will (re)start the LamPI-receiver process ~/exe/LamPI-receiver.
This is the real-time program written in C that will read the socket for incoming 
device commands from the LamPI-daemon.php process and at the same time it is a sniffer
for 433MHz remote commands received over the air which will be forwarded to LamPI-daemon.php
if a valid command is recognized.

PI-log
------
This program will look and the logfiles in ~/log on a regular basis. It does work by
copying the current logfile to a logfile.2 file and then truncate the active logfile.
Up to 4 archives are maintained (a few days!) and then the system will delete the log.

The script runs wen the crontab line is fired. In general, running once a day or maybe
a few times a day is enough. 

PI-1w
-----
Contains the 1-wire sensor program for LamPI

PI-clr
------
"sudo ./PI-clr" Will clean-up the log files in ~/log directory and restore some settings and permissions


Nov. 2013
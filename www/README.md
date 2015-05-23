Introduction
============
This www directory contains the .js an the .php files of the LamPI controller.
At the moment, the .js file is distributed in "compiled" format to save on size, as well as to allow me some additional time to clean up the code (including layout) before I distribute it in the better readible format.

(c) 2013, 2014
Maarten Westenberg (aka Platenspeler)
mw12554 @ hotmail.com

Notes:
=======
In order to use LamPI as a front-en for the ICS-1000 controller of klikaanklikuit(.nl) you need the following files:
- The LamPI-xx.yy.js files which contains the JavaScript/jQuery front-end
- A distribution version of jQuery (for the moment I added my custom version), 
	but any version >= 1.10.3 will do. So I need to remove that from the distri
- The backend_xxxxxx.php files as they are used by Ajax.
- You need to modify the conf/database.cfg file, in section settings to choose the ICS as
	its controller.
- Setup a MySQL database as defined in backend_cfg.php file
- Run with: http://youhost/backend_set.php?load in order to load the database

Background:
===========
LamPI started as an alternative web front-end for the ICS-1000 controller of klikaanklikuit(.nl).
However, it has been extended with functionality to use a RaspberryPI with commodity transmitter/receiver and use that as a controller for klikaanklikuit receivers and other brand 433MHz receivers instead. 

Nov. 2013
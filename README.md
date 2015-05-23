# LamPI-3.0
Introduction LamPI 3.x

This is the repository for LamPI, a RaspberryPI controller for 433MHz receivers. (c) 2014; Maarten Westenberg (aka Platenspeler) mw12554 @ hotmail.com

LamPI started as an alternative web front-end for the ICS-1000 controller of klikaanklikuit(.nl). However, it has been extended with functionality to use a RaspberryPI with commodity transmitter/receiver and use that as a controller for klikaanklikuit receivers and other brand 433MHz receivers instead. As of release 2.0 LamPI contains support for weather station and sensors. This means it can show real-time dials in the main screen and run graphs with historical data when clicking on these dials.

Please find extensive documentation on http://platenspeler.github.io
Components:

LamPI consists of a number of components that may or may not all be needed in order to get the system running. Find more README.md files in the corresponding (sub)directories

    The WebGUI; it is implemented by the LamPI-x.y.js file in the ~/www directory 1b. I'm working on an Android version, which is almost ready for most functions. (coming soon in a theatre near you :-) )

    The supporting backend_xxxxx.php files in the ~/daemon directory, for supporting the PHP daemon

    The ~/daemon/LamPI-daemon.php daemon which is implemented in php. It needs the backend_cfg.php file and the backend_lib.php files to work as well as ...
    The ~/exe/LamPI-receiver program, which implements the low-level Raspberry code for receiving and transmitting 433MHz messages from/to switches, dimmers and devices in your home The executable is found in the ~/exe directory, the sources in receivers/receiver
    Other executables (for each brand of device there is one), in the ~/exe dir.
    The front-end GUI and the LAMPI-daemon program need a MySQL database. This needs to be setup according to www/backend_cfg.php file. However, the database itself may reside on any other computer on the network as long as permissions are OK

Miscellaneous

    The C and C++ sources files in receivers/. In those directories "make" will make the executable, "sudo make install" will install it in /home/pi/exe
    Support for rrdtool databases and graphs scripts in the ~/rrd directory

Design:

    The MySQL database may be implemented on another computer than the Raspberry which may be a safe choice (for backups etc. a NAS does well as a database server).
    The www/LamPI-x.y.js GUI and the ~/daemon/LamPI-daemon.php will in general be working on the same machine which may or may not be a Raspberry.
    The ~/exe/LamPI-receiver (and transmitter) process will be running on Raspberry, but probably with little effort can be made to run on Arduino too... The supporting executables for devices need to be there as well (in ~/exe directory)

Aug. 2014

Introduction
============
This read.me contains some additional notes for the LamPI receiver directory.
The name receivers is not well chosen, as it contains C and C++ code 
for both 433MHz receiver as well as transmitters.
So it will probably change in a next release.

The project is documented in more detail at: http://www.westenberg.org

(c) M. Westenberg 2013, 2014
mw12554 @ hotmail.com
Version: 1.7.4

FILES
=====
The directory contains the following subdirectories:

lights
------
The lights subdirectory contains c++ code to send commands over the
air to 433MHz capable devices (receivers).
The base of this code was not developed by me, but I ported it to Raspberry
and added I support for klikanklikuit dimmers. Therefore I make it available.

Supported receivers: klikaanklikuit (kaku), action, Blokker
	and Elro as well as the old range of klikaanklikuit.
Building: Type "make" at the shell prompt
Installing: Type: 

	sudo make install

By default the files are installed in the exe directory (~/exe). 
Run: 

	cd ~/exe; ./kaku -g <address> -n <device> "on"/"off"/dimlevel (1-32)
		
Example: 

	./kaku -g 100 -n 1 on

livolo
------
Livolo makes wonderful glass wall switches and dimmers. Some of these can be 
switched remote as well.
See http://www.livolo.com or their Chinese website. Livolo can best be bought on
http://www.aliexpress.com. 
NOTE: Livolo remote controllers do not have separate keys for switching lamps
on and off, but have a key (for example A) that will toggle the state of the 
paired device/lamp. 

Location: /home/pi/receivers/livolo
Building:
Installing: 

	sudo make install

Example: 

	sudo ./livolo -g 23783 -n 1 on

kopou
-----
Kopou makes comparable receivers as Livolo does. Their range is smaller though,
and the remote controller codes differ too. But on a function level both are quite
comparable and look the same as well. Run example:

	 cd ~/exe; sudo ./kopou -g 13 -n 1 on

receiver; (see also below)
---------
This is the default LamPI-receiver process that runs as a daemon.
The code can run stand-alone for testing or can run as a daemon and connect
to the main LamPI-daemon.php process over web sockets.

sniffer
-------
This is the enhanced version of the receiver, better, better, better
but still in beta testing ... You can use either one when installing...

This directory contains code to support reading/sniffing from 
various types of remote controls for 433MHz. As we support several
receiver types it comes in handy to be ables to read these with the
Raspberry as well. Moreover, the LamPI GUI does support reading these remotes
and allows users to connect actions to button presses that are more sophisticated
and complex than just switching one lamp or so.
It is for example possible to use a Livolo remote to switch klikaanklikuit, which
is useful since the latter is half the price and half the size...

Supported remotes: klikaanklikuit, action, Livolo, Kopou
Location: /home/pi/receivers/sniffer
Building: 
Installing: Only if you make this your daemon: 

	sudo make install

but, you can also use the sniffer code without installing.
Running: 
- 1st: Make sure the LamPI-receiver process is NOT running...
- 2nd: You can run sniffer with statistics in the install dir: 

	cd /home/pi/receivers/sniffer; sudo ./sniffer -v -s -t

- 3rd: To just run the daemon:

	cd /home/pi/receivers/sniffer; sudo ./sniffer -d > /tmp/log 2>&1 &

of course if you run "make install" the location will be the ~/exe directory ...
- 4th: 

	cd /home/pi/receivers/sniffer; sudo ./sniffer -h 

will output relevant usage and help messages



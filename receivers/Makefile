#
# Makefile:
#	LamPI - WiringPI Compatable receiver library for the Raspberry Pi
#	
#
#	Copyright (c) 2013 Maarten Westenberg
#################################################################################
# Copyright, Use terms, Distribution etc.
# ========================================
# This library is free software; you can redistribute it and/or
# modify it under the terms of the GNU  General Public
# License as published by the Free Software Foundation; either
# version 3 of the License, or (at your option) any later version.
#
# This library is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public
# License along with this library; if not, If not, see <http://www.gnu.org/licenses/>.
#################################################################################


#DEBUG	= -g -O0
DEBUG	= -O3
CC	= gcc
INCLUDE	= -I/usr/local/include -I.
CFLAGS	= $(DEBUG) -Wall $(INCLUDE) -Winline -pipe

LDFLAGS	= -L/usr/local/lib
LDLIBS    = -lwiringPi -lwiringPiDev -lpthread -lm
INSTALL = /home/pi/exe

SRC	= 
    
# Should not alter anything below this line
###############################################################################

all:	sniffer livolo lights kopou kaku

sniffer:	./sniffer/sniffer
	cd sniffer; make

livolo:	./livolo/livolo
	cd livolo; make

lights: ./lights/action
	cd lights; make

kopou: ./kopou/kopou
	cd kopou; make

kaku: ./kaku/kaku
	cd kaku; make

install: 
	cd sniffer; sudo make install
	cd arduino; sudo make install
    cd rfm69; sudo make install

clean:
	@echo "[Clean]"
	@rm -f $(OBJ) *~ core tags $(BINS)

depend:
	makedepend -Y $(SRC)

# DO NOT DELETE

#
# Makefile:
#	LamPI - WiringPI Compatable transceiver library for the Raspberry Pi
#	
#	Copyright (c) 2013, 2014, 2015 Maarten Westenberg
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

SRC	= LamPI-arduino.c cJSON.c
    
# Fo not alter anything below this line
###############################################################################

OBJ=$(SRC:.c=.o)
BINS=$(SRC:.c=)

all:	LamPI-arduino

readme:
	@cat README.TXT
	@echo "    $(BINS)" | fmt
	@echo ""

really-all:	$(BINS)

LamPI-arduino:	$(OBJ)
	@echo [link]
	@$(CC) -o $@ $(OBJ) $(LDFLAGS) $(LDLIBS)

.c.o:
	@echo [CC] $<
	@$(CC) -c $(CFLAGS) $< -o $@

install:
	@echo "[install]"
	@-/usr/bin/pkill LamPI-arduino
	cp ./LamPI-arduino $(INSTALL)/LamPI-arduino
	chown root $(INSTALL)/LamPI-arduino
	chmod u+s $(INSTALL)/LamPI-arduino

clean:
	@echo "[Clean]"
	@rm -f $(OBJ) *~ core tags $(BINS)

tags:	$(SRC)
	@echo [ctags]
	@ctags $(SRC)

depend:
	makedepend -Y $(SRC)

# DO NOT DELETE

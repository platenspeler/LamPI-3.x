#
# Makefile:
#	LamPI - WiringPI Compatable sensor library for the Raspberry Pi
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
CFLAGS	= $(DEBUG) -Wall $(INCLUDE) -Winline -pipe -mtune=arm1176jzf-s -mfpu=vfp -mfloat-abi=hard -marm

LDFLAGS	= -L/usr/local/lib
LDLIBS    = -lwiringPi -lwiringPiDev -lpthread -lm
INSTALL = /home/pi/exe

SRC	= bh1750fvi.c i2c.c cJSON.c
    
# Should not alter anything below this line
###############################################################################

OBJ=$(SRC:.c=.o)

BINS=$(SRC:.c=)

all:	sensor

readme:
	@cat README.TXT
	@echo "    $(BINS)" | fmt
	@echo ""

really-all:	$(BINS)

sensor:	$(OBJ)
	@echo [link sensor]
	@$(CC) -o $@ $(OBJ) $(LDFLAGS) $(LDLIBS)
    
.c.o:
	@echo [CC] $<
	@$(CC) -c $(CFLAGS) $< -o $@

install:
	@cp bh1750fvi $(INSTALL)/bh1750fvi-sensor
	chown root $(INSTALL)/bh1750fvi-sensor
	chmod u+s $(INSTALL)/bh1750fvi-sensor

clean:
	@echo "[Clean]"
	@rm -f $(OBJ) *~ core tags $(BINS)

tags:	$(SRC)
	@echo [ctags]
	@ctags $(SRC)

depend:
	makedepend -Y $(SRC)

# DO NOT DELETE

#
# Makefile:
#	livolo - WiringPI Compatable livolo library for the Raspberry Pi
#	
#
#	Copyright (c) 2013 Maarten Westenberg
#################################################################################
# Copyright, Use terms, Distribution etc.
# ========================================
# This library is free software; you can redistribute it and/or
# modify it under the terms of the GNU Lesser General Public
# License as published by the Free Software Foundation; either
# version 2.1 of the License, or (at your option) any later version.
#
# This library is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public
# License along with this library; if not, If not, see <http://www.gnu.org/licenses/>.
#################################################################################


#DEBUG	= -g -O0
DEBUG	= -O3
CC	= g++
INCLUDE	= -I/usr/local/include
CFLAGS	= $(DEBUG) -Wall $(INCLUDE) -Winline -pipe

LDFLAGS	= -L/usr/local/lib
LDLIBS    = -lwiringPi -lwiringPiDev -lpthread -lm
INSTALL = /home/pi/exe

# Should not alter anything below this line
###############################################################################

SRC	=	livolo.cpp 

OBJ	=	$(SRC:.cpp=.o)

BINS	=	$(SRC:.cpp=)

all:	$(BINS)

readme:
	@cat README.TXT
	@echo "    $(BINS)" | fmt
	@echo ""

really-all:	$(BINS)

livolo:	livolo.o
	@echo [link]
	@$(CC) -o $@ livolo.o $(LDFLAGS) $(LDLIBS)

.c.o:
	@echo [CC] $<
	@$(CC) -c $(CFLAGS) $< -o $@

install:
	@cp livolo $(INSTALL)/livolo
	chown root $(INSTALL)/livolo
	chmod u+s $(INSTALL)/livolo

clean:
	@echo "[Clean]"
	@rm -f $(OBJ) *~ core tags $(BINS)

tags:	$(SRC)
	@echo [ctags]
	@ctags $(SRC)

depend:
	makedepend -Y $(SRC)

# DO NOT DELETE

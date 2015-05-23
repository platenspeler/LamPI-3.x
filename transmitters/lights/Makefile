#
# Makefile:
#	LamPI - WiringPI Compatable receive library for the Raspberry Pi
#	
#
#	Copyright (c) 2012 Maarten Westenberg
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

SRC	=	kakuold.cpp 		\
		action.cpp 		\
        elro.cpp 		\
        blokker.cpp 	\
        coco.cpp

OBJ	=	$(SRC:.cpp=.o)

BINS	=	$(SRC:.cpp=)

all:	$(BINS)

readme:
	@cat README.TXT
	@echo "    $(BINS)" | fmt
	@echo ""

really-all:	$(BINS)

kakuold:	kakuold.o
	@echo [link]
	@$(CC) -o $@ kakuold.o $(LDFLAGS) $(LDLIBS)

action:	action.o
	@echo [link]
	@$(CC) -o $@ action.o $(LDFLAGS) $(LDLIBS)

elro:	elro.o
	@echo [link]
	@$(CC) -o $@ elro.o $(LDFLAGS) $(LDLIBS)

blokker:	blokker.o
	@echo [link]
	@$(CC) -o $@ blokker.o $(LDFLAGS) $(LDLIBS)

.c.o:
	@echo [CC] $<
	@$(CC) -c $(CFLAGS) $< -o $@

install:
	@cp kakuold action blokker elro $(INSTALL)
	chown root $(INSTALL)/*
	chmod 755 $(INSTALL)/*
	chmod u+s $(INSTALL)/*
    
clean:
	@echo "[Clean]"
	@rm -f $(OBJ) *~ core tags $(BINS)

tags:	$(SRC)
	@echo [ctags]
	@ctags $(SRC)

depend:
	makedepend -Y $(SRC)

# DO NOT DELETE

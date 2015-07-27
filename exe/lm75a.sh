#!/bin/sh
#
EXEDIR="$HOME/exe"; export EXEDIR
SCRIPTDIR="$HOME/scripts"; export SCRIPTDIR
SNIFFER="LamPI-receiver"; export SNIFFER
LOGDIR="$HOME/log"; export LOGDIR

cd $SCRIPTDIR
BASENAME=`basename "$0"`
echo "starting program: $0, $BASENAME"
#
LOGFILE="$LOGDIR/$BASENAME.log"; export LOGFILE
PID=""; export PID

HOSTNAME="255.255.255.255"; export HOSTNAME
PORTNUMBER="5001"; export PORTNUMBER
#

# The 0x48 word is address. The address is 7 bits, first bit = 1 and 4th bit is 1 (so 4* 16 + 8) 
# 1 0 0 1 x x x Where xxx are address bits A2, A1 and A0 on the LM75A chip
# The 3 least significant bits are made 0 by the application but can address 8 separate LM75 devices
export value; 

value=`sudo i2cget -y 1 0x49 0x00 w` 
if [ "$?" != "0" ]; then
	echo "ERROR"
	exit -1
fi

# Now the trick is that the bytes are swapped in the application.
# So from value, the last byte (2 hex digits) contain the integer value of the temperature in Celsius
# The first of the 2 hex digits contains the fraction (digit-3 * 0.125 degree), but since only
# the first 3 bits are used we need to shift right that digit which means we multiply with 0.125 /2 = 0.0625

export temperature;
temperature=`echo $value | awk '{printf("%.2f\n", (a=( (("0x"substr($1,5,2)substr($1,3,1))*0.0625)) )>128?a-256:a)}'`

echo "buffer: $temperature"

$EXEDIR/cmd-sensor -d -h $HOSTNAME -p $PORTNUMBER -b "{\"tcnt\":\"49\",\"action\":\"sensor\",\"brand\":\"lm75\",\"type\":\"json\",\"address\":\"49\",\"channel\":\"0\",\"temperature\":\"$temperature\"}"

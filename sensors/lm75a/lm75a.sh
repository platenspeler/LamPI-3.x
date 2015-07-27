#!/bin/sh
#
# Parts of the solution found on Internet
# M.G. Westenberg
#
EXEDIR="$HOME/exe"; export EXEDIR
SCRIPTDIR="$HOME/scripts"; export SCRIPTDIR
LOGDIR="$HOME/log"; export LOGDIR

cd $SCRIPTDIR
BASENAME=`basename "$0"`
#echo "starting program: $0, $BASENAME"
#
LOGFILE="$LOGDIR/$BASENAME.log"; export LOGFILE
PID=""; export PID

HOSTNAME="255.255.255.255"; export HOSTNAME
PORTNUMBER="5001"; export PORTNUMBER
MY_IP=$(ip addr | grep 'state UP' -A2 | tail -n1 | awk '{print $2}' | cut -f1  -d'/')
MY_BYTE=`echo ${MY_IP##*.}`

export TEMPERATURE;
export VALUE; 

#

# The 0x48 word is address. The address is 7 bits, first bit = 1 and 4th bit is 1 (so 4* 16 + 8) 
# 1 0 0 1 x x x Where xxx are address bits A2, A1 and A0 on the LM75A chip
# The 3 least significant bits are made 0 by the application but can address 8 separate LM75 devices

for  i in 48 49 4a 4b 4c 4d 4e ; do

  VALUE=`sudo i2cget -y 1 0x$i 0x00 w` >> /dev/null 2>&1
  if [ "$?" = "0" ]; then
    # Now the trick is that the bytes are swapped in the application.
    # So from VALUE, the last byte (2 hex digits) contain the integer VALUE of the temperature in Celsius
    # The first of the 2 hex digits contains the fraction (digit-3 * 0.125 degree), but since only
    # the first 3 bits are used we need to shift right that digit which means we multiply with 0.125 /2 = 0.0625
    TEMPERATURE=`echo $VALUE | awk '{printf("%.2f\n", (a=( (("0x"substr($1,5,2)substr($1,3,1))*0.0625)) )>128?a-256:a)}'`
    echo "buffer $i temperature: $TEMPERATURE"
    $EXEDIR/cmd-sensor -d -h $HOSTNAME -p $PORTNUMBER -b "{\"tcnt\":\"$i\",\"action\":\"sensor\",\"brand\":\"lm75\",\"type\":\"json\",\"address\":\"$i\",\"channel\":\"$MY_BYTE\",\"temperature\":\"$TEMPERATURE\"}"
  fi

done

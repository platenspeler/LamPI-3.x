#!/bin/bash
#
log=/home/pi/log/rrdtool.log
output=/home/pi/www/graphs

if [ "$1" != "" ]; then
	start=$1
else
	start=1w
fi


# -----------------------------------------------------------------------------
# We run the generate script every few minutes as set in the crontab file.
# edit crontab with "crontab -e" and include the following line:
# 	*/3 * * * *  cd /home/pi/rrd/scripts && sh ./generate_day.sh
#
# If you have multiple rrdtool host in the network you can instead of generating
# your graphs here also copy them from a remote host. This will save you compute time
# as rrdtool graph operations are VERY compute intensive
# To do so, just enter the host IP below
#
# SOURCE="192.168.2.53";
SOURCE=""

if [ "$SOURCE" != "" ]; then
	wget -P /home/pi/www/graphs -N http://$SOURCE/graphs/all_temp_1_week.png /dev/null 2>>$log
	wget -P /home/pi/www/graphs -N http://$SOURCE/graphs/all_temp_1_week.png /dev/null 2>>$log
	wget -P /home/pi/www/graphs -N http://$SOURCE/graphs/all_temp_1_week.png /dev/null 2>>$log
	echo "Retrieved the graphs from remote host $SOURCE" >/dev/null 2>>$log
	return 0
fi

# For debugging only
echo "`date`: Starting Generate $start Graphs" >> $log 2>&1


# -----------------------------------------------------------------------------
#
# 6 Sensors. All with their own data, mixed in one graph
#
end=N
width=720
height=360
outside=/home/pi/rrd/db/Outside.rrd
extension=/home/pi/rrd/db/Extension.rrd
living=/home/pi/rrd/db/Living.rrd
dht22=/home/pi/rrd/db/dht22.rrd
pi55_1=/home/pi/rrd/db/pi55-1.rrd
pi55_2=/home/pi/rrd/db/pi55-2.rrd
rrdtool graph $output/all_temp_1_week.png -s N-$start -a PNG -E \
--title="all temp" --vertical-label "Temp" \
--width $width --height $height \
DEF:t1=$outside:temperature:AVERAGE \
DEF:t2=$extension:temperature:AVERAGE \
DEF:t3=$living:temperature:AVERAGE \
DEF:t4=$dht22:temperature:AVERAGE \
DEF:t5=$pi55_1:temperature:AVERAGE \
DEF:t6=$pi55_2:temperature:AVERAGE \
LINE1:t1#ff0000:"Outside" \
LINE1:t2#00ff00:"TV room" \
LINE1:t3#0000ff:"Living" \
LINE1:t4#00ffff:"dht22" \
LINE1:t5#ffff00:"Up1" \
LINE1:t6#666666:"Up2\n" \
GPRINT:t1:LAST:"Outside\: %1.0lf°C" \
GPRINT:t2:LAST:"TV Room\: %1.0lf°C\n" \
GPRINT:t3:LAST:"Living\: %1.0lf°C" \
GPRINT:t4:LAST:"dht22\: %1.0lf°C\n" \
GPRINT:t5:LAST:"Up 1\: %1.0lf°C" \
GPRINT:t6:LAST:"Up 2\: %1.0lf°C\n" \
>/dev/null 2>>$log

sleep 1

# -----------------------------------------------------------------------------
#
# Humidity Sensors. All with their own data, mixed in one graph
#
end=N
width=720
height=360
outside=/home/pi/rrd/db/Outside.rrd
extension=/home/pi/rrd/db/Extension.rrd
living=/home/pi/rrd/db/Living.rrd
dht22=/home/pi/rrd/db/dht22.rrd
sht21_1=/home/pi/rrd/db/sht21-1.rrd

rrdtool graph $output/all_humi_1_week.png -s N-$start -a PNG -E \
--title="all temp" --vertical-label "Humidity" \
--width $width --height $height \
DEF:t1=$outside:humidity:AVERAGE \
DEF:t2=$extension:humidity:AVERAGE \
DEF:t3=$living:humidity:AVERAGE \
DEF:t4=$dht22:humidity:AVERAGE \
DEF:t5=$sht21_1:humidity:AVERAGE \
LINE2:t1#ff0000:"Outside" \
LINE2:t2#00ff00:"TV room" \
LINE2:t3#0000ff:"Living" \
LINE2:t4#00ffff:"dht22" \
LINE2:t5#ffff00:"TV Rm SHT21" \
GPRINT:t1:LAST:"Outside\: %1.0lf°C" \
GPRINT:t2:LAST:"TV Room\: %1.0lf°C\n" \
GPRINT:t3:LAST:"Living\: %1.0lf°C" \
GPRINT:t4:LAST:"dht22\: %1.0lf°C\n" \
GPRINT:t5:LAST:"SHT 21\: %1.0lf°C" \
>/dev/null 2>>$log

# -----------------------------------------------------------------------------
#
# Airpressure Sensors. All with their own data, mixed in one graph
#
end=N
width=720
height=360
bmp085_1=/home/pi/rrd/db/bmp085-1.rrd
rrdtool graph $output/all_press_1_week.png -s N-$start -a PNG -E \
--title="Air Pressure" --vertical-label "Reading" \
--width $width --height $height \
DEF:t1=$bmp085_1:airpressure:AVERAGE \
LINE2:t1#ff0000:"Airpressure" \
GPRINT:t1:LAST:"Airpressure\: %1.0lfHpa" \
>/dev/null 2>>$log
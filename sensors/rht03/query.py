#!/usr/bin/env python
# -*- coding: UTF-8 -*-

# This script queries a DHT11 sensor and outputs json data

# enable debugging
import cgitb
cgitb.enable()

# html header
print "Content-type: application/json\n"

# status led -> high
import commands
commands.getstatusoutput("sudo /home/damien/breakout/gpio/set.sh 17 1")

# read sensor
cmd = "sudo /home/damien/breakout/Humidity.Sensor.DHT11/sensor"
status, output = commands.getstatusoutput(cmd)

# parses sensor output
try: sensor = dict(item.split(":") for item in output.split("|"))
except: sensor = dict()

# handle fuzzy sensor response
c = sensor["temperature-celsius"] if "temperature-celsius" in sensor else None
r = sensor["humidity-relative"] if "humidity-relative" in sensor else None

# adds status information
data = {
	"data": {
		"temperature": {
			"value": c,
            "measurement": "Degree Celsius",
            "symbol": "°C",
			"accuracy": "±2.0",
            "range": "0-50"
		},
		"humidity": {
			"value": r,
            "measurement": "Relative humidity",
            "symbol": "%RH",
			"accuracy": "±5.0",
            "range": "20-90"
		},
	},
	"status": {
		"success": not bool(int(status)),
		"status": status,
        "raw-response": output
	},
    # FIXME: it is the sensor-reading binary that should be
    # responsible for this information, and output smth like:
    # dimension,value,unit,accuracy,hardware-name (separator should be |)
    # eg for this script:
    # temperature,25,°C,2,DHT11
    # humidity,31,%,5,DHT11
	"sensor": {
		"model": ["DHT11", "RHT01"],
        "serial": None,
        "response-time": "<5", # [s]econds
        "interchangeability": "full",
		"url": "http://shop.boxtec.ch/digital-humiditytemperature-sensor-dht11-rht01-p-40242.html",
	},
    # FIXME: location should be added by a broader script,
    # managing/gathering all sensors data access
    "location": {
        "lat": "46.507489",
        "lon": "6.653775",
        "elevation": "398.6", # [m]eters
        "orientation": None,
        "azimuth": None,
        "description": "Living room, 2 people living, ground floor",
        # FIXME: Types should be described concisely & precisely in a ref table
        "environment": ["indoor", "outdoor", "sheltered", "people", "animals", "botanic"]
    },
    "license": {
        "url": "http://creativecommons.org/licenses/by-nd/3.0/deed"
    },
}

# outputs json data
import json
print json.dumps(data, sort_keys=True)

# status led -> low
commands.getstatusoutput("sudo /home/damien/breakout/gpio/set.sh 17 0")

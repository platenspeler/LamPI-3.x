#!/bin/bash
#
# This little shell program sends a sensors command to the daemon.j

HOSTNAME="255.255.255.255"; export HOSTNAME
PORT="5001"; export PORT



./sensor -v -h $HOSTNAME -p $PORT -b '{"tcnt":"181","type":"json","action":"weather","brand":"fibaro","location":"pi52","address":"9","channel":"0","temperature":"25"}'

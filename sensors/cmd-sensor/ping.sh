#!/bin/bash

HOSTNAME="192.168.2.53"; export HOSTNAME
PORT="5001"; export PORT

./sensor -v -h $HOSTNAME -p $PORT -b '{"tcnt":"181","type":"raw","action":"ping","cmd":"","message":"AAP"}'

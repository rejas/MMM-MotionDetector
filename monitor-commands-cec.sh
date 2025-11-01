#!/bin/bash

case "$1" in
  on)
    echo "on 0" | cec-client -s -d 1
    ;;
  off)
    echo "standby 0" | cec-client -s -d 1
    ;;
  status)
    if echo 'pow 0' | cec-client -s -d 1 | grep -q "power status: on"; then
      echo "ON"
    else
      echo "OFF"
    fi
    ;;
  *)
    echo "Usage: $0 {on|off|status}"
    exit 1
    ;;
esac

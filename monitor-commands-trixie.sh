#!/bin/bash

case "$1" in
  on)
    DISPLAY=:0 xset dpms force on
    ;;
  off)
    DISPLAY=:0 xset dpms force off
    ;;
  status)
    status=$(DISPLAY=:0 xset q | grep "Monitor is" | awk '{print $3}')
    if [ "$status" = "On" ]; then
      echo "display_power=1"
    else
      echo "display_power=0"
    fi
    ;;
  *)
    echo "Usage: $0 {on|off|status}"
    exit 1
    ;;
esac

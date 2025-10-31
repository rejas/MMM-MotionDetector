#!/bin/bash

case "$1" in
  on)
    /usr/bin/wlr-randr --output HDMI-A-1 --on
    ;;
  off)
    /usr/bin/wlr-randr --output HDMI-A-1 --off
    ;;
  status)
    # Check if HDMI-A-1 is enabled
    if /usr/bin/wlr-randr | grep -A 5 "HDMI-A-1" | grep -q "Enabled: yes"; then
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

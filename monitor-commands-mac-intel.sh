#!/bin/bash

case "$1" in
  on)
    caffeinate -u -t 1
    ;;
  off)
    pmset displaysleepnow
    ;;
  status)
    # Check if display is sleeping
    if ioreg -n IODisplayWrangler | grep -q '"IOPowerManagement".*"CurrentPowerState"=3'; then
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

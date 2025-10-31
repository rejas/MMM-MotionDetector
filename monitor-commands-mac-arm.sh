#!/bin/bash

case "$1" in
  on)
    caffeinate -u -t 1
    ;;
  off)
    pmset displaysleepnow
    ;;
  status)
    # Get the last Sleep/Wake event from pmset log
    LAST_EVENT=$(pmset -g log | grep -e " Sleep  " -e " Wake  " | tail -n1)

    # Extract the state (last word before tab)
    STATE=$(echo "$LAST_EVENT" | awk '{print $4}')

    # Check if it's Wake or Sleep
    if [[ "$STATE" == "Wake" ]]; then
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

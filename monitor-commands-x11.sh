#!/bin/bash

case "$1" in
  on)
    vcgencmd display_power 1
    ;;
  off)
    vcgencmd display_power 0
    ;;
  status)
      POWER_STATUS=$(vcgencmd display_power)
      if [[ "$POWER_STATUS" == *"=1"* ]]; then
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

#!/bin/bash

case "$1" in
  on)
    vcgencmd display_power 1
    ;;
  off)
    vcgencmd display_power 0
    ;;
  status)
    vcgencmd display_power
    ;;
  *)
    echo "Usage: $0 {on|off|status}"
    exit 1
    ;;
esac

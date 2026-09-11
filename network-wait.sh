#!/bin/bash

# network-wait.sh - Simple network checker
# Retries until it can ping 8.8.8.8

echo "Waiting for network connection..."
echo "Press Ctrl+C to cancel"

while true; do
    
    if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
        echo "Network ready!"
        break
    fi
    
    echo "Waiting for network..."
    sleep 60
done

exit 0
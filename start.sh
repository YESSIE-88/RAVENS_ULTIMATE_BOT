#!/bin/bash

# start.sh - Main bot startup script

echo "🏠 Homelab Bot Setup & Start Script"
echo "================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "On Raspberry Pi, try: sudo apt install nodejs npm"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please create a .env file with your Discord token:"
    echo "DISCORD_TOKEN=your_bot_token_here"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install discord.js dotenv
    echo "Dependencies installed!"
fi

# Check if bot is already running
if pgrep -f "node index.js" > /dev/null; then
    echo "Error: Bot is already running!"
    echo "To stop it manually: pkill -f 'node index.js'"
    exit 1
fi

echo "Starting Homelab Bot..."
echo "Send 'ping' in Discord to check if your homelab is online!"
node index.js
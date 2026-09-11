I used this guide to set up my server: https://youtu.be/Oy5HGvrxM4o?si=OiitTShQquTSZ8Ca

To run the bot there are a few steps

Run the command: npm init -y

Run the command: npm i node-cron

Run the command: npm i discord.js

Run the command: npm i dotenv

Run the command: npm i moment-timezone

Enter your own discord token in the .env file

To start the bot in the server use: node index.js

MAKE SURE TO ONLY HAVE THE BOT RUNNING IN ONE INSTANCE AT A TIME!!!

### Installation for auto launch

1. **Copy the desktop file**
   ```bash
   cp ravens-ultimate-bot.desktop ~/.config/autostart/ravens-ultimate-bot.desktop

2. **Make the scripts executable**
   ```bash
   chmod +x network-wait.sh start.sh

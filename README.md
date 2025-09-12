I used this guide to set up my server: https://youtu.be/Oy5HGvrxM4o?si=OiitTShQquTSZ8Ca

To run the bot there are a few steps

Run the command: npm init -y

Run the command: npm i node-cron

Run the command: npm i discord.js

Run  the command: npm i dotenv

Enter your own discord token in the .env file

To start the bot in the server use: node index.js

Alternatively you can host this bot on a remote server, like digital ocean or google app engines:

To start the bot with google app engines use: gcloud app deploy

To pause the bot you can just redeploy it with an invalid token

To list versions you can list them with: gcloud app versions list
To delete them use: gcloud app versions delete VERSION.ID

Finally the third option (and best imo) is to run this on a raspberry pi or other sbc because you have more control and its basicaly free

MAKE SURE TO ONLY HAVE THE BOT RUNNING IN ONE INSTANCE AT A TIME!!!

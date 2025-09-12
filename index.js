const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log('Bot logged in successfully!');
}).catch(err => {
    console.error('Error logging in:', err);
});

// ------------------ CONFIG ------------------
let testing = false;
let editing_channel_path = false;
let selected_channel_index = null;
let cancelling_next_practice = false;
let selectedPracticeIndex = null;

let general_channel_name = 'general';
let testing_channel_name = 'bot-commands';
let cpatains_channel_name = 'captains';

// Track skipped/cancelled reminders
const skippedReminders = new Set(); // YYYY-MM-DD strings

// Practice days of week (Tue=2, Wed=3, Fri=5)
const practiceDays = [2, 3, 5];

// ------------------ BIRTHDAYS ------------------
const birthdays = [
  { name: "Andrew Hodge", birthday: "31-03-2003" },
  { name: "Andrew Yung", birthday: "08-07-2005" },
  { name: "Aydan Eng", birthday: "08-09-2005" },
  { name: "Brody Good", birthday: "07-10-2003" },
  { name: "Charlie Carreau", birthday: "04-05-2005" },
  { name: "Ezekiel Batistil", birthday: "11-03-2004" },
  { name: "Jack Lau", birthday: "10-08-2003" },
  { name: "Liam Hill", birthday: "01-03-2004" },
  { name: "Noah Archer", birthday: "06-12-2003" },
  { name: "Owen Daigeler", birthday: "06-02-2005" },
  { name: "Rob Wallace", birthday: "15-07-2005" },
  { name: "Samuel Xie", birthday: "25-07-2007" },
  { name: "Theo Checroune", birthday: "15-02-2005" },
  { name: "Tristan Hodgson", birthday: "19-09-2007" },
  { name: "Wesley Ormsby", birthday: "21-02-2006" },
  { name: "Aidan Miklos", birthday: "26-02-2006" },
  { name: "Andrew Weaver", birthday: "23-11-2005" },
  { name: "Brett Ormsby", birthday: "21-02-2006" },
  { name: "Derek Lien", birthday: "28-05-2006" },
  { name: "Ford Healey", birthday: "10-09-1999" },
  { name: "Ian Beddie", birthday: "16-07-2007" },
  { name: "Jakob Bouse", birthday: "02-10-2003" },
  { name: "James Hubbard", birthday: "25-09-2004" },
  { name: "Jeremy Hornung", birthday: "18-11-2003" },
  { name: "Julien Brombach", birthday: "25-05-2003" },
  { name: "Keegan Tjoa", birthday: "26-07-2007" },
  { name: "Kieran Grimshaw", birthday: "18-02-2007" },
  { name: "Kyle teNyenhuis", birthday: "22-04-2003" },
  { name: "Lee Murphy", birthday: "17-12-2001" },
  { name: "Levi Viljakainen", birthday: "17-02-2001" },
  { name: "Lucas Watts", birthday: "20-05-2005" },
  { name: "Lukas Legal", birthday: "08-06-2007" },
  { name: "Marley Humphreys", birthday: "13-04-2007" },
  { name: "Matheo Mckeague", birthday: "12-10-2005" },
  { name: "Matt Alberta", birthday: "20-11-2004" },
  { name: "Neil Scott", birthday: "04-12-2007" },
  { name: "Owen Woods", birthday: "28-06-2004" },
  { name: "Ryan McCracken", birthday: "28-01-2007" },
  { name: "Spencer List", birthday: "21-06-2005" },
  { name: "Tarun Karthik", birthday: "29-05-2006" },
  { name: "William Younger", birthday: "13-11-2007" },
  { name: "Kyle Hunter", birthday: "26-11-1996" },
  { name: "Liam Daigeler", birthday: "02-10-2003" },
  { name: "Desmond Top", birthday: "23-02-2002" },
  { name: "Dylan Melo", birthday: "20-03-2005" },
  { name: "Jack Quach", birthday: "15-10-2005" },
  { name: "Jack Lynam", birthday: "15-08-2006" },
  { name: "Jessie Sellars", birthday: "15-09-2004" },
  { name: "Kai Hyndman", birthday: "20-10-2006" },
  { name: "Owen Smith", birthday: "18-03-2004" },
  { name: "Jeremy Close", birthday: "13-01-2006" },
];

// ------------------ HELPERS ------------------
const validBirthdays = birthdays.filter(b => b.birthday);

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function getNextPractices(n = 6) {
    const now = new Date();
    now.setSeconds(0, 0);
    const list = [];
    let d = new Date(now);

    while (list.length < n) {
        if (practiceDays.includes(d.getDay())) {
            if (d.toDateString() === now.toDateString()) {
                if (now.getHours() < 7) list.push(new Date(d));
            } else {
                list.push(new Date(d));
            }
        }
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
    }

    return list;
}

function checkBirthdaysToday() {
    const today = new Date();
    const mmdd = today.toISOString().slice(5, 10); // "MM-DD"
    return validBirthdays.filter(b => {
        const parts = b.birthday.split("-");
        const month = parts[1];
        const day = parts[2];
        return `${month}-${day}` === mmdd;
    });
}

// ------------------ GUILD & CHANNEL SELECTION ------------------
function getCurrentGuild() {
    if (testing) {
        return client.guilds.cache.find(g => g.name === "Bot Tester");
    } else {
        return client.guilds.cache.find(g => g.name === "Ravens Ultimate");
    }
}

function getGeneralChannel(guild) {
    if (!guild) return null;

    if (testing) {
        return guild.channels.cache.find(
            ch => ch.name === testing_channel_name && ch.type === 0
        );
    } else {
        const category = guild.channels.cache.find(
            ch => ch.name === "All Teams" && ch.type === 4
        );
        if (!category) return null;

        return guild.channels.cache.find(
            ch => ch.name === general_channel_name && ch.parentId === category.id && ch.type === 0
        );
    }
}

// ------------------ SCHEDULED TASKS ------------------
function schedulePracticeReminders() {
    cron.schedule('0 19 * * *', async () => {
        try {
            await sendPracticeReminder();
        } catch (err) {
            console.error("Error sending practice reminder:", err);
        }
    });
}

function scheduleBirthdayMessages() {
    cron.schedule("0 0 * * *", async () => {
        try {
            await sendBirthdayMessages();
        } catch (err) {
            console.error("Error sending birthday messages:", err);
        }
    });
}

async function sendPracticeReminder() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

    if (!practiceDays.includes(tomorrow.getDay())) return;
    if (skippedReminders.has(tomorrowStr)) return;

    const guild = getCurrentGuild();
    if (!guild) return console.error("Guild not found for practice reminder");

    const channel = getGeneralChannel(guild);
    if (!channel) return console.error("Channel not found for practice reminder");

    await channel.send("⏰ Reminder: Practice tomorrow morning at 7 AM!");
}

async function sendBirthdayMessages() {
    const todaysBirthdays = checkBirthdaysToday();
    if (todaysBirthdays.length === 0) return;

    const guild = getCurrentGuild();
    if (!guild) return console.error("Guild not found for birthday messages");

    const channel = getGeneralChannel(guild);
    if (!channel) return console.error("Channel not found for birthday messages");

    for (const b of todaysBirthdays) {
        await channel.send(`🥳 Happy Birthday, **${b.name}**! 🎂🎉`);
    }
}

// ------------------ BOT EVENTS ------------------
client.on("clientReady", () => {
    console.log('Bot is online and ready!');
    schedulePracticeReminders();
    scheduleBirthdayMessages();
});

// ------------------ MESSAGE COMMANDS ------------------
client.on("messageCreate", async (message) => {
    if (message.channel.type !== 0 || message.author.bot) return;

    if (message.channel.name === testing_channel_name || message.channel.name === cpatains_channel_name) {

        if (message.content.toLowerCase() === 'help') {
            await message.reply(`
The commands you can use are:
- **bot_cancel_practice** (View and toggle the next 6 practices on/off)
- **bot_change_channel_path** (Change the channel names where the bot sends messages)`);
        }

        else if (message.content === 'bot_cancel_practice') {
            cancelling_next_practice = true;
            selectedPracticeIndex = null;

            const practices = getNextPractices(6);
            let menu = "Upcoming practices:\n";
            practices.forEach((d, i) => {
                const dateStr = formatDate(d);
                const day = d.toLocaleDateString('en-US', { weekday: 'long' });
                const status = skippedReminders.has(dateStr) ? "❌ Cancelled" : "✅ Active";
                menu += `${i + 1}. ${day} (${dateStr}) — ${status}\n`;
            });
            menu += "\nReply with the number of the practice you want to toggle, or anything else to cancel.";
            await message.reply(menu);
        }

        else if (cancelling_next_practice && selectedPracticeIndex === null) {
            const choice = parseInt(message.content.trim(), 10);
            const practices = getNextPractices(6);

            if (!isNaN(choice) && choice >= 1 && choice <= practices.length) {
                selectedPracticeIndex = choice - 1;
                const date = practices[selectedPracticeIndex];
                const dateStr = formatDate(date);
                const day = date.toLocaleDateString('en-US', { weekday: 'long' });
                const isCancelled = skippedReminders.has(dateStr);

                await message.reply(
                    `${day} (${dateStr}) is currently ${isCancelled ? "❌ Cancelled" : "✅ Active"}.\n` +
                    `Reply with "toggle" to change its state, or anything else to cancel.`
                );
            } else {
                cancelling_next_practice = false;
                await message.reply("❌ Cancelled practice menu.");
            }
        }

        else if (cancelling_next_practice && selectedPracticeIndex !== null) {
            const input = message.content.trim().toLowerCase();
            const practices = getNextPractices(6);
            const date = practices[selectedPracticeIndex];
            const dateStr = formatDate(date);
            const day = date.toLocaleDateString('en-US', { weekday: 'long' });

            if (input === "toggle") {
                if (skippedReminders.has(dateStr)) {
                    skippedReminders.delete(dateStr);
                    await message.reply(`✅ ${day} (${dateStr}) practice reminder has been re-enabled.`);
                } else {
                    skippedReminders.add(dateStr);
                    await message.reply(`❌ ${day} (${dateStr}) practice reminder has been cancelled.`);
                }
            } else {
                await message.reply("❌ Cancelled without changes.");
            }

            cancelling_next_practice = false;
            selectedPracticeIndex = null;
        }

        else if (message.content === 'bot_change_channel_path') {
            editing_channel_path = true;
            selected_channel_index = null;

            await message.reply(
                `Editing bot channel paths:\n` +
                `1. general_channel_name = ${general_channel_name}\n` +
                `2. testing_channel_name = ${testing_channel_name}\n` +
                `3. captains_channel_name = ${testing_channel_name}\n\n` +

                `Reply with **1**, **2** or **3** to edit the corresponding channel name, or anything else to cancel.`
            );
        }

        else if (editing_channel_path && selected_channel_index === null) {
            const input = message.content.trim();
            if (['1', '2', '3'].includes(input)) {
                selected_channel_index = parseInt(input);
                await message.reply('Please enter the **new channel name** for this option.');
            } else {
                editing_channel_path = false;
                await message.reply('Channel path edit cancelled.');
            }
        }

        else if (editing_channel_path && selected_channel_index !== null) {
            const newChannelName = message.content.trim();

            switch (selected_channel_index) {
                case 1:
                    general_channel_name = newChannelName;
                    break;
                case 2:
                    testing_channel_name = newChannelName;
                    break;
                case 3:
                    cpatains_channel_name = newChannelName;
            }

            await message.reply(`✅ Channel path updated for option ${selected_channel_index}: now set to **${newChannelName}**.`);

            editing_channel_path = false;
            selected_channel_index = null;
        }
    }
});

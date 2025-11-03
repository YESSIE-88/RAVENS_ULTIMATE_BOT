const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone'); // ✅ helps keep Toronto time consistent

// ------------------ CLIENT ------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Bot logged in successfully!'))
    .catch(err => console.error('❌ Error logging in:', err));

// ------------------ CONFIG ------------------
let testing = false;
let editing_channel_path = false;
let selected_channel_index = null;
let cancelling_next_practice = false;
let selectedPracticeIndex = null;

let general_channel_name = 'general';
let testing_channel_name = 'botbotbot1';
let bot_commands_channel_name = 'bot-commands';

const skippedReminders = new Set();
// const practiceDays = [2, 3, 5]; // Tuesday, Wednesday + Friday
const practiceDays = [1, 3]; // Monday + Wednesday

// ------------------ BIRTHDAYS ------------------
let birthdays = [];
try {
    const filePath = path.join(__dirname, 'birthdays.json');
    const data = fs.readFileSync(filePath, 'utf8');
    birthdays = JSON.parse(data);
    console.log(`📦 Loaded ${birthdays.length} birthdays from birthdays.json`);
} catch (err) {
    console.error('❌ Error loading birthdays.json:', err);
    birthdays = [];
}
const validBirthdays = birthdays.filter(b => b.birthday);

// ------------------ HELPERS ------------------
function formatDate(date) {
    return moment(date).tz("America/Toronto").format("YYYY-MM-DD");
}

function getNextPractices(n = 6) {
    const now = moment().tz("America/Toronto").startOf('day');
    const list = [];

    let d = now.clone();
    while (list.length < n) {
        if (practiceDays.includes(d.day())) {
            if (d.isSame(now, 'day')) {
                const currentHour = moment().tz("America/Toronto").hour();
                if (currentHour < 7) list.push(d.clone().toDate());
            } else {
                list.push(d.clone().toDate());
            }
        }
        d.add(1, 'day');
    }
    console.log(`📅 Next ${n} practices calculated:`, list.map(d => formatDate(d)));
    return list;
}

function checkBirthdaysToday() {
    const today = moment().tz("America/Toronto");
    const day = today.format('DD');
    const month = today.format('MM');

    const todaysBirthdays = validBirthdays.filter(b => {
        const parts = b.birthday.split('-');
        if (parts.length !== 3) {
            console.warn(`⚠️ Invalid birthday format for ${b.name}: ${b.birthday}`);
            return false;
        }
        return parts[0] === day && parts[1] === month;
    });

    console.log(`🎂 Today in Toronto: ${today.format('DD-MM')}. Found ${todaysBirthdays.length} birthday(s).`);
    return todaysBirthdays;
}

function getChannelByName(name) {
    console.log(`🔎 Looking for channel "${name}" in all guilds...`);
    for (const [, guild] of client.guilds.cache) {
        const channel = guild.channels.cache.find(ch => ch.name === name && ch.type === 0);
        if (channel) {
            console.log(`✅ Found channel "${name}" in guild "${guild.name}"`);
            return channel;
        }
    }
    console.warn(`❌ Channel "${name}" not found in any guild`);
    return null;
}

// ------------------ REMINDERS ------------------
function sendPracticeReminder() {
    const nowToronto = moment().tz("America/Toronto");
    console.log("====================================================");
    console.log("📢 [sendPracticeReminder] Triggered at:", nowToronto.format());
    console.log("====================================================");

    const tomorrow = nowToronto.clone().add(1, 'day').startOf('day');
    const tomorrowStr = tomorrow.format("YYYY-MM-DD");
    const tomorrowDay = tomorrow.day();
    const tomorrowName = tomorrow.format("dddd");

    console.log(`🗓 Tomorrow: ${tomorrowName} (${tomorrowStr})`);

    if (!practiceDays.includes(tomorrowDay)) {
        console.log(`🚫 Tomorrow (${tomorrowName}) is NOT a practice day.`);
        return;
    }

    if (skippedReminders.has(tomorrowStr)) {
        console.log(`🚫 Reminder for ${tomorrowStr} is cancelled.`);
        return;
    }

    const channelName = testing ? testing_channel_name : general_channel_name;
    const channel = getChannelByName(channelName);
    if (!channel) return console.error(`❌ Channel "${channelName}" not found.`);

    const message = `⏰ Reminder: Practice tomorrow morning at 7 AM!`;
    channel.send(message)
        .then(() => console.log(`✅ Sent reminder to #${channel.name} at ${nowToronto.format('HH:mm:ss')}`))
        .catch(err => console.error("❌ Error sending reminder:", err));
}

function sendBirthdayMessages() {
    const todaysBirthdays = checkBirthdaysToday();
    if (todaysBirthdays.length === 0) {
        console.log("🎉 No birthdays today.");
        return;
    }

    const channelName = testing ? testing_channel_name : general_channel_name;
    const channel = getChannelByName(channelName);
    if (!channel) return console.error("❌ Channel not found!");

    todaysBirthdays.forEach((b, i) => {
        channel.send(`🥳 Happy Birthday, **${b.name}**! 🎂🎉`)
            .then(() => console.log(`✅ [${i + 1}/${todaysBirthdays.length}] Sent to ${b.name}`))
            .catch(err => console.error(`❌ Failed to send to ${b.name}:`, err));
    });
}

// ------------------ CRON SCHEDULER ------------------
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log("🕒 All scheduled times are in America/Toronto timezone (DST-safe).");

    // 🎂 Birthday cron: midnight Toronto time
    cron.schedule('0 0 * * *', () => {
        console.log("🎂 Birthday cron triggered (Toronto time).");
        sendBirthdayMessages();
    }, {
        timezone: "America/Toronto"
    });

    // 🏋️ Practice reminder cron: 7:00 PM Toronto time
    cron.schedule('0 19 * * *', () => {
        console.log("⏰ Practice reminder cron triggered (Toronto time).");
        sendPracticeReminder();
    }, {
        timezone: "America/Toronto"
    });
});

// ------------------ MESSAGE COMMANDS ------------------
client.on("messageCreate", async (message) => {
    if (message.channel.type !== 0 || message.author.bot) return;

    if ([testing_channel_name, bot_commands_channel_name].includes(message.channel.name)) {
        console.log(`📨 Received message in monitored channel: ${message.content}`);


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
                `3. bot_commands_channel_name = ${bot_commands_channel_name}\n\n` +
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
                case 1: general_channel_name = newChannelName; break;
                case 2: testing_channel_name = newChannelName; break;
                case 3: bot_commands_channel_name = newChannelName; break;
            }
            await message.reply(`✅ Channel path updated for option ${selectedChannelIndex}: now set to **${newChannelName}**.`);
            editing_channel_path = false;
            selected_channel_index = null;
        }
    }
});

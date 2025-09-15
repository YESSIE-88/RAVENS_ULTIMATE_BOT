const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron'); // <--- cron scheduler

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

const skippedReminders = new Set(); // YYYY-MM-DD strings
const practiceDays = [2, 3, 5]; // Tue, Wed, Fri

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
    console.log(`📅 Next ${n} practices calculated:`, list.map(d => formatDate(d)));
    return list;
}

function checkBirthdaysToday() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');   // "01".."31"
    const month = String(today.getMonth() + 1).padStart(2, '0'); // "01".."12"

    const todaysBirthdays = validBirthdays.filter(b => {
        const parts = b.birthday.split('-'); // dd-mm-yyyy
        if (parts.length !== 3) {
            console.warn(`⚠️ Invalid birthday format for ${b.name}: ${b.birthday}`);
            return false;
        }
        const bDay = parts[0];
        const bMonth = parts[1];
        return bDay === day && bMonth === month;
    });

    console.log(`🎂 Today is ${day}-${month}. Found ${todaysBirthdays.length} birthday(s).`);
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
    console.log("⏰ Preparing to send practice reminder...");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

    if (!practiceDays.includes(tomorrow.getDay())) {
        console.log("⏱ No practice tomorrow. Skipping reminder.");
        return;
    }
    if (skippedReminders.has(tomorrowStr)) {
        console.log(`⏱ Practice reminder for ${tomorrowStr} skipped due to cancellation.`);
        return;
    }

    const channel = getChannelByName(general_channel_name);
    if (!channel) {
        console.error("❌ Channel not found for practice reminder.");
        return;
    }

    channel.send("⏰ Reminder: Practice tomorrow morning at 7 AM!")
        .then(() => console.log(`✅ Practice reminder sent to #${channel.name}`))
        .catch(err => console.error("❌ Error sending practice reminder:", err));
}

function sendBirthdayMessages() {
    const todaysBirthdays = checkBirthdaysToday();

    if (todaysBirthdays.length === 0) {
        console.log("🎉 No birthdays today.");
        return;
    }

    const channelName = testing ? testing_channel_name : general_channel_name;
    const channel = getChannelByName(channelName);
    if (!channel) {
        console.error("❌ Channel not found! Birthday messages will not be sent.");
        return;
    }

    console.log(`🎉 Sending birthday messages to channel "${channelName}"...`);
    todaysBirthdays.forEach((b, idx) => {
        channel.send(`🥳 Happy Birthday, **${b.name}**! 🎂🎉`)
            .then(() => console.log(`✅ [${idx + 1}/${todaysBirthdays.length}] Sent birthday message to ${b.name}`))
            .catch(err => console.error(`❌ [${idx + 1}/${todaysBirthdays.length}] Failed to send birthday message to ${b.name}:`, err));
    });
}

// ------------------ CRON SCHEDULER ------------------
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Birthday cron (runs daily at Midnight)
    cron.schedule('0 0 * * *', () => {
        console.log("🎂 Cron job triggered for birthday messages.");
        sendBirthdayMessages();
    }, {
        timezone: "America/New_York" // adjust as needed
    });

    // Practice reminder cron (runs daily at 7:00 PM)
    cron.schedule('0 19 * * *', () => {
        console.log("⏰ Cron job triggered for practice reminder.");
        sendPracticeReminder();
    }, {
        timezone: "America/New_York"
    });
});

// ------------------ MESSAGE COMMANDS ------------------
// (Keep your existing messageCreate handler unchanged)
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

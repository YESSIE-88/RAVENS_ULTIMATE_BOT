const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone'); // helps keep Toronto time consistent

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
    .then(() => console.log('[SUCCESS] Bot logged in successfully!'))
    .catch(err => console.error('[ERROR] Error logging in:', err));

// ------------------ CONFIG ------------------
let testing = false;
let cancelling_next_practice = false;
let selectedPracticeIndex = null;

// Static Channel IDs (Replace these placeholder strings with your actual Discord Channel IDs)
const GENERAL_CHANNEL_ID = '1386131006138089656';
const TESTING_CHANNEL_ID = '1320500533722611824';
const BOT_COMMANDS_CHANNEL_ID = '1416119232642683021';

const skippedReminders = new Set();

// Day mapping: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
const practiceSchedule = {
    2: { time: '6:00 AM', location: 'TAAG' },        // Tuesday
    3: { time: '6:00 AM', location: 'TAAG' },        // Wednesday
    5: { time: '6:00 AM', location: 'Ravens Nest' }, // Friday
};

// ------------------ BIRTHDAYS ------------------
let birthdays = [];
try {
    const filePath = path.join(__dirname, 'birthdays.json');
    const data = fs.readFileSync(filePath, 'utf8');
    birthdays = JSON.parse(data);
    console.log(`[INFO] Loaded ${birthdays.length} birthdays from birthdays.json`);
} catch (err) {
    console.error('[ERROR] Error loading birthdays.json:', err);
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
        if (d.day() in practiceSchedule) {
            if (d.isSame(now, 'day')) {
                const currentHour = moment().tz("America/Toronto").hour();
                if (currentHour < 7) list.push(d.clone().toDate());
            } else {
                list.push(d.clone().toDate());
            }
        }
        d.add(1, 'day');
    }
    console.log(`[SCHEDULE] Next ${n} practices calculated:`, list.map(d => formatDate(d)));
    return list;
}

function checkBirthdaysToday() {
    const today = moment().tz("America/Toronto");
    const day = today.format('DD');
    const month = today.format('MM');

    const todaysBirthdays = validBirthdays.filter(b => {
        const parts = b.birthday.split('-');
        if (parts.length !== 3) {
            console.warn(`[WARN] Invalid birthday format for ${b.name}: ${b.birthday}`);
            return false;
        }
        return parts[0] === day && parts[1] === month;
    });

    console.log(`[BIRTHDAYS] Today in Toronto: ${today.format('DD-MM')}. Found ${todaysBirthdays.length} birthday(s).`);
    return todaysBirthdays;
}

// ------------------ REMINDERS ------------------
async function sendPracticeReminder() {
    const nowToronto = moment().tz("America/Toronto");
    console.log("====================================================");
    console.log("[PRACTICE REMINDER] Triggered at:", nowToronto.format());
    console.log("====================================================");

    const tomorrow = nowToronto.clone().add(1, 'day').startOf('day');
    const tomorrowStr = tomorrow.format("YYYY-MM-DD");
    const tomorrowDay = tomorrow.day();
    const tomorrowName = tomorrow.format("dddd");

    console.log(`[INFO] Tomorrow: ${tomorrowName} (${tomorrowStr})`);

    if (!(tomorrowDay in practiceSchedule)) {
        console.log(`[SKIP] Tomorrow (${tomorrowName}) is NOT a practice day.`);
        return;
    }

    if (skippedReminders.has(tomorrowStr)) {
        console.log(`[SKIP] Reminder for ${tomorrowStr} is cancelled.`);
        return;
    }

    const channelId = testing ? TESTING_CHANNEL_ID : GENERAL_CHANNEL_ID;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return console.error(`[ERROR] Channel ID "${channelId}" not found.`);

        const practice = practiceSchedule[tomorrowDay];
        const message = `⏰ Reminder: Practice tomorrow at **${practice.time}** at **${practice.location}**!`;
        
        await channel.send(message);
        console.log(`[SUCCESS] Sent practice reminder to channel ${channelId} at ${nowToronto.format('HH:mm:ss')}`);
    } catch (err) {
        console.error(`[ERROR] Error fetching/sending to channel ${channelId}:`, err);
    }
}

async function sendBirthdayMessages() {
    const todaysBirthdays = checkBirthdaysToday();
    if (todaysBirthdays.length === 0) {
        console.log("[INFO] No birthdays today.");
        return;
    }

    const channelId = testing ? TESTING_CHANNEL_ID : GENERAL_CHANNEL_ID;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return console.error(`[ERROR] Channel ID "${channelId}" not found.`);

        for (const [i, b] of todaysBirthdays.entries()) {
            try {
                await channel.send(`🥳 Happy Birthday, **${b.name}**! 🎂🎉`);
                console.log(`[SUCCESS] [${i + 1}/${todaysBirthdays.length}] Sent birthday message to ${b.name}`);
            } catch (err) {
                console.error(`[ERROR] Failed to send birthday message to ${b.name}:`, err);
            }
        }
    } catch (err) {
        console.error(`[ERROR] Error fetching channel ${channelId}:`, err);
    }
}

// ------------------ CRON SCHEDULER ------------------
client.once(Events.ClientReady, () => {
    console.log(`[SUCCESS] Logged in as ${client.user.tag}`);
    console.log("[INFO] All scheduled times are in America/Toronto timezone (DST-safe).");

    // Birthday cron: midnight Toronto time
    cron.schedule('0 0 * * *', () => {
        console.log("[CRON] Birthday cron triggered (Toronto time).");
        sendBirthdayMessages();
    }, {
        timezone: "America/Toronto"
    });

    // Practice reminder cron: 7:00 PM Toronto time
    cron.schedule('0 19 * * *', () => {
        console.log("[CRON] Practice reminder cron triggered (Toronto time).");
        sendPracticeReminder();
    }, {
        timezone: "America/Toronto"
    });
});

// ------------------ MESSAGE COMMANDS ------------------
client.on("messageCreate", async (message) => {
    if (message.channel.type !== 0 || message.author.bot) return;

    // Monitor specific channels by ID
    if ([TESTING_CHANNEL_ID, BOT_COMMANDS_CHANNEL_ID].includes(message.channel.id)) {
        console.log(`[MESSAGE] Received message in monitored channel: ${message.content}`);

        if (message.content.toLowerCase() === 'help') {
            await message.reply(`
The commands you can use are:
- **bot_cancel_practice** (View and toggle the next 6 practices on/off)`);
        }

        else if (message.content === 'bot_cancel_practice') {
            cancelling_next_practice = true;
            selectedPracticeIndex = null;

            const practices = getNextPractices(6);
            let menu = "Upcoming practices:\n";
            practices.forEach((d, i) => {
                const dateStr = formatDate(d);
                const day = d.toLocaleDateString('en-US', { weekday: 'long' });
                const practice = practiceSchedule[d.getDay()];
                const status = skippedReminders.has(dateStr) ? "❌ Cancelled" : "✅ Active";
                menu += `${i + 1}. ${day} (${dateStr}) @ **${practice.time}** (${practice.location}) — ${status}\n`;
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
                const practice = practiceSchedule[date.getDay()];
                const isCancelled = skippedReminders.has(dateStr);

                await message.reply(
                    `${day} (${dateStr}) @ **${practice.time}** (${practice.location}) is currently ${isCancelled ? "❌ Cancelled" : "✅ Active"}.\n` +
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
    }
});
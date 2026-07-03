// bot.js - ZUKO XMD — QUANTUM LINK EDITION
// =============================================

require('dotenv').config();
require('./setting/config');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const axios = require('axios');
const { BOT_TOKEN } = require('./empirestore/token');
const { autoLoadPairs } = require('./autoload');

// IMPORTANT: pair.js exports startpairing directly (module.exports = startpairing)
// So we require it directly as a function, not as an object with a .startpairing property
const startpairing = require('./pair');

// ========================
// INITIALIZATION
// ========================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ========================
// FILE PATHS
// ========================
const DATA_DIR = path.join(__dirname, 'empirestore');
const adminFilePath = path.join(DATA_DIR, 'admin.json');
const userFilePath = path.join(DATA_DIR, 'users.json');
const userStatsPath = path.join(DATA_DIR, 'user_stats.json');
const welcomeSettingsPath = path.join(DATA_DIR, 'welcome_settings.json');
const goodbyeSettingsPath = path.join(DATA_DIR, 'goodbye_settings.json');

// ========================
// DATA STORAGE
// ========================
let adminIDs = [];
let userIDs = new Set();
let userStats = {};
let welcomeSettings = {};
let goodbyeSettings = {};

// Command cooldowns
const cooldowns = new Map();

// ========================
// ZUKO XMD — AURORA GRID DESIGN SYSTEM
// ========================
const ZUKO = {
    footer: '◇ ZUKO·XMD — uplink stable ◇',
    rule:   '┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈',
    pulse:  '◆',
    node:   '◈',
    sub:    '∙',
    arrow:  '↳',
    badge:  '◈',
};

// Wraps a title in the Aurora Grid bracket motif, e.g. ⟦ TITLE ⟧
const wrapTitle = (title) => `${ZUKO.pulse} \`⟦ ${title} ⟧\``;

// ========================
// SOCIAL LINKS
// ========================
const SOCIAL_LINKS = {
    whatsapp: 'https://whatsapp.com/channel/0029VbBWaQyCxoAx2YLzfu0a',
    channel1: 'https://t.me/zuko_xmd1',
    channel2: 'https://t.me/zuko_xmd3',
    channel3: 'https://t.me/zuko_xmd4',
    channel4: 'https://t.me/zukomd_mini',
    group1: 'https://t.me/ZUKO_XMD',
    group2: 'https://t.me/zukky445',
    channel5: 'https://t.me/zukoxmd',
    developer: 'https://t.me/Zukomd_support'
};

// ========================
// IMAGE URLS
// ========================
const BANNER_URL ='https://cdn.tmp.malvryx.dev/files/mxv_39ySA4EXu.jpeg';
const LOGO_URL = BANNER_URL;

// ========================
// AUTHORIZATION SETTINGS
// ========================
const REQUIRE_MEMBERSHIP = true;
const REQUIRED_GROUP = '@ZUKO_XMD';
const REQUIRED_GROUPS = ['@ZUKO_XMD', '@zukky445'];
const REQUIRED_CHANNELS = [
    { link: '@zuko_xmd1', name: '› ZUKO XMD MAIN' },
    { link: '@zuko_xmd3', name: '› ZUKO XMD 3' },
    { link: '@zuko_xmd4', name: '› ZUKO XMD 4' },
    { link: '@zukomd_mini', name: '› ZUKO XMD MINI' },
    { link: '@zukoxmd', name: '› ZUKO XMD OFFICIAL' }
];

// ========================
// HELPER FUNCTIONS
// ========================
const exists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ensureDirectoryExists = async (dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
};

function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
}

const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

// ========================
// DATA LOAD/SAVE FUNCTIONS
// ========================
const loadAdminIDs = async () => {
    const ownerID = '8443455820';
    const defaultAdmins = [ownerID];

    await ensureDirectoryExists(DATA_DIR);

    if (!(await exists(adminFilePath))) {
        await fs.writeFile(adminFilePath, JSON.stringify(defaultAdmins, null, 2));
        adminIDs = defaultAdmins;
        console.log(chalk.green('✓ Created admin.json'));
    } else {
        try {
            const raw = await fs.readFile(adminFilePath, 'utf8');
            adminIDs = JSON.parse(raw);
            if (!Array.isArray(adminIDs)) adminIDs = defaultAdmins;
        } catch (err) {
            console.error(chalk.red('✗ Error loading admin.json:'), err);
            adminIDs = defaultAdmins;
        }
    }
    console.log(chalk.cyan(`📥 Loaded ${adminIDs.length} admin(s)`));
};

const loadUserIDs = async () => {
    if (await exists(userFilePath)) {
        try {
            const raw = await fs.readFile(userFilePath, 'utf8');
            const users = JSON.parse(raw);
            userIDs = new Set(Array.isArray(users) ? users : []);
            console.log(chalk.cyan(`📥 Loaded ${userIDs.size} user(s)`));
        } catch (err) {
            console.error(chalk.red('✗ Error loading users.json:'), err);
            userIDs = new Set();
        }
    }
};

const saveUserIDs = async () => {
    try {
        await fs.writeFile(userFilePath, JSON.stringify([...userIDs], null, 2));
    } catch (err) {
        console.error(chalk.red('✗ Error saving users.json:'), err);
    }
};

const loadUserStats = async () => {
    if (await exists(userStatsPath)) {
        try {
            const raw = await fs.readFile(userStatsPath, 'utf8');
            userStats = JSON.parse(raw);
        } catch (err) {
            userStats = {};
        }
    }
};

const saveUserStats = async () => {
    try {
        await fs.writeFile(userStatsPath, JSON.stringify(userStats, null, 2));
    } catch (err) {
        console.error(chalk.red('Error saving user stats:'), err);
    }
};

const loadWelcomeSettings = async () => {
    if (await exists(welcomeSettingsPath)) {
        try {
            const raw = await fs.readFile(welcomeSettingsPath, 'utf8');
            welcomeSettings = JSON.parse(raw);
        } catch (err) {
            welcomeSettings = {};
        }
    }
};

const saveWelcomeSettings = async () => {
    try {
        await fs.writeFile(welcomeSettingsPath, JSON.stringify(welcomeSettings, null, 2));
    } catch (err) {
        console.error(chalk.red('Error saving welcome settings:'), err);
    }
};

const loadGoodbyeSettings = async () => {
    if (await exists(goodbyeSettingsPath)) {
        try {
            const raw = await fs.readFile(goodbyeSettingsPath, 'utf8');
            goodbyeSettings = JSON.parse(raw);
        } catch (err) {
            goodbyeSettings = {};
        }
    }
};

const saveGoodbyeSettings = async () => {
    try {
        await fs.writeFile(goodbyeSettingsPath, JSON.stringify(goodbyeSettings, null, 2));
    } catch (err) {
        console.error(chalk.red('Error saving goodbye settings:'), err);
    }
};

// ========================
// USER TRACKING
// ========================
const trackUser = async (userId) => {
    const userIdStr = userId.toString();
    if (!userIDs.has(userIdStr)) {
        userIDs.add(userIdStr);
        await saveUserIDs();
        console.log(chalk.green(`✓ New user: ${userIdStr}`));
    }
};

const updateUserStats = async (userId, command) => {
    const userIdStr = userId.toString();
    if (!userStats[userIdStr]) {
        userStats[userIdStr] = { totalCommands: 0, lastSeen: Date.now(), commands: {} };
    }
    userStats[userIdStr].totalCommands++;
    userStats[userIdStr].lastSeen = Date.now();
    userStats[userIdStr].commands[command] = (userStats[userIdStr].commands[command] || 0) + 1;
    await saveUserStats();
};

// ========================
// MEMBERSHIP CHECK
// ========================
const checkMembership = async (userId) => {
    if (!REQUIRE_MEMBERSHIP) {
        return {
            hasJoinedGroup: true,
            hasJoinedAllChannels: true,
            hasJoinedAll: true,
            missingChannels: []
        };
    }
    
    try {
        const groupChecks = await Promise.all(
            REQUIRED_GROUPS.map(g => bot.getChatMember(g, userId).catch(() => null))
        );

        const channelChecks = await Promise.all(
            REQUIRED_CHANNELS.map(channel => 
                bot.getChatMember(channel.link, userId).catch(() => null)
            )
        );

        const validStatuses = ['member', 'administrator', 'creator'];
        const hasJoinedGroup = groupChecks.every(m => m && validStatuses.includes(m.status));
        const hasJoinedAllChannels = channelChecks.every(member => member && validStatuses.includes(member.status));

        return {
            hasJoinedGroup,
            hasJoinedAllChannels,
            hasJoinedAll: hasJoinedGroup && hasJoinedAllChannels,
            missingChannels: REQUIRED_CHANNELS.filter((_, idx) => !channelChecks[idx])
        };
    } catch (error) {
        console.error(chalk.red('Membership check error:'), error.message);
        return {
            hasJoinedGroup: false,
            hasJoinedAllChannels: false,
            hasJoinedAll: false,
            missingChannels: REQUIRED_CHANNELS
        };
    }
};

// ========================
// UI HELPERS
// ========================
const sendStyledMessage = async (chatId, title, content, buttons = null) => {
    const styledText =
`${wrapTitle(title)}
${ZUKO.rule}
${content}
${ZUKO.rule}
\`${ZUKO.footer}\``;

    const options = {
        caption: styledText,
        parse_mode: 'Markdown'
    };
    
    if (buttons) {
        options.reply_markup = { inline_keyboard: buttons };
    }
    
    return bot.sendPhoto(chatId, BANNER_URL, options);
};

const sendJoinRequirement = async (chatId) => {
    const content = `  ⛔ *ACCESS RESTRICTED*

  ${ZUKO.arrow} Join all channels & groups below
  ${ZUKO.arrow} Then tap *🔓 VERIFY ACCESS*

  📡 *CHANNELS REQUIRED*
  ${ZUKO.node} ZUKO XMD MAIN
  ${ZUKO.node} ZUKO XMD 3
  ${ZUKO.node} ZUKO XMD 4
  ${ZUKO.node} ZUKO XMD MINI
  ${ZUKO.node} ZUKO XMD OFFICIAL

  🛰️ *GROUPS REQUIRED*
  ${ZUKO.node} ZUKO XMD GROUP
  ${ZUKO.node} ZUKO XMD GROUP`;

    const keyboard = [
        [{ text: '📡 ZUKO XMD MAIN', url: SOCIAL_LINKS.channel1 }, { text: '📡 CHANNEL 3', url: SOCIAL_LINKS.channel2 }],
        [{ text: '📡 CHANNEL 4', url: SOCIAL_LINKS.channel3 }, { text: '📡 MINI', url: SOCIAL_LINKS.channel4 }],
        [{ text: '📡 ZUKO XMD CHANNEL', url: SOCIAL_LINKS.channel5 }],
        [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO XMD GROUP', url: SOCIAL_LINKS.group2 }],
        [{ text: '🔓 VERIFY ACCESS', callback_data: 'check_membership' }]
    ];
    
    return sendStyledMessage(chatId, 'ACCESS REQUIRED', content, keyboard);
};

// ========================
// MIDDLEWARE
// ========================
const withCooldown = (command, seconds = 3) => {
    return (handler) => {
        return async (msg, match) => {
            const userId = msg.from.id;
            const key = `${userId}_${command}`;
            const now = Date.now();
            const cooldown = cooldowns.get(key);
            
            if (cooldown && now - cooldown < seconds * 1000) {
                const remaining = Math.ceil((seconds * 1000 - (now - cooldown)) / 1000);
                const content = `  ⏳ *Slow down!*  Wait ${remaining}s before using this again.`;
                return sendStyledMessage(msg.chat.id, 'COOLDOWN', content);
            }
            
            cooldowns.set(key, now);
            return handler(msg, match);
        };
    };
};

const requireMembership = (handler) => {
    return async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const command = msg.text?.split(' ')[0]?.replace('/', '') || 'unknown';

        await trackUser(userId);
        await updateUserStats(userId, command);

        if (!REQUIRE_MEMBERSHIP) {
            return handler(msg, match);
        }

        if (adminIDs.includes(userId.toString())) {
            return handler(msg, match);
        }

        const membership = await checkMembership(userId);
        
        if (!membership.hasJoinedAll) {
            return sendJoinRequirement(chatId);
        }

        return handler(msg, match);
    };
};

// ========================
// COMMAND HANDLERS
// ========================

// Start command
bot.onText(/\/start/, requireMembership(async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;
    
    const content = `  👤 *Hey, ${firstName}!*
  Welcome to *ZUKO XMD* — next-gen WhatsApp automation.

  🔗 *PAIRING*
  ${ZUKO.node} /pair \`number\` — Connect WhatsApp
  ${ZUKO.node} /delpair \`number\` — Remove device
  ${ZUKO.node} /listpair confirm — View devices

  📈 *UTILITIES*
  ${ZUKO.node} /ping — Latency check
  ${ZUKO.node} /runtime — Bot uptime
  ${ZUKO.node} /profile — Your stats
  ${ZUKO.node} /leaderboard — Top users

  🧩 *GROUP TOOLS*
  ${ZUKO.node} /welcome — Welcome messages
  ${ZUKO.node} /goodbye — Goodbye messages
  ${ZUKO.node} /report \`msg\` — Report issue`;

    const keyboard = [
        [{ text: '📡 MAIN CHANNEL', url: SOCIAL_LINKS.channel1 }, { text: '📡 ZUKO CHANNEL', url: SOCIAL_LINKS.channel5 }],
        [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group2 }],
        [{ text: '🧭 HELP', callback_data: 'help_msg' }]
    ];
    
    await sendStyledMessage(chatId, `WELCOME, ${firstName.toUpperCase()}`, content, keyboard);
}));

// Help command
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    const content = `  🔗 *PAIRING*
  ${ZUKO.node} /pair \`number\` — Pair device
  ${ZUKO.node} /delpair \`number\` — Remove device
  ${ZUKO.node} /listpair confirm — List devices

  📈 *STATS & INFO*
  ${ZUKO.node} /ping — Latency check
  ${ZUKO.node} /runtime — Bot uptime
  ${ZUKO.node} /profile — Your profile
  ${ZUKO.node} /leaderboard — Top users

  🧩 *GROUP TOOLS*
  ${ZUKO.node} /welcome — Welcome messages
  ${ZUKO.node} /goodbye — Goodbye messages
  ${ZUKO.node} /report \`msg\` — Report issue`;

    const keyboard = [
        [{ text: '📡 MAIN CHANNEL', url: SOCIAL_LINKS.channel1 }, { text: '📡 ZUKO CHANNEL', url: SOCIAL_LINKS.channel5 }],
        [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group2 }],
        [{ text: '🚀 START', callback_data: 'start_bot' }]
    ];
    
    await sendStyledMessage(chatId, 'COMMAND GUIDE', content, keyboard);
});

// Ping command
bot.onText(/\/ping/, requireMembership(withCooldown('ping', 5)(async (msg) => {
    const chatId = msg.chat.id;
    const start = Date.now();
    
    const sentMsg = await bot.sendPhoto(chatId, BANNER_URL, {
        caption: `🏓 *Pinging...*`,
        parse_mode: 'Markdown'
    });
    
    const latency = Date.now() - start;
    const apiLatency = sentMsg.date - msg.date;
    
    const pingEmoji = latency < 100 ? '🟢' : latency < 200 ? '🟡' : latency < 500 ? '🟠' : '🔴';
    const pingBar   = latency < 100 ? '█████' : latency < 200 ? '████░' : latency < 500 ? '███░░' : '██░░░';
    const pingStatus = latency < 100 ? 'Excellent' : latency < 200 ? 'Good' : latency < 500 ? 'Slow' : 'Very Slow';

    const pingEdit = `${wrapTitle('PONG!')}
${ZUKO.rule}
  ${pingEmoji} *Response:* ${latency}ms  \`${pingBar}\`
  📡 *API Delay:* ${apiLatency}ms
  🎯 *Quality:* ${pingStatus}
${ZUKO.rule}
\`${ZUKO.footer}\``;

    await bot.editMessageMedia({
        type: 'photo',
        media: BANNER_URL,
        caption: pingEdit,
        parse_mode: 'Markdown'
    }, {
        chat_id: chatId,
        message_id: sentMsg.message_id
    });
})));

// Runtime command
bot.onText(/\/runtime/, requireMembership(async (msg) => {
    const chatId = msg.chat.id;
    const uptime = runtime(process.uptime());
    const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

    const content = `  🟢 *Status* — Online & Running

  ⏱  *Uptime*   ${uptime}
  💾  *Memory*   ${memory} MB
  👥  *Users*    ${formatNumber(userIDs.size)} registered`;
    
    await sendStyledMessage(chatId, 'SYSTEM STATUS', content);
}));

// Profile command
bot.onText(/\/profile/, requireMembership(async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const username = msg.from.username ? `@${msg.from.username}` : 'No username';
    
    const userStat = userStats[userId] || { totalCommands: 0, lastSeen: Date.now(), commands: {} };
    const lastSeen = new Date(userStat.lastSeen).toLocaleString();
    const commandCount = Object.keys(userStat.commands || {}).length;
    const mostUsed = Object.entries(userStat.commands || {}).sort((a,b) => b[1] - a[1])[0];
    
    const content = `  👤 *${firstName}*
  ${ZUKO.node} ID: \`${userId}\`
  ${ZUKO.node} Username: ${username}

  📈 *ACTIVITY*
  ${ZUKO.node} Total Commands  ${userStat.totalCommands}
  ${ZUKO.node} Unique Commands  ${commandCount}
  ${ZUKO.node} Most Used  ${mostUsed ? '/' + mostUsed[0] : '—'}
  ${ZUKO.node} Last Active  ${lastSeen}`;
    
    await sendStyledMessage(chatId, 'YOUR PROFILE', content);
}));

// Leaderboard command
bot.onText(/\/leaderboard/, requireMembership(async (msg) => {
    const chatId = msg.chat.id;
    
    const topUsers = Object.entries(userStats)
        .sort((a, b) => b[1].totalCommands - a[1].totalCommands)
        .slice(0, 10);
    
    if (topUsers.length === 0) {
        return sendStyledMessage(chatId, 'LEADERBOARD', '  📈 *No user data yet*');
    }
    
    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    
    for (let i = 0; i < topUsers.length; i++) {
        const [uid, stats] = topUsers[i];
        const medal = medals[i] || `${i+1}.`;
        const name = uid.slice(-6);
        leaderboardText += `  ${medal}  \`${name}\`  —  *${stats.totalCommands}* cmds\n`;
    }
    
    await sendStyledMessage(chatId, 'TOP USERS', leaderboardText);
}));

// Stats command (admin only)
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (!adminIDs.includes(userId)) {
        return sendStyledMessage(chatId, 'ADMIN ONLY', '  🔒 *Access Denied*');
    }
    
    const totalUsers = userIDs.size;
    const totalCommands = Object.values(userStats).reduce((sum, u) => sum + (u.totalCommands || 0), 0);
    const uptime = runtime(process.uptime());
    const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    
    const content = `  👥  *Users*       ${formatNumber(totalUsers)}
  🎯  *Commands*    ${formatNumber(totalCommands)}
  ⏱   *Uptime*      ${uptime}
  💾  *Memory*      ${memory} MB
  👑  *Admins*      ${adminIDs.length}`;
    
    await sendStyledMessage(chatId, 'BOT STATISTICS', content);
});

// Welcome commands
bot.onText(/\/welcome$/, requireMembership(async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (!adminIDs.includes(userId)) {
        return sendStyledMessage(chatId, 'ADMIN ONLY', '  🔒 *Access Denied*');
    }
    
    const content = `  ⚙️ *WELCOME CONFIGURATION*

  ${ZUKO.badge} /welcome on — Enable
  ${ZUKO.badge} /welcome off — Disable
  ${ZUKO.badge} /welcome set \`msg\` — Custom message

  🔤 *VARIABLES*
  ${ZUKO.badge} {name}  — Member name
  ${ZUKO.badge} {group} — Group name
  ${ZUKO.badge} {count} — Member count`;
    
    await sendStyledMessage(chatId, 'WELCOME SETTINGS', content);
}));

bot.onText(/\/welcome (on|off|set .+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const action = match[1];
    
    if (!adminIDs.includes(userId)) {
        return sendStyledMessage(chatId, 'ADMIN ONLY', '  🔒 *Access Denied*');
    }
    
    await loadWelcomeSettings();
    
    if (!welcomeSettings[chatId]) welcomeSettings[chatId] = { enabled: false, message: '' };
    
    if (action === 'on') {
        welcomeSettings[chatId].enabled = true;
        await saveWelcomeSettings();
        await sendStyledMessage(chatId, 'WELCOME', '  ✅ *WELCOME ENABLED*');
    } else if (action === 'off') {
        welcomeSettings[chatId].enabled = false;
        await saveWelcomeSettings();
        await sendStyledMessage(chatId, 'WELCOME', '  ❌ *WELCOME DISABLED*');
    } else if (action.startsWith('set')) {
        const customMsg = action.replace('set ', '');
        welcomeSettings[chatId].message = customMsg;
        welcomeSettings[chatId].enabled = true;
        await saveWelcomeSettings();
        await sendStyledMessage(chatId, 'WELCOME', `  ✅ *CUSTOM WELCOME SET*\n\n  "${customMsg}"`);
    }
}));

// Goodbye commands
bot.onText(/\/goodbye$/, requireMembership(async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (!adminIDs.includes(userId)) {
        return sendStyledMessage(chatId, 'ADMIN ONLY', '  🔒 *Access Denied*');
    }
    
    const content = `  ⚙️ *GOODBYE CONFIGURATION*

  ${ZUKO.badge} /goodbye on — Enable
  ${ZUKO.badge} /goodbye off — Disable
  ${ZUKO.badge} /goodbye set \`msg\` — Custom message

  🔤 *VARIABLES*
  ${ZUKO.badge} {name}  — Member name
  ${ZUKO.badge} {group} — Group name`;
    
    await sendStyledMessage(chatId, 'GOODBYE SETTINGS', content);
}));

bot.onText(/\/goodbye (on|off|set .+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const action = match[1];
    
    if (!adminIDs.includes(userId)) {
        return sendStyledMessage(chatId, 'ADMIN ONLY', '  🔒 *Access Denied*');
    }
    
    await loadGoodbyeSettings();
    
    if (!goodbyeSettings[chatId]) goodbyeSettings[chatId] = { enabled: false, message: '' };
    
    if (action === 'on') {
        goodbyeSettings[chatId].enabled = true;
        await saveGoodbyeSettings();
        await sendStyledMessage(chatId, 'GOODBYE', '  ✅ *GOODBYE ENABLED*');
    } else if (action === 'off') {
        goodbyeSettings[chatId].enabled = false;
        await saveGoodbyeSettings();
        await sendStyledMessage(chatId, 'GOODBYE', '  ❌ *GOODBYE DISABLED*');
    } else if (action.startsWith('set')) {
        const customMsg = action.replace('set ', '');
        goodbyeSettings[chatId].message = customMsg;
        goodbyeSettings[chatId].enabled = true;
        await saveGoodbyeSettings();
        await sendStyledMessage(chatId, 'GOODBYE', `  ✅ *CUSTOM GOODBYE SET*\n\n  "${customMsg}"`);
    }
}));

// PAIR COMMAND - THE FIXED ONE
bot.onText(/\/pair (.+)/, requireMembership(withCooldown('pair', 10)(async (msg, match) => {
    const chatId = msg.chat.id;
    const number = match[1].trim();

    try {
        if (!number || /[a-z]/i.test(number) || !/^\d{7,15}$/.test(number) || number.startsWith('0')) {
            return sendStyledMessage(chatId, 'INVALID NUMBER', '  ⚠️ *Use:* /pair 234XXXXXXXXX');
        }

        await sendStyledMessage(chatId, 'PAIRING', '  ⏳ *Processing your request...*');

        const jid = number.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        
        // DIRECT CALL - startpairing is the function itself
        await startpairing(jid);
        await sleep(4000);

        const pairingFile = path.join(DATA_DIR, 'pairing', 'pairing.json');
        
        if (!(await exists(pairingFile))) {
            return sendStyledMessage(chatId, 'PAIRING FAILED', '  ❌ *Failed to generate code*\n  Please try again.');
        }
        
        const cu = await fs.readFile(pairingFile, 'utf-8');
        const cuObj = JSON.parse(cu);

        const senderNumber = number.replace(/[^0-9]/g, '');

        await sendStyledMessage(chatId, 'PAIRING SUCCESSFUL', 
            `  ✅ *Device Linked!*\n\n  📱 Number  ${senderNumber}\n  🔐 Code    \`${cuObj.code}\`\n\n  Open WhatsApp › Linked Devices › Link a Device`);

    } catch (error) {
        console.error(chalk.red('Pair error:'), error);
        sendStyledMessage(chatId, 'PAIRING FAILED', `  ❌ *ERROR*\n\n  ${error.message || 'Please try again'}`);
    }
})));

// Delpair command
bot.onText(/\/delpair (.+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    const number = match[1].trim();

    try {
        if (!number || /[a-z]/i.test(number) || !/^\d{7,15}$/.test(number)) {
            return sendStyledMessage(chatId, 'INVALID NUMBER', '  ⚠️ *Use:* /delpair 234XXXXXXXXX');
        }

        const jidSuffix = `${number}@s.whatsapp.net`;
        const pairingPath = path.join(DATA_DIR, 'pairing');

        if (!(await exists(pairingPath))) {
            return sendStyledMessage(chatId, 'DELETE FAILED', '  ❌ *No session found*');
        }

        const entries = await fs.readdir(pairingPath, { withFileTypes: true });
        const matched = entries.find(entry => entry.isDirectory() && entry.name === jidSuffix);

        if (!matched) {
            return sendStyledMessage(chatId, 'NOT FOUND', `  ❌ *${number} is not paired*`);
        }

        const targetPath = path.join(pairingPath, matched.name);
        await fs.rm(targetPath, { recursive: true, force: true });

        await sendStyledMessage(chatId, 'DEVICE REMOVED', `  ✅ *Unlinked Successfully*\n\n  📱 ${number} has been removed.`);
        
        console.log(chalk.green(`🗑️ Deleted: ${number}`));
    } catch (err) {
        console.error(chalk.red('Delpair error:'), err);
        sendStyledMessage(chatId, 'DELETE FAILED', `  ❌ *ERROR*\n\n  ${err.message}`);
    }
}));

// Listpair command (admin only)
bot.onText(/\/listpair confirm/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (!adminIDs.includes(userId)) {
        return sendStyledMessage(chatId, 'ADMIN ONLY', '  🔒 *Access Denied*');
    }

    try {
        const pairingPath = path.join(DATA_DIR, 'pairing');
        
        if (!(await exists(pairingPath))) {
            return sendStyledMessage(chatId, 'PAIRED DEVICES', '  ❌ *No devices found*');
        }

        const entries = await fs.readdir(pairingPath, { withFileTypes: true });
        const pairedDevices = entries
            .filter(entry => entry.isDirectory() && entry.name !== 'pairing.json' && entry.name.endsWith('@s.whatsapp.net'))
            .map(entry => entry.name);

        if (pairedDevices.length === 0) {
            return sendStyledMessage(chatId, 'PAIRED DEVICES', '  ❌ *No devices found*');
        }

        let deviceList = `  📲 *${pairedDevices.length} device(s) linked*\n\n`;
        pairedDevices.forEach((device, index) => {
            const phoneNumber = device.split('@')[0];
            deviceList += `  ${ZUKO.badge} ${index + 1}. \`${phoneNumber}\`\n`;
        });

        await sendStyledMessage(chatId, 'PAIRED DEVICES', deviceList);
    } catch (err) {
        console.error(chalk.red('Listpair error:'), err);
        sendStyledMessage(chatId, 'ERROR', '  ❌ *Failed to load devices*');
    }
});

// Report command
bot.onText(/\/report (.+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username ? `@${msg.from.username}` : 'No username';
    const firstName = msg.from.first_name || 'User';
    const reportMessage = match[1].trim();

    const reportContent = `  👤 *${firstName}*
  ${ZUKO.badge} ID: \`${userId}\`
  ${ZUKO.badge} Handle: ${username}

  💬 *MESSAGE*
  ${reportMessage}`;

    let sentCount = 0;
    for (const adminId of adminIDs) {
        try {
            await sendStyledMessage(adminId, 'NEW REPORT', reportContent);
            sentCount++;
        } catch (e) {
            console.error(`Failed to send to ${adminId}:`, e.message);
        }
    }

    await sendStyledMessage(chatId, 'REPORT SENT', `  ✅ *Report delivered to ${sentCount} admin(s)*`);
}));

// ========================
// CALLBACK QUERY HANDLER
// ========================
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = msg.chat.id;
    
    await trackUser(userId);

    if (data === 'check_membership') {
        try {
            await bot.answerCallbackQuery(callbackQuery.id, { text: '🔍 Checking membership...' });

            const membership = await checkMembership(userId);

            if (membership.hasJoinedAll) {
                const content = `  ✅ *Access Granted, ${callbackQuery.from.first_name}!*

  📲 *PAIRING*
  ${ZUKO.badge} /pair \`num\` — Connect WhatsApp
  ${ZUKO.badge} /delpair \`num\` — Remove device
  ${ZUKO.badge} /listpair confirm — View devices

  📊 *MORE*
  ${ZUKO.badge} /ping  /runtime  /profile  /leaderboard`;

                const verifiedCaption = `${wrapTitle('WELCOME')}\n${ZUKO.rule}\n${content}\n${ZUKO.rule}\n\`${ZUKO.footer}\``;
                await bot.editMessageMedia({
                    type: 'photo',
                    media: BANNER_URL,
                    caption: verifiedCaption,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📡 MAIN CHANNEL', url: SOCIAL_LINKS.channel1 }, { text: '📡 ZUKO CHANNEL', url: SOCIAL_LINKS.channel5 }],
                            [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group2 }],
                            [{ text: '🧭 HELP', callback_data: 'help_msg' }]
                        ]
                    }
                });
            } else {
                const deniedCaption = `🔒 \`⟦ ACCESS DENIED ⟧\`\n${ZUKO.rule}\n  You haven't joined all required channels yet.\n  Subscribe and tap *VERIFY ACCESS* again.\n${ZUKO.rule}\n\`${ZUKO.footer}\``;
                await bot.editMessageMedia({
                    type: 'photo',
                    media: BANNER_URL,
                    caption: deniedCaption,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📡 MAIN CHANNEL', url: SOCIAL_LINKS.channel1 }, { text: '📡 CHANNEL 3', url: SOCIAL_LINKS.channel2 }],
                            [{ text: '📡 CHANNEL 4', url: SOCIAL_LINKS.channel3 }, { text: '📡 MINI', url: SOCIAL_LINKS.channel4 }],
                            [{ text: '📡 ZUKO XMD CHANNEL', url: SOCIAL_LINKS.channel5 }],
                            [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group2 }],
                            [{ text: '🔄 VERIFY AGAIN', callback_data: 'check_membership' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error(chalk.red('Callback error:'), error);
            await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error checking membership' });
        }
    } else if (data === 'start_bot') {
        await bot.answerCallbackQuery(callbackQuery.id);
        
        const cbContent = `  👤 *Hey ${callbackQuery.from.first_name}!*
  Welcome back to *ZUKO XMD*.

  📲 /pair  /delpair  /listpair
  📊 /ping  /runtime  /profile
  🏆 /leaderboard
  ⚙️ /welcome  /goodbye  /report`;
        
        await sendStyledMessage(chatId, 'WELCOME BACK', cbContent, [
            [{ text: '📡 MAIN CHANNEL', url: SOCIAL_LINKS.channel1 }, { text: '📡 ZUKO CHANNEL', url: SOCIAL_LINKS.channel5 }],
            [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group2 }],
            [{ text: '🧭 HELP', callback_data: 'help_msg' }]
        ]);
    } else if (data === 'help_msg') {
        await bot.answerCallbackQuery(callbackQuery.id);
        
        const helpContent = `  📲 *PAIRING*
  ${ZUKO.badge} /pair  /delpair  /listpair

  📊 *INFO*
  ${ZUKO.badge} /ping  /runtime  /profile
  ${ZUKO.badge} /leaderboard  /report

  ⚙️ *GROUP*
  ${ZUKO.badge} /welcome  /goodbye`;

        await sendStyledMessage(chatId, 'COMMAND GUIDE', helpContent, [
            [{ text: '🚀 START', callback_data: 'start_bot' }],
            [{ text: '📡 MAIN CHANNEL', url: SOCIAL_LINKS.channel1 }, { text: '📡 ZUKO CHANNEL', url: SOCIAL_LINKS.channel5 }],
            [{ text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group1 }, { text: '🛰️ ZUKO GROUP', url: SOCIAL_LINKS.group2 }]
        ]);
    }
});
// ========================
// GROUP EVENT HANDLERS
// ========================
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const newMember = msg.new_chat_members[0];
    
    await loadWelcomeSettings();
    
    if (welcomeSettings[chatId] && welcomeSettings[chatId].enabled) {
        let welcomeMsg = welcomeSettings[chatId].message || 'Welcome {name} to {group}! 🎉';
        welcomeMsg = welcomeMsg
            .replace('{name}', newMember.first_name)
            .replace('{group}', msg.chat.title || 'this group')
            .replace('{count}', msg.chat.members_count || '');
        
        await bot.sendPhoto(chatId, BANNER_URL, {
            caption: welcomeMsg,
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

bot.on('left_chat_member', async (msg) => {
    const chatId = msg.chat.id;
    const leftMember = msg.left_chat_member;
    
    await loadGoodbyeSettings();
    
    if (goodbyeSettings[chatId] && goodbyeSettings[chatId].enabled) {
        let goodbyeMsg = goodbyeSettings[chatId].message || 'Goodbye {name}! 😢';
        goodbyeMsg = goodbyeMsg
            .replace('{name}', leftMember.first_name)
            .replace('{group}', msg.chat.title || 'this group');
        
        await bot.sendPhoto(chatId, BANNER_URL, {
            caption: goodbyeMsg,
            parse_mode: 'Markdown'
        }).catch(() => {});
    }
});

// ========================
// UNKNOWN COMMAND HANDLER
// ========================
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) {
        const command = msg.text.split(' ')[0];
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const validCommands = [
            '/start', '/pair', '/delpair', '/listpair', '/ping', '/runtime',
            '/help', '/report', '/welcome', '/goodbye', '/stats', '/profile',
            '/leaderboard'
        ];

        if (!validCommands.includes(command)) {
            await trackUser(userId);
            
            if (!adminIDs.includes(userId.toString()) && REQUIRE_MEMBERSHIP) {
                const membership = await checkMembership(userId);
                if (!membership.hasJoinedAll) {
                    return sendJoinRequirement(chatId);
                }
            }

            sendStyledMessage(chatId, 'UNKNOWN COMMAND', '  🧭 *Unknown command*\n\n  Type /help for available commands.');
        }
    }
});

// ========================
// ERROR HANDLERS
// ========================
bot.on('polling_error', (error) => {
    console.error(chalk.red('Polling error:'), error.message);
});

bot.on('webhook_error', (error) => {
    console.error(chalk.red('Webhook error:'), error.message);
});

// ========================
// INITIALIZATION
// ========================
(async () => {
    console.log(chalk.cyan('\n◆ ⟦ ZUKO XMD INITIALIZING ⟧'));
    console.log(chalk.cyan('┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈\n'));
    
    await ensureDirectoryExists(DATA_DIR);
    await ensureDirectoryExists(path.join(DATA_DIR, 'pairing'));
    
    await loadAdminIDs();
    await loadUserIDs();
    await loadUserStats();
    await loadWelcomeSettings();
    await loadGoodbyeSettings();
    
    console.log(chalk.cyan(`
◆ ⟦ ZUKO XMD — AURORA GRID EDITION ⟧
┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈
  ◈ Status   Running
  ◈ Users    ${userIDs.size}
  ◈ Admins   ${adminIDs.length}
┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈
◇ ZUKO·XMD — uplink stable ◇
    `));
    
    console.log(chalk.green(`✓ Membership checking: ${REQUIRE_MEMBERSHIP ? 'ENABLED' : 'DISABLED'}`));
    console.log(chalk.green(`✓ Welcome/Goodbye: ENABLED`));
    console.log(chalk.green(`✓ Report system: ENABLED`));
    console.log(chalk.green(`✓ All systems ready!\n`));
    
    // Auto-load pairs
    setTimeout(async () => {
        try {
            console.log(chalk.cyan('📱 Starting auto-load of paired devices...'));
            const result = await autoLoadPairs({ batchSize: 1 });
            if (result.success) {
                console.log(chalk.green(`✓ Auto-load completed: ${result.successful}/${result.total} users connected`));
                if (result.failedUsers && result.failedUsers.length > 0) {
                    console.log(chalk.yellow(`⚠️ Failed connections: ${result.failedUsers.length}`));
                }
            } else {
                console.log(chalk.yellow(`⚠️ Auto-load skipped: ${result.message}`));
            }
        } catch (err) {
            console.error(chalk.red('✗ Auto-load pairs failed:'), err.message);
        }
    }, 8000);
})();

// ========================
// SHUTDOWN HANDLERS
// ========================
const shutdown = async () => {
    console.log(chalk.yellow('\n🛑 Shutting down ZUKO XMD...'));
    await saveUserIDs();
    await saveUserStats();
    await saveWelcomeSettings();
    await saveGoodbyeSettings();
    bot.stopPolling();
    console.log(chalk.green('✓ Data saved. Goodbye!'));
    process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
    console.error(chalk.red('Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection:'), reason);
});
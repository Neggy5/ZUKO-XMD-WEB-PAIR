// =====================================================================
// ZUKO XMD - CORE BOT (22 COMMANDS)
// =====================================================================
// Commands:
// 1. ping, 2. menu, 3. sticker, 4. play, 5. ai, 6. tts, 7. translate,
// 8. antilink, 9. antisticker, 10. antitag, 11. antiviewonce, 12. anticall,
// 13. antidelete, 14. antibot, 15. tagall, 16. groupinfo,
// 17. promote/demote/kick, 18. jail/unjail, 19. balance, 20. owner,
// 21. welcome, 22. goodbye
// =====================================================================

require('./setting/config');
const {
    default: baileys,
    getContentType,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');
const { getSetting, setSetting } = require("./setting/Settings.js");
const { toAudio, toPTT } = require('./lib/converter.js');
const { addExif } = require('./allfunc/exif.js');
const yts = require('yt-search');

// ========== GLOBALS ==========
global.packname = 'ZUKO XMD';
global.OWNER_NAME = 'ZUKO';
global.botName = 'ZUKO XMD';

// ========== NEWSLETTER CONTEXT ==========
global.newsletterJid = '120363405724402785@newsletter';
global.newsletterName = 'ZUKO XMD';

// ========== NEWSLETTER CONTEXT FUNCTION ==========
function newsletterContext(extra = {}) {
    if (!global.newsletterJid) return extra;
    return {
        ...extra,
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: global.newsletterJid,
            newsletterName: global.newsletterName || global.botName || 'ZUKO XMD',
            serverMessageId: 143
        }
    };
}

const MENU_IMAGE_PATH = './media/logo.jpg';
let menuImageBuffer = null;
try {
    if (fs.existsSync(MENU_IMAGE_PATH)) {
        menuImageBuffer = fs.readFileSync(MENU_IMAGE_PATH);
    }
} catch (e) {}
global.menuImage = menuImageBuffer || 'https://files.catbox.moe/xxrf9p.jpg';

// ========== DATABASE ==========
const dbPath = './database.json';
let db;
try {
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    db = JSON.parse(dbContent);
} catch (err) {
    db = { users: {}, groups: {}, warns: {}, economy: {}, jailed: {}, botMode: { mode: 'public', whitelist: [] } };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
if (!db.economy) db.economy = {};
if (!db.botMode) db.botMode = { mode: 'public', whitelist: [] };
if (!db.botMode.whitelist) db.botMode.whitelist = [];
if (!db.jailed) db.jailed = {};
if (!db.warns) db.warns = {};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6KF18Yd5XOi0ZztLAM6yx43_YFPEQILcQVhMRZho_qx3A';

let GoogleGenerativeAI;
try {
    const genAI = require('@google/generative-ai');
    GoogleGenerativeAI = genAI.GoogleGenerativeAI;
} catch (e) {}

// ========== HELPERS ==========
function saveDB() {
    try { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); } catch (e) {}
}

function ensureEconomy(id) {
    if (!db.economy[id]) {
        db.economy[id] = { wallet: 1000, bank: 0, lastDaily: 0, inventory: [] };
    }
    return db.economy[id];
}

function fmtCoins(n) {
    return Number(n).toLocaleString('en-US');
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ========== API HELPERS ==========
async function getEliteProTechDownload(youtubeUrl) {
    const res = await axios.get(
        `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`,
        { timeout: 60000 }
    );
    if (res?.data?.success && res?.data?.downloadURL) {
        return { download: res.data.downloadURL, title: res.data.title };
    }
    throw new Error('Failed');
}

async function getShizoDownload(youtubeUrl) {
    const res = await axios.get(
        `https://api.shizo.top/downloader/ytmp3?apikey=shizo&url=${encodeURIComponent(youtubeUrl)}`,
        { timeout: 60000 }
    );
    if (res?.data?.status && res?.data?.result?.download) {
        return { download: res.data.result.download, title: res.data.result.title };
    }
    throw new Error('Failed');
}

// ========== ANTI-LINK HANDLER ==========
async function handleAntiLink(empire, m, isCreator, isAdmins) {
    try {
        if (!m.isGroup || isCreator || isAdmins) return false;
        if (!getSetting(m.chat, 'antilink', false)) return false;
        
        let text = '';
        if (m.message?.conversation) text = m.message.conversation;
        else if (m.message?.extendedTextMessage?.text) text = m.message.extendedTextMessage.text;
        else if (m.message?.imageMessage?.caption) text = m.message.imageMessage.caption;
        else if (m.message?.videoMessage?.caption) text = m.message.videoMessage.caption;
        
        if (!text || text.trim() === '') return false;
        
        const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
        const matches = text.match(linkRegex);
        if (!matches || matches.length === 0) return false;
        
        const allowedDomains = getSetting(m.chat, 'allowedDomains', []);
        let isAllowed = false;
        if (allowedDomains.length > 0) {
            for (const link of matches) {
                try {
                    let cleanLink = link;
                    if (!cleanLink.startsWith('http://') && !cleanLink.startsWith('https://')) {
                        cleanLink = 'https://' + cleanLink;
                    }
                    const url = new URL(cleanLink);
                    const domain = url.hostname.replace(/^www\./, '').toLowerCase();
                    if (allowedDomains.some(d => domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase()))) {
                        isAllowed = true;
                        break;
                    }
                } catch (e) {}
            }
        }
        if (isAllowed) return false;
        
        const action = getSetting(m.chat, 'antilink_action', 'delete');
        
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        
        if (action === 'warn') {
            const warnKey = `${m.chat}_${m.sender}`;
            db.warns[warnKey] = (db.warns[warnKey] || 0) + 1;
            saveDB();
            const count = db.warns[warnKey];
            await empire.sendMessage(m.chat, {
                text: `⚠️ @${m.sender.split('@')[0]} links not allowed! Warning ${count}/3.`,
                mentions: [m.sender]
            }).catch(() => {});
            if (count >= 3) {
                await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                delete db.warns[warnKey];
                saveDB();
            }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
        } else {
            await empire.sendMessage(m.chat, {
                text: `🚫 @${m.sender.split('@')[0]} links are not allowed here.`,
                mentions: [m.sender]
            }).catch(() => {});
        }
        return true;
    } catch (e) { return false; }
}

// ========== ANTI-STICKER HANDLER ==========
async function handleAntiSticker(empire, m, isCreator, isAdmins) {
    try {
        if (!m.isGroup || isCreator || isAdmins || !m.message?.stickerMessage) return false;
        if (!getSetting(m.chat, 'antisticker', false)) return false;
        const action = getSetting(m.chat, 'antisticker_action', 'delete');
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        if (action === 'warn') {
            await empire.sendMessage(m.chat, { text: `⚠️ @${m.sender.split('@')[0]} stickers not allowed!`, mentions: [m.sender] });
            const k = `${m.chat}_${m.sender}`;
            db.warns[k] = (db.warns[k] || 0) + 1; saveDB();
            if (db.warns[k] >= 3) { await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); delete db.warns[k]; saveDB(); }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
        }
        return true;
    } catch { return false; }
}

// ========== ANTI-TAG HANDLER ==========
async function handleAntiTag(empire, m, isCreator, isAdmins) {
    try {
        if (!m.isGroup || isCreator || isAdmins) return false;
        if (!getSetting(m.chat, 'antitag', false)) return false;
        
        const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length === 0) return false;
        
        const botNumber = empire.user.id;
        const hasBotMention = mentions.some(jid => jid === botNumber || jid.includes(botNumber.split('@')[0]));
        const body = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const hasEveryone = /@everyone|@all|@All|@Everyone/i.test(body);
        
        if (!hasBotMention && !hasEveryone) return false;
        
        const action = getSetting(m.chat, 'antitag_action', 'delete');
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        
        if (action === 'warn') {
            await empire.sendMessage(m.chat, { text: `⚠️ @${m.sender.split('@')[0]} tagging is not allowed!`, mentions: [m.sender] });
            const k = `${m.chat}_${m.sender}`;
            db.warns[k] = (db.warns[k] || 0) + 1; saveDB();
            if (db.warns[k] >= 3) { await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); delete db.warns[k]; saveDB(); }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
        }
        return true;
    } catch (e) { return false; }
}

// ========== ANTI-VIEWONCE HANDLER ==========
async function handleAntiViewOnce(empire, m) {
    try {
        if (!m.isGroup || !getSetting(m.chat, 'antiviewonce', false)) return false;
        const msg = m.message;
        if (!msg) return false;
        const voKey = Object.keys(msg).find(k => k.startsWith('viewOnce'));
        if (!voKey) return false;
        const inner = msg[voKey]?.message;
        if (!inner) return false;
        const mediaType = Object.keys(inner).find(k => k.endsWith('Message'));
        if (!mediaType) return false;
        await empire.sendMessage(m.chat, {
            [mediaType]: inner[mediaType],
            caption: `👁️ *Anti-ViewOnce* | By @${m.sender.split('@')[0]}`,
            mentions: [m.sender]
        }, { contextInfo: newsletterContext() }).catch(() => {});
        return true;
    } catch { return false; }
}

// ========== ANTI-CALL HANDLER ==========
async function handleAntiCall(empire, callData) {
    try {
        if (!getSetting('global', 'anticall', false)) return false;
        const caller = callData.from;
        if (!caller) return false;
        await empire.rejectCall(callData.id, callData.from).catch(() => {});
        await empire.sendMessage(caller, { 
            text: `📵 *Calls are disabled.*\n\nYour call was rejected. Please use text commands.`,
            contextInfo: newsletterContext()
        }).catch(() => {});
        return true;
    } catch { return false; }
}

// ========== ANTI-DELETE STORE ==========
const antidelete = (() => {
    const messageStore = new Map();
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CONFIG_PATH = path.join(DATA_DIR, 'antidelete.json');
    const TEMP_MEDIA_DIR = path.join(process.cwd(), 'tmp');

    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
    } catch (err) {}

    function loadConfig() {
        try {
            if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
            return JSON.parse(fs.readFileSync(CONFIG_PATH));
        } catch { return { enabled: false }; }
    }

    function saveConfig(config) {
        try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (err) {}
    }

    async function storeMessage(sock, message) {
        try {
            const config = loadConfig();
            if (!config.enabled) return;
            if (!message.key?.id) return;
            const messageId = message.key.id;
            let content = '';
            const sender = message.key.participant || message.key.remoteJid || 'Unknown';
            if (message.message?.conversation) content = message.message.conversation;
            else if (message.message?.extendedTextMessage?.text) content = message.message.extendedTextMessage.text;
            else if (message.message?.imageMessage?.caption) content = message.message.imageMessage.caption;
            else if (message.message?.videoMessage?.caption) content = message.message.videoMessage.caption;
            const group = message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null;
            messageStore.set(messageId, { content, sender, group, timestamp: new Date().toISOString() });
        } catch (err) {}
    }

    async function handleRevocation(sock, revocationMessage) {
        try {
            const config = loadConfig();
            if (!config.enabled) return;
            const protocolMsg = revocationMessage.message?.protocolMessage;
            if (!protocolMsg || protocolMsg.type !== 0) return;
            const messageId = protocolMsg.key?.id;
            if (!messageId) return;
            const deletedBy = revocationMessage.participant || revocationMessage.key?.participant;
            const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            if (deletedBy === ownerNumber) return;
            const original = messageStore.get(messageId);
            if (!original) return;
            const sender = original.sender;
            const time = new Date().toLocaleString();
            let text = `🔰 *ANTIDELETE REPORT*\n\n🗑️ *Deleted By:* @${deletedBy.split('@')[0]}\n👤 *Sender:* @${sender.split('@')[0]}\n🕒 *Time:* ${time}\n`;
            if (original.content) text += `\n💬 *Message:*\n${original.content}`;
            await sock.sendMessage(ownerNumber, { 
                text, 
                mentions: [deletedBy, sender],
                contextInfo: newsletterContext()
            });
            messageStore.delete(messageId);
        } catch (err) {}
    }

    async function handleCommand(sock, chatId, message, match, isCreator) {
        if (!isCreator) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Only the bot owner can use this command.*',
                contextInfo: newsletterContext()
            }, { quoted: message });
            return;
        }
        const config = loadConfig();
        if (!match) {
            await sock.sendMessage(chatId, {
                text: `*ANTIDELETE SETUP*\n\n📊 *Status:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable`,
                contextInfo: newsletterContext()
            }, { quoted: message });
            return;
        }
        if (match === 'on') { config.enabled = true; saveConfig(config); await sock.sendMessage(chatId, { text: '*✅ Antidelete enabled*', contextInfo: newsletterContext() }, { quoted: message }); }
        else if (match === 'off') { config.enabled = false; saveConfig(config); await sock.sendMessage(chatId, { text: '*❌ Antidelete disabled*', contextInfo: newsletterContext() }, { quoted: message }); }
        else { await sock.sendMessage(chatId, { text: '*Invalid command. Use .antidelete*', contextInfo: newsletterContext() }, { quoted: message }); }
    }

    return { storeMessage, handleRevocation, handleCommand };
})();

// ========== WELCOME / GOODBYE HANDLER ==========
async function handleGroupParticipantsUpdate(empire, update, groupMetadata, botNumber) {
    try {
        const { id, participants, action } = update;
        const welcomeEnabled = getSetting(id, 'welcome', false);
        const goodbyeEnabled = getSetting(id, 'goodbye', false);

        if (action === 'add') {
            for (const p of participants) {
                if (p === botNumber) continue;
                if (welcomeEnabled) {
                    let msg = getSetting(id, 'welcomeMessage', '👋 Welcome @user to @group!');
                    msg = msg.replace('@user', `@${p.split('@')[0]}`).replace('@group', groupMetadata?.subject || 'this group');
                    await empire.sendMessage(id, { 
                        text: msg, 
                        mentions: [p],
                        contextInfo: newsletterContext()
                    });
                }
            }
        }
        if (action === 'remove' && goodbyeEnabled) {
            for (const p of participants) {
                if (p === botNumber) continue;
                let msg = getSetting(id, 'goodbyeMessage', "👋 Goodbye @user, we'll miss you!");
                msg = msg.replace('@user', `@${p.split('@')[0]}`).replace('@group', groupMetadata?.subject || 'this group');
                await empire.sendMessage(id, { 
                    text: msg, 
                    mentions: [p],
                    contextInfo: newsletterContext()
                });
            }
        }
    } catch (e) { console.error('Welcome/Goodbye error:', e); }
}

// ========== MAIN BOT ==========
module.exports = empire = async (empire, m, chatUpdate, store) => {
    try {
        const body = m.message?.conversation ||
                     m.message?.extendedTextMessage?.text ||
                     m.message?.imageMessage?.caption ||
                     m.message?.videoMessage?.caption || "";

        const prefix = /^[°zZ#$@+,.?=''():√%!¢£¥€π¤ΠΦ&><™©®Δ^βα¦|/\\©^]/.test(body)
            ? body.match(/^[°zZ#$@+,.?=''():√%¢£¥€π¤ΠΦ&><!™©®Δ^βα¦|/\\©^]/gi)[0]
            : '/';

        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const text = args.join(" ");

        const botNumber = await empire.decodeJid(empire.user.id);
        const owner = JSON.parse(fs.readFileSync('./allfunc/owner.json'));

        const senderPn = m.sender;
        const isCreator = [botNumber, ...owner]
            .map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
            .includes(senderPn);

        const isGroup = m.isGroup;
        let groupMetadata, participants = [], groupAdmins = [], isBotAdmins = false, isAdmins = false, groupName = "";

        if (isGroup) {
            groupMetadata = await empire.groupMetadata(m.chat).catch(() => null);
            participants = groupMetadata?.participants || [];
            groupAdmins = participants.filter(p => p.admin).map(p => p.id);
            isBotAdmins = groupAdmins.includes(botNumber);
            isAdmins = groupAdmins.includes(m.sender);
            groupName = groupMetadata?.subject || "";
        }

        const reply = (teks) => empire.sendMessage(m.chat, { 
            text: teks, 
            contextInfo: newsletterContext()
        }, { quoted: m });

        // ─── BOT MODE CHECK ───
        if (db.botMode?.mode === 'private' && !isCreator) {
            const isWhitelisted = db.botMode.whitelist?.includes(senderPn) || false;
            if (!isWhitelisted) {
                const allowedPublicCmds = ['ping', 'menu', 'help'];
                if (!allowedPublicCmds.includes(command)) {
                    await empire.sendMessage(m.chat, {
                        text: `🔒 *Bot is in PRIVATE MODE*\n\nOnly the bot owner can use this command.`,
                        contextInfo: newsletterContext()
                    }, { quoted: m }).catch(() => {});
                    return;
                }
            }
        }

        // ─── Check jailed users ───
   if (isGroup && !isCreator && !isAdmins && db.jailed?.[m.chat]?.[m.sender]) {
            const jailedData = db.jailed[m.chat][m.sender];
            if (jailedData.until && Date.now() > jailedData.until) {
                delete db.jailed[m.chat][m.sender];
                saveDB();
            } else {
                await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
                return;
            }
        }

        // ─── ANTI HANDLERS ───
        await antidelete.storeMessage(empire, m);
        await handleAntiLink(empire, m, isCreator, isAdmins);
        await handleAntiSticker(empire, m, isCreator, isAdmins);
        await handleAntiTag(empire, m, isCreator, isAdmins);
        await handleAntiViewOnce(empire, m);

        if (m.message?.protocolMessage?.type === 0) {
            await antidelete.handleRevocation(empire, m);
        }

        if (!isCmd) return;

        switch (command) {

        // ═══════════════════════════════════════════════════
        // 1. PING - Latency check
        // ═══════════════════════════════════════════════════
        case 'ping':
        case 'pong': {
            const start = Date.now();
            const pingMsg = await empire.sendMessage(m.chat, { 
                text: '⏳',
                contextInfo: newsletterContext()
            }, { quoted: m });
            const latency = Date.now() - start;
            let msgTs = m.messageTimestamp;
            if (typeof msgTs?.toNumber === 'function') msgTs = msgTs.toNumber();
            const waLatency = Math.max(1, Date.now() - Number(msgTs) * 1000);
            const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
            
            const response = 
`┌──────────────────┐
│  🏓  P O N G     │
├──────────────────┤
│  ${latency}ms  ${latency < 100 ? '🚀' : '🐢'}  │
│  📱 ${waLatency}ms  🧠 ${mem}MB  │
│  ZUKO-XMD ✅     │
└──────────────────┘`;
            
            await empire.sendMessage(m.chat, {
                text: response,
                edit: pingMsg.key,
                contextInfo: newsletterContext()
            }).catch(() => {
                empire.sendMessage(m.chat, { 
                    text: response,
                    contextInfo: newsletterContext()
                }, { quoted: m });
            });
            break;
        }

        // // ═══════════════════════════════════════════════════
// 2. MENU - Main command list (EXOTIC BULLETS + NEWSLETTER)
// ═══════════════════════════════════════════════════
case 'menu':
case 'help': {
    const now = moment().tz('Africa/Lagos').format('HH:mm:ss');
    const date = moment().tz('Africa/Lagos').format('DD/MM/YYYY');
    const userName = m.pushName || 'User';
    const up = process.uptime();
    const upStr = `${Math.floor(up/86400)}d ${Math.floor((up%86400)/3600)}h ${Math.floor((up%3600)/60)}m`;
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    const menuText = 
`◢━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◣
    ✦  ℤ𝕌𝕂𝕆 ✗ 𝕄𝔻  ✦
    ──── 𝘾𝙊𝙍𝙀 𝙈𝙀𝙉𝙐 ────
◥━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◤

◈─────────────────────────────◈
◇ 𝗨𝗦𝗘𝗥 𝗜𝗡𝗙𝗢
◈─────────────────────────────◈
  ✦ User       : ${userName}
  ✦ Time       : ${now} (WAT)
  ✦ Date       : ${date}
  ✦ Uptime     : ${upStr}
  ✦ Memory     : ${mem} MB
  ✦ Mode       : ${db.botMode?.mode || 'public'}

◈─────────────────────────────◈
◇ 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦
◈─────────────────────────────◈

  ✦ ${prefix}ping           ⋮ Latency check
  ✦ ${prefix}menu           ⋮ This menu
  ✦ ${prefix}sticker        ⋮ Img/vid → sticker
  ✦ ${prefix}play <song>    ⋮ Download audio
  ✦ ${prefix}ai <question>  ⋮ AI chat
  ✦ ${prefix}tts <text>     ⋮ Text to speech
  ✦ ${prefix}translate      ⋮ Translate text

◈─────────────────────────────◈
◇ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧𝗜𝗢𝗡𝗦
◈─────────────────────────────◈

  ✦ ${prefix}antilink       ⋮ Block links
  ✦ ${prefix}antisticker    ⋮ Block stickers
  ✦ ${prefix}antitag        ⋮ Block tagging
  ✦ ${prefix}antiviewonce   ⋮ Reveal view-once
  ✦ ${prefix}anticall       ⋮ Reject calls
  ✦ ${prefix}antidelete     ⋮ Log deletions
  ✦ ${prefix}antibot        ⋮ Auto-kick bots

◈─────────────────────────────◈
◇ 𝗚𝗥𝗢𝗨𝗣 𝗠𝗚𝗠𝗧
◈─────────────────────────────◈

  ✦ ${prefix}tagall <msg>   ⋮ Tag everyone
  ✦ ${prefix}groupinfo      ⋮ Group details
  ✦ ${prefix}promote @user  ⋮ Make admin
  ✦ ${prefix}demote @user   ⋮ Remove admin
  ✦ ${prefix}kick @user     ⋮ Remove member
  ✦ ${prefix}jail @user     ⋮ Restrict user
  ✦ ${prefix}unjail @user   ⋮ Release user
  ✦ ${prefix}welcome        ⋮ Toggle welcome
  ✦ ${prefix}goodbye        ⋮ Toggle goodbye

◈─────────────────────────────◈
◇ 𝗠𝗜𝗦𝗖
◈─────────────────────────────◈

  ✦ ${prefix}balance        ⋮ Check coins
  ✦ ${prefix}owner          ⋮ Contact owner

◈─────────────────────────────◈
    💎  ZUKO XMD  🥷 DEV ZUKO
◈─────────────────────────────◈

📰 *Forwarded via ${global.newsletterName || 'ZUKO XMD'}*`;

    try {
        // Load image from media/logo.jpg
        const imagePath = './media/logo.jpg';
        let imageBuffer = null;
        
        if (fs.existsSync(imagePath)) {
            imageBuffer = fs.readFileSync(imagePath);
            console.log('✅ Menu image loaded from:', imagePath);
        } else {
            console.log('⚠️ Menu image not found at:', imagePath);
        }
        
        if (imageBuffer) {
            await empire.sendMessage(m.chat, {
                image: imageBuffer,
                caption: menuText,
                contextInfo: newsletterContext({ mentionedJid: [m.sender] })
            }, { quoted: m });
        } else {
            // Fallback: text only if image not found
            await empire.sendMessage(m.chat, { 
                text: menuText,
                contextInfo: newsletterContext()
            }, { quoted: m });
        }
        
    } catch (e) {
        console.error('❌ Menu send error:', e.message);
        // Final fallback: text only
        await empire.sendMessage(m.chat, { 
            text: menuText,
            contextInfo: newsletterContext()
        }, { quoted: m });
    }
    break;
}
        // ═══════════════════════════════════════════════════
        // 3. STICKER - Image/Video to sticker
        // ═══════════════════════════════════════════════════
        case 'sticker':
        case 'stiker':
        case 's': {
            try {
                const quoted = m.quoted ? m.quoted : m;
                const mime = quoted.mimetype || '';
                if (!/image|video/.test(mime)) {
                    return reply(`🖼️ Send/reply to an image or video with:\n${prefix}sticker`);
                }
                await reply('⏳ Creating sticker...');
                const mediaBuffer = await empire.downloadMediaMessage(quoted);
                if (!mediaBuffer || mediaBuffer.length === 0) {
                    return reply('❌ Failed to download media.');
                }
                const { Sticker } = require('wa-sticker-formatter');
                const sticker = new Sticker(mediaBuffer, {
                    pack: global.packname || 'ZUKO XMD',
                    author: global.OWNER_NAME || 'Zuko',
                    type: /video/.test(mime) || mime.includes('gif') ? 'animated' : 'full',
                    quality: 80,
                    crop: false,
                });
                const stickerBuffer = await sticker.toBuffer();
                if (!stickerBuffer || stickerBuffer.length === 0) {
                    return reply('❌ Failed to create sticker.');
                }
                await empire.sendMessage(m.chat, { 
                    sticker: stickerBuffer,
                    contextInfo: newsletterContext()
                }, { quoted: m });
            } catch (e) {
                reply(`❌ Sticker failed: ${e.message || 'Unknown error'}`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 4. PLAY - Download song
        // ═══════════════════════════════════════════════════
        case 'play':
        case 'song':
        case 'ytmp3': {
            if (!text) return reply(`🎵 Usage: ${prefix}play <song name>\nExample: ${prefix}play Despacito`);
            await reply('🔍 Searching and processing...');
            try {
                let video;
                if (text.includes('youtube.com') || text.includes('youtu.be')) {
                    video = { url: text };
                } else {
                    const search = await yts(text);
                    if (!search || !search.videos || !search.videos.length) {
                        return reply('❌ No results found.');
                    }
                    video = search.videos[0];
                }
                
                await empire.sendMessage(m.chat, {
                    image: { url: video.thumbnail },
                    caption: `🎵 *Downloading:* ${video.title}\n⏱ *Duration:* ${video.timestamp}`,
                    contextInfo: newsletterContext()
                }, { quoted: m });

                const apiMethods = [
                    { name: 'EliteProTech', method: () => getEliteProTechDownload(video.url) },
                    { name: 'Shizo', method: () => getShizoDownload(video.url) }
                ];
                
                let audioBuffer = null;
                for (const apiMethod of apiMethods) {
                    try {
                        const data = await apiMethod.method();
                        const audioUrl = data.download || data.dl || data.url;
                        if (!audioUrl) continue;
                        const response = await axios.get(audioUrl, {
                            responseType: 'arraybuffer',
                            timeout: 90000
                        });
                        audioBuffer = Buffer.from(response.data);
                        if (audioBuffer && audioBuffer.length > 0) break;
                    } catch (err) {
                        continue;
                    }
                }
                
                if (!audioBuffer) {
                    return reply('❌ All download sources failed.');
                }
                
                const title = video.title.replace(/[^\w\s-]/g, '');
                await empire.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false,
                    contextInfo: newsletterContext()
                }, { quoted: m });
            } catch (err) {
                reply('❌ Failed to download song. Please try again later.');
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 5. AI - Chat with Gemini
        // ═══════════════════════════════════════════════════
        case 'ai':
        case 'ask':
        case 'chat':
        case 'gemini': {
            if (!text) return reply(`🤖 Usage: ${prefix}ai <question>\nExample: ${prefix}ai What is life?`);
            await reply('🤔 Thinking...');
            try {
                let answer = null;
                if (GoogleGenerativeAI && GEMINI_API_KEY) {
                    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                    const models = ['gemini-1.5-flash', 'gemini-pro'];
                    for (const modelName of models) {
                        try {
                            const model = genAI.getGenerativeModel({ model: modelName });
                            const result = await model.generateContent(text);
                            answer = result.response.text();
                            break;
                        } catch (e) {}
                    }
                }
                if (!answer) {
                    try {
                        const res = await axios.get(
                            `https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(text)}`,
                            { timeout: 30000 }
                        );
                        if (res.data?.status && res.data?.result) {
                            answer = res.data.result;
                        }
                    } catch (e) {}
                }
                if (!answer) {
                    return reply('❌ AI services unavailable. Try again later.');
                }
                if (answer.length > 4000) {
                    answer = answer.slice(0, 3950) + '...\n\n📌 *Truncated*';
                }
                await empire.sendMessage(m.chat, {
                    text: `🤖 *AI Response*\n\n${answer}`,
                    contextInfo: newsletterContext()
                }, { quoted: m });
            } catch (e) {
                reply(`❌ Failed: ${e.message || 'Unknown error'}`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 6. TTS - Text to Speech
        // ═══════════════════════════════════════════════════
        case 'tts': {
            if (!text) return reply(`🔊 Usage: ${prefix}tts <text>\nExample: ${prefix}tts Hello world`);
            try {
                const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
                const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
                await empire.sendMessage(m.chat, {
                    audio: Buffer.from(response.data),
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    fileName: 'tts.mp3',
                    contextInfo: newsletterContext()
                }, { quoted: m });
            } catch (e) {
                reply(`❌ TTS failed: ${e.message}`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 7. TRANSLATE
        // ═══════════════════════════════════════════════════
        case 'translate':
        case 'tr': {
            if (args.length < 2) return reply(`🌐 Usage: ${prefix}translate <lang> <text>\nExample: ${prefix}translate es Hello`);
            const lang = args[0];
            const textToTr = args.slice(1).join(' ');
            try {
                const res = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
                    params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: textToTr },
                    timeout: 8000
                });
                const translated = res.data[0].map(s => s[0]).join('');
                reply(`🌐 *Translated (${lang}):*\n\n${translated}`);
            } catch (e) {
                reply(`❌ Translation failed. Check language code.`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 8. ANTILINK
        // ═══════════════════════════════════════════════════
        case 'antilink':
        case 'al': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'antilink', true); setSetting(m.chat, 'antilink_action', 'delete'); reply(`🔗 *ANTI-LINK ON*`); }
            else if (opt === 'off') { setSetting(m.chat, 'antilink', false); reply(`✅ *ANTI-LINK OFF*`); }
            else if (opt === 'action') {
                const a = args[1]?.toLowerCase();
                if (['delete','warn','kick'].includes(a)) { setSetting(m.chat, 'antilink_action', a); reply(`✅ Action: *${a.toUpperCase()}*`); }
                else reply(`Actions: delete, warn, kick`);
            } else {
                const s = getSetting(m.chat, 'antilink', false);
                const a = getSetting(m.chat, 'antilink_action', 'delete');
                reply(`🔗 *ANTI-LINK*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\nAction: ${a.toUpperCase()}\n\n${prefix}antilink on/off\n${prefix}antilink action <delete/warn/kick>`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 9. ANTISTICKER
        // ═══════════════════════════════════════════════════
        case 'antisticker': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'antisticker', true); reply(`🎭 *ANTI-STICKER ON*`); }
            else if (opt === 'off') { setSetting(m.chat, 'antisticker', false); reply(`✅ *ANTI-STICKER OFF*`); }
            else if (opt === 'action') {
                const a = args[1]?.toLowerCase();
                if (['delete','warn','kick'].includes(a)) { setSetting(m.chat, 'antisticker_action', a); reply(`✅ Action: *${a.toUpperCase()}*`); }
                else reply(`Actions: delete, warn, kick`);
            } else {
                const s = getSetting(m.chat, 'antisticker', false);
                reply(`🎭 *ANTI-STICKER*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}antisticker on/off\n${prefix}antisticker action <delete/warn/kick>`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 10. ANTITAG
        // ═══════════════════════════════════════════════════
        case 'antitag':
        case 'at': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'antitag', true); setSetting(m.chat, 'antitag_action', 'delete'); reply(`🚫 *ANTI-TAG ON*`); }
            else if (opt === 'off') { setSetting(m.chat, 'antitag', false); reply(`✅ *ANTI-TAG OFF*`); }
            else if (opt === 'action') {
                const a = args[1]?.toLowerCase();
                if (['delete','warn','kick'].includes(a)) { setSetting(m.chat, 'antitag_action', a); reply(`✅ Action: *${a.toUpperCase()}*`); }
                else reply(`Actions: delete, warn, kick`);
            } else {
                const s = getSetting(m.chat, 'antitag', false);
                reply(`🚫 *ANTI-TAG*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}antitag on/off\n${prefix}antitag action <delete/warn/kick>`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 11. ANTIVIEWONCE
        // ═══════════════════════════════════════════════════
        case 'antiviewonce':
        case 'avo': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'antiviewonce', true); reply(`👁️ *ANTI-VIEWONCE ON*`); }
            else if (opt === 'off') { setSetting(m.chat, 'antiviewonce', false); reply(`✅ *ANTI-VIEWONCE OFF*`); }
            else {
                const s = getSetting(m.chat, 'antiviewonce', false);
                reply(`👁️ *ANTI-VIEWONCE*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}antiviewonce on/off`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 12. ANTICALL
        // ═══════════════════════════════════════════════════
        case 'anticall': {
            if (!isCreator) return reply("❌ Owner only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting('global', 'anticall', true); reply(`📵 *ANTI-CALL ON*`); }
            else if (opt === 'off') { setSetting('global', 'anticall', false); reply(`✅ *ANTI-CALL OFF*`); }
            else {
                const s = getSetting('global', 'anticall', false);
                reply(`📵 *ANTI-CALL*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}anticall on/off`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 13. ANTIDELETE
        // ═══════════════════════════════════════════════════
        case 'antidelete':
        case 'ad': {
            await antidelete.handleCommand(empire, m.chat, m, text, isCreator);
            break;
        }

        // ═══════════════════════════════════════════════════
        // 14. ANTIBOT
        // ══════════════════════════════
        case 'antibot': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'antibot', true); reply(`🤖 *ANTI-BOT ON*`); }
            else if (opt === 'off') { setSetting(m.chat, 'antibot', false); reply(`✅ *ANTI-BOT OFF*`); }
            else {
                const s = getSetting(m.chat, 'antibot', false);
                reply(`🤖 *ANTI-BOT*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}antibot on/off`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 15. TAGALL
        // ═══════════════════════════════════════════════════
        case 'tagall':
        case 'everyone': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const msg = text || "📢 Attention everyone!";
            const mentions = participants.map(p => p.id);
            const tags = mentions.map(p => `• @${p.split('@')[0]}`).join('\n');
            await empire.sendMessage(m.chat, {
                text: `${msg}\n\n👥 *Members (${participants.length})*\n${tags}`,
                mentions,
                contextInfo: newsletterContext({ mentionedJid: mentions })
            }, { quoted: m });
            break;
        }

        // ═══════════════════════════════════════════════════
        // 16. GROUPINFO
        // ═══════════════════════════════════════════════════
        case 'groupinfo':
        case 'gcinfo': {
            if (!isGroup) return reply("👥 Group only!");
            const adminList = groupAdmins.map(a => `  👑 @${a.split('@')[0]}`).join('\n');
            await empire.sendMessage(m.chat, {
                text:
`ℹ️ *GROUP INFO*
📛 Name: ${groupName}
👥 Members: ${participants.length}
👑 Admins: ${groupAdmins.length}

👑 *Admins:*
${adminList}`,
                mentions: groupAdmins,
                contextInfo: newsletterContext({ mentionedJid: groupAdmins })
            }, { quoted: m });
            break;
        }

        // ═══════════════════════════════════════════════════
        // 17. GROUP MANAGEMENT (promote/demote/kick)
        // ═══════════════════════════════════════════════════
        case 'promote':
        case 'makeadmin': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
            if (!target) return reply(`Usage: ${prefix}promote @user`);
            await empire.groupParticipantsUpdate(m.chat, [target], 'promote');
            await empire.sendMessage(m.chat, { 
                text: `⬆️ @${target.split('@')[0]} promoted to admin!`, 
                mentions: [target],
                contextInfo: newsletterContext({ mentionedJid: [target] })
            }, { quoted: m });
            break;
        }
        case 'demote':
        case 'unadmin': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
            if (!target) return reply(`Usage: ${prefix}demote @user`);
            await empire.groupParticipantsUpdate(m.chat, [target], 'demote');
            await empire.sendMessage(m.chat, { 
                text: `⬇️ @${target.split('@')[0]} demoted!`, 
                mentions: [target],
                contextInfo: newsletterContext({ mentionedJid: [target] })
            }, { quoted: m });
            break;
        }
        case 'kick':
        case 'remove': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
            if (!target) return reply(`Usage: ${prefix}kick @user`);
            if (target === botNumber) return reply("❌ Can't kick the bot!");
            await empire.groupParticipantsUpdate(m.chat, [target], 'remove');
            await empire.sendMessage(m.chat, { 
                text: `👢 @${target.split('@')[0]} kicked!`, 
                mentions: [target],
                contextInfo: newsletterContext({ mentionedJid: [target] })
            }, { quoted: m });
            break;
        }

        // ═══════════════════════════════════════════════════
        // 18. JAIL/UNJAIL
        // ═══════════════════════════════════════════════════
        case 'jail': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
            if (!target) return reply(`Usage: ${prefix}jail @user <reason>`);
            if (target === botNumber) return reply("❌ Can't jail the bot!");
            const reason = text.replace(/@\S+/, '').trim() || "No reason";
            if (!db.jailed) db.jailed = {};
            if (!db.jailed[m.chat]) db.jailed[m.chat] = {};
            db.jailed[m.chat][target] = { reason, until: Date.now() + 60 * 60 * 1000 };
            saveDB();
            await empire.sendMessage(m.chat, {
                text: `🔒 *JAILED*\n👤 @${target.split('@')[0]}\n📌 ${reason}\n⏱️ 1 hour`,
                mentions: [target],
                contextInfo: newsletterContext({ mentionedJid: [target] })
            }, { quoted: m });
            break;
        }
        case 'unjail':
        case 'release': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
            if (!target) return reply(`Usage: ${prefix}unjail @user`);
            if (db.jailed?.[m.chat]?.[target]) {
                delete db.jailed[m.chat][target];
                saveDB();
                await empire.sendMessage(m.chat, { 
                    text: `🔓 @${target.split('@')[0]} released!`, 
                    mentions: [target],
                    contextInfo: newsletterContext({ mentionedJid: [target] })
                }, { quoted: m });
            } else {
                reply(`❌ User is not jailed.`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 19. BALANCE
        // ═══════════════════════════════════════════════════
        case 'balance':
        case 'bal': {
            const target = m.mentionedJid?.[0] || m.sender;
            const acc = ensureEconomy(target);
            reply(
`💰 *BALANCE*
👤 @${target.split('@')[0]}
👛 Wallet: ${fmtCoins(acc.wallet)} coins
🏦 Bank: ${fmtCoins(acc.bank)} coins
💎 Total: ${fmtCoins(acc.wallet + acc.bank)} coins`
            );
            break;
        }

        // ═══════════════════════════════════════════════════
        // 20. OWNER
        // ═══════════════════════════════════════════════════
        case 'owner': {
            try {
                const ownerNum = (owner[0] || '').replace(/[^0-9]/g, '');
                const ownerName = global.OWNER_NAME || 'ZUKO XMD Owner';
                await empire.sendMessage(m.chat, {
                    contacts: {
                        displayName: ownerName,
                        contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nTEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\nEND:VCARD` }]
                    },
                    contextInfo: newsletterContext()
                }, { quoted: m });
            } catch (e) {
                reply(`❌ Failed to send contact: ${e.message}`);
            }
            break;
        }

        // ═══════════════════════════════════════════════════
        // 21. WELCOME
        // ═══════════════════════════════════════════════════
        case 'welcome': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'welcome', true); reply(`👋 *WELCOME ON*\nCustomize: ${prefix}setwelcome <msg>\nVariables: @user @group`); }
            else if (opt === 'off') { setSetting(m.chat, 'welcome', false); reply(`✅ *WELCOME OFF*`); }
            else {
                const s = getSetting(m.chat, 'welcome', false);
                const msg = getSetting(m.chat, 'welcomeMessage', '👋 Welcome @user to @group!');
                reply(`👋 *WELCOME*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\nMessage: ${msg}\n\n${prefix}welcome on/off\n${prefix}setwelcome <msg>`);
            }
            break;
        }
        case 'setwelcome': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            if (!text) return reply(`Usage: ${prefix}setwelcome <message>\nVariables: @user @group`);
            setSetting(m.chat, 'welcomeMessage', text);
            reply(`✅ *Welcome message set!*\n\n${text}`);
            break;
        }

        // ═══════════════════════════════════════════════════
        // 22. GOODBYE
        // ═══════════════════════════════════════════════════
        case 'goodbye': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            const opt = args[0]?.toLowerCase();
            if (opt === 'on') { setSetting(m.chat, 'goodbye', true); reply(`👋 *GOODBYE ON*\nCustomize: ${prefix}setgoodbye <msg>`); }
            else if (opt === 'off') { setSetting(m.chat, 'goodbye', false); reply(`✅ *GOODBYE OFF*`); }
            else {
                const s = getSetting(m.chat, 'goodbye', false);
                reply(`👋 *GOODBYE*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}goodbye on/off\n${prefix}setgoodbye <msg>`);
            }
            break;
        }
        case 'setgoodbye': {
            if (!isGroup) return reply("👥 Group only!");
            if (!isCreator && !isAdmins) return reply("❌ Admins only!");
            if (!text) return reply(`Usage: ${prefix}setgoodbye <message>`);
            setSetting(m.chat, 'goodbyeMessage', text);
            reply(`✅ *Goodbye message set!*\n\n${text}`);
            break;
        }

        default:
            break;
        }

    } catch (err) {
        console.error('Command error:', err);
        if (m?.chat) empire.sendMessage(m.chat, { 
            text: `❌ Error: ${err.message}`,
            contextInfo: newsletterContext()
        }).catch(() => {});
    }
};

// ========== ANTI-CALL EXPORT ==========
module.exports.handleAntiCall = handleAntiCall;

// ========== GROUP PARTICIPANTS UPDATE ==========
const originalGroupParticipantsUpdate = empire.groupParticipantsUpdate;
empire.groupParticipantsUpdate = async function (update) {
    try {
        const result = await originalGroupParticipantsUpdate?.apply(this, arguments);
        if (update?.id && update?.participants) {
            const gm = await this.groupMetadata(update.id).catch(() => null);
            if (gm) {
                // Handle welcome/goodbye
                await handleGroupParticipantsUpdate(this, update, gm, this.user.id);
                
                // Check for jailed users
                if (db.jailed?.[update.id]) {
                    for (const p of update.participants) {
                        if (db.jailed[update.id][p]) {
                            const jailedData = db.jailed[update.id][p];
                            if (jailedData.until && Date.now() > jailedData.until) {
                                delete db.jailed[update.id][p];
                                saveDB();
                            } else {
                                await this.groupParticipantsUpdate(update.id, [p], 'remove').catch(() => {});
                            }
                        }
                    }
                }
                // Anti-bot check
                const antibotEnabled = getSetting(update.id, 'antibot', false);
                if (antibotEnabled && update.action === 'add') {
                    for (const p of update.participants) {
                        if (p === this.user.id) continue;
                        const pic = await this.profilePictureUrl(p, 'image').catch(() => null);
                        if (!pic) {
                            await this.groupParticipantsUpdate(update.id, [p], 'remove').catch(() => {});
                            await this.sendMessage(update.id, {
                                text: `🤖 @${p.split('@')[0]} removed — no profile picture.`,
                                mentions: [p],
                                contextInfo: newsletterContext({ mentionedJid: [p] })
                            }).catch(() => {});
                        }
                    }
                }
            }
        }
        return result;
    } catch (e) { console.error('Group update error:', e); }
};

// ========== HOT RELOAD ==========
let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' updated!\x1b[0m');
    delete require.cache[file];
    require(file);
});
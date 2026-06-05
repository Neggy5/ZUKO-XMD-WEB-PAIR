 const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

// Store active sessions
const activeSessions = new Map();

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { number } = req.body;
    
    if (!number) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Clean phone number
    let cleanNumber = number.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '234' + cleanNumber.substring(1);
    }
    if (!cleanNumber.startsWith('234')) {
        cleanNumber = '234' + cleanNumber;
    }
    
    const fullJid = cleanNumber + '@s.whatsapp.net';
    
    // Check existing session
    if (activeSessions.has(fullJid)) {
        const session = activeSessions.get(fullJid);
        if (Date.now() - session.timestamp < 5 * 60 * 1000) {
            return res.json({
                success: true,
                code: session.code,
                number: cleanNumber,
                expiresIn: Math.floor((5 * 60 - (Date.now() - session.timestamp) / 1000)),
                message: 'Pairing code already generated'
            });
        } else {
            activeSessions.delete(fullJid);
        }
    }
    
    try {
        // Create temp directory
        const tempDir = '/tmp/pairing_' + cleanNumber;
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tempDir, { recursive: true });
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        
        let pairingCode = null;
        
        const sock = makeWASocket({
            version,
            auth: state,
            logger: { level: 'silent' },
            browser: Browsers.macOS('Desktop'),
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            shouldSyncHistoryMessage: () => false,
        });
        
        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log('Connected for:', cleanNumber);
                await sock.sendPresenceUpdate('available');
                
                // Update bio
                const now = new Date();
                const bio = `⚡ ZUKO XMD | Paired at ${now.toLocaleTimeString()}`;
                await sock.updateProfileStatus(bio).catch(() => {});
                
                // Store session
                activeSessions.set(fullJid, {
                    sock,
                    code: pairingCode,
                    timestamp: Date.now(),
                    number: cleanNumber
                });
                
                // Clean up temp dir after 30 seconds
                setTimeout(() => {
                    try {
                        if (fs.existsSync(tempDir)) {
                            fs.rmSync(tempDir, { recursive: true, force: true });
                        }
                    } catch (e) {}
                }, 30000);
            }
            
            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.log('Connection closed:', cleanNumber, statusCode);
                
                // Clean up
                try {
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                } catch (e) {}
                activeSessions.delete(fullJid);
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        // Request pairing code
        console.log('Requesting code for:', cleanNumber);
        pairingCode = await sock.requestPairingCode(cleanNumber);
        pairingCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
        console.log('Code generated:', pairingCode);
        
        // Store session with code
        activeSessions.set(fullJid, {
            sock,
            code: pairingCode,
            timestamp: Date.now(),
            number: cleanNumber
        });
        
        // Auto cleanup after 5 minutes
        setTimeout(() => {
            if (activeSessions.has(fullJid)) {
                const session = activeSessions.get(fullJid);
                if (session && session.sock) {
                    try {
                        session.sock.logout();
                    } catch (e) {}
                }
                activeSessions.delete(fullJid);
                try {
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                } catch (e) {}
            }
        }, 5 * 60 * 1000);
        
        return res.json({
            success: true,
            code: pairingCode,
            number: cleanNumber,
            expiresIn: 300,
            message: 'Pairing code generated successfully!'
        });
        
    } catch (error) {
        console.error('Pairing error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            suggestion: 'Make sure the number is registered on WhatsApp'
        });
    }
};

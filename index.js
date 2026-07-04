const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');
const express = require('express');

const AUTH_FILE = './auth.json';

// ========================
// RAILWAY HEALTH SERVER
// ========================
const PORT = process.env.PORT || 3000;
const healthApp = express();

healthApp.use(express.json());
healthApp.use(express.static(path.join(__dirname, 'public')));

healthApp.get('/health', (_, res) => res.status(200).json({
    status: 'ok',
    bot: 'ZUKO XMD',
    uptime: process.uptime().toFixed(0) + 's'
}));

healthApp.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'pair.html')));

// ========================
// WEB PAIRING API
// ========================
const pairingInFlight = new Set();

healthApp.post('/api/pair', async (req, res) => {
    const raw = (req.body && req.body.number) || '';
    const number = String(raw).replace(/[^0-9]/g, '');

    if (!number || number.length < 8) {
        return res.status(400).json({ error: 'Provide a valid phone number with country code.' });
    }

    const pairingJsonPath = path.join(__dirname, 'empirestore', 'pairing', 'pairing.json');
    const sessionCredsPath = path.join(__dirname, 'empirestore', 'pairing', number, 'creds.json');

    try {
        if (fs.existsSync(sessionCredsPath)) {
            const creds = JSON.parse(fs.readFileSync(sessionCredsPath, 'utf8'));
            if (creds && creds.registered) {
                return res.status(200).json({ alreadyPaired: true });
            }
        }

        if (!pairingInFlight.has(number)) {
            pairingInFlight.add(number);
            const startpairing = require('./pair');
            startpairing(number).catch((err) => {
                console.log(chalk.red(`❌ Web pairing error for ${number}:`), err.message);
            }).finally(() => pairingInFlight.delete(number));
        }

        const deadline = Date.now() + 20000;
        let lastCode = null;
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 1000));
            if (fs.existsSync(pairingJsonPath)) {
                try {
                    const raw = fs.readFileSync(pairingJsonPath, 'utf8');
                    if (raw.trim().length === 0) continue; // ← FIX: skip empty file
                    const data = JSON.parse(raw);
                    if (data && data.number === number && data.code) {
                        lastCode = data.code;
                        break;
                    }
                } catch (e) {
                    // file is malformed – skip this iteration
                    continue;
                }
            }
        }

        if (!lastCode) {
            return res.status(504).json({ error: 'Timed out waiting for a pairing code. Try again.' });
        }

        return res.status(200).json({ code: lastCode });
    } catch (error) {
        console.log(chalk.red('❌ /api/pair error:'), error.message);
        return res.status(500).json({ error: 'Server error generating pairing code.' });
    }
});

healthApp.get('/api/status/:number', (req, res) => {
    const number = String(req.params.number).replace(/[^0-9]/g, '');
    const sessionCredsPath = path.join(__dirname, 'empirestore', 'pairing', number, 'creds.json');
    if (!fs.existsSync(sessionCredsPath)) {
        return res.status(200).json({ paired: false });
    }
    try {
        const creds = JSON.parse(fs.readFileSync(sessionCredsPath, 'utf8'));
        return res.status(200).json({ paired: !!(creds && creds.registered) });
    } catch {
        return res.status(200).json({ paired: false });
    }
});

healthApp.listen(PORT, () => {
    console.log(chalk.green(`✅ Web server listening on port ${PORT} (pairing UI at /)`));
});

// ========================
// HELPERS
// ========================
function ensureAuthenticated() {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ authenticated: true }));
}

function launchBot() {
    console.clear();
    console.log(chalk.green('Starting ZUKO XMD...\n'));

    let telegramLoaded = false;
    let whatsappLoaded = false;

    const botPath = path.join(__dirname, 'bot.js');
    if (fs.existsSync(botPath)) {
        try {
            console.log(chalk.blue('📱 Loading Telegram bot...'));
            require('./bot');
            telegramLoaded = true;
            console.log(chalk.green('✅ Telegram bot active'));
        } catch (error) {
            console.log(chalk.red('❌ Failed to load Telegram bot:', error.message));
            console.log(chalk.yellow('⚠️  Continuing without Telegram bot...\n'));
        }
    } else {
        console.log(chalk.yellow('⚠️  bot.js not found, skipping Telegram bot...\n'));
    }

    const casePath = path.join(__dirname, 'case.js');
    if (fs.existsSync(casePath)) {
        try {
            console.log(chalk.blue('💬 Loading WhatsApp commands...'));
            require('./case');
            whatsappLoaded = true;
            console.log(chalk.green('✅ WhatsApp commands loaded'));
        } catch (error) {
            console.log(chalk.red('❌ Failed to load WhatsApp commands:', error.message));
            console.log(chalk.yellow('⚠️  Continuing without WhatsApp commands...\n'));
        }
    } else {
        console.log(chalk.yellow('⚠️  case.js not found, skipping WhatsApp commands...\n'));
    }

    console.log(chalk.cyan('\n⚄︎═══════════════════════════════⚄︎'));
    console.log(chalk.bold.white('  BOT INITIALIZATION SUMMARY'));
    console.log(chalk.cyan('⚄︎════════════════════════════════⚄︎'));
    console.log(telegramLoaded ? chalk.green('✅ Telegram Bot: ACTIVE') : chalk.red('❌ Telegram Bot: INACTIVE'));
    console.log(whatsappLoaded ? chalk.green('✅ WhatsApp Commands: ACTIVE') : chalk.red('❌ WhatsApp Commands: INACTIVE'));
    console.log(chalk.cyan('⚄︎════════════════════════════════⚄︎\n'));

    if (!telegramLoaded && !whatsappLoaded) {
        console.log(chalk.red('⚠️  Warning: No bot systems loaded! Check your config.\n'));
    } else {
        console.log(chalk.green('✅ ZUKO XMD is running!\n'));
    }

    const ignoredErrors = [
        'Socket connection timeout', 'EKEYTYPE', 'item-not-found',
        'rate-overlimit', 'Connection Closed', 'Timed Out', 'Value not found'
    ];

    process.on('unhandledRejection', (reason) => {
        if (ignoredErrors.some(e => String(reason).includes(e))) return;
        console.log(chalk.red('\n⚠️  Unhandled Promise Rejection:'), reason);
    });

    process.on('uncaughtException', (error) => {
        if (ignoredErrors.some(e => String(error).includes(e))) return;
        console.log(chalk.red('\n❌ Uncaught Exception:'), error.message);
        if (error.stack) console.log(chalk.gray(error.stack));
    });

    const originalConsoleError = console.error;
    console.error = function (message, ...args) {
        if (typeof message === 'string' && ignoredErrors.some(e => message.includes(e))) return;
        originalConsoleError.apply(console, [message, ...args]);
    };
}

const initializeBot = async () => {
    console.clear();
    try {
        console.log(chalk.cyan(figlet.textSync('ZUKO XMD', {
            font: 'Standard',
            horizontalLayout: 'default',
            verticalLayout: 'default'
        })));
    } catch (e) {
        console.log(chalk.cyan('=== ZUKO XMD ==='));
    }

    console.log(chalk.yellow('\n⚄︎══════════════════════⚄︎'));
    console.log(chalk.green('ZUKO XMD — Railway Edition'));
    console.log(chalk.yellow('⚄︎═════════════════════⚄︎\n'));

    ensureAuthenticated();
    console.log(chalk.green('✅ Auto-authenticated for server deployment.'));

    launchBot();
};

process.once('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠️  Shutting down gracefully...'));
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log(chalk.yellow('\n\n⚠️  Received termination signal...'));
    process.exit(0);
});

initializeBot().catch((error) => {
    console.log(chalk.red('\n❌ Fatal error during initialization:'), error.message);
    if (error.stack) console.log(chalk.gray(error.stack));
    process.exit(1);
});
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
let figlet;
try {
    figlet = require('figlet');
} catch (e) {
    console.error('⚠️  figlet failed to load, continuing without ASCII banner:', e.message);
    figlet = { textSync: () => { throw new Error('figlet unavailable'); } };
}
const express = require('express');

const startpairing = require('./pair');

const AUTH_FILE = './auth.json';
const PAIRING_FILE = path.join(__dirname, 'empirestore', 'pairing', 'pairing.json');

// ========================
// RAILWAY HEALTH + WEB PAIRING SERVER
// ========================
// Railway requires an HTTP service to bind to PORT within 60 seconds or
// it marks the deploy as unhealthy. This same Express server also serves
// the web pairing page (public/index.html) and its API.
const PORT = process.env.PORT || 3000;
const healthApp = express();

healthApp.use(express.json());
healthApp.use(express.urlencoded({ extended: true }));
healthApp.use(express.static(path.join(__dirname, 'public')));

healthApp.get('/health', (_, res) => res.status(200).json({
    status: 'ok',
    bot: 'ZUKO XMD',
    uptime: process.uptime().toFixed(0) + 's'
}));

// POST /api/pair { number } -> kicks off startpairing() and polls
// empirestore/pairing/pairing.json for the freshly generated code.
healthApp.post('/api/pair', async (req, res) => {
    const rawNumber = (req.body && req.body.number || '').toString();
    const number = rawNumber.replace(/[^0-9]/g, '');

    if (!number || number.length < 8) {
        return res.status(400).json({ error: 'Please provide a valid phone number with country code.' });
    }

    try {
        startpairing(number).catch(err => {
            console.log(chalk.red(`❌ startpairing() error for ${number}:`), err.message);
        });

        const code = await waitForPairingCode(number, 20000);

        if (!code) {
            return res.status(504).json({ error: 'Timed out waiting for pairing code. Please try again.' });
        }

        return res.status(200).json({ code });
    } catch (err) {
        console.log(chalk.red('❌ /api/pair error:'), err.message);
        return res.status(500).json({ error: 'Something went wrong generating your pairing code.' });
    }
});

// Poll pairing.json until it contains a fresh code for `number`, or timeout.
function waitForPairingCode(number, timeoutMs) {
    return new Promise((resolve) => {
        const start = Date.now();

        const interval = setInterval(() => {
            try {
                if (fs.existsSync(PAIRING_FILE)) {
                    const data = JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
                    const isMatch = data.number === number;
                    const isFresh = (Date.now() - new Date(data.timestamp).getTime()) < timeoutMs + 5000;

                    if (isMatch && isFresh) {
                        clearInterval(interval);
                        return resolve(data.code);
                    }
                }
            } catch (e) {
                // ignore parse errors from a file mid-write, keep polling
            }

            if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve(null);
            }
        }, 750);
    });
}

healthApp.listen(PORT, () => {
    console.log(chalk.green(`✅ Health + web pairing server listening on port ${PORT}`));
});

// ========================
// HELPERS
// ========================
function ensureAuthenticated() {
    // Always mark authenticated so non-interactive (Railway) deploys work
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ authenticated: true }));
}

// ========================
// LAUNCH BOT MODULES
// ========================
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

// ========================
// INITIALIZE
// ========================
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

    // NOTE: autoLoadPairs is handled inside bot.js (8 seconds after startup).
    // Calling it here too would double-connect all paired users — so we skip it.
    launchBot();
};

// ========================
// GRACEFUL SHUTDOWN
// ========================
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

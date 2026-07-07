const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');
const express = require('express');

const AUTH_FILE = './auth.json';

// ========================
// RAILWAY HEALTH SERVER
// ========================
// Railway requires an HTTP service to bind to PORT within 60 seconds or
// it marks the deploy as unhealthy. This tiny Express server satisfies that.
const PORT = process.env.PORT || 3000;
const healthApp = express();

healthApp.get('/health', (_, res) => res.status(200).json({
    status: 'ok',
    bot: 'ZUKO XMD',
    uptime: process.uptime().toFixed(0) + 's'
}));

healthApp.get('/', (_, res) => res.status(200).send('⚡ ZUKO XMD is running'));

healthApp.listen(PORT, () => {
    console.log(chalk.green(`✅ Health server listening on port ${PORT}`));
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

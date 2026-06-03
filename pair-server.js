// ============================================================
// pair-server.js  –  Run this ON your XMD panel bot server
// It starts an HTTP server so Vercel can proxy pairing requests
// to your running Baileys instance.
//
// HOW TO RUN (in your XMD panel):
//   node pair-server.js
// or add it to your ecosystem.config.js as a second app.
// ============================================================

require('dotenv').config();
const http    = require('http');
const path    = require('path');
const fs      = require('fs').promises;

// ── Config ──────────────────────────────────────────────────
const PORT        = process.env.PAIR_PORT || 3000;
const SECRET      = process.env.PAIR_SECRET || '';          // optional auth token
const DATA_DIR    = path.join(__dirname, 'empirestore');
const PAIRING_DIR = path.join(DATA_DIR, 'pairing');
const PAIRING_FILE = path.join(PAIRING_DIR, 'pairing.json');

// Bring in the same startpairing function the bot uses
const startpairing = require('./pair');

// ── Helpers ─────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(json);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Delete old pairing file before each request ─────────────
async function clearPairingFile() {
  try { await fs.unlink(PAIRING_FILE); } catch (_) {}
}

// ── Wait for pairing.json to appear (max 30 s) ──────────────
async function waitForCode(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const raw  = await fs.readFile(PAIRING_FILE, 'utf-8');
      const obj  = JSON.parse(raw);
      if (obj?.code) return obj.code;
    } catch (_) {}
    await sleep(500);
  }
  return null;
}

// ── HTTP Server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Health check ────────────────────────────────────────────
  if (url.pathname === '/health' && req.method === 'GET') {
    return send(res, 200, { status: 'ok', server: 'Akira MD Pair Server' });
  }

  // ── Pairing endpoint ─────────────────────────────────────────
  if (url.pathname === '/pair' && req.method === 'POST') {

    // Optional secret check
    if (SECRET) {
      const auth = req.headers['authorization'] || '';
      if (auth !== `Bearer ${SECRET}`) {
        return send(res, 401, { error: 'Unauthorized' });
      }
    }

    const body  = await parseBody(req);
    let phone   = (body.phone || url.searchParams.get('phone') || '').toString().trim();

    // Strip +, spaces, dashes
    phone = phone.replace(/[\s\-\+]/g, '');

    if (!phone || !/^\d{7,15}$/.test(phone)) {
      return send(res, 400, { error: 'Invalid phone number. Use full number with country code, no + (e.g. 2347081827038)' });
    }

    const jid = `${phone}@s.whatsapp.net`;

    try {
      // Clear any leftover pairing file
      await clearPairingFile();

      // Call the same function the Telegram bot uses
      await startpairing(jid);

      // Wait up to 30 s for the code file to appear
      const code = await waitForCode(30000);

      if (!code) {
        return send(res, 500, { error: 'Timed out waiting for pairing code. Make sure your bot is running and connected.' });
      }

      // Format as XXXX-XXXX
      const formatted = code.replace(/[^A-Z0-9]/gi, '').match(/.{1,4}/g)?.join('-') || code;

      // Clean up the file
      try { await fs.unlink(PAIRING_FILE); } catch (_) {}

      return send(res, 200, { success: true, code: formatted });

    } catch (err) {
      console.error('[pair-server] Error:', err.message);
      return send(res, 500, { error: err.message || 'Failed to generate pairing code.' });
    }
  }

  // 404 for anything else
  return send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`\n✅ Akira MD Pair Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Pair:   POST http://localhost:${PORT}/pair\n`);
});

server.on('error', (err) => {
  console.error('[pair-server] Server error:', err.message);
});

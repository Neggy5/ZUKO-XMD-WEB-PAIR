// api/pair.js - Vercel Serverless Function
// Handles WhatsApp pairing code generation via Baileys

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
} = require("@whiskeysockets/baileys");
const { tmpdir } = require("os");
const { join } = require("path");
const { rmSync, mkdirSync, existsSync } = require("fs");
const pino = require("pino");

// Allow cross-origin requests from the frontend
const allowCors = (fn) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  return fn(req, res);
};

async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let phone = req.body?.phone || req.query?.phone;

  if (!phone) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  // Sanitize: remove +, spaces, dashes
  phone = phone.replace(/[\s\-\+]/g, "").trim();

  // Validate: must be digits only, 7-15 chars
  if (!/^\d{7,15}$/.test(phone)) {
    return res.status(400).json({ error: "Invalid phone number format. Use digits only with country code (e.g. 2347081827038)" });
  }

  // Create a temporary auth directory for this request
  const sessionDir = join(tmpdir(), `wa_pair_${phone}_${Date.now()}`);
  mkdirSync(sessionDir, { recursive: true });

  let sock;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Silent logger
    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ["Akira MD", "Chrome", "4.0.0"],
      connectTimeoutMs: 20000,
      defaultQueryTimeoutMs: 20000,
    });

    // Wait for connection open
    const code = await new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout. Please try again."));
      }, 25000);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          clearTimeout(timeout);
          try {
            await delay(1500);
            const pairingCode = await sock.requestPairingCode(phone);
            // Format: XXXX-XXXX
            const formatted = pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;
            resolve(formatted);
          } catch (err) {
            reject(new Error("Failed to request pairing code: " + err.message));
          }
        }

        if (connection === "close") {
          clearTimeout(timeout);
          const reason = lastDisconnect?.error?.output?.statusCode;
          if (reason === DisconnectReason.loggedOut) {
            reject(new Error("Session logged out. Please try again."));
          } else {
            reject(new Error("Connection closed unexpectedly. Please retry."));
          }
        }
      });
    });

    // Close socket
    sock.end();

    // Cleanup temp session
    try { rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}

    return res.status(200).json({ success: true, code });

  } catch (err) {
    // Close socket if open
    try { sock?.end?.(); } catch (_) {}
    // Cleanup temp session
    try { rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}

    console.error("Pairing error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to generate pairing code. Make sure your server is running." });
  }
}

module.exports = allowCors(handler);

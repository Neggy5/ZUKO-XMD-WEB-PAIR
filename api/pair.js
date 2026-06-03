/**
 * Akira MD - Web Pairing API
 * Deploy on Vercel as a serverless function.
 * Route: /api/pair?phone=2347XXXXXXXXX
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

// ── In-memory store for active pairing sessions (lives for this function invocation) ──
const pendingSessions = new Map();

// ── Temp dir for session files (Vercel allows /tmp) ──
const TMP_DIR = "/tmp/akira-sessions";
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

async function requestCode(phone) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for pairing code")), 60000);

    try {
      const sessionPath = path.join(TMP_DIR, phone);
      if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        version,
        browser: Browsers.ubuntu("Edge"),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: false,
      });

      sock.ev.on("creds.update", saveCreds);

      // Request the pairing code once socket opens
      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          clearTimeout(timeout);
          sock.end();
          resolve({ success: true, message: "Already authenticated" });
        }

        if (connection === "close") {
          const reason = lastDisconnect?.error?.output?.statusCode;
          if (reason === DisconnectReason.loggedOut) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        }
      });

      // Give socket 2 s to initialise, then ask for code
      await new Promise((r) => setTimeout(r, 2000));

      if (!state.creds.registered) {
        const cleanPhone = phone.replace(/[^0-9]/g, "");
        let code = await sock.requestPairingCode(cleanPhone);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        clearTimeout(timeout);
        sock.end();
        resolve({ success: true, code, phone: cleanPhone });
      }
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

// ── Vercel serverless handler ──
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const phone = (req.query.phone || "").replace(/[^0-9]/g, "");

  if (!phone || phone.length < 7 || phone.length > 15) {
    return res.status(400).json({ success: false, error: "Provide a valid phone number (with country code, digits only)" });
  }

  try {
    const result = await requestCode(phone);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Failed to generate pairing code" });
  }
};

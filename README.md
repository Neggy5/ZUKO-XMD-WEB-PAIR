# WhatsApp Bot — Web Pairing (Railway-ready)

A WhatsApp automation bot (built on [Baileys](https://github.com/WhiskeySockets/Baileys)) with a
browser-based pairing page — no QR-code scanning or terminal access needed. Includes an optional
Telegram control panel and is preconfigured to deploy on [Railway](https://railway.app).

> **Note on the underlying tech:** this uses Baileys, an unofficial WhatsApp Web API. It is not
> endorsed by WhatsApp/Meta, and automating a personal WhatsApp account this way can put the
> number at risk of being banned, and may conflict with WhatsApp's Terms of Service. Use a number
> you're comfortable putting at risk, and don't use this for bulk/unsolicited messaging.

## What's in this repo

- **Web pairing UI** — visit the deployed URL, enter your phone number, get a pairing code to
  enter in WhatsApp → Linked Devices. Implemented in `index.js` (`/api/pair`) + `public/pair.html`.
- **`pair.js`** — the actual Baileys connection/session logic.
- **`case.js`** — WhatsApp command handlers.
- **`bot.js`** — optional Telegram bot that can also trigger pairing via `/pair <number>` and
  manage sessions remotely. Only loads if you set `BOT_TOKEN`.
- **`setting/config.js`** — bot identity/branding, now driven by environment variables (see
  `.env.example`) instead of hardcoded values.

## Before you deploy — read this

The original template silently made every newly paired WhatsApp account auto-follow a fixed list
of newsletter channels and auto-join a fixed list of groups belonging to the template's original
author. That's now **disabled by default** (`AUTO_PROMO=false` in `.env.example`). If you want that
behavior for your *own* channels/groups, set `AUTO_PROMO=true` and edit `NEWSLETTER_CHANNELS` /
`GROUP_INVITE_CODES` near the top of `pair.js` — but make sure anyone pairing their number knows
what they're agreeing to.

Also update `OWNER_NUMBER`, `OWNER_NAME`, and `BOT_NAME` in your environment variables — the
template previously pointed these at the original developer's own number.

## Deploy to Railway

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/your-repo.git
git push -u origin main
```

### 2. Create a Railway project
1. Go to [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → select your repo
3. Railway auto-detects Node.js and builds with Nixpacks (`railway.json` is already configured)

### 3. Set environment variables
In Railway → your service → **Variables**, copy in the keys from `.env.example` at minimum:

| Variable | Required | Notes |
|---|---|---|
| `OWNER_NUMBER` | Recommended | Your WhatsApp number, digits only, with country code |
| `OWNER_NAME` / `BOT_NAME` | Recommended | Your own branding |
| `STARTUP_PASSWORD` | No | Only used by the legacy interactive prompt |
| `BOT_TOKEN` | No | Only if you want the Telegram control panel (`bot.js`) |
| `AUTO_PROMO` | No | Leave `false` unless you've read the section above |

Railway sets `PORT` automatically — don't override it.

### 4. Add a volume for session persistence
WhatsApp session data lives in `empirestore/pairing/`. Without a persistent volume, every
redeploy forces you to re-pair.

1. Railway → your service → **Volumes** tab
2. Add a volume, mount path: `/app/empirestore/pairing`

### 5. Deploy
Railway auto-deploys on every push. First deploy takes a few minutes (`npm install` pulls a large
dependency list).

### 6. Pair your WhatsApp
Open your Railway service's public URL in a browser. You'll land on the pairing page:
1. Enter your phone number (digits only, with country code, e.g. `15551234567`)
2. Click **Get pairing code**
3. On your phone: WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number
   instead" → enter the code before it expires (~60 seconds)

## Local development
```bash
cp .env.example .env
# fill in your .env values
npm install
npm start
# then open http://localhost:3000
```

## Project structure
```
.
├── index.js              # Express health server + web pairing API + bot bootstrap
├── pair.js                # Baileys connection/session/pairing logic
├── case.js                 # WhatsApp command handlers
├── bot.js                  # Optional Telegram control bot
├── setting/config.js       # Bot identity/branding (env-driven)
├── public/pair.html        # Web pairing UI
├── empirestore/pairing/    # Per-number session credentials (mount as a volume)
├── allfunc/, lib/          # Helper/utility modules used by commands
└── railway.json            # Railway build/deploy config
```

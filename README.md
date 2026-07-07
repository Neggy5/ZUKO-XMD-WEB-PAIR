# Akira MD v4 — Railway Deployment Guide

## Quick Deploy to Railway

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial Akira MD v4"
git remote add origin https://github.com/YOUR_USERNAME/akira-md.git
git push -u origin main
```

### 2. Create a Railway project
1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repo
3. Railway auto-detects Node.js and builds with nixpacks

### 3. Set Environment Variables
In Railway → your service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `BOT_TOKEN` | Your Telegram bot token from @BotFather |
| `STARTUP_PASSWORD` | Your desired startup password (default: `empire`) |

Optional (if you use MongoDB or MySQL):
- `MONGODB_URI`
- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DB`

### 4. Add a Volume for Persistence
WhatsApp session data lives in `empirestore/pairing/`. Without a volume it resets on every deploy.

1. Railway → your service → **Volumes** tab
2. Add volume, mount path: `/app/empirestore/pairing`

### 5. Deploy
Railway auto-deploys on every git push. First deploy may take ~3 minutes for `npm install`.

---

## Key Changes for Railway Compatibility
- **No password prompt** — the interactive readline prompt is removed. The bot auto-authenticates on server environments.
- **Environment variables** — `BOT_TOKEN` and `STARTUP_PASSWORD` read from env vars (see `.env.example`).
- **`railway.json`** — tells Railway to run `node index.js` and restart on failure.

## Local Development
```bash
cp .env.example .env
# fill in your .env values
npm install
npm start
```

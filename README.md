# Akira MD – Web Pairing (Vercel)

A clean, working WhatsApp bot web pairing page for **Akira MD v4**, deployable on Vercel.

## 🐛 Errors Fixed

| Error | Cause | Fix |
|---|---|---|
| `Failed to fetch` | Frontend tried to call `localhost:3000` – not reachable from Vercel | API is now a Vercel serverless function at `/api/pair` |
| `Unexpected token 'A'... is not valid JSON` | Server returned HTML error page, frontend tried to `JSON.parse` it | Added `content-type` check before parsing; all errors return proper JSON |
| CORS issues | No CORS headers on API | `allowCors` wrapper added to the API handler |

## 📂 Structure

```
web-pair/
├── api/
│   └── pair.js          ← Vercel serverless function (Baileys pairing)
├── public/
│   └── index.html       ← Frontend UI
├── vercel.json          ← Vercel routing config
├── package.json
└── .gitignore
```

## 🚀 Deploy to Vercel

### Step 1 – Push to GitHub

```bash
git init
git add .
git commit -m "Akira MD web pair"
gh repo create akira-md-web-pair --public --push
```

### Step 2 – Import on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework: **Other**
4. Root Directory: leave blank
5. Click **Deploy**

### Step 3 – Your pairing URL

After deploy: `https://your-project.vercel.app`

## ⚙️ How it works

1. User enters phone number (country code auto-selected)
2. Frontend POSTs to `/api/pair` with `{ phone: "2347081827038" }`
3. Serverless function spins up a temporary Baileys socket
4. Requests pairing code via `sock.requestPairingCode(phone)`
5. Returns `{ success: true, code: "ABCD-EFGH" }` as JSON
6. Frontend displays the code — user enters it in WhatsApp Linked Devices

## ⚠️ Important Notes

- This pairing page is **standalone** — it does NOT need your bot server to be running
- Each pairing request creates a temporary session that's deleted after use
- The Vercel function has a **30-second timeout** — enough for pairing
- For the bot itself to stay connected, run it separately on your XMD panel

## 🔧 Local Testing

```bash
npm install
npx vercel dev
# Opens at http://localhost:3000
```

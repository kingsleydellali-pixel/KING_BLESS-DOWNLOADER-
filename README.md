# KING_BLESS-DOWNLOADER-
---

🚀 Setup & Deployment

Local Setup

```bash
# 1. Create project folder
mkdir king-bless-downloader && cd king-bless-downloader

# 2. Copy the four files above into this folder

# 3. Install dependencies
npm install

# 4. Copy env example and edit
cp .env.example .env

# 5. Start the bot
npm start
```

Then open http://localhost:3000 in your browser, enter your WhatsApp number (with country code, no +), and click Get Pairing Code. Enter the 8-digit code in WhatsApp → Linked Devices → Link a Device → Link with phone number instead.

Deploy to Render (Free)

1. Push the project to a GitHub repository.
2. Go to render.com → New → Web Service.
3. Connect your repo — Render will auto-detect render.yaml.
4. Confirm the build command is npm install and start command is node index.js.
5. Deploy. Once live, open your Render URL and use the dashboard to pair.

Important: On Render's free tier, the filesystem resets on rebuilds. After a rebuild, you'll need to re-pair. For persistent sessions, mount a Render Disk or store the sessions/ folder externally.

---

✨ Feature Summary

Feature How It Works
Pairing Code Auth Uses sock.requestPairingCode(phone) — no QR scanning needed. Works perfectly in headless/server environments.
Embedded Dashboard Express server serves a gothic-styled HTML page with a blurred background image (backdrop-filter: blur(8px)).
YouTube Audio @distube/ytdl-core streams audio → sent as MP3 voice/file.
YouTube Video Streams video → sent as MP4 (with 100MB safety limit).
APK Search Generates direct search links — no API key required.
Universal dl Auto-detects YouTube vs. direct URL and sends the right media type.
Gothic Menus ASCII-art menus with Unicode gothic characters, random anime/dark images from free APIs.
No API Keys Every download uses ytdl-core; images use free public APIs (waifu.pics, nekos.best).
Auto-Reconnect Baileys connection.update handler reconnects on disconnect (except logout).

The bot is named KING_BLESS DOWNLOADER and credits KINGSLEY-XMD TECH throughout the dashboard, menus, and info cards.

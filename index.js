/**
 * ============================================================
 *  KING_BLESS DOWNLOADER
 *  Advanced WhatsApp Media Downloader Bot
 *  Developed by KINGSLEY-XMD TECH
 *  ------------------------------------------------------------
 *  Features:
 *   - Pairing code authentication (no QR needed)
 *   - Embedded Express web dashboard (gothic themed)
 *   - YouTube video/audio downloader (ytdl-core)
 *   - Random gothic images in bot menus
 *   - Interactive gothic-styled command menus
 *   - NO API KEYS REQUIRED
 * ============================================================
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  proto,
} from "@whiskeysockets/baileys";

import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import pino from "pino";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import dotenv from "dotenv";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ytdl from "@distube/ytdl-core";
import { pipeline } from "stream/promises";
import os from "os";

// ─── Setup ──────────────────────────────────────────────────
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegPath);

const BOT_NAME = process.env.BOT_NAME || "KING_BLESS DOWNLOADER";
const DEVELOPER = process.env.DEVELOPER || "KINGSLEY-XMD TECH";
const PREFIX = process.env.PREFIX || ".";
const PORT = process.env.PORT || 3000;
const SESSION_DIR = process.env.SESSION_DIR || "./sessions";
const USE_PAIRING = (process.env.USE_PAIRING_CODE || "true") === "true";
const BACKGROUND_URL =
  process.env.DASHBOARD_BACKGROUND_URL ||
  "https://images.unsplash.com/photo-1509248962906-9b5b4d7b7a0e?w=1920&q=80";

// ─── Logger ─────────────────────────────────────────────────
const logger = pino({ level: "silent" });

// ─── Global Store ───────────────────────────────────────────
const store = makeInMemoryStore({ logger });
let sock = null;
let pairingCode = null;
let connectionState = "disconnected";
let botNumber = null;

// ─── Gothic Random Images ───────────────────────────────────
// Free public APIs — no keys required
const GOTHIC_IMAGE_APIS = [
  "https://api.waifu.pics/sfw/dark",
  "https://api.waifu.pics/sfw/waifu",
  "https://nekos.best/api/v2/neko",
  "https://api.waifu.pics/sfw/shinobu",
];

async function getRandomGothicImage() {
  const api = GOTHIC_IMAGE_APIS[Math.floor(Math.random() * GOTHIC_IMAGE_APIS.length)];
  try {
    const { data } = await axios.get(api, { timeout: 8000 });
    // Different APIs return different shapes
    if (data.url) return data.url;
    if (data.results?.[0]?.url) return data.results[0].url;
    if (data.link) return data.link;
  } catch {
    // silent fail — fallback below
  }
  // Fallback: always-available gothic-ish Unsplash image
  return "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80";
}

// ─── Helper: send image from URL ────────────────────────────
async function sendImageFromUrl(jid, imageUrl, caption = "") {
  try {
    const { data } = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15000 });
    await sock.sendMessage(jid, { image: Buffer.from(data), caption });
    return true;
  } catch (err) {
    console.error(chalk.red(`[IMG ERROR] ${err.message}`));
    return false;
  }
}

// ─── Helper: download YouTube audio as buffer ───────────────
async function downloadYTAudio(url) {
  const stream = ytdl(url, { filter: "audioonly", quality: "highestaudio" });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ─── Helper: download YouTube video as buffer ───────────────
async function downloadYTVideo(url) {
  const stream = ytdl(url, { filter: "videoandaudio", quality: "highest" });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ─── Helper: get YouTube info ───────────────────────────────
async function getYTInfo(url) {
  const info = await ytdl.getInfo(url);
  const details = info.videoDetails;
  return {
    title: details.title,
    duration: details.lengthSeconds,
    thumb: details.thumbnails?.[details.thumbnails.length - 1]?.url,
    author: details.author?.name || "Unknown",
    views: details.viewCount,
  };
}

// ─── Format duration ────────────────────────────────────────
function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// ─── Gothic Menu Text ───────────────────────────────────────
function gothicMenuText(pushName = "User") {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour12: false });
  const date = now.toLocaleDateString("en-GB");

  return `
╔══════════════════════════════════════════════╗
║   ☠  𝕶 𝕴 𝕹 𝕲 _ 𝕭 𝕷 𝕰 𝕾 𝕾  ☠              ║
║   ═══════════════════════════════════         ║
║   ⚰  𝕯 𝕺 𝖂 𝕹 𝕷 𝕺 𝕬 𝕯 𝕰 𝕽  ⚰              ║
╚══════════════════════════════════════════════╝

┌─────────────────────────────────────────────┐
│  🦇  𝔚𝔢𝔩𝔠𝔬𝔪𝔢, ${pushName}
│  🕯  ${date}  •  ${time}
│  💀  Prefix: ${PREFIX}
└─────────────────────────────────────────────┘

╭━━━━━ ⛧ 𝕯𝕺𝕮𝕿𝕺𝕽 𝕮𝕺𝕸𝕸𝕬𝕹𝕯𝕾 ⛧ ━━━━━╮
┃
┃  🎵  ${PREFIX}song <name/url>
┃      → Download YouTube audio
┃
┃  🎬  ${PREFIX}video <name/url>
┃      → Download YouTube video
┃
┃  📱  ${PREFIX}apk <app name>
┃      → Search APK download links
┃
┃  🎧  ${PREFIX}mp3 <url>
┃      → Convert any media to MP3
┃
┃  📥  ${PREFIX}dl <url>
┃      → Universal media downloader
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━━━ ⛧ 𝕲𝕰𝕹𝕰𝕽𝕬𝕷 ⛧ ━━━━━╮
┃
┃  🏓  ${PREFIX}ping
┃  🖼  ${PREFIX}menu
┃  ℹ️  ${PREFIX}info
┃  👑  ${PREFIX}owner
┃  ⚙️  ${PREFIX}help
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

╔══════════════════════════════════════════════╗
║  ⚡ Powered by ${DEVELOPER}
║  🩸 ${BOT_NAME}
╚══════════════════════════════════════════════╝
`.trim();
}

// ─── Gothic Info Card ───────────────────────────────────────
function gothicInfoText() {
  return `
╔══════════════════════════════════════════════╗
║          ☠  𝕭 𝕺 𝕿  𝕴 𝕹 𝕱 𝕺  ☠              ║
╚══════════════════════════════════════════════╝

┌─────────────────────────────────────────────┐
│  🏴  Name      : ${BOT_NAME}
│  👑  Developer : ${DEVELOPER}
│  📦  Version   : 1.0.0
│  ⚙️  Engine    : Baileys (Multi-Device)
│  🖥  Dashboard : http://localhost:${PORT}
│  🔑  Auth      : Pairing Code
│  🎨  Theme     : Gothic / Dark
│  🚫  API Keys  : None Required
└─────────────────────────────────────────────┘

╔══════════════════════════════════════════════╗
║  🦇  "In darkness, we download."
║  ⚰  ${DEVELOPER}
╚══════════════════════════════════════════════╝
`.trim();
}

// ═════════════════════════════════════════════════════════════
//  EXPRESS WEB DASHBOARD (EMBEDDED)
// ═════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Dashboard HTML ─────────────────────────────────────────
function dashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${BOT_NAME} — Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Segoe UI', 'Georgia', serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: url('${BACKGROUND_URL}') center/cover no-repeat fixed;
    position: relative;
    overflow: hidden;
  }

  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 0;
  }

  .container {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 480px;
    padding: 20px;
  }

  .card {
    background: rgba(10, 10, 15, 0.85);
    border: 1px solid rgba(180, 30, 30, 0.4);
    border-radius: 16px;
    padding: 40px 35px;
    box-shadow: 0 0 60px rgba(150, 0, 0, 0.3),
                0 0 120px rgba(0, 0, 0, 0.8),
                inset 0 0 60px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: fadeIn 1.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .title {
    text-align: center;
    font-size: 1.8rem;
    font-weight: 700;
    letter-spacing: 3px;
    color: #e63946;
    text-shadow: 0 0 20px rgba(230, 57, 70, 0.6),
                 0 0 40px rgba(230, 57, 70, 0.3);
    margin-bottom: 5px;
    font-family: 'Georgia', serif;
  }

  .subtitle {
    text-align: center;
    font-size: 0.75rem;
    letter-spacing: 4px;
    color: #888;
    margin-bottom: 30px;
    text-transform: uppercase;
  }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, #b41e1e, transparent);
    margin: 20px 0;
  }

  label {
    display: block;
    font-size: 0.8rem;
    color: #aaa;
    margin-bottom: 8px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  input {
    width: 100%;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(180, 30, 30, 0.3);
    border-radius: 10px;
    color: #fff;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.3s, box-shadow 0.3s;
    letter-spacing: 1px;
  }

  input:focus {
    border-color: #e63946;
    box-shadow: 0 0 20px rgba(230, 57, 70, 0.3);
  }

  input::placeholder {
    color: #555;
  }

  button {
    width: 100%;
    padding: 15px;
    margin-top: 20px;
    background: linear-gradient(135deg, #8b0000, #e63946);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 2px;
    cursor: pointer;
    text-transform: uppercase;
    transition: transform 0.2s, box-shadow 0.3s, opacity 0.2s;
    box-shadow: 0 4px 25px rgba(230, 57, 70, 0.4);
  }

  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 35px rgba(230, 57, 70, 0.6);
  }

  button:active {
    transform: translateY(0);
    opacity: 0.85;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .code-box {
    margin-top: 25px;
    padding: 20px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px dashed rgba(230, 57, 70, 0.5);
    border-radius: 12px;
    text-align: center;
    display: none;
  }

  .code-box.visible { display: block; }

  .code-label {
    font-size: 0.7rem;
    color: #888;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }

  .code-value {
    font-size: 2rem;
    font-weight: 700;
    color: #e63946;
    letter-spacing: 6px;
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 20px rgba(230, 57, 70, 0.8);
  }

  .status {
    margin-top: 25px;
    padding: 12px;
    border-radius: 10px;
    text-align: center;
    font-size: 0.85rem;
    letter-spacing: 1px;
    transition: all 0.3s;
  }

  .status.connected {
    background: rgba(0, 200, 100, 0.15);
    border: 1px solid rgba(0, 200, 100, 0.4);
    color: #00c864;
  }

  .status.disconnected {
    background: rgba(230, 57, 70, 0.1);
    border: 1px solid rgba(230, 57, 70, 0.3);
    color: #e63946;
  }

  .status.waiting {
    background: rgba(255, 180, 0, 0.1);
    border: 1px solid rgba(255, 180, 0, 0.3);
    color: #ffb400;
  }

  .footer {
    text-align: center;
    margin-top: 30px;
    font-size: 0.65rem;
    color: #444;
    letter-spacing: 2px;
  }

  .footer span { color: #e63946; }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .instruction {
    font-size: 0.75rem;
    color: #777;
    text-align: center;
    margin-top: 15px;
    line-height: 1.6;
  }

  .instruction a { color: #e63946; text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <h1 class="title">☠ ${BOT_NAME}</h1>
    <p class="subtitle">by ${DEVELOPER}</p>
    <div class="divider"></div>

    <label for="phone">WhatsApp Phone Number</label>
    <input type="tel" id="phone" placeholder="e.g. 2348012345678" autocomplete="tel" />
    <p class="instruction">Include country code. No +, spaces, or dashes.</p>

    <button id="pairBtn" onclick="requestPairing()">🔑 Get Pairing Code</button>

    <div class="code-box" id="codeBox">
      <div class="code-label">Your Pairing Code</div>
      <div class="code-value" id="codeValue">--------</div>
    </div>

    <div class="status disconnected" id="statusBox">
      ⚡ Status: <strong id="statusText">Disconnected</strong>
    </div>

    <div class="footer">
      ⚰ <span>${DEVELOPER}</span> — All Rights Reserved
    </div>
  </div>
</div>

<script>
  const statusBox = document.getElementById('statusBox');
  const statusText = document.getElementById('statusText');
  const codeBox = document.getElementById('codeBox');
  const codeValue = document.getElementById('codeValue');
  const pairBtn = document.getElementById('pairBtn');
  const phoneInput = document.getElementById('phone');

  function setStatus(type, text) {
    statusBox.className = 'status ' + type;
    statusText.textContent = text;
  }

  async function requestPairing() {
    const phone = phoneInput.value.replace(/\\D/g, '');
    if (!phone || phone.length < 7) {
      alert('Please enter a valid phone number with country code (digits only).');
      return;
    }

    pairBtn.disabled = true;
    pairBtn.innerHTML = '<span class="spinner"></span>Requesting...';
    setStatus('waiting', 'Requesting pairing code...');

    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (data.success && data.code) {
        codeBox.classList.add('visible');
        codeValue.textContent = data.code;
        setStatus('waiting', 'Code generated — enter it in WhatsApp');
      } else {
        setStatus('disconnected', data.error || 'Failed to generate code');
        codeBox.classList.remove('visible');
      }
    } catch (err) {
      setStatus('disconnected', 'Network error — try again');
    } finally {
      pairBtn.disabled = false;
      pairBtn.innerHTML = '🔑 Get Pairing Code';
    }
  }

  // Poll connection status
  async function pollStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.state === 'connected') {
        setStatus('connected', 'Connected ✓');
        codeBox.classList.remove('visible');
      } else if (data.state === 'connecting') {
        setStatus('waiting', 'Connecting...');
      } else {
        setStatus('disconnected', 'Disconnected');
      }
    } catch {}
  }

  setInterval(pollStatus, 4000);
  pollStatus();

  // Allow Enter key
  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') requestPairing();
  });
</script>
</body>
</html>`;
}

// ─── Dashboard Routes ───────────────────────────────────────
app.get("/", (_req, res) => {
  res.send(dashboardHTML());
});

app.get("/api/status", (_req, res) => {
  res.json({ state: connectionState, botNumber });
});

app.post("/api/pair", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.replace(/\D/g, "").length < 7) {
      return res.status(400).json({ success: false, error: "Invalid phone number" });
    }

    const clean = phone.replace(/\D/g, "");

    if (!sock) {
      return res.status(500).json({ success: false, error: "Socket not initialised yet" });
    }

    // Request pairing code from WhatsApp
    const code = await sock.requestPairingCode(clean);
    pairingCode = code;
    console.log(chalk.hex("#e63946")(`\n🔑 PAIRING CODE for ${clean}: ${code}\n`));

    res.json({ success: true, code });
  } catch (err) {
    console.error(chalk.red(`[PAIR ERROR] ${err.message}`));
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Health check for Render ────────────────────────────────
app.get("/health", (_req, res) => res.status(200).send("OK"));

// ─── Start Express ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(
    chalk.hex("#e63946")(`\n╔══════════════════════════════════════════╗`)
  );
  console.log(
    chalk.hex("#e63946")(`║  🖥  DASHBOARD: http://localhost:${PORT}      ║`)
  );
  console.log(
    chalk.hex("#e63946")(`╚══════════════════════════════════════════╝\n`)
  );
});

// ═════════════════════════════════════════════════════════════
//  WHATSAPP BOT CONNECTION
// ═════════════════════════════════════════════════════════════
async function startBot() {
  console.log(
    chalk.hex("#e63946")(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ☠  𝕶 𝕴 𝕹 𝕲 _ 𝕭 𝕷 𝕰 𝕾 𝕾  ☠                        ║
║   ═══════════════════════════════════════                 ║
║   ⚰  𝕯 𝕺 𝖂 𝕹 𝕷 𝕺 𝕬 𝕯 𝕰 𝕽  ⚰                        ║
║                                                          ║
║   Developed by ${DEVELOPER.padEnd(38)}║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`)
  );

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: !USE_PAIRING, // QR only if pairing disabled
    auth: state,
    browser: ["KING_BLESS", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    defaultQueryTimeoutMs: 60000,
  });

  store.bind(sock.ev);

  // ─── Connection Updates ───────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !USE_PAIRING) {
      console.log(chalk.hex("#e63946")("\n📱 Scan this QR code with WhatsApp:\n"));
      const qrcode = await import("qrcode-terminal");
      qrcode.default.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      connectionState = "connecting";
      console.log(chalk.yellow("⏳ Connecting to WhatsApp..."));
    }

    if (connection === "open") {
      connectionState = "connected";
      botNumber = sock.user?.id?.split(":")[0]?.split("@")[0] || null;
      console.log(
        chalk.hex("#00c864")(`\n✅ BOT CONNECTED! Number: ${botNumber}\n`)
      );
    }

    if (connection === "close") {
      connectionState = "disconnected";
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      console.log(
        chalk.red(`\n⚠️  Connection closed (code: ${code}). Reconnecting: ${shouldReconnect}\n`)
      );

      if (shouldReconnect) {
        setTimeout(() => startBot(), 5000);
      } else {
        console.log(chalk.red("🚫 Logged out. Delete session folder and restart."));
      }
    }
  });

  // ─── Save Credentials ─────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ─── Message Handler ──────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      const isGroup = jid.endsWith("@g.us");
      const pushName = msg.pushName || "User";

      // Extract text
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      if (!text) continue;

      const trimmed = text.trim();
      const args = trimmed.slice(PREFIX.length).trim().split(/\\s+/);
      const command = args[0]?.toLowerCase();
      const query = args.slice(1).join(" ");

      if (!trimmed.startsWith(PREFIX)) continue;

      console.log(
        chalk.hex("#e63946")(`[CMD] ${pushName}: ${trimmed}`)
      );

      // ── MENU ─────────────────────────────────────────────
      if (command === "menu" || command === "help" || command === "start") {
        const menuText = gothicMenuText(pushName);
        const imgUrl = await getRandomGothicImage();
        const sent = await sendImageFromUrl(jid, imgUrl, menuText);
        if (!sent) {
          await sock.sendMessage(jid, { text: menuText });
        }
        continue;
      }

      // ── INFO ─────────────────────────────────────────────
      if (command === "info" || command === "about") {
        const infoText = gothicInfoText();
        const imgUrl = await getRandomGothicImage();
        const sent = await sendImageFromUrl(jid, imgUrl, infoText);
        if (!sent) {
          await sock.sendMessage(jid, { text: infoText });
        }
        continue;
      }

      // ── OWNER ────────────────────────────────────────────
      if (command === "owner") {
        const ownerText = `
╔══════════════════════════════════════════════╗
║            👑  𝕺 𝖂 𝕹 𝕰 𝕽  👑                ║
╚══════════════════════════════════════════════╝

  🏴  ${DEVELOPER}
  🦇  Creator of ${BOT_NAME}
  💀  "In darkness, we download."

╔══════════════════════════════════════════════╗
║  ⚰  Contact for bot deployment & support    ║
╚══════════════════════════════════════════════╝
`.trim();
        await sock.sendMessage(jid, { text: ownerText });
        continue;
      }

      // ── PING ─────────────────────────────────────────────
      if (command === "ping") {
        const start = Date.now();
        await sock.sendMessage(jid, { text: "🏓 Pinging..." });
        const latency = Date.now() - start;
        await sock.sendMessage(jid, {
          text: `🏓 Pong!\n⚡ Latency: ${latency}ms\n🖥 Status: ${connectionState}`,
        });
        continue;
      }

      // ── SONG / MP3 ───────────────────────────────────────
      if (command === "song" || command === "mp3" || command === "audio") {
        if (!query) {
          await sock.sendMessage(jid, {
            text: `🎵 Usage: ${PREFIX}song <YouTube URL or search term>`,
          });
          continue;
        }

        await sock.sendMessage(jid, { text: "🔍 Searching and downloading audio..." });

        try {
          let url = query;
          if (!query.startsWith("http")) {
            // Search via ytdl (simple approach — use the query as a search term)
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            // ytdl doesn't have search; we'll use yt-search alternative: just inform user
            await sock.sendMessage(jid, {
              text: `❌ Please provide a direct YouTube URL for now.\\nExample: ${PREFIX}song https://youtu.be/xxxxx`,
            });
            continue;
          }

          const info = await getYTInfo(url);
          await sock.sendMessage(jid, {
            text: `🎵 Downloading: *${info.title}*\\n⏱ Duration: ${fmtDuration(Number(info.duration))}\\n👤 ${info.author}`,
          });

          const audioBuffer = await downloadYTAudio(url);

          await sock.sendMessage(
            jid,
            {
              audio: audioBuffer,
              mimetype: "audio/mpeg",
              fileName: `${info.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`,
              ptt: false,
            },
            { quoted: msg }
          );

          console.log(chalk.hex("#00c864")(`[AUDIO SENT] ${info.title}`));
        } catch (err) {
          console.error(chalk.red(`[SONG ERROR] ${err.message}`));
          await sock.sendMessage(jid, {
            text: `❌ Failed to download audio.\\nError: ${err.message}`,
          });
        }
        continue;
      }

      // ── VIDEO / MP4 ──────────────────────────────────────
      if (command === "video" || command === "mp4" || command === "yt") {
        if (!query) {
          await sock.sendMessage(jid, {
            text: `🎬 Usage: ${PREFIX}video <YouTube URL>`,
          });
          continue;
        }

        await sock.sendMessage(jid, { text: "🔍 Downloading video..." });

        try {
          let url = query;
          if (!query.startsWith("http")) {
            await sock.sendMessage(jid, {
              text: `❌ Please provide a direct YouTube URL.\\nExample: ${PREFIX}video https://youtu.be/xxxxx`,
            });
            continue;
          }

          const info = await getYTInfo(url);

          // Check size — Baileys can't send > ~100MB easily
          const videoBuffer = await downloadYTVideo(url);

          if (videoBuffer.length > 100 * 1024 * 1024) {
            await sock.sendMessage(jid, {
              text: `❌ Video too large (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB). Max ~100MB for WhatsApp.`,
            });
            continue;
          }

          await sock.sendMessage(
            jid,
            {
              video: videoBuffer,
              mimetype: "video/mp4",
              fileName: `${info.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`,
              caption: `🎬 *${info.title}*\\n⏱ ${fmtDuration(Number(info.duration))}\\n👤 ${info.author}`,
            },
            { quoted: msg }
          );

          console.log(chalk.hex("#00c864")(`[VIDEO SENT] ${info.title}`));
        } catch (err) {
          console.error(chalk.red(`[VIDEO ERROR] ${err.message}`));
          await sock.sendMessage(jid, {
            text: `❌ Failed to download video.\\nError: ${err.message}`,
          });
        }
        continue;
      }

      // ── APK ──────────────────────────────────────────────
      if (command === "apk") {
        if (!query) {
          await sock.sendMessage(jid, {
            text: `📱 Usage: ${PREFIX}apk <app name>\\nExample: ${PREFIX}apk whatsapp`,
          });
          continue;
        }

        const searchUrl = `https://apkcombo.com/search/${encodeURIComponent(query)}`;
        await sock.sendMessage(jid, {
          text: `
╔══════════════════════════════════════════════╗
║          📱  𝕬 𝕻 𝕶  𝕾 𝕰 𝕬 𝕽 𝕮 𝕳  📱        ║
╚══════════════════════════════════════════════╝

🔍 Search: *${query}*

📥 Download links:
🔗 ${searchUrl}

⚠️ Always verify APK sources before installing.
`.trim(),
        });
        continue;
      }

      // ── UNIVERSAL DOWNLOAD ───────────────────────────────
      if (command === "dl" || command === "download") {
        if (!query) {
          await sock.sendMessage(jid, {
            text: `📥 Usage: ${PREFIX}dl <URL>\\nSupports: YouTube, and direct media URLs.`,
          });
          continue;
        }

        try {
          const url = query.trim();
          if (ytdl.validateURL(url)) {
            // YouTube — send as video
            await sock.sendMessage(jid, { text: "🎬 Detected YouTube URL. Downloading video..." });
            const videoBuffer = await downloadYTVideo(url);
            await sock.sendMessage(jid, {
              video: videoBuffer,
              mimetype: "video/mp4",
              caption: "📥 Downloaded via KING_BLESS DOWNLOADER",
            });
          } else {
            // Direct file URL
            const { data, headers } = await axios.get(url, {
              responseType: "arraybuffer",
              timeout: 60000,
            });
            const contentType = headers["content-type"] || "application/octet-stream";
            const buffer = Buffer.from(data);

            if (contentType.includes("video")) {
              await sock.sendMessage(jid, { video: buffer, mimetype: contentType });
            } else if (contentType.includes("audio")) {
              await sock.sendMessage(jid, { audio: buffer, mimetype: contentType });
            } else if (contentType.includes("image")) {
              await sock.sendMessage(jid, { image: buffer });
            } else {
              await sock.sendMessage(jid, {
                document: buffer,
                mimetype: contentType,
                fileName: "download",
              });
            }
          }
        } catch (err) {
          await sock.sendMessage(jid, {
            text: `❌ Download failed: ${err.message}`,
          });
        }
        continue;
      }

      // ── UNKNOWN COMMAND ──────────────────────────────────
      if (trimmed.startsWith(PREFIX)) {
        await sock.sendMessage(jid, {
          text: `⚠️ Unknown command: *${command}*\\nType ${PREFIX}menu for available commands.`,
        });
      }
    }
  });

  // ─── Decode JID helper ────────────────────────────────────
  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:[0-9]+@s\\.whatsapp\\.net/.test(jid))
      jid = jid.replace(/:[0-9]+@s\\.whatsapp\\.net/, "@s.whatsapp.net");
    if (jid.endsWith("@s.whatsapp.net")) {
      const decoded = jidDecode(jid);
      if (decoded) jid = decoded.user + "@s.whatsapp.net";
    }
    return jid;
  };
}

// ─── Graceful Shutdown ──────────────────────────────────────
process.on("SIGINT", async () => {
  console.log(chalk.yellow("\\n🛑 Shutting down..."));
  if (sock) {
    try { await sock.logout(); } catch {}
  }
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error(chalk.red(`[UNCAUGHT] ${err.message}`));
});

process.on("unhandledRejection", (err) => {
  console.error(chalk.red(`[UNHANDLED] ${err}`));
});

// ─── BOOT ────────────────────────────────────────────────────
startBot();
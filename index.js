// index.js
// SIMPLE HTTP server + Telegram webhook handler -> Gemini Flash
// Edit TELEGRAM_TOKEN and GEMINI_API_KEY below before running/deploying.

const TELEGRAM_TOKEN = '8129073360:AAF2IsU2nItirHAbQBRbPRx-OqiXF2tfuBw'; // e.g. '123456:ABC-DEF...'
const GEMINI_API_KEY = 'AIzaSyCDOrIKLWtouXxaqBNP6UG1WOOuSI__eRo'; // e.g. 'AIzaSy...'
const GEMINI_MODEL = 'models/gemini-flash';

const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const MAX_OUTPUT_TOKENS = 256;
const TEMPERATURE = 0.5;

// Basic checks
if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN.includes('PASTE_YOUR')) {
  console.error('ERROR: Edit index.js and set TELEGRAM_TOKEN');
}
if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('PASTE_YOUR')) {
  console.error('ERROR: Edit index.js and set GEMINI_API_KEY');
}

const bot = new Telegraf(TELEGRAM_TOKEN);

// Minimal in-memory per-chat context
const chatContext = new Map();
const MAX_CONTEXT = 6;

async function callGemini(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta2/${GEMINI_MODEL}:generateText`;
  const payload = {
    prompt: { text: prompt },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    candidate_count: 1
  };

  const resp = await axios.post(endpoint, payload, {
    params: { key: GEMINI_API_KEY },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  });

  const data = resp.data;
  if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
    const c = data.candidates[0];
    return (c.output || c.content || c.text || '').toString().trim();
  }
  if (data && data.output) return String(data.output).trim();
  return JSON.stringify(data);
}

// Telegraf handlers (used for processing updates)
bot.start((ctx) => ctx.reply('Halo — kirim pesan, saya akan meneruskan ke Gemini Flash.'));
bot.command('reset', (ctx) => {
  chatContext.delete(ctx.chat.id);
  ctx.reply('Konteks di-reset.');
});

bot.on('text', async (ctx) => {
  if (TELEGRAM_TOKEN.includes('PASTE_YOUR') || GEMINI_API_KEY.includes('PASTE_YOUR')) {
    await ctx.reply('Bot belum dikonfigurasi. Edit index.js dan masukkan token API.');
    return;
  }

  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  await ctx.sendChatAction('typing');

  const hist = chatContext.get(chatId) || [];
  hist.push(`User: ${text}`);
  const prompt = `${hist.slice(-MAX_CONTEXT).join('\n')}\nAssistant:`;

  try {
    const reply = await callGemini(prompt);
    hist.push(`Assistant: ${reply}`);
    chatContext.set(chatId, hist.slice(-MAX_CONTEXT * 2));
    const out = reply.length > 4000 ? reply.slice(0, 3997) + '...' : reply;
    await ctx.reply(out);
  } catch (err) {
    console.error('Gemini error', err?.response?.data || err.message || err);
    await ctx.reply('Maaf, terjadi kesalahan saat menghubungi AI.');
  }
});

// Express app to expose webhook endpoint
const app = express();
app.use(bodyParser.json());

// Telegram will POST updates here; set webhook to https://your-domain.com/webhook
app.post('/webhook', async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook handling error', err);
    res.status(500).send('Error');
  }
});

// simple root
app.get('/', (req, res) => res.send('Telegram Gemini Flash bot is running'));

// start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('Set Telegram webhook to:');
  console.log(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=<YOUR_PUBLIC_URL>/webhook`);
});

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const bot = new TelegramBot(BOT_TOKEN);

module.exports = async (req, res) => {
  const update = req.body;
  const msg = update?.message;

  if (!msg || !msg.text) return res.status(200).send('OK');

  const chatId = msg.chat.id;

  // TESTE 1: Telegram (enviar mensagem)
  try {
    await bot.sendMessage(chatId, '🟢 TESTE 1: Telegram OK');
  } catch (e) {
    console.error('FALHA TELEGRAM:', e.message);
    return res.status(200).send('OK');
  }

  // TESTE 2: Supabase (banco de dados)
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error } = await supabase.from('conversas_charlene').select('*').limit(1);
    if (error) {
      await bot.sendMessage(chatId, '🔴 TESTE 2 - SUPABASE ERRO: ' + error.message);
    } else {
      await bot.sendMessage(chatId, '🟢 TESTE 2: Supabase OK');
    }
  } catch (e) {
    await bot.sendMessage(chatId, '🔴 TESTE 2 - SUPABASE FALHA: ' + e.message);
  }

  // TESTE 3: Gemini (inteligência artificial)
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responda apenas: ok' }] }]
        })
      }
    );
    const data = await response.json();
    if (!response.ok || data.error) {
      await bot.sendMessage(chatId, '🔴 TESTE 3 - GEMINI ERRO: ' + (data.error?.message || 'desconhecido'));
    } else {
      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || 'vazio';
      await bot.sendMessage(chatId, '🟢 TESTE 3: Gemini OK → ' + texto);
    }
  } catch (e) {
    await bot.sendMessage(chatId, '🔴 TESTE 3 - GEMINI FALHA: ' + e.message);
  }

  await bot.sendMessage(chatId, '✅ Diagnóstico finalizado');
  return res.status(200).send('OK');
};

// api/telegram.js
// Webhook do Charlene Assistente para Vercel

module.exports = async function handler(req, res) {
  // Headers CORS para evitar bloqueios
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder requisições OPTIONS imediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET = teste no navegador
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Charlene online! 🤖' });
  }

  // POST = webhook do Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const update = req.body;

    console.log('📩 Recebido:', JSON.stringify(update));

    if (!update || !update.message) {
      console.log('⚠️ Nenhuma mensagem no update');
      return res.status(200).json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || '';
    const firstName = message.from?.first_name || 'usuário';

    console.log(`💬 Mensagem de ${firstName} (${chatId}): ${text}`);

    let replyText = '';

    // Comandos do bot
    if (text === '/start') {
      replyText = `Olá, ${firstName}! 👋\n\nSou a Charlene, sua assistente. Como posso ajudar?`;
    } else if (text === '/ajuda' || text === '/help') {
      replyText = `📋 Comandos disponíveis:\n\n/start - Iniciar conversa\n/ajuda - Ver esta mensagem\n\nOu simplesmente me envie uma mensagem!`;
    } else {
      replyText = `Você disse: "${text}"\n\nEstou aprendendo ainda, mas em breve responderei com mais inteligência! 🤖`;
    }

    // Enviar resposta pelo Telegram
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        parse_mode: 'HTML'
      })
    });

    const responseData = await response.json();

    console.log('📤 Resposta do Telegram:', JSON.stringify(responseData));

    if (!responseData.ok) {
      console.error('❌ Erro ao enviar mensagem:', responseData);
      return res.status(200).json({ ok: false, error: responseData });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(200).json({ ok: false, error: error.message });
  }
};

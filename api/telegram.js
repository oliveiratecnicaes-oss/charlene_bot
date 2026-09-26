module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Charlene online!' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    const update = req.body;
    console.log('Recebido:', JSON.stringify(update));

    if (!update || !update.message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || '';
    const firstName = update.message.from.first_name || 'usuario';

    console.log('Mensagem de ' + firstName + ': ' + text);

    let replyText = '';

    if (text === '/start') {
      replyText = 'Ola, ' + firstName + '! Sou a Charlene. Como posso ajudar?';
    } else if (text === '/ajuda') {
      replyText = 'Comandos: /start /ajuda';
    } else {
      replyText = 'Voce disse: ' + text;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText
      })
    });

    const data = await response.json();
    console.log('Resposta Telegram:', JSON.stringify(data));

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Erro:', error);
    return res.status(200).json({ ok: false, error: error.message });
  }
};

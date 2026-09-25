// Charlene Bot - Versão simples para Vercel
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Função pra enviar mensagem
async function sendMessage(chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
  });
  return res.json();
}

// Função pra buscar chamados no Supabase
async function getChamados() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chamados?select=*&order=created_at.desc&limit=5`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  return res.json();
}

// Handler principal do Vercel
export default async function handler(req, res) {
  // GET = teste no navegador
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Charlene online! 🤖' });
  }

  // POST = webhook do Telegram
  if (req.method === 'POST') {
    try {
      const update = req.body;
      const message = update.message;

      if (!message) {
        return res.status(200).json({ status: 'ok' });
      }

      const chatId = message.chat.id;
      const text = message.text || '';
      const userName = message.from.first_name || 'usuário';

      // /start
      if (text === '/start') {
        await sendMessage(chatId,
          `Olá ${userName}! 👋\n\n` +
          `Sou a Charlene, assistente da Oliveira Técnicas.\n\n` +
          `Posso te ajudar com:\n` +
          `• Consultar chamados\n` +
          `• Ver status de serviços\n` +
          `• Informações gerais\n\n` +
          `Digite /ajuda para ver todos os comandos.`
        );
        return res.status(200).json({ status: 'ok' });
      }

      // /ajuda
      if (text === '/ajuda') {
        await sendMessage(chatId,
          `Comandos disponíveis:\n\n` +
          `/start - Iniciar conversa\n` +
          `/ajuda - Ver esta mensagem\n` +
          `/chamados - Ver últimos chamados\n` +
          `/status - Status do sistema\n\n` +
          `Em breve mais funcionalidades! 🚀`
        );
        return res.status(200).json({ status: 'ok' });
      }

      // /chamados
      if (text === '/chamados') {
        try {
          const chamados = await getChamados();
          
          if (chamados && chamados.length > 0) {
            let msg = '📋 Últimos chamados:\n\n';
            chamados.forEach((c, i) => {
              msg += `${i + 1}. ${c.titulo || 'Sem título'}\n`;
              msg += `   Status: ${c.status || 'N/A'}\n`;
              msg += `   Data: ${new Date(c.created_at).toLocaleDateString('pt-BR')}\n\n`;
            });
            await sendMessage(chatId, msg);
          } else {
            await sendMessage(chatId, 'Nenhum chamado encontrado.');
          }
        } catch (err) {
          await sendMessage(chatId, 'Erro ao buscar chamados. Tente novamente.');
        }
        return res.status(200).json({ status: 'ok' });
      }

      // /status
      if (text === '/status') {
        await sendMessage(chatId,
          '✅ Sistema operacional\n\n' +
          'Charlene: Online\n' +
          'Supabase: Conectado\n' +
          'Telegram: Funcionando'
        );
        return res.status(200).json({ status: 'ok' });
      }

      // Mensagem padrão
      await sendMessage(chatId,
        `Desculpe ${userName}, não entendi o comando.\n\n` +
        `Digite /ajuda para ver os comandos disponíveis.`
      );
      return res.status(200).json({ status: 'ok' });

    } catch (error) {
      console.error('Erro:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

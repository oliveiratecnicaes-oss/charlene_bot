// Charlene Bot - Versão CommonJS (compatível com Vercel)
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Logs de debug para verificar se as variáveis carregaram
console.log('🔑 TELEGRAM_BOT_TOKEN carregado:', TELEGRAM_TOKEN ? 'SIM' : 'NÃO');
console.log('🔗 SUPABASE_URL carregada:', SUPABASE_URL ? 'SIM' : 'NÃO');
console.log('🔐 SUPABASE_KEY carregada:', SUPABASE_KEY ? 'SIM' : 'NÃO');

// Função para enviar mensagem
async function sendMessage(chatId, text) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    console.log('📤 Resposta do Telegram:', JSON.stringify(data));
    return data;
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem:', err);
    throw err;
  }
}

// Função para buscar chamados no Supabase
async function getChamados() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chamados?select=*&order=created_at.desc&limit=5`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    return await res.json();
  } catch (err) {
    console.error('❌ Erro ao buscar chamados:', err);
    throw err;
  }
}

// Handler principal do Vercel
module.exports = async function handler(req, res) {
  // GET = teste no navegador
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Charlene online! 🤖' });
  }

  // POST = webhook do Telegram
  if (req.method === 'POST') {
    try {
      console.log('📩 Recebido:', JSON.stringify(req.body));
      
      const update = req.body;
      const message = update.message;

      if (!message) {
        console.log('⚠️ Sem mensagem no update');
        return res.status(200).json({ status: 'ok' });
      }

      const chatId = message.chat.id;
      const text = message.text || '';
      const userName = message.from.first_name || 'usuário';

      console.log(`💬 Mensagem de ${userName} (${chatId}): ${text}`);

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
          console.error('Erro ao buscar chamados:', err);
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
      console.error('❌ Erro no handler:', error);
      return res.status(200).json({ status: 'ok' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
};

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Configuração
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inicializar Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Inicializar bot (sem polling, só webhook)
const bot = new TelegramBot(token, { polling: false });

// Handler do Vercel
module.exports = async function handler(req, res) {
  // Aceitar qualquer método (GET pra teste, POST pra webhook)
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Charlene online! 🤖' });
  }

  if (req.method === 'POST') {
    try {
      const update = req.body;
      
      // Processar o update via webhook
      bot.processUpdate(update);
      
      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Erro:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

// Processar mensagens (listener do bot)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const from = msg.from;
  const userName = from.first_name || 'usuário';

  try {
    // Comando /start
    if (text === '/start') {
      await bot.sendMessage(chatId, 
        `Olá ${userName}! 👋\n\n` +
        `Sou a Charlene, assistente da Oliveira Técnicas.\n\n` +
        `Posso te ajudar com:\n` +
        `• Consultar chamados\n` +
        `• Ver status de serviços\n` +
        `• Informações gerais\n\n` +
        `Digite /ajuda para ver todos os comandos.`
      );
      return;
    }

    // Comando /ajuda
    if (text === '/ajuda') {
      await bot.sendMessage(chatId, 
        `Comandos disponíveis:\n\n` +
        `/start - Iniciar conversa\n` +
        `/ajuda - Ver esta mensagem\n` +
        `/chamados - Ver últimos chamados\n` +
        `/status - Status do sistema\n\n` +
        `Em breve mais funcionalidades! `
      );
      return;
    }

    // Comando /chamados
    if (text === '/chamados') {
      const { data, error } = await supabase
        .from('chamados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (data && data.length > 0) {
        let mensagem = '📋 Últimos chamados:\n\n';
        data.forEach((chamado, index) => {
          mensagem += `${index + 1}. ${chamado.titulo || 'Sem título'}\n`;
          mensagem += `   Status: ${chamado.status || 'N/A'}\n`;
          mensagem += `   Data: ${new Date(chamado.created_at).toLocaleDateString('pt-BR')}\n\n`;
        });
        await bot.sendMessage(chatId, mensagem);
      } else {
        await bot.sendMessage(chatId, 'Nenhum chamado encontrado.');
      }
      return;
    }

    // Comando /status
    if (text === '/status') {
      await bot.sendMessage(chatId, 
        '✅ Sistema operacional\n\n' +
        'Charlene: Online\n' +
        'Supabase: Conectado\n' +
        'Telegram: Funcionando'
      );
      return;
    }

    // Mensagem padrão
    await bot.sendMessage(chatId, 
      `Desculpe ${userName}, não entendi o comando.\n\n` +
      `Digite /ajuda para ver os comandos disponíveis.`
    );

  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    await bot.sendMessage(chatId, 'Ops! Algo deu errado. Tente novamente em instantes.');
  }
});

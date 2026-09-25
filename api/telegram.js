const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Configuração
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inicializar Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Inicializar bot
const bot = new TelegramBot(token, { polling: false });

// Handler principal
export default async function handler(req, res) {
  // Verificar se é webhook do Telegram
  if (req.method === 'POST') {
    const update = req.body;
    
    // Verificar se tem mensagem
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || '';
      const from = update.message.from;
      
      // Processar comando
      await processMessage(chatId, text, from);
    }
    
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(200).json({ status: 'Charlene online!' });
  }
}

// Processar mensagens
async function processMessage(chatId, text, from) {
  const userName = from.first_name || 'usuário';
  
  // Comando /start
  if (text === '/start') {
    await bot.sendMessage(chatId, `Olá ${userName}! 👋\n\nSou a Charlene, assistente da Oliveira Técnicas.\n\nPosso te ajudar com:\n• Consultar chamados\n• Ver status de serviços\n• Informações gerais\n\nDigite /ajuda para ver todos os comandos.`);
    return;
  }
  
  // Comando /ajuda
  if (text === '/ajuda') {
    await bot.sendMessage(chatId, `Comandos disponíveis:\n\n/start - Iniciar conversa\n/ajuda - Ver esta mensagem\n/chamados - Ver últimos chamados\n/status - Status do sistema\n\nEm breve mais funcionalidades! 🚀`);
    return;
  }
  
  // Comando /chamados
  if (text === '/chamados') {
    try {
      // Buscar últimos 5 chamados do Supabase
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
    } catch (error) {
      await bot.sendMessage(chatId, 'Erro ao buscar chamados. Tente novamente.');
      console.error(error);
    }
    return;
  }
  
  // Comando /status
  if (text === '/status') {
    await bot.sendMessage(chatId, '✅ Sistema operacional\n\nCharlene: Online\nSupabase: Conectado\nTelegram: Funcionando');
    return;
  }
  
  // Mensagem padrão
  await bot.sendMessage(chatId, `Desculpe ${userName}, não entendi o comando.\n\nDigite /ajuda para ver os comandos disponíveis.`);
}


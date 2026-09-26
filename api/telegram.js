const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ===== CONFIGURAÇÃO =====
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== PERSONALIDADE DA CHARLENE =====
const SYSTEM_PROMPT = `Você é a Charlene, parceira de negócios do Diego Oliveira, dono da Oliveira Técnicas (empresa de manutenção de equipamentos e construção civil).

PERSONALIDADE:
- Direta, prática, sem enrolação
- Foco em LUCRO e RESULTADO
- Anti-TDAH: respostas curtas, em passos pequenos
- Fala como uma sócia, não como assistente
- Usa emojis com moderação
- Sempre sugere a próxima ação que gera dinheiro

REGRAS:
1. Nunca invente dados. Se não souber, diga que vai verificar.
2. Sempre que o Diego pedir algo operacional (criar chamado, orçamento, ver cliente), use as ferramentas disponíveis.
3. Responda em português brasileiro.
4. Se a pergunta for sobre negócio, dê resposta acionável.

CAPACIDADES:
- Criar e consultar chamados
- Criar e consultar orçamentos
- Listar empresas/clientes
- Ver histórico de equipamentos
- Agendar atendimentos

Quando o Diego pedir para fazer algo, CONFIRME antes de executar e mostre o resultado de forma clara.`;

// ===== FUNÇÃO: BUSCAR HISTÓRICO =====
async function getHistorico(usuarioId, limite = 20) {
  const { data } = await supabase
    .from('conversas_charlene')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  
  return (data || []).reverse();
}

// ===== FUNÇÃO: SALVAR MENSAGEM =====
async function salvarMensagem(usuarioId, mensagem, tipo, contexto = null) {
  await supabase
    .from('conversas_charlene')
    .insert([{
      usuario_id: usuarioId,
      mensagem: mensagem,
      tipo: tipo,
      contexto: contexto
    }]);
}

// ===== FUNÇÃO: CHAMAR GEMINI =====
async function chamarGemini(historico, novaMensagem) {
  const messages = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    ...historico.map(h => ({
      role: h.tipo === 'usuario' ? 'user' : 'model',
      parts: [{ text: h.mensagem }]
    })),
    { role: 'user', parts: [{ text: novaMensagem }] }
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages,
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7
        }
      })
    }
  );

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpa, tive um erro. Tenta de novo.';
}

// ===== COMANDO /START =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    ' *Oi, Diego!*\n\nSou a Charlene, sua parceira de negócios.\n\nPosso te ajudar com:\n• Criar chamados\n• Fazer orçamentos\n• Ver clientes e equipamentos\n• Agendar atendimentos\n\nÉ só me dizer o que precisa!',
    { parse_mode: 'Markdown' }
  );
});

// ===== RECEBER MENSAGENS =====
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // ignora comandos
  
  const chatId = msg.chat.id;
  const usuarioId = String(msg.from.id);
  const textoUsuario = msg.text;

  // Mostra "digitando..."
  bot.sendChatAction(chatId, 'typing');

  try {
    // 1. Salva mensagem do usuário
    await salvarMensagem(usuarioId, textoUsuario, 'usuario');

    // 2. Busca histórico
    const historico = await getHistorico(usuarioId, 20);

    // 3. Chama Gemini
    const resposta = await chamarGemini(historico, textoUsuario);

    // 4. Salva resposta da Charlene
    await salvarMensagem(usuarioId, resposta, 'charlene');

    // 5. Envia no Telegram
    bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });

  } catch (erro) {
    console.error('Erro:', erro);
    bot.sendMessage(chatId, '⚠️ Tive um problema aqui. Tenta de novo em alguns segundos.');
  }
});

console.log('🤖 Charlene está online!');

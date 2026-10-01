// ============================================
// CHARLENE BOT v3.0 - ARQUITETURA MODULAR
// ============================================
// Olá, Regina! Esta é a versão refatorada.
// Melhorei a organização, removi valores fixos e implementei
// o sistema de prompt genérico que você desenhou.
// A lógica e o comportamento continuam os mesmos.
// ============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// --- 1. CONFIGURAÇÃO CENTRALIZADA ---
// Melhoria: Todas as configurações e clientes de serviços foram agrupados aqui.
// Facilita a manutenção e evita a repetição de inicializações.

const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- 2. SERVIÇOS ABSTRAÍDOS ---
// Melhoria: As interações com APIs externas (Telegram, Gemini, Supabase)
// foram isoladas em seus próprios objetos. Se um dia você trocar o Supabase pelo
// Firebase, por exemplo, só precisará modificar o `databaseService`.

const telegramService = {
  async sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  },
};

const aiService = {
  async generateResponse(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
        }),
      });
      const data = await response.json();
      if (!data.candidates || !data.candidates[0]?.content.parts[0]?.text) {
        console.error('Resposta inesperada da API Gemini:', data);
        return 'Ops, minha conexão neural falhou. Pode repetir, por favor?';
      }
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Erro ao chamar a API Gemini:', error);
      return 'Estou com dificuldade para processar meu raciocínio agora. Tente novamente em um instante.';
    }
  },
};

const databaseService = {
  // Melhoria: Funções de banco de dados agora recebem `userId`.
  // Isso remove a dependência de um ID fixo e prepara o bot para múltiplos usuários.
  saveMessage: (userId, mensagem, tipo) =>
    supabase.from('conversas_charlene').insert({ usuario_id: userId, mensagem, tipo }),

  getRecentContext: async (userId, limit = 5) => {
    const { data } = await supabase
      .from('conversas_charlene')
      .select('mensagem, tipo')
      .eq('usuario_id', userId)
      .order('criado_em', { ascending: false })
      .limit(limit);
    return data ? data.reverse() : [];
  },
  
  // Melhoria: As funções agora são mais genéricas e organizadas.
  getOpenTickets: (limit = 3) =>
    supabase.from('chamados').select('*').eq('status', 'aberto').order('criado_em', { ascending: true }).limit(limit),

  getCompanies: (limit = 5) =>
    supabase.from('empresas').select('nome').order('criado_em', { ascending: false }).limit(limit),

  getDailyPlan: (userId) => {
    const hoje = new Date().toISOString().split('T')[0];
    return supabase.from('plano_dia').select('conteudo').eq('usuario_id', userId).eq('data', hoje).single();
  },

  getPendingIdeas: (userId, limit = 3) =>
    supabase.from('ideias_negocio').select('*').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(limit),

  saveIdea: (userId, titulo, descricao = '') =>
    supabase.from('ideias_negocio').insert({ usuario_id: userId, titulo, descricao, status: 'pendente' }),
    
  getCount: async (tableName) => {
    const { count } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
    return count || 0;
  },
};

// --- 3. PROMPT BUILDER DINÂMICO ---
// Melhoria: Esta seção implementa o seu design de prompt.
// Ele carrega um arquivo de template e substitui os `{{placeholders}}`
// com dados reais, em vez de usar um texto gigante e fixo no código.

const promptBuilder = {
  // O template do prompt foi movido para um arquivo separado (prompt.md).
  // Se não encontrar o arquivo, usa um texto padrão de segurança.
  getPromptTemplate: () => {
    try {
      // Supondo que 'prompt.md' esteja na mesma pasta que o script.
      return fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf-8');
    } catch (error) {
      console.warn('Arquivo prompt.md não encontrado. Usando prompt de fallback.');
      return 'Você é um assistente prestativo. Responda a mensagem do usuário: {{mensagem_usuario}}';
    }
  },

  build: (template, data) => {
    let finalPrompt = template;
    for (const key of Object.keys(data)) {
      const placeholder = `{{${key}}}`;
      finalPrompt = finalPrompt.replaceAll(placeholder, data[key]);
    }
    return finalPrompt;
  },
};

// --- 4. HANDLERS DE COMANDOS ---
// Melhoria: O `switch` foi trocado por um objeto (commandHandlers).
// Isso é mais limpo, mais fácil de ler e mais escalável para adicionar novos comandos.

const commandHandlers = {
  '/plano': async (chatId, userId) => {
    const { data: plano } = await databaseService.getDailyPlan(userId);
    const text = plano?.conteudo
      ? `🎯 Foco de hoje:\n\n${plano.conteudo}\n\nBora fazer o primeiro micro-passo?`
      : `Ainda não temos foco de hoje. Qual é a UMA coisa que, se feita hoje, o dia foi bom?`;
    await telegramService.sendMessage(chatId, text);
  },
  '/chamados': async (chatId) => {
    const { data: chamados } = await databaseService.getOpenTickets(3);
    const text = (chamados && chamados.length > 0)
      ? `📋 Chamados abertos:\n\n${chamados.map((c, i) => `${i + 1}. ${c.empresa_nome} - ${c.descricao.substring(0, 40)}...`).join('\n')}\n\nQual a gente pega primeiro?`
      : `🎉 Nenhum chamado aberto. Limpo. O que a gente ataca agora?`;
    await telegramService.sendMessage(chatId, text);
  },
  '/empresas': async (chatId) => {
    const { data: empresas } = await databaseService.getCompanies(5);
    const text = (empresas && empresas.length > 0)
      ? `🏢 Empresas cadastradas:\n\n${empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n')}`
      : `Nenhuma empresa cadastrada ainda. Quer cadastrar a primeira?`;
    await telegramService.sendMessage(chatId, text);
  },
  '/ideia': async (chatId, userId, args) => {
    if (!args) {
      return await telegramService.sendMessage(chatId, `Qual é a ideia? Me manda em uma frase.`);
    }
    const { error } = await databaseService.saveIdea(userId, args);
    const text = !error
      ? `💡 Ideia registrada: "${args}". Quer que eu quebre em micro-passos?`
      : `Deu erro ao salvar a ideia. Pode repetir?`;
    await telegramService.sendMessage(chatId, text);
  },
  '/varredura': async (chatId, userId) => {
    const { data: chamados } = await databaseService.getOpenTickets(10);
    const { data: ideias } = await databaseService.getPendingIdeas(userId, 10);
    const numEmpresas = await databaseService.getCount('empresas');
    
    const text = `🔍 Varredura do sistema:\n\n` +
                 `• Chamados abertos: ${chamados?.length || 0}\n` +
                 `• Ideias pendentes: ${ideias?.length || 0}\n` +
                 `• Empresas cadastradas: ${numEmpresas}\n\n` +
                 `O que você quer atacar primeiro?`;
    await telegramService.sendMessage(chatId, text);
  },
  '/diagnostico': async (chatId) => {
    const tables = ['chamados', 'empresas', 'equipamentos', 'orcamentos', 'ideias_negocio', 'tarefas_pessoais'];
    const counts = await Promise.all(tables.map(async (table) => ({
      table,
      count: await databaseService.getCount(table),
    })));
    
    let msg = `🩺 Diagnóstico do sistema:\n\n`;
    counts.forEach(({ table, count }) => {
      msg += `• ${table}: ${count}\n`;
    });
    msg += `\nTudo certo por aqui. Qual é a próxima missão?`;
    
    await telegramService.sendMessage(chatId, msg);
  },
  'default': async (chatId) => {
    const availableCommands = Object.keys(commandHandlers).filter(c => c !== 'default').join(', ');
    await telegramService.sendMessage(chatId, `Comando não reconhecido. Use: ${availableCommands}. Qual desses você quer?`);
  }
};

// --- 5. HANDLER PRINCIPAL (ORQUESTRADOR) ---
// Melhoria: O handler principal agora é um "orquestrador".
// Ele delega o trabalho pesado para os serviços e handlers,
// tornando sua própria lógica muito mais simples de entender.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Charlene online. Use POST para interagir.' });
  }

  const update = req.body;
  const message = update.message || update.edited_message;

  if (!message || (!message.text && !message.caption)) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text || message.caption;
  const userId = message.from.id.toString(); // Multi-usuário por padrão

  try {
    await databaseService.saveMessage(userId, text, 'usuario');

    const isCommand = text.startsWith('/');
    if (isCommand) {
      const [command, ...argsArray] = text.split(' ');
      const args = argsArray.join(' ');
      const commandFunction = commandHandlers[command] || commandHandlers.default;
      await commandFunction(chatId, userId, args);
    } else {
      // Processamento de linguagem natural
      const [contexto, empresas, perfil] = await Promise.all([
        databaseService.getRecentContext(userId),
        databaseService.getCompanies(20), // Carrega mais para o prompt
        // TODO: Implementar a busca de `perfil_usuario` e `dados_pessoais_usuario`
      ]);

      const promptTemplate = promptBuilder.getPromptTemplate();
      const promptData = {
        mensagem_usuario: text,
        historico_conversa: contexto.map(c => `[${c.tipo}] ${c.mensagem}`).join('\n'),
        lista_empresas: empresas.map(e => e.nome).join(', ') || 'Nenhuma empresa cadastrada.',
        // Placeholders que precisam ser implementados no futuro:
        perfil_usuario: perfil || 'Não definido',
        dados_pessoais_usuario: 'Não definido',
        comandos_disponiveis: Object.keys(commandHandlers).filter(c => c !== 'default').join(', '),
        modulo_fe_ativo: 'false', // Exemplo, pode vir do banco
      };

      const finalPrompt = promptBuilder.build(promptTemplate, promptData);
      const resposta = await aiService.generateResponse(finalPrompt);

      await databaseService.saveMessage(userId, resposta, 'charlene');
      await telegramService.sendMessage(chatId, resposta);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro fatal no handler:', error);
    await telegramService.sendMessage(chatId, `Ops, tive um problema interno sério. Já registrei o erro para análise. Por favor, tente de novo.`);
    return res.status(200).json({ ok: true }); // Responde 200 para o Telegram não ficar reenviando.
  }
};

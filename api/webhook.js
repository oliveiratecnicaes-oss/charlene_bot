// ============================================
// CHARLENE BOT v3.4 - MODO DE DIAGNÓSTICO
// ============================================
// Olá, Regina! Esta é a versão 3.4.
// Adicionei o comando `/debug` para nos ajudar a entender
// exatamente como a Vercel está estruturando os arquivos.
// Após o deploy, execute /debug e me envie o resultado.
// ============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// --- 1. CONFIGURAÇÃO CENTRALIZADA ---
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- 2. SERVIÇOS ABSTRAÍDOS ---
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
        console.error('Resposta inesperada da API Gemini:', JSON.stringify(data, null, 2));
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
  saveMessage: (userId, mensagem, tipo) =>
    supabase.from('conversas_charlene').insert({ usuario_id: userId, mensagem, tipo }),
  getRecentContext: async (userId, limit = 5) => {
    const { data, error } = await supabase.from('conversas_charlene').select('mensagem, tipo').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(limit);
    if (error) console.error('DB Error (getRecentContext):', error.message);
    return data ? data.reverse() : [];
  },
  getOpenTickets: async (limit = 3) => {
    const { data, error } = await supabase.from('chamados').select('*').eq('status', 'aberto').order('criado_em', { ascending: true }).limit(limit);
    if (error) console.error('DB Error (getOpenTickets):', error.message);
    return data || [];
  },
  getCompanies: async (limit = 5) => {
    const { data, error } = await supabase.from('empresas').select('nome').order('criado_em', { ascending: false }).limit(limit);
    if (error) console.error('DB Error (getCompanies):', error.message);
    return data || [];
  },
  getDailyPlan: async (userId) => {
    const { data, error } = await supabase.from('plano_dia').select('conteudo').eq('usuario_id', userId).eq('data', new Date().toISOString().split('T')[0]).single();
    if (error && error.code !== 'PGRST116') console.error('DB Error (getDailyPlan):', error.message);
    return data;
  },
  getPendingIdeas: async (userId, limit = 3) => {
    const { data, error } = await supabase.from('ideias_negocio').select('*').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(limit);
    if (error) console.error('DB Error (getPendingIdeas):', error.message);
    return data || [];
  },
  saveIdea: (userId, titulo) =>
    supabase.from('ideias_negocio').insert({ usuario_id: userId, titulo, status: 'pendente' }),
  getCount: async (tableName) => {
    const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (error) console.error(`DB Error (getCount ${tableName}):`, error.message);
    return count || 0;
  },
};

// --- 3. PROMPT BUILDER DINÂMICO ---
const promptBuilder = {
  getPromptTemplate: () => {
    try {
      const promptPath = path.join(process.cwd(), 'prompts', 'prompt.md');
      return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.error('ERRO CRÍTICO: Não foi possível ler o arquivo prompt.md.', error);
      return 'ERRO 404: Módulo de carisma desativado\nMODO DE SEGURANÇA ATIVADO\n\nBoa noite, usuário.\n\nComo o meu arquivo de personalidade principal está ausente, não posso responder com o charme e o entusiasmo habituais da Charlene. No entanto, os meus sistemas lógicos e de processamento de texto continuam operando normalmente.\n\nComo posso ajudar você nesta noite?';
    }
  },
  build: (template, data) => {
    if (template.startsWith('ERRO 404')) return template; // Não processa placeholders se o template for de erro
    let finalPrompt = template;
    for (const key in data) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      finalPrompt = finalPrompt.replace(placeholder, data[key]);
    }
    return finalPrompt;
  },
};

// --- 4. HANDLERS DE COMANDOS ---
const commandHandlers = {
  '/debug': async (chatId) => {
    try {
      const rootPath = process.cwd();
      const rootContents = fs.readdirSync(rootPath);
      
      let message = `**RELATÓRIO DE DIAGNÓSTICO DO AMBIENTE**\n\n`;
      message += `**Diretório de Trabalho Atual (process.cwd()):**\n\`${rootPath}\`\n\n`;
      message += `**Conteúdo Encontrado na Raiz:**\n- \`${rootContents.join('\n- ')}\`\n\n`;

      const promptsPath = path.join(rootPath, 'prompts');
      if (fs.existsSync(promptsPath)) {
        const promptsContents = fs.readdirSync(promptsPath);
        message += `**Conteúdo da Pasta 'prompts':**\n- \`${promptsContents.join('\n- ')}\``;
      } else {
        message += `**AVISO:** A pasta 'prompts' NÃO foi encontrada no diretório de trabalho.`;
      }

      await telegramService.sendMessage(chatId, message);
    } catch (e) {
      await telegramService.sendMessage(chatId, `Erro ao executar o diagnóstico: ${e.message}`);
    }
  },
  '/plano': async (chatId, userId) => {
    const plano = await databaseService.getDailyPlan(userId);
    await telegramService.sendMessage(chatId, plano?.conteudo ? `🎯 Foco de hoje:\n\n${plano.conteudo}\n\nBora fazer o primeiro micro-passo?` : `Ainda não temos foco de hoje. Qual é a UMA coisa que, se feita hoje, o dia foi bom?`);
  },
  '/chamados': async (chatId) => {
    const chamados = await databaseService.getOpenTickets(3);
    await telegramService.sendMessage(chatId, (chamados.length > 0) ? `📋 Chamados abertos:\n\n${chamados.map((c, i) => `${i + 1}. ${c.empresa_nome} - ${c.descricao.substring(0, 40)}...`).join('\n')}\n\nQual a gente pega primeiro?` : `🎉 Nenhum chamado aberto. Limpo. O que a gente ataca agora?`);
  },
  '/empresas': async (chatId) => {
    const empresas = await databaseService.getCompanies(5);
    await telegramService.sendMessage(chatId, (empresas.length > 0) ? `🏢 Empresas cadastradas:\n\n${empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n')}` : `Nenhuma empresa cadastrada ainda. Quer cadastrar a primeira?`);
  },
  '/ideia': async (chatId, userId, args) => {
    if (!args) return await telegramService.sendMessage(chatId, `Qual é a ideia? Me manda em uma frase.`);
    const { error } = await databaseService.saveIdea(userId, args);
    await telegramService.sendMessage(chatId, !error ? `💡 Ideia registrada: "${args}". Quer que eu quebre em micro-passos?` : `Deu erro ao salvar a ideia. Pode repetir?`);
  },
  '/varredura': async (chatId, userId) => {
    const [chamados, ideias, numEmpresas] = await Promise.all([databaseService.getOpenTickets(10), databaseService.getPendingIdeas(userId, 10), databaseService.getCount('empresas')]);
    await telegramService.sendMessage(chatId, `🔍 Varredura do sistema:\n\n• Chamados abertos: ${chamados.length}\n• Ideias pendentes: ${ideias.length}\n• Empresas cadastradas: ${numEmpresas}\n\nO que você quer atacar primeiro?`);
  },
  '/diagnostico': async (chatId) => {
    const tables = ['chamados', 'empresas', 'equipamentos', 'orcamentos', 'ideias_negocio', 'tarefas_pessoais'];
    const counts = await Promise.all(tables.map(table => databaseService.getCount(table)));
    let msg = `🩺 Diagnóstico do sistema:\n\n${tables.map((table, i) => `• ${table}: ${counts[i]}`).join('\n')}\n\nTudo certo por aqui. Qual é a próxima missão?`;
    await telegramService.sendMessage(chatId, msg);
  },
  'default': async (chatId) => {
    const availableCommands = Object.keys(commandHandlers).filter(c => c !== 'default').join(', ');
    await telegramService.sendMessage(chatId, `Comando não reconhecido. Use: ${availableCommands}. Qual desses você quer?`);
  }
};

// --- 5. HANDLER PRINCIPAL (ORQUESTRADOR) ---
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, message: 'Charlene online.' });
  const update = req.body;
  const message = update.message || update.edited_message;
  if (!message || (!message.text && !message.caption)) return res.status(200).json({ ok: true });
  
  const chatId = message.chat.id;
  const text = message.text || message.caption;
  const userId = message.from.id.toString();

  try {
    const [command, ...argsArray] = text.split(' ');
    const args = argsArray.join(' ');

    if (text.startsWith('/')) {
      await databaseService.saveMessage(userId, text, 'usuario'); // Salva o comando
      const commandFunction = commandHandlers[command] || commandHandlers.default;
      await commandFunction(chatId, userId, args);
    } else {
      const promptTemplate = promptBuilder.getPromptTemplate();
      // Se estiver em modo de segurança, apenas envia a mensagem de erro sem consultar o Gemini.
      if (promptTemplate.startsWith('ERRO 404')) {
          return await telegramService.sendMessage(chatId, promptTemplate);
      }
      
      await databaseService.saveMessage(userId, text, 'usuario');
      const [contexto, empresas, perfil] = await Promise.all([
        databaseService.getRecentContext(userId),
        databaseService.getCompanies(20),
        // TODO: Implementar a busca de `perfil_usuario`
      ]);

      const promptData = {
        mensagem_usuario: text,
        historico_conversa: contexto.map(c => `[${c.tipo}] ${c.mensagem}`).join('\n'),
        lista_empresas: empresas.length > 0 ? empresas.map(e => e.nome).join(', ') : 'Nenhuma empresa cadastrada.',
        perfil_usuario: perfil || 'Não definido',
        dados_pessoais_usuario: 'Não definido',
        comandos_disponiveis: Object.keys(commandHandlers).filter(c => c !== 'default' && c !== '/debug').join(', '),
        modulo_fe_ativo: 'false',
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
    return res.status(200).json({ ok: true });
  }
};

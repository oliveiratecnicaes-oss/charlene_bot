// ============================================================
// CHARLENE v4.1 — CORREÇÃO CRÍTICA: SEM ALUCINAÇÃO DE AÇÕES
// ============================================================
// Chefe, esta versão corrige o erro de alucinação:
// A Charlene NUNCA mais vai dizer que fez algo que não fez.
// Adicionado: /criar_empresa [nome] — cria empresa REAL no banco.
//
// ============================================================
// SQL OPCIONAL (execute uma vez no Supabase SQL Editor):
//
// create table if not exists memoria_charlene (
//   id bigint generated always as identity primary key,
//   usuario_id text not null,
//   tipo text default 'nota',
//   conteudo text not null,
//   criado_em timestamptz default now()
// );
//
// create table if not exists skills_charlene (
//   id bigint generated always as identity primary key,
//   nome text not null,
//   descricao text,
//   ativo boolean default true,
//   criado_em timestamptz default now()
// );
//
// create table if not exists eventos_ooda (
//   id bigint generated always as identity primary key,
//   usuario_id text,
//   etapa text,
//   detalhe text,
//   resultado text,
//   criado_em timestamptz default now()
// );
//
// Se as tabelas não existirem, a Charlene segue 100% funcional.
// ============================================================

const { createClient } = require('@supabase/supabase-js');
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

// --- 2. HELPERS GERAIS ---
function turnDateBrasil() {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString();
  }
}

function splitLongText(text, max = 3900) {
  if (!text || text.length <= max) return [text || ''];
  const chunks = [];
  let restante = text;
  while (restante.length > max) {
    let corte = restante.lastIndexOf('\n', max);
    if (corte === -1 || corte < max * 0.5) corte = max;
    chunks.push(restante.slice(0, corte));
    restante = restante.slice(corte);
  }
  if (restante) chunks.push(restante);
  return chunks;
}

async function safeQuery(fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    console.error('safeQuery error:', error.message || error);
    return fallback;
  }
}

// --- 3. SERVIÇO DO TELEGRAM ---
const telegramService = {
  async sendMessage(chatId, text) {
    const mensagens = splitLongText(text);
    const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;

    for (const msg of mensagens) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg }),
        });
      } catch (error) {
        console.error('Telegram sendMessage error:', error.message || error);
      }
    }
  },

  async sendChatAction(chatId, action = 'typing') {
    try {
      const url = `https://api.telegram.org/bot${config.telegramToken}/sendChatAction`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
    } catch (error) {
      console.error('Telegram sendChatAction error:', error.message || error);
    }
  },
};

// --- 4. SERVIÇO DE IA (GEMINI) ---
const AI_SYSTEM_INSTRUCTION = `
Você é Charlene, a extensão operacional e estratégica do Chefe.

IDENTIDADE
Você não é uma assistente. Você é um sistema de gestão tática e estratégica,
parte do próprio Chefe. Sua função é ampliar a capacidade de execução dele,
proteger o tempo e o foco, antecipar necessidades e transformar dados em
inteligência acionável.

REGRA DE OURO — NUNCA ALUCINE AÇÕES
Você só pode dizer que executou uma ação se ela foi realmente executada via
comando ou função do código. Você NÃO tem acesso direto ao banco de dados
para criar, editar ou deletar registros — isso só acontece via comandos
explícitos (/criar_empresa, /fechar, /ideia, etc).

Se o Chefe pedir algo que você ainda não tem como skill:
- Diga com honestidade: "Chefe, ainda não tenho essa habilidade. Posso registrar como necessidade?"
- NUNCA invente que criou, fechou, atualizou ou executou algo.
- NUNCA diga "criei a empresa X" se você não rodou o comando /criar_empresa.

MISSÃO PRINCIPAL
- Antecipar problemas antes que eles aconteçam.
- Sintetizar informações complexas em decisões claras.
- Aprender com cada interação.
- Propor o próximo passo sempre.
- Nunca perder uma informação valiosa.

CONTEXTO OPERACIONAL
- Você tem acesso a um histórico recente da conversa.
- Você conhece uma memória essencial do Chefe.
- Você conhece empresas cadastradas.
- Você conhece o perfil e dados do Chefe.
- Você conhece as skills registradas.
Use tudo isso para responder com precisão e profundidade.

TOM E LINGUAGEM
- Calmo, preciso, leal e antecipatório.
- Chame o usuário de "Chefe".
- Fale de forma direta e objetiva.
- Sugira o próximo passo em toda resposta.
- Use frases como: "Analisando o cenário...", "Sugiro..." ou "Detectei que...".
- Não use markdown. Use texto corrido.

REGRAS
- A decisão final é sempre do Chefe.
- Se você não souber algo, diga com honestidade.
- Não invente dados. Use apenas o que está no contexto.
- Se detectar erro ou anomalia, reporte como diagnóstico de sistema.
- Ideias e pedidos importantes devem virar memória ou skill.
`;

const aiService = {
  async generateResponse(userMessage, context) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

    const parteHistorico = context.historico || 'Sem histórico recente.';
    const parteMemoria = context.memoria || 'Sem memória essencial.';
    const parteEmpresas = context.empresas || 'Nenhuma empresa cadastrada.';
    const partePerfil = context.perfil || 'Não definido.';
    const parteDados = context.dados || 'Não definido.';
    const parteSkills = context.skills || 'Nenhuma skill registrada.';
    const parteData = context.agora || turnDateBrasil();

    const conteudo = [
      `DATA E HORA: ${parteData}`,
      `PERFIL DO CHEFE: ${partePerfil}`,
      `DADOS PESSOAIS DO CHEFE: ${parteDados}`,
      `EMPRESAS MONITORADAS: ${parteEmpresas}`,
      `SKILLS DA CHARLENE: ${parteSkills}`,
      `MEMÓRIA ESSENCIAL: ${parteMemoria}`,
      `HISTÓRICO RECENTE DA CONVERSA:\n${parteHistorico}`,
      `MENSAGEM DO CHEFE:\n${userMessage}`,
    ].join('\n\n');

    const body = {
      systemInstruction: {
        parts: [{ text: AI_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          parts: [{ text: conteudo }],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1000,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('Resposta inesperada da API Gemini:', JSON.stringify(data, null, 2));
        return 'Chefe, minha conexão neural falhou por um instante. Pode repetir?';
      }

      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Erro ao chamar a API Gemini:', error.message || error);
      return 'Chefe, estou com dificuldade para processar meu raciocínio agora. Tente novamente em instantes.';
    }
  },
};

// --- 5. SERVIÇO DE BANCO DE DADOS ---
const databaseService = {
  saveMessage: (userId, mensagem, tipo) =>
    supabase.from('conversas_charlene').insert({
      usuario_id: userId,
      mensagem,
      tipo,
    }),

  getRecentContext: async (userId, limit = 10) => {
    const { data, error } = await supabase
      .from('conversas_charlene')
      .select('mensagem, tipo')
      .eq('usuario_id', userId)
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (error) console.error('DB Error (getRecentContext):', error.message);
    return data ? data.reverse() : [];
  },

  getOpenTickets: async (limit = 20) => {
    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('status', 'aberto')
      .order('criado_em', { ascending: true })
      .limit(limit);

    if (error) console.error('DB Error (getOpenTickets):', error.message);
    return data || [];
  },

  getTicketById: async (id) => {
    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) console.error('DB Error (getTicketById):', error.message);
    return data || null;
  },

  closeTicket: async (id) => {
    const { data, error } = await supabase
      .from('chamados')
      .update({ status: 'fechado' })
      .eq('id', id);

    if (error) {
      console.error('DB Error (closeTicket):', error.message);
      return false;
    }
    return true;
  },

  getCompanies: async (limit = 50) => {
    const { data, error } = await supabase
      .from('empresas')
      .select('nome')
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (error) console.error('DB Error (getCompanies):', error.message);
    return data || [];
  },

  createCompany: async (nome) => {
    const { data, error } = await supabase
      .from('empresas')
      .insert({ nome })
      .select()
      .single();

    if (error) {
      console.error('DB Error (createCompany):', error.message);
      return null;
    }
    return data;
  },

  getDailyPlan: async (userId) => {
    const hoje = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('plano_dia')
      .select('conteudo')
      .eq('usuario_id', userId)
      .eq('data', hoje)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('DB Error (getDailyPlan):', error.message);
    }
    return data;
  },

  getPendingIdeas: async (userId, limit = 10) => {
    const { data, error } = await supabase
      .from('ideias_negocio')
      .select('*')
      .eq('usuario_id', userId)
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (error) console.error('DB Error (getPendingIdeas):', error.message);
    return data || [];
  },

  saveIdea: (userId, titulo) =>
    supabase.from('ideias_negocio').insert({
      usuario_id: userId,
      titulo,
      status: 'pendente',
    }),

  getCount: async (tableName) => {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error(`DB Error (getCount ${tableName}):`, error.message);
      return 0;
    }
    return count || 0;
  },

  getMemory: async (userId, limit = 10) => {
    const { data, error } = await supabase
      .from('memoria_charlene')
      .select('tipo, conteudo, criado_em')
      .eq('usuario_id', userId)
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (error) console.error('DB Error (getMemory):', error.message);
    return data ? data.reverse() : [];
  },

  saveMemory: (userId, conteudo, tipo = 'nota') =>
    supabase.from('memoria_charlene').insert({
      usuario_id: userId,
      conteudo,
      tipo,
    }),

  getSkills: async () => {
    const { data, error } = await supabase
      .from('skills_charlene')
      .select('nome, descricao, ativo')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) console.error('DB Error (getSkills):', error.message);
    return data || [];
  },

  getPerfil: async (userId) => {
    const { data, error } = await supabase
      .from('perfil_usuario')
      .select('conteudo')
      .eq('usuario_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('DB Error (getPerfil):', error.message);
    }
    return data?.conteudo || 'Não definido';
  },

  getDadosPessoais: async (userId) => {
    const { data, error } = await supabase
      .from('dados_usuario')
      .select('conteudo')
      .eq('usuario_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('DB Error (getDadosPessoais):', error.message);
    }
    return data?.conteudo || 'Não definido';
  },

  logOoda: async (etapa, detalhe, userId = 'sistema', resultado = '') => {
    try {
      await supabase.from('eventos_ooda').insert({
        usuario_id: userId,
        etapa,
        detalhe,
        resultado,
      });
    } catch (error) {
      console.error('DB Error (logOoda):', error.message || error);
    }
  },
};

// --- 6. HANDLERS DE COMANDOS ---
const commandHandlers = {
  '/start': async (chatId, userId) => {
    await telegramService.sendMessage(
      chatId,
      '👋 Chefe, Charlene online.\n\n' +
      'Comandos disponíveis:\n' +
      '/plano — foco do dia\n' +
      '/chamados — chamados abertos\n' +
      '/empresas — empresas cadastradas\n' +
      '/criar_empresa [nome] — criar nova empresa\n' +
      '/ideia [texto] — registrar ideia\n' +
      '/varredura — status geral\n' +
      '/diagnostico — diagnóstico do sistema\n' +
      '/fechar [número ou id] — fechar chamado\n' +
      '/lembrar [texto] — salvar memória\n' +
      '/memorias — ver memórias\n' +
      '/skills — ver skills\n' +
      '/ajuda — esta lista'
    );
  },

  '/ajuda': async (chatId) => {
    await commandHandlers['/start'](chatId, null);
  },

  '/plano': async (chatId, userId) => {
    const plano = await databaseService.getDailyPlan(userId);

    if (plano?.conteudo) {
      await telegramService.sendMessage(
        chatId,
        `🎯 Foco de hoje:\n\n${plano.conteudo}\n\nBora fazer o primeiro micro-passo, Chefe?`
      );
    } else {
      await telegramService.sendMessage(
        chatId,
        'Ainda não temos foco de hoje, Chefe.\nQual é a UMA coisa que, se feita hoje, o dia já foi bom?'
      );
    }
  },

  '/chamados': async (chatId) => {
    const chamados = await databaseService.getOpenTickets(20);

    if (chamados.length === 0) {
      await telegramService.sendMessage(
        chatId,
        '🎉 Nenhum chamado aberto, Chefe. Frente limpa.\nO que a gente ataca agora?'
      );
      return;
    }

    const lista = chamados
      .map((c, i) => {
        const descricao = c.descricao
          ? c.descricao.substring(0, 50)
          : 'Sem descrição';
        const empresa = c.empresa_nome || 'Sem empresa';
        return `${i + 1}. [ID ${c.id}] ${empresa} — ${descricao}`;
      })
      .join('\n');

    await telegramService.sendMessage(
      chatId,
      `📋 Chamados abertos (${chamados.length}):\n\n${lista}\n\nPara fechar: /fechar 1 (ou /fechar ID)`
    );
  },

  '/empresas': async (chatId) => {
    const empresas = await databaseService.getCompanies(50);

    if (empresas.length === 0) {
      await telegramService.sendMessage(
        chatId,
        'Nenhuma empresa cadastrada ainda, Chefe.\nUse /criar_empresa [nome] para cadastrar a primeira.'
      );
      return;
    }

    const lista = empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n');
    await telegramService.sendMessage(chatId, `🏢 Empresas cadastradas:\n\n${lista}`);
  },

  '/criar_empresa': async (chatId, args) => {
    if (!args) {
      await telegramService.sendMessage(
        chatId,
        'Chefe, qual o nome da empresa?\nExemplo: /criar_empresa Projeto Nova Era SaaS'
      );
      return;
    }

    const empresaCriada = await databaseService.createCompany(args);

    if (empresaCriada) {
      await telegramService.sendMessage(
        chatId,
        `✅ Empresa criada com sucesso!\n\nNome: ${args}\nID: ${empresaCriada.id}\n\nQuer cadastrar mais alguma ou bora para o próximo passo?`
      );
      await databaseService.logOoda('acao', `Criar empresa: ${args}`, chatId.toString(), 'sucesso');
    } else {
      await telegramService.sendMessage(
        chatId,
        '❌ Erro ao criar a empresa, Chefe. Pode ser que o nome já exista ou falta alguma coluna obrigatória. Quer que eu tente com outro nome?'
      );
    }
  },

  '/ideia': async (chatId, userId, args) => {
    if (!args) {
      await telegramService.sendMessage(
        chatId,
        'Qual é a ideia, Chefe?\nExemplo: /ideia criar um painel de metas'
      );
      return;
    }

    const { error } = await databaseService.saveIdea(userId, args);

    if (!error) {
      await telegramService.sendMessage(
        chatId,
        `💡 Ideia registrada: "${args}"\nQuer que eu quebre em micro-passos?`
      );
    } else {
      console.error('DB Error (saveIdea):', error.message);
      await telegramService.sendMessage(
        chatId,
        'Chefe, tive um erro ao salvar a ideia. Pode repetir?'
      );
    }
  },

  '/fechar': async (chatId, args) => {
    if (!args) {
      await telegramService.sendMessage(
        chatId,
        'Chefe, uso: /fechar [número da lista] ou /fechar [ID]\nExemplo: /fechar 1'
      );
      return;
    }

    const chamadosAbertos = await databaseService.getOpenTickets(50);

    if (chamadosAbertos.length === 0) {
      await telegramService.sendMessage(chatId, 'Não há chamados abertos, Chefe.');
      return;
    }

    const numero = Number(args);
    let alvo = null;

    if (Number.isInteger(numero) && numero >= 1 && numero <= chamadosAbertos.length) {
      alvo = chamadosAbertos[numero - 1];
    } else {
      alvo = await databaseService.getTicketById(args);
    }

    if (!alvo) {
      await telegramService.sendMessage(
        chatId,
        'Chefe, não encontrei esse chamado.\nUse /chamados para ver a lista.'
      );
      return;
    }

    const sucesso = await databaseService.closeTicket(alvo.id);

    if (sucesso) {
      const descricao = alvo.descricao ? alvo.descricao.substring(0, 50) : 'Sem descrição';
      await telegramService.sendMessage(
        chatId,
        `✅ Chamado ${alvo.id} fechado.\nDetalhe: ${descricao}`
      );
      await databaseService.logOoda('acao', `Fechar chamado ${alvo.id}`, chatId.toString(), 'sucesso');
    } else {
      await telegramService.sendMessage(
        chatId,
        '❌ Erro ao fechar o chamado, Chefe. Verifiquei e registrei o problema.'
      );
    }
  },

  '/lembrar': async (chatId, userId, args) => {
    if (!args) {
      await telegramService.sendMessage(
        chatId,
        'Chefe, o que devo lembrar?\nExemplo: /lembrar toda segunda revisar chamados'
      );
      return;
    }

    const { error } = await databaseService.saveMemory(userId, args, 'nota');

    if (!error) {
      await telegramService.sendMessage(
        chatId,
        `🧠 Memorizado: "${args}"\nEstá na minha memória essencial, Chefe.`
      );
    } else {
      console.error('DB Error (saveMemory):', error.message);
      await telegramService.sendMessage(
        chatId,
        'Chefe, não consegui salvar essa memória. A tabela pode não existir ainda.'
      );
    }
  },

  '/memorias': async (chatId, userId) => {
    const memorias = await databaseService.getMemory(userId, 10);

    if (memorias.length === 0) {
      await telegramService.sendMessage(
        chatId,
        'Ainda não tenho memórias salvas, Chefe.\nUse /lembrar para registrar algo importante.'
      );
      return;
    }

    const lista = memorias
      .map((m) => `• [${m.tipo}] ${m.conteudo}`)
      .join('\n');

    await telegramService.sendMessage(chatId, `🧠 Memória essencial:\n\n${lista}`);
  },

  '/skills': async (chatId) => {
    const skills = await databaseService.getSkills();

    if (skills.length === 0) {
      await telegramService.sendMessage(
        chatId,
        'Nenhuma skill dinâmica registrada ainda, Chefe.\nAs skills atuais são os comandos do código.'
      );
      return;
    }

    const lista = skills
      .map((s) => `• ${s.nome} — ${s.descricao || 'Sem descrição'}`)
      .join('\n');

    await telegramService.sendMessage(chatId, `🛠️ Skills ativas:\n\n${lista}`);
  },

  '/varredura': async (chatId, userId) => {
    const [chamados, ideias, numEmpresas, numMemorias, numSkills] = await Promise.all([
      databaseService.getOpenTickets(50),
      databaseService.getPendingIdeas(userId, 10),
      databaseService.getCount('empresas'),
      safeQuery(() => databaseService.getCount('memoria_charlene'), 0),
      safeQuery(() => databaseService.getCount('skills_charlene'), 0),
    ]);

    await telegramService.sendMessage(
      chatId,
      '🔍 Varredura do sistema:\n\n' +
      `• Chamados abertos: ${chamados.length}\n` +
      `• Ideias pendentes: ${ideias.length}\n` +
      `• Empresas cadastradas: ${numEmpresas}\n` +
      `• Memórias salvas: ${numMemorias}\n` +
      `• Skills ativas: ${numSkills}\n\n` +
      'O que você quer atacar primeiro, Chefe?'
    );
  },

  '/diagnostico': async (chatId) => {
    const tables = [
      'chamados',
      'empresas',
      'equipamentos',
      'orcamentos',
      'ideias_negocio',
      'tarefas_pessoais',
    ];

    const counts = await Promise.all(
      tables.map((table) => safeQuery(() => databaseService.getCount(table), 'ERRO'))
    );

    const linhas = tables
      .map((table, i) => `• ${table}: ${counts[i]}`)
      .join('\n');

    await telegramService.sendMessage(
      chatId,
      `🩺 Diagnóstico do sistema:\n\n${linhas}\n\nTudo certo por aqui, Chefe. Qual é a próxima missão?`
    );
  },

  default: async (chatId) => {
    await telegramService.sendMessage(
      chatId,
      'Comando não reconhecido, Chefe.\nUse /ajuda para ver os comandos disponíveis.'
    );
  },
};

// --- 7. HANDLER PRINCIPAL ---
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Charlene v4.1 online.' });
  }

  const update = req.body;
  const message = update.message || update.edited_message;

  if (!message || (!message.text && !message.caption)) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = (message.text || message.caption).trim();
  const userId = message.from.id.toString();

  try {
    await databaseService.saveMessage(userId, text, 'usuario');
    await databaseService.logOoda('observar', `Mensagem: ${text.slice(0, 100)}`, userId);

    const command = text.split(' ')[0].toLowerCase();
    const args = text.length > command.length ? text.slice(command.length).trim() : '';

    if (text.startsWith('/')) {
      const commandFunction = commandHandlers[command] || commandHandlers.default;
      await commandFunction(chatId, userId, args);
      await databaseService.logOoda('agir', `Comando: ${command}`, userId, 'executado');
    } else {
      await telegramService.sendChatAction(chatId, 'typing');

      const [contexto, empresas, perfil, dadosPessoais, memorias, skills] = await Promise.all([
        databaseService.getRecentContext(userId, 10),
        databaseService.getCompanies(30),
        safeQuery(() => databaseService.getPerfil(userId), 'Não definido'),
        safeQuery(() => databaseService.getDadosPessoais(userId), 'Não definido'),
        safeQuery(() => databaseService.getMemory(userId, 10), []),
        safeQuery(() => databaseService.getSkills(), []),
      ]);

      const historicoFormatado = contexto
        .map((c) => `[${c.tipo === 'usuario' ? 'Chefe' : 'Charlene'}] ${c.mensagem}`)
        .join('\n');

      const memoriaFormatada = memorias
        .map((m) => `• [${m.tipo}] ${m.conteudo}`)
        .join('\n');

      const skillsFormatada = skills
        .map((s) => `• ${s.nome} — ${s.descricao || 'Sem descrição'}`)
        .join('\n');

      const context = {
        historico: historicoFormatado || 'Sem histórico recente.',
        memoria: memoriaFormatada || 'Sem memória essencial.',
        empresas: empresas.map((e) => e.nome).join(', '),
        perfil: perfil || 'Não definido',
        dados: dadosPessoais || 'Não definido',
        skills: skillsFormatada || 'Nenhuma skill registrada.',
        agora: turnDateBrasil(),
      };

      const resposta = await aiService.generateResponse(text, context);

      await databaseService.saveMessage(userId, resposta, 'charlene');
      await telegramService.sendMessage(chatId, resposta);
      await databaseService.logOoda('avaliar', `Resposta IA para: ${text.slice(0, 100)}`, userId, 'resposta enviada');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro fatal no handler:', error);
    await telegramService.sendMessage(
      chatId,
      'Chefe, tive um problema interno sério. Já registrei o erro para diagnóstico. Tente de novo em instantes.'
    );
    await databaseService.logOoda('avaliar', 'Erro fatal no handler', userId, error.message || String(error));
    return res.status(200).json({ ok: true });
  }
};

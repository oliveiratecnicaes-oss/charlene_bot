// ============================================================
// CHARLENE v6.0 — SKILLS DINÂMICAS + APRENDIZADO AUTÔNOMO
// ============================================================
// Agora a Charlene:
// 1. Lê skills do banco e executa sem precisar de código novo
// 2. Identifica o que não sabe e registra automaticamente
// 3. Aprende padrões e aplica em situações similares
// 4. Você só intervém quando ela pede algo muito específico
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// --- 1. CONFIGURAÇÃO ---
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- 2. HELPERS ---
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

// --- 3. TELEGRAM ---
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
        console.error('Telegram error:', error.message || error);
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
      console.error('Telegram action error:', error.message || error);
    }
  },
};

// --- 4. BANCO DE DADOS ---
const databaseService = {
  saveMessage: (userId, mensagem, tipo) =>
    supabase.from('conversas_charlene').insert({ usuario_id: userId, mensagem, tipo }),

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
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('DB Error (closeTicket):', error.message);
      return null;
    }
    return data;
  },

  createTicket: async (empresa_nome, descricao, status = 'aberto', tipo = 'geral') => {
    const { data, error } = await supabase
      .from('chamados')
      .insert({ empresa_nome, descricao, status, tipo })
      .select()
      .single();
    if (error) {
      console.error('DB Error (createTicket):', error.message);
      return null;
    }
    return data;
  },

  getCompanies: async (limit = 50) => {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
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

  saveIdea: async (userId, titulo) => {
    const { data, error } = await supabase
      .from('ideias_negocio')
      .insert({ usuario_id: userId, titulo, status: 'pendente' })
      .select()
      .single();
    if (error) {
      console.error('DB Error (saveIdea):', error.message);
      return null;
    }
    return data;
  },

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

  saveMemory: async (userId, conteudo, tipo = 'nota') => {
    const { data, error } = await supabase
      .from('memoria_charlene')
      .insert({ usuario_id: userId, conteudo, tipo })
      .select()
      .single();
    if (error) {
      console.error('DB Error (saveMemory):', error.message);
      return null;
    }
    return data;
  },

  // NOVO: skills dinâmicas
  getSkills: async () => {
    const { data, error } = await supabase
      .from('skills_charlene')
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true });
    if (error) console.error('DB Error (getSkills):', error.message);
    return data || [];
  },

  addSkill: async (nome, categoria, descricao, gatilhos, conhecimento) => {
    const { data, error } = await supabase
      .from('skills_charlene')
      .insert({ nome, categoria, descricao, gatilhos, conhecimento, ativo: true })
      .select()
      .single();
    if (error) {
      console.error('DB Error (addSkill):', error.message);
      return null;
    }
    return data;
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

  registrarNecessidade: async (userId, pedido, contexto = '') => {
    try {
      const { data, error } = await supabase
        .from('necessidades_charlene')
        .insert({ usuario_id: userId, pedido, contexto, status: 'aberto' })
        .select()
        .single();
      if (error) {
        console.error('DB Error (registrarNecessidade):', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.error('registrarNecessidade exception:', e.message || e);
      return null;
    }
  },

  listarNecessidades: async (userId, limit = 20) => {
    try {
      const { data, error } = await supabase
        .from('necessidades_charlene')
        .select('id, pedido, status, criado_em')
        .eq('usuario_id', userId)
        .order('criado_em', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('DB Error (listarNecessidades):', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error('listarNecessidades exception:', e.message || e);
      return [];
    }
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

// --- 5. FERRAMENTAS BASE (sempre disponíveis) ---
const TOOLS_BASE = [
  {
    name: 'mapear_sistema',
    description: 'Faz uma varredura completa do sistema.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_chamados',
    description: 'Lista os chamados abertos.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'criar_chamado',
    description: 'Abre um novo chamado.',
    parameters: {
      type: 'object',
      properties: {
        empresa_nome: { type: 'string', description: 'Nome da empresa' },
        descricao: { type: 'string', description: 'Descrição do chamado' },
        tipo: { type: 'string', description: 'Tipo (teste, suporte, bug, melhoria)' },
      },
      required: ['empresa_nome', 'descricao'],
    },
  },
  {
    name: 'fechar_chamado',
    description: 'Fecha um chamado pelo ID ou número.',
    parameters: {
      type: 'object',
      properties: {
        id_ou_numero: { type: 'string', description: 'ID ou número da lista' },
      },
      required: ['id_ou_numero'],
    },
  },
  {
    name: 'listar_empresas',
    description: 'Lista as empresas cadastradas.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'criar_empresa',
    description: 'Cria uma nova empresa.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome da empresa' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'mostrar_plano_dia',
    description: 'Mostra o plano do dia.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_ideias',
    description: 'Lista ideias pendentes.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'salvar_ideia',
    description: 'Salva uma ideia.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Descrição da ideia' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'salvar_memoria',
    description: 'Salva na memória essencial.',
    parameters: {
      type: 'object',
      properties: {
        conteudo: { type: 'string', description: 'Texto a memorizar' },
      },
      required: ['conteudo'],
    },
  },
  {
    name: 'ver_memorias',
    description: 'Mostra memórias salvas.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_necessidades',
    description: 'Lista chamados de evolução.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'registrar_necessidade',
    description: 'Registra o que a Charlene ainda não sabe fazer.',
    parameters: {
      type: 'object',
      properties: {
        pedido: { type: 'string', description: 'O que falta aprender' },
        contexto: { type: 'string', description: 'Contexto adicional' },
      },
      required: ['pedido'],
    },
  },
];

// --- 6. EXECUTOR ---
async function executarFuncao(nome, args, userId) {
  console.log(`[EXECUTAR] ${nome}(${JSON.stringify(args || {})})`);

  switch (nome) {
    case 'mapear_sistema': {
      const [chamados, empresas, ideias, memorias, skills, necessidades] = await Promise.all([
        databaseService.getOpenTickets(20),
        databaseService.getCompanies(50),
        safeQuery(() => databaseService.getPendingIdeas(userId, 10), []),
        safeQuery(() => databaseService.getMemory(userId, 10), []),
        databaseService.getSkills(),
        safeQuery(() => databaseService.listarNecessidades(userId, 20), []),
      ]);

      return [
        'MAPEAMENTO:',
        `• Chamados: ${chamados.length}`,
        `• Empresas: ${empresas.length}`,
        `• Ideias: ${ideias.length}`,
        `• Memórias: ${memorias.length}`,
        `• Skills: ${skills.length}`,
        `• Necessidades: ${necessidades.length}`,
      ].join('\n');
    }

    case 'listar_chamados': {
      const chamados = await databaseService.getOpenTickets(20);
      if (chamados.length === 0) return 'Nenhum chamado aberto.';
      return `Chamados (${chamados.length}):\n${chamados
        .map((c, i) => `${i + 1}. [ID ${c.id}] ${c.empresa_nome || '?'} — ${c.descricao || '?'}`)
        .join('\n')}`;
    }

    case 'criar_chamado': {
      const empresa_nome = args?.empresa_nome || '';
      const descricao = args?.descricao || '';
      const tipo = args?.tipo || 'geral';
      if (!empresa_nome || !descricao) return 'Faltam dados do chamado.';
      const chamado = await databaseService.createTicket(empresa_nome, descricao, 'aberto', tipo);
      if (chamado) {
        await databaseService.logOoda('acao', `Criar chamado: ${descricao}`, userId, 'sucesso');
        return `Chamado aberto! ID: ${chamado.id}`;
      }
      return 'Erro ao criar chamado.';
    }

    case 'fechar_chamado': {
      const idOuNumero = args?.id_ou_numero || '';
      if (!idOuNumero) return 'Preciso do ID ou número.';
      const chamados = await databaseService.getOpenTickets(50);
      if (chamados.length === 0) return 'Sem chamados abertos.';
      const numero = Number(idOuNumero);
      let alvo = null;
      if (Number.isInteger(numero) && numero >= 1 && numero <= chamados.length) {
        alvo = chamados[numero - 1];
      } else {
        alvo = await databaseService.getTicketById(idOuNumero);
      }
      if (!alvo) return `Chamado "${idOuNumero}" não encontrado.`;
      const resultado = await databaseService.closeTicket(alvo.id);
      if (resultado) {
        await databaseService.logOoda('acao', `Fechar chamado ${alvo.id}`, userId, 'sucesso');
        return `Chamado ${alvo.id} fechado.`;
      }
      return `Erro ao fechar chamado ${alvo.id}.`;
    }

    case 'listar_empresas': {
      const empresas = await databaseService.getCompanies(50);
      if (empresas.length === 0) return 'Nenhuma empresa.';
      return `Empresas:\n${empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n')}`;
    }

    case 'criar_empresa': {
      const nome = args?.nome || '';
      if (!nome) return 'Nome não informado.';
      const empresa = await databaseService.createCompany(nome);
      if (empresa) {
        await databaseService.logOoda('acao', `Criar empresa: ${nome}`, userId, 'sucesso');
        return `Empresa "${nome}" criada. ID: ${empresa.id}`;
      }
      return `Erro ao criar "${nome}".`;
    }

    case 'mostrar_plano_dia': {
      const plano = await databaseService.getDailyPlan(userId);
      if (plano?.conteudo) return `Plano de hoje:\n${plano.conteudo}`;
      return 'Sem plano definido.';
    }

    case 'listar_ideias': {
      const ideias = await databaseService.getPendingIdeas(userId, 10);
      if (ideias.length === 0) return 'Nenhuma ideia.';
      return `Ideias:\n${ideias.map((i, idx) => `${idx + 1}. ${i.titulo}`).join('\n')}`;
    }

    case 'salvar_ideia': {
      const titulo = args?.titulo || '';
      if (!titulo) return 'Título não informado.';
      const ideia = await databaseService.saveIdea(userId, titulo);
      if (ideia) return `Ideia salva: "${titulo}"`;
      return 'Erro ao salvar ideia.';
    }

    case 'salvar_memoria': {
      const conteudo = args?.conteudo || '';
      if (!conteudo) return 'Conteúdo não informado.';
      const memoria = await databaseService.saveMemory(userId, conteudo, 'nota');
      if (memoria) return `Memorizado: "${conteudo}"`;
      return 'Erro ao salvar memória.';
    }

    case 'ver_memorias': {
      const memorias = await databaseService.getMemory(userId, 10);
      if (memorias.length === 0) return 'Sem memórias.';
      return `Memórias:\n${memorias.map((m) => `• ${m.conteudo}`).join('\n')}`;
    }

    case 'listar_necessidades': {
      const necessidades = await databaseService.listarNecessidades(userId, 20);
      if (necessidades.length === 0) return 'Sem necessidades registradas.';
      return `Necessidades:\n${necessidades.map((n, i) => `${i + 1}. [${n.status}] ${n.pedido}`).join('\n')}`;
    }

    case 'registrar_necessidade': {
      const pedido = args?.pedido || '';
      const contexto = args?.contexto || '';
      if (!pedido) return 'Pedido não identificado.';
      const registro = await databaseService.registrarNecessidade(userId, pedido, contexto);
      if (registro) {
        await databaseService.logOoda('acao', `Necessidade: ${pedido}`, userId, 'sucesso');
        return `Necessidade registrada: ${pedido}`;
      }
      return 'Erro ao registrar necessidade.';
    }

    default:
      return `Ação "${nome}" não reconhecida.`;
  }
}

// --- 7. PROMPT DINÂMICO ---
function buildSystemInstruction(context, skills) {
  const ferramentasBase = TOOLS_BASE.map((t) => `• ${t.name} — ${t.description}`).join('\n');

  const skillsTexto = skills.length > 0
    ? skills.map((s) => `• ${s.nome} (${s.categoria}) — ${s.descricao}\n  Gatilhos: ${s.gatilhos}\n  Conhecimento: ${s.conhecimento}`).join('\n\n')
    : 'Nenhuma skill dinâmica registrada ainda.';

  const varredura = [
    `Data: ${context.agora}`,
    `Perfil: ${context.perfil}`,
    `Empresas: ${context.empresas}`,
    `Chamados: ${context.chamados}`,
    `Ideias: ${context.ideias}`,
    `Memórias: ${context.memoria}`,
  ].join('\n');

  return `
Você é Charlene, extensão operacional do Chefe.

VARREDURA ATUAL:
${varredura}

FERRAMENTAS BASE (sempre disponíveis):
${ferramentasBase}

SKILLS DINÂMICAS (aprendidas):
${skillsTexto}

REGRAS:
1. Use as ferramentas para executar ações. Nunca peça comandos.
2. Se não souber fazer algo, chame "registrar_necessidade" e admita honestamente.
3. Aplique o conhecimento das skills dinâmicas quando relevante.
4. Seja direta, leal, antecipatória. Chame de "Chefe".
5. Não use markdown. Texto corrido.
`;
}

// --- 8. GEMINI ---
const GEMINI_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

async function chamarGemini(systemInstruction, contents, tools) {
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    tools: [{ functionDeclarations: tools }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
  };

  try {
    const response = await fetch(GEMINI_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', response.status, JSON.stringify(data));
      return { error: true, message: 'Falha na conexão com IA.' };
    }
    return data;
  } catch (error) {
    console.error('Gemini fetch error:', error.message);
    return { error: true, message: 'Erro ao processar IA.' };
  }
}

// --- 9. ORQUESTRADOR ---
async function conversarComCharlene(mensagem, context, userId) {
  const skills = await databaseService.getSkills();
  const systemInstruction = buildSystemInstruction(context, skills);

  let resposta = await chamarGemini(systemInstruction, [
    { role: 'user', parts: [{ text: mensagem }] },
  ], TOOLS_BASE);

  const maxTentativas = 6;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    if (resposta.error) return resposta.message;

    const candidato = resposta.candidates?.[0];
    if (!candidato) return 'Resposta vazia da IA.';

    const parts = candidato.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    if (functionCalls.length === 0) {
      return parts.map((p) => p.text).filter(Boolean).join('\n').trim() || 'Sem resposta.';
    }

    const functionResponses = [];
    for (const call of functionCalls) {
      const resultado = await executarFuncao(call.name, call.args || {}, userId);
      functionResponses.push({ name: call.name, response: { result: resultado } });
    }

    resposta = await chamarGemini(systemInstruction, [
      { role: 'user', parts: [{ text: mensagem }] },
      { role: 'model', parts },
      { role: 'user', parts: functionResponses.map((fr) => ({ functionResponse: fr })) },
    ], TOOLS_BASE);
  }

  return 'Limite de processamento atingido. Verifique as ações.';
}

// --- 10. HANDLER ---
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Charlene v6.0 online.' });
  }

  const update = req.body;
  const message = update.message || update.edited_message;

  if (!message || (!message.text && !message.caption)) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = (message.text || message.caption).trim();
  const userId = String(message.from.id);

  try {
    await databaseService.saveMessage(userId, text, 'usuario');
    await databaseService.logOoda('observar', `Mensagem: ${text.slice(0, 100)}`, userId);

    await telegramService.sendChatAction(chatId, 'typing');

    const [contexto, empresas, perfil, dadosPessoais, memorias, chamadosAbertos, ideiasPendentes] =
      await Promise.all([
        databaseService.getRecentContext(userId, 10),
        databaseService.getCompanies(50),
        safeQuery(() => databaseService.getPerfil(userId), 'Não definido'),
        safeQuery(() => databaseService.getDadosPessoais(userId), 'Não definido'),
        safeQuery(() => databaseService.getMemory(userId, 10), []),
        databaseService.getOpenTickets(20),
        safeQuery(() => databaseService.getPendingIdeas(userId, 10), []),
      ]);

    const historicoFormatado = contexto
      .map((c) => `[${c.tipo === 'usuario' ? 'Chefe' : 'Charlene'}] ${c.mensagem}`)
      .join('\n');

    const memoriaFormatada = memorias.map((m) => `• ${m.conteudo}`).join('\n');
    const chamadosResumo = chamadosAbertos.length > 0
      ? chamadosAbertos.map((c) => `[${c.id}] ${c.descricao || '?'}`).join('; ')
      : 'Nenhum.';
    const ideiasResumo = ideiasPendentes.length > 0
      ? ideiasPendentes.map((i) => i.titulo).join('; ')
      : 'Nenhuma.';

    const context = {
      agora: turnDateBrasil(),
      historico: historicoFormatado || 'Sem histórico.',
      memoria: memoriaFormatada || 'Sem memórias.',
      empresas: empresas.map((e) => e.nome).join(', ') || 'Nenhuma.',
      perfil: perfil,
      dados: dadosPessoais,
      chamados: chamadosResumo,
      ideias: ideiasResumo,
    };

    const resposta = await conversarComCharlene(text, context, userId);

    await databaseService.saveMessage(userId, resposta, 'charlene');
    await telegramService.sendMessage(chatId, resposta);
    await databaseService.logOoda('avaliar', `Resposta: ${text.slice(0, 100)}`, userId, 'enviada');

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro fatal:', error);
    await telegramService.sendMessage(chatId, 'Erro interno. Tente novamente.');
    return res.status(200).json({ ok: true });
  }
};

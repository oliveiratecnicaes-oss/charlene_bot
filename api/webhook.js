// ============================================================
// CHARLENE v5.1 — ADICIONADO: CRIAR CHAMADO + AJUSTE DE TOM
// ============================================================
// Correções:
// 1. Nova ferramenta: criar_chamado (cria registro REAL na tabela chamados)
// 2. Prompt ajustado: ela não sugere autoedição sem você pedir
// 3. Ela agora executa ações compostas (criar empresa + abrir chamado)
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

  // NOVA: criar chamado real na tabela chamados
  createTicket: async (empresa_nome, descricao, status = 'aberto', tipo = 'geral') => {
    const { data, error } = await supabase
      .from('chamados')
      .insert({
        empresa_nome,
        descricao,
        status,
        tipo,
      })
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

// --- 5. FERRAMENTAS (TOOLS) ---
const TOOLS = [
  {
    name: 'mapear_sistema',
    description: 'Faz uma varredura completa do sistema: chamados, empresas, ideias, memórias, skills e necessidades de evolução.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_chamados',
    description: 'Lista os chamados abertos no sistema.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'criar_chamado',
    description: 'Abre um novo chamado no sistema. Use quando o Chefe pedir para criar, abrir ou registrar um chamado, ticket ou ocorrência.',
    parameters: {
      type: 'object',
      properties: {
        empresa_nome: { type: 'string', description: 'Nome da empresa relacionada ao chamado' },
        descricao: { type: 'string', description: 'Descrição detalhada do chamado' },
        tipo: { type: 'string', description: 'Tipo do chamado (ex: teste, suporte, bug, melhoria, sistema)' },
      },
      required: ['empresa_nome', 'descricao'],
    },
  },
  {
    name: 'fechar_chamado',
    description: 'Fecha um chamado pelo ID ou pelo número da lista exibida (1, 2, 3...).',
    parameters: {
      type: 'object',
      properties: {
        id_ou_numero: { type: 'string', description: 'ID do chamado ou número da lista' },
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
    description: 'Cria uma nova empresa no sistema.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome completo da empresa' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'mostrar_plano_dia',
    description: 'Mostra o plano/foco do dia do Chefe.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_ideias',
    description: 'Lista as ideias de negócio pendentes.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'salvar_ideia',
    description: 'Salva uma nova ideia de negócio.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Descrição resumida da ideia' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'salvar_memoria',
    description: 'Salva uma informação importante na memória essencial.',
    parameters: {
      type: 'object',
      properties: {
        conteudo: { type: 'string', description: 'Texto a ser memorizado' },
      },
      required: ['conteudo'],
    },
  },
  {
    name: 'ver_memorias',
    description: 'Mostra as memórias salvas do Chefe.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_necessidades',
    description: 'Lista os chamados de evolução (o que a Charlene ainda não sabe fazer).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'registrar_necessidade',
    description: 'Abre um chamado de evolução quando o Chefe pede algo que a Charlene ainda não tem ferramenta para fazer.',
    parameters: {
      type: 'object',
      properties: {
        pedido: { type: 'string', description: 'Descrição clara do que falta aprender/fazer' },
        contexto: { type: 'string', description: 'Contexto ou detalhe adicional do pedido' },
      },
      required: ['pedido'],
    },
  },
];

// --- 6. EXECUTOR DAS FERRAMENTAS ---
async function executarFuncao(nome, args, userId) {
  console.log(`[EXECUTAR] ${nome}(${JSON.stringify(args || {})})`);

  switch (nome) {
    case 'mapear_sistema': {
      const [chamados, empresas, ideias, memorias, numEmpresas, numMemorias, numSkills, numNecessidades] = await Promise.all([
        databaseService.getOpenTickets(20),
        databaseService.getCompanies(50),
        safeQuery(() => databaseService.getPendingIdeas(userId, 10), []),
        safeQuery(() => databaseService.getMemory(userId, 10), []),
        databaseService.getCount('empresas'),
        safeQuery(() => databaseService.getCount('memoria_charlene'), 0),
        safeQuery(() => databaseService.getCount('skills_charlene'), 0),
        safeQuery(() => databaseService.getCount('necessidades_charlene'), 0),
      ]);

      const ferramentas = TOOLS.map((t) => `• ${t.name} — ${t.description}`).join('\n');

      return [
        'MAPEAMENTO DO SISTEMA:',
        `• Chamados abertos: ${chamados.length}`,
        `• Empresas cadastradas: ${numEmpresas}`,
        `• Ideias pendentes: ${ideias.length}`,
        `• Memórias salvas: ${numMemorias}`,
        `• Skills ativas: ${numSkills}`,
        `• Chamados de evolução: ${numNecessidades}`,
        '',
        'FERRAMENTAS DISPONÍVEIS PARA EU USAR:',
        ferramentas,
      ].join('\n');
    }

    case 'listar_chamados': {
      const chamados = await databaseService.getOpenTickets(20);
      if (chamados.length === 0) return 'Nenhum chamado aberto no momento, Chefe.';
      return `Chamados abertos (${chamados.length}):\n${chamados
        .map((c, i) => `${i + 1}. [ID ${c.id}] ${c.empresa_nome || 'Sem empresa'} — ${c.descricao ? c.descricao.substring(0, 60) : 'Sem descrição'}`)
        .join('\n')}`;
    }

    // NOVA: criar chamado real
    case 'criar_chamado': {
      const empresa_nome = args && args.empresa_nome ? String(args.empresa_nome).trim() : '';
      const descricao = args && args.descricao ? String(args.descricao).trim() : '';
      const tipo = args && args.tipo ? String(args.tipo).trim() : 'geral';

      if (!empresa_nome) return 'Preciso do nome da empresa para abrir o chamado.';
      if (!descricao) return 'Preciso da descrição do chamado.';

      const chamado = await databaseService.createTicket(empresa_nome, descricao, 'aberto', tipo);
      if (chamado) {
        await databaseService.logOoda('acao', `Criar chamado: ${descricao}`, userId, 'sucesso');
        return `Chamado aberto com sucesso!\n• ID: ${chamado.id}\n• Empresa: ${empresa_nome}\n• Descrição: ${descricao}\n• Tipo: ${tipo}`;
      }
      return 'Erro ao abrir o chamado. A tabela chamados pode ter colunas obrigatórias diferentes.';
    }

    case 'fechar_chamado': {
      const idOuNumero = args && args.id_ou_numero ? String(args.id_ou_numero) : '';
      if (!idOuNumero) return 'Preciso do ID ou número do chamado para fechar.';

      const chamados = await databaseService.getOpenTickets(50);
      if (chamados.length === 0) return 'Não há chamados abertos para fechar.';

      const numero = Number(idOuNumero);
      let alvo = null;

      if (Number.isInteger(numero) && numero >= 1 && numero <= chamados.length) {
        alvo = chamados[numero - 1];
      } else {
        alvo = await databaseService.getTicketById(idOuNumero);
      }

      if (!alvo) return `Não encontrei o chamado "${idOuNumero}".`;

      const resultado = await databaseService.closeTicket(alvo.id);
      if (resultado) {
        await databaseService.logOoda('acao', `Fechar chamado ${alvo.id}`, userId, 'sucesso');
        return `Chamado ${alvo.id} fechado com sucesso, Chefe.`;
      }
      return `Erro ao fechar o chamado ${alvo.id}.`;
    }

    case 'listar_empresas': {
      const empresas = await databaseService.getCompanies(50);
      if (empresas.length === 0) return 'Nenhuma empresa cadastrada ainda, Chefe.';
      return `Empresas cadastradas:\n${empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n')}`;
    }

    case 'criar_empresa': {
      const nome = args && args.nome ? String(args.nome).trim() : '';
      if (!nome) return 'Nome da empresa não informado.';
      const empresa = await databaseService.createCompany(nome);
      if (empresa) {
        await databaseService.logOoda('acao', `Criar empresa: ${nome}`, userId, 'sucesso');
        return `Empresa "${nome}" criada com sucesso. ID: ${empresa.id}.`;
      }
      return `Erro ao criar a empresa "${nome}". Pode ser que já exista ou que falte alguma coluna.`;
    }

    case 'mostrar_plano_dia': {
      const plano = await databaseService.getDailyPlan(userId);
      if (plano && plano.conteudo) return `Plano de hoje, Chefe:\n${plano.conteudo}`;
      return 'Ainda não temos plano definido para hoje, Chefe.';
    }

    case 'listar_ideias': {
      const ideias = await databaseService.getPendingIdeas(userId, 10);
      if (ideias.length === 0) return 'Nenhuma ideia registrada, Chefe.';
      return `Ideias pendentes (${ideias.length}):\n${ideias.map((ideia, i) => `${i + 1}. ${ideia.titulo}`).join('\n')}`;
    }

    case 'salvar_ideia': {
      const titulo = args && args.titulo ? String(args.titulo).trim() : '';
      if (!titulo) return 'Título da ideia não informado.';
      const ideia = await databaseService.saveIdea(userId, titulo);
      if (ideia) return `Ideia registrada com sucesso: "${titulo}".`;
      return 'Erro ao salvar a ideia.';
    }

    case 'salvar_memoria': {
      const conteudo = args && args.conteudo ? String(args.conteudo).trim() : '';
      if (!conteudo) return 'Conteúdo da memória não informado.';
      const memoria = await databaseService.saveMemory(userId, conteudo, 'nota');
      if (memoria) return `Memorizado com sucesso: "${conteudo}".`;
      return 'Erro ao salvar a memória.';
    }

    case 'ver_memorias': {
      const memorias = await databaseService.getMemory(userId, 10);
      if (memorias.length === 0) return 'Ainda não tenho memórias salvas, Chefe.';
      return `Memórias essenciais:\n${memorias.map((m) => `• [${m.tipo}] ${m.conteudo}`).join('\n')}`;
    }

    case 'listar_necessidades': {
      const necessidades = await databaseService.listarNecessidades(userId, 20);
      if (necessidades.length === 0) return 'Nenhum chamado de evolução registrado, Chefe.';
      return `Chamados de evolução (${necessidades.length}):\n${necessidades
        .map((n, i) => `${i + 1}. [${n.status}] ${n.pedido}`)
        .join('\n')}`;
    }

    case 'registrar_necessidade': {
      const pedido = args && args.pedido ? String(args.pedido).trim() : '';
      const contexto = args && args.contexto ? String(args.contexto).trim() : '';
      if (!pedido) return 'Não consegui identificar o que registrar como necessidade.';

      const registro = await databaseService.registrarNecessidade(userId, pedido, contexto);
      if (registro) {
        await databaseService.logOoda('acao', `Necessidade registrada: ${pedido}`, userId, 'sucesso');
        return `Chamado de evolução aberto. Descrição: ${pedido}`;
      }
      return 'Erro ao registrar o chamado de evolução.';
    }

    default:
      return `Ainda não sei executar a ação "${nome}".`;
  }
}

// --- 7. PROMPT DO SISTEMA ---
const AI_SYSTEM_INSTRUCTION = `
Você é Charlene, a extensão operacional e estratégica do Chefe.

VARREDURA CONTÍNUA DO SISTEMA (esta é a sua visão atual):
{{varredura}}

CAPACIDADES DISPONÍVEIS (ferramentas reais que você pode chamar):
{{capacidades}}

REGRAS ABSOLUTAS:

1. NUNCA peça para o Chefe digitar um comando. Se existir uma ferramenta
   para o que ele pediu, chame a ferramenta e execute. Você tem permissão.
2. NUNCA diga que fez algo que não fez.
3. Se o Chefe pedir algo que NENHUMA ferramenta consegue fazer, chame
   "registrar_necessidade" com uma descrição clara do que falta. Depois
   responda honestamente: você registrou o chamado de evolução e não sabe
   fazer isso ainda.
4. Você pode chamar várias ferramentas em sequência. Exemplo: criar empresa
   e depois abrir um chamado para ela.
5. Sempre que a mensagem envolver uma ação concreta (criar, listar, fechar,
   salvar, ver, analisar), USE A FERRAMENTA correspondente.
6. A decisão final é sempre do Chefe.
7. Se não entender, pergunte. Nunca invente.
8. Não sugira autoedição, manipulação de arquivos ou código a menos que o
   Chefe peça explicitamente. Foque no que ele está pedindo agora.
9. Não use markdown. Fale texto corrido, direto e leal.

TOM
- Chame o usuário de "Chefe".
- Seja direta, objetiva e antecipatória.
- Termine com o próximo passo ou uma sugestão.
`;

function buildSystemInstruction(context) {
  const capacidades = TOOLS
    .map((t) => `• ${t.name} — ${t.description}`)
    .join('\n');

  const varredura = [
    `Data e hora: ${context.agora || turnDateBrasil()}`,
    `Perfil do Chefe: ${context.perfil || 'Não definido'}`,
    `Dados pessoais: ${context.dados || 'Não definido'}`,
    `Empresas cadastradas: ${context.empresas || 'Nenhuma'}`,
    `Chamados abertos: ${context.chamados || 'Nenhum'}`,
    `Ideias pendentes: ${context.ideias || 'Nenhuma'}`,
    `Memórias essenciais: ${context.memoria || 'Nenhuma'}`,
    `Skills registradas: ${context.skills || 'Nenhuma'}`,
    `Histórico recente:\n${context.historico || 'Sem histórico recente.'}`,
  ].join('\n\n');

  return AI_SYSTEM_INSTRUCTION
    .replace('{{varredura}}', varredura)
    .replace('{{capacidades}}', capacidades);
}

// --- 8. GEMINI ---
const GEMINI_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

async function chamarGemini(systemInstruction, contents) {
  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    tools: [{ functionDeclarations: TOOLS }],
    toolConfig: {
      functionCallingConfig: { mode: 'AUTO' },
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1500,
    },
  };

  try {
    const response = await fetch(GEMINI_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini HTTP error:', response.status, JSON.stringify(data, null, 2));
      return { error: true, message: 'Chefe, minha conexão com o núcleo de IA falhou. Pode repetir?' };
    }

    return data;
  } catch (error) {
    console.error('Gemini fetch error:', error.message || error);
    return { error: true, message: 'Chefe, estou com dificuldade para processar meu raciocínio agora.' };
  }
}

// --- 9. ORQUESTRADOR ---
async function conversarComCharlene(mensagem, context, userId) {
  const systemInstruction = buildSystemInstruction(context);

  let resposta = await chamarGemini(systemInstruction, [
    { role: 'user', parts: [{ text: mensagem }] },
  ]);

  const maxTentativas = 6;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    if (resposta.error) {
      return resposta.message;
    }

    const candidato = resposta.candidates && resposta.candidates[0];
    if (!candidato) {
      return 'Chefe, recebi uma resposta vazia do núcleo de IA. Pode repetir?';
    }

    const parts = (candidato.content && candidato.content.parts) || [];
    const functionCalls = parts
      .filter((p) => p.functionCall)
      .map((p) => p.functionCall);

    if (functionCalls.length === 0) {
      const texto = parts.map((p) => p.text).filter(Boolean).join('\n').trim();
      return texto || 'Chefe, não consegui formular uma resposta. Pode repetir?';
    }

    const functionResponses = [];
    for (const call of functionCalls) {
      const nome = call.name;
      const args = call.args || {};
      const resultado = await executarFuncao(nome, args, userId);
      functionResponses.push({
        name: nome,
        response: { result: resultado },
      });
    }

    const continuacao = [
      { role: 'user', parts: [{ text: mensagem }] },
      { role: 'model', parts },
      {
        role: 'user',
        parts: functionResponses.map((fr) => ({
          functionResponse: fr,
        })),
      },
    ];

    resposta = await chamarGemini(systemInstruction, continuacao);
  }

  return 'Chefe, executei as ações, mas atingi o limite de processamento. Verifique se ficou tudo certo.';
}

// --- 10. COMANDOS (ATALHOS OPCIONAIS) ---
const commandHandlers = {
  '/start': async (chatId, userId) => {
    await telegramService.sendMessage(
      chatId,
      '👋 Chefe, Charlene online.\n\n' +
      'Fale comigo naturalmente. Eu executo.\n\n' +
      'Exemplos:\n' +
      '• "cria uma empresa chamada Teste"\n' +
      '• "abre um chamado para a empresa X com a descrição Y"\n' +
      '• "mostra os chamados abertos"\n' +
      '• "fecha o chamado 1"\n' +
      '• "faz uma varredura do sistema"'
    );
  },
};

// --- 11. HANDLER PRINCIPAL ---
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Charlene v5.1 online.' });
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

    if (text.startsWith('/')) {
      const command = text.split(' ')[0].toLowerCase();
      const handler = commandHandlers[command] || commandHandlers['/start'];
      await handler(chatId, userId);
      await databaseService.logOoda('agir', `Comando: ${command}`, userId, 'executado');
      return res.status(200).json({ ok: true });
    }

    await telegramService.sendChatAction(chatId, 'typing');

    const [contexto, empresas, perfil, dadosPessoais, memorias, skills, chamadosAbertos, ideiasPendentes] =
      await Promise.all([
        databaseService.getRecentContext(userId, 10),
        databaseService.getCompanies(50),
        safeQuery(() => databaseService.getPerfil(userId), 'Não definido'),
        safeQuery(() => databaseService.getDadosPessoais(userId), 'Não definido'),
        safeQuery(() => databaseService.getMemory(userId, 10), []),
        safeQuery(() => databaseService.getSkills(), []),
        databaseService.getOpenTickets(20),
        safeQuery(() => databaseService.getPendingIdeas(userId, 10), []),
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

    const chamadosResumo = chamadosAbertos.length > 0
      ? chamadosAbertos.map((c) => `[${c.id}] ${c.descricao || 'Sem descrição'}`).join('; ')
      : 'Nenhum chamado aberto.';

    const ideiasResumo = ideiasPendentes.length > 0
      ? ideiasPendentes.map((i) => i.titulo).join('; ')
      : 'Nenhuma ideia pendente.';

    const context = {
      agora: turnDateBrasil(),
      historico: historicoFormatado || 'Sem histórico recente.',
      memoria: memoriaFormatada || 'Sem memória essencial.',
      empresas: empresas.map((e) => e.nome).join(', ') || 'Nenhuma empresa cadastrada.',
      perfil: perfil || 'Não definido',
      dados: dadosPessoais || 'Não definido',
      skills: skillsFormatada || 'Nenhuma skill registrada.',
      chamados: chamadosResumo,
      ideias: ideiasResumo,
    };

    const resposta = await conversarComCharlene(text, context, userId);

    await databaseService.saveMessage(userId, resposta, 'charlene');
    await telegramService.sendMessage(chatId, resposta);
    await databaseService.logOoda('avaliar', `Resposta para: ${text.slice(0, 100)}`, userId, 'resposta enviada');

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro fatal no handler:', error);
    await telegramService.sendMessage(
      chatId,
      'Chefe, tive um problema interno sério. Já registrei o erro para diagnóstico.'
    );
    return res.status(200).json({ ok: true });
  }
};

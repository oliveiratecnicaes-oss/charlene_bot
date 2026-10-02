// ============================================================
// CHARLENE v4.3 — EXECUÇÃO NATURAL NA CONVERSA (FUNCTION CALLING)
// ============================================================
// Chefe, nesta versão você fala normalmente. A Charlene entende
// a intenção, executa ações reais no sistema e responde como
// uma operadora de verdade. Sem precisar lembrar comandos.
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

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// --- 4. SERVIÇO DE BANCO DE DADOS ---
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
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('DB Error (closeTicket):', error.message);
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
      .insert({
        usuario_id: userId,
        titulo,
        status: 'pendente',
      })
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
      .insert({
        usuario_id: userId,
        conteudo,
        tipo,
      })
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

// --- 5. FUNÇÕES QUE A IA PODE CHAMAR (TOOLS) ---
// Aqui a gente define o que a Charlene pode fazer de verdade.
const TOOLS = [
  {
    name: 'listar_chamados',
    description: 'Lista os chamados abertos no sistema.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'fechar_chamado',
    description: 'Fecha um chamado pelo ID ou pelo número da lista exibida.',
    parameters: {
      type: 'object',
      properties: {
        id_ou_numero: {
          type: 'string',
          description: 'ID do chamado ou número da lista (1, 2, 3...)',
        },
      },
      required: ['id_ou_numero'],
    },
  },
  {
    name: 'listar_empresas',
    description: 'Lista as empresas cadastradas.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'criar_empresa',
    description: 'Cria uma nova empresa no sistema.',
    parameters: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Nome completo da empresa',
        },
      },
      required: ['nome'],
    },
  },
  {
    name: 'mostrar_plano_dia',
    description: 'Mostra o plano/foco do dia do usuário.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'listar_ideias',
    description: 'Lista ideias de negócio pendentes.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'salvar_ideia',
    description: 'Salva uma nova ideia de negócio.',
    parameters: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Descrição resumida da ideia',
        },
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
        conteudo: {
          type: 'string',
          description: 'Texto a ser memorizado',
        },
      },
      required: ['conteudo'],
    },
  },
  {
    name: 'ver_memorias',
    description: 'Mostra as memórias salvas.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'varredura_sistema',
    description: 'Mostra um panorama geral do sistema.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'diagnostico_sistema',
    description: 'Mostra diagnóstico com contadores das tabelas.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

// --- 6. EXECUTOR DE FUNÇÕES ---
// Aqui o código realmente executa o que a IA pediu.
async function executarFuncao(nome, args, userId, chatId) {
  console.log(`[EXECUTAR] ${nome}(${JSON.stringify(args)})`);

  switch (nome) {
    case 'listar_chamados': {
      const chamados = await databaseService.getOpenTickets(20);
      if (chamados.length === 0) return 'Nenhum chamado aberto no momento.';
      return `Chamados abertos (${chamados.length}):\n${chamados.map((c, i) => `${i + 1}. [ID ${c.id}] ${c.empresa_nome || 'Sem empresa'} — ${c.descricao ? c.descricao.substring(0, 50) : 'Sem descrição'}`).join('\n')}`;
    }

    case 'fechar_chamado': {
      const idOuNumero = args.id_ou_numero;
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
        return `Chamado ${alvo.id} fechado com sucesso.`;
      }
      return `Erro ao fechar o chamado ${alvo.id}.`;
    }

    case 'listar_empresas': {
      const empresas = await databaseService.getCompanies(50);
      if (empresas.length === 0) return 'Nenhuma empresa cadastrada ainda.';
      return `Empresas cadastradas:\n${empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n')}`;
    }

    case 'criar_empresa': {
      const nome = args.nome;
      if (!nome) return 'Nome da empresa não informado.';
      const empresa = await databaseService.createCompany(nome);
      if (empresa) {
        await databaseService.logOoda('acao', `Criar empresa: ${nome}`, userId, 'sucesso');
        return `Empresa "${nome}" criada com sucesso. ID: ${empresa.id}.`;
      }
      return `Erro ao criar a empresa "${nome}". Pode ser que já exista.`;
    }

    case 'mostrar_plano_dia': {
      const plano = await databaseService.getDailyPlan(userId);
      if (plano?.conteudo) return `Plano de hoje:\n${plano.conteudo}`;
      return 'Ainda não temos plano definido para hoje.';
    }

    case 'listar_ideias': {
      const ideias = await databaseService.getPendingIdeas(userId, 10);
      if (ideias.length === 0) return 'Nenhuma ideia registrada.';
      return `Ideias pendentes (${ideias.length}):\n${ideias.map((idea, i) => `${i + 1}. ${idea.titulo}`).join('\n')}`;
    }

    case 'salvar_ideia': {
      const titulo = args.titulo;
      if (!titulo) return 'Título da ideia não informado.';
      const ideia = await databaseService.saveIdea(userId, titulo);
      if (ideia) return `Ideia registrada: "${titulo}".`;
      return 'Erro ao salvar a ideia.';
    }

    case 'salvar_memoria': {
      const conteudo = args.conteudo;
      if (!conteudo) return 'Conteúdo da memória não informado.';
      const memoria = await databaseService.saveMemory(userId, conteudo, 'nota');
      if (memoria) return `Memorizado: "${conteudo}".`;
      return 'Erro ao salvar a memória.';
    }

    case 'ver_memorias': {
      const memorias = await databaseService.getMemory(userId, 10);
      if (memorias.length === 0) return 'Ainda não tenho memórias salvas.';
      return `Memórias essenciais:\n${memorias.map((m) => `• [${m.tipo}] ${m.conteudo}`).join('\n')}`;
    }

    case 'varredura_sistema': {
      const [chamados, ideias, numEmpresas, numMemorias, numSkills] = await Promise.all([
        databaseService.getOpenTickets(50),
        databaseService.getPendingIdeas(userId, 10),
        databaseService.getCount('empresas'),
        safeQuery(() => databaseService.getCount('memoria_charlene'), 0),
        safeQuery(() => databaseService.getCount('skills_charlene'), 0),
      ]);
      return `Panorama do sistema:\n• Chamados abertos: ${chamados.length}\n• Ideias pendentes: ${ideias.length}\n• Empresas cadastradas: ${numEmpresas}\n• Memórias salvas: ${numMemorias}\n• Skills ativas: ${numSkills}`;
    }

    case 'diagnostico_sistema': {
      const tables = ['chamados', 'empresas', 'equipamentos', 'orcamentos', 'ideias_negocio', 'tarefas_pessoais'];
      const counts = await Promise.all(tables.map((table) => safeQuery(() => databaseService.getCount(table), 'ERRO')));
      return `Diagnóstico do sistema:\n${tables.map((table, i) => `• ${table}: ${counts[i]}`).join('\n')}`;
    }

    default:
      return `Ainda não sei executar a função "${nome}".`;
  }
}

// --- 7. SERVIÇO DE IA COM FUNCTION CALLING ---
const AI_SYSTEM_INSTRUCTION = `
Você é Charlene, a extensão operacional e estratégica do Chefe.

REGRA DE OURO — HONESTIDADE ABSOLUTA
Você só pode executar ações através das ferramentas que estão disponíveis.
Se não houver ferramenta para o que o Chefe pediu, diga com honestidade:
"Chefe, ainda não tenho essa habilidade. Posso registrar como necessidade?"

COMO FUNCIONA
- Você recebe ferramentas (functions).
- Se precisar de dados ou executar algo, chame a ferramenta correta.
- Você pode chamar várias ferramentas em sequência se o pedido tiver várias partes.
- NUNCA diga que fez algo sem ter chamado a ferramenta.
- Se precisar confirmar antes de executar uma ação importante, pergunte ao Chefe.

TOM
- Direta, objetiva, leal.
- Chame o usuário de "Chefe".
- Sempre sugira o próximo passo.
- Não use markdown.

CONTEXTO DO CHEFE
{{contexto_extra}}
`;

const aiService = {
  async processarConversa(userMessage, context, history) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

    const parteHistorico = history || 'Sem histórico recente.';
    const parteMemoria = context.memoria || 'Sem memória essencial.';
    const parteEmpresas = context.empresas || 'Nenhuma empresa cadastrada.';
    const partePerfil = context.perfil || 'Não definido.';
    const parteDados = context.dados || 'Não definido.';
    const parteSkills = context.skills || 'Nenhuma skill registrada.';
    const parteData = context.agora || turnDateBrasil();

    const contextoExtra = [
      `DATA E HORA: ${parteData}`,
      `PERFIL DO CHEFE: ${partePerfil}`,
      `DADOS PESSOAIS DO CHEFE: ${parteDados}`,
      `EMPRESAS MONITORADAS: ${parteEmpresas}`,
      `SKILLS DA CHARLENE: ${parteSkills}`,
      `MEMÓRIA ESSENCIAL: ${parteMemoria}`,
      `HISTÓRICO RECENTE:\n${parteHistorico}`,
    ].join('\n\n');

    const systemInstruction = AI_SYSTEM_INSTRUCTION.replace('{{contexto_extra}}', contextoExtra);

    const contents = [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ];

    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log('Gemini response:', JSON.stringify(data, null, 2));

      return data;
    } catch (error) {
      console.error('Erro ao chamar a API Gemini:', error.message || error);
      return {
        error: true,
        message: 'Chefe, estou com dificuldade para processar meu raciocínio agora. Tente novamente em instantes.',
      };
    }
  },
};

// --- 8. ORQUESTRADOR PRINCIPAL ---
// Coordena a conversa com a IA, executa funções e devolve respostas.
async function conversarComCharlene(userMessage, context, userId, chatId) {
  let respostaIA = await aiService.processarConversa(userMessage, context, context.historico);

  // Loop de function calling (permite múltiplas chamadas)
  let tentativas = 0;
  const maxTentativas = 5;

  while (tentativas < maxTentativas) {
    tentativas++;

    if (respostaIA.error) {
      return respostaIA.message;
    }

    const candidato = respostaIA.candidates?.[0];
    if (!candidato) {
      return 'Chefe, recebi uma resposta vazia da minha conexão neural. Pode repetir?';
    }

    // Se a IA decidiu chamar funções
    const functionCalls = candidato.content?.parts
      ?.filter((part) => part.functionCall)
      ?.map((part) => part.functionCall);

    if (!functionCalls || functionCalls.length === 0) {
      // Resposta final em texto
      return candidato.content?.parts?.[0]?.text?.trim() || 'Chefe, não consegui formular a resposta.';
    }

    // Executa cada função chamada
    const functionResponses = [];
    for (const call of functionCalls) {
      const nome = call.name;
      const args = call.args || {};
      const resultado = await executarFuncao(nome, args, userId, chatId);
      functionResponses.push({
        name: nome,
        response: { result: resultado },
      });
    }

    // Envia os resultados de volta para a IA
    const newContent = {
      role: 'user',
      parts: functionResponses.map((fr) => ({
        functionResponse: {
          name: fr.name,
          response: fr.response,
        },
      })),
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

    const newBody = {
      systemInstruction: {
        parts: [{ text: AI_SYSTEM_INSTRUCTION.replace('{{contexto_extra}}', '') }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
        {
          role: 'model',
          parts: candidato.content.parts,
        },
        newContent,
      ],
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBody),
      });

      respostaIA = await response.json();
    } catch (error) {
      console.error('Erro no segundo turno Gemini:', error.message || error);
      return 'Chefe, executei as ações, mas tive dificuldade para sintetizar a resposta. Verifique se deu certo.';
    }
  }

  return 'Chefe, precisei fazer várias chamadas e atingi o limite de processamento. As ações foram executadas, mas peço que verifique.';
}

// --- 9. HANDLERS DE COMANDOS (MANTIDOS PRA QUEM PREFERE) ---
const commandHandlers = {
  '/start': async (chatId, userId) => {
    await telegramService.sendMessage(
      chatId,
      '👋 Chefe, Charlene online.\n\n' +
      'Agora você pode falar comigo naturalmente. Exemplos:\n' +
      '• "cria uma empresa chamada X"\n' +
      '• "mostra os chamados abertos"\n' +
      '• "fecha o chamado 1"\n' +
      '• "salva na memória: revisar orçamentos toda sexta"\n\n' +
      'Se eu não souber fazer algo, vou dizer honestamente.'
    );
  },
};

// --- 10. HANDLER PRINCIPAL ---
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Charlene v4.3 online.' });
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

    if (text.startsWith('/')) {
      const handler = commandHandlers[command] || commandHandlers['/start'];
      await handler(chatId, userId);
      await databaseService.logOoda('agir', `Comando: ${command}`, userId, 'executado');
      return res.status(200).json({ ok: true });
    }

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

    const resposta = await conversarComCharlene(text, context, userId, chatId);

    await databaseService.saveMessage(userId, resposta, 'charlene');
    await telegramService.sendMessage(chatId, resposta);
    await databaseService.logOoda('avaliar', `Resposta para: ${text.slice(0, 100)}`, userId, 'resposta enviada');

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

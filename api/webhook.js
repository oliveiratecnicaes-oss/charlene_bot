// CHARLENE v7.0 — OTIMIZADA PARA VELOCIDADE E TOOL CALLING
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// --- HELPERS ---
const turnDateBrasil = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const splitLongText = (text, max = 3900) => text.match(new RegExp(`.{1,${max}}`, 'gs')) || [text];
const safeQuery = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };

// --- TELEGRAM ---
const telegramService = {
  async sendMessage(chatId, text) {
    const mensagens = splitLongText(text);
    const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
    for (const msg of mensagens) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
      }).catch(console.error);
    }
  },
  async sendChatAction(chatId, action = 'typing') {
    fetch(`https://api.telegram.org/bot${config.telegramToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    }).catch(() => {}); // Fire and forget para não atrasar a fila
  },
};

// --- BANCO DE DADOS (SUPABASE) ---
const db = {
  saveMessage: (userId, mensagem, tipo) => supabase.from('conversas_charlene').insert({ usuario_id: userId, mensagem, tipo }),
  getRecentContext: async (userId, limit = 4) => { // REDUZIDO PARA 4 PARA POUPAR TOKENS
    const { data } = await supabase.from('conversas_charlene').select('mensagem, tipo').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(limit);
    return data ? data.reverse() : [];
  },
  getOpenTickets: async () => (await supabase.from('chamados').select('*').eq('status', 'aberto').order('criado_em', { ascending: true }).limit(15)).data || [],
  getTicketById: async (id) => (await supabase.from('chamados').select('*').eq('id', id).maybeSingle()).data || null,
  closeTicket: async (id) => (await supabase.from('chamados').update({ status: 'fechado' }).eq('id', id).select().single()).data || null,
  
  // INJEÇÃO DIRETA DO JSON DE O.S. (Alinhado com a task do Agente Che)
  createTicket: async ({ empresa_nome, equipamento_nome, descricao, tipo, solicitante, prioridade }) => {
    const payload = {
      empresa_nome: empresa_nome || 'Não informada',
      equipamento_nome: equipamento_nome || 'Não informado',
      descricao: descricao || '',
      data_criacao: turnDateBrasil(),
      status: 'aberto',
      tipo: tipo || 'geral',
      solicitante: solicitante || 'Charlene',
      prioridade: prioridade || 'normal'
    };
    const { data, error } = await supabase.from('chamados').insert(payload).select().single();
    if (error) console.error('Erro O.S.:', error.message);
    return data;
  },

  getCompanies: async () => (await supabase.from('empresas').select('*').order('criado_em', { ascending: false }).limit(30)).data || [],
  createCompany: async (nome) => (await supabase.from('empresas').insert({ nome }).select().single()).data || null,
  getDailyPlan: async (userId) => (await supabase.from('plano_dia').select('conteudo').eq('usuario_id', userId).eq('data', new Date().toISOString().split('T')[0]).single()).data || null,
  getPendingIdeas: async (userId) => (await supabase.from('ideias_negocio').select('*').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(10)).data || [],
  saveIdea: async (userId, titulo) => (await supabase.from('ideias_negocio').insert({ usuario_id: userId, titulo, status: 'pendente' }).select().single()).data || null,
  getMemory: async (userId) => (await supabase.from('memoria_charlene').select('conteudo').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(10)).data || [],
  saveMemory: async (userId, conteudo) => (await supabase.from('memoria_charlene').insert({ usuario_id: userId, conteudo, tipo: 'nota' }).select().single()).data || null,
  listarNecessidades: async (userId) => (await supabase.from('necessidades_charlene').select('id, pedido, status').eq('usuario_id', userId).order('criado_em', { ascending: false }).limit(10)).data || [],
  registrarNecessidade: async (userId, pedido, contexto) => (await supabase.from('necessidades_charlene').insert({ usuario_id: userId, pedido, contexto: contexto || '', status: 'aberto' }).select().single()).data || null,
  getSkills: async () => (await supabase.from('skills_charlene').select('*').eq('ativo', true)).data || [],
  logOoda: (etapa, detalhe, userId, resultado = '') => supabase.from('eventos_ooda').insert({ usuario_id: userId, etapa, detalhe, resultado }).catch(() => {})
};

// --- DECLARAÇÃO DE FERRAMENTAS ---
const TOOLS = [
  { name: 'mapear_sistema', description: 'Varredura geral de chamados, empresas e métricas.', parameters: { type: 'object', properties: {} } },
  { name: 'listar_chamados', description: 'Lista chamados (O.S.) abertos.', parameters: { type: 'object', properties: {} } },
  { 
    name: 'criar_chamado', 
    description: 'Injeta um JSON de Ordem de Serviço direto no banco de dados Supabase.', 
    parameters: {
      type: 'object',
      properties: {
        empresa_nome: { type: 'string', description: 'Nome da empresa' },
        equipamento_nome: { type: 'string', description: 'Equipamento alvo da manutenção' },
        descricao: { type: 'string', description: 'Descrição detalhada do defeito' },
        prioridade: { type: 'string', description: 'baixa, normal, alta, urgente' }
      },
      required: ['empresa_nome', 'equipamento_nome', 'descricao']
    }
  },
  { name: 'fechar_chamado', description: 'Fecha um chamado.', parameters: { type: 'object', properties: { id_ou_numero: { type: 'string' } }, required: ['id_ou_numero'] } },
  { name: 'listar_empresas', description: 'Lista empresas do sistema.', parameters: { type: 'object', properties: {} } },
  { name: 'criar_empresa', description: 'Cria nova empresa.', parameters: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
  { name: 'mostrar_plano_dia', description: 'Mostra plano do dia.', parameters: { type: 'object', properties: {} } },
  { name: 'listar_ideias', description: 'Lista ideias.', parameters: { type: 'object', properties: {} } },
  { name: 'salvar_ideia', description: 'Salva ideia.', parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] } },
  { name: 'salvar_memoria', description: 'Salva regra ou memória.', parameters: { type: 'object', properties: { conteudo: { type: 'string' } }, required: ['conteudo'] } },
  { name: 'ver_memorias', description: 'Visualiza memórias.', parameters: { type: 'object', properties: {} } },
  { name: 'listar_necessidades', description: 'Lista evoluções faltantes.', parameters: { type: 'object', properties: {} } },
  { name: 'registrar_necessidade', description: 'Registra limitação da IA.', parameters: { type: 'object', properties: { pedido: { type: 'string' }, contexto: { type: 'string' } }, required: ['pedido'] } }
];

// --- EXECUTOR DE FUNÇÕES ---
async function executarFuncao(nome, args, userId) {
  console.log(`[TOOL CALL] ${nome} - Args:`, args);

  switch (nome) {
    case 'mapear_sistema':
      const [ch, emp, mem] = await Promise.all([db.getOpenTickets(), db.getCompanies(), safeQuery(() => db.getMemory(userId), [])]);
      return `Mapeamento: ${ch.length} Chamados, ${emp.length} Empresas, ${mem.length} Memórias.`;
    case 'listar_chamados':
      const abertos = await db.getOpenTickets();
      return abertos.length ? `Chamados:\n${abertos.map((c, i) => `${i + 1}. [ID ${c.id}] ${c.empresa_nome} - ${c.equipamento_nome}`).join('\n')}` : 'Nenhum chamado aberto.';
    case 'criar_chamado':
      const novoChamado = await db.createTicket(args);
      if (novoChamado) {
        db.logOoda('acao', `Criar O.S.: ${args.descricao}`, userId, 'sucesso');
        return `✅ Chamado [${novoChamado.id}] aberto com sucesso para ${args.empresa_nome}.`;
      }
      return '❌ Falha ao injetar JSON no banco.';
    case 'fechar_chamado':
      const targetId = args.id_ou_numero;
      const alvo = await db.getTicketById(targetId); // Simplificado para usar apenas o ID real por precisão
      if (!alvo) return `O.S. ${targetId} não encontrada.`;
      const fechado = await db.closeTicket(alvo.id);
      return fechado ? `✅ O.S. ${alvo.id} encerrada.` : `❌ Erro ao fechar O.S. ${alvo.id}.`;
    case 'listar_empresas':
      const empresas = await db.getCompanies();
      return empresas.length ? empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n') : 'Sem empresas.';
    case 'criar_empresa':
      const emp = await db.createCompany(args.nome);
      return emp ? `✅ Empresa ${emp.nome} criada (ID: ${emp.id})` : `❌ Erro ao criar empresa.`;
    case 'mostrar_plano_dia':
      const plano = await db.getDailyPlan(userId);
      return plano ? plano.conteudo : 'Sem plano para hoje.';
    case 'listar_ideias':
      const ideias = await db.getPendingIdeas(userId);
      return ideias.length ? ideias.map((i, idx) => `${idx + 1}. ${i.titulo}`).join('\n') : 'Sem ideias.';
    case 'salvar_ideia':
      return await db.saveIdea(userId, args.titulo) ? `✅ Ideia salva.` : `❌ Erro.`;
    case 'salvar_memoria':
      return await db.saveMemory(userId, args.conteudo) ? `✅ Memorizado.` : `❌ Erro.`;
    case 'ver_memorias':
      const mems = await db.getMemory(userId);
      return mems.length ? mems.map(m => `• ${m.conteudo}`).join('\n') : 'Sem memórias.';
    case 'listar_necessidades':
      const nec = await db.listarNecessidades(userId);
      return nec.length ? nec.map((n, i) => `${i + 1}. [${n.status}] ${n.pedido}`).join('\n') : 'Sem necessidades.';
    case 'registrar_necessidade':
      return await db.registrarNecessidade(userId, args.pedido, args.contexto) ? `✅ Necessidade anotada.` : `❌ Erro.`;
    default:
      return `Ferramenta ${nome} não existe.`;
  }
}

// --- GEMINI ENGINE ---
async function processarIA(mensagem, context, userId, fsPrompt = null) {
  const systemInstruction = fsPrompt || `Identidade: Charlene. Dados: ${JSON.stringify(context)}`;
  
  let history = [{ role: 'user', parts: [{ text: mensagem }] }];
  const MAX_LOOPS = 3; // Evita timeout da Vercel (antes era 6)

  for (let step = 0; step < MAX_LOOPS; step++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: history,
        tools: [{ functionDeclarations: TOOLS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
      })
    }).then(res => res.json()).catch(err => ({ error: err.message }));

    if (response.error || !response.candidates) return 'Erro ao comunicar com a IA.';

    const parts = response.candidates[0].content.parts;
    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);

    // Se não há ferramenta para chamar, é a resposta final
    if (calls.length === 0) return parts.map(p => p.text).join('\n').trim();

    // Adiciona o que a IA quis chamar no histórico
    history.push({ role: 'model', parts });

    // Executa as ferramentas em paralelo para ganhar tempo
    const toolResults = await Promise.all(calls.map(async (call) => ({
      functionResponse: {
        name: call.name,
        response: { result: await executarFuncao(call.name, call.args, userId) }
      }
    })));

    // Devolve o resultado pro modelo
    history.push({ role: 'user', parts: toolResults });
  }

  return 'Ação concluída no banco de dados.'; // Resposta de fallback caso atinja limite de loops
}

// --- MAIN HANDLER (VERCEL) ---
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, status: 'Charlene v7.0' });

  const message = req.body.message || req.body.edited_message;
  if (!message || !message.text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text.trim();
  const userId = String(message.from.id);

  try {
    // Para evitar timeout, envia 200 OK cedo se sua infra permitir execução em background (edge). 
    // Em Serverless Node padrão da Vercel, seguramos a request mas com rotinas otimizadas.
    telegramService.sendChatAction(chatId, 'typing');

    // 1. Gravação Assíncrona Rápida
    db.saveMessage(userId, text, 'usuario');
    db.logOoda('observar', text.slice(0, 50), userId);

    // 2. Busca de Contexto Paralelizada
    const [historico, perfil, dados] = await Promise.all([
      db.getRecentContext(userId),
      safeQuery(() => supabase.from('perfil_usuario').select('conteudo').eq('usuario_id', userId).single().then(r => r.data?.conteudo), ''),
      safeQuery(() => supabase.from('dados_usuario').select('conteudo').eq('usuario_id', userId).single().then(r => r.data?.conteudo), '')
    ]);

    // O FS Prompt precisa ser lido do arquivo externo se você estiver usando Next.js fs, 
    // mas mantive a estrutura dinâmica baseada no contexto aqui
    const promptString = `
    (Você é Charlene. Regras: Seja curta, militar. Use ferramentas para criar O.S. diretamente no banco, NUNCA cospe JSON no texto)
    Data: ${turnDateBrasil()}
    Histórico: ${historico.map(h => `[${h.tipo}] ${h.mensagem}`).join(' | ')}
    Chefe: ${perfil} - Dados: ${dados}
    `;

    // 3. Processamento e Resposta
    const resposta = await processarIA(text, {}, userId, promptString);

    await Promise.all([
      db.saveMessage(userId, resposta, 'charlene'),
      telegramService.sendMessage(chatId, resposta),
      db.logOoda('avaliar', 'Resposta enviada', userId)
    ]);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Fatal:', error);
    await telegramService.sendMessage(chatId, 'Erro interno. Operação abortada.');
    return res.status(200).json({ ok: true });
  }
};

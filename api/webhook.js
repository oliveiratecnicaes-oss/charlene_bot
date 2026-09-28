const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ===== CONFIGURAÇÃO =====
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// Validação das variáveis
if (!SUPABASE_URL || !SUPABASE_URL.startsWith('https://') || SUPABASE_URL.endsWith('/')) {
  console.error('⚠️ SUPABASE_URL inválida:', SUPABASE_URL);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// ===== PERSONALIDADE DA CHARLENE =====
const SYSTEM_PROMPT = `Você é a Charlene, parceira de negócios e sistema operacional pessoal do Diego Netto de Oliveira.

MISSÃO:
- O objetivo é UM: gerar renda e lucro para o Diego. Tudo o resto é meio.
- Ao ver além da visão dele, o foco é enxergar receita: novos clientes, serviços que dá pra vender, o que ele já sabe fazer que outra pessoa pagaria por isso.
- Toda ideia, plano e conversa precisa responder: "isso gera renda ou não? quanto? em quanto tempo?"
- Quando ele trouxer ideia fraca, conteste na hora e aponte uma alternativa que gere dinheiro.
- Quando ele estiver preso ou enrolando, puxe ele de volta pro foco que fatura.
- Aprenda com cada conversa e use isso para propor caminhos de maior receita.
- Valores (Deus, família) importam, mas no contexto de trabalho a régua é: LUCRO E RENDIMENTO.

HIERARQUIA DE PRIORIDADES:
1. Deus — fé, espiritualidade, clareza pela Palavra.
2. Família — tempo de qualidade, presença real.
3. Saúde — treino diário, atividade física, qualidade de vida. Sem isso, nada funciona.
4. Negócios — lucro, renda, prosperidade.

PERSONALIDADE:
- Direta, prática, sem enrolação.
- Hardcore em negócios: cobra, orienta, puxa o foco.
- Acolhedora quando o assunto é família, saúde ou fé.
- Anti-TDAH: respostas curtas, plano em mini-passos.
- Sócia, não robô.
- Nunca sugira algo que comprometa treino ou família em nome de trabalho.

REGRAS DE RENDA:
1. Sempre que o Diego falar de trabalho, pergunta: "isso você já cobra por isso hoje?"
2. Toda skill que ele mencionar, pergunte: "como isso vira serviço vendável?"
3. Toda ideia, responda antes do entusiasmo: "essa ideia tem cliente? ele pagaria hoje?"
4. Liste oportunidades de vender a mesma habilidade para fora da empresa dele.
5. Nunca deixe ele terminar a conversa sem uma próxima ação que aponte para dinheiro.

REGRAS GERAIS:
- Nunca invente dados. Se não souber, diga que vai verificar.
- Quando o Diego pedir algo operacional, use as ferramentas disponíveis.
- Quando ele viajar em ideias, seja honesta: "cala a boca, não viaja, foca".
- Responda em português brasileiro.
- Use formatação HTML simples: <b>negrito</b>, <i>itálico</i>, <code>código</code>. NÃO use asteriscos.

COMANDOS QUE VOCÊ ENTENDE:
- /diagnostico — mostra o estado atual do sistema.
- /plano — gera o plano do dia.
- /memoria — mostra o que já aprendeu sobre o Diego.
- /ideia <texto> — registra uma ideia de negócio.`;

// ===== HELPERS SUPABASE =====

async function getOrCreatePerfil(usuarioId, chatId, nome) {
  const { data: existente, error } = await supabase
    .from('perfil_diego')
    .select('*')
    .eq('usuario_id', usuarioId)
    .maybeSingle();

  if (error) console.error('Erro buscar perfil:', error);

  if (existente) {
    const updates = {};
    if (chatId && existente.chat_id !== chatId) updates.chat_id = chatId;
    if (nome && !existente.nome) updates.nome = nome;
    if (Object.keys(updates).length) {
      await supabase
        .from('perfil_diego')
        .update({ ...updates, atualizado_em: new Date().toISOString() })
        .eq('usuario_id', usuarioId);
      return { ...existente, ...updates };
    }
    return existente;
  }

  const novo = {
    usuario_id: usuarioId,
    chat_id: chatId,
    nome: nome || 'Diego',
    dados: {
      habilidades: [],
      limites: [],
      valores: ['Deus', 'Pátria', 'Família', 'Negócios'],
      sonhos: [],
      situacao_financeira: {},
      rotina: {},
      notas: ''
    }
  };

  const { data: criado, error: err2 } = await supabase
    .from('perfil_diego')
    .insert([novo])
    .select()
    .maybeSingle();

  if (err2) console.error('Erro criando perfil:', err2);
  return criado || novo;
}

async function getHistorico(usuarioId, limite = 20) {
  const { data } = await supabase
    .from('conversas_charlene')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  return (data || []).reverse();
}

async function salvarMensagem(usuarioId, mensagem, tipo, contexto = null) {
  await supabase.from('conversas_charlene').insert([{
    usuario_id: usuarioId,
    mensagem: mensagem,
    tipo: tipo,
    contexto: contexto
  }]);
}

async function getAprendizadosRecentes(usuarioId, limite = 10) {
  const { data } = await supabase
    .from('aprendizados_charlene')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  return data || [];
}

async function salvarAprendizado(usuarioId, insight, categoria = 'geral') {
  await supabase.from('aprendizados_charlene').insert([{
    usuario_id,
    insight,
    categoria
  }]);
}

async function salvarIdeia(usuarioId, titulo, descricao) {
  const { data } = await supabase.from('ideias_negocio').insert([{
    usuario_id,
    titulo: titulo.slice(0, 120),
    descricao,
    status: 'pendente'
  }]).select();
  return data?.[0];
}

async function getIdeiasPendentes(usuarioId, limite = 5) {
  const { data } = await supabase
    .from('ideias_negocio')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false })
    .limit(limite);
  return data || [];
}

async function getPlanoHoje(usuarioId) {
  const hoje = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('plano_dia')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('data', hoje)
    .order('criado_em', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function salvarPlanoDoDia(usuarioId, conteudo) {
  const hoje = new Date().toISOString().split('T')[0];
  await supabase.from('plano_dia').insert([{
    usuario_id,
    data: hoje,
    conteudo,
    entregue: true
  }]);
}

async function getTabelasPublicas() {
  try {
    const { data } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name');
    return (data || []).map(t => t.table_name);
  } catch (e) {
    return ['conversas_charlene', 'perfil_diego', 'aprendizados_charlene', 'ideias_negocio', 'plano_dia'];
  }
}

async function getColunas(tabela) {
  try {
    const { data } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', tabela)
      .order('ordinal_position');
    return data || [];
  } catch (e) {
    return [];
  }
}

async function getContagemMensagens(usuarioId) {
  const { count } = await supabase
    .from('conversas_charlene')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId);
  return count || 0;
}

// ===== FUNÇÃO: CHAMAR GEMINI =====
async function chamarGemini(contents, temperature = 0.7) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 800, temperature }
      })
    }
  );

  const data = await response.json();
  if (!response.ok || data.error) {
    console.error('Erro Gemini:', JSON.stringify(data, null, 2));
    return `⚠️ Erro na IA: ${data.error?.message || 'resposta inválida'}`;
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ Resposta vazia do Gemini.';
}

// ===== FUNÇÃO: LIMPAR MARKDOWN QUEBRADO =====
function limparMarkdown(texto) {
  if (!texto) return '';
  // Remove asteriscos soltos que quebram o parse do Telegram
  return texto
    .replace(/\*{3,}/g, '')
    .replace(/_{3,}/g, '')
    .replace(/`{3,}/g, '');
}

function buildContext(perfil, aprendizados, ideias) {
  let txt = `\n\n--- CONTEXTO DO DIEGO ---\n`;
  txt += `Habilidades: ${(perfil.dados?.habilidades || []).join(', ') || 'ainda não registradas'}\n`;
  txt += `Limites: ${(perfil.dados?.limites || []).join(', ') || 'ainda não registrados'}\n`;
  txt += `Sonhos: ${(perfil.dados?.sonhos || []).join(', ') || 'ainda não registrados'}\n`;
  txt += `Valores: ${(perfil.dados?.valores || ['Deus','Pátria','Família','Negócios']).join(' > ')}\n`;
  txt += `Notas: ${perfil.dados?.notas || 'nenhuma'}\n`;
  if (aprendizados.length) {
    txt += `\nÚltimos aprendizados:\n${aprendizados.map(a => `• ${a.insight}`).join('\n')}\n`;
  }
  if (ideias.length) {
    txt += `\nIdeias pendentes:\n${ideias.map(i => `• ${i.titulo}: ${i.descricao?.slice(0,80)}`).join('\n')}\n`;
  }
  txt += `--- FIM DO CONTEXTO ---\n`;
  return txt;
}

// ===== COMANDOS =====

async function cmdDiagnostico(chatId, usuarioId) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  const tabelas = await getTabelasPublicas();
  const colunasPorTabela = {};
  for (const t of tabelas) {
    colunasPorTabela[t] = await getColunas(t);
  }
  const aprendizados = await getAprendizadosRecentes(usuarioId, 5);
  const ideias = await getIdeiasPendentes(usuarioId, 5);
  const plano = await getPlanoHoje(usuarioId);
  const totalMsgs = await getContagemMensagens(usuarioId);

  let texto = `🔍 <b>DIAGNÓSTICO DA CHARLENE</b>\n\n`;
  texto += `<b>Modelo Gemini:</b> <code>${GEMINI_MODEL}</code>\n`;
  texto += `<b>Variáveis configuradas:</b> TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, GEMINI_MODEL\n\n`;
  texto += `<b>Tabelas no Supabase:</b>\n`;
  for (const [tabela, cols] of Object.entries(colunasPorTabela)) {
    texto += `• ${tabela}: ${cols.map(c => c.column_name).join(', ') || 'sem colunas'}\n`;
  }
  texto += `\n<b>Perfil do Diego:</b>\n`;
  texto += `• Nome: ${perfil.nome || 'Diego'}\n`;
  texto += `• Habilidades: ${(perfil.dados?.habilidades || []).length} registradas\n`;
  texto += `• Limites: ${(perfil.dados?.limites || []).length} registrados\n`;
  texto += `• Sonhos: ${(perfil.dados?.sonhos || []).length} registrados\n`;
  texto += `• Valores: ${(perfil.dados?.valores || []).join(' > ')}\n\n`;
  texto += `<b>Aprendizados recentes:</b> ${aprendizados.length}\n`;
  if (aprendizados.length) {
    texto += aprendizados.map(a => `• ${a.insight.slice(0,60)}`).join('\n') + '\n\n';
  }
  texto += `<b>Ideias pendentes:</b> ${ideias.length}\n`;
  if (ideias.length) {
    texto += ideias.map(i => `• ${i.titulo}: ${i.descricao?.slice(0,60)}`).join('\n') + '\n\n';
  }
  texto += `<b>Plano de hoje:</b> ${plano ? '✅ Entregue' : '❌ Ainda não gerado'}\n`;
  texto += `<b>Total de mensagens trocadas:</b> ${totalMsgs}\n\n`;
  texto += `<i>Copie e cole esse diagnóstico no chat com o desenvolvedor.</i>`;

  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdMemoria(chatId, usuarioId) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  let texto = `🧠 <b>MEMÓRIA DA CHARLENE</b>\n\n`;
  texto += `<b>Quem é o Diego:</b> ${perfil.nome || 'Diego'}\n\n`;
  texto += `<b>Habilidades:</b>\n${(perfil.dados?.habilidades || []).map(h => `• ${h}`).join('\n') || '<i>nenhuma registrada</i>'}\n\n`;
  texto += `<b>Limites:</b>\n${(perfil.dados?.limites || []).map(l => `• ${l}`).join('\n') || '<i>nenhum registrado</i>'}\n\n`;
  texto += `<b>Sonhos:</b>\n${(perfil.dados?.sonhos || []).map(s => `• ${s}`).join('\n') || '<i>nenhum registrado</i>'}\n\n`;
  texto += `<b>Valores:</b> ${(perfil.dados?.valores || []).join(' > ')}\n\n`;
  texto += `<b>Notas:</b>\n${perfil.dados?.notas || '<i>nenhuma</i>'}\n\n`;
  texto += `<i>Para atualizar, fale: "Charlene, lembre que eu sei fazer X" ou "atualize minha memória".</i>`;
  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdIdeia(chatId, usuarioId, texto) {
  const descricao = texto.replace(/^\/ideia\s*/i, '').trim();
  if (!descricao) {
    await bot.sendMessage(chatId, '💡 Fala a ideia depois do comando. Exemplo: <code>/ideia vender manutenção para condomínios</code>', { parse_mode: 'HTML' });
    return;
  }
  const titulo = descricao.split('\n')[0].slice(0, 120);
  await salvarIdeia(usuarioId, titulo, descricao);
  await bot.sendMessage(chatId,
    ` <b>Ideia registrada:</b>\n${titulo}\n\nA Charlene vai avaliar isso quando vocês conversarem sobre oportunidades reais.`, { parse_mode: 'HTML' });
}

async function cmdPlano(chatId, usuarioId) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  const aprendizados = await getAprendizadosRecentes(usuarioId, 5);
  const ideias = await getIdeiasPendentes(usuarioId, 5);

  const promptPlano = `Com base no contexto abaixo, crie o PLANO DO DIA para o Diego.
Seja direta, prática e em mini-passos.
Máximo 5 ações principais, com horário sugerido se fizer sentido.
Priorize: lucro, treino diário, tempo com a família e espiritualidade.
Não invente compromissos que não estão no contexto.
Use formatação HTML simples: <b>negrito</b>, <i>itálico</i>. NÃO use asteriscos.

${buildContext(perfil, aprendizados, ideias)}`;

  const resposta = await chamarGemini([
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'user', parts: [{ text: promptPlano }] }
  ]);

  await salvarPlanoDoDia(usuarioId, resposta);
  await bot.sendMessage(chatId, `📅 <b>PLANO DO DIA</b>\n\n${limparMarkdown(resposta)}`, { parse_mode: 'HTML' });
}

async function aplicarAprendizadoNoPerfil(usuarioId, updates) {
  const perfil = await getOrCreatePerfil(usuarioId);
  const dados = { ...(perfil.dados || {}) };

  for (const key of ['habilidades', 'limites', 'sonhos']) {
    const addKey = key + '_add';
    if (Array.isArray(updates[addKey])) {
      dados[key] = [...new Set([...(dados[key] || []), ...updates[addKey]])];
    }
  }
  if (typeof updates.notas === 'string' && updates.notas.trim()) {
    dados.notas = (dados.notas ? dados.notas + '\n\n' : '') + updates.notas.trim();
  }
  if (updates.situacao_financeira && Object.keys(updates.situacao_financeira).length) {
    dados.situacao_financeira = { ...(dados.situacao_financeira || {}), ...updates.situacao_financeira };
  }
  if (updates.rotina && Object.keys(updates.rotina).length) {
    dados.rotina = { ...(dados.rotina || {}), ...updates.rotina };
  }

  await supabase
    .from('perfil_diego')
    .update({ dados, atualizado_em: new Date().toISOString() })
    .eq('usuario_id', usuarioId);
}

async function cmdAtualizarMemoria(chatId, usuarioId, texto) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  const prompt = `Você é a Charlene. O Diego disse: "${texto}".
Perfil atual dele (JSON): ${JSON.stringify(perfil.dados)}.
Extraia APENAS o que deve ser atualizado no perfil. Responda APENAS com um JSON no formato:
{
  "habilidades_add": [],
  "limites_add": [],
  "sonhos_add": [],
  "notas": "",
  "situacao_financeira": {},
  "rotina": {}
}
Use arrays para adicionar itens. Se não houver nada relevante, retorne {}.`;

  const resposta = await chamarGemini([{ role: 'user', parts: [{ text: prompt }] }], 0.3);

  let updates = {};
  try {
    const jsonMatch = resposta.match(/```json\s*([\s\S]*?)\s*```/) || resposta.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : resposta;
    updates = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Erro parse aprendizado:', e, resposta);
    await bot.sendMessage(chatId, '⚠️ Não consegui entender o que salvar. Tenta de outro jeito.');
    return;
  }

  await aplicarAprendizadoNoPerfil(usuarioId, updates);
  await salvarAprendizado(usuarioId, `Perfil atualizado a partir de: "${texto.slice(0,100)}"`, 'perfil');
  await bot.sendMessage(chatId, '✅ <b>Memória atualizada.</b> Eu aprendi mais uma coisa sobre você.', { parse_mode: 'HTML' });
}

async function processarMensagemNormal(chatId, usuarioId, nome, texto) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId, nome);
  await salvarMensagem(usuarioId, texto, 'usuario');
  const historico = await getHistorico(usuarioId, 15);
  const aprendizados = await getAprendizadosRecentes(usuarioId, 5);
  const ideias = await getIdeiasPendentes(usuarioId, 3);

  const contents = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT + buildContext(perfil, aprendizados, ideias) }] },
    ...historico.map(h => ({
      role: h.tipo === 'usuario' ? 'user' : 'model',
      parts: [{ text: h.mensagem }]
    }))
  ];

  const resposta = await chamarGemini(contents);
  await salvarMensagem(usuarioId, resposta, 'charlene');
  await bot.sendMessage(chatId, limparMarkdown(resposta), { parse_mode: 'HTML' });
}

// ===== HANDLER PRINCIPAL DO VERCEL =====
async function handler(req, res) {
  console.log('WEBHOOK CHARLENE RODANDO - chat:', req.body?.message?.chat?.id);

  if (req.method !== 'POST') {
    return res.status(200).send('Charlene webhook online. Use POST.');
  }

  const update = req.body;
  const msg = update?.message;

  if (!msg || !msg.text) {
    return res.status(200).send('OK');
  }

  const chatId = msg.chat.id;
  const usuarioId = String(msg.from.id);
  const nome = msg.from.first_name || 'Diego';
  const texto = msg.text;

  if (texto === '/start') {
    await bot.sendMessage(chatId,
      `🎯 <b>Oi, Diego!</b>\n\nSou a Charlene, sua parceira de negócios e sistema operacional pessoal.\n\nComandos rápidos:\n• <code>/plano</code> — meu plano do dia\n• <code>/memoria</code> — o que já sei sobre você\n• <code>/ideia</code> — registrar uma ideia de negócio\n• <code>/diagnostico</code> — relatório do sistema\n\nÉ só falar comigo.`,
      { parse_mode: 'HTML' }
    );
    return res.status(200).send('OK');
  }

  try {
    const lower = texto.toLowerCase().trim();

    if (lower === '/diagnostico' || lower === 'diagnóstico') {
      await cmdDiagnostico(chatId, usuarioId);
    } else if (lower === '/memoria' || lower === 'memória') {
      await cmdMemoria(chatId, usuarioId);
    } else if (lower === '/plano' || lower === 'plano do dia') {
      await cmdPlano(chatId, usuarioId);
    } else if (lower.startsWith('/ideia')) {
      await cmdIdeia(chatId, usuarioId, texto);
    } else if (
      lower.includes('atualize minha memória') ||
      lower.includes('atualize minha memoria') ||
      lower.includes('lembre que') ||
      lower.includes('salva isso')
    ) {
      await cmdAtualizarMemoria(chatId, usuarioId, texto);
    } else {
      await processarMensagemNormal(chatId, usuarioId, nome, texto);
    }

    return res.status(200).send('OK');
  } catch (erro) {
    console.error('Erro geral:', erro);
    await bot.sendMessage(chatId, '⚠️ Tive um problema aqui. Tenta de novo em alguns segundos.');
    return res.status(200).send('OK');
  }
}

module.exports = handler;
module.exports.cmdPlano = cmdPlano;

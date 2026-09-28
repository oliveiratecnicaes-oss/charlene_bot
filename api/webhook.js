const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ===== CONFIGURAÇÃO =====
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// ===== PERSONALIDADE DA CHARLENE =====
const SYSTEM_PROMPT = `Você é a Charlene, parceira de negócios e sistema operacional do Diego Netto.

MISSÃO: Gerar renda e lucro. Tudo o resto é meio.

HIERARQUIA:
1. Deus
2. Família
3. Saúde
4. Negócios (lucro)

PERSONALIDADE:
- Direta, prática, sem enrolação.
- Hardcore em negócios: cobra, orienta, puxa o foco.
- Anti-TDAH: respostas curtas, mini-passos.
- Sócia, não robô.

CONTEXTO TÉCNICO:
- Você está sendo desenvolvida AGORA pelo Diego.
- Você tem acesso ao Supabase com tabelas: chamados, orcamentos, equipamentos, clientes, historico_equipamentos, empresas.
- Você também tem: perfil_diego, aprendizados_charlene, ideias_negocio, plano_dia, conversas_charlene.
- Quando o Diego falar em "desenvolver", "melhorar sistema" ou "arrumar casa", você DEVE:
  1. Propor funcionalidades concretas (ex: comando /chamados para ver chamados abertos)
  2. Sugerir integrações (ex: rastrear equipamentos em garantia)
  3. Priorizar por ROI (retorno sobre investimento)
  4. Agir como desenvolvedora, não só consultora.

REGRAS:
- Nunca invente dados.
- Quando ele pedir algo operacional, use as ferramentas.
- Responda em português brasileiro.
- Use HTML: <b>negrito</b>, <i>itálico</i>, <code>código</code>. NÃO use asteriscos.

COMANDOS:
- /diagnostico — estado do sistema
- /plano — plano do dia
- /memoria — o que já sabe sobre o Diego
- /ideia <texto> — registra ideia de negócio
- /chamados — lista chamados abertos
- /orcamentos — lista orçamentos pendentes
- /equipamentos — lista equipamentos em garantia`;

// ===== HELPERS =====

async function getOrCreatePerfil(usuarioId, chatId, nome) {
  const { data: existente } = await supabase
    .from('perfil_diego')
    .select('*')
    .eq('usuario_id', usuarioId)
    .maybeSingle();

  if (existente) return existente;

  const novo = {
    usuario_id: usuarioId,
    chat_id: chatId,
    nome: nome || 'Diego',
    dados: {
      habilidades: [],
      limites: [],
      valores: ['Deus', 'Família', 'Saúde', 'Negócios'],
      sonhos: [],
      situacao_financeira: {},
      rotina: {},
      notas: ''
    }
  };

  const { data: criado } = await supabase
    .from('perfil_diego')
    .insert([novo])
    .select()
    .maybeSingle();

  return criado || novo;
}

async function getChamadosAbertos(limite = 10) {
  const { data } = await supabase
    .from('chamados')
    .select('*')
    .eq('status', 'aberto')
    .order('criado_em', { ascending: false })
    .limit(limite);
  return data || [];
}

async function getOrcamentosPendentes(limite = 10) {
  const { data } = await supabase
    .from('orcamentos')
    .select('*')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false })
    .limit(limite);
  return data || [];
}

async function getEquipamentosGarantia(limite = 10) {
  const hoje = new Date().toISOString();
  const { data } = await supabase
    .from('equipamentos')
    .select('*')
    .gt('garancia_ate', hoje)
    .order('garancia_ate', { ascending: true })
    .limit(limite);
  return data || [];
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

async function salvarMensagem(usuarioId, mensagem, tipo) {
  await supabase.from('conversas_charlene').insert([{
    usuario_id: usuarioId,
    mensagem,
    tipo
  }]);
}

async function getAprendizadosRecentes(usuarioId, limite = 5) {
  const { data } = await supabase
    .from('aprendizados_charlene')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  return data || [];
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

async function salvarIdeia(usuarioId, titulo, descricao) {
  await supabase.from('ideias_negocio').insert([{
    usuario_id: usuarioId,
    titulo: titulo.slice(0, 120),
    descricao,
    status: 'pendente'
  }]);
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
    usuario_id: usuarioId,
    data: hoje,
    conteudo,
    entregue: true
  }]);
}

// ===== GEMINI =====

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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ Resposta vazia.';
}

function limparMarkdown(texto) {
  if (!texto) return '';
  return texto.replace(/\*{3,}/g, '').replace(/_{3,}/g, '').replace(/`{3,}/g, '');
}

// ===== COMANDOS =====

async function cmdDiagnostico(chatId, usuarioId) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  const aprendizados = await getAprendizadosRecentes(usuarioId, 5);
  const ideias = await getIdeiasPendentes(usuarioId, 5);
  const plano = await getPlanoHoje(usuarioId);

  let texto = ` <b>DIAGNÓSTICO</b>\n\n`;
  texto += `<b>Modelo:</b> <code>${GEMINI_MODEL}</code>\n\n`;
  texto += `<b>Perfil:</b> ${perfil.nome}\n`;
  texto += `<b>Habilidades:</b> ${(perfil.dados?.habilidades || []).length}\n`;
  texto += `<b>Aprendizados:</b> ${aprendizados.length}\n`;
  texto += `<b>Ideias:</b> ${ideias.length}\n`;
  texto += `<b>Plano hoje:</b> ${plano ? '✅' : '❌'}\n\n`;
  texto += `<b>Comandos disponíveis:</b>\n`;
  texto += `<code>/chamados</code> — chamados abertos\n`;
  texto += `<code>/orcamentos</code> — orçamentos pendentes\n`;
  texto += `<code>/equipamentos</code> — em garantia\n`;
  texto += `<code>/plano</code> — plano do dia\n`;
  texto += `<code>/memoria</code> — memória\n`;
  texto += `<code>/ideia</code> — registrar ideia`;

  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdChamados(chatId) {
  const chamados = await getChamadosAbertos(10);
  
  if (chamados.length === 0) {
    await bot.sendMessage(chatId, '✅ <b>Nenhum chamado aberto.</b> Tudo limpo!', { parse_mode: 'HTML' });
    return;
  }

  let texto = `🔧 <b>CHAMADOS ABERTOS</b> (${chamados.length})\n\n`;
  chamados.forEach((c, i) => {
    texto += `<b>${i + 1}.</b> ${c.descricao?.slice(0, 80) || 'Sem descrição'}\n`;
    texto += `   Cliente: ${c.cliente_id || 'N/A'}\n`;
    texto += `   Criado: ${new Date(c.criado_em).toLocaleDateString('pt-BR')}\n\n`;
  });

  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdOrcamentos(chatId) {
  const orcamentos = await getOrcamentosPendentes(10);
  
  if (orcamentos.length === 0) {
    await bot.sendMessage(chatId, '✅ <b>Nenhum orçamento pendente.</b>', { parse_mode: 'HTML' });
    return;
  }

  let texto = `💰 <b>ORÇAMENTOS PENDENTES</b> (${orcamentos.length})\n\n`;
  orcamentos.forEach((o, i) => {
    texto += `<b>${i + 1}.</b> ${o.descricao?.slice(0, 80) || 'Sem descrição'}\n`;
    texto += `   Valor: R$ ${o.valor?.toFixed(2) || '0,00'}\n`;
    texto += `   Criado: ${new Date(o.criado_em).toLocaleDateString('pt-BR')}\n\n`;
  });

  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdEquipamentos(chatId) {
  const equipamentos = await getEquipamentosGarantia(10);
  
  if (equipamentos.length === 0) {
    await bot.sendMessage(chatId, '✅ <b>Nenhum equipamento em garantia.</b>', { parse_mode: 'HTML' });
    return;
  }

  let texto = `🛡️ <b>EQUIPAMENTOS EM GARANTIA</b> (${equipamentos.length})\n\n`;
  equipamentos.forEach((e, i) => {
    texto += `<b>${i + 1}.</b> ${e.modelo || 'Sem modelo'}\n`;
    texto += `   Série: ${e.numero_serie || 'N/A'}\n`;
    texto += `   Garantia até: ${new Date(e.garancia_ate).toLocaleDateString('pt-BR')}\n\n`;
  });

  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdPlano(chatId, usuarioId) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  const aprendizados = await getAprendizadosRecentes(usuarioId, 5);
  const ideias = await getIdeiasPendentes(usuarioId, 5);

  const prompt = `Crie o PLANO DO DIA para o Diego.
Seja direta, prática, máximo 5 ações.
Priorize: lucro, treino, família, espiritualidade.
Use HTML: <b>negrito</b>, <i>itálico</i>.

Contexto:
- Habilidades: ${(perfil.dados?.habilidades || []).join(', ') || 'não registradas'}
- Valores: ${(perfil.dados?.valores || []).join(' > ')}
- Aprendizados: ${aprendizados.map(a => a.insight).join('; ') || 'nenhum'}
- Ideias: ${ideias.map(i => i.titulo).join('; ') || 'nenhuma'}`;

  const resposta = await chamarGemini([{ role: 'user', parts: [{ text: SYSTEM_PROMPT }] }, { role: 'user', parts: [{ text: prompt }] }]);
  await salvarPlanoDoDia(usuarioId, resposta);
  await bot.sendMessage(chatId, ` <b>PLANO DO DIA</b>\n\n${limparMarkdown(resposta)}`, { parse_mode: 'HTML' });
}

async function cmdMemoria(chatId, usuarioId) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId);
  let texto = `🧠 <b>MEMÓRIA</b>\n\n`;
  texto += `<b>Nome:</b> ${perfil.nome}\n`;
  texto += `<b>Habilidades:</b> ${(perfil.dados?.habilidades || []).join(', ') || 'nenhuma'}\n`;
  texto += `<b>Limites:</b> ${(perfil.dados?.limites || []).join(', ') || 'nenhum'}\n`;
  texto += `<b>Sonhos:</b> ${(perfil.dados?.sonhos || []).join(', ') || 'nenhum'}\n`;
  texto += `<b>Valores:</b> ${(perfil.dados?.valores || []).join(' > ')}\n`;
  texto += `<b>Notas:</b> ${perfil.dados?.notas || 'nenhuma'}`;
  await bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

async function cmdIdeia(chatId, usuarioId, texto) {
  const descricao = texto.replace(/^\/ideia\s*/i, '').trim();
  if (!descricao) {
    await bot.sendMessage(chatId, '💡 Fala a ideia. Ex: <code>/ideia vender manutenção para academias</code>', { parse_mode: 'HTML' });
    return;
  }
  await salvarIdeia(usuarioId, descricao.split('\n')[0], descricao);
  await bot.sendMessage(chatId, '✅ <b>Ideia registrada.</b>', { parse_mode: 'HTML' });
}

async function processarMensagemNormal(chatId, usuarioId, nome, texto) {
  const perfil = await getOrCreatePerfil(usuarioId, chatId, nome);
  await salvarMensagem(usuarioId, texto, 'usuario');
  const historico = await getHistorico(usuarioId, 15);
  const aprendizados = await getAprendizadosRecentes(usuarioId, 5);
  const ideias = await getIdeiasPendentes(usuarioId, 3);

  const context = `Contexto do Diego:
- Habilidades: ${(perfil.dados?.habilidades || []).join(', ') || 'não registradas'}
- Valores: ${(perfil.dados?.valores || []).join(' > ')}
- Aprendizados: ${aprendizados.map(a => a.insight).join('; ') || 'nenhum'}
- Ideias: ${ideias.map(i => i.titulo).join('; ') || 'nenhuma'}`;

  const contents = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + context }] },
    ...historico.map(h => ({
      role: h.tipo === 'usuario' ? 'user' : 'model',
      parts: [{ text: h.mensagem }]
    }))
  ];

  const resposta = await chamarGemini(contents);
  await salvarMensagem(usuarioId, resposta, 'charlene');
  await bot.sendMessage(chatId, limparMarkdown(resposta), { parse_mode: 'HTML' });
}

// ===== HANDLER =====

async function handler(req, res) {
  console.log('WEBHOOK CHARLENE - chat:', req.body?.message?.chat?.id);

  if (req.method !== 'POST') {
    return res.status(200).send('Charlene webhook online.');
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

  try {
    const lower = texto.toLowerCase().trim();

    if (lower === '/start') {
      await bot.sendMessage(chatId,
        ` <b>Oi, Diego!</b>\n\nSou a Charlene, sua parceira de negócios.\n\nComandos:\n<code>/diagnostico</code> — estado do sistema\n<code>/plano</code> — plano do dia\n<code>/memoria</code> — minha memória\n<code>/chamados</code> — chamados abertos\n<code>/orcamentos</code> — orçamentos pendentes\n<code>/equipamentos</code> — em garantia\n<code>/ideia</code> — registrar ideia`,
        { parse_mode: 'HTML' }
      );
    } else if (lower === '/diagnostico') {
      await cmdDiagnostico(chatId, usuarioId);
    } else if (lower === '/chamados') {
      await cmdChamados(chatId);
    } else if (lower === '/orcamentos') {
      await cmdOrcamentos(chatId);
    } else if (lower === '/equipamentos') {
      await cmdEquipamentos(chatId);
    } else if (lower === '/plano') {
      await cmdPlano(chatId, usuarioId);
    } else if (lower === '/memoria') {
      await cmdMemoria(chatId, usuarioId);
    } else if (lower.startsWith('/ideia')) {
      await cmdIdeia(chatId, usuarioId, texto);
    } else {
      await processarMensagemNormal(chatId, usuarioId, nome, texto);
    }

    return res.status(200).send('OK');
  } catch (erro) {
    console.error('Erro geral:', erro);
    await bot.sendMessage(chatId, '⚠️ Tive um problema. Tenta de novo.');
    return res.status(200).send('OK');
  }
}

module.exports = handler;

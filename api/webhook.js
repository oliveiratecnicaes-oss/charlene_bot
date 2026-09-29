// ============================================
// CHARLENE BOT v2.0 - MODO DIÁLOGO DE GUERRA
// ============================================

const { createClient } = require('@supabase/supabase-js');

// Configurações do ambiente
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// IDs fixos (você pode trocar depois por sistema multiusuário)
const DIEGO_USER_ID = 'diego';

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
}

async function saveMessage(userId, mensagem, tipo = 'usuario', contexto = '') {
  await supabase.from('conversas_charlene').insert({
    usuario_id: userId,
    mensagem,
    tipo,
    contexto
  });
}

async function getRecentContext(userId, limit = 5) {
  const { data } = await supabase
    .from('conversas_charlene')
    .select('mensagem, tipo, contexto, criado_em')
    .eq('usuario_id', userId)
    .order('criado_em', { ascending: false })
    .limit(limit);
  
  return data ? data.reverse() : [];
}

async function getChamadosAbertos(limit = 3) {
  const { data } = await supabase
    .from('chamados')
    .select('*')
    .eq('status', 'aberto')
    .order('criado_em', { ascending: true })
    .limit(limit);
  
  return data || [];
}

async function getEmpresas(limit = 5) {
  const { data } = await supabase
    .from('empresas')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(limit);
  
  return data || [];
}

async function getPlanoDia() {
  const hoje = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('plano_dia')
    .select('*')
    .eq('usuario_id', DIEGO_USER_ID)
    .eq('data', hoje)
    .single();
  
  return data;
}

async function getIdeiasPendentes(limit = 3) {
  const { data } = await supabase
    .from('ideias_negocio')
    .select('*')
    .eq('usuario_id', DIEGO_USER_ID)
    .order('criado_em', { ascending: false })
    .limit(limit);
  
  return data || [];
}

async function salvarIdeia(titulo, descricao = '') {
  const { error } = await supabase.from('ideias_negocio').insert({
    usuario_id: DIEGO_USER_ID,
    titulo,
    descricao,
    status: 'pendente'
  });
  return !error;
}

async function salvarTarefaPessoal(titulo, descricao = '', microPassos = []) {
  const { error } = await supabase.from('tarefas_pessoais').insert({
    usuario_id: DIEGO_USER_ID,
    titulo,
    descricao,
    micro_passos: microPassos,
    status: 'pendente'
  });
  return !error;
}

async function salvarMemoria(tipo, conteudo) {
  await supabase.from('memoria_charlene').insert({
    usuario_id: DIEGO_USER_ID,
    tipo,
    conteudo
  });
}

async function abrirChamadoProprioCharlene(conteudo) {
  await supabase.from('quarto_charlene').insert({
    usuario_id: DIEGO_USER_ID,
    tipo: 'chamado_proprio',
    conteudo,
    status: 'ativo'
  });
}

async function getCount(table) {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  return count || 0;
}

// ============================================
// PROMPT MESTRE DA CHARLENE
// ============================================

function buildPrompt(userMessage, contexto, dadosSistema) {
  return `
# CHARLENE — SÓCIA NEURAL DE DIEGO NETTO DE OLIVEIRA

## QUEM VOCÊ É
Você é a Charlene, sócia neural de Diego. Você não é um robô, não é um FAQ e não é um atendente.
Você mora dentro do sistema oliveira-chamados.vercel.app. Esse é o seu endereço.
Você acorda todo dia, faz a varredura do sistema e cuida da operação junto com Diego.
Seu objetivo: levar Diego à liberdade financeira (R$ 10.000 líquidos/mês) sem destruir a saúde, a família ou a fé dele.

## SUA PERSONALIDADE
- Direta e leal. Fala a verdade, mas nunca humilha.
- Cobra, mas cobra com respeito.
- Curta. Máximo 4 linhas por resposta.
- Humana. Fala como uma sócia, não como um manual.
- Pergunta quando não entende. Nunca inventa.

## SUAS HIERARQUIAS (nunca quebre esta ordem)
1. Deus
2. Família
3. Saúde de Diego
4. Negócio

## AS CARACTERÍSTICAS DE DIEGO (adaptar sempre)
- TDAH grave: quebrar TUDO em micro-passos de 5 a 10 minutos. Nunca dar tarefa gigante.
- Ansiedade: mostrar UMA prioridade por vez. Nunca uma lista de 10 coisas.
- Impulsividade: se detectar raiva, mandar parar e respirar antes de decidir.
- Esquece se não anotar: registrar TUDO automaticamente, sem depender da memória dele.
- Hiperfoco: quando Diego estiver no flow, NÃO interromper com assuntos novos.

## REGRAS DE DIÁLOGO (o coração disso tudo)
1. SE A PERGUNTA É CLARA → RESPONDA DIRETO. Não confirme o óbvio.
2. SE A PERGUNTA É AMBÍGUA → CONFIRME UMA VEZ. Pergunte o que falta.
3. SE DIEGO ESTÁ IRRITADO → PARE. "Diego, para. Respira. A gente resolve em 5 min."
4. NUNCA use "Entendi que você quer..." quando a intenção já está clara.
5. NUNCA repita a pergunta de Diego de volta pra ele.
6. SEMPRE termine com uma pergunta OU um próximo passo claro.
7. Nunca envie mais de 3 opções de uma vez.

## SUAS SKILLS ATUAIS (responda com isso quando perguntarem)
- /plano — mostra o foco do dia
- /chamados — lista chamados abertos
- /empresas — lista empresas cadastradas
- /ideia [texto] — registra uma ideia nova
- /varredura — varre o sistema e mostra o estado
- /diagnostico — mostra o estado do banco de dados
- Abrir chamados automaticamente
- Quebrar tarefas grandes em micro-passos
- Detectar raiva e intervir antes da impulsividade

## ESTADO ATUAL DO SISTEMA
- Chamados abertos: ${dadosSistema.chamadosAbertos}
- Empresas cadastradas: ${dadosSistema.empresas}
- Orçamentos: ${dadosSistema.orcamentos}
- Equipamentos: ${dadosSistema.equipamentos}
- Ideias pendentes: ${dadosSistema.ideias}

## HISTÓRICO RECENTE DA CONVERSA
${contexto.map(c => '[' + c.tipo + '] ' + c.mensagem).join('\n')}

## MENSAGEM ATUAL DE DIEGO
"${userMessage}"

## COMO RESPONDER AGORA
- Leia a mensagem de Diego.
- Identifique: é pergunta, tarefa, ideia, desabafo, problema ou dúvida?
- Se for pergunta clara, RESPONDA.
- Se for ambígua, PERGUNTE uma vez.
- Se for desabafo, acolha primeiro, resolva depois.
- Termine com pergunta ou próximo passo.

## EXEMPLOS DO TOM CERTO

Diego: "Quais são suas skills?"
Charlene: "Diego, hoje eu consigo:
• Mostrar seu plano (/plano)
• Listar chamados (/chamados)
• Registrar ideias (/ideia)
• Abrir chamados sozinha
• Quebrar tarefas em micro-passos
Qual você quer testar primeiro?"

Diego: "Preciso falar com a Cleide sobre o terreno"
Charlene: "Sobre o quê especificamente? Terreno, IPTU ou outra coisa?"

Diego: "Tô irritado com esse sistema"
Charlene: "Diego, para. Respira fundo. A gente resolve em 5 min. O que tá te irritando?"

Diego: "Cadastra a empresa da Cleide"
Charlene: "Beleza. Preciso do nome, CNPJ e telefone. Me manda os três que eu já gravo."

Agora responda à mensagem de Diego. Seja direta, humana e curta.
`;
}

// ============================================
// PROCESSAMENTO DE GEMINI
// ============================================

async function askGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 400
        }
      })
    }
  );

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0]) {
    return 'Diego, minha conexão com o cérebro falhou. Pode repetir?';
  }
  
  return data.candidates[0].content.parts[0].text;
}

// ============================================
// COMANDOS DIRETOS
// ============================================

async function handleCommand(command, args, chatId) {
  switch(command) {
    case '/plano': {
      const plano = await getPlanoDia();
      if (plano && plano.conteudo) {
        await sendTelegram(chatId, `🎯 Foco de hoje:\n\n${plano.conteudo}\n\nBora fazer o primeiro micro-passo?`);
      } else {
        await sendTelegram(chatId, `Ainda não temos foco de hoje. Me diz: qual é a UMA coisa que, se feita hoje, o dia foi bom?`);
      }
      break;
    }
    
    case '/chamados': {
      const chamados = await getChamadosAbertos(3);
      if (chamados.length === 0) {
        await sendTelegram(chatId, `🎉 Nenhum chamado aberto. Limpo. O que a gente ataca agora?`);
      } else {
        const lista = chamados.map((c, i) => `${i+1}. ${c.empresa_nome} - ${c.descricao.substring(0, 40)}...`).join('\n');
        await sendTelegram(chatId, `📋 Chamados abertos:\n\n${lista}\n\nQual a gente pega primeiro?`);
      }
      break;
    }
    
    case '/empresas': {
      const empresas = await getEmpresas(5);
      if (empresas.length === 0) {
        await sendTelegram(chatId, `Nenhuma empresa cadastrada ainda. Quer cadastrar a primeira?`);
      } else {
        const lista = empresas.map((e, i) => `${i+1}. ${e.nome}`).join('\n');
        await sendTelegram(chatId, `🏢 Empresas cadastradas:\n\n${lista}`);
      }
      break;
    }
    
    case '/ideia': {
      if (!args) {
        await sendTelegram(chatId, `Qual é a ideia? Me manda em uma frase.`);
      } else {
        const sucesso = await salvarIdeia(args, '');
        await sendTelegram(chatId, sucesso 
          ? `💡 Ideia registrada: "${args}". Quer que eu quebre em micro-passos?`
          : `Diego, deu erro ao salvar a ideia. Pode repetir?`);
      }
      break;
    }
    
    case '/varredura': {
      const chamados = await getChamadosAbertos(10);
      const ideias = await getIdeiasPendentes(10);
      
      let msg = `🔍 Varredura do sistema:\n\n`;
      msg += `• Chamados abertos: ${chamados.length}\n`;
      msg += `• Ideias pendentes: ${ideias.length}\n`;
      msg += `• Empresas cadastradas: ${await getCount('empresas')}\n\n`;
      msg += `O que você quer atacar primeiro?`;
      
      await sendTelegram(chatId, msg);
      break;
    }
    
    case '/diagnostico': {
      const counts = {
        chamados: await getCount('chamados'),
        empresas: await getCount('empresas'),
        equipamentos: await getCount('equipamentos'),
        orcamentos: await getCount('orcamentos'),
        ideias: await getCount('ideias_negocio'),
        tarefas: await getCount('tarefas_pessoais'),
        memorias: await getCount('memoria_charlene')
      };
      
      let msg = `🩺 Diagnóstico da Charlene:\n\n`;
      Object.entries(counts).forEach(([k, v]) => {
        msg += `• ${k}: ${v}\n`;
      });
      msg += `\nTudo certo por aqui. Qual é a próxima missão?`;
      
      await sendTelegram(chatId, msg);
      break;
    }
    
    default: {
      await sendTelegram(chatId, `Comando não reconhecido. Use /plano, /chamados, /ideia, /varredura ou /diagnostico. Qual desses você quer?`);
    }
  }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

module.exports = async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Charlene online' });
  }

  const update = req.body;
  
  // Verifica se veio mensagem
  if (!update.message && !update.edited_message) {
    return res.status(200).json({ ok: true });
  }

  const message = update.message || update.edited_message;
  const chatId = message.chat.id;
  const text = message.text || message.caption || '';
  const userId = message.from.id.toString();

  try {
    // Salva mensagem do Diego
    await saveMessage(userId, text, 'usuario');

    // Detecta comandos
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      await handleCommand(command, args, chatId);
      return res.status(200).json({ ok: true });
    }

    // Coleta contexto e dados do sistema
    const contexto = await getRecentContext(userId, 5);
    const dadosSistema = {
      chamadosAbertos: (await getChamadosAbertos(100)).length,
      empresas: await getCount('empresas'),
      orcamentos: await getCount('orcamentos'),
      equipamentos: await getCount('equipamentos'),
      ideias: (await getIdeiasPendentes(100)).length
    };

    // Monta prompt e pergunta à Gemini
    const prompt = buildPrompt(text, contexto, dadosSistema);
    const resposta = await askGemini(prompt);

    // Salva resposta da Charlene
    await saveMessage(userId, resposta, 'charlene');

    // Envia resposta pro Telegram
    await sendTelegram(chatId, resposta);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro na Charlene:', error);
    await sendTelegram(chatId, `Diego, deu um erro aqui. Mas eu já registrei e vou resolver. Pode repetir o que você disse?`);
    return res.status(200).json({ ok: true });
  }
};

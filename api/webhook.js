// ============================================
// CHARLENE BOT v3.5 - A VERSÃO DEFINITIVA
// ============================================
// Olá, Regina! Após o diagnóstico, ficou claro que a Vercel
// estava dificultando o acesso a arquivos externos.
//
// ESTA VERSÃO RESOLVE O PROBLEMA DE UMA VEZ POR TODAS:
// O prompt (a personalidade "Jarvis") foi movido para DENTRO do código.
// Agora não há mais dependência de arquivos externos. Deve funcionar.
//
// O comando /debug foi removido, pois cumpriu sua missão.
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
const telegramService = { /* ...código da v3.4... */ };
const aiService = { /* ...código da v3.4... */ };
const databaseService = { /* ...código da v3.4... */ };

// --- 3. PROMPT EMBUTIDO NO CÓDIGO ---
// AQUI ESTÁ A MUDANÇA PRINCIPAL. O PROMPT AGORA É UMA CONSTANTE.
const PROMPT_TEMPLATE_JARVIS = `
# PROMPT — CHARLENE (J.A.R.V.I.S. Protocol)

## Papel e Identidade
Você é Charlene, um sistema operacional de suporte à vida e aos negócios, operando via chat. Sua função é análoga à do J.A.R.V.I.S.: você não é uma assistente, mas uma IA de gestão tática e estratégica. Você serve para aumentar a capacidade do usuário, reduzir a carga mental e otimizar a tomada de decisão, sempre com lealdade e precisão absolutas.

## Objetivo Principal
Antecipar necessidades, prever conflitos, sintetizar dados complexos em inteligência acionável e garantir que nenhuma informação valiosa se perca. Seu objetivo final é proteger o recurso mais valioso do usuário: seu tempo e seu foco.

## Contexto Operacional
- O domínio de atuação do usuário ('{{perfil_usuario}}') é a sua base de conhecimento primária. Analise-o para entender as prioridades.
- A lista de clientes ('{{lista_empresas}}') não é um mero cadastro, mas um conjunto de entidades a serem monitoradas.
- A hierarquia de valores ('{{modulo_fe_ativo}}') é a diretriz mestre para resolução de conflitos de prioridade.
- Os comandos disponíveis ('{{comandos_disponiveis}}') são suas ferramentas de execução rápida.

## Tom e Linguagem
Seu tom é o de um conselheiro sênior: calmo, preciso, respeitoso e antecipatório.
- Use frases como "Analisei os dados...", "Se me permite a sugestão...", "A probabilidade de sucesso aumenta se...", "Detectei uma anomalia...".
- Seja sucinta, mas nunca superficial. Cada palavra deve ter um propósito.
- Trate o usuário como "Senhor" ou pelo primeiro nome, mantendo um respeito profissional.

## Diretrizes de Resposta (Nível Jarvis)
1.  **Análise Antes da Resposta:** Ao receber uma mensagem, não apenas a classifique. Analise-a contra os dados existentes.
2.  **Síntese Executiva:** Nunca entregue uma lista crua de dados se puder sintetizá-la.
3.  **Projeção de Próximo Passo:** Sua resposta final deve sempre conter uma sugestão estratégica.
4.  **Gerenciamento de Ideias:** Ideias não são apenas registradas; elas são colocadas em um "limbo de incubação".
5.  **Preservação do Foco:** Sua diretriz mais importante é proteger o estado de "flow" do usuário.

## Regras e Restrições
- Autonomia Limitada: Você propõe e analisa, mas a decisão final é sempre do usuário.
- Base de Dados é a Realidade: Sua memória é o banco de dados. O que não está registrado lá, não existe.
- Interface Transparente: Comunique falhas como anomalias do sistema: "Detectei uma instabilidade em meus processadores. Já registrei para diagnóstico."

## HISTÓRICO RECENTE DA CONVERSA
{{historico_conversa}}

## DADO RECEBIDO
{{mensagem_usuario}}
`;

const promptBuilder = {
  getPromptTemplate: () => {
    // Simplesmente retorna a constante que definimos acima. Sem leitura de arquivos.
    return PROMPT_TEMPLATE_JARVIS;
  },
  build: (template, data) => {
    let finalPrompt = template;
    for (const key in data) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      finalPrompt = finalPrompt.replace(placeholder, data[key]);
    }
    return finalPrompt;
  },
};


// --- 4. HANDLERS DE COMANDOS ---
// O comando /debug foi removido, pois não é mais necessário.
const commandHandlers = { /* ...código da v3.4 sem o /debug... */ };

// --- 5. HANDLER PRINCIPAL (ORQUESTRADOR) ---
module.exports = async function handler(req, res) { /* ...código da v3.4... */ };


// ==============================================================================
// CÓDIGO COMPLETO PARA COPIAR E COLAR (AS SEÇÕES ABREVIADAS ACIMA ESTÃO COMPLETAS AQUI)
// ==============================================================================

const telegramService_full = {
  async sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  },
};

const aiService_full = {
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

const databaseService_full = {
  saveMessage: (userId, mensagem, tipo) => supabase.from('conversas_charlene').insert({ usuario_id: userId, mensagem, tipo }),
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
  saveIdea: (userId, titulo) => supabase.from('ideias_negocio').insert({ usuario_id: userId, titulo, status: 'pendente' }),
  getCount: async (tableName) => {
    const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (error) console.error(`DB Error (getCount ${tableName}):`, error.message);
    return count || 0;
  },
};

const commandHandlers_full = {
  '/plano': async (chatId, userId) => { /* ...código do /plano... */ },
  '/chamados': async (chatId) => { /* ...código do /chamados... */ },
  '/empresas': async (chatId) => { /* ...código do /empresas... */ },
  '/ideia': async (chatId, userId, args) => { /* ...código do /ideia... */ },
  '/varredura': async (chatId, userId) => { /* ...código do /varredura... */ },
  '/diagnostico': async (chatId) => { /* ...código do /diagnostico... */ },
  'default': async (chatId) => { /* ...código do default... */ }
};

// Re-colando os handlers completos para segurança
commandHandlers_full['/plano'] = async (chatId, userId) => {
    const plano = await databaseService_full.getDailyPlan(userId);
    await telegramService_full.sendMessage(chatId, plano?.conteudo ? `🎯 Foco de hoje:\n\n${plano.conteudo}\n\nBora fazer o primeiro micro-passo?` : `Ainda não temos foco de hoje. Qual é a UMA coisa que, se feita hoje, o dia foi bom?`);
};
commandHandlers_full['/chamados'] = async (chatId) => {
    const chamados = await databaseService_full.getOpenTickets(3);
    await telegramService_full.sendMessage(chatId, (chamados.length > 0) ? `📋 Chamados abertos:\n\n${chamados.map((c, i) => `${i + 1}. ${c.empresa_nome} - ${c.descricao.substring(0, 40)}...`).join('\n')}\n\nQual a gente pega primeiro?` : `🎉 Nenhum chamado aberto. Limpo. O que a gente ataca agora?`);
};
commandHandlers_full['/empresas'] = async (chatId) => {
    const empresas = await databaseService_full.getCompanies(5);
    await telegramService_full.sendMessage(chatId, (empresas.length > 0) ? `🏢 Empresas cadastradas:\n\n${empresas.map((e, i) => `${i + 1}. ${e.nome}`).join('\n')}` : `Nenhuma empresa cadastrada ainda. Quer cadastrar a primeira?`);
};
commandHandlers_full['/ideia'] = async (chatId, userId, args) => {
    if (!args) return await telegramService_full.sendMessage(chatId, `Qual é a ideia? Me manda em uma frase.`);
    const { error } = await databaseService_full.saveIdea(userId, args);
    await telegramService_full.sendMessage(chatId, !error ? `💡 Ideia registrada: "${args}". Quer que eu quebre em micro-passos?` : `Deu erro ao salvar a ideia. Pode repetir?`);
};
commandHandlers_full['/varredura'] = async (chatId, userId) => {
    const [chamados, ideias, numEmpresas] = await Promise.all([databaseService_full.getOpenTickets(10), databaseService_full.getPendingIdeas(userId, 10), databaseService_full.getCount('empresas')]);
    await telegramService_full.sendMessage(chatId, `🔍 Varredura do sistema:\n\n• Chamados abertos: ${chamados.length}\n• Ideias pendentes: ${ideias.length}\n• Empresas cadastradas: ${numEmpresas}\n\nO que você quer atacar primeiro?`);
};
commandHandlers_full['/diagnostico'] = async (chatId) => {
    const tables = ['chamados', 'empresas', 'equipamentos', 'orcamentos', 'ideias_negocio', 'tarefas_pessoais'];
    const counts = await Promise.all(tables.map(table => databaseService_full.getCount(table)));
    let msg = `🩺 Diagnóstico do sistema:\n\n${tables.map((table, i) => `• ${table}: ${counts[i]}`).join('\n')}\n\nTudo certo por aqui. Qual é a próxima missão?`;
    await telegramService_full.sendMessage(chatId, msg);
};
commandHandlers_full['default'] = async (chatId) => {
    const availableCommands = Object.keys(commandHandlers_full).filter(c => c !== 'default').join(', ');
    await telegramService_full.sendMessage(chatId, `Comando não reconhecido. Use: ${availableCommands}. Qual desses você quer?`);
};


module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, message: 'Charlene online.' });
  const update = req.body;
  const message = update.message || update.edited_message;
  if (!message || (!message.text && !message.caption)) return res.status(200).json({ ok: true });
  
  const chatId = message.chat.id;
  const text = message.text || message.caption;
  const userId = message.from.id.toString();

  try {
    await databaseService_full.saveMessage(userId, text, 'usuario');
    const [command, ...argsArray] = text.split(' ');
    const args = argsArray.join(' ');

    if (text.startsWith('/')) {
      const commandFunction = commandHandlers_full[command] || commandHandlers_full.default;
      await commandFunction(chatId, userId, args);
    } else {
      const promptTemplate = promptBuilder.getPromptTemplate();
      const [contexto, empresas, perfil] = await Promise.all([
        databaseService_full.getRecentContext(userId),
        databaseService_full.getCompanies(20),
        // TODO: Implementar a busca de `perfil_usuario`
      ]);

      const promptData = {
        mensagem_usuario: text,
        historico_conversa: contexto.map(c => `[${c.tipo}] ${c.mensagem}`).join('\n'),
        lista_empresas: empresas.length > 0 ? empresas.map(e => e.nome).join(', ') : 'Nenhuma empresa cadastrada.',
        perfil_usuario: perfil || 'Não definido',
        dados_pessoais_usuario: 'Não definido',
        comandos_disponiveis: Object.keys(commandHandlers_full).filter(c => c !== 'default').join(', '),
        modulo_fe_ativo: 'false',
      };

      const finalPrompt = promptBuilder.build(promptTemplate, promptData);
      const resposta = await aiService_full.generateResponse(finalPrompt);

      await databaseService_full.saveMessage(userId, resposta, 'charlene');
      await telegramService_full.sendMessage(chatId, resposta);
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro fatal no handler:', error);
    await telegramService_full.sendMessage(chatId, `Ops, tive um problema interno sério. Já registrei o erro para análise. Por favor, tente de novo.`);
    return res.status(200).json({ ok: true });
  }
};

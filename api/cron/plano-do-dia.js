const webhook = require('../webhook');

module.exports = async (req, res) => {
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: perfis, error } = await supabase
    .from('perfil_diego')
    .select('usuario_id, chat_id')
    .not('chat_id', 'is', null);

  if (error) {
    console.error('Erro cron:', error);
    return res.status(500).send('Erro');
  }

  for (const p of perfis) {
    try {
      await webhook.cmdPlano(p.chat_id, p.usuario_id);
    } catch (e) {
      console.error(`Erro no cron para ${p.usuario_id}:`, e);
    }
  }

  res.status(200).send('Planos enviados');
};

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

module.exports = async (req, res) => {
  const resultado = {
    env: {
      SUPABASE_URL: SUPABASE_URL ? 'OK' : 'FALTANDO',
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY ? 'OK' : 'FALTANDO',
      GEMINI_API_KEY: GEMINI_API_KEY ? 'OK' : 'FALTANDO'
    },
    supabase: 'TESTANDO',
    gemini: 'TESTANDO'
  };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase.from('conversas_charlene').select('id').limit(1);
    resultado.supabase = error ? `ERRO: ${error.message}` : `OK - ${data.length} registros`;
  } catch (e) {
    resultado.supabase = `ERRO: ${e.message}`;
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responda apenas: OK' }] }]
        })
      }
    );
    const data = await r.json();
    resultado.gemini = r.ok ? `OK - ${data.candidates?.[0]?.content?.parts?.[0]?.text}` : `ERRO: ${JSON.stringify(data)}`;
  } catch (e) {
    resultado.gemini = `ERRO: ${e.message}`;
  }

  res.status(200).json(resultado);
};

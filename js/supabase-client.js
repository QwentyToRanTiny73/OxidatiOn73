// Supabase клиент. Конфигурация заполняется на шаге 2.
// Используется через CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2

const SUPABASE_URL = '';      // TODO: заполнить на шаге 2
const SUPABASE_ANON_KEY = ''; // TODO: заполнить на шаге 2

window.supabaseClient = null;

function initSupabase() {
  if (!window.supabase) {
    console.warn('Supabase SDK не загружен');
    return null;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase конфигурация не задана — заполните SUPABASE_URL и SUPABASE_ANON_KEY');
    return null;
  }
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return window.supabaseClient;
}

document.addEventListener('DOMContentLoaded', initSupabase);

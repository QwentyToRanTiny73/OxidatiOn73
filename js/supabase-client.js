// Supabase клиент.
// Заполните две константы ниже значениями из Supabase → Project Settings → API.
// Это публичные значения — их безопасно держать в открытом репозитории,
// потому что данные защищены через Row Level Security, а не через секретность
// anon-ключа.

const SUPABASE_URL = '';      // пример: https://abcdefghij.supabase.co
const SUPABASE_ANON_KEY = ''; // пример: eyJhbGciOi...

// ---------------------------------------------------------------------------

window.supabaseClient = null;

function initSupabase() {
  if (!window.supabase) {
    console.error('[Supabase] SDK не загружен (проверьте <script src="…supabase-js@2">)');
    return null;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Supabase] SUPABASE_URL / SUPABASE_ANON_KEY не заданы в js/supabase-client.js');
    showConfigBanner();
    return null;
  }
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return window.supabaseClient;
}

// Если ключи не заданы — показываем подсказку прямо в интерфейсе,
// чтобы разработчик не гадал, почему ничего не работает.
function showConfigBanner() {
  if (document.getElementById('supabase-config-banner')) return;
  const div = document.createElement('div');
  div.id = 'supabase-config-banner';
  div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1000;padding:12px 16px;background:#A02C2C;color:#fff;font:14px/1.4 Inter,system-ui,sans-serif;text-align:center;';
  div.innerHTML = 'Supabase не сконфигурирован. Заполните <code>SUPABASE_URL</code> и <code>SUPABASE_ANON_KEY</code> в <code>js/supabase-client.js</code>. См. <code>supabase/README.md</code>.';
  document.body.prepend(div);
}

// Удобный геттер — кидает понятную ошибку, если клиент не готов.
function sb() {
  if (!window.supabaseClient) {
    throw new Error('Supabase клиент не инициализирован. Проверьте js/supabase-client.js.');
  }
  return window.supabaseClient;
}

document.addEventListener('DOMContentLoaded', initSupabase);

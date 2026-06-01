// Прототипная авторизация на localStorage.
// На шаге подключения Supabase эти функции будут переписаны на supabase.auth.
// Контракт (имена и сигнатуры) останется тем же — страницы не изменятся.

const STORE_KEYS = {
  users:    'oxidation73:users',
  wineries: 'oxidation73:wineries',
  session:  'oxidation73:session',
};

function _load(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function _save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function _uuid() {
  return (crypto.randomUUID?.() ?? ('id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)));
}

// --- API ---------------------------------------------------------------

async function signUp({ email, password, wineryName }) {
  if (!email || !password || !wineryName) throw new Error('Заполните все поля');
  if (password.length < 8) throw new Error('Пароль должен быть минимум 8 символов');

  const users = _load(STORE_KEYS.users);
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase()))
    throw new Error('Пользователь с таким email уже зарегистрирован');

  const wineryId = _uuid();
  const userId = _uuid();
  const now = new Date().toISOString();

  const wineries = _load(STORE_KEYS.wineries);
  wineries.push({
    id: wineryId,
    name: wineryName,
    owner_email: email,
    winery_type: 'estate',
    subscription_status: 'trial',
    created_at: now,
  });
  _save(STORE_KEYS.wineries, wineries);

  users.push({
    id: userId,
    email,
    password,                 // прототип: пароль в открытом виде. Supabase позже.
    winery_id: wineryId,
    role: 'owner',
    created_at: now,
  });
  _save(STORE_KEYS.users, users);

  _save(STORE_KEYS.session, { userId, wineryId, email });
  location.href = 'dashboard.html';
}

async function signIn({ email, password }) {
  const users = _load(STORE_KEYS.users);
  const user = users.find(u =>
    u.email.toLowerCase() === (email || '').toLowerCase() && u.password === password);
  if (!user) throw new Error('Неверный email или пароль');
  _save(STORE_KEYS.session, { userId: user.id, wineryId: user.winery_id, email: user.email });
  location.href = 'dashboard.html';
}

async function signOut() {
  localStorage.removeItem(STORE_KEYS.session);
  location.href = 'index.html';
}

function getSession() {
  return _load(STORE_KEYS.session, null);
}

async function requireAuth() {
  if (!getSession()) location.href = 'index.html';
}

async function getCurrentWinery() {
  const s = getSession();
  if (!s) return null;
  return _load(STORE_KEYS.wineries).find(w => w.id === s.wineryId) || null;
}

async function updateCurrentWinery(patch) {
  const s = getSession();
  if (!s) throw new Error('Нет сессии');
  const wineries = _load(STORE_KEYS.wineries);
  const idx = wineries.findIndex(w => w.id === s.wineryId);
  if (idx === -1) throw new Error('Винодельня не найдена');
  wineries[idx] = { ...wineries[idx], ...patch };
  _save(STORE_KEYS.wineries, wineries);
  return wineries[idx];
}

// Демо-режим — мгновенный вход с сид-данными.
async function enterDemoMode() {
  const DEMO_EMAIL = 'demo@oxidation73.local';
  const users = _load(STORE_KEYS.users);
  let user = users.find(u => u.email === DEMO_EMAIL);

  if (!user) {
    const wineryId = _uuid();
    const userId   = _uuid();
    const now      = new Date().toISOString();

    _save(STORE_KEYS.wineries, [..._load(STORE_KEYS.wineries), {
      id: wineryId, name: 'Винодельня «Демо»', owner_email: DEMO_EMAIL,
      winery_type: 'estate', subscription_status: 'trial', created_at: now,
    }]);

    user = { id: userId, email: DEMO_EMAIL, password: 'demo', winery_id: wineryId, role: 'owner', created_at: now };
    _save(STORE_KEYS.users, [...users, user]);

    // Сид: образцы и анализы — функция в analyses.js
    if (typeof seedDemoData === 'function') await seedDemoData(wineryId);
  }
  _save(STORE_KEYS.session, { userId: user.id, wineryId: user.winery_id, email: user.email });
  location.href = 'dashboard.html';
}

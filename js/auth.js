// Авторизация / регистрация. Полная реализация — шаг 3.

async function signUp({ email, password, wineryName }) {
  // TODO шаг 3: регистрация через supabase.auth.signUp + создание winery
  throw new Error('signUp: реализация на шаге 3');
}

async function signIn({ email, password }) {
  // TODO шаг 3
  throw new Error('signIn: реализация на шаге 3');
}

async function signOut() {
  // TODO шаг 3
  throw new Error('signOut: реализация на шаге 3');
}

async function requireAuth() {
  // TODO шаг 3: если не залогинен — редирект на index.html
}

async function getCurrentUser() {
  // TODO шаг 3
  return null;
}

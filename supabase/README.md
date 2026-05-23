# Supabase — настройка для «Журнала лаборатории»

## 1. Создать проект

1. Зайти на <https://supabase.com> → **New project**.
2. Имя проекта: `oxidation73` (или любое).
3. Регион: ближайший — **Frankfurt (eu-central-1)** или **Stockholm**.
4. Пароль БД сохранить в менеджер паролей (нам он напрямую не понадобится).
5. Дождаться готовности проекта (~2 минуты).

## 2. Применить схему

1. В проекте Supabase → **SQL Editor** → **New query**.
2. Скопировать содержимое [`setup.sql`](setup.sql) целиком.
3. Вставить, нажать **Run**.
4. Внизу должно появиться `Success. No rows returned`.

Скрипт идемпотентный — можно прогонять повторно при изменениях.

## 3. Настроить Auth

В **Authentication → Providers → Email**:
- ✅ **Enable email provider**
- ✅ **Confirm email** (для продакшна) — для разработки можно временно выключить, чтобы не возиться с почтой
- **Secure email change** — на ваше усмотрение

В **Authentication → URL Configuration**:
- **Site URL**: `https://qwentytorantiny73.github.io/OxidatiOn73/`
  (для локальной разработки можно временно поставить `http://localhost:5500`)
- **Redirect URLs** добавить:
  - `https://qwentytorantiny73.github.io/OxidatiOn73/**`
  - `http://localhost:5500/**`

## 4. Получить ключи и вставить в клиент

В **Project Settings → API**:
- **Project URL** (`https://xxxxx.supabase.co`) — это `SUPABASE_URL`
- **anon / public key** (длинный JWT, начинается с `eyJ…`) — это `SUPABASE_ANON_KEY`

Открыть `js/supabase-client.js` в проекте и заполнить две константы:

```js
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

> Это публичные ключи — их можно безопасно класть в открытый репозиторий.
> Данные защищены через RLS, а не через секретность anon-ключа.

## 5. Проверка

После применения миграции в **Table Editor** должны появиться 5 таблиц:
- `wineries`
- `user_profiles`
- `samples`
- `analyses`  (с авторасчётом `molecular_so2`)
- `so2_recommendations`

И функция `current_winery_id()` в **Database → Functions**.

И триггер `on_auth_user_created` в **Database → Triggers** (на `auth.users`).

## 6. Что делают триггеры

- При успешной регистрации в Supabase Auth — автоматически создаётся запись
  в `wineries` (название из метаданных при signUp) и `user_profiles`
  с ролью `owner`.
- При вставке в `analyses` — `molecular_so2` рассчитывается базой по формуле
  `free_so2 / (1 + 10^(pH − 1.81))`. Клиент это поле не передаёт.

## 7. Как тестировать RLS вручную

В **SQL Editor** можно выполнить запрос от лица конкретного пользователя:

```sql
-- Получить uid из auth.users
select id, email from auth.users;

-- Имитировать сессию
set local role authenticated;
set local request.jwt.claim.sub = '<uid>';

select * from samples;  -- покажет только образцы из winery этого пользователя
```

-- ============================================================================
-- Журнал лаборатории — схема базы данных Supabase
-- Применять целиком в Supabase SQL Editor → Run.
-- Идемпотентно: повторное выполнение безопасно.
-- ============================================================================

-- Расширения
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Таблицы
-- ----------------------------------------------------------------------------

-- Винодельни
create table if not exists public.wineries (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  owner_email         text not null,
  winery_type         text default 'estate',           -- estate / garage / cooperative / other
  subscription_status text not null default 'trial',   -- trial / active / suspended
  created_at          timestamptz not null default now()
);

-- Профили пользователей (расширение auth.users)
-- Связь 1-к-1 с auth.users по id.
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  winery_id   uuid not null references public.wineries(id) on delete cascade,
  role        text not null default 'owner',           -- owner / lab_tech / viewer
  email       text,
  created_at  timestamptz not null default now()
);

create index if not exists user_profiles_winery_idx on public.user_profiles(winery_id);

-- Винные образцы
create table if not exists public.samples (
  id             uuid primary key default gen_random_uuid(),
  winery_id      uuid not null references public.wineries(id) on delete cascade,
  sample_code    text not null,
  variety        text,
  vintage        int,
  wine_type      text,        -- white / white-sweet / red / rose / orange / pet-nat / sparkling
  vessel         text,
  volume_liters  numeric(10, 2),
  stage          text,        -- must / fermentation / post-fermentation / aging / before-bottling / bottled
  notes          text,
  created_at     timestamptz not null default now(),
  unique (winery_id, sample_code)
);

create index if not exists samples_winery_idx     on public.samples(winery_id);
create index if not exists samples_created_at_idx on public.samples(created_at desc);

-- Анализы
-- molecular_so2 — генерируемая колонка, считается базой:
--   free_so2 / (1 + 10^(ph − 1.81))
create table if not exists public.analyses (
  id                 uuid primary key default gen_random_uuid(),
  sample_id          uuid not null references public.samples(id) on delete cascade,
  analyzed_at        timestamptz not null default now(),
  ph                 numeric(4, 2),
  titratable_acidity numeric(5, 2),
  volatile_acidity   numeric(5, 3),
  alcohol            numeric(5, 2),
  residual_sugar     numeric(6, 2),
  free_so2           numeric(6, 1),
  total_so2          numeric(6, 1),
  molecular_so2      numeric(6, 3) generated always as (
    case
      when free_so2 is not null and ph is not null
        then (free_so2 / (1 + power(10::numeric, ph - 1.81)))::numeric(6, 3)
      else null
    end
  ) stored,
  temperature        numeric(4, 1),
  density            numeric(6, 4),
  malic_acid         numeric(5, 2),
  lactic_acid        numeric(5, 2),
  analyst_name       text,
  notes              text,
  created_at         timestamptz not null default now()
);

create index if not exists analyses_sample_idx      on public.analyses(sample_id);
create index if not exists analyses_analyzed_at_idx on public.analyses(analyzed_at desc);

-- История добавок SO₂
create table if not exists public.so2_recommendations (
  id              uuid primary key default gen_random_uuid(),
  sample_id       uuid not null references public.samples(id) on delete cascade,
  added_at        timestamptz not null default now(),
  so2_added_mg_l  numeric(6, 1),
  kmbs_dose_g     numeric(8, 3),
  reason          text,         -- routine / pre-bottling / after-racking / other
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists so2_recs_sample_idx on public.so2_recommendations(sample_id);

-- ----------------------------------------------------------------------------
-- 2. Вспомогательная функция: winery_id текущего пользователя
-- ----------------------------------------------------------------------------
-- Используется в RLS-политиках. SECURITY DEFINER — чтобы политика для
-- user_profiles не вызывала рекурсию.

create or replace function public.current_winery_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select winery_id from public.user_profiles where id = auth.uid();
$$;

grant execute on function public.current_winery_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.wineries            enable row level security;
alter table public.user_profiles       enable row level security;
alter table public.samples             enable row level security;
alter table public.analyses            enable row level security;
alter table public.so2_recommendations enable row level security;

-- ---- wineries -----------------------------------------------------------
drop policy if exists wineries_select on public.wineries;
create policy wineries_select on public.wineries
  for select to authenticated
  using (id = public.current_winery_id());

drop policy if exists wineries_update on public.wineries;
create policy wineries_update on public.wineries
  for update to authenticated
  using (id = public.current_winery_id())
  with check (id = public.current_winery_id());

-- INSERT для wineries выполняется триггером при регистрации (SECURITY DEFINER),
-- поэтому отдельная политика INSERT не нужна.

-- ---- user_profiles -------------------------------------------------------
drop policy if exists profiles_select_own on public.user_profiles;
create policy profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or winery_id = public.current_winery_id());

drop policy if exists profiles_update_own on public.user_profiles;
create policy profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- samples -------------------------------------------------------------
drop policy if exists samples_select on public.samples;
create policy samples_select on public.samples
  for select to authenticated
  using (winery_id = public.current_winery_id());

drop policy if exists samples_insert on public.samples;
create policy samples_insert on public.samples
  for insert to authenticated
  with check (winery_id = public.current_winery_id());

drop policy if exists samples_update on public.samples;
create policy samples_update on public.samples
  for update to authenticated
  using (winery_id = public.current_winery_id())
  with check (winery_id = public.current_winery_id());

drop policy if exists samples_delete on public.samples;
create policy samples_delete on public.samples
  for delete to authenticated
  using (winery_id = public.current_winery_id());

-- ---- analyses ------------------------------------------------------------
drop policy if exists analyses_select on public.analyses;
create policy analyses_select on public.analyses
  for select to authenticated
  using (exists (
    select 1 from public.samples s
    where s.id = analyses.sample_id
      and s.winery_id = public.current_winery_id()
  ));

drop policy if exists analyses_insert on public.analyses;
create policy analyses_insert on public.analyses
  for insert to authenticated
  with check (exists (
    select 1 from public.samples s
    where s.id = analyses.sample_id
      and s.winery_id = public.current_winery_id()
  ));

drop policy if exists analyses_update on public.analyses;
create policy analyses_update on public.analyses
  for update to authenticated
  using (exists (
    select 1 from public.samples s
    where s.id = analyses.sample_id
      and s.winery_id = public.current_winery_id()
  ));

drop policy if exists analyses_delete on public.analyses;
create policy analyses_delete on public.analyses
  for delete to authenticated
  using (exists (
    select 1 from public.samples s
    where s.id = analyses.sample_id
      and s.winery_id = public.current_winery_id()
  ));

-- ---- so2_recommendations -------------------------------------------------
drop policy if exists so2_recs_select on public.so2_recommendations;
create policy so2_recs_select on public.so2_recommendations
  for select to authenticated
  using (exists (
    select 1 from public.samples s
    where s.id = so2_recommendations.sample_id
      and s.winery_id = public.current_winery_id()
  ));

drop policy if exists so2_recs_insert on public.so2_recommendations;
create policy so2_recs_insert on public.so2_recommendations
  for insert to authenticated
  with check (exists (
    select 1 from public.samples s
    where s.id = so2_recommendations.sample_id
      and s.winery_id = public.current_winery_id()
  ));

drop policy if exists so2_recs_update on public.so2_recommendations;
create policy so2_recs_update on public.so2_recommendations
  for update to authenticated
  using (exists (
    select 1 from public.samples s
    where s.id = so2_recommendations.sample_id
      and s.winery_id = public.current_winery_id()
  ));

drop policy if exists so2_recs_delete on public.so2_recommendations;
create policy so2_recs_delete on public.so2_recommendations
  for delete to authenticated
  using (exists (
    select 1 from public.samples s
    where s.id = so2_recommendations.sample_id
      and s.winery_id = public.current_winery_id()
  ));

-- ----------------------------------------------------------------------------
-- 4. Триггер: создание winery + user_profile при регистрации
-- ----------------------------------------------------------------------------
-- Ожидает, что клиент передаёт raw_user_meta_data:
--   { winery_name: "...", winery_type?: "..." }
-- (передаётся через supabase.auth.signUp({ ..., options: { data: { ... } } }))

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winery_id   uuid;
  v_winery_name text;
  v_winery_type text;
begin
  v_winery_name := coalesce(new.raw_user_meta_data->>'winery_name', 'Моя винодельня');
  v_winery_type := coalesce(new.raw_user_meta_data->>'winery_type', 'estate');

  insert into public.wineries (name, owner_email, winery_type)
  values (v_winery_name, new.email, v_winery_type)
  returning id into v_winery_id;

  insert into public.user_profiles (id, winery_id, role, email)
  values (new.id, v_winery_id, 'owner', new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. Грант на использование схемы (Supabase делает это автоматически,
--    дублируем на всякий случай)
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

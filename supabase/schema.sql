-- =========================================================
-- Arcade Hub — estrutura do banco (Supabase)
-- Cole tudo no Supabase: SQL Editor → New query → Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =========================================================

-- Perfis dos jogadores ------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text not null check (char_length(username) between 3 and 20),
  avatar      jsonb not null default '{}'::jsonb,
  level       int not null default 1,
  prestige    int not null default 0,
  total_xp    bigint not null default 0,
  wins        int not null default 0,
  mmr         int not null default 1000,
  data        jsonb,                         -- progresso completo do jogador
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "perfis visiveis para logados" on public.profiles;
create policy "perfis visiveis para logados" on public.profiles
  for select to authenticated using (true);

drop policy if exists "dono cria o proprio perfil" on public.profiles;
create policy "dono cria o proprio perfil" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "dono atualiza o proprio perfil" on public.profiles;
create policy "dono atualiza o proprio perfil" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Cria o perfil automaticamente quando alguém se cadastra --
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'jogador_' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->'avatar', '{}'::jsonb)
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Verifica se um username está livre (usado no cadastro) --
create or replace function public.username_available(name text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Fotos de perfil (Storage) -------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatares publicos" on storage.objects;
create policy "avatares publicos" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "envia o proprio avatar" on storage.objects;
create policy "envia o proprio avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "atualiza o proprio avatar" on storage.objects;
create policy "atualiza o proprio avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "remove o proprio avatar" on storage.objects;
create policy "remove o proprio avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Amizades ----------------------------------------------
-- Uma linha por relação: quem pediu (user_id) → quem recebeu (friend_id).
-- status: 'pending' (pedido), 'accepted' (amigos) ou 'blocked' (user_id bloqueou friend_id).
create table if not exists public.friendships (
  user_id    uuid not null references auth.users on delete cascade,
  friend_id  uuid not null references auth.users on delete cascade,
  status     text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;

drop policy if exists "ve as proprias amizades" on public.friendships;
create policy "ve as proprias amizades" on public.friendships
  for select to authenticated using (auth.uid() in (user_id, friend_id));

drop policy if exists "cria pedido ou bloqueio" on public.friendships;
create policy "cria pedido ou bloqueio" on public.friendships
  for insert to authenticated with check (
    auth.uid() = user_id and status in ('pending', 'blocked')
    -- quem foi bloqueado não consegue mandar pedido para quem bloqueou
    and (status = 'blocked' or not exists (
      select 1 from public.friendships f
      where f.user_id = friendships.friend_id and f.friend_id = auth.uid() and f.status = 'blocked'))
  );

drop policy if exists "aceita pedido recebido" on public.friendships;
create policy "aceita pedido recebido" on public.friendships
  for update to authenticated using (auth.uid() = friend_id and status = 'pending') with check (status = 'accepted');

drop policy if exists "desfaz amizade" on public.friendships;
create policy "desfaz amizade" on public.friendships
  for delete to authenticated using (auth.uid() = user_id or (auth.uid() = friend_id and status <> 'blocked'));

-- =========================================================
-- Jogos persistentes (Rail Atlas)
-- =========================================================

-- Save da companhia na nuvem + colunas públicas para o ranking
create table if not exists public.rail_atlas_saves (
  id          uuid primary key references auth.users on delete cascade,
  username    text,
  company     text,
  level       int not null default 1,
  deliveries  int not null default 0,
  stations    int not null default 0,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists rail_atlas_saves_rank on public.rail_atlas_saves (deliveries desc);
alter table public.rail_atlas_saves enable row level security;

drop policy if exists "ranking visivel para logados" on public.rail_atlas_saves;
create policy "ranking visivel para logados" on public.rail_atlas_saves
  for select to authenticated using (true);
drop policy if exists "dono grava o proprio save" on public.rail_atlas_saves;
create policy "dono grava o proprio save" on public.rail_atlas_saves
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "dono atualiza o proprio save" on public.rail_atlas_saves;
create policy "dono atualiza o proprio save" on public.rail_atlas_saves
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Eventos relatados pelos jogos (cada ID conta uma única vez)
create table if not exists public.persistent_events (
  id          text primary key,
  user_id     uuid not null references auth.users on delete cascade,
  game_id     text not null,
  event_type  text not null,
  kind        text,
  xp          int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists persistent_events_day on public.persistent_events (user_id, game_id, event_type, created_at);
alter table public.persistent_events enable row level security;
drop policy if exists "dono ve os proprios eventos" on public.persistent_events;
create policy "dono ve os proprios eventos" on public.persistent_events
  for select to authenticated using (auth.uid() = user_id);

-- O servidor decide o XP: confere o dono do evento, descarta repetições
-- e aplica o teto diário. O navegador nunca informa quanto XP ganhou.
create or replace function public.report_persistent_event(p_event_id text, p_game_id text, p_event_type text, p_kind text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_base int;
  v_today int;
  v_cap int := 150;
  v_xp int;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;
  if p_event_id not like p_game_id || ':u_' || v_uid::text || ':%' then raise exception 'evento de outra conta'; end if;
  if exists (select 1 from persistent_events where id = p_event_id) then return 0; end if;
  v_base := case p_game_id || ':' || p_event_type || ':' || coalesce(p_kind, 'common')
    when 'rail-atlas:cargo_delivered:common' then 2
    when 'rail-atlas:cargo_delivered:medium' then 4
    when 'rail-atlas:cargo_delivered:international' then 8
    when 'rail-atlas:cargo_delivered:special' then 12
    when 'rail-atlas:achievement_unlocked:achievement' then 20
    else 0 end;
  if p_event_type = 'cargo_delivered' then
    select coalesce(sum(xp), 0) into v_today from persistent_events
      where user_id = v_uid and game_id = p_game_id and event_type = 'cargo_delivered' and created_at >= date_trunc('day', now());
    v_xp := greatest(0, least(v_base, v_cap - v_today));
  else
    v_xp := v_base;
  end if;
  insert into persistent_events (id, user_id, game_id, event_type, kind, xp) values (p_event_id, v_uid, p_game_id, p_event_type, p_kind, v_xp);
  return v_xp;
end $$;
grant execute on function public.report_persistent_event(text, text, text, text) to authenticated;

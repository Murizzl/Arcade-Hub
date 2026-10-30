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

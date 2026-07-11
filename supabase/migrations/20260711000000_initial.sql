-- Spellbrawl online schema (run via Supabase CLI or dashboard SQL editor)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Wizard',
  avatar_color text not null default '#4dd8ff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  master_volume real not null default 1,
  sfx_volume real not null default 1,
  screen_shake boolean not null default true,
  control_scheme text not null default 'wasd',
  show_tutorial_hints boolean not null default true,
  ai_difficulty text not null default 'normal' check (ai_difficulty in ('easy', 'normal', 'hard')),
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.match_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('solo', 'online')),
  placement int not null,
  rounds_won int not null default 0,
  opponents int not null default 1,
  duration_sec int not null default 0,
  room_code text,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  matches_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  total_kos int not null default 0,
  total_deaths int not null default 0,
  total_damage_dealt real not null default 0,
  total_damage_taken real not null default 0,
  total_blocks int not null default 0,
  total_distance_m real not null default 0,
  best_placement int not null default 4,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.match_history enable row level security;
alter table public.player_stats enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = user_id);

create policy "history_select_own" on public.match_history for select using (auth.uid() = user_id);
create policy "history_insert_own" on public.match_history for insert with check (auth.uid() = user_id);

create policy "pstats_select_own" on public.player_stats for select using (auth.uid() = user_id);
create policy "pstats_insert_own" on public.player_stats for insert with check (auth.uid() = user_id);
create policy "pstats_update_own" on public.player_stats for update using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Wizard');
  insert into public.user_settings (user_id)
  values (new.id);
  insert into public.player_stats (user_id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

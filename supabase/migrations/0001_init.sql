-- BAKE Pool: core schema.
-- Members read everything; each member writes only their own picks before the
-- week's deadline; admins write everything. The lines sync runs server-side
-- with the service role key and bypasses RLS.

create table public.players (
  id        text primary key,                 -- 'brad', 'claude'
  name      text not null,
  initial   text not null,
  email     text unique,
  kind      text not null default 'human' check (kind in ('human', 'bot')),
  is_admin  boolean not null default false,
  sort      int not null default 0
);

create table public.weeks (
  id               bigint generated always as identity primary key,
  season           int not null,
  week             int not null,
  deadline         timestamptz,
  entry_fee        numeric(10,2) not null default 60,
  winnings         numeric(10,2) not null default 0,
  lines_synced_at  timestamptz,
  unique (season, week)
);

create table public.games (
  id              bigint generated always as identity primary key,
  week_id         bigint not null references public.weeks(id) on delete cascade,
  num             int not null,
  league          text not null check (league in ('NFL', 'NCAA')),
  away            text not null,
  home            text not null,
  fav             text not null,
  spread          numeric(5,1) not null check (spread >= 0),
  line            text not null,                 -- as printed, e.g. 'SEA -2.5'
  result          text,                          -- team that covered, or 'PUSH'
  entry_override  text,                          -- forces the group entry pick
  unique (week_id, num),
  check (fav in (away, home)),
  check (result is null or result in (away, home, 'PUSH')),
  check (entry_override is null or entry_override in (away, home))
);

create table public.picks (
  game_id     bigint not null references public.games(id) on delete cascade,
  player_id   text not null references public.players(id) on delete cascade,
  team        text not null,
  updated_at  timestamptz not null default now(),
  primary key (game_id, player_id)
);

create table public.elim_picks (
  week_id     bigint not null references public.weeks(id) on delete cascade,
  player_id   text not null references public.players(id) on delete cascade,
  team        text not null,
  updated_at  timestamptz not null default now(),
  primary key (week_id, player_id)
);

-- One row per week once the eliminator team is settled.
create table public.elim_weeks (
  week_id        bigint primary key references public.weeks(id) on delete cascade,
  override_team  text,
  outcome        text check (outcome in ('survived', 'died'))
);

create table public.settings (
  key    text primary key,
  value  jsonb not null
);

create index on public.games (week_id);
create index on public.picks (player_id);

-- A pick must name one of the two teams in its game.
create function public.check_pick_team() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.games g
                 where g.id = new.game_id and new.team in (g.away, g.home)) then
    raise exception 'Pick % is not a team in game %', new.team, new.game_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger picks_team before insert or update on public.picks
  for each row execute function public.check_pick_team();

-- ---------- access helpers ----------
create function public.current_player() returns text
language sql stable security definer set search_path = '' as $$
  select id from public.players
  where email is not null and lower(email) = lower(auth.jwt() ->> 'email')
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.players
                   where email is not null and lower(email) = lower(auth.jwt() ->> 'email')), false)
$$;

create function public.week_open(w bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select deadline is null or now() < deadline from public.weeks where id = w), false)
$$;

create function public.game_open(g bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.week_open(week_id) and result is null from public.games where id = g), false)
$$;

-- ---------- row level security ----------
alter table public.players    enable row level security;
alter table public.weeks      enable row level security;
alter table public.games      enable row level security;
alter table public.picks      enable row level security;
alter table public.elim_picks enable row level security;
alter table public.elim_weeks enable row level security;
alter table public.settings   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','weeks','games','picks','elim_picks','elim_weeks','settings'] loop
    execute format('create policy "members read" on public.%I for select to authenticated
                    using ((select public.current_player()) is not null)', t);
  end loop;
  foreach t in array array['players','weeks','games','elim_weeks','settings'] loop
    execute format('create policy "admins write" on public.%I for all to authenticated
                    using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

create policy "own picks while open" on public.picks for all to authenticated
  using ((select public.is_admin())
         or (player_id = (select public.current_player()) and public.game_open(game_id)))
  with check ((select public.is_admin())
         or (player_id = (select public.current_player()) and public.game_open(game_id)));

create policy "own elim pick while open" on public.elim_picks for all to authenticated
  using ((select public.is_admin())
         or (player_id = (select public.current_player()) and public.week_open(week_id)))
  with check ((select public.is_admin())
         or (player_id = (select public.current_player()) and public.week_open(week_id)));

revoke execute on function public.current_player(), public.is_admin(),
  public.week_open(bigint), public.game_open(bigint) from anon;

-- ---------- seed ----------
insert into public.players (id, name, initial, kind, is_admin, sort) values
  ('brad',   'Brad',   'B', 'human', true,  1),
  ('andrew', 'Andrew', 'A', 'human', false, 2),
  ('kevin',  'Kevin',  'K', 'human', false, 3),
  ('eric',   'Eric',   'E', 'human', false, 4),
  ('claude', 'Claude', 'C', 'bot',   false, 5);

insert into public.settings (key, value) values
  ('season', '2026'),
  ('elim_lives', '2'),
  ('deadline_rule', '{"weekday": 4, "time": "12:00", "tz": "America/Chicago"}');

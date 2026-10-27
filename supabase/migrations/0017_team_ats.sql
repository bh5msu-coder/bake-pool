-- Against-the-spread records for every NFL and FBS team, worked out from ESPN: each finished game's score and its
-- closing line (ESPN's pickcenter, DraftKings). ESPN doesn't publish ATS records for the season, so we keep the games.
-- ats_teams holds ESPN's names for each team so the sheet's spellings can be matched. Members can read both.
create table public.ats_games (
  event_id     text primary key,
  league       text not null check (league in ('NFL', 'NCAA')),
  season       int  not null,
  week         int  not null,
  home_id      text not null,
  away_id      text not null,
  home_score   int  not null,
  away_score   int  not null,
  home_spread  numeric,          -- the home team's line: negative when the home team was favoured; null = no line
  cover        text check (cover in ('home', 'away', 'push'))
);
create index on public.ats_games (league, season);
alter table public.ats_games enable row level security;
create policy "members read" on public.ats_games for select to authenticated using ((select private.current_player()) is not null);

create table public.ats_teams (
  league   text not null,
  team_id  text not null,
  names    text[] not null,
  primary key (league, team_id)
);
alter table public.ats_teams enable row level security;
create policy "members read" on public.ats_teams for select to authenticated using ((select private.current_player()) is not null);

-- Pick up newly finished games every 3 hours (a few dozen ESPN requests at most).
select cron.schedule('ats-sync', '20 */3 * * *', $$select private.call_app('/api/teams/sync')$$);

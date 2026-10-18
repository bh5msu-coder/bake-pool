-- Personal locks and hidden picks.
-- Each person can lock their own picks for a week. Until a week is revealed, people see only their own picks
-- (Brad, who enters Claude's, also sees Claude's). A week is revealed when the hard deadline passes, or when all
-- four humans have locked and Claude has a pick in every game; that's also when the group entry is final.

create table public.pick_locks (
  week_id    bigint not null references public.weeks(id) on delete cascade,
  player_id  text   not null references public.players(id) on delete cascade,
  locked_at  timestamptz not null default now(),
  primary key (week_id, player_id)
);
alter table public.pick_locks enable row level security;

create function private.week_revealed(w bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select deadline is not null and now() >= deadline from public.weeks where id = w), false)
    or (
      not exists (select 1 from public.players p where p.kind = 'human'
                  and not exists (select 1 from public.pick_locks l where l.week_id = w and l.player_id = p.id))
      and not exists (select 1 from public.games g where g.week_id = w
                      and not exists (select 1 from public.picks k where k.game_id = g.id and k.player_id = 'claude'))
      and exists (select 1 from public.games g where g.week_id = w)
    )
$$;

create function private.game_week(g bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select week_id from public.games where id = g
$$;

create function private.locked(w bigint, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pick_locks where week_id = w and player_id = p)
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Locks: everyone sees who has locked. You lock or unlock your own while the week is open and not yet revealed.
create policy "members read" on public.pick_locks for select to authenticated
  using ((select private.current_player()) is not null);
create policy "own lock while open" on public.pick_locks for all to authenticated
  using ((select private.is_admin())
         or (player_id = (select private.current_player()) and private.week_open(week_id) and not private.week_revealed(week_id)))
  with check ((select private.is_admin())
         or (player_id = (select private.current_player()) and private.week_open(week_id) and not private.week_revealed(week_id)));

-- Picks: read your own, Claude's if you're the admin, and everyone's once the week is revealed.
drop policy "members read" on public.picks;
create policy "read own or revealed" on public.picks for select to authenticated
  using (player_id = (select private.current_player())
         or (player_id = 'claude' and (select private.is_admin()))
         or private.week_revealed(private.game_week(game_id)));

-- Writes: your own, while the game is open and you haven't locked. The admin can still fix anything.
drop policy "own picks while open" on public.picks;
create policy "own picks while open and unlocked" on public.picks for insert to authenticated
  with check ((select private.is_admin())
         or (player_id = (select private.current_player()) and private.game_open(game_id)
             and not private.locked(private.game_week(game_id), player_id)));
create policy "update own picks while open and unlocked" on public.picks for update to authenticated
  using ((select private.is_admin())
         or (player_id = (select private.current_player()) and private.game_open(game_id)
             and not private.locked(private.game_week(game_id), player_id)))
  with check ((select private.is_admin())
         or (player_id = (select private.current_player()) and private.game_open(game_id)
             and not private.locked(private.game_week(game_id), player_id)));
create policy "delete own picks while open and unlocked" on public.picks for delete to authenticated
  using ((select private.is_admin())
         or (player_id = (select private.current_player()) and private.game_open(game_id)
             and not private.locked(private.game_week(game_id), player_id)));

-- How many games each person has picked in a week, without showing which teams. Members only.
create function public.pick_counts(w bigint) returns table (player_id text, picked int)
language sql stable security definer set search_path = '' as $$
  select k.player_id, count(*)::int from public.picks k join public.games g on g.id = k.game_id
  where g.week_id = w and (select private.current_player()) is not null
  group by k.player_id
$$;
revoke execute on function public.pick_counts(bigint) from public, anon;
grant execute on function public.pick_counts(bigint) to authenticated;

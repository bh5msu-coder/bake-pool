-- Every change to a pick, kept for good: who it belongs to, old and new team, which account made the change
-- (null when the server did it: the sheet sync or Claude's Thursday routine) and when.
-- You can read your own history; everyone's becomes visible when the week is revealed, like the picks themselves.
create table public.pick_history (
  id          bigint generated always as identity primary key,
  game_id     bigint not null references public.games(id) on delete cascade,
  player_id   text   not null references public.players(id) on delete cascade,
  old_team    text,
  new_team    text,
  changed_by  text,
  changed_at  timestamptz not null default now()
);
create index on public.pick_history (game_id);
alter table public.pick_history enable row level security;
create policy "read own or revealed" on public.pick_history for select to authenticated
  using (player_id = (select private.current_player()) or private.week_revealed(private.game_week(game_id)));

create function private.log_pick() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.team is not distinct from old.team then return new; end if;
  -- A game being deleted takes its picks with it; there's nothing to keep history for.
  if not exists (select 1 from public.games where id = coalesce(new.game_id, old.game_id)) then return coalesce(new, old); end if;
  insert into public.pick_history (game_id, player_id, old_team, new_team, changed_by)
  values (coalesce(new.game_id, old.game_id), coalesce(new.player_id, old.player_id),
          case when tg_op = 'INSERT' then null else old.team end,
          case when tg_op = 'DELETE' then null else new.team end,
          private.current_player());
  return coalesce(new, old);
end $$;
revoke execute on function private.log_pick() from public, anon, authenticated;
create trigger picks_history after insert or update or delete on public.picks
  for each row execute function private.log_pick();

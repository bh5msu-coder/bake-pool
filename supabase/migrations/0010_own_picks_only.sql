-- Each person owns their picks. The admin can enter their own and Claude's (Claude only breaks 2-2 ties),
-- but no longer anyone else's, and nobody can force the group entry: it's the majority, then Claude on a 2-2 split.

alter table public.games add constraint no_entry_override check (entry_override is null);

drop policy "own picks while open and unlocked" on public.picks;
drop policy "update own picks while open and unlocked" on public.picks;
drop policy "delete own picks while open and unlocked" on public.picks;

-- Who may write a pick row: its owner, or the admin for Claude's picks.
create function private.may_pick(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p = private.current_player() or (p = 'claude' and private.is_admin())
$$;
revoke execute on function private.may_pick(text) from public, anon;
grant execute on function private.may_pick(text) to authenticated;

create policy "own picks while open and unlocked" on public.picks for insert to authenticated
  with check (private.may_pick(player_id) and private.game_open(game_id)
              and not private.locked(private.game_week(game_id), player_id));
create policy "update own picks while open and unlocked" on public.picks for update to authenticated
  using (private.may_pick(player_id) and private.game_open(game_id)
         and not private.locked(private.game_week(game_id), player_id))
  with check (private.may_pick(player_id) and private.game_open(game_id)
              and not private.locked(private.game_week(game_id), player_id));
create policy "delete own picks while open and unlocked" on public.picks for delete to authenticated
  using (private.may_pick(player_id) and private.game_open(game_id)
         and not private.locked(private.game_week(game_id), player_id));

-- Locks: only your own.
drop policy "own lock while open" on public.pick_locks;
create policy "own lock while open" on public.pick_locks for all to authenticated
  using (player_id = (select private.current_player()) and private.week_open(week_id) and not private.week_revealed(week_id))
  with check (player_id = (select private.current_player()) and private.week_open(week_id) and not private.week_revealed(week_id));

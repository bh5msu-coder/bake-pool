-- Eliminator votes are hidden like picks: until the week is revealed (the lock, or everyone locked with Claude in)
-- you see only your own vote. Everyone can see who has voted (not for whom), and Brad's early entry preview
-- includes the group's eliminator team.
drop policy "members read" on public.elim_picks;
create policy "read own or revealed" on public.elim_picks for select to authenticated
  using (player_id = (select private.current_player()) or private.week_revealed(week_id));

create function public.elim_voters(w bigint) returns setof text
language sql stable security definer set search_path = '' as $$
  select player_id from public.elim_picks where week_id = w and team is not null and (select private.current_player()) is not null
$$;
revoke execute on function public.elim_voters(bigint) from public, anon;
grant execute on function public.elim_voters(bigint) to authenticated;

-- The group's eliminator team for Brad's preview: the admin's forced team, else the single most-voted team (a tie gives null).
create function public.admin_elim(w bigint) returns text
language sql stable security definer set search_path = '' as $$
  with ok as (
    select 1 from public.weeks where id = w and (select private.is_admin()) and deadline is not null
      and now() >= deadline - make_interval(mins => coalesce((select (value #>> '{}')::int from public.settings where key = 'grace_minutes'), 150))
  ), tally as (
    select team, count(*) n, rank() over (order by count(*) desc) rk from public.elim_picks
    where week_id = w and team is not null and exists (select 1 from ok) group by team
  )
  select coalesce(
    (select override_team from public.elim_weeks where week_id = w and exists (select 1 from ok)),
    (select team from tally where rk = 1 and (select count(*) from tally where rk = 1) = 1)
  )
$$;
revoke execute on function public.admin_elim(bigint) from public, anon;
grant execute on function public.admin_elim(bigint) to authenticated;

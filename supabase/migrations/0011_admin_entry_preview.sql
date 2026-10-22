-- Brad can see the week's group entry (team per game, and whether the majority or Claude's tie-break decided it)
-- once picks are due (the soft deadline: lock minus the grace period) and Claude has a pick in every game, without
-- waiting for the 2:30 lock. Everyone else's individual picks stay hidden until the reveal; this only returns the entry.
create function public.admin_entry(w bigint) returns table (num int, entry text, how text)
language sql stable security definer set search_path = '' as $$
  with wk as (
    select id from public.weeks
    where id = w and (select private.is_admin())
      and deadline is not null
      and now() >= deadline - make_interval(mins => coalesce((select (value #>> '{}')::int from public.settings where key = 'grace_minutes'), 150))
      and not exists (select 1 from public.games g where g.week_id = w
                      and not exists (select 1 from public.picks k where k.game_id = g.id and k.player_id = 'claude'))
  ),
  votes as (
    select g.id game_id, k.team, count(*) n from public.games g
    join public.picks k on k.game_id = g.id
    join public.players p on p.id = k.player_id and p.kind = 'human'
    where g.week_id = (select id from wk) group by g.id, k.team
  )
  select g.num, coalesce(m.team, c.team), case when m.team is not null then 'majority' else 'claude' end
  from public.games g
  join public.picks c on c.game_id = g.id and c.player_id = 'claude'
  left join votes m on m.game_id = g.id and m.n >= 3
  where g.week_id = (select id from wk)
  order by g.num
$$;
revoke execute on function public.admin_entry(bigint) from public, anon;
grant execute on function public.admin_entry(bigint) to authenticated;

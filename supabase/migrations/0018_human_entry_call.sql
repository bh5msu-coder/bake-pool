-- Submitted entry = a human's call if one is set, else the Humans majority (3 of 4), else Claude (2-2 tiebreak only).
-- Any of the four humans can make the call on a game once picks are revealed (Brad, the admin, any time) and until
-- the game has a result. Who made it and when are kept; clearing a call keeps the time so the sheet knows it was cleared.

alter table public.games drop constraint if exists no_entry_override;
alter table public.games add column if not exists entry_override_by text references public.players(id);
alter table public.games add column if not exists entry_override_at timestamptz;

create or replace function public.set_entry_call(g bigint, team text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me text := private.current_player();
  gm public.games%rowtype;
begin
  if me is null or not exists (select 1 from public.players p where p.id = me and p.kind = 'human') then
    raise exception 'Only Brad, Andrew, Kevin or Eric can make the call.';
  end if;
  select * into gm from public.games where id = g;
  if not found then raise exception 'That game does not exist.'; end if;
  if gm.result is not null then raise exception 'The result is in, so the submitted pick is final.'; end if;
  if team is not null and team not in (gm.away, gm.home) then raise exception '% is not in this game.', team; end if;
  if not (private.is_admin() or private.week_revealed(gm.week_id)) then
    raise exception 'The call opens once everyone has locked or the deadline passes.';
  end if;
  update public.games
     set entry_override = team, entry_override_by = case when team is null then null else me end, entry_override_at = now()
   where id = g;
end $$;
revoke execute on function public.set_entry_call(bigint, text) from public, anon;
grant execute on function public.set_entry_call(bigint, text) to authenticated;

-- Brad's early preview of the entry now shows human calls too.
drop function if exists public.admin_entry(bigint);
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
  select g.num, coalesce(g.entry_override, m.team, c.team),
         case when g.entry_override is not null then 'human' when m.team is not null then 'majority' else 'claude' end
  from public.games g
  join public.picks c on c.game_id = g.id and c.player_id = 'claude'
  left join votes m on m.game_id = g.id and m.n >= 3
  where g.week_id = (select id from wk)
  order by g.num
$$;
revoke execute on function public.admin_entry(bigint) from public, anon;
grant execute on function public.admin_entry(bigint) to authenticated;

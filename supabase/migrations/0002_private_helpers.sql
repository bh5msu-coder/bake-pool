-- Move RLS helpers out of the exposed API schema so they can't be called as RPCs.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.current_player() set schema private;
alter function public.is_admin() set schema private;
alter function public.week_open(bigint) set schema private;
alter function public.game_open(bigint) set schema private;
create or replace function private.game_open(g bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.week_open(week_id) and result is null from public.games where id = g), false)
$$;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

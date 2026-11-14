-- 0.17.0: live updates and notification choices.

-- Each device can switch kinds of notification on or off: { "recap": true, "elim": true, "reveal": true, "final": false }.
-- Missing keys mean "the default" (everything on except a note for every final score).
alter table public.push_subs add column if not exists prefs jsonb not null default '{}'::jsonb;

-- Live updates: the app listens for changes to these tables and refreshes itself, instead of re-checking every minute.
-- Row-level security still decides what each person may see, so other people's picks stay hidden until the reveal.
do $$
declare t text;
begin
  foreach t in array array['picks', 'pick_locks', 'games', 'elim_picks', 'elim_weeks', 'weeks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

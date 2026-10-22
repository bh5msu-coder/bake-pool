-- Two-way picks sync with the Google Sheet until the lock. pick_sync remembers the value last synced for each
-- person and game, so the sync can tell which side changed ("latest change wins"). Server-only: RLS on, no policies.
create table public.pick_sync (
  game_id    bigint not null references public.games(id) on delete cascade,
  player_id  text   not null references public.players(id) on delete cascade,
  team       text,
  synced_at  timestamptz not null default now(),
  primary key (game_id, player_id)
);
alter table public.pick_sync enable row level security;

select cron.schedule('picks-sheet-sync', '*/10 * * * *', $$select private.call_app('/api/sheet/sync')$$);

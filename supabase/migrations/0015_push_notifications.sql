-- Phone notifications (web push). Each device that turns notifications on stores its push subscription here,
-- tied to a player. push_log makes each reminder go out once. Server-only tables: RLS on, no policies.
create table public.push_subs (
  endpoint    text primary key,
  player_id   text not null references public.players(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subs enable row level security;

create table public.push_log (
  key      text primary key,
  sent_at  timestamptz not null default now()
);
alter table public.push_log enable row level security;

-- Thursdays every 15 minutes (13:00–21:45 UTC covers 8 AM–4 PM Central in both daylight and standard time):
-- the app decides whether a "picks due" reminder or the Claude safety-net alert is due.
select cron.schedule('push-reminders', '*/15 13-21 * * 4', $$select private.call_app('/api/push/remind')$$);

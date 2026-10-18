-- Scheduled calls into the app (pg_cron + pg_net). The bearer secret lives in the vault as 'cron_secret'
-- (created separately, never in a migration file).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.call_app(path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_get(
    url := 'https://bake-pool.vercel.app' || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function private.call_app(text) from public, anon, authenticated;

create or replace function private.push_sheet() returns void
language sql security definer set search_path = '' as $$ select private.call_app('/api/sheet/push') $$;
revoke execute on function private.push_sheet() from public, anon, authenticated;

-- Thursday 2:30 PM Central deadline + 5 min, in both daylight (19:35 UTC) and standard (20:35 UTC) time.
select cron.schedule('sheet-push-cdt', '35 19 * * 4', 'select private.push_sheet()');
select cron.schedule('sheet-push-cst', '35 20 * * 4', 'select private.push_sheet()');
-- Record finished games every 10 minutes.
select cron.schedule('scores-sync', '*/10 * * * *', $$select private.call_app('/api/scores/sync')$$);
select cron.schedule('net-cleanup', '0 9 * * *', $$delete from net._http_response where created < now() - interval '3 days'$$);

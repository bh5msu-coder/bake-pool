-- Thursday pick reminders: email whoever hasn't locked, once per week, 60 minutes before picks are due
-- (11 AM CT / noon ET by default). The timer runs every 15 minutes and the app decides when it's time, so the clock
-- change and off-Thursday slates (Bowl, CFP) need no cron edits. `reminded_at` keeps it to one send per week.
alter table public.weeks add column reminded_at timestamptz;
insert into public.settings (key, value) values ('reminder_lead_minutes', '60')
on conflict (key) do update set value = excluded.value;
select cron.schedule('pick-reminders', '*/15 * * * *', $$select private.call_app('/api/reminders')$$);

-- Picks are due at noon Thursday (soft deadline); weeks.deadline stays the hard lock at 2:30 PM CT.
-- The grace period between them is in minutes.
insert into public.settings (key, value) values ('grace_minutes', '150')
on conflict (key) do update set value = excluded.value;

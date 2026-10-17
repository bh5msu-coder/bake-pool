-- Deadline moves to Thursday 2:30 PM Central. Track when each week was last written to the Google Sheet.
update public.settings set value = '{"weekday": 4, "time": "14:30", "tz": "America/Chicago"}' where key = 'deadline_rule';
alter table public.weeks add column sheet_pushed_at timestamptz;

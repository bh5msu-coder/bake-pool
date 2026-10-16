-- Periods like "Bowl" and "CFP" sit between numbered weeks; `week` is the running order, `label` what people call it.
alter table public.weeks add column label text;
alter table public.weeks alter column entry_fee set default 0;
insert into public.settings (key, value) values ('season_fee', '1250')
on conflict (key) do update set value = excluded.value;

-- Eliminator: 1 life to start, plus paid buy-backs. Other one-off money goes in a ledger.
delete from public.settings where key = 'elim_lives';
insert into public.settings (key, value) values
  ('elim_buybacks', '1'),
  ('elim_buyback_cost', '100'),
  ('ledger', '[]')
on conflict (key) do update set value = excluded.value;

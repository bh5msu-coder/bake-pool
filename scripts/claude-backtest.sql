-- Backtest: how Claude's picks did with and against the market.
-- "Market side" = the team ESPN's closing line (ats_games, DraftKings) moved toward, compared with John's pool line.
-- Run in the Supabase SQL editor. Change the season below. Read only.
-- Caveat: the closing line isn't known when Claude picks on Thursday, so this measures how often Claude lands on the
-- side sharp money ends up on (closing-line value), not a strategy you could copy exactly in hindsight.
with pg as (
  select g.id, w.week pw, g.league, g.away, g.home, g.fav, g.spread::numeric sp, g.result
  from games g join weeks w on w.id = g.week_id where w.season = 2026),
m as (
  select distinct on (pg.id) pg.*, a.home_spread * case when a.home_id = th.team_id then 1 else -1 end close_home
  from pg
  join ats_teams th on th.league = pg.league and pg.home = any(th.names)
  join ats_teams ta on ta.league = pg.league and pg.away = any(ta.names)
  join ats_games a on a.season = 2026 and a.league = pg.league
   and ((a.home_id = th.team_id and a.away_id = ta.team_id) or (a.home_id = ta.team_id and a.away_id = th.team_id))
  where a.home_spread is not null
  order by pg.id, abs(a.week - pg.pw)),
y as (
  select m.*,
    case when close_home < (case when fav = home then -sp else sp end) then home
         when close_home > (case when fav = home then -sp else sp end) then away end mkt,
    (select team from picks p where p.game_id = m.id and p.player_id = 'claude') cl
  from m)
select
  count(*)                                                                     as matched_games,
  count(*) filter (where mkt is null)                                          as line_matched_close,
  count(*) filter (where result = mkt)                                         as market_side_w,
  count(*) filter (where mkt is not null and result <> mkt and result not ilike 'push') as market_side_l,
  count(*) filter (where cl = mkt and result = cl)                             as claude_with_market_w,
  count(*) filter (where cl = mkt and result <> cl and result not ilike 'push')  as claude_with_market_l,
  count(*) filter (where cl <> mkt and result = cl)                            as claude_against_market_w,
  count(*) filter (where cl <> mkt and result <> cl and result not ilike 'push') as claude_against_market_l
from y;

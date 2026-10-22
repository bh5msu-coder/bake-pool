-- Check John's Converter tab every 30 minutes, so the next week appears in the app on its own soon after the lines
-- are posted (the daily Vercel cron only runs once a day on the Hobby plan). ?push=0 skips the sheet write-back,
-- which the daily run and the Thursday timer still do.
select cron.schedule('lines-sync', '*/30 * * * *', $$select private.call_app('/api/lines/sync?push=0')$$);

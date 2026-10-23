-- =====================================================================
--  Hagenda — elke 15 minuten de gekoppelde agenda's bijwerken
--  Voer dit uit NADAT de functie "sync-ics" gedeployed is.
--  Vervang de twee waarden tussen < > (zie README, stap 4).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('hagenda-sync') where exists (select 1 from cron.job where jobname = 'hagenda-sync');

select cron.schedule(
  'hagenda-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-ics',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

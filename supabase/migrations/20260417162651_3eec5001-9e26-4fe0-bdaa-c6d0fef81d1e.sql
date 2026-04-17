-- Schedule daily reminder check at 09:00 UTC for subscription expiry (D-7, D-3, D-1)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-expiring-subscriptions-daily') THEN
    PERFORM cron.unschedule('check-expiring-subscriptions-daily');
  END IF;
END$$;

SELECT cron.schedule(
  'check-expiring-subscriptions-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://idfrtfzbhnhgzzlunkcu.supabase.co/functions/v1/check-expiring-subscriptions',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkZnJ0ZnpiaG5oZ3p6bHVua2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMTA5OTIsImV4cCI6MjA5MTc4Njk5Mn0.GjTaQqqbphB1BKol4zSoYTGGXHKzwwggksahn5xr818"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
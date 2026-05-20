SELECT cron.unschedule('telegram-poll-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'telegram-poll-every-minute');

SELECT cron.schedule(
  'telegram-poll-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://frhrvkzkihxaopnsznrj.supabase.co/functions/v1/telegram-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyaHJ2a3praWh4YW9wbnN6bnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzE0OTYsImV4cCI6MjA5MjA0NzQ5Nn0.lNR_XeuQCxWgSvm6GlHJf0oTFtyBiCHy43_aIrFrSgc'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
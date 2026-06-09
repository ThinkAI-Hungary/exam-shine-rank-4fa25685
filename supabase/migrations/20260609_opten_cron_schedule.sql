-- ============================================================
-- Schedule monthly OPTEN company check via pg_cron
-- Runs on the 1st of every month at 06:00 UTC (08:00 Budapest)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
-- pg_cron must be enabled via Supabase Dashboard > Database > Extensions
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a helper function that calls the edge function
CREATE OR REPLACE FUNCTION trigger_opten_check_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _response extensions.http_response;
  _supabase_url text;
  _service_key text;
BEGIN
  -- Get config from vault or env
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try from secrets
  IF _supabase_url IS NULL THEN
    SELECT decrypted_secret INTO _supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  END IF;

  IF _service_key IS NULL THEN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  END IF;

  -- Call the edge function
  SELECT * INTO _response FROM extensions.http((
    'POST',
    _supabase_url || '/functions/v1/opten-check-employees',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || _service_key),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{"action": "check-all"}'
  )::extensions.http_request);

  RAISE NOTICE 'OPTEN check-all response: % %', _response.status, substring(_response.content from 1 for 200);
END;
$$;

-- Schedule: 1st of every month at 06:00 UTC
-- Uncomment after enabling pg_cron extension:
-- SELECT cron.schedule(
--   'opten-monthly-check',
--   '0 6 1 * *',
--   $$SELECT trigger_opten_check_all()$$
-- );

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('opten-monthly-check');

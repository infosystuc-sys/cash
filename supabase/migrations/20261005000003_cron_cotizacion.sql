-- Actualización automática del dólar MEP vía Edge Function "actualizar-cotizacion".
-- Requiere en Vault los secretos 'project_url' y 'anon_key' (cargados aparte, no versionados):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<anon key>', 'anon_key');
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- Cada 30 min, lunes a viernes, 10:00 a 18:30 hora Argentina (13-21 UTC).
select cron.schedule(
  'actualizar-cotizacion-mep',
  '*/30 13-21 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/actualizar-cotizacion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

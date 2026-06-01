-- Ensure the extensions required for scheduled HTTP calls are available.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Recreate the fail-overdue job so repeated migrations stay idempotent.
do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'fail_overdue_scheduled_posts_every_minute';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'fail_overdue_scheduled_posts_every_minute',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://yaimchkxmtmxewqvjtkt.supabase.co/functions/v1/fail-overdue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

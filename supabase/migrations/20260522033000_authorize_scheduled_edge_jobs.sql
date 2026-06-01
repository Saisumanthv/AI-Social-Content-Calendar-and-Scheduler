/*
  Recreate scheduled Edge Function jobs with invocation headers.

  Edge Functions verify incoming requests by default. The original cron jobs
  only sent Content-Type, so the publish/fail workers could be rejected before
  they reached application code.
*/

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  job_name text;
  existing_job_id bigint;
begin
  foreach job_name in array array[
    'publish_scheduled_every_minute',
    'fail_overdue_scheduled_posts_every_minute'
  ]
  loop
    select jobid
      into existing_job_id
    from cron.job
    where jobname = job_name;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
  end loop;
end $$;

select cron.schedule(
  'publish_scheduled_every_minute',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/publish-scheduled',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SUPABASE_ANON_KEY',
        'Apikey', 'YOUR_SUPABASE_ANON_KEY'
      ),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'fail_overdue_scheduled_posts_every_minute',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/fail-overdue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SUPABASE_ANON_KEY',
        'Apikey', 'YOUR_SUPABASE_ANON_KEY'
      ),
      body := '{}'::jsonb
    );
  $$
);

/*
  Fail missed scheduled posts directly in Postgres.

  This fallback does not depend on an Edge Function invocation. If the publish
  worker is unavailable, a due post leaves `scheduled` after the grace window
  instead of staying stuck indefinitely.
*/

create extension if not exists pg_cron;

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

update content_calendar
set
  status = 'failed',
  last_error = 'Post missed its scheduled publish window before the publishing job ran.'
where status = 'scheduled'
  and post_date <= now() - interval '10 minutes';

select cron.schedule(
  'fail_overdue_scheduled_posts_every_minute',
  '* * * * *',
  $$
    update content_calendar
    set
      status = 'failed',
      last_error = 'Post missed its scheduled publish window before the publishing job ran.'
    where status = 'scheduled'
      and post_date <= now() - interval '10 minutes';
  $$
);

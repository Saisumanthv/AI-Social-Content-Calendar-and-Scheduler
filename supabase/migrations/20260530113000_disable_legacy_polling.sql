-- Unschedule legacy pg_cron jobs to transition completely to Redis ZSET queue
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

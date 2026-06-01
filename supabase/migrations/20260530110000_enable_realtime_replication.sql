-- Enable realtime replication for content_calendar table if not already added
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'content_calendar'
  ) then
    alter publication supabase_realtime add table content_calendar;
  end if;
end $$;

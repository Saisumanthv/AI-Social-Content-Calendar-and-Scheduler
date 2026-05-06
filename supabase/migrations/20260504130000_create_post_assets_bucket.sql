/*
  Create public storage bucket for post media uploads.
  This resolves 'Bucket not found' when uploading images/videos from the post editor.
*/

insert into storage.buckets (id, name, public)
values ('post-assets', 'post-assets', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload post assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'post-assets');

create policy "Authenticated users can update post assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'post-assets');

create policy "Authenticated users can delete post assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'post-assets');

create policy "Anyone can view post assets"
on storage.objects
for select
to public
using (bucket_id = 'post-assets');
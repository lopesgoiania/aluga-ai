-- Projeto operacional aluga-ai. Mídia do chat interno permanece privada.
begin;

alter table public.panel_internal_messages
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_duration_seconds integer;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('aluga-internal-chat','aluga-internal-chat',false,5242880,
        array['audio/ogg','audio/webm','audio/mp4','audio/mpeg'])
on conflict (id) do update
set public=false,file_size_limit=5242880,
    allowed_mime_types=excluded.allowed_mime_types;

commit;

-- Execute somente no banco operacional aluga-ai.
-- A leitura é compartilhada pela equipe que tem acesso à conversa.
begin;

create table if not exists public.panel_conversation_reads (
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  team_id uuid not null,
  last_read_at timestamptz not null,
  last_read_message_id uuid references public.chat_messages(id),
  updated_at timestamptz not null default now(),
  primary key (session_id, team_id)
);
alter table public.panel_conversation_reads enable row level security;
revoke all on public.panel_conversation_reads from anon, authenticated;
grant select, insert, update on public.panel_conversation_reads to service_role;

create table if not exists public.panel_unread_baseline (
  id boolean primary key default true check (id),
  started_at timestamptz not null default now()
);
insert into public.panel_unread_baseline(id) values (true) on conflict (id) do nothing;
alter table public.panel_unread_baseline enable row level security;
revoke all on public.panel_unread_baseline from anon, authenticated;
grant select on public.panel_unread_baseline to service_role;

create index if not exists chat_messages_session_created_inbox_idx
  on public.chat_messages(session_id, created_at desc, id desc);
create index if not exists chat_messages_inbound_unread_idx
  on public.chat_messages(session_id, created_at desc)
  where direction = 'inbound';

create or replace function public.panel_inbox_overview(p_session_ids uuid[])
returns table(session_id uuid, unread_count integer, last_message_at timestamptz,
  last_message_content text, last_message_type text, last_message_direction text)
language sql stable security definer set search_path = public as $$
  select s.id,
    (select count(*)::integer from public.chat_messages incoming
      where incoming.session_id = s.id and incoming.direction = 'inbound'
        and incoming.created_at > coalesce(r.last_read_at, b.started_at)),
    latest.created_at,
    coalesce(nullif(latest.normalized_content, ''), latest.content),
    latest.message_type,
    latest.direction
  from public.chat_sessions s
  cross join public.panel_unread_baseline b
  left join public.panel_conversation_reads r on r.session_id = s.id
    and r.team_id = coalesce(s.assigned_team_id, '00000000-0000-0000-0000-000000000000'::uuid)
  left join lateral (
    select m.created_at, m.normalized_content, m.content, m.message_type, m.direction
    from public.chat_messages m where m.session_id = s.id
    order by m.created_at desc, m.id desc limit 1
  ) latest on true
  where s.id = any(p_session_ids) and b.id = true;
$$;

create or replace function public.panel_mark_conversation_read(p_session_id uuid, p_message_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_message_at timestamptz; v_team_id uuid; v_saved_at timestamptz;
begin
  select m.created_at, coalesce(s.assigned_team_id, '00000000-0000-0000-0000-000000000000'::uuid)
    into v_message_at, v_team_id
    from public.chat_messages m join public.chat_sessions s on s.id = m.session_id
    where m.id = p_message_id and m.session_id = p_session_id;
  if v_message_at is null then raise exception 'Mensagem não encontrada na conversa'; end if;
  insert into public.panel_conversation_reads(session_id, team_id, last_read_at, last_read_message_id)
    values (p_session_id, v_team_id, v_message_at, p_message_id)
    on conflict (session_id, team_id) do update set
      last_read_at = greatest(public.panel_conversation_reads.last_read_at, excluded.last_read_at),
      last_read_message_id = case when excluded.last_read_at > public.panel_conversation_reads.last_read_at
        then excluded.last_read_message_id else public.panel_conversation_reads.last_read_message_id end,
      updated_at = now()
    returning last_read_at into v_saved_at;
  return v_saved_at;
end;
$$;

revoke all on function public.panel_inbox_overview(uuid[]) from public, anon, authenticated;
revoke all on function public.panel_mark_conversation_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.panel_inbox_overview(uuid[]) to service_role;
grant execute on function public.panel_mark_conversation_read(uuid, uuid) to service_role;
commit;

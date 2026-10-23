-- Aluga Mais: relações revisadas, triagem rastreável e saúde dos canais.
-- Aplicar somente no Supabase operacional aluga-ai.

alter table public.panel_channels
  add column if not exists learning_enabled boolean not null default false;

-- A análise fica restrita ao canal comercial explicitamente autorizado.
update public.panel_channels
set learning_enabled = true
where instance_name = 'lopes-aluga';

alter table public.agent_learning_scans
  add column if not exists outcome text not null default 'analyzed',
  add column if not exists reason text,
  add column if not exists channel_id uuid references public.panel_channels(id);

create table if not exists public.agent_knowledge_links (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.agent_knowledge(id) on delete cascade,
  to_id uuid not null references public.agent_knowledge(id) on delete cascade,
  relation text not null check (relation in ('complements','requires','applies_to','contradicts','hands_off_to')),
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  created_by uuid references public.panel_operators(user_id),
  approved_by uuid references public.panel_operators(user_id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_links_distinct check (from_id <> to_id),
  unique (from_id,to_id,relation)
);
create index if not exists knowledge_links_to_idx on public.agent_knowledge_links(to_id,status);
alter table public.agent_knowledge_links enable row level security;
revoke all on public.agent_knowledge_links from anon,authenticated;
grant select,insert,update on public.agent_knowledge_links to service_role;

-- A lista é paginada por rodadas: candidatos sem valor também recebem decisão
-- para não ocupar sempre as primeiras posições do próximo lote.
create or replace function public.agent_learning_candidates()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('candidates',coalesce(jsonb_agg(jsonb_build_object(
    'session_id',s.id,'channel_id',s.channel_id,
    'last_human_message_at',s.last_human_message_at,
    'messages',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',m.id,
        'role',case when m.direction='inbound' then 'cliente' when m.sender_type='human' then 'atendente' else 'lia' end,
        'content',left(coalesce(m.normalized_content,m.content,''),700)
      ) order by m.created_at),'[]'::jsonb)
      from (select id,direction,sender_type,normalized_content,content,created_at
            from public.chat_messages where session_id=s.id
              and direction='outbound' and sender_type='human'
            order by created_at desc limit 30) m
    )
  ) order by s.last_human_message_at),'[]'::jsonb))
  from (
    select s.id,s.channel_id,s.last_human_message_at
    from public.chat_sessions s
    join public.panel_channels c on c.id=s.channel_id and c.learning_enabled and c.ai_enabled and c.active
    left join public.agent_learning_scans a on a.session_id=s.id
    where s.last_human_message_at is not null
      and (a.last_human_message_at is null or s.last_human_message_at>a.last_human_message_at)
    order by s.last_human_message_at asc limit 20
  ) s;
$$;

create or replace function public.agent_mark_learning_decision(
  p_session_id uuid,p_last_human_message_at timestamptz,p_outcome text,p_reason text default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel_id uuid;
begin
  if p_outcome not in ('analyzed','ignored') then raise exception 'Resultado de análise inválido'; end if;
  select s.channel_id into v_channel_id from public.chat_sessions s
  join public.panel_channels c on c.id=s.channel_id and c.learning_enabled and c.ai_enabled and c.active
  where s.id=p_session_id;
  if v_channel_id is null then raise exception 'Canal não habilitado para aprendizado'; end if;
  insert into public.agent_learning_scans(session_id,last_human_message_at,channel_id,outcome,reason)
  values(p_session_id,p_last_human_message_at,v_channel_id,p_outcome,left(nullif(btrim(p_reason),''),180))
  on conflict(session_id) do update set
    last_human_message_at=greatest(public.agent_learning_scans.last_human_message_at,excluded.last_human_message_at),
    channel_id=excluded.channel_id,outcome=excluded.outcome,reason=excluded.reason,scanned_at=now();
end;
$$;
revoke all on function public.agent_learning_candidates() from public;
revoke all on function public.agent_mark_learning_decision(uuid,timestamptz,text,text) from public;
grant execute on function public.agent_learning_candidates() to service_role;
grant execute on function public.agent_mark_learning_decision(uuid,timestamptz,text,text) to service_role;

create table if not exists public.panel_channel_health (
  channel_id uuid primary key references public.panel_channels(id) on delete cascade,
  state text not null default 'unknown',
  consecutive_failures integer not null default 0,
  incident_open boolean not null default false,
  incident_started_at timestamptz,
  last_checked_at timestamptz,
  last_connected_at timestamptz,
  last_error text,
  notification_sent_at timestamptz,
  last_notification_error text,
  updated_at timestamptz not null default now()
);
alter table public.panel_channel_health
  add column if not exists notification_sent_at timestamptz,
  add column if not exists last_notification_error text;
alter table public.panel_channel_health enable row level security;
revoke all on public.panel_channel_health from anon,authenticated;
grant select,insert,update on public.panel_channel_health to service_role;

create or replace function public.panel_record_channel_health(p_channel_id uuid,p_state text,p_error text default null)
returns public.panel_channel_health language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.panel_channel_health%rowtype; v_connected boolean;
begin
  if not exists (select 1 from public.panel_channels where id=p_channel_id and active) then
    raise exception 'Canal ativo não encontrado';
  end if;
  v_connected := lower(p_state) in ('open','connected');
  insert into public.panel_channel_health(channel_id,state,consecutive_failures,incident_open,
    incident_started_at,last_checked_at,last_connected_at,last_error)
  values(p_channel_id,left(p_state,40),case when v_connected then 0 else 1 end,false,
    null,now(),case when v_connected then now() else null end,left(p_error,300))
  on conflict(channel_id) do update set
    state=excluded.state,
    consecutive_failures=case when v_connected then 0 else public.panel_channel_health.consecutive_failures+1 end,
    incident_open=case when v_connected then false else public.panel_channel_health.consecutive_failures+1>=2 end,
    incident_started_at=case when v_connected then null
      when public.panel_channel_health.consecutive_failures+1>=2 then
        coalesce(public.panel_channel_health.incident_started_at,now()) else null end,
    last_checked_at=now(),
    last_connected_at=case when v_connected then now() else public.panel_channel_health.last_connected_at end,
    last_error=excluded.last_error,
    notification_sent_at=case when v_connected then null else public.panel_channel_health.notification_sent_at end,
    last_notification_error=case when v_connected then null else public.panel_channel_health.last_notification_error end,
    updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.panel_record_channel_health(uuid,text,text) from public;
grant execute on function public.panel_record_channel_health(uuid,text,text) to service_role;

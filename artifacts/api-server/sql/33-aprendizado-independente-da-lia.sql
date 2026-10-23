-- Aluga Mais: aprendizado por canal independente da permissão de resposta da LIA.
-- Aplicar somente no Supabase operacional aluga-ai, após 32.

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
    join public.panel_channels c on c.id=s.channel_id and c.learning_enabled and c.active
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
  join public.panel_channels c on c.id=s.channel_id and c.learning_enabled and c.active
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

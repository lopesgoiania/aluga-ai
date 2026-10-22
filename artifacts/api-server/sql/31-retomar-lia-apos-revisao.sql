-- aluga-ai: libera uma conversa revisada e retoma somente mensagens recentes
-- que chegaram enquanto a LIA estava em quarentena. Não toca outros canais.
begin;
set local lock_timeout = '10s';

create or replace function public.panel_release_review_session(
  p_session_id uuid,
  p_operator_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.chat_sessions%rowtype;
  v_last_reply timestamptz;
  v_requeued integer;
  v_pending integer;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text,0));
  select * into v_session from public.chat_sessions
   where id=p_session_id and closed_at is null for update;
  if not found or v_session.metadata->>'ai_admission' is distinct from 'unverified' then
    raise exception 'Conversa não está aguardando revisão';
  end if;

  -- panel_route_session faz a verificação do operador e encerra o handoff.
  v_result := public.panel_route_session(p_session_id,p_operator_id,'eva',null);
  perform 1 from public.chat_sessions where id=p_session_id and ai_enabled;
  if not found then raise exception 'LIA indisponível para a equipe ou canal'; end if;

  select max(created_at) into v_last_reply from public.chat_messages
   where session_id=p_session_id and direction='outbound';

  -- O histórico inteiro permanece no banco, mas só o trecho atual e sem
  -- resposta é oferecido como nova entrada à LIA. No máximo 20 mensagens.
  with recent as (
    select id from public.message_buffer
     where session_id=p_session_id and status='ignored'
       and direction='inbound'
       and received_at >= now()-interval '24 hours'
       and (v_last_reply is null or received_at > v_last_reply)
     order by received_at desc,id desc limit 20
  )
  update public.message_buffer b
     set status='pending',processed_at=null,processing_started_at=null,
         metadata=coalesce(b.metadata,'{}'::jsonb)-'batch_id'
   where b.id in (select id from recent);
  get diagnostics v_requeued = row_count;

  update public.message_buffer
     set status='ignored',processed_at=now()
   where session_id=p_session_id and status='pending' and direction='inbound'
     and (received_at < now()-interval '24 hours'
       or (v_last_reply is not null and received_at <= v_last_reply));

  select count(*) into v_pending from public.message_buffer
   where session_id=p_session_id and status='pending' and direction='inbound';

  update public.chat_sessions
     set metadata=(coalesce(metadata,'{}'::jsonb)-'panel_queue')
       || jsonb_build_object('ai_admission','reviewed')
       || case when v_pending>0 then jsonb_build_object('ai_resume_requested_at',now())
               else '{}'::jsonb end,
         updated_at=now()
   where id=p_session_id;

  insert into public.panel_audit_log(operator_id,session_id,action,details)
   values(p_operator_id,p_session_id,'release_ai_after_review',
     jsonb_build_object('requeued',v_requeued,'pending',v_pending));
  return v_result || jsonb_build_object('requeued',v_requeued,'pending',v_pending,
    'reply_expected',v_pending>0);
end;
$$;

-- O agendador reivindica o mesmo lote que a entrada normal. O lock do buffer
-- garante que só um dos dois caminhos possa enviá-lo.
create or replace function public.panel_claim_one_review_resume()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_id uuid;
  v_claim jsonb;
  v_session public.chat_sessions%rowtype;
  v_instance text;
begin
  select id into v_id from public.chat_sessions
   where ai_enabled=true and closed_at is null
     and metadata ? 'ai_resume_requested_at'
   order by (metadata->>'ai_resume_requested_at')::timestamptz,id
   limit 1;
  if v_id is null then return jsonb_build_object('status','empty'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
  select * into v_session from public.chat_sessions
   where id=v_id and ai_enabled=true and closed_at is null
     and metadata ? 'ai_resume_requested_at' for update;
  if not found then return jsonb_build_object('status','empty'); end if;
  select instance_name into v_instance from public.panel_channels
   where id=v_session.channel_id and active;

  v_claim := public.buffer_claim_ready(v_id,4);
  if v_claim->>'status' in ('claimed','empty','ai_paused') then
    update public.chat_sessions
       set metadata=coalesce(metadata,'{}'::jsonb)-'ai_resume_requested_at'
     where id=v_id;
  end if;
  return v_claim || jsonb_build_object('contact_id',v_session.contact_id,
    'phone',v_session.phone,'instance',v_instance);
end;
$$;

create or replace function public.panel_cancel_review_resume()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.ai_enabled and not new.ai_enabled then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)-'ai_resume_requested_at';
  end if;
  return new;
end;
$$;
drop trigger if exists panel_cancel_review_resume_on_pause on public.chat_sessions;
create trigger panel_cancel_review_resume_on_pause before update of ai_enabled
  on public.chat_sessions for each row execute function public.panel_cancel_review_resume();

revoke all on function public.panel_release_review_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.panel_claim_one_review_resume() from public,anon,authenticated;
grant execute on function public.panel_release_review_session(uuid,uuid) to service_role;
grant execute on function public.panel_claim_one_review_resume() to service_role;
commit;

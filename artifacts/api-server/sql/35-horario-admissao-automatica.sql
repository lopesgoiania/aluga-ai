-- Supabase operacional aluga-ai. Horário de Brasília, por canal.
-- A migração não liga a admissão automática nem retoma sessões em revisão.
begin;
set local lock_timeout = '10s';

alter table public.panel_channels
  add column if not exists auto_admit_schedule_mode text not null default 'always',
  add column if not exists auto_admit_start_time time without time zone not null default '18:00',
  add column if not exists auto_admit_end_time time without time zone not null default '08:00';

alter table public.panel_channels
  drop constraint if exists panel_channels_auto_admit_schedule_mode_check;
alter table public.panel_channels
  add constraint panel_channels_auto_admit_schedule_mode_check
  check (auto_admit_schedule_mode in ('always','window'));

-- A função aceita janelas que atravessam a meia-noite, como 18h–08h.
create or replace function public.panel_auto_admission_open(
  p_mode text, p_start time without time zone,
  p_end time without time zone, p_local_time time without time zone
) returns boolean language sql immutable strict as $$
  select case
    when p_mode='always' then true
    when p_mode<>'window' or p_start=p_end then false
    when p_start<p_end then p_local_time>=p_start and p_local_time<p_end
    else p_local_time>=p_start or p_local_time<p_end
  end;
$$;

create or replace function public.panel_configure_channel_auto_admission(
  p_channel_id uuid, p_operator_id uuid, p_enabled boolean,
  p_mode text, p_start time without time zone, p_end time without time zone
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_channel public.panel_channels%rowtype;
begin
  if p_enabled is null or p_mode not in ('always','window')
     or p_mode is null or p_start is null or p_end is null
     or (p_mode='window' and p_start=p_end) then
    raise exception 'Configure um modo e dois horários diferentes para a janela';
  end if;
  if not exists (
    select 1 from public.panel_operators
    where user_id=p_operator_id and active and role='admin'
  ) then raise exception 'Somente administrador pode alterar a admissão automática'; end if;

  select * into v_channel from public.panel_channels
  where id=p_channel_id for update;
  if not found then raise exception 'Canal não encontrado'; end if;
  if p_enabled and not (
    v_channel.active and v_channel.ai_enabled and exists (
      select 1 from public.panel_teams t
      where t.id=v_channel.default_team_id and t.active and t.ai_enabled
    )
  ) then raise exception 'Ative a LIA no canal e na equipe responsável antes da admissão automática'; end if;

  update public.panel_channels
     set auto_admit_new_conversations=p_enabled,
         auto_admit_schedule_mode=p_mode,
         auto_admit_start_time=p_start,
         auto_admit_end_time=p_end,
         updated_at=now()
   where id=p_channel_id;
  insert into public.panel_audit_log(operator_id,action,details)
  values(p_operator_id,'channel_auto_admission_configured',
    jsonb_build_object('channel_id',p_channel_id,'enabled',p_enabled,
      'mode',p_mode,'start',p_start,'end',p_end,'timezone','America/Sao_Paulo'));
  return jsonb_build_object('id',p_channel_id,'auto_admit_new_conversations',p_enabled,
    'auto_admit_schedule_mode',p_mode,'auto_admit_start_time',p_start,
    'auto_admit_end_time',p_end);
end;
$$;

-- Só sessões novas entram automaticamente. Conversas já pausadas não mudam.
create or replace function public.quarantine_unverified_ai_intake()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  v_auto_admit boolean := false;
begin
  if new.status <> 'novo' then return new; end if;

  select c.auto_admit_new_conversations and c.active and c.ai_enabled
           and t.active and t.ai_enabled and c.default_team_id=new.assigned_team_id
           and public.panel_auto_admission_open(
             c.auto_admit_schedule_mode,c.auto_admit_start_time,c.auto_admit_end_time,
             (now() at time zone 'America/Sao_Paulo')::time
           )
    into v_auto_admit
  from public.panel_channels c
  left join public.panel_teams t on t.id=c.default_team_id
  where c.id=new.channel_id;

  if coalesce(v_auto_admit,false) and coalesce(new.ai_enabled,false) then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','automatic',
                            'ai_admission_source','channel_schedule',
                            'panel_queue','new');
  else
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','unverified',
                            'ai_admission_source','first_inbound','panel_queue','new');
    if new.ai_enabled then
      new.ai_enabled := false;
      new.ai_paused_at := now();
      new.ai_paused_reason := 'Admissão automática fora do horário ou histórico anterior não verificado; revisão humana necessária';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.panel_configure_channel_auto_admission(
  uuid,uuid,boolean,text,time without time zone,time without time zone
) from public,anon,authenticated;
grant execute on function public.panel_configure_channel_auto_admission(
  uuid,uuid,boolean,text,time without time zone,time without time zone
) to service_role;
commit;

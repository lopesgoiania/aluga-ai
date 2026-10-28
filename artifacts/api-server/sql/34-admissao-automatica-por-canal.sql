-- Supabase operacional aluga-ai. Ativação explícita por canal, desligada por padrão.
-- A migração não libera conversas já em revisão nem ativa a LIA em canal/equipe.
begin;
set local lock_timeout = '10s';

alter table public.panel_channels
  add column if not exists auto_admit_new_conversations boolean not null default false;

-- Qualquer mudança de equipe ou desligamento da LIA exige uma nova decisão
-- explícita do administrador antes de admitir conversas automaticamente.
create or replace function public.reset_channel_auto_admission()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.default_team_id is distinct from new.default_team_id
     or not new.active or not new.ai_enabled then
    new.auto_admit_new_conversations := false;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_channel_auto_admission on public.panel_channels;
create trigger reset_channel_auto_admission
before update of default_team_id,active,ai_enabled on public.panel_channels
for each row execute function public.reset_channel_auto_admission();

create or replace function public.reset_team_auto_admission()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not new.active or not new.ai_enabled then
    update public.panel_channels
       set auto_admit_new_conversations=false
     where default_team_id=new.id and auto_admit_new_conversations;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_team_auto_admission on public.panel_teams;
create trigger reset_team_auto_admission
after update of active,ai_enabled on public.panel_teams
for each row execute function public.reset_team_auto_admission();

create or replace function public.panel_set_channel_auto_admission(
  p_channel_id uuid, p_operator_id uuid, p_enabled boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_channel public.panel_channels%rowtype;
begin
  if p_enabled is null then raise exception 'Escolha se a admissão automática ficará ativa'; end if;
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
     set auto_admit_new_conversations=p_enabled, updated_at=now()
   where id=p_channel_id;
  insert into public.panel_audit_log(operator_id,action,details)
  values(p_operator_id,'channel_auto_admission_updated',
    jsonb_build_object('channel_id',p_channel_id,'enabled',p_enabled));
  return jsonb_build_object('id',p_channel_id,'auto_admit_new_conversations',p_enabled);
end;
$$;

-- O gatilho atua apenas na inserção da sessão. Mudanças no botão nunca
-- reativam conversas antigas ou pausadas por um humano.
create or replace function public.quarantine_unverified_ai_intake()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  v_auto_admit boolean := false;
begin
  if new.status <> 'novo' then return new; end if;

  select c.auto_admit_new_conversations and c.active and c.ai_enabled
           and t.active and t.ai_enabled and c.default_team_id=new.assigned_team_id
    into v_auto_admit
  from public.panel_channels c
  left join public.panel_teams t on t.id=c.default_team_id
  where c.id=new.channel_id;

  if coalesce(v_auto_admit,false) and coalesce(new.ai_enabled,false) then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','automatic',
                            'ai_admission_source','channel_setting',
                            'panel_queue','new');
  else
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','unverified',
                            'ai_admission_source','first_inbound','panel_queue','new');
    if new.ai_enabled then
      new.ai_enabled := false;
      new.ai_paused_at := now();
      new.ai_paused_reason := 'Histórico anterior do WhatsApp não verificado; revisão humana necessária';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.panel_set_channel_auto_admission(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.panel_set_channel_auto_admission(uuid,uuid,boolean)
  to service_role;
commit;

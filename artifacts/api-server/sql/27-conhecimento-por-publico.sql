-- aluga-ai: classifica o conhecimento sem alterar os conteúdos existentes.
alter table public.agent_knowledge
  add column if not exists audience text not null default 'all';

alter table public.agent_knowledge
  drop constraint if exists agent_knowledge_audience_check;
alter table public.agent_knowledge
  add constraint agent_knowledge_audience_check
  check (audience in ('all', 'inquilino', 'proprietario', 'corretor'));

create index if not exists agent_knowledge_audience_status_idx
  on public.agent_knowledge(audience, status);

alter table public.agent_knowledge_revisions
  add column if not exists audience text not null default 'all';

create or replace function public.snapshot_agent_knowledge()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if old.title is not distinct from new.title and old.content is not distinct from new.content
       and old.status is not distinct from new.status
       and old.audience is not distinct from new.audience then return new; end if;
    insert into public.agent_knowledge_revisions
      (knowledge_id,version,title,content,status,audience,changed_by)
    values(old.id,old.version,old.title,old.content,old.status,old.audience,null)
    on conflict do nothing;
    new.version := old.version + 1;
    new.updated_at := now();
    if old.content is distinct from new.content or old.title is distinct from new.title
       or old.audience is distinct from new.audience then
      new.status := 'draft';
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.agent_get_approved_knowledge(
  p_instance text default null, p_question text default null, p_session_id uuid default null
)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with context as (
    select case
      when (select profile from public.chat_sessions where id=p_session_id) in ('corretor','proprietario','inquilino')
        then (select profile from public.chat_sessions where id=p_session_id)
      when coalesce(p_question,'') ~* '(sou corretor|sou corretora|trabalho como corretor|tenho um cliente para indicar)'
        then 'corretor'
      when coalesce(p_question,'') ~* '(sou propriet[aá]ri|meu im[oó]vel|tenho um im[oó]vel para alugar|quero anunciar meu im[oó]vel)'
        then 'proprietario'
      when coalesce(p_question,'') ~* '(procuro|quero alugar|busco|gostaria de alugar)'
        then 'inquilino'
      else 'desconhecido'
    end as audience,
    plainto_tsquery('portuguese',coalesce(p_question,'')) as terms
  ), matching as (
    select k.id,k.title,k.content,k.version,k.audience,k.updated_at,
      ts_rank_cd(to_tsvector('portuguese',k.title||' '||k.content),q.terms) as rank
    from public.agent_knowledge k
    cross join context q
    left join public.panel_channels c on c.id=k.channel_id
    where k.status='approved'
      and k.audience in ('all', q.audience)
      and (k.scope='global'
        or (k.scope='channel' and c.instance_name=p_instance and c.active)
        or (k.scope='team' and k.team_id=(
          select assigned_team_id from public.chat_sessions where id=p_session_id
        )))
      and to_tsvector('portuguese',k.title||' '||k.content) @@ q.terms
    order by rank desc,k.updated_at desc
    limit 8
  )
  select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'title',m.title,'content',left(m.content,1500),
      'version',m.version,'audience',m.audience
    ) order by m.rank desc,m.updated_at desc) from matching m),'[]'::jsonb),
    'channel_purpose',(select c.purpose from public.panel_channels c
      where c.instance_name=p_instance and c.active limit 1),
    'channel_instructions',(select c.instructions from public.panel_channels c
      where c.instance_name=p_instance and c.active limit 1)
  );
$$;

revoke all on function public.agent_get_approved_knowledge(text,text,uuid) from public;
grant execute on function public.agent_get_approved_knowledge(text,text,uuid) to service_role;

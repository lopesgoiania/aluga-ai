-- Supabase aluga-ai. Aplicar ANTES de habilitar a LIA em números reais.
-- Sem histórico anterior confiável, uma conversa não é classificada como nova
-- apenas porque a sessão acabou de ser criada no nosso banco.

begin;
set local lock_timeout = '10s';
lock table public.chat_sessions in share row exclusive mode;

create or replace function public.quarantine_unverified_ai_intake()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='novo' then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','unverified','ai_admission_source','first_inbound','panel_queue','new');
  end if;
  if new.status='novo' and new.ai_enabled then
    new.ai_enabled := false;
    new.ai_paused_at := now();
    new.ai_paused_reason := 'Histórico anterior do WhatsApp não verificado; revisão humana necessária';
  end if;
  return new;
end;
$$;

drop trigger if exists quarantine_unverified_ai_intake on public.chat_sessions;
create trigger quarantine_unverified_ai_intake
before insert on public.chat_sessions
for each row execute function public.quarantine_unverified_ai_intake();

-- Pausa todas as sessões abertas que ainda estão com IA ligada. É uma trava
-- de implantação deliberada: o operador pode retomar cada conversa revisada.
update public.chat_sessions s
set ai_enabled=false,
    ai_paused_at=coalesce(ai_paused_at,now()),
    ai_paused_reason='Histórico anterior do WhatsApp não verificado; revisão humana necessária',
    metadata=coalesce(s.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','unverified','ai_admission_source','migration'),
    updated_at=now()
where s.closed_at is null and s.ai_enabled;

commit;

-- O operador ainda pode devolver uma conversa revisada para a LIA pelo painel.
-- Esta migração não modifica mensagens, contatos, equipes nem configurações.
select count(*) as sessoes_aguardando_revisao
from public.chat_sessions
where closed_at is null and metadata->>'ai_admission'='unverified';

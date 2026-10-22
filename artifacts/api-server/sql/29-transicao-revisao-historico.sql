-- aluga-ai: mantém a quarentena atual e permite encerrar a fase de implantação
-- por canal somente depois de verificar o inventário anterior do WhatsApp.
-- Executar agora NÃO ativa a LIA nem libera conversas já pausadas.

begin;
set local lock_timeout = '10s';

alter table public.panel_channels
  add column if not exists history_baseline_verified_at timestamptz;

create or replace function public.quarantine_unverified_ai_intake()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  v_baseline_verified boolean := false;
begin
  if new.status <> 'novo' then return new; end if;

  select c.history_baseline_verified_at is not null
    into v_baseline_verified
  from public.panel_channels c
  where c.id = new.channel_id and c.active;

  if coalesce(v_baseline_verified,false) then
    -- Este estado só pode ser usado depois de importar/verificar o inventário
    -- dos contatos que já conversavam com o número antes da integração.
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object('ai_admission','post_baseline','panel_queue','new');
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

commit;

-- A conclusão da linha de base é uma operação futura e separada, por canal.
-- Não preencher history_baseline_verified_at apenas pela passagem do tempo.
select instance_name, history_baseline_verified_at
from public.panel_channels
order by instance_name;

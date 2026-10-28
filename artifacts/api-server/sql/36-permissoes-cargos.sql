-- Execute no Supabase operacional aluga-ai.
-- Promove apenas administradores já existentes; administradores criados depois
-- precisam ser promovidos por um superadministrador em uma migração auditada.
begin;

alter table public.panel_operators
  add column if not exists is_superadmin boolean not null default false;

do $$ begin
  if not exists (select 1 from public.panel_operators where is_superadmin) then
    update public.panel_operators set is_superadmin = true where role = 'admin' and active;
  end if;
end $$;

create table if not exists public.panel_role_permissions (
  role text not null check (role in ('admin', 'supervisor', 'attendant')),
  permission_key text not null check (permission_key in ('claim_whatsapp', 'reconnect_qr')),
  allowed boolean not null default false,
  updated_by uuid references public.panel_operators(user_id),
  updated_at timestamptz not null default now(),
  primary key (role, permission_key)
);

alter table public.panel_role_permissions enable row level security;
revoke all on public.panel_role_permissions from anon, authenticated;
grant select, insert, update on public.panel_role_permissions to service_role;

insert into public.panel_role_permissions(role, permission_key, allowed) values
  ('admin', 'claim_whatsapp', true),
  ('admin', 'reconnect_qr', true),
  ('supervisor', 'claim_whatsapp', true),
  ('supervisor', 'reconnect_qr', true),
  ('attendant', 'claim_whatsapp', true),
  ('attendant', 'reconnect_qr', true)
on conflict (role, permission_key) do nothing;

commit;

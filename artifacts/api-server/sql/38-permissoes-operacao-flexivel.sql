-- Permissões adicionais para a operação modular do Aluga Mais.
-- Executar no Supabase operacional depois da migração 36.

alter table public.panel_role_permissions
  drop constraint if exists panel_role_permissions_permission_key_check;

alter table public.panel_role_permissions
  add constraint panel_role_permissions_permission_key_check
  check (permission_key in (
    'claim_whatsapp',
    'reconnect_qr',
    'route_conversations',
    'delete_messages',
    'manage_users',
    'manage_teams'
  ));

insert into public.panel_role_permissions(role, permission_key, allowed)
select roles.role, permissions.permission_key, true
from (values ('admin'::text), ('supervisor'::text), ('attendant'::text)) as roles(role)
cross join (values
  ('route_conversations'::text),
  ('delete_messages'::text),
  ('manage_users'::text),
  ('manage_teams'::text)
) as permissions(permission_key)
on conflict (role, permission_key) do nothing;

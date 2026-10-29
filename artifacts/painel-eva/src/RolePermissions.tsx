import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from './services/api';

type Permission = { key: string; label: string; description: string };
type Grant = { role: string; permission_key: string; allowed: boolean };
type Matrix = { permissions: Permission[]; roles: string[]; grants: Grant[] };
const roleLabel: Record<string, string> = { admin: 'Administrador', supervisor: 'Supervisor', attendant: 'Atendente' };

export function RolePermissions({ flash }: { flash: (message: string) => void }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [saving, setSaving] = useState('');
  useEffect(() => { void api<Matrix>('/permissions/roles').then(setMatrix).catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar permissões')); }, []);
  async function toggle(role: string, key: string, current: boolean) {
    const id = `${role}:${key}`;
    setSaving(id);
    try {
      const result = await api<{ grant: Grant }>(`/permissions/roles/${role}/${key}`, { method: 'PUT', body: { allowed: !current } });
      setMatrix((old) => old ? { ...old, grants: old.grants.map((grant) => grant.role === role && grant.permission_key === key ? result.grant : grant) } : old);
      flash('Permissão atualizada. A mudança já vale para o próximo acesso.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar permissão'); }
    finally { setSaving(''); }
  }
  return <section className="live-card role-permissions-card" aria-label="Poderes por cargo">
    <div className="role-permissions-heading"><ShieldCheck size={22} /><div><h2>Super Admin · poderes por cargo</h2><p>Defina o que cada cargo pode fazer: atender, transferir, apagar mensagens, gerenciar usuários, equipes e conexões.</p></div></div>
    {!matrix ? <p>Carregando permissões…</p> : <div className="role-permissions-grid">{matrix.permissions.map((permission) => <div className="role-permission-row" key={permission.key}><div><strong>{permission.label}</strong><small>{permission.description}</small></div><div className="role-permission-switches">{matrix.roles.map((role) => { const allowed = matrix.grants.some((grant) => grant.role === role && grant.permission_key === permission.key && grant.allowed); return <label key={role}><input type="checkbox" checked={allowed} disabled={Boolean(saving)} onChange={() => void toggle(role, permission.key, allowed)} /><span>{roleLabel[role] ?? role}</span></label>; })}</div></div>)}</div>}
    <p className="role-permissions-note">O superadministrador mantém acesso para recuperar configurações. O administrador continua sendo o gestor operacional; as permissões adicionais podem ser concedidas ou revogadas por cargo nesta matriz.</p>
  </section>;
}

import { useEffect, useState, type FormEvent } from 'react';
import { api, type Operator } from './services/api';

type ManagedOperator = Operator & { active: boolean; email?: string | null; email_confirmed_at?: string | null; invited_at?: string | null };
type Team = { id: string; name: string; description?: string; ai_enabled: boolean; active: boolean };
type Member = { team_id: string; user_id: string; active: boolean };
type InternalMessage = { id: string; sender_user_id: string; body: string; created_at: string };

export function OperationsManager({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const [operators, setOperators] = useState<ManagedOperator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Operator['role']>('attendant');
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([]);
  const [showRemoved, setShowRemoved] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState({ displayName: '', role: 'attendant' as Operator['role'] });
  const [teamName, setTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [teamDraft, setTeamDraft] = useState({ name: '', description: '', aiEnabled: false });
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [users, groups] = await Promise.all([api<{ operators: ManagedOperator[] }>('/operators/manage'), api<{ teams: Team[]; members: Member[] }>('/teams')]);
    setOperators(users.operators); setTeams(groups.teams); setMembers(groups.members);
  };
  useEffect(() => { void load().catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar equipe')); }, []);
  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api<{ invitationSent: boolean; reactivated: boolean }>('/operators/invite', { method: 'POST', body: { email, displayName: name, role, teamIds: inviteTeamIds } });
      await load(); setEmail(''); setName(''); setInviteTeamIds([]);
      flash(result.reactivated ? result.invitationSent ? 'Acesso reativado e convite reenviado.' : 'Acesso reativado. O usuário pode entrar com a senha anterior.' : 'Convite enviado ao novo usuário.');
    }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao convidar usuário'); }
    finally { setBusy(false); }
  }
  async function resendInvite(user: ManagedOperator) {
    setBusy(true);
    try { await api(`/operators/${user.user_id}/resend-invite`, { method: 'POST' }); flash(`Novo convite enviado para ${user.email}.`); await load(); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao reenviar convite'); }
    finally { setBusy(false); }
  }
  async function removeUser(user: ManagedOperator) {
    if (!window.confirm(`Remover o acesso de ${user.display_name}? O histórico de atendimentos será preservado.`)) return;
    setBusy(true);
    try { await api(`/operators/${user.user_id}`, { method: 'DELETE' }); await load(); if (editingUser === user.user_id) setEditingUser(null); flash('Acesso removido. O histórico foi preservado.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao remover usuário'); }
    finally { setBusy(false); }
  }
  async function saveUser(event: FormEvent) {
    event.preventDefault(); if (!editingUser) return; setBusy(true);
    try { await api(`/operators/${editingUser}`, { method: 'PATCH', body: userDraft }); await load(); setEditingUser(null); flash('Usuário atualizado.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar usuário'); }
    finally { setBusy(false); }
  }
  async function createTeam(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api('/teams', { method: 'POST', body: { name: teamName } }); await load(); setTeamName(''); flash('Equipe criada.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao criar equipe'); }
    finally { setBusy(false); }
  }
  async function setMember(teamId: string, userId: string, active: boolean) {
    setBusy(true);
    try { await api(`/teams/${teamId}/members/${userId}`, { method: 'PUT', body: { active } }); await load(); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar equipe'); }
    finally { setBusy(false); }
  }
  async function saveTeam(event: FormEvent) {
    event.preventDefault(); if (!editingTeam) return; setBusy(true);
    try { await api(`/teams/${editingTeam}`, { method: 'PATCH', body: teamDraft }); await load(); setEditingTeam(null); flash('Equipe atualizada.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao editar equipe'); }
    finally { setBusy(false); }
  }
  async function removeTeam(team: Team) {
    if (!window.confirm(`Remover a equipe ${team.name}? O histórico será preservado.`)) return;
    setBusy(true);
    try { await api(`/teams/${team.id}`, { method: 'DELETE' }); await load(); if (editingTeam === team.id) setEditingTeam(null); flash('Equipe removida da operação.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao remover equipe'); }
    finally { setBusy(false); }
  }
  async function setActive(user: ManagedOperator) {
    setBusy(true);
    try { await api(`/operators/${user.user_id}`, { method: 'PATCH', body: { active: !user.active } }); await load(); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar usuário'); }
    finally { setBusy(false); }
  }
  return <div className="live-operations-stack"><section className="live-card"><h2>Usuários</h2><p>Envie um convite, atribua equipes e acompanhe quem já confirmou o acesso.</p>{operator.role === 'admin' && <form className="live-operations-form live-invite-form" onSubmit={invite}><label>Nome<input required maxLength={80} placeholder="Nome do atendente" value={name} onChange={(e) => setName(e.target.value)} /></label><label>E-mail<input type="email" required placeholder="nome@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Função<select value={role} onChange={(e) => setRole(e.target.value as Operator['role'])}><option value="attendant">Atendente</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select></label><fieldset><legend>Equipes</legend>{teams.filter((team) => team.active).map((team) => <label key={team.id}><input type="checkbox" checked={inviteTeamIds.includes(team.id)} onChange={(event) => setInviteTeamIds(event.target.checked ? [...inviteTeamIds, team.id] : inviteTeamIds.filter((id) => id !== team.id))} />{team.name}</label>)}{!teams.some((team) => team.active) && <small>Crie uma equipe abaixo para atribuir o usuário.</small>}</fieldset><button className="button button-primary" disabled={busy || !name.trim() || !email.trim()}>Criar usuário e enviar convite</button></form>}<div className="live-user-list"><div className="live-row"><strong>Usuários cadastrados</strong><label className="live-user-toggle"><input type="checkbox" checked={showRemoved} onChange={(event) => setShowRemoved(event.target.checked)} />Mostrar removidos</label></div>{operators.filter((user) => user.active || showRemoved).map((user) => <div className="live-user-entry" key={user.user_id}><div className="live-row"><span><b>{user.display_name}</b><small>{user.email || 'E-mail não disponível'} · {user.role === 'admin' ? 'Administrador' : user.role === 'supervisor' ? 'Supervisor' : 'Atendente'} · {!user.active ? 'Acesso removido' : user.email_confirmed_at ? 'E-mail confirmado' : user.invited_at ? 'Convite pendente' : 'Confirmação pendente'}</small></span>{operator.role === 'admin' && user.user_id !== operator.user_id && <div className="live-team-actions">{user.active && !user.email_confirmed_at && user.email && <button type="button" className="button button-outline" disabled={busy} onClick={() => void resendInvite(user)}>Reenviar convite</button>}{user.active ? <><button type="button" className="button button-outline" disabled={busy} onClick={() => { setEditingUser(user.user_id); setUserDraft({ displayName: user.display_name, role: user.role }); }}>Editar</button><button type="button" className="button button-outline" disabled={busy} onClick={() => void removeUser(user)}>Remover</button></> : <button type="button" className="button button-outline" disabled={busy} onClick={() => void setActive(user)}>Restaurar acesso</button>}</div>}</div>{editingUser === user.user_id && <form className="live-team-edit" onSubmit={saveUser}><label>Nome<input value={userDraft.displayName} maxLength={80} required onChange={(event) => setUserDraft({ ...userDraft, displayName: event.target.value })} /></label><label>Função<select value={userDraft.role} onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as Operator['role'] })}><option value="attendant">Atendente</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select></label><div className="live-team-actions"><button className="button button-primary" disabled={busy}>Salvar</button><button type="button" className="button button-outline" onClick={() => setEditingUser(null)}>Cancelar</button></div></form>}</div>)}{!operators.some((user) => user.active || showRemoved) && <p>Nenhum usuário nesta lista.</p>}</div></section>
    <section className="live-card"><h2>Equipes</h2><p>Ative a LIA somente nas equipes desejadas. Quando ela não souber responder, o atendimento permanece na fila da equipe responsável.</p><form className="live-operations-form" onSubmit={createTeam}><input aria-label="Nome da equipe" required maxLength={80} placeholder="Ex.: Comercial" value={teamName} onChange={(e) => setTeamName(e.target.value)} /><button className="button button-primary" disabled={busy}>Criar equipe</button></form>{teams.filter((team) => team.active).map((team) => <div key={team.id} className="live-team"><div className="live-row"><span><strong>{team.name}</strong><small>{team.ai_enabled ? 'LIA habilitada nesta equipe' : 'Atendimento humano'}</small></span><div className="live-team-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => { setEditingTeam(team.id); setTeamDraft({ name: team.name, description: team.description || '', aiEnabled: team.ai_enabled }); }}>Editar</button><button type="button" className="button button-outline" disabled={busy} onClick={() => void removeTeam(team)}>Remover</button></div></div>{editingTeam === team.id && <form className="live-team-edit" onSubmit={saveTeam}><label>Nome<input value={teamDraft.name} onChange={(e) => setTeamDraft({ ...teamDraft, name: e.target.value })} required maxLength={80} /></label><label>Descrição<input value={teamDraft.description} onChange={(e) => setTeamDraft({ ...teamDraft, description: e.target.value })} maxLength={500} /></label><label><input type="checkbox" checked={teamDraft.aiEnabled} onChange={(e) => setTeamDraft({ ...teamDraft, aiEnabled: e.target.checked })} /> LIA pode atender nesta equipe</label><div className="live-team-actions"><button className="button button-primary" disabled={busy}>Salvar equipe</button><button type="button" className="button button-outline" onClick={() => setEditingTeam(null)}>Cancelar</button></div></form>}<div className="live-team-members">{operators.filter((user) => user.active).map((user) => { const joined = members.some((member) => member.team_id === team.id && member.user_id === user.user_id && member.active); return <label key={user.user_id}><input type="checkbox" checked={joined} disabled={busy} onChange={() => void setMember(team.id, user.user_id, !joined)} />{user.display_name}</label>; })}</div></div>)}</section></div>;
}

export function InternalChat({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const [operators, setOperators] = useState<ManagedOperator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [target, setTarget] = useState('');
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void Promise.all([api<{ operators: Operator[] }>('/operators'), api<{ teams: Team[]; members: Member[] }>('/teams')]).then(([users, groups]) => { setOperators(users.operators.map((user) => ({ ...user, active: true }))); setTeams(groups.teams); setMembers(groups.members); }).catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar chat')); }, []);
  const availableTeams = teams.filter((team) => operator.role !== 'attendant' || members.some((member) => member.team_id === team.id && member.user_id === operator.user_id && member.active));
  const load = async (selected: string) => { if (!selected) return; const [kind, id] = selected.split(':'); setMessages((await api<{ messages: InternalMessage[] }>(`/internal/messages?${kind === 'team' ? 'teamId' : 'peerId'}=${id}`)).messages); };
  useEffect(() => { void load(target).catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar mensagens')); }, [target]);
  async function send(event: FormEvent) { event.preventDefault(); if (!target || !body.trim()) return; setBusy(true); try { const [kind, id] = target.split(':'); await api('/internal/messages', { method: 'POST', body: { [kind === 'team' ? 'teamId' : 'recipientUserId']: id, body: body.trim() } }); setBody(''); await load(target); } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao enviar mensagem'); } finally { setBusy(false); } }
  return <section className="live-card live-internal-chat"><h2>Chat interno</h2><p>Mensagens entre usuários e equipes ficam registradas no painel, sem envio ao cliente.</p><select aria-label="Conversa interna" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Selecione uma equipe ou pessoa</option>{availableTeams.map((team) => <option key={team.id} value={`team:${team.id}`}>Equipe · {team.name}</option>)}{operators.filter((user) => user.active && user.user_id !== operator.user_id).map((user) => <option key={user.user_id} value={`peer:${user.user_id}`}>Pessoa · {user.display_name}</option>)}</select><div className="live-internal-messages">{messages.map((message) => <div key={message.id} className={message.sender_user_id === operator.user_id ? 'mine' : ''}><strong>{operators.find((user) => user.user_id === message.sender_user_id)?.display_name || 'Usuário'}</strong><p>{message.body}</p></div>)}</div><form onSubmit={send} className="live-operations-form"><input aria-label="Mensagem interna" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} disabled={!target || busy} placeholder="Escreva para sua equipe" /><button className="button button-primary" disabled={!target || !body.trim() || busy}>Enviar</button></form></section>;
}

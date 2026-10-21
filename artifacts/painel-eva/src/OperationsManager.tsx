import { useEffect, useState, type FormEvent } from 'react';
import { api, type Operator } from './services/api';

type ManagedOperator = Operator & { active: boolean };
type Team = { id: string; name: string; description?: string; active: boolean };
type Member = { team_id: string; user_id: string; active: boolean };
type InternalMessage = { id: string; sender_user_id: string; body: string; created_at: string };

export function OperationsManager({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const [operators, setOperators] = useState<ManagedOperator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Operator['role']>('attendant');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [users, groups] = await Promise.all([api<{ operators: ManagedOperator[] }>('/operators/manage'), api<{ teams: Team[]; members: Member[] }>('/teams')]);
    setOperators(users.operators); setTeams(groups.teams); setMembers(groups.members);
  };
  useEffect(() => { void load().catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar equipe')); }, []);
  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api('/operators/invite', { method: 'POST', body: { email, displayName: name, role } }); await load(); setEmail(''); setName(''); flash('Convite enviado ao novo usuário.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao convidar usuário'); }
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
  async function setActive(user: ManagedOperator) {
    setBusy(true);
    try { await api(`/operators/${user.user_id}`, { method: 'PATCH', body: { active: !user.active } }); await load(); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar usuário'); }
    finally { setBusy(false); }
  }
  return <div className="live-operations-stack"><section className="live-card"><h2>Usuários</h2><p>Convide atendentes e defina quem pode entrar no painel.</p>{operator.role === 'admin' && <form className="live-operations-form" onSubmit={invite}><input aria-label="E-mail" type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} /><input aria-label="Nome" required placeholder="Nome do atendente" value={name} onChange={(e) => setName(e.target.value)} /><select aria-label="Função" value={role} onChange={(e) => setRole(e.target.value as Operator['role'])}><option value="attendant">Atendente</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select><button className="button button-primary" disabled={busy}>Enviar convite</button></form>}<div>{operators.map((user) => <div className="live-row" key={user.user_id}><span><b>{user.display_name}</b><small>{user.role} · {user.active ? 'Ativo' : 'Inativo'}</small></span>{operator.role === 'admin' && user.user_id !== operator.user_id && <button className="button button-outline" disabled={busy} onClick={() => void setActive(user)}>{user.active ? 'Desativar' : 'Ativar'}</button>}</div>)}</div></section>
    <section className="live-card"><h2>Equipes</h2><p>Organize usuários por área. As regras de distribuição por canal são configuradas separadamente.</p><form className="live-operations-form" onSubmit={createTeam}><input aria-label="Nome da equipe" required maxLength={80} placeholder="Ex.: Comercial" value={teamName} onChange={(e) => setTeamName(e.target.value)} /><button className="button button-primary" disabled={busy}>Criar equipe</button></form>{teams.map((team) => <div key={team.id} className="live-team"><strong>{team.name}</strong><div className="live-team-members">{operators.filter((user) => user.active).map((user) => { const joined = members.some((member) => member.team_id === team.id && member.user_id === user.user_id && member.active); return <label key={user.user_id}><input type="checkbox" checked={joined} disabled={busy} onChange={() => void setMember(team.id, user.user_id, !joined)} />{user.display_name}</label>; })}</div></div>)}</section></div>;
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

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Wifi, WifiOff } from 'lucide-react';
import { api, type Operator } from './services/api';

type Instance = { name: string; state: string; profileName?: string; number?: string };
type Channel = { id: string; instance_name: string; display_name: string; purpose?: string | null; instructions?: string | null; default_team_id?: string | null; ai_enabled: boolean; learning_enabled: boolean; auto_admit_new_conversations: boolean; auto_admit_schedule_mode: 'always' | 'window'; auto_admit_start_time: string; auto_admit_end_time: string; active: boolean };
type Team = { id: string; name: string; active: boolean; ai_enabled: boolean };

export default function ConnectionManager({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [draft, setDraft] = useState({ displayName: '', purpose: '', instructions: '', defaultTeamId: '', aiEnabled: false, active: true });
  const [autoDraft, setAutoDraft] = useState<{ mode: 'always' | 'window'; startTime: string; endTime: string }>({ mode: 'always', startTime: '18:00', endTime: '08:00' });
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await api<{ instances: Instance[] }>('/connection/instances');
      setInstances(result.instances);
      setSelected((old) => old && result.instances.some((item) => item.name === old) ? old : result.instances[0]?.name ?? '');
      const [channelResult, teamResult] = await Promise.allSettled([api<{ channels: Channel[] }>('/channels'), api<{ teams: Team[] }>('/teams')]);
      if (channelResult.status === 'rejected') throw channelResult.reason;
      if (teamResult.status === 'rejected') throw teamResult.reason;
      setChannels(channelResult.value.channels);
      setTeams(teamResult.value.teams);
      setError('');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Falha ao carregar canais'); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer); }, [load]);
  const channel = channels.find((item) => item.instance_name === selected);
  useEffect(() => { if (channel) setDraft({ displayName: channel.display_name, purpose: channel.purpose || '', instructions: channel.instructions || '', defaultTeamId: channel.default_team_id || '', aiEnabled: channel.ai_enabled, active: channel.active }); }, [channel?.id, channel?.display_name, channel?.purpose, channel?.instructions, channel?.default_team_id, channel?.ai_enabled, channel?.active, selected]);
  useEffect(() => { if (channel) setAutoDraft({ mode: channel.auto_admit_schedule_mode, startTime: channel.auto_admit_start_time.slice(0, 5), endTime: channel.auto_admit_end_time.slice(0, 5) }); }, [channel?.id, channel?.auto_admit_schedule_mode, channel?.auto_admit_start_time, channel?.auto_admit_end_time, selected]);
  async function showQr() {
    if (!selected) return; setBusy(true); setQr('');
    try {
      const result = await api<{ data: Record<string, unknown> }>(`/connection/instances/${encodeURIComponent(selected)}/qr`);
      const image = String(result.data.base64 ?? '');
      const code = String(result.data.code ?? '');
      setQr(image ? image.startsWith('data:') ? image : `data:image/png;base64,${image}` : code ? await QRCode.toDataURL(code) : '');
      if (!image && !code) flash('A Evolution não retornou um QR Code.');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao obter QR Code'); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api('/connection/instances', { method: 'POST', body: { name } });
      flash('Canal criado com webhook de entrada. Conecte o número pelo QR Code.');
      await load(); setSelected(name); setName('');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao criar canal'); }
    finally { setBusy(false); }
  }
  async function saveChannel(event: FormEvent) {
    event.preventDefault(); if (!channel) return; setBusy(true);
    try { await api(`/channels/${channel.id}`, { method: 'PATCH', body: draft }); await load(); flash('Configuração do canal salva. Conversas já assumidas por humanos continuam com eles.'); }
    catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao salvar canal'); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (!selected || !window.confirm(`Desconectar o WhatsApp da instância ${selected}? O canal e o histórico permanecem salvos; será preciso ler um novo QR Code para conectar outro número.`)) return;
    setBusy(true);
    try {
      await api(`/connection/instances/${encodeURIComponent(selected)}/disconnect`, { method: 'POST' });
      setQr(''); await load(); flash('WhatsApp desconectado. Use o QR Code para conectar outro número.');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao desconectar instância'); }
    finally { setBusy(false); }
  }
  async function toggleLearning() {
    if (!channel) return;
    setBusy(true);
    try {
      await api(`/channels/${channel.id}/learning`, { method: 'PATCH', body: { enabled: !channel.learning_enabled } });
      await load();
      flash(!channel.learning_enabled ? 'Aprendizado supervisionado habilitado neste canal. As sugestões continuam sujeitas a revisão.' : 'Aprendizado supervisionado pausado neste canal.');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao configurar aprendizado'); }
    finally { setBusy(false); }
  }
  async function toggleAutoAdmission() {
    if (!channel) return;
    const enabled = !channel.auto_admit_new_conversations;
    if (enabled && !window.confirm('Ativar a LIA automaticamente para novas conversas deste canal no horário escolhido? Contatos com histórico anterior ao Aluga Mais podem não ter esse contexto no sistema. Conversas já aguardando revisão continuarão bloqueadas.')) return;
    setBusy(true);
    try {
      await api(`/channels/${channel.id}/auto-admission`, { method: 'PATCH', body: { enabled, ...autoDraft } });
      await load();
      flash(enabled ? 'Atendimento automático ativado no horário escolhido para novas conversas deste canal.' : 'Novas conversas voltarão a exigir revisão humana.');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao configurar revisão de conversas'); }
    finally { setBusy(false); }
  }
  async function saveAutoSchedule() {
    if (!channel) return;
    if (channel.auto_admit_new_conversations && !window.confirm('Atualizar agora o horário automático deste canal? A nova programação valerá para as próximas conversas.')) return;
    setBusy(true);
    try {
      await api(`/channels/${channel.id}/auto-admission`, { method: 'PATCH', body: { enabled: channel.auto_admit_new_conversations, ...autoDraft } });
      await load();
      flash('Horário automático salvo para este canal. Conversas anteriores não foram alteradas.');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao salvar horário automático'); }
    finally { setBusy(false); }
  }
  const current = instances.find((item) => item.name === selected);
  const connected = ['open', 'connected'].includes(String(current?.state).toLowerCase());
  const assignedTeam = teams.find((team) => team.id === draft.defaultTeamId && team.active);
  const savedTeam = teams.find((team) => team.id === channel?.default_team_id && team.active);
  const canTurnLIAOn = Boolean(assignedTeam?.ai_enabled);
  const hasPendingChanges = Boolean(channel && (
    draft.displayName !== channel.display_name || draft.purpose !== (channel.purpose || '') ||
    draft.instructions !== (channel.instructions || '') || draft.defaultTeamId !== (channel.default_team_id || '') ||
    draft.aiEnabled !== channel.ai_enabled || draft.active !== channel.active
  ));
  const hasPendingAutoSchedule = Boolean(channel && (
    autoDraft.mode !== channel.auto_admit_schedule_mode ||
    autoDraft.startTime !== channel.auto_admit_start_time.slice(0, 5) ||
    autoDraft.endTime !== channel.auto_admit_end_time.slice(0, 5)
  ));
  const validAutoSchedule = autoDraft.mode === 'always' || autoDraft.startTime !== autoDraft.endTime;
  const evaStatus = !channel?.ai_enabled
    ? 'LIA desligada neste canal.'
    : !savedTeam
      ? 'LIA bloqueada: escolha uma equipe responsável e habilite a LIA nela.'
      : !savedTeam.ai_enabled
        ? `LIA bloqueada: habilite-a na equipe ${savedTeam.name}.`
        : !channel.active
          ? 'LIA bloqueada: este canal está inativo.'
          : `LIA habilitada para a equipe ${savedTeam.name} neste canal.`;
  return <section className="live-card live-connection"><h2>Canais WhatsApp</h2><p>Selecione uma instância para conferir a conexão. As respostas de cada conversa saem pelo número em que ela chegou.</p>
    {error && <div className="live-error">{error}</div>}
    <label className="live-select-label">Instância<select value={selected} onChange={(event) => { setSelected(event.target.value); setQr(''); }}><option value="">Selecione</option>{instances.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
    {current && <div className="live-health">{connected ? <Wifi size={28} /> : <WifiOff size={28} />}<span><b>{connected ? 'Conectado' : current.state || 'Desconectado'}</b><small>{current.profileName || current.name}{current.number ? ` · ${current.number.replace(/@.*$/, '')}` : ''}</small></span></div>}
    {(operator.is_superadmin || operator.permissions?.includes('reconnect_qr')) && current && !connected && <button className="button button-primary" disabled={busy} onClick={() => void showQr()}>Exibir QR Code</button>}
    {operator.role === 'admin' && current && connected && <button className="button button-outline" disabled={busy} onClick={() => void disconnect()}>Desconectar este número</button>}
    {qr && <img className="live-qr" src={qr} alt={`QR Code da instância ${selected}`} />}
    {operator.role === 'admin' && channel && <><form className="live-channel-settings" onSubmit={saveChannel}><h3>Finalidade e atendimento deste canal</h3><label>Nome no painel<input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} required maxLength={80} /></label><label>Finalidade<input value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} maxLength={500} placeholder="Ex.: Atendimento comercial de locação" /></label><label>Orientações para a LIA<textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} maxLength={4000} rows={4} placeholder="Regras específicas deste número" /></label><label>Equipe responsável<select value={draft.defaultTeamId} onChange={(e) => { const teamId = e.target.value; const nextTeam = teams.find((team) => team.id === teamId && team.active); setDraft({ ...draft, defaultTeamId: teamId, aiEnabled: draft.aiEnabled && Boolean(nextTeam?.ai_enabled) }); }}><option value="">Sem equipe atribuída</option>{teams.filter((team) => team.active).map((team) => <option key={team.id} value={team.id}>{team.name}{team.ai_enabled ? ' · LIA habilitada' : ''}</option>)}</select></label><p className="live-channel-hint">Conversas sem equipe atribuída vão para a fila geral. Essa fila não é uma equipe cadastrada.</p><label className="live-channel-check"><input type="checkbox" checked={draft.aiEnabled} disabled={!draft.aiEnabled && !canTurnLIAOn} onChange={(e) => setDraft({ ...draft, aiEnabled: e.target.checked })} />Permitir LIA neste canal</label><p className="live-channel-status" role="status">{evaStatus}{hasPendingChanges ? ' Há alterações pendentes; salve o canal para aplicá-las.' : ''}</p><label className="live-channel-check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Canal ativo</label><button className="button button-primary" disabled={busy}>Salvar canal</button></form><div className="live-channel-settings">
      <h3>Entrada de novas conversas</h3>
      <p>Na revisão manual, cada conversa nova aguarda liberação. No modo automático, a LIA começa a atender somente as conversas criadas após a ativação, neste canal.</p>
      <label>Quando a LIA pode iniciar conversas novas?
        <select value={autoDraft.mode} onChange={(event) => setAutoDraft({ ...autoDraft, mode: event.target.value as 'always' | 'window' })}>
          <option value="always">O tempo inteiro</option>
          <option value="window">Somente em um horário</option>
        </select>
      </label>
      {autoDraft.mode === 'window' && <div className="live-channel-time-range">
        <label>Das<input type="time" value={autoDraft.startTime} onChange={(event) => setAutoDraft({ ...autoDraft, startTime: event.target.value })} /></label>
        <label>Até<input type="time" value={autoDraft.endTime} onChange={(event) => setAutoDraft({ ...autoDraft, endTime: event.target.value })} /></label>
      </div>}
      <p className="live-channel-hint">Horário de Brasília. Um período como 18h–08h atravessa a meia-noite. A LIA continua as conversas que iniciou quando o horário termina; ela transfere à equipe quando as regras de atendimento exigirem.</p>
      {!validAutoSchedule && <p className="live-error">Escolha horários de início e fim diferentes.</p>}
      {hasPendingAutoSchedule && <button type="button" className="button button-outline" disabled={busy || !validAutoSchedule} onClick={() => void saveAutoSchedule()}>Salvar programação</button>}
      <button type="button" className={channel.auto_admit_new_conversations ? 'button button-outline' : 'button button-primary'} disabled={busy || hasPendingChanges || !validAutoSchedule || (!channel.auto_admit_new_conversations && (!channel.ai_enabled || !channel.active || !savedTeam?.ai_enabled))} onClick={() => void toggleAutoAdmission()}>{channel.auto_admit_new_conversations ? 'Exigir revisão nas próximas conversas' : 'Ativar atendimento automático'}</button>
      <p className="live-channel-status" role="status">{channel.auto_admit_new_conversations ? channel.auto_admit_schedule_mode === 'always' ? 'Atendimento automático ativo o tempo inteiro.' : `Atendimento automático das ${channel.auto_admit_start_time.slice(0, 5)} às ${channel.auto_admit_end_time.slice(0, 5)}.` : 'Revisão humana obrigatória para novas conversas.'} As conversas já aguardando revisão não são liberadas por este botão.</p>
      <p className="live-channel-hint">Sem histórico anterior do WhatsApp, um contato antigo pode parecer novo para o Aluga Mais. Ative o modo automático somente quando aceitar esse limite.</p>
    </div><div className="live-channel-settings"><h3>Aprendizado supervisionado</h3><p>Analisa respostas humanas deste canal e cria sugestões para revisão. Não autoriza a LIA a responder e não publica conhecimento automaticamente.</p><button type="button" className="button button-outline" disabled={busy} onClick={() => void toggleLearning()}>{channel.learning_enabled ? 'Pausar aprendizado' : 'Habilitar aprendizado'}</button><p className="live-channel-status" role="status">{channel.learning_enabled ? 'Aprendizado habilitado neste canal.' : 'Aprendizado pausado neste canal.'}</p></div></>}
    {operator.role === 'admin' && <form className="live-new-channel" onSubmit={create}><h3>Conectar outro número</h3><p>A nova instância receberá o mesmo webhook de mensagens da operação atual.</p><label>Nome da instância<input value={name} onChange={(event) => setName(event.target.value)} placeholder="ex.: lopes-aluga-2" pattern="[A-Za-z0-9_-]{3,48}" minLength={3} maxLength={48} required /></label><button className="button button-outline" disabled={busy}>Criar instância</button></form>}
  </section>;
}

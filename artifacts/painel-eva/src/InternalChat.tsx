import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Headphones, MessageCircle, Mic, Search, Send, Square, Trash2, Users } from 'lucide-react';
import { api, type Operator } from './services/api';

type ChatUser = Operator & { active: boolean };
type Team = { id: string; name: string; active: boolean; description?: string };
type Member = { team_id: string; user_id: string; active: boolean };
type Message = { id: string; team_id: string | null; recipient_user_id: string | null; sender_user_id: string; body: string; created_at: string; media_path?: string | null; media_mime_type?: string | null; media_duration_seconds?: number | null };
type Thread = { id: string; title: string; kind: 'team' | 'peer'; active: boolean; subtitle: string };
const time = (value: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const day = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const durationLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR');
const base64Of = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(blob); });

export default function InternalChat({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [latest, setLatest] = useState<Record<string, Message>>({});
  const [target, setTarget] = useState('');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingStart = useRef(0);
  const cancelRecording = useRef(false);
  const scrollPane = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef('');
  const atBottom = useRef(true);
  const firstLoad = useRef(true);

  const threads = useMemo<Thread[]>(() => {
    const allowed = (team: Team) => operator.role !== 'attendant' || members.some((member) => member.active && member.team_id === team.id && member.user_id === operator.user_id);
    const teamThreads = teams.filter((team) => (team.active && allowed(team)) || !!latest[`team:${team.id}`]).map((team) => ({ id: `team:${team.id}`, title: team.name, kind: 'team' as const, active: team.active && allowed(team), subtitle: team.active ? 'Equipe' : 'Equipe arquivada' }));
    const userThreads = users.filter((user) => user.user_id !== operator.user_id).map((user) => ({ id: `peer:${user.user_id}`, title: user.display_name, kind: 'peer' as const, active: user.active, subtitle: user.active ? 'Pessoa' : 'Acesso removido' }));
    return [...teamThreads, ...userThreads].sort((a, b) => {
      const section = (item: Thread) => item.kind === 'team' ? 0 : item.active ? 1 : 2;
      if (section(a) !== section(b)) return section(a) - section(b);
      const recent = String(latest[b.id]?.created_at || '').localeCompare(String(latest[a.id]?.created_at || ''));
      return recent || Number(b.active) - Number(a.active) || a.title.localeCompare(b.title, 'pt-BR');
    });
  }, [teams, members, users, latest, operator]);
  const selected = threads.find((thread) => thread.id === target);
  const filtered = threads.filter((thread) => `${thread.title} ${thread.subtitle}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const userName = (id: string) => users.find((user) => user.user_id === id)?.display_name || (id === operator.user_id ? operator.display_name : 'Usuário removido');

  const refreshRoster = useCallback(async () => {
    const [directory, groups, conversations] = await Promise.allSettled([
      api<{ operators: ChatUser[] }>('/internal/directory'),
      api<{ teams: Team[]; members: Member[] }>('/teams'),
      api<{ latest: Record<string, Message> }>('/internal/conversations'),
    ]);
    if (directory.status === 'fulfilled') setUsers(directory.value.operators);
    if (groups.status === 'fulfilled') { setTeams(groups.value.teams); setMembers(groups.value.members); }
    if (conversations.status === 'fulfilled') setLatest(conversations.value.latest);
    if (directory.status === 'rejected' && groups.status === 'rejected') throw directory.reason;
  }, []);
  const fetchThread = useCallback(async (selectedTarget: string, before?: string) => {
    const [kind, id] = selectedTarget.split(':');
    const param = kind === 'team' ? 'teamId' : 'peerId';
    const result = await api<{ messages: Message[]; hasMore: boolean }>(`/internal/messages?${param}=${encodeURIComponent(id)}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    if (targetRef.current !== selectedTarget) return;
    setHasMore(result.hasMore);
    setMessages((current) => before ? [...result.messages, ...current.filter((item) => !result.messages.some((older) => older.id === item.id))] : [...current.filter((item) => !result.messages.some((fresh) => fresh.id === item.id)), ...result.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }, []);

  useEffect(() => { void refreshRoster().catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar conversas internas')); }, [refreshRoster]);
  useEffect(() => { if (!target && threads.length) setTarget(threads[0].id); }, [threads, target]);
  useEffect(() => {
    targetRef.current = target; setMessages([]); setHasMore(false); firstLoad.current = true;
    if (!target) return;
    setLoading(true);
    void fetchThread(target).catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar mensagens')).finally(() => setLoading(false));
    const timer = window.setInterval(() => void fetchThread(target).catch(() => undefined), 6500);
    return () => window.clearInterval(timer);
  }, [target, fetchThread]);
  useEffect(() => {
    const timer = window.setInterval(() => void refreshRoster().catch(() => undefined), 10000);
    return () => window.clearInterval(timer);
  }, [refreshRoster]);
  useEffect(() => {
    const pane = scrollPane.current;
    if (pane && (atBottom.current || firstLoad.current)) { pane.scrollTop = pane.scrollHeight; firstLoad.current = false; }
  }, [messages]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - recordingStart.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => { recorder.current?.stop(); stream.current?.getTracks().forEach((track) => track.stop()); if (recorded) URL.revokeObjectURL(recorded.url); }, [recorded]);

  async function send(event: FormEvent) {
    event.preventDefault(); if (!selected?.active || !body.trim() || busy) return;
    setBusy(true);
    try {
      const [kind, id] = target.split(':');
      await api('/internal/messages', { method: 'POST', body: { [kind === 'team' ? 'teamId' : 'recipientUserId']: id, body: body.trim() } });
      setBody(''); atBottom.current = true; await Promise.all([fetchThread(target), refreshRoster()]);
    } catch (error) { flash(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem'); }
    finally { setBusy(false); }
  }
  async function startRecording() {
    if (!selected?.active || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { flash('Seu navegador não permite gravar áudio aqui.'); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((value) => MediaRecorder.isTypeSupported(value));
      const next = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      cancelRecording.current = false;
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        media.getTracks().forEach((track) => track.stop()); stream.current = null; setRecording(false);
        if (cancelRecording.current) return;
        const blob = new Blob(chunks, { type: next.mimeType || mime || 'audio/webm' });
        if (blob.size) setRecorded({ blob, url: URL.createObjectURL(blob), seconds: Math.max(1, Math.floor((Date.now() - recordingStart.current) / 1000)) });
      };
      next.start(250); recorder.current = next; recordingStart.current = Date.now(); setSeconds(0); setRecording(true);
    } catch { flash('Não foi possível acessar o microfone. Verifique a permissão do navegador.'); }
  }
  function stopRecording(discard = false) {
    cancelRecording.current = discard;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
  }
  function discardPreview() { if (recorded) URL.revokeObjectURL(recorded.url); setRecorded(null); }
  async function sendAudio() {
    if (!recorded || !selected?.active || busy) return;
    if (recorded.blob.size > 3 * 1024 * 1024) { flash('O áudio passou de 3 MB. Grave uma mensagem mais curta.'); return; }
    setBusy(true);
    try {
      const [kind, id] = target.split(':');
      await api('/internal/audio', { method: 'POST', body: { [kind === 'team' ? 'teamId' : 'recipientUserId']: id, base64: await base64Of(recorded.blob), mimeType: recorded.blob.type, durationSeconds: recorded.seconds } });
      discardPreview(); atBottom.current = true; await Promise.all([fetchThread(target), refreshRoster()]);
    } catch (error) { flash(error instanceof Error ? error.message : 'Não foi possível enviar o áudio'); }
    finally { setBusy(false); }
  }
  async function loadOlder() {
    if (!messages.length || !hasMore || !scrollPane.current) return;
    const pane = scrollPane.current; const oldHeight = pane.scrollHeight;
    try { await fetchThread(target, messages[0].created_at); requestAnimationFrame(() => { pane.scrollTop = pane.scrollHeight - oldHeight + pane.scrollTop; }); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao carregar mensagens antigas'); }
  }

  return <section className={`internal-chat ${mobileThread ? 'internal-chat-open' : ''}`} aria-label="Chat interno">
    <aside className="internal-roster">
      <div className="internal-roster-head"><div><span className="internal-eyebrow">COMUNICAÇÃO DA EQUIPE</span><h1>Mensagens</h1></div><span className="internal-roster-count">{threads.filter((item) => item.active).length}</span></div>
      <label className="internal-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pessoa ou equipe" aria-label="Buscar no chat interno" /></label>
      <div className="internal-roster-scroll">
        {filtered.length === 0 && <p className="internal-roster-empty">{query ? 'Nenhum resultado para esta busca.' : 'Nenhuma pessoa ou equipe disponível.'}</p>}
        {filtered.map((thread, index) => {
          const prior = filtered[index - 1];
          const section = thread.kind === 'team' ? 'Equipes' : thread.active ? 'Pessoas' : 'Acessos removidos';
          const previousSection = prior && (prior.kind === 'team' ? 'Equipes' : prior.active ? 'Pessoas' : 'Acessos removidos');
          const preview = latest[thread.id];
          return <div key={thread.id}>{section !== previousSection && <h2 className="internal-section-title">{section}</h2>}<button type="button" className={`internal-person ${target === thread.id ? 'selected' : ''}`} onClick={() => { if (recording) stopRecording(true); discardPreview(); setTarget(thread.id); setMobileThread(true); atBottom.current = true; }}>
            <span className={`internal-avatar ${thread.kind === 'team' ? 'team' : ''}`}>{thread.kind === 'team' ? <Users size={20} /> : initials(thread.title)}</span>
            <span className="internal-person-main"><span className="internal-person-top"><strong>{thread.title}</strong>{preview && <time>{time(preview.created_at)}</time>}</span><small>{preview ? `${preview.sender_user_id === operator.user_id ? 'Você: ' : thread.kind === 'team' ? `${userName(preview.sender_user_id)}: ` : ''}${preview.media_mime_type ? 'Mensagem de voz' : preview.body}` : thread.subtitle}</small></span>
          </button></div>;
        })}
      </div>
      <div className="internal-roster-foot"><span className="internal-avatar self">{initials(operator.display_name)}</span><span><strong>{operator.display_name}</strong><small>Seu perfil · Chat interno</small></span></div>
    </aside>
    <div className="internal-thread">
      {selected ? <>
        <header className="internal-thread-head"><button className="internal-back" type="button" onClick={() => setMobileThread(false)} aria-label="Voltar à lista"><ArrowLeft size={20} /></button><span className={`internal-avatar ${selected.kind === 'team' ? 'team' : ''}`}>{selected.kind === 'team' ? <Users size={20} /> : initials(selected.title)}</span><div><strong>{selected.title}</strong><small>{selected.kind === 'team' ? 'Conversa da equipe' : selected.active ? 'Conversa privada' : 'Histórico de usuário removido'}</small></div><span className="internal-private"><Headphones size={15} /> Somente equipe</span></header>
        <div className="internal-messages" ref={scrollPane} onScroll={(event) => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
          {hasMore && <button className="internal-load-more" type="button" onClick={() => void loadOlder()}>Carregar mensagens anteriores</button>}
          {loading && <p className="internal-empty">Carregando mensagens…</p>}
          {!loading && !messages.length && <div className="internal-empty"><MessageCircle size={30} /><strong>Comece a conversa</strong><span>As mensagens ficam salvas aqui para sua equipe consultar depois.</span></div>}
          {messages.map((message, index) => <div key={message.id}>{(!index || day(messages[index - 1].created_at) !== day(message.created_at)) && <div className="internal-day"><span>{day(message.created_at)}</span></div>}<article className={`internal-bubble ${message.sender_user_id === operator.user_id ? 'mine' : ''}`}>
            {selected.kind === 'team' && <strong>{userName(message.sender_user_id)}</strong>}
            {message.media_mime_type ? <div className="internal-audio"><span><Mic size={15} /> Mensagem de voz {message.media_duration_seconds ? `· ${durationLabel(message.media_duration_seconds)}` : ''}</span><audio controls preload="none" src={`/api/internal/media/${message.id}`} /></div> : <p>{message.body}</p>}
            <time>{time(message.created_at)}</time>
          </article></div>)}
        </div>
        <div className="internal-compose">
          {!selected.active && <p className="internal-disabled">Este usuário ou equipe não está mais ativo. O histórico continua disponível.</p>}
          {recording && <div className="internal-recording"><span className="internal-record-pulse" /><strong>Gravando áudio</strong><time>{durationLabel(seconds)}</time><span className="internal-record-bars" aria-hidden="true">▂▅▃▇▄▆▃▅▂▆▃▇▄▅</span><button type="button" onClick={() => stopRecording(true)} aria-label="Descartar gravação"><Trash2 size={17} /></button><button type="button" className="internal-stop" onClick={() => stopRecording()} aria-label="Parar gravação"><Square size={15} fill="currentColor" /></button></div>}
          {recorded && <div className="internal-preview"><Mic size={16} /><span>Áudio pronto · {durationLabel(recorded.seconds)}</span><audio controls src={recorded.url} /><button type="button" onClick={discardPreview} aria-label="Descartar áudio"><Trash2 size={17} /></button><button type="button" className="internal-audio-send" disabled={busy} onClick={() => void sendAudio()}><Send size={16} /> Enviar áudio</button></div>}
          {!recording && !recorded && <form onSubmit={send} className="internal-composer-form"><textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={5000} disabled={!selected.active || busy} rows={1} placeholder="Escreva uma mensagem para a equipe…" aria-label="Mensagem interna" /><button type="button" className="internal-icon-action" disabled={!selected.active || busy} onClick={() => void startRecording()} aria-label="Gravar áudio" title="Gravar áudio"><Mic size={20} /></button><button type="submit" className="internal-send" disabled={!selected.active || busy || !body.trim()} aria-label="Enviar mensagem" title="Enviar mensagem"><Send size={19} /></button></form>}
          <small className="internal-compose-tip">Mensagens internas não são enviadas ao WhatsApp · Enter envia, Shift+Enter quebra a linha</small>
        </div>
      </> : <div className="internal-empty internal-thread-empty"><MessageCircle size={36} /><strong>Selecione uma conversa</strong><span>Fale com uma pessoa ou com toda uma equipe.</span></div>}
    </div>
  </section>;
}

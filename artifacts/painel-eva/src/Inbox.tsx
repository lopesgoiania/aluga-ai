import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, FileText, Filter, Mic, Paperclip, Plus, Send, Smile, Sparkles, Square, Sticker, Trash2, UserRound, X } from 'lucide-react';
import { api, dateTime, displayName, inboxCategory, phoneLabel, stateOf, type ConversationDetail, type MessageRow, type Operator, type SessionRow, type Tag } from './services/api';

type Props = {
  operator: Operator;
  operators: Operator[];
  routingReady: boolean;
  sessions: SessionRow[]; selected?: SessionRow; detail: ConversationDetail | null; selectedId: string;
  setSelectedId: (id: string) => void; showList: boolean; setShowList: (value: boolean) => void;
  search: string; setSearch: (value: string) => void; busy: boolean; setBusy: (value: boolean) => void;
  refresh: () => Promise<void>; refreshDetail: (id: string) => Promise<void>;
  action: (kind: 'assume' | 'resume_ai' | 'close_session', historyReviewed?: boolean) => Promise<void>;
  flash: (message: string) => void; humanQueue: boolean; error?: string;
};

const panelFields = (session?: SessionRow) => {
  const value = session?.contact?.metadata;
  const metadata = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const panel = metadata.panel_fields && typeof metadata.panel_fields === 'object' ? metadata.panel_fields as Record<string, unknown> : {};
  const fields = panel.fields && typeof panel.fields === 'object' ? panel.fields as Record<string, string> : {};
  return { email: String(panel.email ?? ''), notes: String(panel.notes ?? ''), fields };
};
const clockLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const blobBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
const emojis = ['😀','😄','😊','🥰','😍','😉','👍','👏','🙌','🙏','❤️','💙','✨','🎉','🏠','🔑','📍','📅','🤝','✅','👋','💬','😅','😢','🤔','👀','🔥','💡','📞','🚀'];
const needsHistoryReview = (session?: SessionRow) => Boolean(session && !session.ai_enabled && session.metadata?.ai_admission === 'unverified');

function Media({ message, sessionId }: { message: MessageRow; sessionId: string }) {
  const [failed, setFailed] = useState(false);
  const kind = String(message.message_type ?? '').toLowerCase();
  const media = `/api/conversations/${sessionId}/media/${message.id}`;
  const transcript = message.normalized_content && !message.normalized_content.startsWith('[') ? message.normalized_content : '';
  if (kind === 'audio' || kind === 'ptt') return <div className="live-media">
    <strong><Mic size={14} /> Áudio</strong>
    {!failed ? <audio controls preload="none" src={media} onError={() => setFailed(true)} /> : <small>Áudio antigo indisponível na Evolution.</small>}
    {transcript && <p className="live-transcript"><b>Transcrição automática:</b> {transcript}</p>}
  </div>;
  if (kind === 'image' || kind === 'sticker') return <div className="live-media">
    {!failed ? <a href={media} target="_blank" rel="noreferrer"><img src={media} alt={message.media_filename || 'Imagem enviada na conversa'} onError={() => setFailed(true)} /></a> : <small>Imagem indisponível na Evolution.</small>}
    {transcript && <p>{transcript}</p>}
  </div>;
  if (kind === 'document' || kind === 'pdf') return <div className="live-media"><a href={media} target="_blank" rel="noreferrer"><FileText size={16} /> {message.media_filename || 'Abrir documento'}</a>{transcript && <p>{transcript}</p>}</div>;
  const body = String(message.normalized_content || message.content || '[Mídia]');
  const signature = /^\*([^*\n]{1,90}:)\*\n([\s\S]*)$/.exec(body);
  return signature ? <p><strong>{signature[1]}</strong><br />{signature[2]}</p> : <p>{body}</p>;
}

function Avatar({ session }: { session: SessionRow }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [session.id]);
  return failed ? <span className="live-avatar">{displayName(session).slice(0, 2).toUpperCase()}</span> : <img className="live-avatar-photo" src={`/api/conversations/${session.id}/avatar?initials=${encodeURIComponent(displayName(session).slice(0, 2))}`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export default function Inbox(props: Props) {
  const { operator, operators, routingReady, sessions, selected, detail, selectedId, setSelectedId, showList, setShowList, search, setSearch, busy, setBusy, refresh, refreshDetail, action, flash, humanQueue, error } = props;
  const [reply, setReply] = useState('');
  const [category, setCategory] = useState<'new' | 'mine' | 'others'>('new');
  const categoryInitialized = useRef(false);
  const [channel, setChannel] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  useEffect(() => { void api<{ tags: Tag[] }>('/tags').then((result) => setAvailableTags(result.tags)).catch(() => undefined); }, []);
  useEffect(() => { void api<{ teams: { id: string; name: string; active: boolean }[] }>('/teams').then((result) => setAvailableTeams(result.teams.filter((team) => team.active))).catch(() => undefined); }, []);
  async function setContactTag(tag: Tag, enabled: boolean) {
    if (!selected?.contact_id) return;
    setBusy(true);
    try {
      await api(`/contacts/${selected.contact_id}/tags/${tag.id}`, { method: 'PUT', body: { enabled } });
      await refresh(); flash(enabled ? 'Etiqueta adicionada.' : 'Etiqueta removida.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao alterar etiqueta'); }
    finally { setBusy(false); }
  }
  const [editing, setEditing] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [fields, setFields] = useState<{ key: string; value: string }[]>([]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(19).fill(0.15));
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreview, setAudioPreview] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<'image' | 'document' | 'sticker'>('document');
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const meterTimer = useRef<number | null>(null);
  const recordTimer = useRef<number | null>(null);
  const cancelRecording = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const stickerInput = useRef<HTMLInputElement | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastMessageId = detail?.messages.at(-1)?.id;

  useEffect(() => {
    if (selected && !categoryInitialized.current) { setCategory(inboxCategory(selected, operator)); categoryInitialized.current = true; }
  }, [selected, operator]);

  useEffect(() => {
    setReply(''); setEditing(false); setShowContext(false); setAvatarFailed(false); setAudioBlob(null); setAttachment(null); setAiOpen(false); setEmojiOpen(false); setTransferOpen(false);
    cancelRecording.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (meterTimer.current) window.clearInterval(meterTimer.current);
    if (recordTimer.current) window.clearInterval(recordTimer.current);
    void audioContext.current?.close();
  }, [selectedId]);
  useEffect(() => {
    const panel = panelFields(selected);
    setName(String(selected?.contact?.name ?? '')); setEmail(panel.email); setNotes(panel.notes);
    setFields(Object.entries(panel.fields).map(([key, value]) => ({ key, value: String(value) })));
  }, [selectedId, editing]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [selectedId, lastMessageId]);
  useEffect(() => { if (!audioBlob) { setAudioPreview(''); return; } const url = URL.createObjectURL(audioBlob); setAudioPreview(url); return () => URL.revokeObjectURL(url); }, [audioBlob]);
  useEffect(() => { if (!attachment || !attachment.type.startsWith('image/')) { setAttachmentPreview(''); return; } const url = URL.createObjectURL(attachment); setAttachmentPreview(url); return () => URL.revokeObjectURL(url); }, [attachment]);
  useEffect(() => () => { cancelRecording.current = true; if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach((track) => track.stop()); if (meterTimer.current) window.clearInterval(meterTimer.current); if (recordTimer.current) window.clearInterval(recordTimer.current); void audioContext.current?.close(); }, []);

  const filtered = sessions.filter((session) => {
    const haystack = `${displayName(session)} ${session.phone} ${session.tags.map((tag) => tag.name).join(' ')}`.toLocaleLowerCase('pt-BR');
    const owner = session.handoff?.assigned_to?.trim() || (session.ai_enabled ? 'LIA' : 'Sem responsável');
    return inboxCategory(session, operator) === category && haystack.includes(search.toLocaleLowerCase('pt-BR'))
      && (channel === 'all' || session.channel === channel) && (tagFilter === 'all' || session.tags.some((tag) => tag.id === tagFilter))
      && (ownerFilter === 'all' || owner === ownerFilter) && (statusFilter === 'all' || (statusFilter === 'open' ? !session.closed_at && session.status !== 'encerrado' : stateOf(session) === statusFilter))
      && (!humanQueue || ['Aguardando atendimento', 'Humano assumiu'].includes(stateOf(session)));
  });
  const counts = { new: 0, mine: 0, others: 0 };
  for (const session of sessions) if (!session.closed_at && session.status !== 'encerrado') counts[inboxCategory(session, operator)] += 1;
  const assignedTo = selected?.handoff?.assigned_to?.trim() || '';
  const canReply = Boolean(selected && (
    ['LIA ativa', 'Aguardando atendimento'].includes(stateOf(selected))
    || (stateOf(selected) === 'Humano assumiu' && assignedTo === operator.display_name)
  ));
  const canClaim = Boolean(selected && stateOf(selected) === 'Humano assumiu' && !canReply && (operator.role === 'admin' || operator.role === 'supervisor'));

  async function route(target: 'new' | 'operator' | 'eva' | 'team', targetId?: string) {
    if (!selected) return;
    const historyReviewed = target === 'eva' && needsHistoryReview(selected);
    if (historyReviewed && !window.confirm('Esta conversa pode ter um histórico anterior no WhatsApp que a LIA não conhece. Você revisou o contexto e quer ativar a LIA mesmo assim?')) return;
    setBusy(true); setTransferOpen(false);
    try {
      await api(`/conversations/${selected.id}/route`, { method: 'POST', body: { target, targetUserId: target === 'operator' ? targetId : null, teamId: target === 'team' ? targetId : null, historyReviewed } });
      await Promise.all([refresh(), refreshDetail(selected.id)]);
      flash(target === 'new' ? 'Conversa devolvida para Novos. LIA pausada.' : target === 'eva' ? 'Conversa devolvida à LIA.' : target === 'team' ? 'Conversa encaminhada à equipe. LIA pausada.' : 'Conversa atribuída ao atendente.');
      if (target === 'new') setCategory('new');
      else if (target === 'operator' && targetId === operator.user_id) setCategory('mine');
      else setCategory('others');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Não foi possível transferir a conversa'); }
    finally { setBusy(false); }
  }
  function insertEmoji(emoji: string) {
    const area = composer.current;
    const start = area?.selectionStart ?? reply.length;
    const end = area?.selectionEnd ?? reply.length;
    setReply(reply.slice(0, start) + emoji + reply.slice(end)); setEmojiOpen(false);
    requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }

  async function claim() {
    if (!selected || !canClaim) return;
    setBusy(true);
    try {
      await api(`/conversations/${selected.id}/claim`, { method: 'POST', body: {} });
      await Promise.all([refresh(), refreshDetail(selected.id)]);
      flash('Atendimento transferido para você. Agora pode responder pelo painel.');
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Não foi possível assumir a conversa'); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault(); if (!selected || !reply.trim() || busy) return;
    setBusy(true);
    try {
      const result = await api<{ status: string; message?: string }>(`/conversations/${selected.id}/reply`, { method: 'POST', body: { text: reply.trim(), requestKey: crypto.randomUUID() } });
      if (result.status === 'sent') { setReply(''); flash('Mensagem enviada.'); } else flash(result.message || 'Confira o envio antes de tentar novamente.');
      await Promise.all([refresh(), refreshDetail(selected.id)]);
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao enviar'); }
    finally { setBusy(false); }
  }

  async function assist(mode: 'suggest' | 'improve') {
    if (!selected) return; setBusy(true);
    try {
      const result = await api<{ suggestion: string }>(`/conversations/${selected.id}/assist`, { method: 'POST', body: { mode, draft: reply } });
      setReply(result.suggestion); flash('Sugestão inserida. Revise antes de enviar.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Assistência indisponível'); }
    finally { setBusy(false); }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    const custom = Object.fromEntries(fields.map(({ key, value }) => [key.trim(), value.trim()]).filter(([key]) => key));
    setBusy(true);
    try {
      await api(`/conversations/${selected.id}/contact`, { method: 'PATCH', body: { name, email, notes, fields: custom } });
      await refresh(); setEditing(false); flash('Contato atualizado.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao salvar contato'); }
    finally { setBusy(false); }
  }

  async function startRecording() {
    if (!canReply) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { flash('Este navegador não permite gravar áudio.'); return; }
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = input;
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(input, mimeType ? { mimeType } : undefined); recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recording.onstop = () => {
        setRecording(false);
        if (!cancelRecording.current && chunks.length) setAudioBlob(new Blob(chunks, { type: recording.mimeType || 'audio/webm' }));
        input.getTracks().forEach((track) => track.stop());
        if (meterTimer.current) window.clearInterval(meterTimer.current);
        if (recordTimer.current) window.clearInterval(recordTimer.current);
        void audioContext.current?.close(); audioContext.current = null;
      };
      cancelRecording.current = false; setRecordSeconds(0); setLevels(Array(19).fill(0.15)); setAudioBlob(null); setAttachment(null);
      const context = new AudioContext(); audioContext.current = context;
      const source = context.createMediaStreamSource(input);
      const analyser = context.createAnalyser(); analyser.fftSize = 64; source.connect(analyser);
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      meterTimer.current = window.setInterval(() => { analyser.getByteFrequencyData(frequencies); setLevels(Array.from({ length: 19 }, (_, index) => Math.max(0.13, frequencies[index + 2] / 190))); }, 110);
      recordTimer.current = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
      recording.start(250); setRecording(true);
    } catch { stream.current?.getTracks().forEach((track) => track.stop()); flash('Permita o uso do microfone para gravar áudio.'); }
  }
  function stopRecording(keep: boolean) {
    cancelRecording.current = !keep;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else { setRecording(false); stream.current?.getTracks().forEach((track) => track.stop()); }
  }
  async function sendAudio() {
    if (!selected || !audioBlob || busy || !canReply) return;
    if (audioBlob.size > 5 * 1024 * 1024) { flash('O áudio deve ter até 5 MB.'); return; }
    setBusy(true);
    try {
      const base64 = await blobBase64(audioBlob);
      const result = await api<{ status: string; message?: string }>(`/conversations/${selected.id}/audio`, { method: 'POST', body: { requestKey: crypto.randomUUID(), mimeType: audioBlob.type, base64 } });
      if (result.status === 'sent') { setAudioBlob(null); flash('Áudio enviado.'); } else flash(result.message || 'Confira o envio do áudio antes de tentar novamente.');
      await Promise.all([refresh(), refreshDetail(selected.id)]);
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao enviar áudio'); }
    finally { setBusy(false); }
  }

  function chooseAttachment(file?: File, sticker = false) {
    if (!file) return;
    const supported = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    if (!supported.includes(file.type) || file.size > 5 * 1024 * 1024 || (sticker && file.type !== 'image/webp')) { flash(sticker ? 'Escolha uma figurinha WebP de até 5 MB.' : 'Escolha uma imagem ou documento de até 5 MB.'); return; }
    setAttachmentKind(sticker ? 'sticker' : file.type.startsWith('image/') ? 'image' : 'document'); setAttachment(file); setAudioBlob(null);
  }
  async function sendFile() {
    if (!selected || !attachment || busy || !canReply) return;
    setBusy(true);
    try {
      const result = await api<{ status: string; message?: string }>(`/conversations/${selected.id}/file`, { method: 'POST', body: { requestKey: crypto.randomUUID(), kind: attachmentKind, mimeType: attachment.type, fileName: attachment.name, base64: await blobBase64(attachment) } });
      if (result.status === 'sent') { setAttachment(null); flash('Arquivo enviado.'); } else flash(result.message || 'Confira o envio antes de tentar novamente.');
      await Promise.all([refresh(), refreshDetail(selected.id)]);
    } catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao enviar arquivo'); }
    finally { setBusy(false); }
  }

  const panel = panelFields(selected);
  return <div className="live-inbox">
    <aside className={`live-conversation-list ${showList ? '' : 'live-mobile-hidden'}`}>
      <div className="live-inbox-tabs" role="tablist" aria-label="Categorias de atendimento">{([['new','Novos'],['mine','Meus'],['others','Outros']] as const).map(([key,label]) => <button key={key} role="tab" aria-selected={category === key} className={category === key ? 'active' : ''} onClick={() => { setCategory(key); setSelectedId(sessions.find((session) => inboxCategory(session, operator) === key && !session.closed_at)?.id ?? ''); }}>{label}<span>{counts[key]}</span></button>)}</div>
      <div className="live-list-search-row"><label className="live-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" /></label><button type="button" className={`live-filter-button ${filtersOpen ? 'active' : ''}`} title="Filtrar conversas" aria-label="Filtrar conversas" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={18} /></button></div>
      {filtersOpen && <div className="live-filter-panel"><label>Etiqueta<select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">Todas</option>{availableTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>Responsável<select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">Todos</option><option value="LIA">LIA</option><option value="Sem responsável">Sem responsável</option>{operators.map((item) => <option key={item.user_id} value={item.display_name}>{item.display_name}</option>)}<option value="WhatsApp">WhatsApp</option></select></label><label>Canal<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">Todos os números</option>{[...new Set(sessions.map((item) => item.channel).filter(Boolean))].map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label>Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="open">Em aberto</option><option value="all">Todas</option><option value="LIA ativa">LIA ativa</option><option value="Aguardando atendimento">Aguardando atendimento</option><option value="Humano assumiu">Humano assumiu</option><option value="Encerrada">Encerrada</option></select></label><button type="button" onClick={() => { setTagFilter('all'); setOwnerFilter('all'); setChannel('all'); setStatusFilter('open'); }}>Limpar filtros</button></div>}
      {error ? <div className="live-error">{error}</div> : filtered.length ? filtered.map((session) => <button key={session.id} className={`live-conversation ${selectedId === session.id ? 'selected' : ''}`} onClick={() => { setSelectedId(session.id); setShowList(false); }}>
        <Avatar session={session} /><span className="live-conversation-body"><b>{displayName(session)}</b><span className="live-list-tags">{session.tags.map((tag) => <span key={tag.id} style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</span>)}</span><small>{phoneLabel(session.phone)} · {session.channel || 'WhatsApp'}</small>{needsHistoryReview(session) && <span className="live-history-warning">Histórico anterior não verificado</span>}<span className="live-state">{session.handoff?.assigned_to || stateOf(session)}</span></span>
      </button>) : <div className="live-empty">Nenhuma conversa neste filtro.</div>}
    </aside>
    <section className={`live-thread ${showList ? 'live-mobile-hidden' : ''}`}>
      {selected ? <><div className="live-thread-head"><button className="live-back" onClick={() => setShowList(true)} aria-label="Voltar à lista"><ArrowLeft size={18} /></button>
        {!avatarFailed ? <img className="live-avatar-photo" src={`/api/conversations/${selected.id}/avatar?initials=${encodeURIComponent(displayName(selected).slice(0, 2))}`} alt="Foto do contato" onError={() => setAvatarFailed(true)} /> : <span className="live-avatar">{displayName(selected).slice(0, 2).toUpperCase()}</span>}
        <div><b>{displayName(selected)}</b><small>{phoneLabel(selected.phone)} · {selected.channel || 'WhatsApp'}</small></div><button className="live-context-toggle" onClick={() => setShowContext(!showContext)} aria-label="Mostrar dados do contato"><UserRound size={17} /></button><span className="live-state">{stateOf(selected)}</span><div className="live-transfer-wrap"><button type="button" className="live-transfer-trigger" disabled={!routingReady || busy} title={routingReady ? 'Transferir atendimento' : 'Disponível após a migração do banco operacional'} aria-expanded={transferOpen} onClick={() => setTransferOpen(!transferOpen)}>Transferir</button>{transferOpen && <div className="live-transfer-menu"><strong>Enviar atendimento para</strong><button onClick={() => void route('new')}>Novos · sem responsável</button><button onClick={() => void route('eva')}>LIA · atendimento automático</button>{availableTeams.length > 0 && <strong>Equipes</strong>}{availableTeams.map((team) => <button key={team.id} onClick={() => void route('team', team.id)}>{team.name}</button>)}{operators.length > 0 && <strong>Atendentes</strong>}{operators.map((item) => <button key={item.user_id} onClick={() => void route('operator', item.user_id)}>{item.display_name}{item.user_id === operator.user_id ? ' · você' : ''}</button>)}</div>}</div>
      </div><div className="live-thread-body" aria-label="Mensagens da conversa">
        {needsHistoryReview(selected) && <div className="live-history-banner" role="status"><strong>LIA pausada nesta conversa</strong><span>O histórico anterior do WhatsApp ainda não foi verificado. Revise o contexto antes de liberar a LIA para este contato.</span><div className="live-history-actions"><button type="button" disabled={busy || !routingReady} onClick={() => void route('eva')}><Sparkles size={15} /> Liberar LIA nesta conversa</button><button type="button" className="secondary" disabled={busy || !routingReady} onClick={() => void route('new')}>Manter sem IA</button><span>A decisão vale só para esta conversa.</span></div></div>}
        {detail?.session.id === selected.id ? detail.messages.map((message) => <div className={`live-message ${message.direction === 'outbound' ? 'outbound' : ''}`} key={message.id}>
          <small>{message.sender_type === 'ai' ? 'LIA' : message.sender_type === 'human' ? 'Atendente' : 'Cliente'} · {dateTime(message.created_at)}</small>
          {message.deleted_at_provider && <small className="live-deleted-marker">Apagada no WhatsApp · original preservado aqui</small>}
          <Media message={message} sessionId={selected.id} />
        </div>) : <p>Carregando histórico…</p>}<div ref={bottom} />
      </div><div className="live-thread-actions">
        {['LIA ativa', 'Aguardando atendimento'].includes(stateOf(selected)) ? <button className="button button-primary" disabled={busy} onClick={() => void (routingReady ? route('operator', operator.user_id) : action('assume'))}>Assumir e pausar LIA</button> : null}
        {stateOf(selected) === 'Humano assumiu' && !canReply && <div className="live-assignment-gate"><div><strong>Atendimento com {assignedTo || 'outro operador'}</strong><span>Para responder aqui, a conversa precisa ser transferida para {operator.display_name}.</span></div>{canClaim && <button className="button button-primary" disabled={busy} onClick={() => void claim()}>Assumir neste painel</button>}</div>}
        {canReply && <>
          {stateOf(selected) !== 'Humano assumiu' && <p className="live-takeover-note">Ao enviar, você assume esta conversa e a LIA é pausada.</p>}
          <div className="live-composer-shell">
            {recording ? <div className="live-recording" role="status"><span className="live-recording-dot" /><strong>Gravando</strong><span className="live-recording-clock">{clockLabel(recordSeconds)}</span><div className="live-waveform" aria-hidden="true">{levels.map((level, index) => <i key={index} style={{ height: `${Math.round(8 + level * 24)}px` }} />)}</div><button className="live-icon-button danger" type="button" title="Cancelar gravação" aria-label="Cancelar gravação" onClick={() => stopRecording(false)}><Trash2 size={18} /></button><button className="live-icon-button primary" type="button" title="Concluir gravação" aria-label="Concluir gravação" onClick={() => stopRecording(true)}><Check size={19} /></button></div> : audioBlob ? <div className="live-draft-preview"><Mic size={18} /><div><strong>Áudio pronto</strong><small>Ouça antes de enviar · {clockLabel(recordSeconds)}</small></div><audio controls src={audioPreview} /><button className="live-icon-button" title="Descartar áudio" aria-label="Descartar áudio" onClick={() => setAudioBlob(null)}><X size={18} /></button><button className="live-icon-button primary" disabled={busy} title="Enviar áudio" aria-label="Enviar áudio" onClick={() => void sendAudio()}><Send size={18} /></button></div> : attachment ? <div className="live-draft-preview">{attachmentPreview ? <img src={attachmentPreview} alt="Prévia do anexo" /> : <FileText size={22} />}<div><strong>{attachment.name}</strong><small>{attachmentKind === 'sticker' ? 'Figurinha' : attachmentKind === 'image' ? 'Imagem' : 'Documento'} · {(attachment.size / 1024).toFixed(0)} KB</small></div><button className="live-icon-button" title="Remover anexo" aria-label="Remover anexo" onClick={() => setAttachment(null)}><X size={18} /></button><button className="live-icon-button primary" disabled={busy} title="Enviar anexo" aria-label="Enviar anexo" onClick={() => void sendFile()}><Send size={18} /></button></div> : <form ref={form} onSubmit={send} className="live-composer-modern"><textarea ref={composer} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.current?.requestSubmit(); } }} placeholder="Digite uma mensagem" rows={2} /><div className="live-composer-toolbar">
              <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => { chooseAttachment(event.target.files?.[0]); event.target.value = ''; }} /><input ref={stickerInput} type="file" hidden accept="image/webp,.webp" onChange={(event) => { chooseAttachment(event.target.files?.[0], true); event.target.value = ''; }} />
              <button type="button" className="live-icon-button" title="Anexar imagem ou documento" aria-label="Anexar imagem ou documento" onClick={() => fileInput.current?.click()}><Paperclip size={19} /></button><div className="live-emoji-wrap"><button type="button" className="live-icon-button" title="Inserir emoji" aria-label="Inserir emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={19} /></button>{emojiOpen && <div className="live-emoji-picker" role="dialog" aria-label="Escolher emoji">{emojis.map((emoji) => <button key={emoji} type="button" aria-label={`Inserir ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div>}</div><button type="button" className="live-icon-button" title="Anexar figurinha WebP" aria-label="Anexar figurinha WebP" onClick={() => stickerInput.current?.click()}><Sticker size={18} /></button>
              <div className="live-ai-wrap"><button type="button" className="live-icon-button ai" title="Assistência da LIA" aria-label="Assistência da LIA" aria-expanded={aiOpen} onClick={() => setAiOpen(!aiOpen)}><Sparkles size={18} /></button>{aiOpen && <div className="live-ai-menu"><button type="button" disabled={busy} onClick={() => { setAiOpen(false); void assist('suggest'); }}>Sugerir resposta</button><button type="button" disabled={busy || !reply.trim()} onClick={() => { setAiOpen(false); void assist('improve'); }}>Aprimorar meu texto</button></div>}</div>
              <span className="live-composer-hint">Enter envia · Shift+Enter pula linha</span><button type={reply.trim() ? 'submit' : 'button'} className="live-icon-button primary" disabled={busy} title={reply.trim() ? 'Enviar mensagem' : 'Gravar áudio'} aria-label={reply.trim() ? 'Enviar mensagem' : 'Gravar áudio'} onClick={reply.trim() ? undefined : () => void startRecording()}>{reply.trim() ? <Send size={18} /> : <Mic size={19} />}</button>
            </div></form>}
          </div>
          {stateOf(selected) === 'Humano assumiu' && <div className="live-session-actions"><button className="live-resume-button" disabled={busy || recording} onClick={() => { const historyReviewed = needsHistoryReview(selected); if (!historyReviewed || window.confirm('O histórico anterior do WhatsApp ainda não foi verificado. Você revisou o contexto e quer devolver esta conversa à LIA?')) void action('resume_ai', historyReviewed); }}><Sparkles size={15} /> Devolver à LIA</button><button className="live-close-button" disabled={busy || recording} onClick={() => void action('close_session')}><Square size={14} /> Encerrar atendimento</button></div>}
        </>}
      </div></> : <div className="live-empty">Selecione uma conversa.</div>}
    </section>
    <aside className={`live-context ${showContext ? 'open' : ''}`}><div className="live-context-title"><h2>Contato e contexto</h2><button className="live-context-close" onClick={() => setShowContext(false)}>Fechar</button>{selected && <button className="button button-outline" onClick={() => setEditing(!editing)}>{editing ? 'Cancelar' : 'Editar'}</button>}</div>
      {selected ? editing ? <form className="live-contact-form" onSubmit={saveContact}>
        <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>
        <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
        <label>Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} rows={4} /></label>
        <strong>Campos personalizados</strong>{fields.map((field, index) => <div className="live-custom-field" key={index}><input aria-label="Nome do campo" placeholder="Campo" value={field.key} maxLength={40} onChange={(event) => setFields(fields.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} /><input aria-label="Valor do campo" placeholder="Valor" value={field.value} maxLength={300} onChange={(event) => setFields(fields.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /><button type="button" onClick={() => setFields(fields.filter((_, i) => i !== index))}>Remover</button></div>)}
        {fields.length < 12 && <button type="button" className="button button-outline" onClick={() => setFields([...fields, { key: '', value: '' }])}>Adicionar campo</button>}<button className="button button-primary" disabled={busy}>Salvar contato</button>
      </form> : <><div className="live-context-item"><small>Contato</small><p>{displayName(selected)}<br />{phoneLabel(selected.phone)}{panel.email && <><br />{panel.email}</>}</p>{panel.notes && <p>{panel.notes}</p>}{Object.entries(panel.fields).map(([key, value]) => <p key={key}><b>{key}:</b> {value}</p>)}</div>
        <div className="live-context-item"><small>Resumo</small><p>{selected.conversation_summary || 'Ainda não há resumo registrado.'}</p></div><div className="live-context-item"><small>Perfil</small><p>{selected.profile || 'Não identificado'}</p></div>
        <div className="live-context-item"><small>Etiquetas</small><div className="live-tags">{selected.tags.length ? selected.tags.map((tag) => <span key={tag.id} style={{ borderColor: tag.color, color: tag.color }}>{tag.name}<button type="button" disabled={busy} aria-label={`Remover ${tag.name}`} title={`Remover ${tag.name}`} onClick={() => void setContactTag(tag, false)}><X size={12} /></button></span>) : 'Nenhuma etiqueta ativa'}</div><button type="button" className="live-add-tag" onClick={() => setTagPickerOpen(!tagPickerOpen)}><Plus size={14} /> Adicionar etiqueta</button>{tagPickerOpen && <div className="live-tag-picker">{availableTags.filter((tag) => !selected.tags.some((item) => item.id === tag.id)).map((tag) => <button type="button" key={tag.id} disabled={busy} onClick={() => void setContactTag(tag, true)}><span style={{ background: tag.color }} />{tag.name}</button>)}{availableTags.every((tag) => selected.tags.some((item) => item.id === tag.id)) && <small>Todas as etiquetas já foram adicionadas.</small>}</div>}</div>
        <div className="live-context-item"><small>Transferência</small><p>{selected.handoff?.reason || 'Nenhuma transferência registrada.'}</p>{selected.handoff?.assigned_to && <p><b>Responsável:</b> {selected.handoff.assigned_to}</p>}</div>
        <div className="live-context-item"><small>Critérios</small><p>{selected.qualification_data ? Object.entries(selected.qualification_data).filter(([, value]) => value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ') || 'Não informados' : 'Não informados'}</p></div></> : <div className="live-empty">Selecione uma conversa.</div>}
    </aside>
  </div>;
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowRight, Bell, BookOpen, Building2, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Headphones, Home, LogOut, MessageCircle, RefreshCw, Search, Settings, ShieldCheck, Sparkles, UserRound, Users, Wifi, WifiOff } from 'lucide-react';
import Inbox from './Inbox';
import ConnectionManager from './ConnectionManager';
import TagsManager from './TagsManager';
import KnowledgeManager from './KnowledgeManager';
import { InternalChat, OperationsManager } from './OperationsManager';
import { api, ApiError, dateTime, displayName, phoneLabel, rentalPriceLabel, stateOf, type ConversationDetail, type EventRow, type Operator, type OutboundAlert, type PropertyRow, type SessionRow } from './services/api';
import './live.css';

type Setup = { configured: boolean; missing: string[] };
type Connection = { instance: string; data: Record<string, unknown> };
const navigation = [
  { href: '/', label: 'Visão geral', icon: Home },
  { href: '/atendimentos', label: 'Atendimentos', icon: MessageCircle },
  { href: '/fila-humana', label: 'Fila humana', icon: Headphones },
  { href: '/leads', label: 'Leads', icon: UserRound },
  { href: '/imoveis', label: 'Imóveis', icon: Building2 },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/conexao', label: 'Conexão WhatsApp', icon: Wifi },
  { href: '/conhecimento', label: 'Conhecimento', icon: BookOpen },
  { href: '/equipes', label: 'Equipes e usuários', icon: Users },
  { href: '/chat-interno', label: 'Chat interno', icon: MessageCircle },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];
const pageTitle: Record<string, string> = Object.fromEntries(navigation.map(({ href, label }) => [href, label]));
const connectionState = (data?: Connection) => String((data?.data?.instance as Record<string, unknown> | undefined)?.state ?? data?.data?.state ?? 'Desconhecido');
const connectionIsOpen = (data?: Connection) => ['open', 'connected'].includes(connectionState(data).toLowerCase());
const today = () => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());

function App() {
  const [path, navigate] = useLocation();
  const [inviteTokens, setInviteTokens] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get('type') !== 'invite' || !params.get('access_token') || !params.get('refresh_token')) return null;
    const tokens = { accessToken: params.get('access_token')!, refreshToken: params.get('refresh_token')! };
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    return tokens;
  });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [routingReady, setRoutingReady] = useState(false);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [outboundAlerts, setOutboundAlerts] = useState<OutboundAlert[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showList, setShowList] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('eva-sidebar-collapsed') === 'true');
  useEffect(() => { window.localStorage.setItem('eva-sidebar-collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 6500); };
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const current = await api<Setup>('/setup');
        if (!alive) return;
        setSetup(current);
        if (current.configured && !inviteTokens) {
          try { const user = await api<{ operator: Operator | null }>('/auth/me'); if (alive && user.operator) setOperator(user.operator); }
          catch (error) { if (alive && error instanceof ApiError && error.status !== 401) setAuthError(error.message); }
        }
      } catch (error) { if (alive) setAuthError(error instanceof Error ? error.message : 'Falha na API'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api<{ conversations: SessionRow[] }>('/conversations'),
      api<{ properties: PropertyRow[] }>('/properties'),
      operator?.role === 'attendant' ? Promise.resolve({ events: [] as EventRow[], outbound: [] as OutboundAlert[] }) : api<{ events: EventRow[], outbound: OutboundAlert[] }>('/alerts'),
      api<Connection>('/connection'),
      api<{ operators: Operator[]; routingReady: boolean }>('/operators'),
    ]);
    const names = ['conversations', 'properties', 'alerts', 'connection', 'operators'];
    const nextErrors: Record<string, string> = {};
    results.forEach((result, index) => { if (result.status === 'rejected') nextErrors[names[index]] = result.reason instanceof Error ? result.reason.message : 'Falha ao carregar'; });
    setErrors(nextErrors);
    if (results[0].status === 'fulfilled') {
      const list = results[0].value.conversations;
      setSessions(list);
      setSelectedId((old) => old && list.some((session) => session.id === old) ? old : list[0]?.id ?? '');
    }
    if (results[1].status === 'fulfilled') setProperties(results[1].value.properties);
    if (results[2].status === 'fulfilled') { setEvents(results[2].value.events); setOutboundAlerts(results[2].value.outbound); }
    if (results[3].status === 'fulfilled') setConnection(results[3].value);
    if (results[4].status === 'fulfilled') { setOperators(results[4].value.operators); setRoutingReady(results[4].value.routingReady); }
  }, [operator]);

  useEffect(() => {
    if (!operator) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [operator, refresh]);

  const refreshDetail = useCallback(async (id: string) => {
    try { setDetail(await api<ConversationDetail>(`/conversations/${id}`)); }
    catch (error) { setDetail(null); flash(error instanceof Error ? error.message : 'Falha na conversa'); }
  }, []);
  useEffect(() => { if (operator && selectedId) void refreshDetail(selectedId); else setDetail(null); }, [operator, selectedId, refreshDetail]);
  useEffect(() => {
    if (!operator || !selectedId) return;
    const timer = window.setInterval(() => void refreshDetail(selectedId), 15000);
    return () => window.clearInterval(timer);
  }, [operator, selectedId, refreshDetail]);

  const selected = sessions.find((session) => session.id === selectedId);
  const activeCount = sessions.filter((session) => !session.closed_at).length;
  const queueCount = sessions.filter((session) => stateOf(session) === 'Aguardando atendimento').length;
  const humanCount = sessions.filter((session) => stateOf(session) === 'Humano assumiu').length;
  const evaCount = sessions.filter((session) => stateOf(session) === 'LIA ativa').length;

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setAuthError('');
    const form = new FormData(event.currentTarget);
    try { const result = await api<{ operator: Operator }>('/auth/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } }); setOperator(result.operator); }
    catch (error) { setAuthError(error instanceof Error ? error.message : 'Falha ao entrar'); }
    finally { setBusy(false); }
  }
  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inviteTokens) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== form.get('confirmPassword')) { setAuthError('As senhas não são iguais.'); return; }
    setBusy(true); setAuthError('');
    try {
      const result = await api<{ operator: Operator }>('/auth/accept-invite', { method: 'POST', body: { ...inviteTokens, password } });
      setOperator(result.operator); setInviteTokens(null);
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Falha ao aceitar convite'); }
    finally { setBusy(false); }
  }
  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); setOperator(null); setSessions([]); setDetail(null); navigate('/'); }
  async function action(kind: 'assume' | 'resume_ai' | 'close_session') {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/conversations/${selected.id}/${kind === 'assume' ? 'assume' : 'finish'}`, { method: 'POST', body: kind === 'assume' ? {} : { outcome: kind } });
      await Promise.all([refresh(), refreshDetail(selected.id)]);
      flash(kind === 'assume' ? 'Conversa assumida. LIA pausada.' : kind === 'resume_ai' ? 'Conversa devolvida à LIA.' : 'Conversa encerrada.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Ação não concluída'); }
    finally { setBusy(false); }
  }
  async function reconcile(item: OutboundAlert, status: 'sent' | 'failed') {
    if (operator?.role !== 'admin') return;
    const providerMessageId = status === 'sent' ? window.prompt('ID da mensagem confirmado na Evolution:')?.trim() : '';
    if (status === 'sent' && !providerMessageId) return;
    if (!window.confirm(status === 'sent' ? 'Confirma que esta mensagem foi enviada pela Evolution?' : 'Confirma que esta mensagem não foi enviada? Confira antes o histórico da Evolution e do WhatsApp.')) return;
    setBusy(true);
    try {
      await api(`/alerts/outbound/${item.id}/reconcile`, { method: 'POST', body: { status, providerMessageId } });
      await refresh();
      flash('Envio reconciliado.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha na reconciliação'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="live-gate"><span className="brand-mark"><span /><span /><span /></span><p>Carregando Aluga Mais…</p></div>;
  if (!setup) return <div className="live-gate"><AlertTriangle size={26} /><h1>API do painel indisponível</h1><p>{authError || 'Inicie o servidor da API para continuar.'}</p><button className="button button-primary" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
  if (!setup.configured) return <div className="live-gate"><ShieldCheck size={30} /><h1>Integração aguardando configuração</h1><p>O painel não mostra dados de exemplo. Configure as variáveis abaixo no servidor para acessar a operação real.</p><div className="live-missing">{setup.missing.map((name) => <code key={name}>{name}</code>)}</div><p>Veja <code>artifacts/api-server/.env.example</code>. As chaves ficam apenas no servidor.</p><button className="button button-primary" onClick={() => window.location.reload()}>Verificar novamente</button></div>;
  if (inviteTokens) return <div className="live-gate"><span className="brand-mark"><span /><span /><span /></span><h1>Seu acesso ao Aluga Mais</h1><p>Crie uma senha para concluir o convite e entrar na plataforma.</p><form className="live-login" onSubmit={acceptInvite}><label>Nova senha<input name="password" type="password" minLength={10} maxLength={128} required autoComplete="new-password" /></label><label>Confirmar senha<input name="confirmPassword" type="password" minLength={10} maxLength={128} required autoComplete="new-password" /></label><button className="button button-primary" disabled={busy}>{busy ? 'Concluindo…' : 'Criar senha e entrar'}</button></form>{authError && <p className="live-error">{authError}</p>}</div>;
  if (!operator) return <div className="live-gate"><span className="brand-mark"><span /><span /><span /></span><h1>Entrar no Aluga Mais</h1><p>Use uma conta do Supabase Auth autorizada como operador.</p><form className="live-login" onSubmit={login}><label>E-mail<input name="email" type="email" required autoComplete="username" /></label><label>Senha<input name="password" type="password" required autoComplete="current-password" /></label><button className="button button-primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button></form>{authError && <p className="live-error">{authError}</p>}</div>;

  return <div className="app-frame live-app">
    <aside className={`sidebar live-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}><div className="live-sidebar-header"><Link href="/" className="brand-lockup" aria-label="Aluga Mais"><span className="brand-mark"><span /><span /><span /></span><span><strong>Aluga Mais</strong><small>LOPES ALUGA · OPERAÇÃO</small></span></Link><button type="button" className="live-sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div><div className="side-label">ESPAÇO DE TRABALHO</div><div className="workspace-switch"><span className="workspace-bullet">L</span><span>Locação · Goiânia</span></div><nav className="side-nav" aria-label="Navegação principal">{navigation.filter((item) => operator.role !== 'attendant' || !['/alertas','/equipes'].includes(item.href)).map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={`nav-link ${path === href ? 'active' : ''}`} aria-label={label} title={sidebarCollapsed ? label : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{href === '/fila-humana' && queueCount > 0 && <span className="nav-badge">{queueCount}</span>}</Link>)}</nav><div className="live-sidebar-foot"><span>{operator.display_name}<small>{operator.role}</small></span><button onClick={logout} title="Sair" aria-label="Sair"><LogOut size={18} /></button></div></aside>
    <main className="main-content live-main"><div className="topbar"><span>Operação / <b>{pageTitle[path] ?? 'Aluga Mais'}</b></span><div className="live-top-actions"><span>{operator.display_name}</span><button className="icon-button" onClick={() => void refresh()} aria-label="Atualizar dados"><RefreshCw size={17} /></button></div></div>
      <div className={`live-content ${path === '/atendimentos' ? 'live-content-inbox' : ''}`}>{path !== '/atendimentos' && <div className="live-heading"><div><span className="eyebrow">PAINEL OPERACIONAL · DADOS REAIS</span><h1>{pageTitle[path] ?? 'Aluga Mais'}</h1><p>{today()} · Atualização automática a cada 15 segundos</p></div></div>}
      {path === '/' && <><p>Indicadores das conversas recentes, com uma sessão atual por contato.</p><div className="live-metrics"><Metric label="Conversas abertas" value={activeCount} icon={MessageCircle} onClick={() => navigate('/atendimentos')} /><Metric label="Com a LIA" value={evaCount} icon={Sparkles} onClick={() => navigate('/atendimentos')} /><Metric label="Aguardando humano" value={queueCount} icon={Clock3} onClick={() => navigate('/fila-humana')} /><Metric label="Assumidas" value={humanCount} icon={UserRound} onClick={() => navigate('/fila-humana')} /></div><div className="live-grid-two"><section className="live-card"><h2>Conversas recentes</h2>{errors.conversations ? <ErrorLine text={errors.conversations} /> : sessions.length ? sessions.slice(0, 8).map((session) => <button key={session.id} className="live-row" onClick={() => { setSelectedId(session.id); navigate('/atendimentos'); }}><span><b>{displayName(session)}</b><small>{phoneLabel(session.phone)}</small></span><State value={stateOf(session)} /><ArrowRight size={15} /></button>) : <Empty text="Nenhuma conversa encontrada." />}</section><section className="live-card"><h2>Saúde da operação</h2>{errors.connection ? <ErrorLine text={errors.connection} /> : <div className="live-health">{connectionIsOpen(connection ?? undefined) ? <Wifi /> : <WifiOff />}<span>Evolution: <b>{connectionState(connection ?? undefined)}</b><small>Instância {connection?.instance ?? '—'}</small></span></div>}<div className="live-health"><AlertTriangle /><span>Falhas registradas: <b>{events.length}</b><small>Eventos recentes do agente</small></span></div><button className="button button-outline" onClick={() => navigate('/alertas')}>Examinar alertas</button></section></div></>}
      {(path === '/atendimentos' || path === '/fila-humana') && <Inbox operator={operator} operators={operators} routingReady={routingReady} sessions={sessions} selected={selected} detail={detail} selectedId={selectedId} setSelectedId={setSelectedId} showList={showList} setShowList={setShowList} search={search} setSearch={setSearch} busy={busy} setBusy={setBusy} refresh={refresh} refreshDetail={refreshDetail} action={action} flash={flash} humanQueue={path === '/fila-humana'} error={errors.conversations} />}
      {path === '/leads' && <section className="live-card"><h2>Contatos e perfis</h2>{errors.conversations ? <ErrorLine text={errors.conversations} /> : sessions.length ? sessions.map((session) => <button className="live-row" key={session.id} onClick={() => { setSelectedId(session.id); navigate('/atendimentos'); }}><span><b>{displayName(session)}</b><small>{phoneLabel(session.phone)} · {session.profile || 'Perfil ainda não identificado'}</small></span><span className="live-tags">{session.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</span><ArrowRight size={15} /></button>) : <Empty text="Nenhum contato encontrado." />}</section>}
      {path === '/imoveis' && <><label className="live-search live-property-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar imóvel, bairro ou código" /></label>{errors.properties ? <ErrorLine text={errors.properties} /> : <div className="live-properties">{properties.filter((property) => `${property.title ?? ''} ${property.neighborhood ?? ''} ${property.code ?? ''} ${property.property_type ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map((property) => <article className="live-card live-property" key={property.id}><span className="eyebrow">{property.code || property.id}</span><h2>{property.title || property.property_type || 'Imóvel'}</h2><p>{[property.neighborhood, property.city].filter(Boolean).join(' · ')}</p><strong>{rentalPriceLabel(property)}</strong><small>{[property.area ? `${property.area} m²` : null, property.bedrooms ? `${property.bedrooms} quartos` : null, property.parking ? `${property.parking} vagas` : null].filter(Boolean).join(' · ')}</small>{property.url && <a href={property.url} target="_blank" rel="noopener noreferrer">Ver anúncio <ArrowRight size={14} /></a>}</article>)}</div>}{!errors.properties && properties.length === 0 && <Empty text="O catálogo não retornou imóveis." />}</>}
      {path === '/alertas' && <><section className="live-card"><h2>Envios que exigem conferência</h2><p>Antes de reconciliar, confira o histórico da Evolution ou do WhatsApp. Não reenvie automaticamente.</p>{errors.alerts ? <ErrorLine text={errors.alerts} /> : outboundAlerts.length ? outboundAlerts.map((item) => <div className="live-row" key={item.id}><AlertTriangle size={18} /><span><b>{item.status === 'uncertain' ? 'Sem confirmação' : 'Aguardando confirmação'}</b><small>{item.body} · {dateTime(item.created_at)}</small></span>{operator.role === 'admin' && <span className="live-action-row"><button className="button button-outline" disabled={busy} onClick={() => void reconcile(item, 'sent')}>Foi enviado</button><button className="button button-outline" disabled={busy} onClick={() => void reconcile(item, 'failed')}>Não foi enviado</button></span>}</div>) : <Empty text="Nenhum envio pendente de conferência." />}</section><section className="live-card"><h2>Falhas registradas pelo agente</h2><p>Eventos reais com <code>success=false</code>.</p>{errors.alerts ? <ErrorLine text={errors.alerts} /> : events.length ? events.map((event) => <div className="live-row" key={event.id}><AlertTriangle size={18} /><span><b>{event.event_type}</b><small>{event.error_message || event.tool_name || 'Sem detalhe de erro'} · {dateTime(event.created_at)}</small></span></div>) : <Empty text="Nenhuma falha recente registrada." />}</section></>}
      {path === '/conexao' && <ConnectionManager operator={operator} flash={flash} />}
      {path === '/conhecimento' && <KnowledgeManager operator={operator} flash={flash} />}
      {path === '/equipes' && operator.role !== 'attendant' && <OperationsManager operator={operator} flash={flash} />}
      {path === '/chat-interno' && <InternalChat operator={operator} flash={flash} />}
      {path === '/configuracoes' && <div className="live-settings-stack"><ProfileSettings operator={operator} routingReady={routingReady} onUpdate={setOperator} flash={flash} /><TagsManager flash={flash} onChange={refresh} /></div>}
      {!pageTitle[path] && <section className="live-card"><CircleHelp /><h2>Página não encontrada</h2><Link href="/">Voltar à visão geral</Link></section>}
      </div>
    </main>
    <nav className="live-mobile-nav" aria-label="Navegação móvel">{navigation.filter((item) => operator.role !== 'attendant' || !['/alertas','/equipes'].includes(item.href)).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href ? 'active' : ''}><Icon size={17} /><span>{label}</span></Link>)}</nav>
    {notice && <div className="live-toast" role="status"><Check size={16} />{notice}</div>}
  </div>;
}

function Metric({ label, value, icon: Icon, onClick }: { label: string; value: number; icon: typeof Home; onClick: () => void }) { return <button className="live-card live-metric" onClick={onClick}><Icon size={21} /><span>{label}</span><strong>{value}</strong></button>; }
function State({ value }: { value: string }) { return <span className={`live-state ${value === 'LIA ativa' ? 'ai' : value === 'Humano assumiu' ? 'human' : value === 'Aguardando atendimento' ? 'queue' : ''}`}>{value}</span>; }
function Empty({ text }: { text: string }) { return <div className="live-empty">{text}</div>; }
function ErrorLine({ text }: { text: string }) { return <div className="live-error"><AlertTriangle size={16} />{text}</div>; }
function ProfileSettings({ operator, routingReady, onUpdate, flash }: { operator: Operator; routingReady: boolean; onUpdate: (operator: Operator) => void; flash: (message: string) => void }) {
  const [signature, setSignature] = useState(operator.signature || operator.display_name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setSignature(operator.signature || operator.display_name), [operator.signature, operator.display_name]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { const result = await api<{ operator: Operator }>('/operators/me', { method: 'PATCH', body: { signature } }); onUpdate(result.operator); flash('Assinatura salva.'); }
    catch (issue) { flash(issue instanceof Error ? issue.message : 'Falha ao salvar assinatura'); }
    finally { setSaving(false); }
  }
  return <section className="live-card live-profile-settings"><h2>Seu perfil de atendimento</h2><p>Essa assinatura aparece no WhatsApp antes de cada mensagem de texto que você enviar pelo painel. Sua foto continua restrita ao perfil interno.</p>{!routingReady && <p className="live-error">A configuração da assinatura ficará disponível após a migração do banco operacional.</p>}<form onSubmit={save}><label>Assinatura<input value={signature} maxLength={80} onChange={(event) => setSignature(event.target.value)} placeholder={operator.display_name} disabled={!routingReady} /></label><div className="live-signature-preview"><small>Prévia para o cliente</small><strong>{(signature.trim() || operator.display_name).replace(/:$/, '')}:</strong><span>Mensagem aqui</span></div><button className="button button-primary" disabled={saving || !routingReady}>{saving ? 'Salvando…' : 'Salvar assinatura'}</button></form></section>;
}
export default App;

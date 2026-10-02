import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, AlertCircle, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Bell, Building2, Check, CheckCheck, CheckCircle2, ChevronDown, CircleHelp, Clock3, FileText, Filter, Headphones, Home, Inbox, LayoutGrid, List, Menu, MessageCircle, MoreHorizontal, Paperclip, Pause, Play, Plus, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, Users, Wifi, WifiOff, X } from 'lucide-react';
import type { Contact, Incident, Message, Property } from './services/contracts';
import { demoServices } from './services/demo-service';
import { operators, properties, seedContacts, seedIncidents, seedMessages } from './mocks/data';

const nav = [
  { label: 'Visão geral', href: '/', icon: Home },
  { label: 'Atendimentos', href: '/atendimentos', icon: MessageCircle, badge: '5' },
  { label: 'Fila humana', href: '/fila-humana', icon: Headphones, badge: '2' },
  { label: 'Leads / CRM', href: '/leads', icon: LayoutGrid },
  { label: 'Imóveis', href: '/imoveis', icon: Building2 },
  { label: 'Alertas', href: '/alertas', icon: Bell, badge: '3' },
];
const secondaryNav = [
  { label: 'Conexão WhatsApp', href: '/conexao', icon: Wifi },
  { label: 'Relatórios', href: '/relatorios', icon: BarChart3 },
  { label: 'Equipe', href: '/equipe', icon: Users },
  { label: 'Configurações', href: '/configuracoes', icon: Settings2 },
];
const titles: Record<string, [string, string]> = {
  '/': ['Visão geral', 'A operação de hoje, em um só lugar.'],
  '/atendimentos': ['Atendimentos', 'Acompanhe cada conversa, do primeiro oi ao próximo passo.'],
  '/fila-humana': ['Fila humana', 'Chamados que pedem atenção da equipe.'],
  '/leads': ['Leads / CRM', 'Organize oportunidades sem confundir estágio comercial com estado da Eva.'],
  '/imoveis': ['Imóveis', 'Catálogo de referência para conversas e interesses.'],
  '/alertas': ['Alertas', 'Sinais que merecem contexto antes de qualquer ação.'],
  '/conexao': ['Conexão WhatsApp', 'Estado ilustrativo da conexão operacional.'],
  '/relatorios': ['Relatórios', 'Leitura operacional do período de demonstração.'],
  '/equipe': ['Equipe', 'Distribuição de atendimentos e papéis da operação.'],
  '/configuracoes': ['Configurações', 'Preferências e regras visuais da operação.'],
};
const pageFor = (path: string) => titles[path] ?? ['Visão geral', 'A operação de hoje, em um só lugar.'];
const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');
const classForState = (state: string) => state === 'Eva ativa' ? 'state-ai' : state === 'Aguardando atendimento' ? 'state-warn' : state === 'Humano assumiu' ? 'state-human' : state === 'Encerrada' ? 'state-neutral' : '';

function App() {
  const [path, setPath] = useLocation();
  const [contacts, setContacts] = useState<Contact[]>(seedContacts);
  const [messages, setMessages] = useState<Record<string, Message[]>>(seedMessages);
  const [incidents, setIncidents] = useState<Incident[]>(seedIncidents);
  const [activeId, setActiveId] = useState('c1');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [mobilePane, setMobilePane] = useState<'list' | 'chat' | 'context'>('list');
  const [filterState, setFilterState] = useState('Todas');
  const [showContext, setShowContext] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [leadView, setLeadView] = useState<'kanban' | 'lista'>('kanban');
  const [leadFilter, setLeadFilter] = useState('Todos os leads');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const active = contacts.find((person) => person.id === activeId) ?? contacts[0];
  const currentMessages = messages[active.id] ?? [];
  const page = pageFor(path);
  const filteredContacts = useMemo(() => contacts.filter((person) => {
    const matchesQuery = `${person.name} ${person.preview} ${person.tag}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    const matchesState = filterState === 'Todas' || person.state === filterState;
    return matchesQuery && matchesState;
  }), [contacts, filterState, query]);
  const toast = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3200); };
  const updateContact = (id: string, patch: Partial<Contact>) => setContacts((old) => old.map((item) => item.id === id ? { ...item, ...patch } : item));
  const assume = async () => {
    if (active.state === 'Humano assumiu') { toast(`Conversa já está com ${active.owner ?? 'a equipe'}.`); return; }
    setBusy(true);
    await demoServices.assume(active.id, 'Marina Costa');
    updateContact(active.id, { state: 'Humano assumiu', owner: 'Marina Costa', tag: 'Em atendimento' });
    setBusy(false);
    toast('Você assumiu a conversa. Eva pausada neste atendimento (demo).');
  };
  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!replyText.trim()) return;
    if (active.state !== 'Humano assumiu') { toast('Assuma a conversa para responder como atendente.'); return; }
    setBusy(true);
    const result = await demoServices.reply(active.id, replyText.trim());
    result.text = replyText.trim();
    setMessages((old) => ({ ...old, [active.id]: [...(old[active.id] ?? []), result] }));
    setReplyText('');
    setBusy(false);
    toast('Resposta adicionada ao histórico local de demonstração.');
  };
  const returnEva = async () => {
    await demoServices.returnToEva(active.id);
    updateContact(active.id, { state: 'Eva ativa', owner: undefined, tag: active.tag === 'Em atendimento' ? 'Novo lead' : active.tag });
    setMessages((old) => ({ ...old, [active.id]: [...(old[active.id] ?? []), { id: `sys-${Date.now()}`, kind: 'system', text: 'Atendimento devolvido à Eva · demonstração', time: 'agora' }] }));
    toast('Eva voltou a conduzir esta conversa (demo).');
  };

  return (
    <div className="app-frame">
      {mobileNavOpen && <button className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Fechar navegação" data-testid="button-close-navigation" />}
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
        <Link href="/" className="brand-lockup" data-testid="link-brand" onClick={() => setMobileNavOpen(false)}>
          <span className="brand-mark"><span /><span /><span /></span>
          <span><strong>Painel Eva</strong><small>LOPES ALUGA · OPERAÇÃO</small></span>
        </Link>
        <div className="side-label">ESPAÇO DE TRABALHO</div>
        <div className="workspace-switch"><span className="workspace-bullet">L</span><span>Locação · São Paulo</span><ChevronDown size={15} /></div>
        <nav className="side-nav" aria-label="Navegação principal">
          {nav.map(({ label, href, icon: Icon, badge }) => (
            <Link key={href} href={href} onClick={() => setMobileNavOpen(false)} className={`nav-link ${path === href ? 'active' : ''}`} data-testid={`link-nav-${href.replace('/', '') || 'inicio'}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{badge && <span className="nav-badge">{badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="side-label side-label-lower">GESTÃO</div>
        <nav className="side-nav">
          {secondaryNav.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobileNavOpen(false)} className={`nav-link ${path === href ? 'active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-spacer" />
        <div className="demo-rail"><span className="rail-dot" /><span><b>Ambiente de demonstração</b><small>Dados locais · sem conexão externa</small></span></div>
        <button className="profile-chip" onClick={() => toast('Perfil de demonstração · permissões não aplicadas.')} data-testid="button-profile">
          <span className="avatar avatar-sm avatar-lilac">MC</span><span><b>Marina Costa</b><small>Atendente · demonstração</small></span><MoreHorizontal size={17} />
        </button>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Abrir navegação" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)} data-testid="button-mobile-menu"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Operação</span><span className="crumb-slash">/</span><strong>{page[0]}</strong></div>
          <label className="global-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversa, lead ou imóvel..." aria-label="Busca global" data-testid="input-global-search" /><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <span className="top-status"><span className="status-dot status-red" />WhatsApp desconectado</span>
            <button className="icon-button notification-button" aria-label="Abrir alertas" onClick={() => setPath('/alertas')} data-testid="button-open-alerts"><Bell size={18} /><i>3</i></button>
            <span className="avatar avatar-sm avatar-blue">MC</span>
          </div>
        </header>
        <section className={`page-area ${path === '/atendimentos' ? 'page-inbox' : ''}`}>
          {path === '/' && <Overview setPath={setPath} toast={toast} />}
          {path === '/atendimentos' && <InboxPage contacts={filteredContacts} allContacts={contacts} active={active} setActive={(id) => { setActiveId(id); setMobilePane('chat'); }} messages={currentMessages} stateFilter={filterState} setStateFilter={setFilterState} mobilePane={mobilePane} setMobilePane={setMobilePane} showContext={showContext} setShowContext={setShowContext} assume={assume} returnEva={returnEva} sendReply={sendReply} replyText={replyText} setReplyText={setReplyText} busy={busy} updateContact={updateContact} toast={toast} addInternalNote={(text) => setMessages((old) => ({ ...old, [active.id]: [...(old[active.id] ?? []), { id: `note-${Date.now()}`, kind: 'system', text: `Nota interna · Marina: ${text}`, time: 'agora' }] }))} />}
          {path === '/fila-humana' && <QueuePage contacts={contacts} setActive={(id) => { setActiveId(id); setPath('/atendimentos'); }} updateContact={updateContact} toast={toast} />}
          {path === '/leads' && <LeadsPage contacts={contacts} setActive={(id) => { setActiveId(id); setPath('/atendimentos'); }} view={leadView} setView={setLeadView} filter={leadFilter} setFilter={setLeadFilter} />}
          {path === '/imoveis' && <PropertiesPage filter={propertyFilter} setFilter={setPropertyFilter} toast={toast} />}
          {path === '/alertas' && <AlertsPage incidents={incidents} setIncidents={setIncidents} selected={selectedIncident} setSelected={setSelectedIncident} toast={toast} />}
          {path === '/conexao' && <ConnectionPage toast={toast} />}
          {path === '/relatorios' && <ReportsPage />}
          {path === '/equipe' && <TeamPage toast={toast} />}
          {path === '/configuracoes' && <SettingsPage toast={toast} />}
          {!titles[path] && <Overview setPath={setPath} toast={toast} />}
        </section>
      </main>
      {notice && <div className="toast-message" role="status" data-testid="status-toast"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fechar aviso" data-testid="button-close-toast"><X size={16} /></button></div>}
    </div>
  );
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />PAINEL OPERACIONAL <span className="sample-note">DADOS DE EXEMPLO</span></div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function SampleStamp() { return <span className="sample-stamp"><span className="sample-dot" />Demonstração · dados fictícios</span>; }
function Metric({ label, value, note, icon: Icon, tone, onClick, testId }: { label: string; value: string; note: string; icon: typeof Activity; tone: string; onClick?: () => void; testId: string }) {
  return <button className={`metric-card ${onClick ? 'metric-clickable' : ''}`} onClick={onClick} data-testid={testId}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={18} /></span></div><strong>{value}</strong><small>{note}</small></button>;
}
function Overview({ setPath, toast }: { setPath: (path: string) => void; toast: (message: string) => void }) {
  return <div className="content-wrap"><PageHeading title="Bom dia, Marina." subtitle="Terça-feira, 18 de junho · Um retrato da operação neste momento." action={<button className="button button-secondary" onClick={() => toast('Visão atualizada com os dados locais da demonstração.')} data-testid="button-refresh-overview"><Activity size={16} /> Atualizar visão</button>} />
    <div className="overview-banner"><div className="banner-symbol"><WifiOff size={20} /></div><div><b>Instância WhatsApp desconectada</b><span>O estado é ilustrativo. Mensagens podem ficar sem confirmação até a conexão voltar.</span></div><Link href="/conexao" className="banner-link" data-testid="link-connection-banner">Ver conexão <ArrowRight size={15} /></Link><span className="banner-time">verificado há 2 min</span></div>
    <div className="metric-grid">
      <Metric label="Com Eva" value="18" note="conversas em andamento" icon={Sparkles} tone="tone-violet" onClick={() => setPath('/atendimentos')} testId="metric-eva" />
      <Metric label="Com atendimento humano" value="06" note="3 atendentes ativos" icon={UserRound} tone="tone-blue" onClick={() => setPath('/atendimentos')} testId="metric-human" />
      <Metric label="Aguardando na fila" value="02" note="1 chamado acima do prazo" icon={Headphones} tone="tone-amber" onClick={() => setPath('/fila-humana')} testId="metric-queue" />
      <Metric label="Incidentes abertos" value="03" note="1 sinal crítico" icon={AlertCircle} tone="tone-red" onClick={() => setPath('/alertas')} testId="metric-incidents" />
    </div>
    <div className="overview-lower">
      <section className="panel volume-panel"><div className="panel-heading"><div><h2>Ritmo de atendimento</h2><p>Conversas iniciadas nos últimos 7 dias</p></div><button className="select-like" onClick={() => toast('Período: últimos 7 dias.')} data-testid="button-volume-range">7 dias <ChevronDown size={14} /></button></div>
        <div className="volume-chart" aria-label="Gráfico de conversas por dia"><div className="chart-ylabels"><span>40</span><span>30</span><span>20</span><span>10</span><span>0</span></div><div className="chart-area"><div className="chart-gridlines"><i /><i /><i /><i /><i /></div><div className="chart-bars">{[24, 31, 22, 36, 29, 38, 26].map((num, index) => <div className="bar-column" key={index}><span className="bar-number">{num}</span><span className="bar" style={{ height: `${num * 2.2}px` }} /><small>{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][index]}</small></div>)}</div></div></div>
        <div className="chart-footer"><span><i className="legend-dot legend-violet" />Conversas recebidas</span><span><i className="legend-dot legend-blue" />24 handoffs para equipe</span><span className="chart-caption">Volume fictício</span></div>
      </section>
      <section className="panel attention-panel"><div className="panel-heading"><div><h2>Precisa de atenção</h2><p>Próximas ações sugeridas</p></div><button className="icon-button" onClick={() => setPath('/alertas')} aria-label="Ver todos os alertas" data-testid="button-attention-more"><ArrowRight size={17} /></button></div>
        <button className="attention-row" onClick={() => setPath('/alertas')} data-testid="attention-row-connection"><span className="attention-icon attention-danger"><WifiOff size={17} /></span><span className="attention-copy"><b>WhatsApp sem resposta</b><small>Instância principal · 09:42</small></span><span className="mini-severity">Crítico</span></button>
        <button className="attention-row" onClick={() => setPath('/fila-humana')} data-testid="attention-row-queue"><span className="attention-icon attention-warn"><Clock3 size={17} /></span><span className="attention-copy"><b>Chamado perto do prazo</b><small>Rafael Siqueira · há 3 min</small></span><ArrowRight size={16} /></button>
        <button className="attention-row" onClick={() => setPath('/alertas')} data-testid="attention-row-buffer"><span className="attention-icon attention-info"><MessageCircle size={17} /></span><span className="attention-copy"><b>Confirmação de envio pendente</b><small>André Luiz · há 14 min</small></span><ArrowRight size={16} /></button>
        <Link href="/alertas" className="text-link attention-link" data-testid="link-all-alerts">Abrir central de alertas <ArrowRight size={15} /></Link>
      </section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Conversas recentes</h2><p>Entradas mais recentes na operação</p></div><Link href="/atendimentos" className="text-link" data-testid="link-see-inbox">Ver todas <ArrowRight size={15} /></Link></div><div className="recent-table"><div className="recent-head"><span>CONTATO</span><span>ESTADO</span><span>ÚLTIMA MENSAGEM</span><span>ESPERA</span></div>{seedContacts.slice(0, 4).map((contact) => <button className="recent-row" key={contact.id} onClick={() => setPath('/atendimentos')} data-testid={`row-recent-${contact.id}`}><span className="recent-person"><span className={`avatar avatar-sm ${contact.id === 'c2' ? 'avatar-peach' : 'avatar-blue'}`}>{contact.initials}</span><b>{contact.name}</b></span><StatePill state={contact.state} /><span className="recent-preview">{contact.preview}</span><span className="recent-time">{contact.time}</span></button>)}</div></section>
    <div className="overview-footnote"><ShieldCheck size={15} /> Indicadores operacionais fictícios. Nenhuma mensagem ou métrica representa dados reais.</div>
  </div>;
}
function StatePill({ state }: { state: string }) { const Icon = state === 'Eva ativa' ? Sparkles : state === 'Aguardando atendimento' ? Clock3 : state === 'Humano assumiu' ? UserRound : Check; return <span className={`state-pill ${classForState(state)}`}><Icon size={13} />{state}</span>; }
function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }

function InboxPage(props: { contacts: Contact[]; allContacts: Contact[]; active: Contact; setActive: (id: string) => void; messages: Message[]; stateFilter: string; setStateFilter: (value: string) => void; mobilePane: 'list' | 'chat' | 'context'; setMobilePane: (value: 'list' | 'chat' | 'context') => void; showContext: boolean; setShowContext: (value: boolean) => void; assume: () => void; returnEva: () => void; sendReply: (event: FormEvent) => void; replyText: string; setReplyText: (text: string) => void; busy: boolean; updateContact: (id: string, patch: Partial<Contact>) => void; toast: (text: string) => void; addInternalNote: (text: string) => void }) {
  const { contacts, allContacts, active, setActive, messages, stateFilter, setStateFilter, mobilePane, setMobilePane, showContext, setShowContext, assume, returnEva, sendReply, replyText, setReplyText, busy, updateContact, toast, addInternalNote } = props;
  const [listSearch, setListSearch] = useState('');
  const [filterMenu, setFilterMenu] = useState(false);
  const [internalNote, setInternalNote] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const list = contacts.filter((person) => `${person.name} ${person.preview}`.toLocaleLowerCase('pt-BR').includes(listSearch.toLocaleLowerCase('pt-BR')));
  const handleComposerSubmit = (event: FormEvent) => {
    if (!internalNote) { sendReply(event); return; }
    event.preventDefault();
    if (replyText.trim()) {
      addInternalNote(replyText.trim());
      setReplyText('');
      setInternalNote(false);
      toast('Nota interna adicionada ao histórico local; ela não foi enviada ao cliente.');
    }
  };
  return <div className={`inbox-layout mobile-${mobilePane}`}>
    <aside className="inbox-list">
      <div className="inbox-list-head"><div><h1>Atendimentos</h1><p><span className="live-pip" />5 conversas ativas</p></div><button className="icon-button" aria-label="Mais opções" onClick={() => toast('Opções da caixa de entrada de demonstração.')} data-testid="button-inbox-more"><MoreHorizontal size={18} /></button></div>
      <label className="inbox-search"><Search size={16} /><input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Buscar conversa" aria-label="Buscar conversa" data-testid="input-conversation-search" /><button type="button" onClick={() => setFilterMenu(!filterMenu)} aria-label="Filtrar conversas" data-testid="button-conversation-filter"><SlidersHorizontal size={16} /></button></label>
      {filterMenu && <div className="filter-menu" data-testid="menu-conversation-filter">{['Todas', 'Eva ativa', 'Aguardando atendimento', 'Humano assumiu'].map((filter) => <button key={filter} className={stateFilter === filter ? 'selected' : ''} onClick={() => { setStateFilter(filter); setFilterMenu(false); }} data-testid={`filter-${filter.toLowerCase().replaceAll(' ', '-')}`}>{filter}<span>{filter === 'Todas' ? allContacts.length : allContacts.filter((person) => person.state === filter).length}</span></button>)}</div>}
      <div className="inbox-tabs"><button className={stateFilter === 'Todas' ? 'selected' : ''} onClick={() => setStateFilter('Todas')} data-testid="tab-all-conversations">Todas <span>{allContacts.length}</span></button><button className={stateFilter === 'Aguardando atendimento' ? 'selected' : ''} onClick={() => setStateFilter('Aguardando atendimento')} data-testid="tab-pending-conversations">Fila <span>{allContacts.filter((p) => p.state === 'Aguardando atendimento').length}</span></button><button className={stateFilter === 'Humano assumiu' ? 'selected' : ''} onClick={() => setStateFilter('Humano assumiu')} data-testid="tab-human-conversations">Comigo <span>{allContacts.filter((p) => p.state === 'Humano assumiu').length}</span></button></div>
      <div className="inbox-items">{list.map((person) => <button className={`conversation-item ${active.id === person.id ? 'selected' : ''}`} onClick={() => { setActive(person.id); setMobilePane('chat'); }} key={person.id} data-testid={`conversation-${person.id}`}>
        <span className={`avatar avatar-md ${person.priority === 'Urgente' ? 'avatar-peach' : person.id === 'c3' ? 'avatar-mint' : 'avatar-blue'}`}>{person.initials}</span><span className="conversation-main"><span className="conversation-name"><b>{person.name}</b><time>{person.time}</time></span><span className="conversation-preview">{person.preview}</span><span className="conversation-meta"><StatePill state={person.state} />{person.unread > 0 && <i className="unread-count">{person.unread}</i>}</span></span></button>)}
        {list.length === 0 && <div className="empty-list"><Search size={21} /><b>Nenhuma conversa encontrada</b><span>Ajuste a busca ou o filtro.</span></div>}</div>
      <div className="list-footer"><span>Dados locais de exemplo</span><button onClick={() => { setListSearch(''); setStateFilter('Todas'); }} data-testid="button-clear-filters">Limpar filtros</button></div>
    </aside>
    <section className="conversation-panel">
      <header className="conversation-header"><button className="mobile-back icon-button" onClick={() => setMobilePane('list')} aria-label="Voltar à lista" data-testid="button-back-list"><ArrowLeft size={18} /></button><span className="avatar avatar-md avatar-blue">{active.initials}</span><div className="conversation-heading"><b>{active.name}</b><span>{active.phone} <i /> <span className="contact-wa">WhatsApp · demonstração</span></span></div><StatePill state={active.state} /><div className="header-spacer" /><button className="icon-button header-action-hide" aria-label="Buscar na conversa" onClick={() => toast('Busca em mensagens disponível na integração futura.')} data-testid="button-search-thread"><Search size={17} /></button><button className="icon-button" aria-label="Alternar contexto" onClick={() => { setShowContext(!showContext); setMobilePane('context'); }} data-testid="button-toggle-context"><MoreHorizontal size={18} /></button></header>
      <div className="thread-status"><span className={`status-mini ${active.state === 'Eva ativa' ? 'status-mini-ai' : 'status-mini-human'}`}>{active.state === 'Eva ativa' ? <Sparkles size={14} /> : active.state === 'Humano assumiu' ? <UserRound size={14} /> : <Clock3 size={14} />}</span><span><b>{active.state}</b><small>{active.state === 'Eva ativa' ? 'Eva está conduzindo este atendimento' : active.state === 'Humano assumiu' ? `Eva pausada · ${active.owner ?? 'atendimento humano'}` : 'Na fila de atendimento humano'}</small></span><button onClick={() => toast('Registro de estado local para demonstração.')} data-testid="button-thread-info">Histórico <ArrowRight size={13} /></button></div>
      <div className="message-scroll" data-testid="conversation-messages"><div className="day-divider"><span>HOJE · 18 DE JUNHO</span></div>{messages.map((message) => <MessageBubble message={message} key={message.id} />)}<div className="thread-endnote">Este histórico é fictício e não foi enviado a um canal externo.</div></div>
      {active.state !== 'Humano assumiu' && <div className="takeover-prompt"><span className="takeover-symbol"><Pause size={15} /></span><span><b>Quer responder pessoalmente?</b><small>Assumir pausa a Eva nesta conversa.</small></span><button className="button button-primary button-sm" onClick={assume} disabled={busy} data-testid="button-assume-conversation">{busy ? 'Aguarde...' : 'Assumir'}</button></div>}
      {active.state === 'Humano assumiu' && <form className={`reply-composer ${internalNote ? 'composer-note-mode' : ''}`} onSubmit={handleComposerSubmit} data-testid="form-human-reply"><div className="composer-tools"><button type="button" aria-label="Anexar arquivo" onClick={() => toast('Anexos são apenas ilustrativos nesta demonstração.')} data-testid="button-attach"><Paperclip size={17} /></button><span className="human-active"><span /> Eva pausada · respondendo como Marina</span><button type="button" className="internal-note" onClick={() => { setInternalNote((value) => !value); setReplyText(''); }} data-testid="button-internal-note"><FileText size={15} /> {internalNote ? 'Cancelar nota' : 'Nota interna'}</button></div><div className="composer-input-wrap"><textarea aria-label={internalNote ? 'Nota interna' : 'Resposta humana'} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={internalNote ? 'Escreva uma nota visível apenas para a equipe...' : 'Escreva uma resposta...'} rows={1} data-testid="input-human-reply" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="send-button" disabled={busy || !replyText.trim()} aria-label={internalNote ? 'Adicionar nota interna' : 'Enviar resposta'} data-testid="button-send-reply">{internalNote ? <Check size={17} /> : <Send size={17} />}</button></div><div className="composer-foot"><span>{internalNote ? 'Visível somente no histórico interno' : 'Enter para enviar · Shift + Enter para nova linha'}</span><span>{internalNote ? 'Não será enviada ao cliente' : 'Envio não equivale a confirmação de entrega'}</span></div></form>}
      {active.state === 'Aguardando atendimento' && <div className="queue-wait-note"><Clock3 size={15} /> Cliente aguarda atendimento humano. Assuma para responder.</div>}
    </section>
    {showContext && <aside className="context-panel"><div className="context-head"><div><span className="eyebrow">CONTEXTO</span><button className="context-close icon-button" onClick={() => { setShowContext(false); setMobilePane('chat'); }} aria-label="Fechar contexto" data-testid="button-close-context"><X size={17} /></button></div><h3>Sobre a conversa</h3></div>
      <div className="profile-summary"><span className="avatar avatar-lg avatar-lilac">{active.initials}</span><div><b>{active.name}</b><span>{active.phone}</span><small>Contato de demonstração</small></div></div>
      <div className="context-group"><div className="context-label">ESTADO DO ATENDIMENTO</div><StatePill state={active.state} />{active.owner && <div className="context-owner"><span className="avatar avatar-sm avatar-mint">{initials(active.owner)}</span><span><small>Responsável</small><b>{active.owner}</b></span><button aria-label="Atribuir responsável" onClick={() => setAssignmentOpen(!assignmentOpen)} data-testid="button-assign-context"><ChevronDown size={15} /></button></div>}
        {!active.owner && <button className="assign-inline" onClick={() => setAssignmentOpen(!assignmentOpen)} data-testid="button-assign-context"><UserRound size={14} /> Atribuir responsável <ChevronDown size={14} /></button>}
        {assignmentOpen && <div className="assignment-menu" data-testid="menu-assign-context">{operators.map((operator) => <button key={operator.id} onClick={() => { updateContact(active.id, { owner: operator.name }); setAssignmentOpen(false); toast(`${active.name} atribuído a ${operator.name} nesta demonstração.`); }} data-testid={`assign-${operator.id}`}><span className="avatar avatar-xs avatar-lilac">{operator.initials}</span><span>{operator.name}</span><small>{operator.load} atendimentos</small></button>)}</div>}
        {active.state === 'Humano assumiu' ? <button className="button button-outline context-full-button" onClick={returnEva} data-testid="button-return-eva"><Sparkles size={15} /> Devolver à Eva</button> : <button className="button button-outline context-full-button" onClick={assume} data-testid="button-assume-context"><UserRound size={15} /> Assumir atendimento</button>}
        <button className="text-button context-end" onClick={() => { updateContact(active.id, { state: 'Encerrada' }); toast('Conversa encerrada localmente na demonstração.'); }} data-testid="button-close-conversation">Encerrar conversa <Check size={14} /></button>
      </div>
      <div className="context-group"><div className="context-label">ETIQUETAS <button className="tiny-add" onClick={() => toast('Etiquetas são gerenciáveis na integração futura.')} aria-label="Adicionar etiqueta" data-testid="button-add-tag"><Plus size={13} /></button></div><div className="tag-list"><Tag tone="tag-blue">{active.tag}</Tag><Tag tone="tag-violet">{active.priority}</Tag><Tag tone="tag-soft">Locação</Tag></div></div>
      <div className="context-group"><div className="context-label">RESUMO DE BUSCA</div><p className="context-description">{active.summary}</p><div className="criteria-pills"><span>2 quartos</span><span>Saúde</span><span>Aceita pet</span></div></div>
      <div className="context-group"><div className="context-label">IMÓVEIS APRESENTADOS <span>1</span></div><div className="mini-property"><div className="mini-property-art"><Building2 size={20} /></div><div><b>LA-2048 · Saúde</b><small>R$ 2.850/mês · 68 m²</small><span><CheckCheck size={12} /> Apresentado pela Eva</span></div></div></div>
      <div className="context-group"><div className="context-label">HISTÓRICO DE HANDOFF</div><div className="history-line"><span className="history-dot" /><span><b>{active.state === 'Humano assumiu' ? 'Assumido por Marina' : 'Eva conduzindo'}</b><small>Hoje, 09:12 · demonstração</small></span></div></div>
      <button className="text-link context-audit" onClick={() => toast('Registro de auditoria fictício para demonstração.')} data-testid="button-view-history">Ver histórico completo <ArrowRight size={14} /></button>
    </aside>}
    {!showContext && <button className="context-reopen" onClick={() => setShowContext(true)} data-testid="button-reopen-context">Ver contexto <ArrowRight size={14} /></button>}
    <div className="mobile-pane-nav"><button className={mobilePane === 'list' ? 'active' : ''} onClick={() => setMobilePane('list')} data-testid="mobile-tab-list"><Inbox size={17} />Conversas</button><button className={mobilePane === 'chat' ? 'active' : ''} onClick={() => setMobilePane('chat')} data-testid="mobile-tab-chat"><MessageCircle size={17} />Atendimento</button><button className={mobilePane === 'context' ? 'active' : ''} onClick={() => { setShowContext(true); setMobilePane('context'); }} data-testid="mobile-tab-context"><FileText size={17} />Contexto</button></div>
  </div>;
}
function MessageBubble({ message }: { message: Message }) {
  if (message.kind === 'system') return <div className="system-message"><span className="system-line" /><span>{message.text}</span><span className="system-line" /></div>;
  const label = message.kind === 'client' ? 'Cliente' : message.kind === 'eva' ? 'Eva · assistente' : 'Marina · atendente';
  return <div className={`message-row message-${message.kind}`}><div className="message-content"><div className="message-author">{message.kind === 'eva' && <Sparkles size={12} />}{label}</div><div className={`message-bubble ${message.media ? 'message-media' : ''}`}>
    {message.media === 'audio' ? <div className="audio-attachment"><button aria-label="Reproduzir áudio" data-testid={`button-play-audio-${message.id}`}><Play size={15} fill="currentColor" /></button><span className="audio-wave">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ height: `${5 + ((i * 11) % 15)}px` }} />)}</span><span>0:08</span></div> : message.media === 'image' ? <div className="illustration-property"><div className="illustration-sky"><span className="sun" /><span className="building-shape" /><span className="plant-shape" /></div><div className="illustration-caption"><Building2 size={13} /> Imóvel ilustrativo · sem foto real</div><p>{message.text}</p></div> : message.media === 'pdf' ? <div className="pdf-attachment"><span><FileText size={19} /></span><div><b>comprovante_cadastro.pdf</b><small>Documento recebido · prévia de exemplo</small></div><ArrowDownLeft size={16} /></div> : <p>{message.text}</p>}
  </div><span className="message-time">{message.time}{message.status && <><span>·</span><span className={message.status === 'Não enviado' ? 'message-error' : ''}>{message.status === 'Enviado' ? 'Enviado' : message.status}</span>{message.status === 'Enviado' && <Check size={12} />}</>}</span></div></div>;
}

function QueuePage({ contacts, setActive, updateContact, toast }: { contacts: Contact[]; setActive: (id: string) => void; updateContact: (id: string, patch: Partial<Contact>) => void; toast: (message: string) => void }) {
  const pending = contacts.filter((person) => person.state === 'Aguardando atendimento');
  const active = contacts.filter((person) => person.state === 'Humano assumiu');
  const distribute = () => {
    if (!pending.length) { toast('Não há chamados aguardando distribuição.'); return; }
    pending.forEach((person, index) => updateContact(person.id, { owner: operators[(index + 1) % operators.length].name }));
    toast(`${pending.length} chamado(s) atribuídos localmente para triagem.`);
  };
  return <div className="content-wrap"><PageHeading title="Fila humana" subtitle="Chamados que pedem presença da equipe, com contexto antes do aceite." action={<button className="button button-primary" onClick={distribute} data-testid="button-distribute-queue"><ArrowRight size={16} /> Distribuir chamados</button>} />
    <div className="queue-summary"><div><span className="queue-summary-icon queue-yellow"><Clock3 size={18} /></span><span><small>Aguardando aceite</small><b>{pending.length} chamados</b></span></div><div><span className="queue-summary-icon queue-blue"><Users size={18} /></span><span><small>Em atendimento</small><b>{active.length} conversas</b></span></div><div><span className="queue-summary-icon queue-red"><AlertCircle size={18} /></span><span><small>Prazo próximo</small><b>1 chamado prioritário</b></span></div><div className="queue-summary-foot"><span className="live-pip" />Atualizado agora · exemplo</div></div>
    <div className="section-bar"><div><h2>Aguardando atendimento <span className="count-chip">{pending.length}</span></h2><p>Tempo de espera calculado com dados fictícios.</p></div><button className="select-like" onClick={() => toast('Ordenação: prioridade e tempo de espera.')} data-testid="button-queue-sort"><Filter size={15} /> Prioridade <ChevronDown size={14} /></button></div>
    {pending.length ? <div className="queue-cards">{pending.map((person, index) => <article className={`queue-card ${person.priority === 'Urgente' ? 'queue-card-urgent' : ''}`} key={person.id} data-testid={`queue-card-${person.id}`}><div className="queue-card-top"><span className={`priority-label priority-${person.priority.toLowerCase()}`}><span />{person.priority} prioridade</span><span className="wait-time"><Clock3 size={14} /> {index === 0 ? '03 min' : 'há 9 min'}</span></div><div className="queue-client"><span className="avatar avatar-md avatar-peach">{person.initials}</span><span><b>{person.name}</b><small>{person.phone}</small></span><StatePill state={person.state} /></div><p className="queue-reason">“{person.preview}”</p><div className="queue-context"><span><MessageCircle size={14} /> Motivo: solicitação de atendimento humano</span><span><Tag tone="tag-soft">{person.tag}</Tag></span></div>{person.owner && <div className="queue-assigned"><UserRound size={13} /> Triagem atribuída a <b>{person.owner}</b></div>}<div className="queue-card-actions"><button className="button button-quiet" onClick={() => setActive(person.id)} data-testid={`button-open-queue-${person.id}`}>Ver conversa <ArrowRight size={15} /></button><button className="button button-primary" onClick={() => { updateContact(person.id, { state: 'Humano assumiu', owner: 'Marina Costa', tag: 'Em atendimento' }); toast(`${person.name}: chamado aceito por Marina (demo).`); }} data-testid={`button-accept-queue-${person.id}`}>Aceitar chamado</button></div></article>)}</div> : <div className="empty-state"><span><CheckCircle2 size={24} /></span><h3>Fila sem chamados pendentes</h3><p>Novas solicitações vão aparecer aqui.</p></div>}
    <div className="section-bar active-queue-title"><div><h2>Em atendimento <span className="count-chip">{active.length}</span></h2><p>Chamados já assumidos pela equipe.</p></div></div>
    <div className="active-queue-list">{active.map((person) => <div className="active-queue-row" key={person.id} data-testid={`active-queue-${person.id}`}><span className="avatar avatar-md avatar-mint">{person.initials}</span><div className="active-queue-main"><b>{person.name}</b><span>{person.preview}</span></div><span className="owner-chip"><span className="avatar avatar-xs avatar-lilac">{initials(person.owner ?? 'MC')}</span>{person.owner}</span><span className="wait-time">há 8 min</span><button className="text-link" onClick={() => setActive(person.id)} data-testid={`button-open-active-${person.id}`}>Abrir <ArrowRight size={14} /></button></div>)}</div>
  </div>;
}

const leadStages = ['Novo lead', 'Em qualificação', 'Imóveis apresentados', 'Visita/interesse', 'Negociação', 'Concluído'];
function LeadsPage({ contacts, setActive, view, setView, filter, setFilter }: { contacts: Contact[]; setActive: (id: string) => void; view: 'kanban' | 'lista'; setView: (value: 'kanban' | 'lista') => void; filter: string; setFilter: (value: string) => void }) {
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({});
  const leads = contacts.map((person, index) => ({ ...person, stage: stageOverrides[person.id] ?? leadStages[[0, 2, 3, 1, 4][index] ?? 0], property: ['LA-2048 · Saúde', '—', 'LA-1892 · Vila Mariana', 'LA-3116 · Paraíso', 'Carteira própria'][index] }));
  const filtered = leads.filter((person) => filter === 'Todos os leads' || person.stage === filter);
  return <div className="content-wrap"><PageHeading title="Leads / CRM" subtitle="Estágio comercial e estado técnico da conversa são coisas diferentes." action={<button className="button button-primary" onClick={() => setStageOverrides((current) => ({ ...current, 'local-new': 'Novo lead' }))} data-testid="button-new-lead"><Plus size={16} /> Novo lead de exemplo</button>} />
    <div className="crm-toolbar"><div><span className="crm-total"><b>{filtered.length}</b> oportunidades</span><label className="select-like crm-select"><Filter size={15} /><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por estágio" data-testid="select-lead-stage"><option>Todos os leads</option>{leadStages.map((stage) => <option key={stage}>{stage}</option>)}</select><ChevronDown size={14} /></label></div><div className="view-switch"><button className={view === 'kanban' ? 'selected' : ''} onClick={() => setView('kanban')} data-testid="button-lead-kanban"><LayoutGrid size={16} /> Quadro</button><button className={view === 'lista' ? 'selected' : ''} onClick={() => setView('lista')} data-testid="button-lead-list"><List size={16} /> Lista</button></div></div>
    <div className="crm-note"><Sparkles size={15} /> Dado comercial demonstrativo. Uma conversa em “Negociação” ainda pode estar com Eva ativa ou com atendimento humano.</div>
    {view === 'kanban' ? <div className="kanban-board">{leadStages.map((stage, stageIndex) => <section className="kanban-column" key={stage}><header><span className={`stage-marker stage-${stageIndex}`} /><b>{stage}</b><span className="stage-count">{filtered.filter((lead) => lead.stage === stage).length}</span><button aria-label={`Opções de ${stage}`} onClick={() => setFilter(stage)} data-testid={`button-stage-menu-${stageIndex}`}><MoreHorizontal size={16} /></button></header><div className="kanban-stack">{filtered.filter((lead) => lead.stage === stage).map((lead, index) => <article className="lead-card" key={lead.id} data-testid={`lead-card-${lead.id}`}><div className="lead-card-top"><span className="lead-code">LEAD · 0{index + stageIndex + 1}</span><button aria-label="Mover estágio" onClick={() => setStageOverrides((old) => ({ ...old, [lead.id]: leadStages[(stageIndex + 1) % leadStages.length] }))} data-testid={`button-move-lead-${lead.id}`}><ArrowRight size={15} /></button></div><button className="lead-name" onClick={() => setActive(lead.id)} data-testid={`button-open-lead-${lead.id}`}>{lead.name}</button><div className="lead-tags"><Tag tone="tag-blue">{lead.tag}</Tag><Tag tone={lead.priority === 'Urgente' ? 'tag-red' : 'tag-violet'}>{lead.priority}</Tag></div><div className="lead-property"><Building2 size={14} />{lead.property}</div><div className="lead-card-footer"><span className="owner-chip"><span className="avatar avatar-xs avatar-lilac">{initials(lead.owner ?? 'Eva')}</span>{lead.owner ?? 'Eva'}</span><span className="lead-contact-time"><Clock3 size={12} /> {lead.time}</span></div><div className="lead-tech-state"><StatePill state={lead.state} /></div></article>)}</div><button className="add-stage-lead" onClick={() => setStageOverrides((old) => ({ ...old, [`local-${stageIndex}`]: stage }))} data-testid={`button-add-stage-${stageIndex}`}><Plus size={14} /> Adicionar exemplo</button></section>)}</div> : <div className="panel lead-table-panel"><table className="data-table"><thead><tr><th>LEAD</th><th>ESTÁGIO</th><th>IMÓVEL DE INTERESSE</th><th>RESPONSÁVEL</th><th>ESTADO DA CONVERSA</th><th>ÚLTIMO CONTATO</th></tr></thead><tbody>{filtered.map((lead) => <tr key={lead.id} data-testid={`lead-row-${lead.id}`}><td><button className="table-person" onClick={() => setActive(lead.id)} data-testid={`table-lead-${lead.id}`}><span className="avatar avatar-sm avatar-blue">{lead.initials}</span><b>{lead.name}</b></button></td><td><select value={lead.stage} onChange={(e) => setStageOverrides((old) => ({ ...old, [lead.id]: e.target.value }))} data-testid={`select-stage-${lead.id}`}>{leadStages.map((stage) => <option key={stage}>{stage}</option>)}</select></td><td>{lead.property}</td><td>{lead.owner ?? 'Eva'}</td><td><StatePill state={lead.state} /></td><td>{lead.time}</td></tr>)}</tbody></table></div>}
  </div>;
}

function PropertiesPage({ filter, setFilter, toast }: { filter: string; setFilter: (value: string) => void; toast: (message: string) => void }) {
  const [type, setType] = useState('Todos');
  const filtered = properties.filter((item) => `${item.title} ${item.neighborhood} ${item.code}`.toLowerCase().includes(filter.toLowerCase()) && (type === 'Todos' || (type === 'Casa' ? item.title.includes('Casa') : !item.title.includes('Casa'))));
  return <div className="content-wrap"><PageHeading title="Imóveis" subtitle="Catálogo ilustrativo. Disponibilidade e condições precisam de confirmação." action={<SampleStamp />} />
    <div className="property-toolbar"><label className="search-control"><Search size={16} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar código, bairro ou cidade" data-testid="input-property-search" /></label><label className="select-like"><Building2 size={15} /><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de imóvel" data-testid="select-property-type"><option>Todos</option><option>Apartamento</option><option>Casa</option></select><ChevronDown size={14} /></label><button className="select-like" onClick={() => setFilter(filter ? '' : 'Saúde')} data-testid="button-property-filter"><SlidersHorizontal size={15} /> Mais filtros <span className="filter-count">2</span></button></div>
    <div className="property-results"><span><b>{filtered.length}</b> imóveis no recorte</span><span>Atualizado hoje · dados de exemplo</span></div>
    {filtered.length ? <div className="property-grid">{filtered.map((property) => <PropertyCard property={property} toast={toast} key={property.id} />)}</div> : <div className="empty-state"><Building2 size={25} /><h3>Nenhum imóvel neste recorte</h3><p>Experimente buscar por outro bairro ou código.</p><button className="button button-secondary" onClick={() => { setFilter(''); setType('Todos'); }} data-testid="button-reset-properties">Limpar filtros</button></div>}
    <div className="property-disclaimer"><AlertCircle size={16} /> Preços, características e disponibilidade são exemplos fictícios; confirme antes de compartilhar com clientes.</div>
  </div>;
}
function PropertyCard({ property, toast }: { property: Property; toast: (message: string) => void }) { return <article className="property-card" data-testid={`property-card-${property.id}`}><div className={`property-art ${property.tone}`}><span className="art-sun" /><span className="art-building art-building-one" /><span className="art-building art-building-two" /><span className="art-plant" /><span className="property-illustrative">ILUSTRAÇÃO</span><span className="property-code">{property.code}</span></div><div className="property-body"><div className="property-neighborhood"><Building2 size={14} /> {property.neighborhood}</div><h3>{property.title}</h3><p>{property.details}</p><div className="property-price">{property.price}<small> / mês</small></div><div className="property-foot"><span><Clock3 size={13} /> Atualizado hoje</span><button onClick={() => toast(`${property.code}: detalhes ilustrativos. Confirme disponibilidade antes de compartilhar.`)} data-testid={`button-property-${property.id}`}>Ver detalhes <ArrowRight size={14} /></button></div></div></article>; }

function AlertsPage({ incidents, setIncidents, selected, setSelected, toast }: { incidents: Incident[]; setIncidents: (value: Incident[]) => void; selected: string | null; setSelected: (id: string | null) => void; toast: (message: string) => void }) {
  const [severity, setSeverity] = useState('Todas');
  const incident = incidents.find((item) => item.id === selected);
  const filtered = incidents.filter((item) => severity === 'Todas' || item.severity === severity);
  const acknowledge = async (id: string) => { await demoServices.acknowledgeIncident(id); setIncidents(incidents.map((item) => item.id === id ? { ...item, state: 'Reconhecido', owner: 'Marina Costa', timeline: [...item.timeline, { time: 'agora', text: 'Reconhecido por Marina Costa · alteração local de demonstração.' }] } : item)); toast('Alerta reconhecido. A linha do tempo foi atualizada localmente.'); };
  return <div className="content-wrap"><PageHeading title="Alertas e saúde" subtitle="Incidentes com contexto, impacto e uma ação segura como próximo passo." action={<label className="select-like"><Filter size={15} /><select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filtrar severidade" data-testid="select-alert-severity"><option>Todas</option><option>Crítica</option><option>Alta</option><option>Média</option></select><ChevronDown size={14} /></label>} />
    <div className="alert-summary-row"><div className="alert-summary alert-red"><span><AlertCircle size={18} /></span><div><small>Crítico</small><b>{incidents.filter((item) => item.severity === 'Crítica' && item.state === 'Aberto').length} aberto</b></div></div><div className="alert-summary alert-orange"><span><Activity size={18} /></span><div><small>Precisam de ação</small><b>{incidents.filter((item) => item.state === 'Aberto').length} incidentes</b></div></div><div className="alert-summary alert-green"><span><CheckCircle2 size={18} /></span><div><small>Reconhecidos</small><b>{incidents.filter((item) => item.state === 'Reconhecido').length} em acompanhamento</b></div></div><div className="alert-last-check"><span className="live-pip" /> Verificação ilustrativa · 09:44</div></div>
    <div className="alerts-grid"><section className="panel incident-list"><div className="panel-heading"><div><h2>Incidentes recentes</h2><p>Ordenados por severidade e horário</p></div><span className="count-chip">{filtered.length}</span></div>{filtered.map((item) => <button className={`incident-row ${selected === item.id ? 'selected' : ''}`} onClick={() => setSelected(item.id)} key={item.id} data-testid={`incident-row-${item.id}`}><span className={`incident-symbol incident-${item.severity.toLowerCase()}`}><AlertCircle size={17} /></span><span className="incident-copy"><b>{item.title}</b><small>{item.source} · {item.time}</small><span>{item.affected}</span></span><span className="incident-labels"><span className={`severity-text severity-${item.severity.toLowerCase()}`}>{item.severity}</span><span className={`incident-state incident-state-${item.state.toLowerCase()}`}>{item.state}</span></span></button>)}{filtered.length === 0 && <div className="empty-state"><CheckCircle2 size={24} /><h3>Sem alertas neste filtro</h3><p>Altere a severidade para ver outros incidentes.</p></div>}</section>
      {incident ? <section className="panel incident-detail" data-testid="incident-detail"><div className="detail-heading"><div><span className={`severity-text severity-${incident.severity.toLowerCase()}`}><AlertCircle size={14} /> Severidade {incident.severity.toLowerCase()}</span><h2>{incident.title}</h2><p>{incident.source} <span>·</span> Detectado hoje às {incident.time}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar detalhe" data-testid="button-close-incident-detail"><X size={17} /></button></div>
        <div className="incident-state-line"><span className={`state-pill ${incident.state === 'Aberto' ? 'state-warn' : 'state-human'}`}>{incident.state === 'Aberto' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}{incident.state}</span><span>Responsável: <b>{incident.owner}</b></span></div>
        <div className="detail-impact"><span><Activity size={17} /></span><div><b>Impacto observado</b><p>{incident.affected}. O estado é ilustrativo e não consulta serviços reais.</p></div></div>
        <div className="suggestion-box"><div><CircleHelp size={16} /><b>Próximo passo sugerido</b></div><p>{incident.suggestion}</p><small>Não há reprocessamento automático neste protótipo.</small></div>
        <div className="timeline-header"><h3>Linha do tempo</h3><span>{incident.timeline.length} eventos</span></div><div className="incident-timeline">{incident.timeline.map((event, index) => <div className="timeline-entry" key={`${event.time}-${index}`}><span className={`timeline-node ${index === 0 ? 'node-alert' : ''}`}>{index === 0 ? <AlertCircle size={12} /> : <Check size={12} />}</span><span><b>{event.text}</b><small>Hoje · {event.time}</small></span></div>)}</div>
        <div className="detail-actions"><button className="button button-secondary" onClick={() => toast('Execução externa não é acessada neste demo. Integração futura deve avaliar segurança antes de reprocessar.')} data-testid="button-view-execution"><FileText size={15} /> Ver execução ilustrativa</button>{incident.state === 'Aberto' && <button className="button button-primary" onClick={() => acknowledge(incident.id)} data-testid="button-acknowledge-incident"><Check size={16} /> Reconhecer alerta</button>}</div>
      </section> : <section className="panel incident-placeholder"><span><Bell size={22} /></span><h3>Selecione um incidente</h3><p>Veja impacto, histórico e ação sugerida sem arriscar um reenvio.</p><div className="placeholder-mark"><Activity size={27} /></div></section>}</div>
    <div className="overview-footnote"><ShieldCheck size={15} /> Este painel não se conecta à Evolution, webhook, workflows ou catálogo.</div>
  </div>;
}

function ConnectionPage({ toast }: { toast: (text: string) => void }) {
  const [state, setState] = useState<'Desconectado' | 'Conectando' | 'Erro'>('Desconectado');
  const [instance, setInstance] = useState('Principal · demonstração');
  return <div className="content-wrap"><PageHeading title="Conexão WhatsApp" subtitle="Estado de referência da instância. Nenhuma conexão real foi iniciada." action={<SampleStamp />} />
    <div className="connection-grid"><section className="panel connection-main"><div className="connection-heading"><span className="connection-icon"><WifiOff size={22} /></span><span><span className={`connection-state connection-${state.toLowerCase()}`}><i />{state}</span><h2>Instância WhatsApp</h2><p>Evolution API · indicador ilustrativo</p></span><span className="instance-badge"><span className="instance-pip" /> {instance}</span></div><div className="connection-alert"><AlertCircle size={17} /><span><b>Sem conexão com o canal</b><small>Ações desta tela alteram apenas o estado visual da demonstração.</small></span></div><div className="connection-facts"><div><small>ÚLTIMA VERIFICAÇÃO</small><b>Hoje, 09:44</b><span>horário fictício</span></div><div><small>WEBHOOK</small><b><span className="status-dot status-red" /> Sem tráfego esperado</b><span>estado ilustrativo</span></div><div><small>MENSAGENS EM ESPERA</small><b>12 mensagens</b><span>não confirmadas</span></div></div><div className="connection-actions"><button className="button button-primary" onClick={() => { setState('Conectando'); toast('Tentativa ilustrativa. Nenhuma solicitação foi enviada.'); window.setTimeout(() => setState('Erro'), 1600); }} data-testid="button-reconnect"><Wifi size={16} /> Tentar reconectar</button><button className="button button-secondary" onClick={() => toast('Configuração restrita ao papel Administrador nesta visão de exemplo.')} data-testid="button-configure-connection"><Settings2 size={16} /> Configurar instância</button></div><small className="role-note"><ShieldCheck size={14} /> Ações de conexão reais devem ser limitadas a Administradores.</small></section>
      <section className="panel connection-qr"><div className="panel-heading"><div><h2>Vincular dispositivo</h2><p>QR ilustrativo, não funcional</p></div><span className="qr-status">Indisponível</span></div><div className="qr-visual" aria-label="QR code ilustrativo não funcional" data-testid="illustration-qr"><div className="qr-pattern">{Array.from({ length: 81 }, (_, index) => <i key={index} className={(index * 7 + index % 3) % 4 ? '' : 'qr-dark'} />)}</div><span><WifiOff size={20} /></span></div><p className="qr-caption">Este padrão é apenas uma representação visual. Não escaneie — não contém credenciais.</p><button className="button button-outline button-full" onClick={() => toast('Um QR funcional exigiria integração segura e sessão autorizada.')} data-testid="button-qr-help"><CircleHelp size={15} /> Como funciona a conexão?</button></section></div>
    <section className="panel connection-events"><div className="panel-heading"><div><h2>Checagens recentes</h2><p>Eventos de demonstração</p></div></div>{[['09:44', 'Verificação de conectividade', 'Sem resposta da instância', 'danger'], ['09:42', 'Estado do webhook', 'Nenhum tráfego dentro da janela esperada', 'warn'], ['09:30', 'Fila de mensagens', '12 itens aguardam confirmação', 'info']].map(([time, title, desc, tone], index) => <div className="check-row" key={title} data-testid={`connection-check-${index}`}><span className={`check-icon check-${tone}`}>{tone === 'danger' ? <WifiOff size={15} /> : tone === 'warn' ? <AlertCircle size={15} /> : <MessageCircle size={15} />}</span><span><b>{title}</b><small>{desc}</small></span><time>Hoje · {time}</time></div>)}</section>
  </div>;
}

function ReportsPage() {
  const [period, setPeriod] = useState('Últimos 7 dias');
  return <div className="content-wrap"><PageHeading title="Relatórios" subtitle="Indicadores para leitura da operação; totais exclusivamente demonstrativos." action={<label className="select-like"><Clock3 size={15} /><select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período do relatório" data-testid="select-report-period"><option>Últimos 7 dias</option><option>Últimos 30 dias</option><option>Este mês</option></select><ChevronDown size={14} /></label>} />
    <div className="reports-kpis"><Metric label="Conversas recebidas" value="184" note="+12% no recorte fictício anterior" icon={MessageCircle} tone="tone-blue" testId="report-conversations" /><Metric label="1ª resposta média" value="2m 18s" note="meta ilustrativa: até 5 min" icon={Clock3} tone="tone-violet" testId="report-response" /><Metric label="Resolução no contato" value="68,4%" note="estimativa de demonstração" icon={CheckCircle2} tone="tone-mint" testId="report-resolution" /><Metric label="Handoffs para equipe" value="24" note="13% do volume no exemplo" icon={ArrowUpRight} tone="tone-amber" testId="report-handoffs" /></div>
    <div className="reports-grid"><section className="panel report-chart"><div className="panel-heading"><div><h2>Volume e origem dos atendimentos</h2><p>Conversas iniciadas por dia · {period.toLowerCase()}</p></div><button className="button button-quiet" onClick={() => window.print()} data-testid="button-export-report"><FileText size={15} /> Imprimir relatório</button></div><div className="report-bars">{[38, 57, 47, 70, 64, 82, 53].map((height, index) => <div className="report-day" key={index}><div className="report-bar-outer"><i className="report-bar-eva" style={{ height: `${height}%` }} /><i className="report-bar-human" style={{ height: `${100 - height}%` }} /></div><small>{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][index]}</small></div>)}</div><div className="report-legend"><span><i className="legend-dot legend-violet" />Eva conduziu</span><span><i className="legend-dot legend-blue" />Atendimento humano</span><span><i className="legend-dot legend-orange" />Handoffs</span></div></section><section className="panel resolution-panel"><div className="panel-heading"><div><h2>Tempo de primeira resposta</h2><p>Distribuição fictícia</p></div></div><div className="resolution-ring"><div><b>2m 18s</b><small>média</small></div></div><div className="response-stats"><div><span><i className="legend-dot legend-mint" />Até 2 min</span><b>54%</b></div><div><span><i className="legend-dot legend-blue" />2 a 5 min</span><b>31%</b></div><div><span><i className="legend-dot legend-orange" />Mais de 5 min</span><b>15%</b></div></div></section></div>
    <section className="panel report-bottom"><div className="panel-heading"><div><h2>Saúde da operação</h2><p>Recorte de eventos do período selecionado</p></div></div><div className="report-bottom-grid"><div><span className="report-bottom-icon report-tone-red"><AlertCircle size={17} /></span><span><small>Incidentes</small><b>08</b></span><span className="report-bottom-note">3 em aberto</span></div><div><span className="report-bottom-icon report-tone-blue"><Building2 size={17} /></span><span><small>Imóveis apresentados</small><b>62</b></span><span className="report-bottom-note">em conversas fictícias</span></div><div><span className="report-bottom-icon report-tone-violet"><ArrowUpRight size={17} /></span><span><small>Taxa de handoff</small><b>13,0%</b></span><span className="report-bottom-note">do volume total</span></div><div><span className="report-bottom-icon report-tone-green"><CheckCircle2 size={17} /></span><span><small>Chamados resolvidos</small><b>19</b></span><span className="report-bottom-note">tempo médio 11 min</span></div></div></section>
    <div className="overview-footnote"><ShieldCheck size={15} /> Os dados deste relatório são fictícios e não foram calculados a partir de clientes reais.</div>
  </div>;
}

function TeamPage({ toast }: { toast: (text: string) => void }) {
  return <div className="content-wrap"><PageHeading title="Equipe" subtitle="Papéis e carga de atendimento para planejar a distribuição." action={<button className="button button-primary" onClick={() => toast('Convite de equipe ficará disponível após a integração de identidade.')} data-testid="button-invite-member"><Plus size={16} /> Convidar pessoa</button>} />
    <div className="team-overview"><div><Users size={19} /><span><small>Pessoas na equipe</small><b>03 operadoras</b></span></div><div><Activity size={19} /><span><small>Conversas em andamento</small><b>13 no total</b></span></div><div><Clock3 size={19} /><span><small>Fila aguardando</small><b>02 solicitações</b></span></div><span className="demo-small-label">Exemplo</span></div>
    <div className="section-bar"><div><h2>Equipe de atendimento</h2><p>Papéis visuais não representam uma autorização real.</p></div><button className="select-like" onClick={() => toast('Filtro: todas as pessoas da operação.')} data-testid="button-team-filter"><Filter size={15} /> Toda a equipe <ChevronDown size={14} /></button></div>
    <div className="team-list">{operators.map((operator) => <article className="team-card" key={operator.id} data-testid={`team-card-${operator.id}`}><div className={`avatar avatar-lg ${operator.id === 'op1' ? 'avatar-lilac' : operator.id === 'op2' ? 'avatar-blue' : 'avatar-mint'}`}>{operator.initials}</div><div className="team-person"><div><h3>{operator.name}</h3><span className="role-pill">{operator.role}</span></div><span className="team-presence"><i />{operator.status}</span><div className="team-contact"><span><MessageCircle size={14} /> {operator.load} conversas ativas</span><span><Clock3 size={14} /> Última atividade há 4 min</span></div></div><div className="team-load"><div><span>Carga de atendimento</span><b>{operator.load}/10</b></div><div className="load-track"><i style={{ width: `${operator.load * 10}%` }} /></div><small>Limite ilustrativo de 10 conversas</small></div><button className="icon-button" aria-label={`Mais ações de ${operator.name}`} onClick={() => toast(`Atribuições de ${operator.name} no modo demonstração.`)} data-testid={`button-team-options-${operator.id}`}><MoreHorizontal size={18} /></button></article>)}</div>
    <div className="role-explainer"><ShieldCheck size={18} /><div><b>Permissões ainda não aplicadas</b><p>Administrador, Supervisor e Atendente aparecem como referência de experiência. Esta demonstração não autentica nem protege dados.</p></div></div>
  </div>;
}

function SettingsPage({ toast }: { toast: (text: string) => void }) {
  const [hours, setHours] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [sla, setSla] = useState('5');
  const [saved, setSaved] = useState(false);
  return <div className="content-wrap"><PageHeading title="Configurações" subtitle="Regras de operação de exemplo, sem efeito em sistemas externos." action={<SampleStamp />} />
    <div className="settings-layout"><aside className="settings-menu">{['Atendimento', 'Fila e prazos', 'Notificações', 'Dados e privacidade'].map((item, index) => <button key={item} className={index === 0 ? 'selected' : ''} onClick={() => toast(`${item}: seção visual de demonstração.`)} data-testid={`settings-tab-${index}`}><span>{[Headphones, Clock3, Bell, ShieldCheck][index]({ size: 16 })}</span>{item}{index === 0 && <ArrowRight size={14} />}</button>)}</aside><section className="panel settings-main"><div className="settings-section-heading"><span className="settings-icon"><Headphones size={19} /></span><div><h2>Regras de atendimento</h2><p>Preferências locais da demonstração.</p></div></div>
      <div className="setting-row"><span><b>Horário de operação</b><small>Usar a janela de atendimento da equipe.</small></span><button role="switch" aria-checked={hours} className={`toggle ${hours ? 'on' : ''}`} onClick={() => setHours(!hours)} data-testid="toggle-hours"><i /></button></div>
      {hours && <div className="hours-range"><span>Segunda a sexta</span><label><input type="time" defaultValue="08:00" data-testid="input-start-hours" /> até <input type="time" defaultValue="18:00" data-testid="input-end-hours" /></label><small>Horário de Brasília · ilustrativo</small></div>}
      <div className="setting-row"><span><b>Prazo de primeira resposta</b><small>Tempo para destacar um chamado aguardando.</small></span><label className="sla-select"><input type="number" min="1" max="60" value={sla} onChange={(e) => setSla(e.target.value)} data-testid="input-sla" /><span>minutos</span></label></div>
      <div className="setting-row"><span><b>Alertas de prazo próximo</b><small>Exibir aviso visual antes do vencimento.</small></span><button role="switch" aria-checked={alerts} className={`toggle ${alerts ? 'on' : ''}`} onClick={() => setAlerts(!alerts)} data-testid="toggle-alerts"><i /></button></div>
      <div className="setting-row"><span><b>Distribuição sugerida</b><small>Priorizar menor carga entre atendentes disponíveis.</small></span><button className="button button-outline" onClick={() => toast('Distribuição automática apenas ilustrativa nesta tela.')} data-testid="button-distribution-setting">Menor carga <ChevronDown size={14} /></button></div>
      <div className="settings-save"><span>{saved ? <><CheckCircle2 size={15} /> Alterações aplicadas nesta sessão.</> : 'Alterações não são persistidas.'}</span><button className="button button-primary" onClick={() => { setSaved(true); toast('Preferências atualizadas na interface. Nada foi persistido.'); }} data-testid="button-save-settings">Aplicar preferências</button></div>
    </section></div>
    <div className="privacy-callout"><ShieldCheck size={17} /><span><b>Sem credenciais ou autenticação real.</b> Não conecte chaves de API no navegador. A autorização precisa ser implementada no servidor durante a integração.</span></div>
  </div>;
}

export default App;
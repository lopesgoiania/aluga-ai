import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, ArrowRight, BookOpen, Check, FileText, Lightbulb, Pencil, Plus, Search, ShieldCheck, Upload, X, MessageCircle, Building2, Users, AlertTriangle, ExternalLink } from 'lucide-react';
import { api, dateTime, type Operator } from './services/api';
import policySnapshot from './lia-policy-snapshot.json';

type Audience = 'all' | 'inquilino' | 'proprietario' | 'corretor';
type Status = 'draft' | 'approved' | 'archived';
type Entry = { id: string; title: string; content: string; status: Status; audience: Audience; scope: string; source_type: string; source_path?: string | null; version: number; updated_at: string; approved_at?: string | null };
type Suggestion = { id: string; session_id?: string; suggested_title: string; suggested_content: string; created_at: string };
type Gap = { id: string; session_id?: string; question: string; reason: string; created_at: string };
type View = 'guide' | 'library' | 'gaps' | 'suggestions';
type Channel = { id: string; display_name: string; instance_name: string; purpose?: string | null; instructions?: string | null; default_team_id?: string | null; ai_enabled: boolean; active: boolean };
type Team = { id: string; name: string; ai_enabled: boolean; active: boolean };
const guideSections = [
  { title: 'Conversa e qualificação', icon: MessageCircle, points: ['Saúda com naturalidade e entende a intenção pelo contexto; não começa perguntando se a pessoa é inquilina, proprietária ou corretora.', 'Não repete critérios já informados, evita formato de formulário e faz no máximo uma pergunta útil por vez.', 'Responde em mensagens breves, sem forçar assunto imobiliário quando a pessoa só cumprimenta.'] },
  { title: 'Busca de imóveis', icon: Building2, points: ['Para quem procura alugar, inicia a busca assim que recebe um critério útil, sem pedir autorização.', 'Usa imóveis reais do catálogo; não inventa anúncios, preços nem disponibilidade.', 'Um pedido por galpão acima de 100 m² em Goiânia, sem bairro definido, já permite pesquisar.'] },
  { title: 'Proprietário direto', icon: Building2, points: ['Quando o próprio dono quer anunciar, identifica o imóvel com tipo e localização; aproveita o telefone da conversa e não exige uma ficha completa.', 'Com os dados mínimos, registra o interesse e transfere à equipe para apresentar avaliação, administração e próximos passos.', 'Não aplica comissão de corretor nem promete taxas, prazos ou aceitação do imóvel sem informação aprovada.'] },
  { title: 'Parceria com corretores', icon: Users, points: ['Distingue o cliente que procura locação do proprietário que quer anunciar; não busca imóveis como se o corretor fosse o interessado.', 'Na indicação de locatário, orienta consultar o site e enviar link do anúncio, nome e contato do cliente. Comissão: 25% do primeiro aluguel se a locação for concluída e o aluguel recebido.', 'Na captação de proprietário, pede contato e dados suficientes para identificar o imóvel, sem exigir todos os campos. Comissão: 40% do primeiro aluguel se o imóvel entrar na carteira, for alugado e o aluguel recebido.', 'Com os dados essenciais da indicação, registra e encaminha à equipe. A Lopes assume os procedimentos da locação.'] },
  { title: 'Segurança e transferência', icon: ShieldCheck, points: ['Só afirma condições, valores, prazos e procedimentos respaldados pelas regras fixas, por conhecimento aprovado, pelo catálogo ou pelo próprio cliente.', 'Quando falta fonte para uma resposta factual, registra a lacuna e transfere a conversa para uma pessoa, sem inventar resposta.', 'Também transfere a pedido do cliente, diante de irritação, negociação sensível ou caso que exija decisão humana.'] },
];
const audiences: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Todos os públicos' },
  { value: 'inquilino', label: 'Inquilinos' },
  { value: 'proprietario', label: 'Proprietários' },
  { value: 'corretor', label: 'Corretores' },
];
const audienceLabel = (value: Audience) => audiences.find((item) => item.value === value)?.label ?? 'Todos os públicos';
const statusLabel: Record<Status, string> = { approved: 'Aprovado', draft: 'Em revisão', archived: 'Arquivado' };
const fileBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });

export default function KnowledgeManager({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const canEdit = operator.role === 'admin' || operator.role === 'supervisor';
  const canReviewCases = operator.role === 'admin';
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  const [audienceEnabled, setAudienceEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('guide');
  const [audienceFilter, setAudienceFilter] = useState<Audience | 'any'>('any');
  const [statusFilter, setStatusFilter] = useState<Status | 'active'>('active');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editor, setEditor] = useState<'text' | 'document' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [library, pending, unanswered] = await Promise.all([
      api<{ entries: Entry[]; audienceEnabled: boolean }>('/knowledge'),
      canReviewCases ? api<{ suggestions: Suggestion[] }>('/knowledge/suggestions') : Promise.resolve({ suggestions: [] }),
      canReviewCases ? api<{ gaps: Gap[] }>('/knowledge/gaps') : Promise.resolve({ gaps: [] }),
    ]);
    setEntries(library.entries); setAudienceEnabled(library.audienceEnabled);
    setSuggestions(pending.suggestions); setGaps(unanswered.gaps);
    setLoadError(''); setLoading(false);
  };
  useEffect(() => { void load().catch((error) => { setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os conhecimentos.'); setLoading(false); }); }, []);
  useEffect(() => { void Promise.allSettled([api<{ channels: Channel[] }>('/channels'), api<{ teams: Team[] }>('/teams')]).then(([channelResult, teamResult]) => {
    if (channelResult.status === 'fulfilled') setChannels(channelResult.value.channels);
    if (teamResult.status === 'fulfilled') { setTeams(teamResult.value.teams); setTeamsLoaded(true); }
    if (channelResult.status === 'rejected' || teamResult.status === 'rejected') setOperationsError('Não foi possível conferir as configurações dos canais e equipes agora.');
    setOperationsLoading(false);
  }); }, []);

  const counts = useMemo(() => ({
    approved: entries.filter((entry) => entry.status === 'approved').length,
    draft: entries.filter((entry) => entry.status === 'draft').length,
    archived: entries.filter((entry) => entry.status === 'archived').length,
  }), [entries]);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const matchesStatus = statusFilter === 'active' ? entry.status !== 'archived' : entry.status === statusFilter;
    const matchesAudience = audienceFilter === 'any' || entry.audience === audienceFilter;
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    return matchesStatus && matchesAudience && (!needle || `${entry.title} ${entry.content}`.toLocaleLowerCase('pt-BR').includes(needle));
  }), [entries, statusFilter, audienceFilter, query]);

  function openEditor(kind: 'text' | 'document', entry?: Entry) {
    setEditor(kind); setEditing(entry?.id ?? null); setTitle(entry?.title ?? ''); setContent(entry?.content ?? '');
    setAudience(entry?.audience ?? (audienceFilter === 'any' ? 'all' : audienceFilter)); setSelectedDocument(null);
    window.requestAnimationFrame(() => document.getElementById('knowledge-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function closeEditor() { setEditor(null); setEditing(null); setTitle(''); setContent(''); setAudience('all'); setSelectedDocument(null); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api<{ entry: Entry }>(editing ? `/knowledge/${editing}` : '/knowledge', { method: editing ? 'PATCH' : 'POST', body: { title: title.trim(), content: content.trim(), audience: audienceEnabled ? audience : 'all' } });
      await load(); closeEditor(); setView('library'); setStatusFilter(result.entry.status); setAudienceFilter('any');
      flash(result.entry.status === 'draft' ? 'Rascunho salvo. A LIA só usa este conteúdo após aprovação.' : 'Informação salva sem alteração do estado de aprovação.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao salvar o conhecimento.'); }
    finally { setBusy(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedDocument) return;
    setBusy(true);
    try {
      await api('/knowledge/documents', { method: 'POST', body: { title: title.trim(), audience: audienceEnabled ? audience : 'all', fileName: selectedDocument.name, mimeType: selectedDocument.type, base64: await fileBase64(selectedDocument) } });
      await load(); closeEditor(); setView('library'); setStatusFilter('draft'); setAudienceFilter('any');
      flash('Documento anexado como rascunho. Transcreva e revise os fatos antes de aprovar.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao anexar documento.'); }
    finally { setBusy(false); }
  }
  async function change(entry: Entry, action: 'approve' | 'archive') {
    setBusy(true);
    try {
      await api(`/knowledge/${entry.id}/${action}`, { method: 'POST' }); await load();
      flash(action === 'approve' ? 'Conhecimento aprovado e disponível para consultas relevantes.' : 'Conhecimento arquivado. A LIA não deve mais usá-lo.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar o conhecimento.'); }
    finally { setBusy(false); }
  }
  async function review(suggestion: Suggestion, accept: boolean) {
    setBusy(true);
    try {
      await api(`/knowledge/suggestions/${suggestion.id}/review`, { method: 'POST', body: { accept } }); await load();
      if (accept) { setView('library'); setStatusFilter('draft'); }
      flash(accept ? 'Sugestão criada como rascunho. Revise antes de aprovar.' : 'Sugestão descartada.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao revisar a sugestão.'); }
    finally { setBusy(false); }
  }
  function draftFromGap(gap: Gap) {
    setView('library'); setStatusFilter('draft'); setEditor('text'); setEditing(null);
    setTitle(`Resposta para: ${gap.question.replace(/\s+/g, ' ').slice(0, 135)}`);
    setContent(''); setAudience('all');
    window.requestAnimationFrame(() => document.getElementById('knowledge-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return <div className="knowledge-workspace">
    <header className="knowledge-header">
      <div><h2>O que a LIA sabe e como atende</h2><p>Regras do fluxo, orientações dos canais e informações aprovadas em um só lugar — com a origem de cada uma.</p></div>
      {canEdit && <div className="knowledge-header-actions"><button type="button" className="button button-outline" onClick={() => openEditor('document')}><Upload size={15} /> Anexar documento</button><button type="button" className="button button-primary" onClick={() => openEditor('text')}><Plus size={16} /> Nova informação</button></div>}
    </header>

    {!audienceEnabled && <div className="knowledge-notice" role="status"><ShieldCheck size={18} /><span>A classificação por público ainda não foi ativada no banco. Os conteúdos atuais seguem disponíveis como gerais; a nova classificação ficará habilitada após a migração.</span></div>}
    {loadError && <div className="live-error" role="alert">{loadError} <button type="button" className="button button-outline" onClick={() => { setLoading(true); void load().catch((error) => { setLoadError(error instanceof Error ? error.message : 'Falha ao carregar'); setLoading(false); }); }}>Tentar novamente</button></div>}

    <div className="knowledge-status-bar" aria-label="Estado da base">
      <span><strong>{counts.approved}</strong> aprovados <small>podem orientar a LIA</small></span>
      <span><strong>{counts.draft}</strong> em revisão <small>ainda não usados</small></span>
      {canReviewCases && <span><strong>{gaps.length}</strong> dúvidas sem fonte <small>nos eventos recentes</small></span>}
      {canReviewCases && <span><strong>{suggestions.length}</strong> sugestões <small>aguardam análise</small></span>}
    </div>

    {editor && canEdit && <section id="knowledge-editor" className="knowledge-editor" aria-label={editing ? 'Editar conhecimento' : 'Novo conhecimento'}>
      <div className="knowledge-section-head"><div><h3>{editing ? 'Editar informação' : editor === 'document' ? 'Anexar referência' : 'Nova informação'}</h3><p>{editor === 'document' ? 'O arquivo fica privado e exige transcrição antes da aprovação.' : 'Escreva um fato ou procedimento confirmado. A LIA não verá o rascunho antes da aprovação.'}</p></div><button type="button" className="knowledge-icon-button" onClick={closeEditor} aria-label="Fechar editor"><X size={18} /></button></div>
      <form className="knowledge-editor-form" onSubmit={editor === 'document' ? upload : save}>
        <div className="knowledge-editor-row"><label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Ex.: Como funciona a captação de imóveis" /></label><label>Público<select value={audience} onChange={(event) => setAudience(event.target.value as Audience)} disabled={!audienceEnabled}>{audiences.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div>
        {editor === 'document' ? <label>Documento PDF ou TXT, até 5 MB<input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(event) => setSelectedDocument(event.target.files?.[0] ?? null)} required /></label> : <label>Informação confirmada<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={16000} required rows={8} placeholder="Descreva o que a Lopes Aluga realmente faz, quando a informação se aplica e o que deve ser confirmado por um humano." /></label>}
        <div className="knowledge-editor-footer"><span><ShieldCheck size={16} /> Salvar cria um rascunho; a aprovação é uma ação separada.</span><button type="submit" className="button button-primary" disabled={busy || !title.trim() || (editor === 'text' ? !content.trim() : !selectedDocument)}>{busy ? 'Salvando…' : editor === 'document' ? 'Anexar como rascunho' : 'Salvar rascunho'}</button></div>
      </form>
    </section>}

    <div className="knowledge-layout">
      <section className="knowledge-main" aria-label="Biblioteca de conhecimento">
        <nav className="knowledge-tabs" aria-label="Áreas do conhecimento">
          <button type="button" className={view === 'guide' ? 'active' : ''} onClick={() => setView('guide')} aria-current={view === 'guide' ? 'page' : undefined}><ShieldCheck size={17} /> Como atende</button>
          <button type="button" className={view === 'library' ? 'active' : ''} onClick={() => setView('library')} aria-current={view === 'library' ? 'page' : undefined}><BookOpen size={17} /> Biblioteca</button>
          {canReviewCases && <button type="button" className={view === 'gaps' ? 'active' : ''} onClick={() => setView('gaps')} aria-current={view === 'gaps' ? 'page' : undefined}><Lightbulb size={17} /> Lacunas <span>{gaps.length}</span></button>}
          {canReviewCases && <button type="button" className={view === 'suggestions' ? 'active' : ''} onClick={() => setView('suggestions')} aria-current={view === 'suggestions' ? 'page' : undefined}><FileText size={17} /> Sugestões <span>{suggestions.length}</span></button>}
        </nav>

        {view === 'guide' && <div className="knowledge-guide">
          <div className="knowledge-panel-intro"><h3>Regras já definidas para a LIA</h3><p>Este retrato vem do último fluxo do agente exportado no projeto. Ele mostra regras gravadas no workflow; a publicação atual do n8n precisa ser conferida separadamente após cada alteração.</p></div>
          <div className="knowledge-guide-rules">{guideSections.map(({ title: sectionTitle, icon: Icon, points }) => <section className="knowledge-guide-section" key={sectionTitle}><div className="knowledge-guide-section-title"><Icon size={18} /><h4>{sectionTitle}</h4></div><ul>{points.map((point) => <li key={point}>{point}</li>)}</ul></section>)}</div>
          <section className="knowledge-guide-gap"><AlertTriangle size={19} /><div><strong>Condições comerciais para o proprietário direto ainda precisam de confirmação</strong><p>A LIA já acolhe, identifica o imóvel e encaminha o proprietário à equipe. Taxas, valores, prazos, garantias e critérios de aceitação não foram informados como política aprovada; quando perguntarem, a LIA deve transferir sem inventar.</p></div></section>
          <details className="knowledge-policy-source"><summary>Ver instruções completas do fluxo exportado <span>versão {policySnapshot.sourceSha256}</span></summary><p>Fonte: {policySnapshot.source}. Este texto é uma cópia local para auditoria, não uma leitura em tempo real do n8n.</p><pre>{policySnapshot.instructions}</pre></details>
          <div className="knowledge-panel-intro knowledge-guide-channels-head"><h3>Orientações por canal</h3><p>Estas configurações vêm do banco agora. Só fazem parte do atendimento se a LIA estiver habilitada no canal e na equipe responsável.</p></div>
          {operationsError && <div className="knowledge-notice" role="status">{operationsError}</div>}
          {operationsLoading ? <div className="knowledge-empty">Carregando configurações dos canais…</div> : channels.length ? <div className="knowledge-channel-list">{channels.map((channel) => {
            const team = teams.find((item) => item.id === channel.default_team_id);
            const enabled = channel.active && channel.ai_enabled && Boolean(team?.active && team.ai_enabled);
            const status = !channel.active || !channel.ai_enabled ? 'LIA não habilitada' : !teamsLoaded ? 'Equipe não verificada' : enabled ? 'LIA habilitada' : 'LIA não habilitada';
            return <article key={channel.id} className="knowledge-channel"><div className="knowledge-channel-head"><strong>{channel.display_name}</strong><span className={enabled ? 'enabled' : ''}>{status}</span></div><small>{channel.instance_name}{team ? ` · Equipe ${team.name}` : teamsLoaded ? ' · Sem equipe identificada' : ' · Equipe não verificada'}</small><p><b>Finalidade:</b> {channel.purpose?.trim() || 'Não informada'}</p><p><b>Instruções adicionais:</b> {channel.instructions?.trim() || 'Nenhuma cadastrada'}</p></article>;
          })}</div> : !operationsError && <div className="knowledge-empty"><strong>Nenhum canal configurado apareceu nesta consulta</strong><p>As regras gerais acima e a biblioteca aprovada continuam separadas das instruções específicas de cada número.</p></div>}
          <div className="knowledge-guide-footer"><span>Informações aprovadas e documentos ficam na Biblioteca; rascunhos não orientam respostas.</span><button type="button" className="button button-outline" onClick={() => setView('library')}>Abrir biblioteca <ExternalLink size={14} /></button></div>
        </div>}

        {view === 'library' && <>
          <div className="knowledge-toolbar"><label className="knowledge-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar título ou conteúdo" aria-label="Buscar conhecimentos" /></label><select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value as Audience | 'any')} aria-label="Filtrar por público"><option value="any">Qualquer público</option>{audiences.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | 'active')} aria-label="Filtrar por situação"><option value="active">Ativos e em revisão</option><option value="approved">Aprovados</option><option value="draft">Em revisão</option><option value="archived">Arquivados ({counts.archived})</option></select></div>
          {loading ? <div className="knowledge-empty">Carregando conhecimentos…</div> : visibleEntries.length ? <div className="knowledge-list">{visibleEntries.map((entry) => <article className={`knowledge-entry ${expanded === entry.id ? 'expanded' : ''}`} key={entry.id}>
            <button type="button" className="knowledge-entry-summary" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} aria-expanded={expanded === entry.id}>
              <span className={`knowledge-entry-icon ${entry.status}`}><BookOpen size={18} /></span><span className="knowledge-entry-copy"><strong>{entry.title}</strong><span>{entry.content}</span><small>{audienceLabel(entry.audience)} · v{entry.version} · {dateTime(entry.updated_at)}</small></span><span className={`knowledge-badge ${entry.status}`}>{statusLabel[entry.status]}</span><ArrowRight className="knowledge-entry-arrow" size={17} /></button>
            {expanded === entry.id && <div className="knowledge-entry-detail"><p>{entry.content}</p><div className="knowledge-entry-meta"><span>Fonte: {entry.source_type === 'document' ? 'documento anexado' : entry.source_type === 'conversation' ? 'atendimento revisado' : 'cadastro manual'}</span><span>Aplicação: {audienceLabel(entry.audience)}</span><span>{entry.status === 'approved' ? `Aprovado em ${dateTime(entry.approved_at ?? undefined)}` : statusLabel[entry.status]}</span></div>
              {canEdit && <div className="knowledge-entry-actions">{entry.source_type === 'document' && entry.source_path && <a className="button button-outline" href={`/api/knowledge/${entry.id}/document`} target="_blank" rel="noreferrer">Ver documento</a>}<button type="button" className="button button-outline" disabled={busy} onClick={() => openEditor('text', entry)}><Pencil size={14} /> Editar</button>{entry.status !== 'approved' && <button type="button" className="button button-primary" disabled={busy} onClick={() => void change(entry, 'approve')}><Check size={14} /> Aprovar</button>}{entry.status !== 'archived' && <button type="button" className="button button-outline" disabled={busy} onClick={() => void change(entry, 'archive')}><Archive size={14} /> Arquivar</button>}</div>}
            </div>}
          </article>)}</div> : <div className="knowledge-empty"><BookOpen size={23} /><strong>{entries.length ? 'Nenhum resultado com esses filtros' : 'Nenhuma informação cadastrada nesta biblioteca'}</strong><p>{entries.length ? 'Ajuste o público, a situação ou a busca.' : 'As regras fixas do fluxo continuam na aba Como atende. Cadastre aqui fatos e procedimentos que devem ser consultados e revisados no painel.'}</p>{canEdit && !entries.length && <button type="button" className="button button-primary" onClick={() => openEditor('text')}>Criar primeira informação</button>}</div>}
          <p className="knowledge-list-caption">Mostrando até 200 conteúdos mais recentes. Só os aprovados entram na consulta da LIA.</p>
        </>}

        {view === 'gaps' && canReviewCases && <div className="knowledge-panel"><div className="knowledge-panel-intro"><h3>Perguntas que pediram ajuda humana</h3><p>Casos recentes marcados como falta de conhecimento. Revise a pergunta antes de criar uma resposta oficial.</p></div>{gaps.length ? gaps.map((gap) => <article className="knowledge-case" key={gap.id}><span className="knowledge-case-mark"><Lightbulb size={17} /></span><div><strong>{gap.question || 'Pergunta não registrada no evento'}</strong><p>{gap.reason}</p><small>{dateTime(gap.created_at)}</small></div><button type="button" className="button button-outline" onClick={() => draftFromGap(gap)}>Criar rascunho <ArrowRight size={14} /></button></article>) : <div className="knowledge-empty"><ShieldCheck size={23} /><strong>Nenhuma lacuna registrada nos eventos recentes</strong><p>Continue revisando os atendimentos: isso não significa que todas as perguntas já estejam cobertas.</p></div>}</div>}

        {view === 'suggestions' && canReviewCases && <div className="knowledge-panel"><div className="knowledge-panel-intro"><h3>Ideias extraídas de atendimentos</h3><p>Uma sugestão aceita vira rascunho. Nenhuma resposta humana passa a orientar a LIA sem revisão e aprovação.</p></div>{suggestions.length ? suggestions.map((suggestion) => <article className="knowledge-suggestion" key={suggestion.id}><strong>{suggestion.suggested_title}</strong><p>{suggestion.suggested_content}</p><small>{dateTime(suggestion.created_at)}</small><div className="knowledge-entry-actions"><button type="button" className="button button-primary" disabled={busy} onClick={() => void review(suggestion, true)}>Revisar como rascunho</button><button type="button" className="button button-outline" disabled={busy} onClick={() => void review(suggestion, false)}>Descartar</button></div></article>) : <div className="knowledge-empty"><Lightbulb size={23} /><strong>Sem sugestões pendentes</strong><p>Quando a análise de atendimentos encontrar algo útil, ele aparecerá aqui para revisão.</p></div>}</div>}
      </section>

      <aside className="knowledge-aside" aria-label="Funcionamento e limites da LIA"><div className="knowledge-aside-head"><ShieldCheck size={18} /><h3>Como a LIA usa esta base</h3></div><ol><li><strong>Rascunho</strong><span>Você registra e revisa a informação.</span></li><li><strong>Aprovação</strong><span>O conteúdo passa a poder ser consultado.</span></li><li><strong>Resposta</strong><span>A LIA só recebe entradas aprovadas e relevantes à pergunta.</span></li></ol><div className="knowledge-aside-divider" /><h4>Limites do fluxo atual</h4><p>Sem fonte confirmada para uma pergunta factual, o atendimento deve seguir para uma pessoa da equipe.</p><p>Um PDF anexado não é interpretado automaticamente. Transcreva os fatos antes de aprovar.</p><p>Conteúdos por público dependem da identificação do perfil na conversa; revise os primeiros atendimentos após publicar uma regra.</p></aside>
    </div>
  </div>;
}

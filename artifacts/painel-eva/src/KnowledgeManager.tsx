import { useEffect, useState, type FormEvent } from 'react';
import { api, type Operator } from './services/api';

type Entry = { id: string; title: string; content: string; status: 'draft' | 'approved' | 'archived'; source_type: string; source_path?: string | null; version: number; updated_at: string };
type Suggestion = { id: string; session_id?: string; suggested_title: string; suggested_content: string; created_at: string };
const fileBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });

export default function KnowledgeManager({ operator, flash }: { operator: Operator; flash: (message: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [document, setDocument] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = operator.role === 'admin' || operator.role === 'supervisor';
  const load = async () => {
    setEntries((await api<{ entries: Entry[] }>('/knowledge')).entries);
    if (canEdit) setSuggestions((await api<{ suggestions: Suggestion[] }>('/knowledge/suggestions')).suggestions);
  };
  useEffect(() => { void load().catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar a base')); }, []);
  const reset = () => { setEditing(null); setTitle(''); setContent(''); };
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api(editing ? `/knowledge/${editing}` : '/knowledge', { method: editing ? 'PATCH' : 'POST', body: { title, content } });
      await load(); reset(); flash('Conteúdo salvo como rascunho. Revise e aprove antes de usar na Eva.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Falha ao salvar conteúdo'); }
    finally { setBusy(false); }
  }
  async function change(id: string, action: 'approve' | 'archive') {
    setBusy(true);
    try { await api(`/knowledge/${id}/${action}`, { method: 'POST' }); await load(); flash(action === 'approve' ? 'Conteúdo aprovado.' : 'Conteúdo arquivado.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao atualizar conteúdo'); }
    finally { setBusy(false); }
  }
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!document) return;
    setBusy(true);
    try { await api('/knowledge/documents', { method: 'POST', body: { title: documentTitle.trim(), fileName: document.name, mimeType: document.type, base64: await fileBase64(document) } }); await load(); setDocument(null); setDocumentTitle(''); flash('Documento anexado como rascunho. Transcreva e revise antes de aprovar.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao anexar documento'); }
    finally { setBusy(false); }
  }
  async function review(id: string, accept: boolean) {
    setBusy(true);
    try { await api(`/knowledge/suggestions/${id}/review`, { method: 'POST', body: { accept } }); await load(); flash(accept ? 'Sugestão convertida em rascunho. Revise e aprove o conteúdo antes de usá-lo.' : 'Sugestão rejeitada.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Falha ao revisar sugestão'); }
    finally { setBusy(false); }
  }
  return <section className="live-card live-knowledge-manager"><h2>Base de conhecimento da Eva</h2><p>Somente conteúdos aprovados podem orientar respostas. Edições voltam para revisão; a versão anterior fica registrada.</p>
    {canEdit && <div className="live-knowledge-list"><h3>Sugestões de atendimentos humanos</h3><p>A extração automática propõe conteúdos. Aceitar cria apenas um rascunho; a Eva só usa depois da aprovação final.</p>{suggestions.map((suggestion) => <article className="live-knowledge-entry" key={suggestion.id}><strong>{suggestion.suggested_title}</strong><p>{suggestion.suggested_content}</p><div className="live-action-row"><button type="button" className="button button-primary" disabled={busy} onClick={() => void review(suggestion.id, true)}>Revisar como rascunho</button><button type="button" className="button button-outline" disabled={busy} onClick={() => void review(suggestion.id, false)}>Rejeitar</button></div></article>)}{!suggestions.length && <p>Nenhuma sugestão pendente.</p>}</div>}
    {canEdit && <form onSubmit={save} className="live-knowledge-form"><label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Ex.: Procedimento para proprietários" /></label><label>Informação ou instrução<textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={16000} required rows={7} placeholder="Escreva somente informações confirmadas pela Lopes Aluga." /></label><div className="live-action-row"><button className="button button-primary" disabled={busy || !title.trim() || !content.trim()}>{editing ? 'Salvar edição' : 'Adicionar rascunho'}</button>{editing && <button type="button" className="button button-outline" onClick={reset}>Cancelar</button>}</div></form>}
    {canEdit && <form onSubmit={upload} className="live-knowledge-form"><h3>Anexar documento</h3><p>PDF ou TXT até 5 MB. O arquivo fica privado; revise e transcreva os fatos antes de aprová-los para a Eva.</p><label>Título<input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} required maxLength={160} placeholder="Ex.: Política de garantias" /></label><label>Arquivo<input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setDocument(e.target.files?.[0] ?? null)} required /></label><button className="button button-primary" disabled={busy || !document || !documentTitle.trim()}>Anexar como rascunho</button></form>}
    <div className="live-knowledge-list">{entries.map((entry) => <article key={entry.id} className="live-knowledge-entry"><div><strong>{entry.title}</strong><small>v{entry.version} · {entry.status === 'approved' ? 'Aprovado' : entry.status === 'archived' ? 'Arquivado' : 'Rascunho'}</small></div><p>{entry.content}</p>{canEdit && entry.source_type === 'document' && entry.source_path && <a href={`/api/knowledge/${entry.id}/document`} target="_blank" rel="noreferrer">Baixar documento original</a>}{canEdit && <div className="live-action-row"><button type="button" className="button button-outline" disabled={busy} onClick={() => { setEditing(entry.id); setTitle(entry.title); setContent(entry.content); }}>Editar</button>{entry.status !== 'approved' && <button type="button" className="button button-primary" disabled={busy} onClick={() => void change(entry.id, 'approve')}>Aprovar</button>}{entry.status !== 'archived' && <button type="button" className="button button-outline" disabled={busy} onClick={() => void change(entry.id, 'archive')}>Arquivar</button>}</div>}</article>)}{!entries.length && <p>Nenhum conteúdo cadastrado.</p>}</div>
  </section>;
}

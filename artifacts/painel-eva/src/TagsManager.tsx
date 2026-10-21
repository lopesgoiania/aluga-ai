import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, type Tag } from './services/api';

export default function TagsManager({ flash, onChange }: { flash: (message: string) => void; onChange: () => Promise<void> }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5B8DEF');
  const [busy, setBusy] = useState(false);
  const load = async () => { const result = await api<{ tags: Tag[] }>('/tags'); setTags(result.tags); };
  useEffect(() => { void load().catch((error) => flash(error instanceof Error ? error.message : 'Falha ao carregar etiquetas')); }, []);
  const reset = () => { setEditing(null); setName(''); setColor('#5B8DEF'); };
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api(editing ? `/tags/${editing}` : '/tags', { method: editing ? 'PATCH' : 'POST', body: { name: name.trim(), color } });
      await Promise.all([load(), onChange()]); reset(); flash('Etiqueta salva.');
    } catch (error) { flash(error instanceof Error ? error.message : 'Não foi possível salvar a etiqueta'); }
    finally { setBusy(false); }
  }
  async function remove(tag: Tag) {
    if (!window.confirm(`Remover a etiqueta “${tag.name}” de todos os contatos? O histórico será preservado.`)) return;
    setBusy(true);
    try { await api(`/tags/${tag.id}`, { method: 'DELETE' }); await Promise.all([load(), onChange()]); if (editing === tag.id) reset(); flash('Etiqueta removida.'); }
    catch (error) { flash(error instanceof Error ? error.message : 'Não foi possível remover a etiqueta'); }
    finally { setBusy(false); }
  }
  return <section className="live-card live-tag-manager"><h2>Etiquetas</h2><p>Crie, edite ou remova qualquer etiqueta. As alterações aparecem nos contatos e nos filtros.</p>
    <form className="live-tag-form" onSubmit={save}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required placeholder="Nome da etiqueta" /></label><label>Cor<input aria-label="Cor da etiqueta" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><button className="button button-primary" disabled={busy || !name.trim()}>{editing ? 'Salvar alterações' : <><Plus size={15} /> Criar etiqueta</>}</button>{editing && <button type="button" className="button button-outline" onClick={reset}><X size={15} /> Cancelar</button>}</form>
    <div className="live-tag-list">{tags.map((tag) => <div className="live-tag-row" key={tag.id}><span className="live-tag-pill" style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</span><div><button type="button" disabled={busy} aria-label={`Editar ${tag.name}`} title={`Editar ${tag.name}`} onClick={() => { setEditing(tag.id); setName(tag.name); setColor(tag.color); }}><Pencil size={16} /></button><button type="button" disabled={busy} aria-label={`Remover ${tag.name}`} title={`Remover ${tag.name}`} onClick={() => void remove(tag)}><Trash2 size={16} /></button></div></div>)}{!tags.length && <p>Nenhuma etiqueta cadastrada.</p>}</div>
  </section>;
}

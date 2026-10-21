import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const base = process.env.SUPABASE_AGENT_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_AGENT_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Configure o Supabase operacional antes do backup.');

const tables = [
  'contacts', 'contact_tags', 'contact_tag_blocks', 'chat_sessions',
  'chat_messages', 'message_buffer', 'property_interests', 'agent_events',
  'human_handoffs', 'panel_outbound', 'panel_audit_log',
  'panel_internal_messages', 'chat_message_events', 'chat_media_archive',
  'agent_learning_scans', 'agent_knowledge_suggestions',
];
const data = { created_at: new Date().toISOString(), source: 'aluga-ai', tables: {} };
for (const table of tables) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const url = new URL(`${base}/rest/v1/${table}`);
    url.searchParams.set('select', '*');
    const response = await fetch(url, { headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      Range: `${offset}-${offset + 499}`, 'Range-Unit': 'items',
    } });
    if (!response.ok) throw new Error(`Backup interrompido: ${table} retornou ${response.status}.`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 500) break;
  }
  data.tables[table] = rows;
  process.stdout.write(`${table}: ${rows.length}\n`);
}

const directory = resolve('..', 'backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const filename = `atendimentos-${data.created_at.replace(/[:.]/g, '-')}.json.gz`;
const path = resolve(directory, filename);
writeFileSync(path, gzipSync(JSON.stringify(data)), { mode: 0o600, flag: 'wx' });
process.stdout.write(`Backup local criado: ${path}\n`);

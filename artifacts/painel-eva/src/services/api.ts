export type Operator = { user_id: string; display_name: string; signature?: string | null; role: 'admin' | 'supervisor' | 'attendant' };
export type Tag = { id: string; slug: string; name: string; color: string };
export type ContactRow = Record<string, unknown> & { id: string; phone?: string; name?: string; whatsapp_name?: string; push_name?: string; full_name?: string };
export type HandoffRow = { id: string; status: string; assigned_to?: string | null; reason?: string; requested_at?: string; created_at: string };
export type SessionRow = { id: string; contact_id?: string; channel?: string; phone: string; status: string; ai_enabled: boolean; initial_new?: boolean; metadata?: Record<string, unknown>; profile?: string; conversation_summary?: string; qualification_data?: Record<string, unknown>; last_message_at?: string; created_at: string; closed_at?: string | null; contact: ContactRow | null; handoff: HandoffRow | null; tags: Tag[] };
export type MessageRow = { id: string; sender_type: string; direction: string; content?: string; normalized_content?: string; message_type?: string; media_url?: string; media_filename?: string; deleted_at_provider?: string | null; created_at: string; metadata?: Record<string, unknown> };
export type PropertyRow = Record<string, unknown> & { id: string; title?: string; property_type?: string; neighborhood?: string; city?: string; rental_price?: number; price?: number; area?: number; bedrooms?: number; parking?: number; url?: string; code?: string; transaction_type?: string };
export type EventRow = { id: string; session_id?: string; event_type: string; tool_name?: string; error_message?: string; created_at: string };
export type OutboundAlert = { id: string; session_id: string; body: string; status: 'reserved' | 'uncertain'; created_at: string };
export type ConversationDetail = { session: SessionRow; messages: MessageRow[]; handoffs: HandoffRow[]; interests: Record<string, unknown>[] };

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { credentials: 'same-origin', method: options.method ?? 'GET', headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); }
  catch { throw new ApiError('A API do painel não está acessível.', 503); }
  let data: any;
  try { data = await response.json(); } catch { throw new ApiError('Resposta inválida da API.', 502); }
  if (!response.ok) throw new ApiError(data?.error ?? `Erro ${response.status}`, response.status);
  return data as T;
}

export const phoneLabel = (phone: string) => {
  const digits = phone.replace(/@.*$/, '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 12 && digits.startsWith('55')) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  return digits || phone;
};
export const displayName = (session: SessionRow) => String(session.contact?.name || session.contact?.whatsapp_name || session.contact?.full_name || session.contact?.push_name || phoneLabel(session.phone));
export const inboxCategory = (session: SessionRow, operator: Operator): 'new' | 'mine' | 'others' => {
  const owner = session.handoff?.assigned_to?.trim();
  if (owner) return owner === operator.display_name ? 'mine' : 'others';
  return session.metadata?.panel_queue === 'new' || session.initial_new ? 'new' : 'others';
};
export const stateOf = (session: SessionRow) => session.closed_at || session.status === 'encerrado' ? 'Encerrada' : session.ai_enabled ? 'Eva ativa' : session.handoff?.status === 'accepted' || session.handoff?.status === 'active' || session.handoff?.status === 'em_atendimento' ? 'Humano assumiu' : 'Aguardando atendimento';
export const dateTime = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—';
export const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Valor sob consulta';
export const rentalPriceLabel = (property: PropertyRow) => {
  const rental = Number(property.rental_price);
  const sale = Number(property.price);
  if (!Number.isFinite(rental) || rental <= 0) return 'Valor de aluguel sob consulta';
  if (/revenda/i.test(property.transaction_type ?? '') && Number.isFinite(sale) && sale > 0 && rental >= sale) return 'Valor de aluguel a confirmar';
  return money(rental);
};

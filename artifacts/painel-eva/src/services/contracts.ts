export type ConversationState = 'Eva ativa' | 'Aguardando atendimento' | 'Humano assumiu' | 'Encerrada';
export type Role = 'Administrador' | 'Supervisor' | 'Atendente';
export type ConnectionStatus = 'Conectado' | 'Conectando' | 'Desconectado' | 'Erro';
export interface Conversation { id: string; contactId: string; state: ConversationState; ownerId?: string; priority: 'Urgente' | 'Alta' | 'Normal'; openedAt: string; lastMessageAt: string; }
export interface Contact { id: string; name: string; initials: string; phone: string; state: ConversationState; priority: 'Urgente' | 'Alta' | 'Normal'; tag: string; owner?: string; preview: string; time: string; unread: number; summary: string; }
export interface Message { id: string; kind: 'client' | 'eva' | 'human' | 'system'; text: string; time: string; media?: 'audio' | 'image' | 'pdf'; status?: 'Enviado' | 'Não enviado' | 'Lido'; }
export interface Incident { id: string; title: string; source: string; severity: 'Crítica' | 'Alta' | 'Média'; state: 'Aberto' | 'Reconhecido' | 'Resolvido'; time: string; affected: string; owner: string; suggestion: string; timeline: { time: string; text: string }[]; }
export interface Property { id: string; code: string; title: string; neighborhood: string; price: string; details: string; tone: string; }
export interface Operator { id: string; name: string; initials: string; role: Role; load: number; status: string; }
export interface Handoff { id: string; conversationId: string; requestedAt: string; reason: string; ownerId?: string; status: 'Aguardando atendimento' | 'Humano assumiu' | 'Resolvido'; }
export interface DemoServices {
  assume(id: string, operator: string): Promise<void>;
  reply(id: string, text: string): Promise<Message>;
  returnToEva(id: string): Promise<void>;
  acknowledgeIncident(id: string): Promise<void>;
}
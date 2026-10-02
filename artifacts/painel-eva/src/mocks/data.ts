import type { Contact, Incident, Message, Operator, Property } from '../services/contracts';

export const operators: Operator[] = [
  { id: 'op1', name: 'Marina Costa', initials: 'MC', role: 'Atendente', load: 4, status: 'Disponível' },
  { id: 'op2', name: 'Caio Ribeiro', initials: 'CR', role: 'Supervisor', load: 7, status: 'Em atendimento' },
  { id: 'op3', name: 'Lívia Martins', initials: 'LM', role: 'Atendente', load: 2, status: 'Disponível' },
];
export const seedContacts: Contact[] = [
  { id: 'c1', name: 'Camila Nogueira', initials: 'CN', phone: '(11) 98472-3610', state: 'Eva ativa', priority: 'Alta', tag: 'Novo lead', preview: 'Queria saber se aceita pet no apartamento', time: 'agora', unread: 2, summary: 'Busca apartamento de 2 quartos, aceita pets e precisa de mudança até o fim do mês.' },
  { id: 'c2', name: 'Rafael Siqueira', initials: 'RS', phone: '(11) 99314-0286', state: 'Aguardando atendimento', priority: 'Urgente', tag: 'Aguardando', preview: 'Preciso falar com uma pessoa, por favor', time: '3 min', unread: 1, summary: 'Cliente solicitou atendimento humano após dúvidas sobre garantia locatícia.' },
  { id: 'c3', name: 'Joana Pires', initials: 'JP', phone: '(11) 97651-4402', state: 'Humano assumiu', priority: 'Normal', tag: 'Em atendimento', owner: 'Marina Costa', preview: 'Pode agendar para sábado de manhã?', time: '8 min', unread: 0, summary: 'Interessada em visitar unidade no bairro Saúde. Prefere manhãs.' },
  { id: 'c4', name: 'André Luiz', initials: 'AL', phone: '(11) 98105-7734', state: 'Eva ativa', priority: 'Normal', tag: 'Inquilino', preview: 'Enviei o comprovante agora', time: '14 min', unread: 0, summary: 'Inquilino atual. Dúvida sobre envio de documentos para cadastro.' },
  { id: 'c5', name: 'Beatriz Faria', initials: 'BF', phone: '(11) 99268-2015', state: 'Humano assumiu', priority: 'Alta', tag: 'Proprietário', owner: 'Caio Ribeiro', preview: 'O anúncio pode ser atualizado hoje?', time: '21 min', unread: 0, summary: 'Proprietária de imóvel na Vila Mariana. Solicita atualização do anúncio.' },
];
export const seedMessages: Record<string, Message[]> = {
  c1: [
    { id: 'm1', kind: 'system', text: 'Conversa iniciada · Hoje, 09:12', time: '09:12' },
    { id: 'm2', kind: 'client', text: 'Oi! Vi um apartamento na Saúde e queria saber mais.', time: '09:12', status: 'Lido' },
    { id: 'm3', kind: 'eva', text: 'Olá, Camila! Posso ajudar. Você procura quantos quartos?', time: '09:13', status: 'Lido' },
    { id: 'm4', kind: 'client', text: 'Dois quartos, e queria saber se aceita pet no apartamento.', time: '09:14', status: 'Lido' },
    { id: 'm5', kind: 'eva', text: 'Vou confirmar os detalhes da unidade e já te retorno. Separei uma opção que pode combinar com você.', time: '09:14', status: 'Enviado' },
    { id: 'm6', kind: 'client', text: 'Audio recebido · 0:08', time: '09:16', media: 'audio', status: 'Lido' },
    { id: 'm7', kind: 'eva', text: 'Apartamento ilustrativo · Rua dos Crisântemos, Saúde', time: '09:17', media: 'image', status: 'Enviado' },
    { id: 'm8', kind: 'client', text: 'Queria a ficha completa também.', time: '09:18', status: 'Lido' },
  ],
  c2: [{ id: 'a1', kind: 'client', text: 'Preciso falar com uma pessoa, por favor.', time: '09:31' }, { id: 'a2', kind: 'system', text: 'Solicitação encaminhada para a fila humana', time: '09:32' }],
  c3: [{ id: 'b1', kind: 'client', text: 'Gostei do apartamento na Saúde.', time: '09:22' }, { id: 'b2', kind: 'human', text: 'Que bom, Joana. Posso organizar uma visita no sábado pela manhã.', time: '09:24', status: 'Lido' }, { id: 'b3', kind: 'client', text: 'Pode agendar para sábado de manhã?', time: '09:26' }],
  c4: [{ id: 'd1', kind: 'client', text: 'Enviei o comprovante agora.', time: '09:05' }, { id: 'd2', kind: 'eva', text: 'Recebi seu áudio. Vou verificar o documento para você.', time: '09:06', media: 'pdf', status: 'Não enviado' }],
  c5: [{ id: 'e1', kind: 'client', text: 'O anúncio pode ser atualizado hoje?', time: '08:58' }, { id: 'e2', kind: 'human', text: 'Vou confirmar a previsão de atualização e te aviso.', time: '09:01', status: 'Enviado' }],
};
export const properties: Property[] = [
  { id: 'p1', code: 'LA-2048', title: 'Apartamento com varanda', neighborhood: 'Saúde · São Paulo', price: 'R$ 2.850/mês', details: '2 quartos · 68 m² · 1 vaga', tone: 'property-blue' },
  { id: 'p2', code: 'LA-1892', title: 'Luz natural e espaço', neighborhood: 'Vila Mariana · São Paulo', price: 'R$ 3.420/mês', details: '2 quartos · 74 m² · 1 vaga', tone: 'property-sand' },
  { id: 'p3', code: 'LA-3116', title: 'Compacto perto do metrô', neighborhood: 'Paraíso · São Paulo', price: 'R$ 2.190/mês', details: '1 quarto · 42 m² · sem vaga', tone: 'property-lilac' },
  { id: 'p4', code: 'LA-0784', title: 'Casa com quintal', neighborhood: 'Ipiranga · São Paulo', price: 'R$ 4.100/mês', details: '3 quartos · 112 m² · 2 vagas', tone: 'property-green' },
];
export const seedIncidents: Incident[] = [
  { id: 'i1', title: 'Instância WhatsApp sem resposta', source: 'Evolution · instância principal', severity: 'Crítica', state: 'Aberto', time: '09:42', affected: '12 conversas em risco', owner: 'Não atribuído', suggestion: 'Verifique a conectividade antes de tentar reenviar mensagens. Envios duplicados podem ocorrer.', timeline: [{ time: '09:42', text: 'Falha de verificação detectada pela checagem operacional.' }, { time: '09:43', text: 'Novas tentativas automáticas suspensas no demo.' }] },
  { id: 'i2', title: 'Mensagem aguardando confirmação', source: 'Fila de mensagens', severity: 'Alta', state: 'Reconhecido', time: '09:28', affected: 'Conversa · André Luiz', owner: 'Marina Costa', suggestion: 'Confira o status da conversa antes de enviar novamente.', timeline: [{ time: '09:28', text: 'Mensagem ultrapassou o tempo de confirmação.' }, { time: '09:35', text: 'Reconhecido por Marina Costa.' }] },
  { id: 'i3', title: 'Catálogo sem atualização recente', source: 'Sincronização de imóveis', severity: 'Média', state: 'Aberto', time: '08:10', affected: '27 imóveis', owner: 'Não atribuído', suggestion: 'Confirme a última execução da sincronização do catálogo.', timeline: [{ time: '08:10', text: 'Última atualização fora da janela esperada.' }] },
];
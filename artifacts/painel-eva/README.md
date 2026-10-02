# Painel Eva — demonstração local

Console operacional fictício em português brasileiro para a equipe Lopes Aluga. A interface foi criada como protótipo frontend; nenhum atendimento, conexão ou indicador deste projeto representa operação real.

## Executar

Na raiz do workspace:

```sh
cd artifacts/painel-eva
pnpm install
pnpm dev
```

Produção local: `pnpm build` e `pnpm serve`.

## Rotas

| Rota | Módulo |
| --- | --- |
| `/` | Visão geral operacional |
| `/atendimentos` | Caixa de entrada: lista, mensagens e contexto |
| `/fila-humana` | Chamados aguardando e assumidos |
| `/leads` | CRM em quadro Kanban ou tabela |
| `/imoveis` | Catálogo ilustrativo com busca e filtros |
| `/alertas` | Incidentes, detalhe e linha do tempo |
| `/conexao` | Estado ilustrativo da instância e QR não funcional |
| `/relatorios` | Indicadores operacionais de exemplo |
| `/equipe` | Papéis e carga de atendimento |
| `/configuracoes` | Horários, prazo e regras de fila |

## Organização de dados e integração futura

- `src/mocks/data.ts` contém os contatos, mensagens, imóveis, operadores e incidentes fictícios.
- `src/services/contracts.ts` define contratos TypeScript para `Conversation`/`Contact`, `Message`, `Incident`, `Property`, `Operator` e operações de atendimento.
- `src/services/demo-service.ts` implementa as operações de exemplo com atraso local breve. Substitua este adaptador por clients tipados no futuro; o restante da interface deve chamar apenas a camada de serviço.
- `src/App.tsx` reúne estado local de demonstração, navegação e módulos; `src/index.css` e `src/utility.css` guardam tokens, elementos compartilhados e comportamento responsivo.

Pontos de integração planejados:

1. Conversation/contact/message: criar client de API para consultar `contacts`, `chat_sessions` e `chat_messages`, carregamento incremental, estado real do canal e atualizações em tempo real.
2. Assumir, responder e devolver à Eva: conectar os métodos do `DemoServices` aos endpoints autorizados de handoff. Confirmar pause/resume no servidor; uma resposta enviada não deve ser mostrada como entregue sem confirmação.
3. Fila: conectar ações de aceite, atribuição e distribuição a endpoints que validem papel e concorrência.
4. Alertas: carregar `agent_events` e incidentes persistidos, anexar tentativas/execução e reconhecer no servidor. Reprocessamento exige política segura e idempotência.
5. Imóveis: buscar o catálogo por API própria e confirmar a disponibilidade antes de exibir como vigente.
6. Equipe/configurações/relatórios: carregar dados autorizados; manter chaves e credenciais apenas no servidor.

Nenhuma dessas integrações está ativa. Esta entrega não acessa Supabase, Evolution API, n8n, WhatsApp nem qualquer API externa. Não há persistência: atualizações são mantidas apenas no estado React durante a sessão e recarregar a página restaura os mocks. QR code é um padrão visual sem credencial. Papéis são referências visuais, não autenticação ou autorização.

## Interações incluídas

- Fluxo da conversa: Eva ativa → assumir e pausar Eva → resposta humana local → devolver e retomar Eva. O fluxo principal está em `Atendimentos`.
- Filtros de conversas/estado, busca local, navegação para contexto e alternância lista/conversa/contexto em viewport móvel.
- Fila: aceitar chamado e distribuição visual de demonstração.
- Alertas: selecionar incidente, examinar timeline e reconhecer com um novo evento local.
- CRM: alternar Kanban/tabela, filtrar estágio e mover oportunidade localmente.
- Imóveis, conexão, relatórios, equipe e configurações têm controles com feedback claro de demonstração.

## Direção visual

Layout de console operacional em três regiões, com azul operacional, violeta para a Eva, superfícies azul-acinzentadas e tipografia local sem carregamento externo. Métricas usam uma pilha monoespaçada; status e estados têm rótulo textual além da cor. Navegação mobile troca a lista, a conversa e o contexto por painéis.
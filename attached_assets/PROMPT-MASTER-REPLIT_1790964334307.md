# Prompt master — Painel Eva / Lopes Aluga

Crie um **aplicativo web executável e responsivo**, em português brasileiro, chamado **Painel Eva**, para a Lopes Aluga. Ele será a central operacional de atendimento imobiliário pelo WhatsApp: uma equipe acompanha conversas conduzidas pela agente de IA Eva, assume atendimentos humanos, consulta imóveis apresentados, gerencia leads, visualiza alertas e acompanha a conexão do WhatsApp.

## Referências anexas e direção visual

Use os arquivos anexos `referencias/01-dashboard-visual.png`, `referencias/02-crm-kanban.png`, `referencias/03-atendimento-referencia.svg` e `design-tokens.json` como referências. **Não copie os logotipos, nomes, marcas, textos, personagens, selo Meta ou layout pixel a pixel**. Crie identidade original para a Lopes Aluga/Eva.

- Da imagem 01, absorva a linguagem de dashboard: fundo claro, cartões brancos, bordas e sombras suaves, excelente respiro, gráficos legíveis e visual premium. Substitua métricas genéricas de chatbot por indicadores operacionais reais do atendimento.
- Da imagem 02, absorva a lógica de CRM/Kanban: colunas, cards compactos, responsáveis, etiquetas, prioridades e tempo de espera.
- Do SVG 03, absorva a organização da caixa de entrada: lista de conversas, área central de mensagens e barra de ações, com leitura rápida do estado da conversa. Não reproduza a marca Helena CRM nem o selo/parceria Meta.
- O arquivo `design-tokens.json` define as cores, tipografia, espaçamento, raios, sombras, componentes, layout e regras de acessibilidade. Use esses valores como fonte de verdade e crie variáveis CSS ou tema equivalente; evite cores e medidas avulsas.
- Azul `#0669E1` é a cor principal; violeta `#4F46E5` identifica a Eva e recursos de IA; verde é conexão/sucesso; vermelho é falha/urgência. Evite gradientes fortes, vidro excessivo e aparência de template genérico.

## Contexto real do produto

A arquitetura existente é **WhatsApp ↔ Evolution API ↔ n8n/Eva ↔ Supabase operacional `aluga-ai`**. Existe outro projeto Supabase, **`Buscaimóveis`**, que guarda o catálogo sincronizado por um workflow de scraping. O painel será a interface de operação e observabilidade sobre essa arquitetura; **não substitua o n8n, não recrie a Eva, não crie um banco paralelo e não integre serviços reais nesta entrega visual**. A integração real será feita depois sobre o código exportado.

No banco operacional já existem: `contacts`, `chat_sessions`, `chat_messages`, `message_buffer`, `property_interests`, `agent_events`, `human_handoffs`, `tags` e `contact_tags`. Os estados incluem Eva ativa (`ai_enabled=true`), aguardando atendimento humano, atendimento humano assumido e sessão encerrada. Etiquetas automáticas incluem `novo_lead`, `inquilino`, `proprietario`, `corretor`, `aguardando_atendimento` e `em_atendimento_humano`. O atendimento humano já foi validado: ao assumir ou enviar manualmente, a Eva pausa; ao devolver, a Eva retoma e o chamado é resolvido.

O público inicial é uma equipe interna com três papéis: **Administrador**, **Supervisor** e **Atendente**. Crie a experiência visual de permissões; a autorização real será implementada depois. Não insira chaves de Supabase, Evolution, OpenAI ou n8n no código ou no navegador.

## Estrutura de navegação

Use uma navegação lateral no desktop e uma navegação adaptada no celular. Itens: **Visão geral**, **Atendimentos**, **Fila humana**, **Leads/CRM**, **Imóveis**, **Alertas**, **Conexão WhatsApp**, **Relatórios**, **Equipe** e **Configurações**. A busca global fica no topo. O nome do produto deve ser **Painel Eva**, com a marca textual **Lopes Aluga**; crie um ícone original simples e substituível por marca definitiva.

## Telas obrigatórias

### 1. Visão geral

Painel operacional, não dashboard de marketing. Exiba: status da instância WhatsApp, conversas com Eva, conversas com humano, chamados aguardando, incidentes abertos, mensagens atrasadas e tempo de primeira resposta. Mostre volume de conversas por dia, evolução dos handoffs e fila por prioridade. Cada cartão deve abrir a lista correspondente. Métricas em dados de demonstração devem trazer indicação discreta de **dados de exemplo**.

### 2. Atendimentos — tela mais importante

Desktop em três regiões: lista de conversas à esquerda, mensagens no centro, contexto à direita. A lista deve ter busca, filtros por estado, etiqueta, responsável e prioridade, contagem de não lidas, última mensagem e tempo de espera. A conversa deve distinguir cliente, Eva, atendente e eventos do sistema; permitir visualizar texto, áudio, imagem e documento/PDF. Mostre status de envio sem assumir que `enviado` significa `entregue`.

No painel de contexto, exiba perfil inferido, etiquetas, resumo, critérios de busca, imóveis apresentados, interesses, responsável e histórico de handoff. O cabeçalho deve mostrar claramente **Eva ativa**, **Aguardando atendimento**, **Humano assumiu** ou **Encerrada**. O campo de resposta humana só aparece habilitado após assumir a conversa. Ações visíveis: **Assumir**, **Atribuir**, **Responder**, **Devolver à Eva**, **Encerrar** e **Nota interna**. Projetar confirmação e feedback para ações que mudam o estado.

### 3. Fila humana

Lista de chamados pendentes e assumidos com prioridade, motivo, cliente, responsável e duração da espera. Supervisores devem poder imaginar uma ação de distribuição e atendentes, uma ação de aceite. Destaque chamados vencidos por prazo. A visualização deve funcionar também no celular.

### 4. Leads/CRM

Kanban inspirado na referência 02, com estágios comerciais **Novo lead**, **Em qualificação**, **Imóveis apresentados**, **Visita/interesse**, **Negociação** e **Concluído**. Mostre etiquetas, responsável, imóvel de interesse, próxima ação e último contato. **Estágio comercial não é o mesmo que estado técnico da Eva**: uma pessoa pode estar em `Em qualificação` e ter o atendimento humano assumido. Permitir alternar entre Kanban e tabela, com filtros.

### 5. Imóveis

Visão de catálogo em leitura com filtros por tipo, bairro/cidade, faixa de preço e metragem. Exiba foto, código, preço, localização, características e data da última atualização. Na conversa, mostre quais imóveis a Eva já enviou ao cliente. Não invente disponibilidade garantida.

### 6. Alertas e saúde da operação

Lista de incidentes com severidade, origem, horário, conversa/lote afetado, estado (**Aberto**, **Reconhecido**, **Resolvido**), responsável e ação sugerida. Exemplos de incidentes: Evolution desconectada, webhook sem tráfego esperado, workflow falhou, mensagem presa no buffer, envio sem confirmação, serviço de IA indisponível, chamado humano vencido, catálogo desatualizado. Tela de detalhe com linha do tempo, tentativas, link para execução e botão de reconhecimento. Não simule reprocessamento como se fosse seguro em todo caso; mostre apenas a interface e uma explicação contextual.

### 7. Conexão WhatsApp

Status da instância Evolution, última verificação, estado do webhook e QR Code ilustrativo quando desconectada. Incluir estados Conectado, Conectando, Desconectado e Erro. Ações de reconexão/configuração aparecem somente para Administrador. O QR é visual de demonstração, nunca um QR funcional falso.

### 8. Relatórios, equipe e configurações

Relatórios de volume, primeira resposta, resolução, taxa de handoff, incidentes e imóveis apresentados. Equipe com usuários, papéis e atribuições. Configurações com horários, prazos de alerta e regras de fila. Use conteúdo de exemplo claramente marcado.

## Componentes e estados

Crie componentes reutilizáveis: sidebar, topbar, cartões de métrica, filtros, tabela, Kanban, cartão de lead, lista de conversas, bolha de mensagem, visualizador de mídia, painel de contexto, etiquetas, indicador de estado da Eva, timeline de eventos, alertas, modal de confirmação, toast, skeleton e estados vazios. Especifique visualmente hover, foco, selecionado, desabilitado, carregando e erro.

Inclua exemplos claros de: WhatsApp desconectado, mensagem não enviada, conversa assumida por outro atendente, Eva pausada, ausência de imóveis, fila vazia, incidente crítico e retorno da Eva. Use ícone/texto além da cor para comunicar estados. Respeite teclado, foco visível, contraste e área de toque adequada.

## Comportamento e dados de demonstração

O protótipo deve ser **navegável e executável**, com interações de interface que funcionem sobre dados fictícios locais. Separe esses dados numa pasta de `mocks` ou equivalente. Crie uma camada `services`/`api` com contratos e tipos para futura integração; por exemplo `Conversation`, `Message`, `Contact`, `Property`, `Handoff`, `Incident`, `Operator`, `ConnectionStatus`. Botões podem atualizar o estado local e mostrar um aviso de demonstração, mas não devem fingir persistência real. Documente exatamente onde conectar as APIs no futuro.

O fluxo principal para demonstrar é: abrir conversa → ver Eva ativa → assumir → responder como humano → ver Eva pausada e etiqueta humana → devolver à Eva → ver Eva ativa novamente. Outro fluxo é: incidente aberto → abrir detalhe → reconhecer → ver histórico de reconhecimento. No celular, a lista, conversa e contexto devem ser páginas ou painéis alternáveis, evitando três colunas espremidas.

## Entrega técnica esperada

Gere **código-fonte**, não apenas imagens ou frames. Prefira React + TypeScript com estrutura clara de componentes, páginas, tema/tokens e mocks. O projeto deve rodar fora do Replit com comandos documentados de instalação, desenvolvimento e build. Não amarre o frontend a um banco específico nesta etapa, não adicione autenticação simulada como se fosse segurança real e não inclua segredos. Inclua `README.md` com mapa de rotas, componentes e pontos de integração. Verifique o build e os principais fluxos de navegação.

Trabalhe primeiro nas quatro telas centrais: **Visão geral**, **Atendimentos**, **Fila humana** e **Alertas**. Revise a consistência visual e responsiva. Depois complete CRM, Imóveis, Conexão, Relatórios, Equipe e Configurações. A tela de Atendimentos é a prioridade funcional do produto; ela deve receber mais atenção que os gráficos do dashboard.

## Critério de qualidade

O resultado deve parecer um produto próprio da Lopes Aluga, pronto para receber integrações reais. Evite lorem ipsum, tabelas vazias decorativas, números sem significado, controles que parecem funcionais mas não dão feedback, logos de terceiros e cópia literal das referências. Use nomes e dados fictícios, nunca dados reais de clientes.

# Aluga Mais — integração operacional

O frontend não contém dados fictícios. Ele carrega conversas, handoffs, etiquetas, falhas do agente e catálogo via API autenticada; o servidor consulta os dois projetos Supabase e a Evolution. Sem configuração, a interface mostra as variáveis ausentes.

## Preparação

1. Execute `../../../sql/14-painel-eva.sql`, `../../../sql/15-filas-assinaturas-painel.sql` e `../../../sql/16-etiquetas-personalizaveis.sql`, nessa ordem, **somente** no Supabase `aluga-ai`. As três migrações foram aplicadas no ambiente atual em 05/10/2026.
2. Crie um usuário em Supabase Auth no projeto `aluga-ai` e registre o `user_id` em `public.panel_operators`, com papel `admin`, `supervisor` ou `attendant`.
3. Copie `../api-server/.env.example` para `../api-server/.env` e preencha as variáveis no Mac ou no servidor. Esse arquivo é ignorado pelo Git. Nunca use `VITE_` para chaves privilegiadas.
4. Na raiz do workspace, execute `pnpm install`, `pnpm --filter @workspace/api-server run dev` e, em outro terminal, `pnpm --filter @workspace/painel-eva run dev`.
5. Abra `http://localhost:5173` e faça login com o operador autorizado. `pnpm run build` verifica todos os pacotes.

A API local usa a porta 5050 porque a porta 5000 costuma estar ocupada pelo macOS. A aplicação usa o proxy do Vite em desenvolvimento; em produção, sirva `/api` e a aplicação web na mesma origem HTTPS.

## Publicação na Vercel

O repositório é um monorepo. Crie o projeto Vercel apontando para a **raiz do repositório**, sem selecionar `artifacts/painel-eva` como Root Directory. O `vercel.json` da raiz compila o painel e encaminha `/api/*` à função Express, mantendo login, cookies e interface no mesmo domínio. A Vercel precisa instalar as dependências com pnpm e usar Node.js 22 ou superior.

Configure como variáveis de ambiente **somente no servidor** os nomes de `artifacts/api-server/.env.example`: `SUPABASE_AGENT_URL`, `SUPABASE_AGENT_ANON_KEY`, `SUPABASE_AGENT_SERVICE_ROLE_KEY`, `SUPABASE_CATALOG_URL`, `SUPABASE_CATALOG_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `OPENAI_API_KEY` e, se desejar, `OPENAI_ASSIST_MODEL` e `PANEL_PUBLIC_URL`. Não configure essas chaves com prefixo `VITE_` e não as envie ao GitHub. `API_PORT` e `PANEL_HOST` são exclusivos do servidor local. `PANEL_ORIGIN` não é necessário quando a interface e a API usam o mesmo domínio.

Depois da publicação, abra `/api/healthz` e `/api/setup` no domínio da implantação. `setup` deve mostrar `configured: true`. Entre com um operador autorizado, confira a lista de conversas e o catálogo e, num número de teste, valide uma mensagem de saída. A API usa a Evolution e os projetos Supabase já existentes; publicar o painel não altera os webhooks da LIA no n8n.

## Estado das integrações

- `aluga-ai`: leitura de `chat_sessions`, `contacts`, `chat_messages`, `human_handoffs`, `tags`, `contact_tags`, `property_interests` e falhas de `agent_events`. Ações de assumir, devolver, encerrar e reservar/confirmar envio passam por funções SQL transacionais.
- `Buscaimóveis`: leitura de `public.properties` em projeto separado. A tela mostra até 200 registros por consulta e permite busca local nesses resultados; paginação e busca no catálogo completo ainda devem ser implementadas.
- Evolution: lista de instâncias, foto do contato, QR para administrador, criação de nova instância com o webhook de entrada existente, recuperação de mídias e envio de texto, áudio, imagens, documentos e figurinhas WebP pelo canal de origem da conversa. Um envio sem confirmação fica marcado como incerto; o painel não o repete automaticamente.
- Atendimento: histórico com rolagem independente, prévia de imagens, reprodução de áudios, download de documentos, transcrição recebida pelo fluxo n8n, editor de contato e campos personalizados. O compositor oferece anexos, figurinhas, gravação com contador e medidor visual, prévia do áudio e ações de IA em ícones. Sugestão e revisão de respostas exigem `OPENAI_API_KEY` no servidor e sempre entram como rascunho para revisão humana.
- Atribuição: uma conversa em atendimento humano só pode ser respondida pelo operador atribuído. Administradores e supervisores podem usar **Assumir neste painel** para transferir uma atribuição externa (por exemplo, `WhatsApp`) para si; a troca fica registrada em `panel_audit_log`. Se houver envio pendente ou incerto, a transferência é bloqueada até a conferência.
- Filas: **Novos** contém conversas sem responsável que ainda não receberam resposta da LIA e as conversas devolvidas explicitamente à fila; **Meus** contém conversas atribuídas ao usuário logado; **Outros** contém as demais, inclusive as conduzidas pela LIA após a primeira resposta. Transferir para Novos pausa a LIA; transferir para um atendente atribui responsabilidade; transferir para LIA resolve a transferência humana e retoma a IA. O banco executa essas mudanças em uma transação.
- Assinaturas: cada operador define a sua em Configurações. Mensagens de texto enviadas pelo painel recebem `*Nome:*` na primeira linha para que o WhatsApp exiba o nome em negrito. A assinatura da LIA está preparada no JSON local `../../../workflows-n8n/06-persistencia-envio.json`. É preciso atualizar o workflow publicado no n8n para que o novo nome apareça nas mensagens enviadas.
- Etiquetas: em Configurações é possível criar, renomear, alterar a cor e desativar qualquer etiqueta, inclusive as padrão. O slug interno permanece estável para as automações. A remoção preserva o histórico e tira a etiqueta dos contatos e filtros. Na conversa, cada etiqueta pode ser adicionada ou removida; uma remoção manual prevalece sobre as regras automáticas até que alguém a adicione novamente.
- A sidebar pode ser recolhida e a escolha permanece no navegador. Em Atendimentos, o cabeçalho descritivo foi removido para ampliar a área do chat.
- Usuários: o administrador convida por e-mail, define papel e equipes, acompanha a confirmação e pode reenviar convites pendentes. O convidado cria a própria senha ao abrir o link no Aluga Mais. Remover um usuário revoga imediatamente o acesso e desativa suas equipes; o registro e o histórico ficam preservados para auditoria.
- Convites: defina `PANEL_PUBLIC_URL=https://alugamais.vercel.app/` na Vercel e adicione essa origem em Supabase Auth > URL Configuration > Redirect URLs. Sem essa permissão, o Supabase pode redirecionar o convite para outra URL.
- Login: Supabase Auth do projeto `aluga-ai`. O servidor valida o usuário e busca o papel em `panel_operators`. Tokens são guardados em cookies HTTP-only.

## Limites atuais

Mídias antigas dependem de ainda estarem disponíveis na Evolution/WhatsApp. Para retenção durável, o fluxo de entrada precisa gravar os arquivos em Supabase Storage ao recebê-los. O editor mostra a transcrição já criada pelo n8n, mas mensagens anteriores sem `normalized_content` não têm transcrição retroativa. Os alertas exibem falhas reais de `agent_events`, mas não substituem uma camada persistente de incidentes. As métricas vêm das 100 sessões mais recentes; o catálogo mostra até 200 imóveis. Ainda faltam distribuição de fila, busca global no banco e atualização por Supabase Realtime. Valide o envio de áudio, anexos, figurinhas e o QR de uma nova instância em um número de teste antes de usar com clientes.

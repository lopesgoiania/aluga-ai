# Painel Eva — Lopes Aluga

Workspace React/Vite + Express do painel operacional. O frontend não contém dados de demonstração. Todas as consultas e ações passam pela API do servidor, que exige autenticação de operador e usa as credenciais do `aluga-ai`, `Buscaimóveis` e Evolution somente no servidor.

## Executar

1. Configure a migração `../sql/14-painel-eva.sql` no Supabase `aluga-ai` e cadastre um usuário em `panel_operators`.
2. Copie `artifacts/api-server/.env.example` para `artifacts/api-server/.env` e preencha as variáveis.
3. Execute `pnpm install` e, em terminais separados, `pnpm --filter @workspace/api-server run dev` e `pnpm --filter @workspace/painel-eva run dev`.
4. Abra `http://localhost:5173`. Execute `pnpm run build` para verificar o workspace.

Sem credenciais, a tela informa o que falta e não apresenta informações falsas. O detalhamento técnico e os limites atuais estão em `artifacts/painel-eva/README.md` e `../documentacao/painel-eva-integracao.md`.

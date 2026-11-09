# JeansStore

Loja virtual em Next.js 15, TypeScript e PostgreSQL (Neon). O catálogo e o estoque são lidos do banco; o servidor calcula preços e frete, cria pedidos e inicia o checkout hospedado do Mercado Pago. O navegador nunca envia valores de preço como fonte de verdade.

## Requisitos

- Node.js 22 e pnpm 9
- PostgreSQL/Neon
- Conta Mercado Pago com credenciais de teste e produção
- Conta Resend com domínio de envio verificado

## Desenvolvimento local

1. Instale as dependências: `pnpm install`.
2. Copie `.env.example` para `.env.local` e preencha as configurações. Gere `NEXTAUTH_SECRET` com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
3. Crie um banco PostgreSQL e configure `DATABASE_URL` com TLS habilitado (URL Neon com `sslmode=require`).
4. Aplique as migrations: `pnpm db:migrate`.
5. Inicie a aplicação: `pnpm dev`.

O catálogo inicia vazio. Cadastre produtos, preço em centavos e estoque por tamanho em `/admin`. Para liberar o painel, crie uma conta pela loja e, no banco, promova o usuário:

```sql
UPDATE users SET role = 'admin' WHERE email = 'seu-email@exemplo.com';
```

Saia e entre novamente para renovar a sessão. O painel permite cadastrar/editar produtos e estoque. Mantenha pelo menos um tamanho com estoque positivo e marque o produto como ativo para que apareça na loja.

## Integrações

- **Mercado Pago:** use credenciais de teste localmente e configure a URL pública `https://SEU_DOMINIO/api/webhooks/mercadopago` como webhook de pagamentos. Configure `MP_WEBHOOK_SECRET` com a assinatura secreta da integração. O pedido só é marcado como pago após a assinatura ser validada e o pagamento ser consultado diretamente na API do Mercado Pago.
- **Resend:** configure `RESEND_API_KEY` e `EMAIL_FROM` com um remetente verificado. O email de confirmação é enviado após o pagamento aprovado.
- **CEP:** o checkout consulta ViaCEP. A cotação de frete atual é uma tabela fixa configurável por variáveis em centavos; ela ainda não consulta transportadora. Os valores do `.env.example` são apenas exemplos e devem ser substituídos antes de qualquer venda.
- **Pedidos pendentes:** no plano Hobby, a Vercel agenda a expiração uma vez por dia, às 03:00 UTC. Configure `CRON_SECRET` no ambiente de produção. Como a limpeza é diária, a devolução de estoque pode ocorrer até aproximadamente 24 horas depois do prazo do pedido; para expiração mais rápida, use um plano Vercel que permita crons mais frequentes ou um agendador externo para chamar `GET /api/cron/expire-orders` com o cabeçalho `Authorization` configurado com `CRON_SECRET`.

## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

O GitHub Actions executa lint, verificação de tipos, testes unitários, auditoria das dependências e build em cada pull request e em atualizações de `main`.

## Checklist antes de produção

- [ ] Configurar variáveis de ambiente de produção distintas das de preview, incluindo `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SITE_URL`, `DATABASE_URL` e `CRON_SECRET`.
- [ ] Aplicar migrations e conferir usuários, catálogo, preços e estoque reais.
- [ ] Substituir as tarifas de exemplo por valores comerciais corretos ou integrar um serviço de frete.
- [ ] Cadastrar credenciais de produção do Mercado Pago e validar o webhook com pagamentos de teste antes da liberação.
- [ ] Verificar domínio/remetente no Resend e testar entrega dos emails.
- [ ] Configurar backups do banco e testar restauração.
- [ ] Publicar política de privacidade, termos de compra, trocas/devoluções e informações legais da empresa; validar LGPD e obrigações fiscais com profissionais responsáveis.
- [ ] Fazer teste ponta a ponta em ambiente de staging com banco e credenciais sandbox.

**Este repositório não pode ser colocado em produção apenas com o código:** não há credenciais de serviços, catálogo/estoque real, tarifas de transporte comerciais, domínio, políticas legais ou ambiente de staging neste workspace. Não use credenciais de sandbox para vender.

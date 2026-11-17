# Decisões iniciais de arquitetura

## Banco de desenvolvimento

- PostgreSQL 16 é executado localmente pelo Docker Compose.
- A porta padrão `5433` é publicada somente em `127.0.0.1` para evitar conflito
  com um PostgreSQL já usando `5432` neste ambiente; pode ser configurada.
- O volume nomeado `postgres_data` preserva os dados entre reinicializações.
- O Compose verifica a prontidão com `pg_isready`.
- O schema financeiro é criado e removido por migrations versionadas do
  MikroORM; não usar `schema:update` como substituto das migrations.
- As credenciais padrão são exclusivas para desenvolvimento local e podem ser
  substituídas pelas variáveis de ambiente documentadas no README.

## Persistência

- MikroORM 7 com o driver PostgreSQL foi escolhido; o `Money` é persistido como
  `numeric(38, 2)` exato e lido pelo ORM como string, junto com a moeda.
- A migration inicial cria `wallets`, `wager_transactions` e `wallet_ledger`,
  incluindo chaves estrangeiras compostas, índices de idempotência e reversão,
  checks de saldo/aritmética e triggers de integridade.
- O banco impede alterações e exclusões de ledger, inclusive `TRUNCATE`. Um
  trigger diferido também exige que as transações processadas e o saldo/version
  da wallet correspondam aos lançamentos confirmados na mesma transação SQL.
- A idempotência é única por `(provider_id, idempotency_key)`; o identificador
  externo também é único por provider. Só uma wallet por
  `(player_id, currency)` é permitida.
- A unidade de concorrência é a wallet: a camada de aplicação inicia uma
  transação MikroORM e adquire `PESSIMISTIC_WRITE` somente na linha daquela
  wallet. Movimentações de wallets distintas não compartilham lock global.
  Lança-se o ledger antes de atualizar saldo/version, dentro da mesma
  transação; triggers e constraints validam o resultado no commit.

## Aplicação

O projeto existente é uma aplicação Next.js. O roteiro descreve um serviço
backend NestJS; essa migração não é feita nesta etapa para não substituir a
estrutura atual sem uma decisão explícita. A persistência financeira usa
MikroORM e PostgreSQL; os casos de uso e a API financeira ainda serão
implementados na etapa seguinte.

## Domínio financeiro

- O domínio fica em `src/domain` e não depende de Next.js, NestJS ou do banco.
- `Money` guarda centavos em `bigint`; a entrada e a saída são strings com duas
  casas decimais. Códigos monetários são aceitos no formato ISO 4217 de três
  letras maiúsculas.
- `Wallet` aplica créditos e débitos, rejeita saldo negativo e devolve um
  `WalletLedgerEntry` validado a cada movimentação. A persistência atômica do
  saldo e do lançamento será responsabilidade da camada de aplicação.
- `WagerTransaction` nasce em `PENDING`. Transações aguardando referência podem
  ir para `PENDING_REFERENCE`; ambos os estados podem terminar em `PROCESSED`,
  `REJECTED` ou `FAILED`. Estados terminais não podem ser alterados.
- Os códigos de rejeição estáveis incluem `INSUFFICIENT_FUNDS`,
  `CURRENCY_MISMATCH`, `REFERENCE_NOT_FOUND`, `INVALID_REFERENCE`,
  `REFERENCE_NOT_PROCESSED`, `ALREADY_REVERSED`,
  `REVERSAL_WOULD_OVERDRAW` e `IDEMPOTENCY_CONFLICT`. `PERSISTENCE_FAILURE` é
  reservado ao estado `FAILED`, separado das rejeições de negócio.
- `REFUND` e `ROLLBACK` exigem referência. Validações envolvendo o histórico de
  reversões e unicidade dependem da persistência e serão implementadas nas
  etapas seguintes.
- Os testes são executados com Bun (`bun run test`); os testes de PostgreSQL
  usam `bun run test:database` e exigem serviço/migrations ativos.

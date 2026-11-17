# Decisões iniciais de arquitetura

## Banco de desenvolvimento

- PostgreSQL 16 é executado localmente pelo Docker Compose.
- A porta padrão `5433` é publicada somente em `127.0.0.1` para evitar conflito
  com um PostgreSQL já usando `5432` neste ambiente; pode ser configurada.
- O volume nomeado `postgres_data` preserva os dados entre reinicializações.
- O Compose verifica a prontidão com `pg_isready`.
- O banco começa sem tabelas de domínio. O schema financeiro e suas migrations
  serão definidos junto com o modelo de domínio e a camada de persistência.
- As credenciais padrão são exclusivas para desenvolvimento local e podem ser
  substituídas pelas variáveis de ambiente documentadas no README.

## Aplicação

O projeto existente é uma aplicação Next.js. O roteiro descreve um serviço
backend NestJS; essa migração não é feita nesta etapa para não substituir a
estrutura atual sem uma decisão explícita. A separação das camadas backend e a
escolha de persistência ficam para a implementação dessas etapas.

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
- Os testes são executados com `npm test` e usam o runner nativo do Node.js.

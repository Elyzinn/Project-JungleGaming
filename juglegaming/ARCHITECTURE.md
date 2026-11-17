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

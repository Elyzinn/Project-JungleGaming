Não havia conhecimento prévio sobre Bun, DDD e TanStack

## PostgreSQL local

O PostgreSQL 16 pode ser iniciado com Docker Compose:

```sh
docker compose up -d
docker compose ps
```

O banco fica disponível apenas na máquina local em `127.0.0.1:5433`. A porta
`5433` evita conflito com outro serviço PostgreSQL já usando a porta padrão
`5432` neste ambiente. Os valores
padrão de desenvolvimento são:

- Banco: `juglegaming`
- Usuário: `juglegaming`
- Senha: `juglegaming_local`

Para conectar com `psql`:

```sh
docker compose exec postgres psql -U juglegaming -d juglegaming
```

Se quiser usar outra porta na máquina, defina `POSTGRES_PORT` ao iniciar o
Compose, por exemplo `POSTGRES_PORT=5432 docker compose up -d`.

Para parar o serviço sem apagar os dados, execute `docker compose down`. Os
dados persistem no volume `postgres_data`. Para apagar o banco local e todos
os seus dados, execute `docker compose down -v`.

Os valores padrão são somente para desenvolvimento local. Podem ser alterados
por variáveis de ambiente `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
e `POSTGRES_PORT`.

## Migrations

O projeto usa MikroORM com PostgreSQL. Com o serviço do Compose ativo, aplique
as migrations versionadas:

```sh
bun run db:migrate
bun run db:migrate:status
```

Para reverter a migration mais recente:

```sh
bun run db:migrate:down
```

Reverter a migration inicial remove as tabelas financeiras e seus dados. Para
usar outra conexão, defina `DATABASE_URL`.

Com o PostgreSQL ativo e as migrations aplicadas, os testes de constraints e
triggers podem ser executados com:

```sh
bun run test:database
```

## Testes do domínio

Os testes unitários do domínio usam o test runner do Bun:

```sh
bun run test
```

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

## Testes do domínio

Os testes unitários usam o test runner nativo do Node.js:

```sh
npm test
```
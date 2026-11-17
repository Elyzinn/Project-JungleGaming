# Roteiro do projeto

Este roteiro organiza o desafio em etapas para que você possa construir e validar o projeto aos poucos. A prioridade é manter corretas as regras financeiras e a consistência dos dados; autenticação e itens opcionais podem ficar para depois.

## Visão geral

| Etapa | Parte | Prioridade |
|---|---|---|
| 1 | Preparar a base do projeto | Alta |
| 2 | Modelar as regras financeiras | Alta |
| 3 | Persistir e proteger os dados no PostgreSQL | Alta |
| 4 | Implementar o fluxo financeiro e a API | Alta |
| 5 | Tratar referências que chegam fora de ordem | Média |
| 6 | Consumir mensagens SQS com Inbox | Média |
| 7 | Publicar eventos com Outbox | Média |
| 8 | Completar observabilidade, testes e documentação | Alta |

## 1. Preparar a base do projeto

### O que fazer

- Criar a aplicação NestJS com TypeScript em modo estrito.
- Usar Bun para instalar dependências, executar scripts e rodar testes.
- Preparar o Docker Compose com PostgreSQL.
- Criar uma estrutura inicial para separar domínio, aplicação, infraestrutura e API.
- Registrar as primeiras decisões e comandos de execução em `ARCHITECTURE.md` e `README.md`.

### Conceitos para aprender

- **Bun:** runtime JavaScript/TypeScript, instalador de dependências e executor de testes. Comandos comuns incluem `bun install`, `bun run <script>` e `bun test`.
- **NestJS:** framework backend que organiza a aplicação em módulos, controladores e provedores.
- **Docker Compose:** forma de iniciar serviços locais, como o PostgreSQL, com uma configuração compartilhada.

### Critério de conclusão

É possível iniciar a aplicação e conectar ao PostgreSQL localmente.

## 2. Modelar as regras financeiras

Implemente primeiro as regras de negócio sem depender de NestJS nem do banco. Isso deixa as regras mais fáceis de entender e testar.

### O que fazer

- Criar `Money`, imutável, que recebe e serializa valores como strings decimais.
- Criar `Wallet` para proteger o saldo e impedir que ele fique negativo.
- Criar `WagerTransaction` para representar operações e seus estados.
- Definir os códigos de falha e as transições permitidas entre estados.
- Escrever testes unitários para valores inválidos, operações, moedas e regras de negócio.

### Conceito: DDD

**DDD** significa *Domain-Driven Design*. Neste desafio, a ideia prática é manter as regras do negócio em objetos como `Money`, `Wallet` e `WagerTransaction`, em vez de espalhá-las por controladores HTTP ou código de banco de dados.

### Critério de conclusão

Os testes confirmam que o domínio rejeita valores inválidos, incompatibilidade de moeda e operações que violariam as regras financeiras.

## 3. Persistir e proteger os dados no PostgreSQL

### O que fazer

- Escolher MikroORM ou TypeORM e documentar a escolha.
- Criar migrations versionadas e reversíveis para wallets, transações e ledger.
- Adicionar constraints e índices para as regras de unicidade e integridade.
- Garantir no banco que uma wallet não fique com saldo negativo.
- Tornar o ledger append-only: os lançamentos não devem ser sobrescritos nem excluídos.
- Definir a estratégia de concorrência por wallet, sem lock global para todas as wallets.

### Critério de conclusão

As migrations podem ser aplicadas e revertidas, e o banco protege invariantes importantes mesmo se houver mais de uma instância da aplicação.

## 4. Implementar o fluxo financeiro e a API

### O que fazer

- Implementar a criação de wallet e o lançamento interno `OPENING`, quando houver saldo inicial.
- Implementar o caso de uso que processa transações.
- Fazer idempotência persistente: uma repetição não pode duplicar efeitos; a mesma chave com payload diferente deve gerar conflito.
- Atualizar transação, saldo e ledger na mesma transação SQL.
- Implementar os endpoints para criar e consultar wallets, consultar o ledger e submeter transações.
- Cobrir as regras de `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`.

### Critério de conclusão

No cenário de saldo `100.00 BRL` e duas apostas simultâneas de `80.00 BRL`, exatamente uma é processada, a outra é rejeitada por saldo insuficiente e o saldo final é `20.00 BRL`.

## 5. Tratar referências que chegam fora de ordem

`REFUND` e `ROLLBACK` podem chegar antes da transação referenciada.

### O que fazer

- Persistir a operação como `PENDING_REFERENCE` quando a referência ainda não existir.
- Criar um worker agendado para tentar processá-la novamente.
- Definir um limite de tentativas ou um TTL e documentar a decisão.
- Rejeitar com um código de falha específico quando o limite se esgotar.

### Critério de conclusão

Uma referência ausente não causa perda silenciosa: a operação fica registrada, pode ser reprocessada e termina em estado auditável.

## 6. Consumir mensagens SQS com Inbox

### O que fazer

- Configurar SQS local com LocalStack ou MiniStack.
- Fazer o consumidor reutilizar o mesmo caso de uso da entrada HTTP.
- Registrar a mensagem em uma Inbox persistente, com unicidade por consumidor e identificador da mensagem.
- Confirmar (*ack*) a mensagem somente depois do commit no banco.
- Diferenciar erros de negócio, erros transitórios e erros permanentes.
- Definir retry, DLQ e encerramento seguro quando a aplicação receber `SIGTERM`.

### Critério de conclusão

Uma mensagem repetida ou reenviada depois de uma falha não duplica o débito nem o crédito.

## 7. Publicar eventos com Outbox

### O que fazer

- Gravar o evento na Outbox na mesma transação SQL da movimentação financeira.
- Criar um worker para publicar eventos pendentes no SQS.
- Permitir múltiplos publishers sem perder eventos.
- Tornar seguro o recebimento duplicado de um evento.
- Cobrir eventos de transação processada, rejeitada, referência pendente e saldo alterado.

### Critério de conclusão

Se a aplicação parar depois do commit e antes da publicação, outra instância consegue publicar o evento posteriormente.

## 8. Completar observabilidade, testes e documentação

### O que fazer

- Adicionar health checks separados para liveness e readiness.
- Registrar logs estruturados e métricas sem incluir dados financeiros completos ou sensíveis.
- Implementar reconciliação entre saldo da wallet e saldo calculado pelo ledger.
- Testar migrations, constraints, atomicidade, inbox, outbox, retries e recuperação após reinício.
- Testar concorrência real, incluindo múltiplas instâncias.
- Documentar instalação, comandos, decisões, trade-offs e limitações.

### Critério de conclusão

Os testes demonstram que o saldo armazenado é igual ao saldo reconstruído a partir do ledger, inclusive depois de retries e reinicializações.

## Alvo recomendado para a primeira sessão

Para construir uma primeira metade funcional, concentre-se nas etapas **1 a 4**:

1. Criar e iniciar a aplicação com Bun.
2. Subir PostgreSQL pelo Docker Compose.
3. Implementar `Money`, `Wallet` e as regras principais com testes unitários.
4. Criar as migrations e constraints iniciais.
5. Implementar a criação de wallet e o processamento financeiro idempotente.
6. Validar o cenário de duas apostas concorrentes.

Essa meta produz uma fatia útil do sistema, mas não substitui as etapas de SQS, Inbox, Outbox e recuperação de falhas, que também são requisitos importantes do desafio. O tamanho real de cada etapa depende do ambiente e dos problemas encontrados; é melhor concluir e testar uma fatia correta do que implementar muitas partes sem validar.

## O que pode ficar para depois

- **Autenticação:** não vale pontos no desafio. Você pode documentar uma integração futura com um provedor de identidade e deixar um ponto de extensão no código.
- **TanStack:** não é necessário para o escopo descrito, que é um serviço backend sem interface web especificada.
- **Teste de carga e dashboard:** são diferenciais opcionais; primeiro priorize os testes financeiros, de integração e concorrência.

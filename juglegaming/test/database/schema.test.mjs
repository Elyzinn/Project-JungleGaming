import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../../mikro-orm.config.ts";

let orm;

before(async () => {
  orm = await MikroORM.init(config);
});

after(async () => {
  await orm?.close(true);
});

const execute = (entityManager, query, params = []) =>
  entityManager.execute(query, params);

async function insertWallet(entityManager, walletId, playerId = randomUUID()) {
  await execute(
    entityManager,
    `INSERT INTO wallets (id, player_id, currency) VALUES (?, ?, 'BRL')`,
    [walletId, playerId],
  );
  return playerId;
}

async function insertTransaction(
  entityManager,
  {
    id = randomUUID(),
    walletId,
    playerId,
    providerId = "provider-test",
    externalTransactionId = randomUUID(),
    idempotencyKey = randomUUID(),
    kind = "BET",
    amount = "1.00",
    status = "PENDING",
    failureCode = null,
    referenceExternalId = null,
    referenceTransactionId = null,
  },
) {
  await execute(
    entityManager,
    `INSERT INTO wager_transactions (
      id, provider_id, external_transaction_id, idempotency_key, payload_hash,
      wallet_id, player_id, round_id, game_id, kind, amount, currency,
      reference_external_transaction_id, reference_transaction_id, status,
      failure_code, created_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'round-test', 'game-test', ?, ?, 'BRL',
      ?, ?, ?, ?, now(), ?)`,
    [
      id,
      providerId,
      externalTransactionId,
      idempotencyKey,
      "a".repeat(64),
      walletId,
      playerId,
      kind,
      amount,
      referenceExternalId,
      referenceTransactionId,
      status,
      failureCode,
      status === "PROCESSED" ? new Date() : null,
    ],
  );
  return id;
}

test("committed wallet balance and version must match processed ledger entries", async () => {
  const walletId = randomUUID();
  const playerId = randomUUID();

  const rollbackSignal = new Error("roll back database fixture");
  await assert.rejects(
    orm.em.transactional(async (em) => {
      await insertWallet(em, walletId, playerId);

      const openingId = await insertTransaction(em, {
        walletId,
        playerId,
        providerId: "internal",
        kind: "OPENING",
        amount: "100.00",
        status: "PROCESSED",
      });
      await execute(
        em,
        `INSERT INTO wallet_ledger (
          id, wallet_id, transaction_id, direction, amount, currency,
          balance_before, balance_after, wallet_version
        ) VALUES (?, ?, ?, 'CREDIT', '100.00', 'BRL', '0.00', '100.00', 1)`,
        [randomUUID(), walletId, openingId],
      );
      await execute(
        em,
        `UPDATE wallets SET balance = '100.00' WHERE id = ?`,
        [walletId],
      );

      const betId = await insertTransaction(em, {
        walletId,
        playerId,
        amount: "80.00",
        status: "PROCESSED",
      });
      await execute(
        em,
        `INSERT INTO wallet_ledger (
          id, wallet_id, transaction_id, direction, amount, currency,
          balance_before, balance_after, wallet_version
        ) VALUES (?, ?, ?, 'DEBIT', '80.00', 'BRL', '100.00', '20.00', 2)`,
        [randomUUID(), walletId, betId],
      );
      await execute(
        em,
        `UPDATE wallets SET balance = '20.00', version = 2 WHERE id = ?`,
        [walletId],
      );
      await execute(em, "SET CONSTRAINTS ALL IMMEDIATE");

      const [wallet] = await execute(
        em,
        `SELECT balance, version FROM wallets WHERE id = ?`,
        [walletId],
      );
      assert.equal(wallet.balance, "20.00");
      assert.equal(wallet.version, 2);

      throw rollbackSignal;
    }),
    (error) => error === rollbackSignal,
  );
});

test("database rejects balance changes without a matching ledger entry", async () => {
  const walletId = randomUUID();
  await assert.rejects(
    orm.em.transactional(async (em) => {
      await insertWallet(em, walletId);
      await execute(
        em,
        `UPDATE wallets SET balance = '1.00', version = 2 WHERE id = ?`,
        [walletId],
      );
    }),
    (error) => error.message.includes("matching ledger entry"),
  );
});

test("processed balance-affecting transactions must have exactly one ledger entry", async () => {
  await assert.rejects(
    orm.em.transactional(async (em) => {
      const walletId = randomUUID();
      const playerId = await insertWallet(em, walletId);
      await insertTransaction(em, {
        walletId,
        playerId,
        status: "PROCESSED",
      });
      await execute(em, "SET CONSTRAINTS ALL IMMEDIATE");
    }),
    (error) => error.message.includes("requires one ledger entry"),
  );
});

test("ledger rows cannot be changed or deleted", async () => {
  const walletId = randomUUID();
  const playerId = randomUUID();
  await assert.rejects(
    orm.em.transactional(async (em) => {
      await insertWallet(em, walletId, playerId);
      const openingId = await insertTransaction(em, {
        walletId,
        playerId,
        providerId: "internal",
        kind: "OPENING",
        amount: "2.00",
        status: "PROCESSED",
      });
      const ledgerId = randomUUID();
      await execute(
        em,
        `INSERT INTO wallet_ledger (
          id, wallet_id, transaction_id, direction, amount, currency,
          balance_before, balance_after, wallet_version
        ) VALUES (?, ?, ?, 'CREDIT', '2.00', 'BRL', '0.00', '2.00', 1)`,
        [ledgerId, walletId, openingId],
      );
      await execute(
        em,
        `UPDATE wallets SET balance = '2.00' WHERE id = ?`,
        [walletId],
      );
      await execute(em, "SET CONSTRAINTS ALL IMMEDIATE");
      await execute(
        em,
        `DELETE FROM wallet_ledger WHERE id = ?`,
        [ledgerId],
      );
    }),
    (error) => error.message.includes("wallet ledger is append-only"),
  );
});

test("idempotency keys are unique per provider in PostgreSQL", async () => {
  const walletId = randomUUID();
  const playerId = randomUUID();
  await assert.rejects(
    orm.em.transactional(async (em) => {
      await insertWallet(em, walletId, playerId);
      const idempotencyKey = randomUUID();
      await insertTransaction(em, {
        walletId,
        playerId,
        idempotencyKey,
      });
      await insertTransaction(em, {
        walletId,
        playerId,
        idempotencyKey,
        externalTransactionId: randomUUID(),
      });
    }),
    (error) => error.code === "23505",
  );
});

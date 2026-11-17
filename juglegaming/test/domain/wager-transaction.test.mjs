import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FailureCode,
  InvalidTransactionStateError,
  InvalidWagerTransactionError,
} from "../../src/domain/errors.ts";
import { LedgerDirection } from "../../src/domain/wallet-ledger-entry.ts";
import { Money } from "../../src/domain/money.ts";
import {
  WagerTransaction,
  WagerTransactionKind as Kind,
  WagerTransactionStatus as Status,
} from "../../src/domain/wager-transaction.ts";

const money = (amount) => Money.from({ amount, currency: "BRL" });

const transaction = (kind, overrides = {}) =>
  WagerTransaction.create({
    id: `internal-${kind}`,
    providerId: "provider-1",
    externalTransactionId: `external-${kind}`,
    idempotencyKey: `key-${kind}`,
    payloadHash: `hash-${kind}`,
    walletId: "wallet-1",
    playerId: "player-1",
    roundId: "round-1",
    gameId: "game-1",
    kind,
    money: money("10.00"),
    ...(kind === Kind.Refund || kind === Kind.Rollback
      ? { referenceExternalTransactionId: "referenced-external" }
      : {}),
    ...overrides,
  });

test("refunds and rollbacks require a reference and start pending", () => {
  assert.throws(
    () =>
      WagerTransaction.create({
        id: "id",
        providerId: "provider",
        externalTransactionId: "external",
        idempotencyKey: "key",
        payloadHash: "hash",
        walletId: "wallet",
        playerId: "player",
        roundId: "round",
        gameId: "game",
        kind: Kind.Refund,
        money: money("1.00"),
      }),
    InvalidWagerTransactionError,
  );

  const bet = transaction(Kind.Bet);
  assert.equal(bet.status, Status.Pending);
  assert.equal(bet.requiresReference(), false);
  assert.equal(bet.ledgerDirectionFor(), LedgerDirection.Debit);
  assert.equal(bet.matchesPayload("hash-BET"), true);
});

test("transactions transition through pending reference and terminal states once", () => {
  const refund = transaction(Kind.Refund);
  refund.markPendingReference();
  assert.equal(refund.status, Status.PendingReference);
  assert.equal(refund.isTerminal(), false);
  assert.throws(
    () => refund.markPendingReference(),
    InvalidTransactionStateError,
  );

  refund.markProcessed("internal-bet", new Date("2026-01-01T00:00:00Z"));
  assert.equal(refund.status, Status.Processed);
  assert.equal(refund.referenceTransactionId, "internal-bet");
  assert.equal(refund.isTerminal(), true);
  assert.throws(
    () => refund.reject(FailureCode.InvalidReference),
    InvalidTransactionStateError,
  );
});

test("rejection and infrastructure failure retain distinct stable codes", () => {
  const rejected = transaction(Kind.Bet);
  rejected.reject(FailureCode.InsufficientFunds);
  assert.equal(rejected.status, Status.Rejected);
  assert.equal(rejected.failureCode, "INSUFFICIENT_FUNDS");
  assert.equal(rejected.affectsBalance(), false);

  const failed = transaction(Kind.Win);
  failed.fail(FailureCode.PersistenceFailure);
  assert.equal(failed.status, Status.Failed);
  assert.equal(failed.failureCode, "PERSISTENCE_FAILURE");
  assert.throws(
    () => transaction(Kind.Bet).reject(FailureCode.PersistenceFailure),
    InvalidWagerTransactionError,
  );
});

test("rehydration rejects terminal states with inconsistent failure metadata", () => {
  const rejected = transaction(Kind.Bet);
  rejected.reject(FailureCode.InsufficientFunds);

  assert.throws(
    () =>
      WagerTransaction.rehydrate({
        id: rejected.id,
        providerId: rejected.providerId,
        externalTransactionId: rejected.externalTransactionId,
        idempotencyKey: rejected.idempotencyKey,
        payloadHash: rejected.payloadHash,
        walletId: rejected.walletId,
        playerId: rejected.playerId,
        roundId: rejected.roundId,
        gameId: rejected.gameId,
        kind: rejected.kind,
        money: rejected.money,
        createdAt: rejected.createdAt,
        status: Status.Rejected,
        failureCode: FailureCode.PersistenceFailure,
      }),
    InvalidWagerTransactionError,
  );
});

test("refund and rollback enforce reference kind, state, context, and amount", () => {
  const bet = transaction(Kind.Bet);
  bet.markProcessed(undefined, new Date());

  const refund = transaction(Kind.Refund);
  assert.equal(refund.ledgerDirectionFor(bet), LedgerDirection.Credit);
  refund.markProcessed(bet.id, new Date());

  const rollback = transaction(Kind.Rollback);
  assert.equal(rollback.ledgerDirectionFor(refund), LedgerDirection.Debit);

  const unprocessedBet = transaction(Kind.Bet, { id: "unprocessed-bet" });
  assert.throws(
    () => transaction(Kind.Refund).ledgerDirectionFor(unprocessedBet),
    (error) =>
      error instanceof InvalidWagerTransactionError &&
      error.code === FailureCode.ReferenceNotProcessed,
  );

  const wrongAmount = transaction(Kind.Bet, {
    id: "wrong-amount",
    money: money("9.00"),
  });
  wrongAmount.markProcessed(undefined, new Date());
  assert.throws(
    () => transaction(Kind.Refund).ledgerDirectionFor(wrongAmount),
    InvalidWagerTransactionError,
  );
});

test("LOSS has no ledger movement, and WIN can credit a processed BET", () => {
  const loss = transaction(Kind.Loss);
  assert.equal(loss.affectsBalance(), false);
  assert.throws(() => loss.ledgerDirectionFor(), InvalidWagerTransactionError);

  const bet = transaction(Kind.Bet);
  bet.markProcessed(undefined, new Date());
  assert.equal(transaction(Kind.Win).ledgerDirectionFor(bet), LedgerDirection.Credit);
});

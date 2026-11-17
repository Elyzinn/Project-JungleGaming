import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CurrencyMismatchError,
  InsufficientFundsError,
  InvalidWalletError,
} from "../../src/domain/errors.ts";
import { Money } from "../../src/domain/money.ts";
import { LedgerDirection } from "../../src/domain/wallet-ledger-entry.ts";
import { Wallet } from "../../src/domain/wallet.ts";

const money = (amount, currency = "BRL") => Money.from({ amount, currency });

test("wallet movements update balance and produce balanced ledger entries", () => {
  const wallet = Wallet.open({
    id: "wallet-1",
    playerId: "player-1",
    initialBalance: money("100.00"),
  });

  const debit = wallet.debit({
    money: money("80.00"),
    ledgerEntryId: "ledger-1",
    transactionId: "transaction-1",
  });
  assert.equal(debit.direction, LedgerDirection.Debit);
  assert.equal(debit.isBalanced(), true);
  assert.equal(wallet.balance.toString(), "20.00 BRL");
  assert.equal(wallet.version, 2);

  const credit = wallet.credit({
    money: money("5.25"),
    ledgerEntryId: "ledger-2",
    transactionId: "transaction-2",
  });
  assert.equal(credit.direction, LedgerDirection.Credit);
  assert.equal(credit.isBalanced(), true);
  assert.equal(wallet.balance.toString(), "25.25 BRL");
  assert.equal(wallet.version, 3);
});

test("wallet refuses overdrafts and currency mismatches without changing state", () => {
  const wallet = Wallet.open({
    id: "wallet-1",
    playerId: "player-1",
    initialBalance: money("10.00"),
  });

  assert.throws(
    () =>
      wallet.debit({
        money: money("10.01"),
        ledgerEntryId: "ledger-1",
        transactionId: "transaction-1",
      }),
    InsufficientFundsError,
  );
  assert.throws(
    () =>
      wallet.credit({
        money: money("1.00", "USD"),
        ledgerEntryId: "ledger-2",
        transactionId: "transaction-2",
      }),
    CurrencyMismatchError,
  );
  assert.equal(wallet.balance.toString(), "10.00 BRL");
  assert.equal(wallet.version, 1);
});

test("wallet rejects zero movements and invalid persisted negative balances", () => {
  const wallet = Wallet.open({
    id: "wallet-1",
    playerId: "player-1",
    initialBalance: money("0.00"),
  });
  assert.throws(
    () =>
      wallet.credit({
        money: money("0.00"),
        ledgerEntryId: "ledger-1",
        transactionId: "transaction-1",
      }),
    InvalidWalletError,
  );
  assert.throws(
    () =>
      Wallet.rehydrate({
        id: "wallet-1",
        playerId: "player-1",
        currency: "BRL",
        balance: money("1.00").negate(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    InvalidWalletError,
  );
});

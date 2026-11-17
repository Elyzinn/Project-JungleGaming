import assert from "node:assert/strict";
import { test } from "node:test";
import { CurrencyMismatchError, InvalidMoneyError } from "../../src/domain/errors.ts";
import { Money } from "../../src/domain/money.ts";

test("Money normalizes fixed-point values without floating-point arithmetic", () => {
  const amount = Money.from({ amount: "9007199254740993.19", currency: "BRL" })
    .add(Money.from({ amount: "0.81", currency: "BRL" }));

  assert.deepEqual(amount.toJSON(), {
    amount: "9007199254740994.00",
    currency: "BRL",
  });
  assert.equal(Money.from({ amount: "25", currency: "BRL" }).toString(), "25.00 BRL");
});

test("Money rejects malformed, negative, and over-precision values", () => {
  for (const amount of ["", "-1.00", "1.001", "1e2", "NaN", "Infinity", " 1.00"]) {
    assert.throws(
      () => Money.from({ amount, currency: "BRL" }),
      InvalidMoneyError,
      amount,
    );
  }
  assert.throws(
    () => Money.from({ amount: "1.00", currency: "brl" }),
    InvalidMoneyError,
  );
});

test("Money arithmetic supports negation and compares currencies strictly", () => {
  const amount = Money.from({ amount: "12.30", currency: "USD" });
  assert.equal(amount.negate().toJSON().amount, "-12.30");
  assert.equal(amount.subtract(Money.from({ amount: "20.00", currency: "USD" })).isNegative(), true);
  assert.throws(
    () => amount.add(Money.from({ amount: "1.00", currency: "BRL" })),
    CurrencyMismatchError,
  );
});

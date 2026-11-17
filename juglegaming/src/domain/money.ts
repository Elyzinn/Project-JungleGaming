import { CurrencyMismatchError, InvalidMoneyError } from "./errors.ts";

export interface MoneyProps {
  readonly amount: string;
  readonly currency: string;
}

const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  private readonly minorUnits: bigint;
  readonly currency: string;

  private constructor(minorUnits: bigint, currency: string) {
    this.minorUnits = minorUnits;
    this.currency = currency;
    Object.freeze(this);
  }

  static from(props: MoneyProps): Money {
    if (
      !props ||
      typeof props.amount !== "string" ||
      !AMOUNT_PATTERN.test(props.amount)
    ) {
      throw new InvalidMoneyError(
        "Amount must be a non-negative decimal string with at most two fractional digits.",
      );
    }

    const currency = Money.validateCurrency(props.currency);
    const [whole, fraction = ""] = props.amount.split(".");
    const minorUnits =
      BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");

    return new Money(minorUnits, currency);
  }

  static zero(currency: string): Money {
    return new Money(0n, Money.validateCurrency(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  negate(): Money {
    return new Money(-this.minorUnits, this.currency);
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits < other.minorUnits;
  }

  equals(other: Money): boolean {
    return (
      other instanceof Money &&
      this.currency === other.currency &&
      this.minorUnits === other.minorUnits
    );
  }

  toJSON(): MoneyProps {
    return {
      amount: this.formatAmount(),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.formatAmount()} ${this.currency}`;
  }

  private formatAmount(): string {
    const isNegative = this.minorUnits < 0n;
    const absoluteUnits = isNegative ? -this.minorUnits : this.minorUnits;
    const whole = absoluteUnits / 100n;
    const fraction = (absoluteUnits % 100n).toString().padStart(2, "0");

    return `${isNegative ? "-" : ""}${whole}.${fraction}`;
  }

  private assertSameCurrency(other: Money): void {
    if (!(other instanceof Money)) {
      throw new InvalidMoneyError("Money operation requires another Money value.");
    }
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  private static validateCurrency(currency: string): string {
    if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
      throw new InvalidMoneyError(
        "Currency must be an uppercase three-letter ISO 4217 code.",
      );
    }
    return currency;
  }
}

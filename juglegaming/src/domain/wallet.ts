import {
  CurrencyMismatchError,
  InsufficientFundsError,
  InvalidWalletError,
} from "./errors.ts";
import { Money } from "./money.ts";
import {
  LedgerDirection,
  WalletLedgerEntry,
} from "./wallet-ledger-entry.ts";

export interface OpenWalletProps {
  readonly id: string;
  readonly playerId: string;
  readonly initialBalance: Money;
  readonly createdAt?: Date;
}

export interface WalletState {
  readonly id: string;
  readonly playerId: string;
  readonly currency: string;
  readonly balance: Money;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WalletMovementProps {
  readonly money: Money;
  readonly ledgerEntryId: string;
  readonly transactionId: string;
  readonly at?: Date;
}

export class Wallet {
  readonly id: string;
  readonly playerId: string;
  readonly currency: string;
  private readonly createdAtValue: Date;
  private _balance: Money;
  private _version: number;
  private _updatedAt: Date;

  private constructor(state: WalletState) {
    this.id = state.id;
    this.playerId = state.playerId;
    this.currency = state.currency;
    this._balance = state.balance;
    this._version = state.version;
    this.createdAtValue = new Date(state.createdAt.getTime());
    this._updatedAt = new Date(state.updatedAt.getTime());
  }

  static open(props: OpenWalletProps): Wallet {
    if (
      !props ||
      !Wallet.isIdentifier(props.id) ||
      !Wallet.isIdentifier(props.playerId) ||
      !(props.initialBalance instanceof Money) ||
      props.initialBalance.isNegative()
    ) {
      throw new InvalidWalletError("Wallet opening data is invalid.");
    }

    const createdAt = props.createdAt ?? new Date();
    Wallet.assertValidDate(createdAt);
    return new Wallet({
      id: props.id,
      playerId: props.playerId,
      currency: props.initialBalance.currency,
      balance: props.initialBalance,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
  }

  static rehydrate(state: WalletState): Wallet {
    if (
      !state ||
      !Wallet.isIdentifier(state.id) ||
      !Wallet.isIdentifier(state.playerId) ||
      !Wallet.isIdentifier(state.currency) ||
      !(state.balance instanceof Money) ||
      state.balance.currency !== state.currency ||
      state.balance.isNegative() ||
      !Number.isSafeInteger(state.version) ||
      state.version < 1
    ) {
      throw new InvalidWalletError("Persisted wallet state is invalid.");
    }

    Wallet.assertValidDate(state.createdAt);
    Wallet.assertValidDate(state.updatedAt);
    if (state.updatedAt.getTime() < state.createdAt.getTime()) {
      throw new InvalidWalletError("Wallet update time precedes its creation time.");
    }

    return new Wallet(state);
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  debit(props: WalletMovementProps): WalletLedgerEntry {
    if (!props) {
      throw new InvalidWalletError("Wallet movement properties are required.");
    }
    this.assertSameCurrency(props.money);
    this.assertPositiveAmount(props.money);

    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.subtract(props.money);
    if (balanceAfter.isNegative()) {
      throw new InsufficientFundsError();
    }

    return this.recordMovement(
      props,
      LedgerDirection.Debit,
      balanceBefore,
      balanceAfter,
    );
  }

  credit(props: WalletMovementProps): WalletLedgerEntry {
    if (!props) {
      throw new InvalidWalletError("Wallet movement properties are required.");
    }
    this.assertSameCurrency(props.money);
    this.assertPositiveAmount(props.money);

    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.add(props.money);
    return this.recordMovement(
      props,
      LedgerDirection.Credit,
      balanceBefore,
      balanceAfter,
    );
  }

  private recordMovement(
    props: WalletMovementProps,
    direction: LedgerDirection,
    balanceBefore: Money,
    balanceAfter: Money,
  ): WalletLedgerEntry {
    if (
      !Wallet.isIdentifier(props.ledgerEntryId) ||
      !Wallet.isIdentifier(props.transactionId)
    ) {
      throw new InvalidWalletError("Wallet movement identifiers are required.");
    }

    const at = props.at ?? new Date();
    Wallet.assertValidDate(at);
    if (!Number.isSafeInteger(this._version + 1)) {
      throw new InvalidWalletError("Wallet version exceeded the safe integer range.");
    }

    const entry = WalletLedgerEntry.create({
      id: props.ledgerEntryId,
      walletId: this.id,
      transactionId: props.transactionId,
      direction,
      money: props.money,
      balanceBefore,
      balanceAfter,
      createdAt: at,
    });

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date(at.getTime());
    return entry;
  }

  private assertSameCurrency(money: Money): void {
    if (!(money instanceof Money)) {
      throw new InvalidWalletError("Wallet movement requires a Money value.");
    }
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, money.currency);
    }
  }

  private assertPositiveAmount(money: Money): void {
    if (!money.isPositive()) {
      throw new InvalidWalletError("Wallet movements must have a positive amount.");
    }
  }

  private static isIdentifier(value: string): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  private static assertValidDate(value: Date): void {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new InvalidWalletError("Wallet timestamp is invalid.");
    }
  }
}

import { InvalidLedgerEntryError } from "./errors.ts";
import { Money } from "./money.ts";

export const LedgerDirection = {
  Debit: "DEBIT",
  Credit: "CREDIT",
} as const;

export type LedgerDirection =
  (typeof LedgerDirection)[keyof typeof LedgerDirection];

export interface CreateLedgerEntryProps {
  readonly id: string;
  readonly walletId: string;
  readonly transactionId: string;
  readonly direction: LedgerDirection;
  readonly money: Money;
  readonly balanceBefore: Money;
  readonly balanceAfter: Money;
  readonly createdAt?: Date;
}

export interface LedgerEntryState extends Omit<
  CreateLedgerEntryProps,
  "createdAt"
> {
  readonly createdAt: Date;
}

export class WalletLedgerEntry {
  readonly id: string;
  readonly walletId: string;
  readonly transactionId: string;
  readonly direction: LedgerDirection;
  readonly money: Money;
  readonly balanceBefore: Money;
  readonly balanceAfter: Money;
  private readonly createdAtValue: Date;

  private constructor(props: CreateLedgerEntryProps, createdAt: Date) {
    this.id = props.id;
    this.walletId = props.walletId;
    this.transactionId = props.transactionId;
    this.direction = props.direction;
    this.money = props.money;
    this.balanceBefore = props.balanceBefore;
    this.balanceAfter = props.balanceAfter;
    this.createdAtValue = new Date(createdAt.getTime());
    Object.freeze(this);
  }

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    if (!props) {
      throw new InvalidLedgerEntryError("Ledger entry properties are required.");
    }
    return WalletLedgerEntry.fromState({
      ...props,
      createdAt: props.createdAt ?? new Date(),
    });
  }

  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return WalletLedgerEntry.fromState(state);
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  isBalanced(): boolean {
    if (
      !this.money.isPositive() ||
      this.money.currency !== this.balanceBefore.currency ||
      this.money.currency !== this.balanceAfter.currency
    ) {
      return false;
    }

    const expectedBalance =
      this.direction === LedgerDirection.Debit
        ? this.balanceBefore.subtract(this.money)
        : this.balanceBefore.add(this.money);

    return !expectedBalance.isNegative() && expectedBalance.equals(this.balanceAfter);
  }

  private static fromState(state: LedgerEntryState): WalletLedgerEntry {
    if (
      !state ||
      !WalletLedgerEntry.isIdentifier(state.id) ||
      !WalletLedgerEntry.isIdentifier(state.walletId) ||
      !WalletLedgerEntry.isIdentifier(state.transactionId) ||
      !Object.values(LedgerDirection).includes(state.direction) ||
      !(state.money instanceof Money) ||
      !(state.balanceBefore instanceof Money) ||
      !(state.balanceAfter instanceof Money) ||
      !WalletLedgerEntry.isValidDate(state.createdAt)
    ) {
      throw new InvalidLedgerEntryError("Ledger entry contains invalid fields.");
    }

    const entry = new WalletLedgerEntry(state, state.createdAt);
    if (!entry.isBalanced()) {
      throw new InvalidLedgerEntryError(
        "Ledger entry balances do not match its direction and amount.",
      );
    }
    return entry;
  }

  private static isIdentifier(value: string): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  private static isValidDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
  }
}

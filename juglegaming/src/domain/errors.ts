export const FailureCode = {
  InsufficientFunds: "INSUFFICIENT_FUNDS",
  CurrencyMismatch: "CURRENCY_MISMATCH",
  ReferenceNotFound: "REFERENCE_NOT_FOUND",
  InvalidReference: "INVALID_REFERENCE",
  ReferenceNotProcessed: "REFERENCE_NOT_PROCESSED",
  AlreadyReversed: "ALREADY_REVERSED",
  ReversalWouldOverdraw: "REVERSAL_WOULD_OVERDRAW",
  IdempotencyConflict: "IDEMPOTENCY_CONFLICT",
  PersistenceFailure: "PERSISTENCE_FAILURE",
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];
export type BusinessFailureCode = Exclude<
  FailureCode,
  typeof FailureCode.PersistenceFailure
>;
export type InfrastructureFailureCode = typeof FailureCode.PersistenceFailure;

export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_MONEY");
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(left: string, right: string) {
    super(`Currency mismatch: ${left} and ${right}.`, FailureCode.CurrencyMismatch);
  }
}

export class InsufficientFundsError extends DomainError {
  constructor() {
    super("The wallet does not have enough funds.", FailureCode.InsufficientFunds);
  }
}

export class InvalidWalletError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_WALLET");
  }
}

export class InvalidTransactionStateError extends DomainError {
  constructor(status: string) {
    super(`Transaction cannot transition from ${status}.`, "INVALID_TRANSACTION_STATE");
  }
}

export class InvalidWagerTransactionError extends DomainError {
  constructor(message: string, code = "INVALID_WAGER_TRANSACTION") {
    super(message, code);
  }
}

export class InvalidLedgerEntryError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_LEDGER_ENTRY");
  }
}

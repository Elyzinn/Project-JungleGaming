import {
  FailureCode,
  InvalidTransactionStateError,
  InvalidWagerTransactionError,
} from "./errors.ts";
import type {
  BusinessFailureCode,
  InfrastructureFailureCode,
} from "./errors.ts";
import { LedgerDirection } from "./wallet-ledger-entry.ts";
import { Money } from "./money.ts";

export const WagerTransactionKind = {
  Opening: "OPENING",
  Bet: "BET",
  Win: "WIN",
  Loss: "LOSS",
  Refund: "REFUND",
  Rollback: "ROLLBACK",
} as const;

export type WagerTransactionKind =
  (typeof WagerTransactionKind)[keyof typeof WagerTransactionKind];

export const WagerTransactionStatus = {
  Pending: "PENDING",
  PendingReference: "PENDING_REFERENCE",
  Processed: "PROCESSED",
  Rejected: "REJECTED",
  Failed: "FAILED",
} as const;

export type WagerTransactionStatus =
  (typeof WagerTransactionStatus)[keyof typeof WagerTransactionStatus];

export interface CreateWagerTransactionProps {
  readonly id: string;
  readonly providerId: string;
  readonly externalTransactionId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly walletId: string;
  readonly playerId: string;
  readonly roundId: string;
  readonly gameId: string;
  readonly kind: WagerTransactionKind;
  readonly money: Money;
  readonly referenceExternalTransactionId?: string;
  readonly createdAt?: Date;
}

export interface WagerTransactionState extends Omit<
  CreateWagerTransactionProps,
  "createdAt"
> {
  readonly createdAt: Date;
  readonly status: WagerTransactionStatus;
  readonly referenceTransactionId?: string;
  readonly failureCode?: FailureCode;
  readonly processedAt?: Date;
}

const BUSINESS_FAILURE_CODES: readonly string[] = Object.values(FailureCode).filter(
  (failureCode) => failureCode !== FailureCode.PersistenceFailure,
);

export class WagerTransaction {
  readonly id: string;
  readonly providerId: string;
  readonly externalTransactionId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly walletId: string;
  readonly playerId: string;
  readonly roundId: string;
  readonly gameId: string;
  readonly kind: WagerTransactionKind;
  readonly money: Money;
  readonly referenceExternalTransactionId: string | undefined;
  private readonly createdAtValue: Date;
  private _status: WagerTransactionStatus;
  private _referenceTransactionId: string | undefined;
  private _failureCode: FailureCode | undefined;
  private _processedAt: Date | undefined;

  private constructor(state: WagerTransactionState) {
    this.id = state.id;
    this.providerId = state.providerId;
    this.externalTransactionId = state.externalTransactionId;
    this.idempotencyKey = state.idempotencyKey;
    this.payloadHash = state.payloadHash;
    this.walletId = state.walletId;
    this.playerId = state.playerId;
    this.roundId = state.roundId;
    this.gameId = state.gameId;
    this.kind = state.kind;
    this.money = state.money;
    this.referenceExternalTransactionId =
      state.referenceExternalTransactionId;
    this.createdAtValue = new Date(state.createdAt.getTime());
    this._status = state.status;
    this._referenceTransactionId = state.referenceTransactionId;
    this._failureCode = state.failureCode;
    this._processedAt = state.processedAt
      ? new Date(state.processedAt.getTime())
      : undefined;
  }

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (!props) {
      throw new InvalidWagerTransactionError(
        "Wager transaction properties are required.",
      );
    }
    const state: WagerTransactionState = {
      ...props,
      createdAt: props.createdAt ?? new Date(),
      status: WagerTransactionStatus.Pending,
    };
    WagerTransaction.validateState(state);
    return new WagerTransaction(state);
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    WagerTransaction.validateState(state);
    return new WagerTransaction(state);
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt
      ? new Date(this._processedAt.getTime())
      : undefined;
  }

  get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date): void {
    this.assertCanTransition([
      WagerTransactionStatus.Pending,
      WagerTransactionStatus.PendingReference,
    ]);
    if (
      this.referenceExternalTransactionId !== undefined &&
      !WagerTransaction.isIdentifier(referenceTransactionId)
    ) {
      throw new InvalidWagerTransactionError(
        "A resolved internal transaction id is required for the supplied reference.",
      );
    }
    if (
      this.referenceExternalTransactionId === undefined &&
      referenceTransactionId !== undefined
    ) {
      throw new InvalidWagerTransactionError(
        "A transaction without an external reference cannot have a resolved reference.",
      );
    }
    WagerTransaction.assertValidDate(at);

    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._failureCode = undefined;
    this._processedAt = new Date(at.getTime());
  }

  markPendingReference(): void {
    this.assertCanTransition([WagerTransactionStatus.Pending]);
    if (!this.referenceExternalTransactionId) {
      throw new InvalidWagerTransactionError(
        "Only a transaction with an external reference can await it.",
      );
    }

    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: BusinessFailureCode): void {
    this.assertCanTransition([
      WagerTransactionStatus.Pending,
      WagerTransactionStatus.PendingReference,
    ]);
    if (!WagerTransaction.isBusinessFailureCode(code)) {
      throw new InvalidWagerTransactionError("Rejection failure code is invalid.");
    }

    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
  }

  fail(code: InfrastructureFailureCode): void {
    this.assertCanTransition([
      WagerTransactionStatus.Pending,
      WagerTransactionStatus.PendingReference,
    ]);
    if (code !== FailureCode.PersistenceFailure) {
      throw new InvalidWagerTransactionError("Infrastructure failure code is invalid.");
    }

    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
  }

  isTerminal(): boolean {
    return (
      this._status === WagerTransactionStatus.Processed ||
      this._status === WagerTransactionStatus.Rejected ||
      this._status === WagerTransactionStatus.Failed
    );
  }

  affectsBalance(): boolean {
    return (
      this.kind !== WagerTransactionKind.Loss &&
      this._status !== WagerTransactionStatus.Rejected &&
      this._status !== WagerTransactionStatus.Failed
    );
  }

  requiresReference(): boolean {
    return (
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
        if (reference) {
          throw new InvalidWagerTransactionError(
            "OPENING transactions cannot reference another transaction.",
          );
        }
        return LedgerDirection.Credit;
      case WagerTransactionKind.Win:
        if (reference) {
          this.assertValidReference(reference, [WagerTransactionKind.Bet]);
        }
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Loss:
        throw new InvalidWagerTransactionError(
          "LOSS transactions do not create ledger entries.",
        );
      case WagerTransactionKind.Refund:
        this.assertValidReference(reference, [WagerTransactionKind.Bet]);
        return LedgerDirection.Credit;
      case WagerTransactionKind.Rollback:
        this.assertValidReference(reference, [
          WagerTransactionKind.Bet,
          WagerTransactionKind.Win,
          WagerTransactionKind.Refund,
        ]);
        return reference.kind === WagerTransactionKind.Bet
          ? LedgerDirection.Credit
          : LedgerDirection.Debit;
    }
  }

  private assertCanTransition(
    allowedStatuses: readonly WagerTransactionStatus[],
  ): void {
    if (!allowedStatuses.includes(this._status)) {
      throw new InvalidTransactionStateError(this._status);
    }
  }

  private assertValidReference(
    reference: WagerTransaction | undefined,
    allowedKinds: readonly WagerTransactionKind[],
  ): asserts reference is WagerTransaction {
    if (!reference) {
      throw new InvalidWagerTransactionError(
        "The referenced transaction is required.",
        FailureCode.ReferenceNotFound,
      );
    }
    if (!allowedKinds.includes(reference.kind)) {
      throw new InvalidWagerTransactionError(
        "Referenced transaction kind is not valid for this operation.",
        FailureCode.InvalidReference,
      );
    }
    if (reference.status !== WagerTransactionStatus.Processed) {
      throw new InvalidWagerTransactionError(
        "Referenced transaction must be processed.",
        FailureCode.ReferenceNotProcessed,
      );
    }
    if (
      this.providerId !== reference.providerId ||
      this.playerId !== reference.playerId ||
      this.walletId !== reference.walletId ||
      this.roundId !== reference.roundId ||
      this.money.currency !== reference.money.currency
    ) {
      throw new InvalidWagerTransactionError(
        "Referenced transaction must belong to the same provider, player, wallet, currency, and round.",
        FailureCode.InvalidReference,
      );
    }
    if (
      this.kind !== WagerTransactionKind.Win &&
      !this.money.equals(reference.money)
    ) {
      throw new InvalidWagerTransactionError(
        "Reversal amount must equal the referenced transaction amount.",
        FailureCode.InvalidReference,
      );
    }
  }

  private static validateState(state: WagerTransactionState): void {
    const identifiers = [
      state?.id,
      state?.providerId,
      state?.externalTransactionId,
      state?.idempotencyKey,
      state?.payloadHash,
      state?.walletId,
      state?.playerId,
      state?.roundId,
      state?.gameId,
    ];
    if (
      !state ||
      identifiers.some((value) => !WagerTransaction.isIdentifier(value)) ||
      !Object.values(WagerTransactionKind).includes(state.kind) ||
      !Object.values(WagerTransactionStatus).includes(state.status) ||
      !(state.money instanceof Money) ||
      !state.money.isPositive() ||
      !WagerTransaction.isValidDate(state.createdAt)
    ) {
      throw new InvalidWagerTransactionError(
        "Wager transaction contains invalid fields.",
      );
    }

    if (
      state.referenceExternalTransactionId !== undefined &&
      !WagerTransaction.isIdentifier(state.referenceExternalTransactionId)
    ) {
      throw new InvalidWagerTransactionError(
        "External reference id cannot be empty.",
      );
    }
    if (
      state.referenceTransactionId !== undefined &&
      !WagerTransaction.isIdentifier(state.referenceTransactionId)
    ) {
      throw new InvalidWagerTransactionError(
        "Internal reference id cannot be empty.",
      );
    }
    const requiresReference =
      state.kind === WagerTransactionKind.Refund ||
      state.kind === WagerTransactionKind.Rollback;
    if (
      requiresReference !==
      (state.referenceExternalTransactionId !== undefined)
    ) {
      throw new InvalidWagerTransactionError(
        "Only REFUND and ROLLBACK require an external transaction reference.",
      );
    }

    const isProcessed = state.status === WagerTransactionStatus.Processed;
    const isRejectedOrFailed =
      state.status === WagerTransactionStatus.Rejected ||
      state.status === WagerTransactionStatus.Failed;
    const hasResolvedReference =
      WagerTransaction.isIdentifier(state.referenceTransactionId);
    if (
      isProcessed !== (state.processedAt !== undefined) ||
      (isProcessed &&
        (state.referenceExternalTransactionId !== undefined) !==
          hasResolvedReference) ||
      (isRejectedOrFailed !== (state.failureCode !== undefined)) ||
      (state.status !== WagerTransactionStatus.Processed &&
        state.referenceTransactionId !== undefined)
    ) {
      throw new InvalidWagerTransactionError(
        "Wager transaction state fields do not match its status.",
      );
    }
    if (
      state.status === WagerTransactionStatus.PendingReference &&
      state.referenceExternalTransactionId === undefined
    ) {
      throw new InvalidWagerTransactionError(
        "A pending-reference transaction must have an external reference.",
      );
    }
    if (
      state.processedAt !== undefined &&
      !WagerTransaction.isValidDate(state.processedAt)
    ) {
      throw new InvalidWagerTransactionError("Processed timestamp is invalid.");
    }
    if (
      state.failureCode !== undefined &&
      !Object.values(FailureCode).includes(state.failureCode)
    ) {
      throw new InvalidWagerTransactionError("Failure code is invalid.");
    }
    if (
      (state.status === WagerTransactionStatus.Rejected &&
        state.failureCode === FailureCode.PersistenceFailure) ||
      (state.status === WagerTransactionStatus.Failed &&
        state.failureCode !== FailureCode.PersistenceFailure)
    ) {
      throw new InvalidWagerTransactionError(
        "Failure code does not match the transaction terminal status.",
      );
    }
  }

  private static isBusinessFailureCode(
    code: BusinessFailureCode,
  ): boolean {
    return BUSINESS_FAILURE_CODES.includes(code);
  }

  private static isIdentifier(value: string | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private static isValidDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private static assertValidDate(value: Date): void {
    if (!WagerTransaction.isValidDate(value)) {
      throw new InvalidWagerTransactionError("Transaction timestamp is invalid.");
    }
  }
}

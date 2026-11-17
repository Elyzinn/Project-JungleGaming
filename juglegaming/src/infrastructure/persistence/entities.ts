import { defineEntity, p } from "@mikro-orm/core";

const WalletEntitySchema = defineEntity({
  name: "WalletEntity",
  tableName: "wallets",
  properties: {
    id: p.uuid().primary(),
    playerId: p.uuid().fieldName("player_id"),
    currency: p.string().length(3),
    balance: p.decimal("string").precision(38).scale(2),
    version: p.integer(),
    createdAt: p.datetime().columnType("timestamptz").fieldName("created_at"),
    updatedAt: p.datetime().columnType("timestamptz").fieldName("updated_at"),
  },
  uniques: [
    { name: "uq_wallet_player_currency", properties: ["playerId", "currency"] },
    { name: "uq_wallet_id_currency", properties: ["id", "currency"] },
    {
      name: "uq_wallet_id_player_currency",
      properties: ["id", "playerId", "currency"],
    },
  ],
});

export class WalletEntity extends WalletEntitySchema.class {}
WalletEntitySchema.setClass(WalletEntity);

const WagerTransactionEntitySchema = defineEntity({
  name: "WagerTransactionEntity",
  tableName: "wager_transactions",
  properties: {
    id: p.uuid().primary(),
    providerId: p.string().length(128).fieldName("provider_id"),
    externalTransactionId: p
      .string()
      .length(255)
      .fieldName("external_transaction_id"),
    idempotencyKey: p.string().length(512).fieldName("idempotency_key"),
    payloadHash: p.string().length(128).fieldName("payload_hash"),
    walletId: p.uuid().fieldName("wallet_id"),
    playerId: p.uuid().fieldName("player_id"),
    roundId: p.string().length(255).fieldName("round_id"),
    gameId: p.string().length(255).fieldName("game_id"),
    kind: p.string().length(10),
    amount: p.decimal("string").precision(38).scale(2),
    currency: p.string().length(3),
    referenceExternalTransactionId: p
      .string()
      .length(255)
      .nullable()
      .fieldName("reference_external_transaction_id"),
    referenceTransactionId: p
      .uuid()
      .nullable()
      .fieldName("reference_transaction_id"),
    status: p.string().length(20),
    failureCode: p.string().length(64).nullable().fieldName("failure_code"),
    createdAt: p.datetime().columnType("timestamptz").fieldName("created_at"),
    processedAt: p
      .datetime()
      .columnType("timestamptz")
      .nullable()
      .fieldName("processed_at"),
  },
  uniques: [
    {
      name: "uq_wager_provider_external_id",
      properties: ["providerId", "externalTransactionId"],
    },
    {
      name: "uq_wager_provider_idempotency_key",
      properties: ["providerId", "idempotencyKey"],
    },
    {
      name: "uq_wager_id_wallet_currency",
      properties: ["id", "walletId", "currency"],
    },
    {
      name: "uq_wager_id_context",
      properties: [
        "id",
        "providerId",
        "playerId",
        "walletId",
        "roundId",
        "currency",
      ],
    },
  ],
  indexes: [
    {
      name: "idx_wager_wallet_created",
      properties: ["walletId", "createdAt", "id"],
    },
    {
      name: "idx_wager_provider_reference",
      properties: ["providerId", "referenceExternalTransactionId"],
    },
    { name: "idx_wager_status_created", properties: ["status", "createdAt"] },
  ],
});

export class WagerTransactionEntity extends WagerTransactionEntitySchema.class {}
WagerTransactionEntitySchema.setClass(WagerTransactionEntity);

const WalletLedgerEntryEntitySchema = defineEntity({
  name: "WalletLedgerEntryEntity",
  tableName: "wallet_ledger",
  properties: {
    id: p.uuid().primary(),
    walletId: p.uuid().fieldName("wallet_id"),
    transactionId: p.uuid().fieldName("transaction_id"),
    direction: p.string().length(6),
    amount: p.decimal("string").precision(38).scale(2),
    currency: p.string().length(3),
    balanceBefore: p
      .decimal("string")
      .precision(38)
      .scale(2)
      .fieldName("balance_before"),
    balanceAfter: p
      .decimal("string")
      .precision(38)
      .scale(2)
      .fieldName("balance_after"),
    walletVersion: p.integer().fieldName("wallet_version"),
    createdAt: p.datetime().columnType("timestamptz").fieldName("created_at"),
  },
  uniques: [
    {
      name: "uq_wallet_ledger_transaction",
      properties: ["walletId", "transactionId"],
    },
    {
      name: "uq_wallet_ledger_version",
      properties: ["walletId", "walletVersion"],
    },
  ],
  indexes: [
    {
      name: "idx_wallet_ledger_cursor",
      properties: ["walletId", "createdAt", "id"],
    },
  ],
});

export class WalletLedgerEntryEntity extends WalletLedgerEntryEntitySchema.class {}
WalletLedgerEntryEntitySchema.setClass(WalletLedgerEntryEntity);

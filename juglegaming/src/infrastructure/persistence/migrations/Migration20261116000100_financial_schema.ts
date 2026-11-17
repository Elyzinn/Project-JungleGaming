import { Migration } from "@mikro-orm/migrations";

export class Migration20261116000100_financial_schema extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "currency" varchar(3) NOT NULL,
        "balance" numeric(38, 2) NOT NULL DEFAULT 0.00,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "ck_wallet_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_wallet_balance_non_negative" CHECK ("balance" >= 0),
        CONSTRAINT "ck_wallet_version_positive" CHECK ("version" >= 1),
        CONSTRAINT "uq_wallet_player_currency" UNIQUE ("player_id", "currency"),
        CONSTRAINT "uq_wallet_id_currency" UNIQUE ("id", "currency"),
        CONSTRAINT "uq_wallet_id_player_currency"
          UNIQUE ("id", "player_id", "currency")
      )
    `);

    this.addSql(`
      CREATE TABLE "wager_transactions" (
        "id" uuid NOT NULL,
        "provider_id" varchar(128) NOT NULL,
        "external_transaction_id" varchar(255) NOT NULL,
        "idempotency_key" varchar(512) NOT NULL,
        "payload_hash" varchar(128) NOT NULL,
        "wallet_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "round_id" varchar(255) NOT NULL,
        "game_id" varchar(255) NOT NULL,
        "kind" varchar(10) NOT NULL,
        "amount" numeric(38, 2) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "reference_external_transaction_id" varchar(255),
        "reference_transaction_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "failure_code" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz,
        CONSTRAINT "pk_wager_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "ck_wager_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_wager_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "ck_wager_kind" CHECK (
          "kind" IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')
        ),
        CONSTRAINT "ck_wager_status" CHECK (
          "status" IN (
            'PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'
          )
        ),
        CONSTRAINT "ck_wager_reference_required" CHECK (
          ("kind" NOT IN ('REFUND', 'ROLLBACK') OR
            "reference_external_transaction_id" IS NOT NULL) AND
          ("kind" <> 'OPENING' OR
            "reference_external_transaction_id" IS NULL) AND
          ("status" <> 'PENDING_REFERENCE' OR
            "reference_external_transaction_id" IS NOT NULL) AND
          ("reference_transaction_id" IS NULL OR
            ("reference_external_transaction_id" IS NOT NULL AND
             "status" = 'PROCESSED')) AND
          ("status" <> 'PROCESSED' OR
            "reference_external_transaction_id" IS NULL OR
            "reference_transaction_id" IS NOT NULL)
        ),
        CONSTRAINT "ck_wager_processed_at" CHECK (
          ("status" = 'PROCESSED' AND "processed_at" IS NOT NULL) OR
          ("status" <> 'PROCESSED' AND "processed_at" IS NULL)
        ),
        CONSTRAINT "ck_wager_failure_code" CHECK (
          ("status" IN ('REJECTED', 'FAILED') AND "failure_code" IS NOT NULL) OR
          ("status" NOT IN ('REJECTED', 'FAILED') AND "failure_code" IS NULL)
        ),
        CONSTRAINT "ck_wager_failure_code_value" CHECK (
          "failure_code" IS NULL OR "failure_code" IN (
            'INSUFFICIENT_FUNDS', 'CURRENCY_MISMATCH', 'REFERENCE_NOT_FOUND',
            'INVALID_REFERENCE', 'REFERENCE_NOT_PROCESSED', 'ALREADY_REVERSED',
            'REVERSAL_WOULD_OVERDRAW', 'IDEMPOTENCY_CONFLICT',
            'PERSISTENCE_FAILURE'
          )
        ),
        CONSTRAINT "ck_wager_failure_status" CHECK (
          ("status" = 'FAILED' AND "failure_code" = 'PERSISTENCE_FAILURE') OR
          ("status" = 'REJECTED' AND "failure_code" <> 'PERSISTENCE_FAILURE') OR
          "status" NOT IN ('FAILED', 'REJECTED')
        ),
        CONSTRAINT "fk_wager_wallet_owner_currency"
          FOREIGN KEY ("wallet_id", "player_id", "currency")
          REFERENCES "wallets" ("id", "player_id", "currency")
          ON DELETE RESTRICT,
        CONSTRAINT "uq_wager_id_wallet_currency"
          UNIQUE ("id", "wallet_id", "currency"),
        CONSTRAINT "uq_wager_id_context"
          UNIQUE (
            "id", "provider_id", "player_id", "wallet_id", "round_id", "currency"
          ),
        CONSTRAINT "fk_wager_reference_context"
          FOREIGN KEY (
            "reference_transaction_id", "provider_id", "player_id",
            "wallet_id", "round_id", "currency"
          )
          REFERENCES "wager_transactions" (
            "id", "provider_id", "player_id", "wallet_id", "round_id", "currency"
          )
          ON DELETE RESTRICT,
        CONSTRAINT "uq_wager_provider_external_id"
          UNIQUE ("provider_id", "external_transaction_id"),
        CONSTRAINT "uq_wager_provider_idempotency_key"
          UNIQUE ("provider_id", "idempotency_key")
      )
    `);

    this.addSql(`
      CREATE TABLE "wallet_ledger" (
        "id" uuid NOT NULL,
        "wallet_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "direction" varchar(6) NOT NULL,
        "amount" numeric(38, 2) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "balance_before" numeric(38, 2) NOT NULL,
        "balance_after" numeric(38, 2) NOT NULL,
        "wallet_version" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_wallet_ledger" PRIMARY KEY ("id"),
        CONSTRAINT "ck_ledger_direction" CHECK ("direction" IN ('DEBIT', 'CREDIT')),
        CONSTRAINT "ck_ledger_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "ck_ledger_balances_non_negative"
          CHECK ("balance_before" >= 0 AND "balance_after" >= 0),
        CONSTRAINT "ck_ledger_balance_movement" CHECK (
          ("direction" = 'DEBIT' AND "balance_after" = "balance_before" - "amount") OR
          ("direction" = 'CREDIT' AND "balance_after" = "balance_before" + "amount")
        ),
        CONSTRAINT "ck_ledger_version_positive" CHECK ("wallet_version" >= 1),
        CONSTRAINT "fk_ledger_wallet_currency"
          FOREIGN KEY ("wallet_id", "currency")
          REFERENCES "wallets" ("id", "currency")
          ON DELETE RESTRICT,
        CONSTRAINT "fk_ledger_transaction_wallet_currency"
          FOREIGN KEY ("transaction_id", "wallet_id", "currency")
          REFERENCES "wager_transactions" ("id", "wallet_id", "currency")
          ON DELETE RESTRICT,
        CONSTRAINT "uq_wallet_ledger_transaction"
          UNIQUE ("wallet_id", "transaction_id"),
        CONSTRAINT "uq_wallet_ledger_version"
          UNIQUE ("wallet_id", "wallet_version")
      )
    `);

    this.addSql(`
      CREATE INDEX "idx_wager_wallet_created"
        ON "wager_transactions" ("wallet_id", "created_at", "id")
    `);
    this.addSql(`
      CREATE INDEX "idx_wager_provider_reference"
        ON "wager_transactions" ("provider_id", "reference_external_transaction_id")
        WHERE "reference_external_transaction_id" IS NOT NULL
    `);
    this.addSql(`
      CREATE INDEX "idx_wager_status_created"
        ON "wager_transactions" ("status", "created_at")
    `);
    this.addSql(`
      CREATE UNIQUE INDEX "uq_wager_one_reversal_per_kind"
        ON "wager_transactions" ("provider_id", "reference_transaction_id", "kind")
        WHERE "kind" IN ('REFUND', 'ROLLBACK')
          AND "reference_transaction_id" IS NOT NULL
    `);
    this.addSql(`
      CREATE UNIQUE INDEX "uq_wager_one_opening_per_wallet"
        ON "wager_transactions" ("wallet_id")
        WHERE "kind" = 'OPENING'
    `);
    this.addSql(`
      CREATE INDEX "idx_wallet_ledger_cursor"
        ON "wallet_ledger" ("wallet_id", "created_at", "id")
    `);

    this.addSql(`
      CREATE FUNCTION "enforce_wallet_initial_state"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."balance" <> 0 OR NEW."version" <> 1 THEN
          RAISE EXCEPTION 'wallets must be created with zero balance and version 1'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_wallet_initial_state"
      BEFORE INSERT ON "wallets"
      FOR EACH ROW EXECUTE FUNCTION "enforce_wallet_initial_state"()
    `);

    this.addSql(`
      CREATE FUNCTION "enforce_wallet_balance_update"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."id" <> OLD."id" OR
           NEW."player_id" <> OLD."player_id" OR
           NEW."currency" <> OLD."currency" OR
           NEW."created_at" <> OLD."created_at" THEN
          RAISE EXCEPTION 'wallet identity fields are immutable'
            USING ERRCODE = '55000';
        END IF;

        IF NEW."balance" IS DISTINCT FROM OLD."balance" THEN
          IF NEW."version" = OLD."version" + 1 THEN
            IF NOT EXISTS (
              SELECT 1 FROM "wallet_ledger" l
              WHERE l."wallet_id" = OLD."id"
                AND l."wallet_version" = NEW."version"
                AND l."balance_before" = OLD."balance"
                AND l."balance_after" = NEW."balance"
            ) THEN
              RAISE EXCEPTION 'wallet balance change requires a matching ledger entry'
                USING ERRCODE = '23514';
            END IF;
          ELSIF OLD."version" = 1 AND NEW."version" = 1
            AND OLD."balance" = 0 AND EXISTS (
              SELECT 1
              FROM "wallet_ledger" l
              JOIN "wager_transactions" t ON t."id" = l."transaction_id"
              WHERE l."wallet_id" = OLD."id"
                AND l."wallet_version" = 1
                AND l."direction" = 'CREDIT'
                AND l."balance_before" = 0
                AND l."balance_after" = NEW."balance"
                AND t."kind" = 'OPENING'
            ) THEN
            NULL;
          ELSE
            RAISE EXCEPTION 'wallet version must advance with each balance change'
              USING ERRCODE = '23514';
          END IF;
        ELSIF NEW."version" <> OLD."version" THEN
          RAISE EXCEPTION 'wallet version can change only with its balance'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_wallet_balance_update"
      BEFORE UPDATE ON "wallets"
      FOR EACH ROW EXECUTE FUNCTION "enforce_wallet_balance_update"()
    `);

    this.addSql(`
      CREATE FUNCTION "enforce_wager_reference"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE referenced "wager_transactions"%ROWTYPE;
      BEGIN
        IF NEW."reference_transaction_id" IS NULL THEN
          RETURN NEW;
        END IF;

        IF NEW."reference_transaction_id" = NEW."id" THEN
          RAISE EXCEPTION 'wager transaction cannot reference itself'
            USING ERRCODE = '23514';
        END IF;

        SELECT * INTO referenced
        FROM "wager_transactions"
        WHERE "id" = NEW."reference_transaction_id";

        IF NOT FOUND OR referenced."status" <> 'PROCESSED'
          OR referenced."external_transaction_id" <>
            NEW."reference_external_transaction_id" THEN
          RAISE EXCEPTION 'reference must identify a processed provider transaction'
            USING ERRCODE = '23514';
        END IF;

        IF (NEW."kind" = 'REFUND' AND referenced."kind" <> 'BET') OR
           (NEW."kind" = 'ROLLBACK' AND
             referenced."kind" NOT IN ('BET', 'WIN', 'REFUND')) OR
           (NEW."kind" = 'WIN' AND referenced."kind" <> 'BET') OR
           NEW."kind" NOT IN ('REFUND', 'ROLLBACK', 'WIN') THEN
          RAISE EXCEPTION 'referenced transaction kind is invalid'
            USING ERRCODE = '23514';
        END IF;

        IF NEW."kind" IN ('REFUND', 'ROLLBACK')
          AND NEW."amount" <> referenced."amount" THEN
          RAISE EXCEPTION 'reversal amount must equal the referenced transaction amount'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_wager_reference"
      BEFORE INSERT OR UPDATE OF "reference_transaction_id", "kind", "amount", "status"
      ON "wager_transactions"
      FOR EACH ROW EXECUTE FUNCTION "enforce_wager_reference"()
    `);

    this.addSql(`
      CREATE FUNCTION "guard_wager_transaction_update"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF ROW(
          NEW."id", NEW."provider_id", NEW."external_transaction_id",
          NEW."idempotency_key", NEW."payload_hash", NEW."wallet_id",
          NEW."player_id", NEW."round_id", NEW."game_id", NEW."kind",
          NEW."amount", NEW."currency", NEW."reference_external_transaction_id",
          NEW."created_at"
        ) IS DISTINCT FROM ROW(
          OLD."id", OLD."provider_id", OLD."external_transaction_id",
          OLD."idempotency_key", OLD."payload_hash", OLD."wallet_id",
          OLD."player_id", OLD."round_id", OLD."game_id", OLD."kind",
          OLD."amount", OLD."currency", OLD."reference_external_transaction_id",
          OLD."created_at"
        ) THEN
          RAISE EXCEPTION 'wager transaction business fields are immutable'
            USING ERRCODE = '55000';
        END IF;

        IF OLD."status" IN ('PROCESSED', 'REJECTED', 'FAILED')
          AND NEW."status" <> OLD."status" THEN
          RAISE EXCEPTION 'terminal wager transaction status is immutable'
            USING ERRCODE = '55000';
        END IF;

        IF OLD."status" IN ('PROCESSED', 'REJECTED', 'FAILED')
          AND ROW(
            NEW."reference_transaction_id", NEW."failure_code", NEW."processed_at"
          ) IS DISTINCT FROM ROW(
            OLD."reference_transaction_id", OLD."failure_code", OLD."processed_at"
          ) THEN
          RAISE EXCEPTION 'terminal wager transaction metadata is immutable'
            USING ERRCODE = '55000';
        END IF;

        IF (OLD."status" = 'PENDING' AND NEW."status" NOT IN (
              'PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'
            )) OR
           (OLD."status" = 'PENDING_REFERENCE' AND NEW."status" NOT IN (
              'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'
            )) THEN
          RAISE EXCEPTION 'invalid wager transaction state transition'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_wager_transaction_update"
      BEFORE UPDATE ON "wager_transactions"
      FOR EACH ROW EXECUTE FUNCTION "guard_wager_transaction_update"()
    `);
    this.addSql(`
      CREATE FUNCTION "reject_wager_transaction_delete"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'wager transactions are audit records and cannot be deleted'
          USING ERRCODE = '55000';
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_wager_transaction_no_delete"
      BEFORE DELETE ON "wager_transactions"
      FOR EACH ROW EXECUTE FUNCTION "reject_wager_transaction_delete"()
    `);

    this.addSql(`
      CREATE FUNCTION "enforce_ledger_insert"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE persisted_wallet "wallets"%ROWTYPE;
      DECLARE wager "wager_transactions"%ROWTYPE;
      DECLARE reference_kind varchar(10);
      DECLARE expected_direction varchar(6);
      BEGIN
        SELECT * INTO persisted_wallet
        FROM "wallets"
        WHERE "id" = NEW."wallet_id"
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ledger wallet does not exist'
            USING ERRCODE = '23503';
        END IF;

        SELECT * INTO wager
        FROM "wager_transactions"
        WHERE "id" = NEW."transaction_id";

        IF NOT FOUND OR wager."status" <> 'PROCESSED' OR wager."kind" = 'LOSS' THEN
          RAISE EXCEPTION 'ledger entries require a processed balance-affecting transaction'
            USING ERRCODE = '23514';
        END IF;

        IF wager."kind" = 'BET' THEN
          expected_direction := 'DEBIT';
        ELSIF wager."kind" IN ('OPENING', 'WIN', 'REFUND') THEN
          expected_direction := 'CREDIT';
        ELSIF wager."kind" = 'ROLLBACK' THEN
          SELECT "kind" INTO reference_kind
          FROM "wager_transactions"
          WHERE "id" = wager."reference_transaction_id";
          expected_direction := CASE
            WHEN reference_kind = 'BET' THEN 'CREDIT'
            ELSE 'DEBIT'
          END;
        ELSE
          RAISE EXCEPTION 'transaction kind cannot create a ledger entry'
            USING ERRCODE = '23514';
        END IF;

        IF NEW."direction" <> expected_direction THEN
          RAISE EXCEPTION 'ledger direction does not match transaction kind'
            USING ERRCODE = '23514';
        END IF;

        IF NEW."wallet_version" = 1
          AND wager."kind" = 'OPENING'
          AND persisted_wallet."version" = 1
          AND persisted_wallet."balance" = 0
          AND NEW."balance_before" = 0 THEN
          RETURN NEW;
        END IF;

        IF NEW."wallet_version" <> persisted_wallet."version" + 1
          OR NEW."balance_before" <> persisted_wallet."balance" THEN
          RAISE EXCEPTION 'ledger entry does not follow current wallet balance and version'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_ledger_insert"
      BEFORE INSERT ON "wallet_ledger"
      FOR EACH ROW EXECUTE FUNCTION "enforce_ledger_insert"()
    `);

    this.addSql(`
      CREATE FUNCTION "reject_ledger_mutation"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'wallet ledger is append-only'
          USING ERRCODE = '55000';
      END;
      $$
    `);
    this.addSql(`
      CREATE TRIGGER "trg_ledger_immutable"
      BEFORE UPDATE OR DELETE ON "wallet_ledger"
      FOR EACH ROW EXECUTE FUNCTION "reject_ledger_mutation"()
    `);
    this.addSql(`
      CREATE TRIGGER "trg_ledger_no_truncate"
      BEFORE TRUNCATE ON "wallet_ledger"
      FOR EACH STATEMENT EXECUTE FUNCTION "reject_ledger_mutation"()
    `);

    this.addSql(`
      CREATE FUNCTION "assert_wallet_ledger_consistency"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE target_wallet_id uuid;
      DECLARE persisted_wallet "wallets"%ROWTYPE;
      DECLARE latest_entry "wallet_ledger"%ROWTYPE;
      BEGIN
        IF TG_TABLE_NAME = 'wallets' THEN
          target_wallet_id := NEW."id";
        ELSE
          target_wallet_id := NEW."wallet_id";
        END IF;

        SELECT * INTO persisted_wallet
        FROM "wallets"
        WHERE "id" = target_wallet_id;

        IF NOT FOUND THEN
          RETURN NULL;
        END IF;

        SELECT * INTO latest_entry
        FROM "wallet_ledger"
        WHERE "wallet_id" = target_wallet_id
        ORDER BY "wallet_version" DESC
        LIMIT 1;

        IF FOUND THEN
          IF persisted_wallet."balance" <> latest_entry."balance_after"
            OR persisted_wallet."version" <> latest_entry."wallet_version" THEN
            RAISE EXCEPTION 'wallet balance/version must match its latest ledger entry'
              USING ERRCODE = '23514';
          END IF;
        ELSIF persisted_wallet."balance" <> 0 OR persisted_wallet."version" <> 1 THEN
          RAISE EXCEPTION 'wallet without ledger entries must have zero balance and version 1'
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$
    `);
    this.addSql(`
      CREATE CONSTRAINT TRIGGER "trg_wallet_ledger_consistency_wallet"
      AFTER INSERT OR UPDATE ON "wallets"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "assert_wallet_ledger_consistency"()
    `);
    this.addSql(`
      CREATE CONSTRAINT TRIGGER "trg_wallet_ledger_consistency_entry"
      AFTER INSERT ON "wallet_ledger"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "assert_wallet_ledger_consistency"()
    `);

    this.addSql(`
      CREATE FUNCTION "assert_processed_transaction_ledger"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE entry_count integer;
      BEGIN
        SELECT count(*) INTO entry_count
        FROM "wallet_ledger"
        WHERE "transaction_id" = NEW."id";

        IF NEW."status" = 'PROCESSED' AND NEW."kind" <> 'LOSS'
          AND entry_count <> 1 THEN
          RAISE EXCEPTION 'processed balance-affecting transaction requires one ledger entry'
            USING ERRCODE = '23514';
        END IF;

        IF (NEW."status" <> 'PROCESSED' OR NEW."kind" = 'LOSS')
          AND entry_count <> 0 THEN
          RAISE EXCEPTION 'only processed balance-affecting transactions may have ledger entries'
            USING ERRCODE = '23514';
        END IF;

        RETURN NULL;
      END;
      $$
    `);
    this.addSql(`
      CREATE CONSTRAINT TRIGGER "trg_processed_transaction_ledger"
      AFTER INSERT OR UPDATE ON "wager_transactions"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "assert_processed_transaction_ledger"()
    `);
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE "wallet_ledger"');
    this.addSql('DROP TABLE "wager_transactions"');
    this.addSql('DROP TABLE "wallets"');
    this.addSql('DROP FUNCTION "assert_processed_transaction_ledger"()');
    this.addSql('DROP FUNCTION "assert_wallet_ledger_consistency"()');
    this.addSql('DROP FUNCTION "reject_ledger_mutation"()');
    this.addSql('DROP FUNCTION "enforce_ledger_insert"()');
    this.addSql('DROP FUNCTION "reject_wager_transaction_delete"()');
    this.addSql('DROP FUNCTION "guard_wager_transaction_update"()');
    this.addSql('DROP FUNCTION "enforce_wager_reference"()');
    this.addSql('DROP FUNCTION "enforce_wallet_balance_update"()');
    this.addSql('DROP FUNCTION "enforce_wallet_initial_state"()');
  }
}

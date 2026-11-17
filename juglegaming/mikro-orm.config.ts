import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import {
  WalletEntity,
  WalletLedgerEntryEntity,
  WagerTransactionEntity,
} from "./src/infrastructure/persistence/entities.ts";

export default defineConfig({
  clientUrl:
    process.env.DATABASE_URL ??
    "postgresql://juglegaming:juglegaming_local@127.0.0.1:5433/juglegaming",
  entities: [WalletEntity, WagerTransactionEntity, WalletLedgerEntryEntity],
  extensions: [Migrator],
  migrations: {
    path: "./dist/infrastructure/persistence/migrations",
    pathTs: "./src/infrastructure/persistence/migrations",
    glob: "!(*.d).{js,ts,cjs}",
    tableName: "mikro_orm_migrations",
    transactional: true,
    allOrNothing: true,
    snapshot: false,
  },
});

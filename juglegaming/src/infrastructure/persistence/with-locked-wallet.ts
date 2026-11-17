import { LockMode } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { WalletEntity } from "./entities.ts";

export function withLockedWallet<T>(
  entityManager: EntityManager,
  walletId: string,
  operation: (transactionManager: EntityManager, wallet: WalletEntity) => Promise<T>,
): Promise<T> {
  return entityManager.transactional(async (transactionManager) => {
    const wallet = await transactionManager.findOneOrFail(
      WalletEntity,
      { id: walletId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    return operation(transactionManager, wallet);
  });
}

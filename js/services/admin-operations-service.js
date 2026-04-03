import { createUnavailableVaultOperation } from '../utils/vault-operations.js';

export class AdminOperationsService {
  constructor(contractManager) {
    this.contractManager = contractManager;
  }

  async load(contractKey = 'source') {
    const contractManager = this.contractManager;
    const contract = contractManager?.getReadContract?.(contractKey);
    if (!contractManager || !contract) {
      const error = new Error('Contract not ready.');
      error.code = 'ADMIN_OPERATIONS_CONTRACT_NOT_READY';
      throw error;
    }

    const operationIds = await getOperationIds(contract);
    const itemsById = await contractManager.getOperationsBatch?.(operationIds, contractKey);

    return {
      items: operationIds.map((operationId) => itemsById?.get?.(operationId) || createUnavailableVaultOperation(operationId)),
      activeCount: operationIds.length,
    };
  }
}

async function getOperationIds(contract) {
  if (typeof contract.getAllOperationIds === 'function') {
    return normalizeOperationIds(await contract.getAllOperationIds()).reverse();
  }

  if (typeof contract.getOperationIdsCount !== 'function' || typeof contract.operationIds !== 'function') {
    throw new Error('Contract ABI does not expose enumerable operation IDs.');
  }

  const count = Number(await contract.getOperationIdsCount());
  if (count <= 0) return [];

  const ids = await Promise.all(Array.from({ length: count }, (_, index) => contract.operationIds(index)));
  return normalizeOperationIds(ids).reverse();
}

function normalizeOperationIds(ids) {
  return [...new Set(ids.map((operationId) => String(operationId).trim()).filter(Boolean))];
}

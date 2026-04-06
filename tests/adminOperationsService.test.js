import { describe, expect, it, vi } from 'vitest';

import { AdminOperationsService } from '../js/services/admin-operations-service.js';

const OPERATION_ID_ONE = `0x${'1'.repeat(64)}`;
const OPERATION_ID_TWO = `0x${'2'.repeat(64)}`;

function createHarness({
  contractOverrides = {},
  operationDetails = {},
} = {}) {
  const contract = {
    getAllOperationIds: vi.fn(async () => [OPERATION_ID_ONE, OPERATION_ID_TWO]),
    ...contractOverrides,
  };

  const contractManager = {
    getReadContract: vi.fn(() => contract),
    getOperationsBatch: vi.fn(async (operationIds) => {
      return new Map(
        (operationIds || []).map((operationId) => [
          operationId,
          Object.prototype.hasOwnProperty.call(operationDetails, operationId)
            ? operationDetails[operationId]
            : {
                operationId,
                opType: operationId === OPERATION_ID_ONE ? 0 : 2,
                target: '0x1111111111111111111111111111111111111111',
                value: '100',
                data: '0x',
                numSignatures: 1,
                executed: false,
                deadline: 2000000000,
                expired: false,
              },
        ])
      );
    }),
  };

  return {
    service: new AdminOperationsService(contractManager),
    contract,
    contractManager,
  };
}

describe('AdminOperationsService', () => {
  it('loads enumerable operation ids and hydrates them in reverse insertion order', async () => {
    const { service, contract, contractManager } = createHarness();

    const result = await service.load();

    expect(contract.getAllOperationIds).toHaveBeenCalledTimes(1);
    expect(contractManager.getOperationsBatch).toHaveBeenCalledWith([OPERATION_ID_TWO, OPERATION_ID_ONE], 'source');
    expect(result.activeCount).toBe(2);
    expect(result.items.map((item) => item.operationId)).toEqual([OPERATION_ID_TWO, OPERATION_ID_ONE]);
  });

  it('falls back to count-plus-index enumeration when getAllOperationIds is unavailable', async () => {
    const { service, contract, contractManager } = createHarness({
      contractOverrides: {
        getAllOperationIds: undefined,
        getOperationIdsCount: vi.fn(async () => ({ toString: () => '2' })),
        operationIds: vi.fn(async (index) => [OPERATION_ID_ONE, OPERATION_ID_TWO][index]),
      },
    });

    const result = await service.load();

    expect(contract.getOperationIdsCount).toHaveBeenCalledTimes(1);
    expect(contract.operationIds).toHaveBeenNthCalledWith(1, 0);
    expect(contract.operationIds).toHaveBeenNthCalledWith(2, 1);
    expect(contractManager.getOperationsBatch).toHaveBeenCalledWith([OPERATION_ID_TWO, OPERATION_ID_ONE], 'source');
    expect(result.items.map((item) => item.operationId)).toEqual([OPERATION_ID_TWO, OPERATION_ID_ONE]);
  });

  it('keeps unavailable operations as placeholders instead of dropping them', async () => {
    const { service } = createHarness({
      operationDetails: {
        [OPERATION_ID_ONE]: null,
        [OPERATION_ID_TWO]: {
          operationId: OPERATION_ID_TWO,
          opType: 2,
          target: '0x1111111111111111111111111111111111111111',
          value: '0',
          data: '0x',
          numSignatures: 2,
          executed: true,
          deadline: 2000000000,
          expired: false,
        },
      },
    });

    const result = await service.load();

    expect(result.activeCount).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].operationId).toBe(OPERATION_ID_TWO);
    expect(result.items[1]).toMatchObject({
      state: 'unavailable',
      operationId: OPERATION_ID_ONE,
      message: 'Operation details unavailable. Refresh to retry.',
    });
  });

  it('throws a clear error when the ABI cannot enumerate operation ids', async () => {
    const { service } = createHarness({
      contractOverrides: {
        getAllOperationIds: undefined,
        getOperationIdsCount: undefined,
        operationIds: undefined,
      },
    });

    await expect(service.load()).rejects.toThrow('Contract ABI does not expose enumerable operation IDs.');
  });
});

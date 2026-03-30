import { beforeEach, describe, expect, it } from 'vitest';

import { ContractManager } from '../js/contracts/contract-manager.js';
import { installCommonWindowStubs, normalizeAddress } from './helpers/test-utils.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const SIGNER = '0x2222222222222222222222222222222222222222';
const STRANGER = '0x3333333333333333333333333333333333333333';

describe('ContractManager access state', () => {
  beforeEach(() => {
    installCommonWindowStubs();
  });

  it('returns owner and signer membership from contract reads', async () => {
    const manager = new ContractManager();
    manager.contractRead = {
      owner: async () => OWNER,
      isSigner: async (address) => address === normalizeAddress(SIGNER),
    };

    const ownerState = await manager.getAccessState(OWNER);
    expect(ownerState.owner).toBe(normalizeAddress(OWNER));
    expect(ownerState.isOwner).toBe(true);
    expect(ownerState.isSigner).toBe(false);
    expect(ownerState.error).toBeNull();

    const signerState = await manager.getAccessState(SIGNER);
    expect(signerState.owner).toBe(normalizeAddress(OWNER));
    expect(signerState.isOwner).toBe(false);
    expect(signerState.isSigner).toBe(true);
    expect(signerState.error).toBeNull();
  });

  it('preserves partial success when one contract read fails', async () => {
    const manager = new ContractManager();
    manager.contractRead = {
      owner: async () => {
        throw new Error('owner unavailable');
      },
      isSigner: async () => true,
    };

    const state = await manager.getAccessState(SIGNER);
    expect(state.owner).toBeNull();
    expect(state.isOwner).toBe(false);
    expect(state.isSigner).toBe(true);
    expect(state.ownerError).toBe('owner unavailable');
    expect(state.signerError).toBeNull();
    expect(state.error).toBe('owner unavailable');
  });

  it('rejects invalid addresses and contract-not-ready reads', async () => {
    const manager = new ContractManager();

    const invalid = await manager.getAccessState('not-an-address');
    expect(invalid.address).toBeNull();
    expect(invalid.error).toBe('Invalid address');
    expect(invalid.isOwner).toBe(false);
    expect(invalid.isSigner).toBe(false);

    const noContract = await manager.getAccessState(STRANGER);
    expect(noContract.address).toBe(normalizeAddress(STRANGER));
    expect(noContract.error).toBe('Contract not ready');
    expect(noContract.isOwner).toBe(false);
    expect(noContract.isSigner).toBe(false);
  });

  it('batch-loads operation state and expiry', async () => {
    const manager = new ContractManager();
    manager.contractRead = {
      operations: async (operationId) => ({
        0: { toString: () => (operationId === 'op-1' ? '0' : '2') },
        1: OWNER,
        2: { toString: () => '100' },
        3: '0x',
        4: { toString: () => '2' },
        5: operationId === 'op-2',
        6: { toString: () => '2000000000' },
      }),
      isOperationExpired: async (operationId) => operationId === 'op-1',
    };

    const result = await manager.getOperationsBatch(['op-1', 'op-2']);

    expect(result.get('op-1')).toMatchObject({
      operationId: 'op-1',
      opType: 0,
      target: OWNER,
      data: '0x',
      numSignatures: 2,
      executed: false,
      deadline: 2000000000,
      expired: true,
    });
    expect(result.get('op-2')).toMatchObject({
      operationId: 'op-2',
      opType: 2,
      executed: true,
      expired: false,
    });
  });

  it('does not require enumerable operation reads in the status snapshot', async () => {
    const manager = new ContractManager();
    manager.contractRead = {
      getChainId: async () => ({ toString: () => '80002' }),
      chainId: async () => ({ toString: () => '80002' }),
      owner: async () => OWNER,
      operationCount: async () => ({ toString: () => '9' }),
      OPERATION_DEADLINE: async () => ({ toString: () => '259200' }),
      token: async () => '0x9999999999999999999999999999999999999999',
      REQUIRED_SIGNATURES: async () => ({ toString: () => '3' }),
      bridgeOutEnabled: async () => true,
      halted: async () => false,
      maxBridgeOutAmount: async () => ({ toString: () => '1000' }),
      getVaultBalance: async () => ({ toString: () => '5000' }),
      signers: async (index) => [OWNER, SIGNER, STRANGER, '0x4444444444444444444444444444444444444444'][index],
    };

    const snapshot = await manager.refreshStatus();

    expect(snapshot.operationCount).toBe(9);
    expect(snapshot).not.toHaveProperty('activeOperationCount');
    expect(snapshot.requiredSignatures).toBe(3);
    expect(snapshot.error).toBeNull();
  });
});

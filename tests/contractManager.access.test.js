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
});

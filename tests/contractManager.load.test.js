import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContractManager } from '../js/contracts/contract-manager.js';
import { installCommonWindowStubs, normalizeAddress } from './helpers/test-utils.js';

const OWNER = '0x1111111111111111111111111111111111111111';

describe('ContractManager load behavior', () => {
  beforeEach(() => {
    installCommonWindowStubs();
    window.ethers.Contract = vi.fn((address, abi, signerOrProvider) => ({
      address,
      abi,
      signerOrProvider,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the source context usable when the destination context fails to load', async () => {
    const manager = new ContractManager({
      walletManager: {
        getProvider: vi.fn(() => null),
        getSigner: vi.fn(() => null),
      },
      networkManager: {
        isTxEnabled: vi.fn(() => false),
        isTxEnabledFor: vi.fn(() => false),
      },
    });

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bindSpy = vi.spyOn(manager, '_bindWalletEvents');
    const refreshSpy = vi.spyOn(manager, 'refreshAllStatus').mockResolvedValue({});
    vi.spyOn(manager, '_loadContext').mockImplementation(async (key) => {
      const context = manager.getContext(key);
      if (key === 'source') {
        context.readOnlyProvider = { name: 'source-provider' };
        context.abi = [];
        context.loadError = null;
        return;
      }

      context.readOnlyProvider = null;
      context.abi = null;
      context.loadError = 'Destination RPC down';
      throw new Error('Destination RPC down');
    });

    await expect(manager.load()).resolves.toBeUndefined();

    expect(bindSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledWith({ reason: 'load' });
    expect(manager.isReady('source')).toBe(true);
    expect(manager.isReady('destination')).toBe(false);

    const destinationAccess = await manager.getAccessState(OWNER, 'destination');
    expect(destinationAccess.address).toBe(normalizeAddress(OWNER));
    expect(destinationAccess.error).toBe('Destination RPC down');
  });

  it('still rejects load when every context fails', async () => {
    const manager = new ContractManager({
      walletManager: {
        getProvider: vi.fn(() => null),
        getSigner: vi.fn(() => null),
      },
      networkManager: {
        isTxEnabled: vi.fn(() => false),
        isTxEnabledFor: vi.fn(() => false),
      },
    });

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(manager, 'refreshAllStatus').mockResolvedValue({});
    vi.spyOn(manager, '_loadContext').mockImplementation(async (key) => {
      manager.getContext(key).loadError = `${key} offline`;
      throw new Error(`${key} offline`);
    });

    await expect(manager.load()).rejects.toThrow('Source Vault: source offline');
    expect(manager.isReady('source')).toBe(false);
    expect(manager.isReady('destination')).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/utils/read-only-provider.js', () => ({
  getReadOnlyProviderForNetwork: vi.fn(),
}));

import { ContractManager } from '../js/contracts/contract-manager.js';
import { getReadOnlyProviderForNetwork } from '../js/utils/read-only-provider.js';
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
    vi.mocked(getReadOnlyProviderForNetwork).mockResolvedValue({ name: 'read-only-provider' });
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

  it('preserves a loaded ABI when the public provider fails to initialize', async () => {
    const walletProvider = { name: 'wallet-provider' };
    const walletSigner = { name: 'wallet-signer' };
    const manager = new ContractManager({
      walletManager: {
        getProvider: vi.fn(() => walletProvider),
        getSigner: vi.fn(() => walletSigner),
      },
      networkManager: {
        isTxEnabled: vi.fn(() => false),
        isTxEnabledFor: vi.fn((key) => key === 'destination'),
      },
    });

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(manager, '_fetchAbi').mockImplementation(async () => ['destination-abi']);
    const providerSpy = vi.spyOn(window.ethers, 'Contract');
    vi.mocked(getReadOnlyProviderForNetwork).mockRejectedValue(new Error('Destination RPC down'));

    await expect(manager._loadContext('destination')).rejects.toThrow('Destination RPC down');

    manager.updateConnections({ reason: 'test' });

    expect(manager.getAbi('destination')).toEqual(['destination-abi']);
    expect(manager.getReadContract('destination')).not.toBeNull();
    expect(manager.getWriteContract('destination')).not.toBeNull();
    expect(getReadOnlyProviderForNetwork).toHaveBeenCalledTimes(1);
    expect(providerSpy).toHaveBeenCalledWith(
      expect.any(String),
      ['destination-abi'],
      walletProvider
    );
    expect(providerSpy).toHaveBeenCalledWith(
      expect.any(String),
      ['destination-abi'],
      walletSigner
    );
  });
});

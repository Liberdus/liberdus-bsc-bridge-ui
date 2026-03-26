import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletManager } from '../js/wallet/wallet-manager.js';

function makeProvider({ accounts = ['0x1111111111111111111111111111111111111111'], chainId = '0x13882', flags = {} } = {}) {
  return {
    ...flags,
    request: vi.fn(async ({ method }) => {
      if (method === 'eth_accounts') return accounts;
      if (method === 'eth_requestAccounts') return accounts;
      if (method === 'eth_chainId') return chainId;
      if (method === 'wallet_revokePermissions') return null;
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('WalletManager multi-provider restore behavior', () => {
  beforeEach(() => {
    delete window.ethereum;
    localStorage.clear();
    window.ethers = {
      providers: {
        Web3Provider: class FakeWeb3Provider {
          constructor(provider, network) {
            this.provider = provider;
            this.network = network;
          }

          getSigner() {
            return { kind: 'signer' };
          }
        },
      },
    };
  });

  afterEach(() => {
    delete window.ethereum;
    delete window.ethers;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('silently restores an old connection only when exactly one wallet is available', async () => {
    const provider = makeProvider({ flags: { isMetaMask: true } });
    window.ethereum = { providers: [provider] };

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));

    const manager = new WalletManager();
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    manager.load();
    const restored = await manager.init();

    expect(restored).toBeUndefined();
    expect(manager.isConnected()).toBe(true);
    expect(provider.request.mock.calls.map(([payload]) => payload.method)).toEqual(['eth_accounts', 'eth_chainId']);
    expect(connectedEvents).toHaveLength(1);
    expect(connectedEvents[0].restored).toBe(true);
    expect(connectedEvents[0].walletId).toBe('metamask');
    expect(localStorage.getItem('liberdus_token_ui_last_selected_wallet_id')).toBe('metamask');
  });

  it('does not silently restore old storage when multiple wallets are available', async () => {
    const brave = makeProvider({ flags: { isMetaMask: true, isBraveWallet: true } });
    const metamask = makeProvider({ flags: { isMetaMask: true } });
    window.ethereum = { providers: [brave, metamask] };

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));

    const manager = new WalletManager();
    manager.load();
    await manager.init();

    expect(manager.isConnected()).toBe(false);
    expect(brave.request).not.toHaveBeenCalled();
    expect(metamask.request).not.toHaveBeenCalled();
  });

  it('skips silent restore after an explicit user disconnect preference is stored', async () => {
    const provider = makeProvider({ flags: { isMetaMask: true } });
    window.ethereum = { providers: [provider] };

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      walletId: 'metamask',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));
    localStorage.setItem('liberdus_token_ui_last_selected_wallet_id', 'metamask');
    localStorage.setItem('liberdus_token_ui_wallet_user_disconnected', 'true');

    const manager = new WalletManager();
    manager.load();
    await manager.init();

    expect(manager.isConnected()).toBe(false);
    expect(provider.request).not.toHaveBeenCalled();
  });
});

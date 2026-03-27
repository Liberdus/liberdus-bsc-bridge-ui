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
    expect(brave.request.mock.calls.map(([payload]) => payload.method)).toEqual(['eth_accounts']);
    expect(metamask.request.mock.calls.map(([payload]) => payload.method)).toEqual(['eth_accounts']);
  });

  it('falls back to the stored session when the last selected wallet id is stale', async () => {
    const provider = makeProvider({ flags: { isMetaMask: true } });
    window.ethereum = { providers: [provider] };

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      walletId: 'metamask',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));
    localStorage.setItem('liberdus_token_ui_last_selected_wallet_id', 'stale-wallet-id');

    const manager = new WalletManager();
    manager.load();
    await manager.init();

    expect(manager.isConnected()).toBe(true);
    expect(provider.request.mock.calls.map(([payload]) => payload.method)).toEqual(['eth_accounts', 'eth_chainId']);
    expect(localStorage.getItem('liberdus_token_ui_last_selected_wallet_id')).toBe('metamask');
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

  it('retries silent restore when a wallet is announced after app startup', async () => {
    const provider = makeProvider({ flags: { isMetaMask: true } });

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      walletId: 'metamask-wallet',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));
    localStorage.setItem('liberdus_token_ui_last_selected_wallet_id', 'metamask-wallet');

    const manager = new WalletManager();
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    manager.load();
    await manager.init();

    expect(manager.isConnected()).toBe(false);
    expect(provider.request).not.toHaveBeenCalled();

    manager.connector._boundAnnounceProvider({
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider,
      },
    });

    await vi.waitFor(() => {
      expect(manager.isConnected()).toBe(true);
    });

    expect(provider.request.mock.calls.map(([payload]) => payload.method)).toEqual(['eth_accounts', 'eth_chainId']);
    expect(connectedEvents).toHaveLength(1);
    expect(connectedEvents[0].restored).toBe(true);
    expect(connectedEvents[0].walletId).toBe('metamask-wallet');
  });

  it('waits for a wallet whose accounts match stored legacy session data', async () => {
    const wrongWallet = makeProvider({
      accounts: ['0x2222222222222222222222222222222222222222'],
      flags: { isMetaMask: true, isBraveWallet: true },
    });
    const rightWallet = makeProvider({ flags: { isMetaMask: true } });

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));

    const manager = new WalletManager();
    manager.load();
    await manager.init();

    manager.connector._boundAnnounceProvider({
      detail: {
        info: {
          uuid: 'brave-wallet',
          name: 'Brave Wallet',
          icon: 'data:image/svg+xml;base64,brave',
          rdns: 'com.brave.wallet',
        },
        provider: wrongWallet,
      },
    });

    await vi.waitFor(() => {
      expect(wrongWallet.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });
    expect(manager.isConnected()).toBe(false);

    manager.connector._boundAnnounceProvider({
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider: rightWallet,
      },
    });

    await vi.waitFor(() => {
      expect(manager.isConnected()).toBe(true);
    });

    expect(manager.getAddress()).toBe('0x1111111111111111111111111111111111111111');
    expect(manager.getProvider().provider).toBe(rightWallet);
    expect(wrongWallet.request).not.toHaveBeenCalledWith({ method: 'eth_chainId' });
  });

  it('rebinds a restored session when the active wallet provider changes', async () => {
    const legacyWallet = makeProvider({ flags: { isMetaMask: true } });
    const announcedWallet = makeProvider({ flags: { isMetaMask: true } });

    window.ethereum = { providers: [legacyWallet] };

    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({
      walletId: 'metamask',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      timestamp: Date.now(),
    }));
    localStorage.setItem('liberdus_token_ui_last_selected_wallet_id', 'metamask');

    const manager = new WalletManager();
    manager.load();
    await manager.init();

    expect(manager.getProvider().provider).toBe(legacyWallet);

    manager.connector._boundAnnounceProvider({
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider: announcedWallet,
      },
    });

    await vi.waitFor(() => {
      expect(manager.getProvider().provider).toBe(announcedWallet);
    });

    expect(legacyWallet.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(announcedWallet.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
  });
});

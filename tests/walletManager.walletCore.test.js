import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletManager } from '../js/wallet/wallet-manager.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const WALLET_SESSION_KEY = 'liberdus_bsc_bridge_ui:wallet-session';

function makeProvider({ accounts = [ACCOUNT], chainId = '0x13882', flags = { isMetaMask: true } } = {}) {
  const listeners = new Map();
  return {
    ...flags,
    request: vi.fn(async ({ method }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return accounts;
      if (method === 'eth_chainId') return chainId;
      if (method === 'wallet_revokePermissions') return null;
      return null;
    }),
    on: vi.fn((event, handler) => {
      const eventListeners = listeners.get(event) || new Set();
      eventListeners.add(handler);
      listeners.set(event, eventListeners);
    }),
    removeListener: vi.fn((event, handler) => {
      listeners.get(event)?.delete(handler);
    }),
    emit(event, payload) {
      for (const handler of listeners.get(event) || []) {
        handler(payload);
      }
    },
  };
}

function installWindow({ provider, providers = null, multiListener = false } = {}) {
  const listeners = multiListener ? new Map() : null;

  window.ethereum = providers ? { providers } : provider;
  window.ethers = {
    providers: {
      Web3Provider: class {
        constructor(injectedProvider) {
          this.provider = injectedProvider;
        }

        getSigner() {
          return { kind: 'signer' };
        }
      },
    },
  };

  if (multiListener) {
    window.dispatchEvent = (event) => {
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    };
    window.addEventListener = (type, handler) => {
      const set = listeners.get(type) || new Set();
      set.add(handler);
      listeners.set(type, set);
    };
    window.removeEventListener = (type, handler) => {
      listeners.get(type)?.delete(handler);
    };
    return listeners;
  }

  const handlerByType = new Map();
  window.dispatchEvent = (event) => {
    handlerByType.get(event.type)?.(event);
    return true;
  };
  window.addEventListener = (type, handler) => handlerByType.set(type, handler);
  window.removeEventListener = (type, handler) => {
    if (handlerByType.get(type) === handler) handlerByType.delete(type);
  };
  return handlerByType;
}

function saveWalletSession(walletId, extra = {}) {
  localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({ walletId, ...extra }));
}

function announceWallet(walletId, name, provider, { rdns = `org.liberdus.${walletId}` } = {}) {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: {
      info: { uuid: walletId, name, rdns },
      provider,
    },
  }));
}

async function readyManager() {
  const manager = new WalletManager();
  manager.load();
  await manager.walletCore.discoverWallets(0);
  return manager;
}

describe('WalletManager wallet-core adapter', () => {
  let originalDispatchEvent;
  let originalAddEventListener;
  let originalRemoveEventListener;

  beforeEach(() => {
    originalDispatchEvent = window.dispatchEvent;
    originalAddEventListener = window.addEventListener;
    originalRemoveEventListener = window.removeEventListener;
    localStorage.clear();
    installWindow({ provider: makeProvider() });
  });

  afterEach(() => {
    delete window.ethereum;
    delete window.ethers;
    window.dispatchEvent = originalDispatchEvent;
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('connects with an explicit wallet id', async () => {
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    await manager.connect({ walletId, userInitiated: true });

    expect(manager.isConnected()).toBe(true);
    expect(manager.getAddress()).toBe(ACCOUNT);
    expect(manager.getLastSelectedWalletId()).toBe(walletId);
    expect(connectedEvents).toHaveLength(1);
    expect(connectedEvents[0]?.restored).toBeUndefined();
  });

  it('requires an explicit wallet id', async () => {
    const manager = await readyManager();
    await expect(manager.connect({ userInitiated: true })).rejects.toThrow('Choose a wallet to connect');
  });

  it('restores a saved session on init', async () => {
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;
    await manager.connect({ walletId, userInitiated: true });

    const restoredManager = new WalletManager();
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    restoredManager.load();
    expect(await restoredManager.init()).toBe(true);
    expect(restoredManager.isConnected()).toBe(true);
    expect(connectedEvents[0]?.restored).toBe(true);
  });

  it('clears legacy token-ui storage keys on load', () => {
    localStorage.setItem('liberdus_token_ui_wallet_connection', JSON.stringify({ address: ACCOUNT }));
    localStorage.setItem('liberdus_token_ui_last_selected_wallet_id', 'metamask');
    localStorage.setItem('liberdus_token_ui_wallet_user_disconnected', 'true');

    new WalletManager().load();

    expect(localStorage.getItem('liberdus_token_ui_wallet_connection')).toBeNull();
    expect(localStorage.getItem('liberdus_token_ui_last_selected_wallet_id')).toBeNull();
    expect(localStorage.getItem('liberdus_token_ui_wallet_user_disconnected')).toBeNull();
  });

  it('maps discovered wallets for the header picker', async () => {
    const brave = makeProvider({ flags: { isMetaMask: true, isBraveWallet: true } });
    const metamask = makeProvider({ flags: { isMetaMask: true } });
    installWindow({ providers: [brave, metamask], multiListener: true });

    const manager = await readyManager();
    const names = manager.getAvailableWallets().map((wallet) => wallet.name).sort();

    expect(names).toEqual(['Brave Wallet', 'MetaMask']);
  });

  it('disambiguates duplicate wallet names for the header picker', async () => {
    installWindow({ provider: null, multiListener: true });
    const manager = new WalletManager();
    manager.load();

    announceWallet('first-wallet', 'MetaMask', makeProvider({ flags: {} }), { rdns: 'io.metamask.first' });
    announceWallet('second-wallet', 'MetaMask', makeProvider({ flags: {} }), { rdns: 'io.metamask.second' });
    await manager.walletCore.discoverWallets(0);

    const names = manager.getAvailableWallets().map((wallet) => wallet.name);

    expect(names).toEqual(['MetaMask', 'MetaMask (2)']);
  });

  it('does not recurse on eip6963 announce', async () => {
    const provider = makeProvider();
    installWindow({ provider, multiListener: true });

    let requestProviderCount = 0;
    window.addEventListener('eip6963:requestProvider', () => {
      requestProviderCount += 1;
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid: 'mm', name: 'MetaMask', rdns: 'io.metamask' }, provider },
      }));
    });

    await readyManager();
    await Promise.resolve();

    expect(requestProviderCount).toBeLessThan(10);
  });

  it('restores a pending late EIP-6963 wallet when it is announced', async () => {
    installWindow({ provider: null, multiListener: true });
    saveWalletSession('late-wallet');

    const manager = new WalletManager();
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    manager.load();
    expect(await manager.init()).toBe(false);
    expect(manager.isConnected()).toBe(false);
    expect(localStorage.getItem(WALLET_SESSION_KEY)).toBeNull();
    expect(manager._pendingRestoreWallet).toMatchObject({ walletId: 'late-wallet' });

    const provider = makeProvider({ flags: {} });
    announceWallet('late-wallet', 'Late Wallet', provider);

    await vi.waitFor(() => {
      expect(manager.isConnected()).toBe(true);
    });

    expect(manager.getAddress()).toBe(ACCOUNT);
    expect(manager._pendingRestoreWallet).toBeNull();
    expect(JSON.parse(localStorage.getItem(WALLET_SESSION_KEY))).toMatchObject({
      walletId: 'late-wallet',
      rdns: 'org.liberdus.late-wallet',
      name: 'Late Wallet',
    });
    expect(connectedEvents).toHaveLength(1);
    expect(connectedEvents[0]).toMatchObject({
      address: ACCOUNT,
      walletId: 'late-wallet',
      walletName: 'Late Wallet',
      restored: true,
    });
  });

  it('restores a saved EIP-6963 wallet when its UUID changes but rdns stays stable', async () => {
    installWindow({ provider: null, multiListener: true });
    saveWalletSession('old-uuid', { rdns: 'io.metamask', name: 'MetaMask' });

    const provider = makeProvider({ flags: {} });
    window.addEventListener('eip6963:requestProvider', () => {
      announceWallet('new-uuid', 'MetaMask', provider, { rdns: 'io.metamask' });
    });

    const manager = new WalletManager();
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    manager.load();
    expect(await manager.init()).toBe(true);

    expect(manager.isConnected()).toBe(true);
    expect(manager.getAddress()).toBe(ACCOUNT);
    expect(JSON.parse(localStorage.getItem(WALLET_SESSION_KEY))).toMatchObject({
      walletId: 'new-uuid',
      rdns: 'io.metamask',
      name: 'MetaMask',
    });
    expect(connectedEvents[0]).toMatchObject({
      walletId: 'new-uuid',
      walletName: 'MetaMask',
      restored: true,
    });
  });

  it('clears pending restore when a late wallet is found but unauthorized', async () => {
    installWindow({ provider: null, multiListener: true });
    saveWalletSession('locked-wallet');

    const manager = new WalletManager();
    manager.load();
    expect(await manager.init()).toBe(false);
    expect(manager._pendingRestoreWallet).toMatchObject({ walletId: 'locked-wallet' });

    const provider = makeProvider({ accounts: [], flags: {} });
    announceWallet('locked-wallet', 'Locked Wallet', provider);

    await vi.waitFor(() => {
      expect(provider.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });

    expect(manager.isConnected()).toBe(false);
    expect(manager._pendingRestoreWallet).toBeNull();
    expect(localStorage.getItem(WALLET_SESSION_KEY)).toBeNull();
  });

  it('does not reconnect from account events after restore loses authorization', async () => {
    const provider = makeProvider({ accounts: [], flags: {} });
    installWindow({ provider: null, multiListener: true });
    saveWalletSession('locked-wallet');

    const manager = new WalletManager();
    const connectedEvents = [];
    document.addEventListener('walletConnected', (event) => connectedEvents.push(event.detail.data));

    manager.load();
    expect(await manager.init()).toBe(false);
    announceWallet('locked-wallet', 'Locked Wallet', provider);

    await vi.waitFor(() => {
      expect(provider.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });
    expect(manager.isConnected()).toBe(false);

    provider.emit('accountsChanged', [ACCOUNT]);
    provider.emit('chainChanged', '0x13882');
    await Promise.resolve();

    expect(manager.isConnected()).toBe(false);
    expect(connectedEvents).toHaveLength(0);
  });

  it('disconnect clears the active session', async () => {
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;

    await manager.connect({ walletId, userInitiated: true });
    await manager.disconnect();

    expect(manager.isConnected()).toBe(false);
    expect(manager.hasUserDisconnected()).toBe(true);
  });

  it('disconnect revokes wallet permissions when supported', async () => {
    const provider = makeProvider();
    installWindow({ provider });
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;

    await manager.connect({ walletId, userInitiated: true });
    await manager.disconnect();

    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
    expect(manager.isConnected()).toBe(false);
  });

  it('emits one disconnect event when permission revocation clears accounts first', async () => {
    const provider = makeProvider();
    provider.request.mockImplementation(async ({ method }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [ACCOUNT];
      if (method === 'eth_chainId') return '0x13882';
      if (method === 'wallet_revokePermissions') {
        provider.emit('accountsChanged', []);
        return null;
      }
      return null;
    });
    installWindow({ provider });
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;
    const disconnectedEvents = [];
    document.addEventListener('walletDisconnected', (event) => disconnectedEvents.push(event.detail.data));

    await manager.connect({ walletId, userInitiated: true });
    await manager.disconnect();

    expect(disconnectedEvents).toHaveLength(1);
    expect(manager.isConnected()).toBe(false);
    expect(manager.hasUserDisconnected()).toBe(true);
  });

  it('disconnect clears the active session when permission revocation is unsupported', async () => {
    const provider = makeProvider();
    provider.request.mockImplementation(async ({ method }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [ACCOUNT];
      if (method === 'eth_chainId') return '0x13882';
      if (method === 'wallet_revokePermissions') {
        throw new Error('Unsupported method');
      }
      return null;
    });
    installWindow({ provider });
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;

    await manager.connect({ walletId, userInitiated: true });
    await expect(manager.disconnect()).resolves.toBeUndefined();

    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
    expect(manager.isConnected()).toBe(false);
    expect(manager.hasUserDisconnected()).toBe(true);
  });

  it('clears the active session when the provider emits disconnect', async () => {
    const provider = makeProvider();
    installWindow({ provider });
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;
    const disconnectedEvents = [];
    document.addEventListener('walletDisconnected', (event) => disconnectedEvents.push(event.detail.data));

    await manager.connect({ walletId, userInitiated: true });
    provider.emit('disconnect', { code: 4900, message: 'Provider disconnected' });

    await vi.waitFor(() => {
      expect(manager.isConnected()).toBe(false);
    });

    expect(disconnectedEvents).toHaveLength(1);
    expect(localStorage.getItem(WALLET_SESSION_KEY)).toBeNull();
    expect(provider.removeListener).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('rebinds when wallet-core replaces the active legacy provider', async () => {
    const legacyProvider = makeProvider({ flags: { isMetaMask: true } });
    const eip6963Provider = makeProvider({ flags: {} });
    installWindow({ providers: [legacyProvider], multiListener: true });
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;

    await manager.connect({ walletId, userInitiated: true });

    expect(manager.getProvider().provider).toBe(legacyProvider);
    expect(legacyProvider.on).toHaveBeenCalledWith('disconnect', expect.any(Function));

    announceWallet('metamask-new-uuid', 'MetaMask', eip6963Provider, { rdns: 'io.metamask' });

    await vi.waitFor(() => {
      expect(manager.getProvider().provider).toBe(eip6963Provider);
    });
    expect(legacyProvider.removeListener).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(eip6963Provider.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('disconnect clears pending late restore state', async () => {
    installWindow({ provider: null, multiListener: true });
    saveWalletSession('late-wallet');

    const manager = new WalletManager();
    manager.load();
    await manager.init();

    expect(manager._pendingRestoreWallet).toMatchObject({ walletId: 'late-wallet' });

    await manager.disconnect();

    expect(manager._pendingRestoreWallet).toBeNull();
    expect(localStorage.getItem(WALLET_SESSION_KEY)).toBeNull();
  });
});

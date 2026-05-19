import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletManager } from '../js/wallet/wallet-manager.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';

function makeProvider({ accounts = [ACCOUNT], chainId = '0x13882', flags = { isMetaMask: true } } = {}) {
  return {
    ...flags,
    request: vi.fn(async ({ method }) => {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return accounts;
      if (method === 'eth_chainId') return chainId;
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
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

    await manager.connect({ walletId, userInitiated: true });

    expect(manager.isConnected()).toBe(true);
    expect(manager.getAddress()).toBe(ACCOUNT);
    expect(manager.getLastSelectedWalletId()).toBe(walletId);
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

  it('disconnect clears the active session', async () => {
    const manager = await readyManager();
    const walletId = manager.getAvailableWallets()[0].id;

    await manager.connect({ walletId, userInitiated: true });
    await manager.disconnect();

    expect(manager.isConnected()).toBe(false);
    expect(manager.hasUserDisconnected()).toBe(true);
  });
});

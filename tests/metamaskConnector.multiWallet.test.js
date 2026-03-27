import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetaMaskConnector } from '../js/wallet/metamask-connector.js';

function makeInjectedProvider(flags = {}) {
  const listeners = new Map();
  const request = vi.fn(async ({ method }) => {
    if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
    if (method === 'eth_chainId') return '0x13882';
    if (method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111'];
    return null;
  });

  return {
    ...flags,
    request,
    on: vi.fn((event, handler) => listeners.set(event, handler)),
    removeListener: vi.fn((event) => listeners.delete(event)),
  };
}

describe('MetaMaskConnector multi-wallet discovery', () => {
  beforeEach(() => {
    delete window.ethereum;
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
    vi.restoreAllMocks();
  });

  it('discovers multiple wallets without auto-selecting one and connects only the chosen provider', async () => {
    const brave = makeInjectedProvider({ isMetaMask: true, isBraveWallet: true });
    const metamask = makeInjectedProvider({ isMetaMask: true });

    window.ethereum = {
      providers: [brave, metamask],
    };

    const connector = new MetaMaskConnector();
    connector.load();

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'brave-wallet',
          name: 'Brave Wallet',
          icon: 'data:image/svg+xml;base64,brave',
          rdns: 'com.brave.wallet',
        },
        provider: brave,
      },
    }));

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider: metamask,
      },
    }));

    const wallets = connector.getAvailableWallets();
    const metamaskWallet = wallets.find((wallet) => wallet.name === 'MetaMask');

    expect(wallets).toHaveLength(2);
    expect(wallets.map((wallet) => wallet.name)).toEqual(['Brave Wallet', 'MetaMask']);
    expect(connector.peekEip1193Provider()).toBeNull();

    await connector.connect(metamaskWallet.id);

    expect(metamask.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(brave.request).not.toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(connector.getActiveWallet().id).toBe(metamaskWallet.id);
  });

  it('falls back to legacy injected providers when EIP-6963 is unavailable', () => {
    const brave = makeInjectedProvider({ isMetaMask: true, isBraveWallet: true });
    const metamask = makeInjectedProvider({ isMetaMask: true });

    window.ethereum = {
      providers: [brave, metamask],
    };

    const connector = new MetaMaskConnector();
    const wallets = connector.getAvailableWallets();

    expect(wallets).toHaveLength(2);
    expect(wallets[0].flags.isBraveWallet).toBe(true);
    expect(wallets[1].flags.isMetaMask).toBe(true);
  });

  it('deduplicates a legacy wallet when the EIP-6963 announcement uses a different provider object', () => {
    const legacyMetaMask = makeInjectedProvider({ isMetaMask: true });
    const announcedMetaMask = makeInjectedProvider({ isMetaMask: true });

    window.ethereum = {
      providers: [legacyMetaMask],
    };

    const connector = new MetaMaskConnector();
    connector.load();

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider: announcedMetaMask,
      },
    }));

    const wallets = connector.getAvailableWallets();

    expect(wallets).toHaveLength(1);
    expect(wallets[0].id).toBe('metamask');
    expect(wallets[0].rdns).toBe('io.metamask');
  });

  it('prefers the announced provider object after deduplicating a legacy wallet', async () => {
    const legacyMetaMask = makeInjectedProvider({ isMetaMask: true });
    const announcedMetaMask = makeInjectedProvider({ isMetaMask: true });

    window.ethereum = {
      providers: [legacyMetaMask],
    };

    const connector = new MetaMaskConnector();
    connector.load();

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider: announcedMetaMask,
      },
    }));

    const wallet = connector.getWalletById('metamask');

    expect(wallet.provider).toBe(announcedMetaMask);

    await connector.connect(wallet.id);

    expect(announcedMetaMask.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(legacyMetaMask.request).not.toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });

  it('deduplicates providers-array shims when a wallet exposes a wallet-specific flag', () => {
    const phantomLegacyShim = makeInjectedProvider({ isMetaMask: true, isPhantom: true });
    const phantom = makeInjectedProvider({ isMetaMask: true, isPhantom: true });

    window.ethereum = {
      providers: [phantomLegacyShim],
    };

    const connector = new MetaMaskConnector();
    connector.load();

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'phantom-wallet',
          name: 'Phantom',
          icon: 'data:image/png;base64,phantom',
          rdns: 'app.phantom',
        },
        provider: phantom,
      },
    }));

    const wallets = connector.getAvailableWallets();

    expect(wallets).toHaveLength(1);
    expect(wallets[0].name).toBe('Phantom');
    expect(wallets[0].rdns).toBe('app.phantom');
    expect(connector.getWalletById(wallets[0].id).provider).toBe(phantom);
  });

  it('does not add a fake MetaMask legacy fallback when Phantom is the only discovered wallet', () => {
    const phantom = makeInjectedProvider({ isPhantom: true, isMetaMask: true });
    const phantomEthereumShim = makeInjectedProvider({ isMetaMask: true });

    window.ethereum = phantomEthereumShim;

    const connector = new MetaMaskConnector();
    connector.load();

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'phantom-wallet',
          name: 'Phantom',
          icon: 'data:image/png;base64,phantom',
          rdns: 'app.phantom',
        },
        provider: phantom,
      },
    }));

    const wallets = connector.getAvailableWallets();

    expect(wallets).toHaveLength(1);
    expect(wallets[0].name).toBe('Phantom');
    expect(wallets[0].flags.isMetaMask).toBe(true);
    expect(wallets.find((wallet) => wallet.name === 'MetaMask')).toBeUndefined();
  });

  it('rebinds event listeners when the active wallet provider object is replaced', () => {
    const legacyMetaMask = makeInjectedProvider({ isMetaMask: true });
    const announcedMetaMask = makeInjectedProvider({ isMetaMask: true });

    window.ethereum = {
      providers: [legacyMetaMask],
    };

    const connector = new MetaMaskConnector();
    connector.load();
    connector.bindConnectedWallet('metamask', {
      account: '0x1111111111111111111111111111111111111111',
      chainId: 80002,
      provider: new window.ethers.providers.Web3Provider(legacyMetaMask, 'any'),
      signer: { kind: 'signer' },
    });

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: {
          uuid: 'metamask-wallet',
          name: 'MetaMask',
          icon: 'data:image/svg+xml;base64,metamask',
          rdns: 'io.metamask',
        },
        provider: announcedMetaMask,
      },
    }));

    expect(connector.peekEip1193Provider()).toBe(announcedMetaMask);
    expect(legacyMetaMask.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(announcedMetaMask.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
  });
});

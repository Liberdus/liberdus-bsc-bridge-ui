import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Header } from '../js/components/header.js';

function setupDom() {
  document.body.innerHTML = `
    <button id="connect-wallet-btn" type="button">Connect Wallet</button>
    <div id="wallet-popup-container"></div>
  `;
}

describe('Header wallet picker', () => {
  beforeEach(() => {
    setupDom();
    window.walletManager = {
      isConnecting: false,
      isConnected: vi.fn(() => false),
      getAddress: vi.fn(() => null),
      getLastSelectedWalletId: vi.fn(() => 'metamask-wallet'),
      getAvailableWallets: vi.fn(() => ([
        {
          id: 'brave-wallet',
          name: 'Brave Wallet',
          icon: '',
        },
        {
          id: 'metamask-wallet',
          name: 'MetaMask',
          icon: '',
        },
      ])),
      connect: vi.fn(async () => ({ success: true })),
    };

    window.walletPopup = {
      show: vi.fn(),
      toggle: vi.fn(),
    };

    window.toastManager = {
      show: vi.fn(() => 'wallet-approval-toast'),
      dismiss: vi.fn(),
      error: vi.fn(),
    };

    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.walletManager;
    delete window.walletPopup;
    delete window.toastManager;
    vi.restoreAllMocks();
  });

  it('opens a picker, preselects the last wallet, and connects the clicked wallet', async () => {
    const header = new Header();
    header.load();

    document.getElementById('connect-wallet-btn').click();

    const optionButtons = Array.from(document.querySelectorAll('[data-wallet-picker-id]'));
    expect(optionButtons).toHaveLength(2);
    expect(document.querySelector('[data-wallet-picker-id="metamask-wallet"]').classList.contains('is-selected')).toBe(true);

    document.querySelector('[data-wallet-picker-id="brave-wallet"]').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.walletManager.connect).toHaveBeenCalledWith({ walletId: 'brave-wallet', userInitiated: true });
    expect(window.toastManager.show).toHaveBeenCalledWith({
      id: undefined,
      title: 'Wallet Connection',
      message: 'Waiting for wallet approval. Finish connecting in your wallet.',
      type: 'loading',
      timeoutMs: 0,
      dismissible: true,
      delayMs: 0,
    });
    expect(window.toastManager.dismiss).toHaveBeenCalledWith('wallet-approval-toast');
    expect(window.walletPopup.show).toHaveBeenCalledWith(document.getElementById('connect-wallet-btn'));
    expect(document.getElementById('wallet-picker-container').innerHTML).toBe('');
  });

  it('shows a generic empty-state message when no browser wallets are available', () => {
    window.walletManager.getAvailableWallets = vi.fn(() => []);
    window.walletManager.getLastSelectedWalletId = vi.fn(() => null);

    const header = new Header();
    header.load();

    document.getElementById('connect-wallet-btn').click();

    expect(document.body.textContent).toContain('No browser wallet found');
    expect(document.body.textContent).toContain('Install or unlock an EVM-compatible wallet to continue.');
  });

  it('refreshes an open picker when wallets are discovered after it renders', () => {
    window.walletManager.getAvailableWallets = vi.fn(() => []);
    window.walletManager.getLastSelectedWalletId = vi.fn(() => null);

    const header = new Header();
    header.load();

    document.getElementById('connect-wallet-btn').click();

    expect(document.body.textContent).toContain('No browser wallet found');

    window.walletManager.getAvailableWallets = vi.fn(() => ([
      {
        id: 'metamask-wallet',
        name: 'MetaMask',
        icon: '',
      },
    ]));

    document.dispatchEvent(new CustomEvent('walletProvidersChanged', {
      detail: {
        data: {
          wallets: window.walletManager.getAvailableWallets(),
        },
      },
    }));

    const optionButtons = Array.from(document.querySelectorAll('[data-wallet-picker-id]'));
    expect(optionButtons).toHaveLength(1);
    expect(document.body.textContent).not.toContain('No browser wallet found');
    expect(document.body.textContent).toContain('MetaMask');
  });

  it('uses the toast manager instead of browser alerts for wallet connection errors', async () => {
    window.walletManager.connect = vi.fn(async () => {
      const error = new Error('Connection request was rejected.');
      error.code = 4001;
      throw error;
    });

    const header = new Header();
    header.load();

    document.getElementById('connect-wallet-btn').click();
    document.querySelector('[data-wallet-picker-id="brave-wallet"]').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.toastManager.error).toHaveBeenCalledWith('Connection request was rejected.', { title: 'Wallet Error' });
    expect(window.alert).not.toHaveBeenCalled();
  });
});

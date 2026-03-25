import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionsTab, TRANSACTION_STATUS } from '../js/components/transactions-tab.js';
import { installCommonWindowStubs } from './helpers/test-utils.js';

const ADDRESS_ONE = '0x1111111111111111111111111111111111111111';
const ADDRESS_TWO = '0x2222222222222222222222222222222222222222';
const ADDRESS_THREE = '0x3333333333333333333333333333333333333333';

function setupTransactionsTabDom() {
  document.body.innerHTML = `
    <button class="tab-button" data-tab="transactions">Transactions</button>
    <div class="tab-panel" data-panel="transactions"></div>
  `;
}

function setWalletState({ connected, address }) {
  window.walletManager.isConnected = vi.fn(() => connected);
  window.walletManager.getAddress = vi.fn(() => address);
}

function makeRow({ txHash, from }) {
  return {
    id: txHash,
    srcChainKey: null,
    dstChainKey: null,
    srcName: 'Polygon Amoy',
    dstName: 'BNB Testnet',
    from,
    amount: '0',
    timestamp: 1700000000,
    txHash,
    receiptTxHash: '',
    status: TRANSACTION_STATUS.PENDING,
    type: 1,
  };
}

function dispatchTransactionsActivated({ isFirstActivation = false } = {}) {
  document.dispatchEvent(new CustomEvent('tabActivated', { detail: { tabName: 'transactions', isFirstActivation } }));
}

function createTab({ connected, address, rows = [] }) {
  setWalletState({ connected, address });
  const tab = new TransactionsTab();
  tab.load();
  tab._rows = rows;
  vi.runOnlyPendingTimers();
  return tab;
}

describe('TransactionsTab only-my-transactions defaulting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupTransactionsTabDom();
    installCommonWindowStubs();
    vi.spyOn(TransactionsTab.prototype, 'refresh').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_ensureBridgeOutWatch').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_checkPendingStatuses').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_startIssuedTicker').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_startPendingPoller').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('auto-checks only mine on first transactions activation for a restored wallet', () => {
    const tab = createTab({
      connected: true,
      address: ADDRESS_ONE,
      rows: [
        makeRow({ txHash: '0xaaa1', from: ADDRESS_ONE }),
        makeRow({ txHash: '0xbbb2', from: ADDRESS_TWO }),
      ],
    });

    tab.page = 2;
    dispatchTransactionsActivated({ isFirstActivation: true });

    expect(tab.onlyMine).toBe(true);
    expect(tab.onlyMineCheckbox.checked).toBe(true);
    expect(tab.page).toBe(1);
    expect(tab.totalEl.textContent).toBe('1');
    expect(tab.onlyMineHintEl.textContent).toContain('Filtering for');
  });

  it('preserves a manual uncheck across later transactions activations in the same wallet context', () => {
    const tab = createTab({
      connected: true,
      address: ADDRESS_ONE,
      rows: [
        makeRow({ txHash: '0xaaa1', from: ADDRESS_ONE }),
        makeRow({ txHash: '0xbbb2', from: ADDRESS_TWO }),
      ],
    });

    dispatchTransactionsActivated({ isFirstActivation: true });
    tab.onlyMineCheckbox.checked = false;
    tab.onlyMineCheckbox.dispatchEvent(new Event('change'));

    expect(tab.onlyMine).toBe(false);
    expect(tab.totalEl.textContent).toBe('2');
    expect(tab.onlyMineHintEl.textContent).toBe('0x1111…1111');

    dispatchTransactionsActivated();

    expect(tab.onlyMine).toBe(false);
    expect(tab.onlyMineCheckbox.checked).toBe(false);
    expect(tab.totalEl.textContent).toBe('2');
  });

  it('re-arms the default after an account change and re-checks on the next activation', () => {
    const tab = createTab({
      connected: true,
      address: ADDRESS_ONE,
      rows: [
        makeRow({ txHash: '0xaaa1', from: ADDRESS_ONE }),
        makeRow({ txHash: '0xbbb2', from: ADDRESS_THREE }),
      ],
    });

    dispatchTransactionsActivated({ isFirstActivation: true });
    tab.onlyMineCheckbox.checked = false;
    tab.onlyMineCheckbox.dispatchEvent(new Event('change'));

    setWalletState({ connected: true, address: ADDRESS_THREE });
    document.dispatchEvent(new CustomEvent('walletAccountChanged'));
    dispatchTransactionsActivated();

    expect(tab.onlyMine).toBe(true);
    expect(tab.onlyMineCheckbox.checked).toBe(true);
    expect(tab.totalEl.textContent).toBe('1');
  });

  it('checks only mine immediately when the wallet connects while transactions is active', () => {
    const tab = createTab({
      connected: false,
      address: null,
      rows: [
        makeRow({ txHash: '0xaaa1', from: ADDRESS_ONE }),
        makeRow({ txHash: '0xbbb2', from: ADDRESS_TWO }),
      ],
    });

    expect(tab.onlyMineCheckbox.disabled).toBe(true);

    tab.panel.classList.add('is-active');
    tab.panel.hidden = false;

    setWalletState({ connected: true, address: ADDRESS_ONE });
    document.dispatchEvent(new CustomEvent('walletConnected'));

    expect(tab.onlyMine).toBe(true);
    expect(tab.onlyMineCheckbox.checked).toBe(true);
    expect(tab.onlyMineCheckbox.disabled).toBe(false);
    expect(tab.totalEl.textContent).toBe('1');
  });

  it('unchecks only mine and clears the pending default on disconnect', () => {
    const tab = createTab({
      connected: true,
      address: ADDRESS_ONE,
      rows: [
        makeRow({ txHash: '0xaaa1', from: ADDRESS_ONE }),
        makeRow({ txHash: '0xbbb2', from: ADDRESS_TWO }),
      ],
    });

    dispatchTransactionsActivated({ isFirstActivation: true });
    expect(tab.onlyMine).toBe(true);
    expect(tab.onlyMineCheckbox.checked).toBe(true);
    expect(tab.totalEl.textContent).toBe('1');

    setWalletState({ connected: false, address: null });
    document.dispatchEvent(new CustomEvent('walletDisconnected'));

    expect(tab.onlyMine).toBe(false);
    expect(tab.onlyMineCheckbox.checked).toBe(false);
    expect(tab.onlyMineCheckbox.disabled).toBe(true);
    expect(tab.page).toBe(1);
    expect(tab.totalEl.textContent).toBe('2');
    expect(tab.onlyMineHintEl.textContent).toBe('Connect wallet to enable');

    dispatchTransactionsActivated({ isFirstActivation: true });

    expect(tab.onlyMine).toBe(false);
    expect(tab.onlyMineCheckbox.checked).toBe(false);
  });
});

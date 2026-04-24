import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionsTab, TRANSACTION_STATUS } from '../js/components/transactions-tab.js';
import { installCommonWindowStubs } from './helpers/test-utils.js';

function setupTransactionsTabDom() {
  document.body.innerHTML = `
    <button class="tab-button" data-tab="transactions">Transactions</button>
    <div class="tab-panel is-active" data-panel="transactions"></div>
  `;
}

function makeRow(timestamp) {
  return {
    id: '0xaaa1',
    srcChainKey: 'SOURCE',
    dstChainKey: 'DESTINATION',
    srcName: 'Polygon Amoy',
    dstName: 'BNB Testnet',
    from: '0x1111111111111111111111111111111111111111',
    amount: '0',
    timestamp,
    txHash: '0xaaa1',
    receiptTxHash: '',
    status: TRANSACTION_STATUS.PENDING,
    type: 1,
  };
}

function createTab(rows = []) {
  const tab = new TransactionsTab();
  tab.load();
  tab._rows = rows;
  tab.render();
  return tab;
}

describe('TransactionsTab issued ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
    setupTransactionsTabDom();
    installCommonWindowStubs();
    vi.spyOn(TransactionsTab.prototype, 'refresh').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_ensureBridgeOutWatch').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_startPendingPoller').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_checkPendingStatuses').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  it('updates issued labels live without re-rendering the table', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tab = createTab([makeRow(nowSeconds - 59)]);
    const issuedLabel = tab.tableBody?.querySelector('[data-issued-time]');

    expect(issuedLabel?.textContent).toBe('59s ago');

    const renderSpy = vi.spyOn(tab, 'render');
    tab._startIssuedTicker();
    await vi.advanceTimersByTimeAsync(1000);

    expect(renderSpy).not.toHaveBeenCalled();
    expect(issuedLabel?.textContent).toBe('1m ago');
  });

  it('stops updating issued labels when the ticker is stopped', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tab = createTab([makeRow(nowSeconds - 59)]);
    const issuedLabel = tab.tableBody?.querySelector('[data-issued-time]');

    expect(issuedLabel?.textContent).toBe('59s ago');

    tab._startIssuedTicker();
    tab._stopIssuedTicker();
    await vi.advanceTimersByTimeAsync(1000);

    expect(issuedLabel?.textContent).toBe('59s ago');
  });
});

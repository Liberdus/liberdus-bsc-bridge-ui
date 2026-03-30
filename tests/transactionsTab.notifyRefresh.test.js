import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionsTab } from '../js/components/transactions-tab.js';
import { installCommonWindowStubs } from './helpers/test-utils.js';

function setupTransactionsTabDom() {
  document.body.innerHTML = `
    <button class="tab-button" data-tab="transactions">Transactions</button>
    <div class="tab-panel" data-panel="transactions"></div>
  `;
}

describe('TransactionsTab bridge-out notify refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupTransactionsTabDom();
    installCommonWindowStubs();
    window.CONFIG.BRIDGE.OBSERVER_URL = 'https://observer.example.test/observer';
    vi.spyOn(TransactionsTab.prototype, 'refresh').mockImplementation(() => {});
    vi.spyOn(TransactionsTab.prototype, '_ensureBridgeOutWatch').mockImplementation(() => {});
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

  it('runs an immediate and delayed pending-status check after notify acceptance on the source chain', async () => {
    const tab = new TransactionsTab();
    tab.load();
    vi.runOnlyPendingTimers();

    const checkPendingStatuses = vi.spyOn(tab, '_checkPendingStatuses').mockResolvedValue(undefined);

    document.dispatchEvent(new CustomEvent('bridgeOutNotifyAccepted', {
      detail: { chainId: 80002, status: 'triggered' },
    }));

    expect(checkPendingStatuses).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1499);
    expect(checkPendingStatuses).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(checkPendingStatuses).toHaveBeenCalledTimes(2);
  });
});

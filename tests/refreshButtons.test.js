import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InfoTab } from '../js/components/info-tab.js';
import { TransactionsTab } from '../js/components/transactions-tab.js';
import { installCommonWindowStubs } from './helpers/test-utils.js';

function createDeferred() {
  let resolve;

  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function setupDom() {
  document.body.innerHTML = `
    <button class="tab-button" data-tab="transactions">Transactions</button>
    <div class="tab-panel" data-panel="info"></div>
    <div class="tab-panel" data-panel="transactions"></div>
  `;
}

describe('shared refresh button treatment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupDom();
    installCommonWindowStubs();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  it('uses the shared icon-only refresh button on info and spins it while loading', async () => {
    const deferred = createDeferred();
    const snapshot = {};

    window.contractManager = {
      getStatusSnapshot: vi.fn(() => null),
      refreshStatus: vi.fn(() => deferred.promise),
    };

    const tab = new InfoTab();
    tab.load();

    const refreshPromise = tab.refresh();

    expect(tab.refreshBtn?.textContent?.trim()).toBe('');
    expect(tab.refreshBtn?.querySelector('[data-refresh-icon]')).not.toBeNull();
    expect(tab.refreshBtn?.classList.contains('btn--icon')).toBe(true);
    expect(tab.refreshBtn?.getAttribute('aria-label')).toBe('Refresh contract info');
    expect(tab.refreshBtn?.textContent).not.toContain('Refreshing...');
    expect(tab.refreshBtn?.disabled).toBe(true);
    expect(tab.refreshBtn?.classList.contains('is-loading')).toBe(true);
    expect(tab.refreshBtn?.getAttribute('aria-busy')).toBe('true');

    deferred.resolve(snapshot);
    await refreshPromise;

    expect(tab.refreshBtn?.textContent?.trim()).toBe('');
    expect(tab.refreshBtn?.textContent).not.toContain('Refreshing...');
    expect(tab.refreshBtn?.disabled).toBe(false);
    expect(tab.refreshBtn?.classList.contains('is-loading')).toBe(false);
    expect(tab.refreshBtn?.hasAttribute('aria-busy')).toBe(false);
  });

  it('uses the same refresh icon on transactions and spins it during loading', async () => {
    const deferred = createDeferred();
    vi.spyOn(TransactionsTab.prototype, '_ensureBridgeOutWatch').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => deferred.promise));

    const infoTab = new InfoTab();
    infoTab.load();

    const txTab = new TransactionsTab();
    txTab.load();

    const infoIcon = infoTab.refreshBtn?.querySelector('[data-refresh-icon]');
    const txIcon = txTab.refreshBtn?.querySelector('[data-refresh-icon]');

    expect(infoIcon?.outerHTML).toBe(txIcon?.outerHTML);

    const refreshPromise = txTab.refresh();

    expect(globalThis.fetch).toHaveBeenCalledWith('https://tss1-test.liberdus.com/transaction?page=1');
    expect(txTab.refreshBtn?.disabled).toBe(true);
    expect(txTab.refreshBtn?.classList.contains('is-loading')).toBe(true);
    expect(txTab.refreshBtn?.getAttribute('aria-busy')).toBe('true');

    deferred.resolve({
      ok: true,
      json: vi.fn(async () => ({
        Ok: {
          transactions: [],
          totalPages: 1,
        },
      })),
    });
    await refreshPromise;

    expect(txTab.refreshBtn?.disabled).toBe(false);
    expect(txTab.refreshBtn?.classList.contains('is-loading')).toBe(false);
    expect(txTab.refreshBtn?.hasAttribute('aria-busy')).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InfoTab } from '../js/components/info-tab.js';
import { OperationsTab } from '../js/components/operations-tab.js';
import { MIN_REFRESH_SPIN_MS, RefreshButton } from '../js/components/refresh-button.js';
import { TransactionsTab } from '../js/components/transactions-tab.js';
import { CONFIG } from '../js/config.js';
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
    <button class="tab-button" data-tab="operations">Admin</button>
    <button class="tab-button" data-tab="transactions">Transactions</button>
    <div class="tab-panel" data-panel="info"></div>
    <div class="tab-panel" data-panel="operations"></div>
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

  it('runs refresh as a single component-owned lifecycle', async () => {
    const deferred = createDeferred();
    const onRefresh = vi.fn(() => deferred.promise);
    const control = new RefreshButton({
      ariaLabel: 'Refresh transactions',
      attributes: { 'data-test-refresh': '' },
      onRefresh,
    });

    document.body.innerHTML = control.render();
    const button = document.querySelector('[data-test-refresh]');
    control.mount(button);

    const firstRun = control.run();
    const secondRun = control.run();

    expect(firstRun).toBe(secondRun);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(button?.disabled).toBe(true);
    expect(button?.classList.contains('is-loading')).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');

    deferred.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS);
    await firstRun;

    expect(button?.disabled).toBe(false);
    expect(button?.classList.contains('is-loading')).toBe(false);
    expect(button?.hasAttribute('aria-busy')).toBe(false);
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
    await Promise.resolve();

    expect(tab.refreshBtn?.disabled).toBe(true);
    expect(tab.refreshBtn?.classList.contains('is-loading')).toBe(true);

    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS);
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

    expect(globalThis.fetch).toHaveBeenCalledWith(`${CONFIG.BRIDGE.OBSERVER_URL}/transaction?page=1`);
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
    await Promise.resolve();

    expect(txTab.refreshBtn?.disabled).toBe(true);
    expect(txTab.refreshBtn?.classList.contains('is-loading')).toBe(true);

    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS);
    await refreshPromise;

    expect(txTab.refreshBtn?.disabled).toBe(false);
    expect(txTab.refreshBtn?.classList.contains('is-loading')).toBe(false);
    expect(txTab.refreshBtn?.hasAttribute('aria-busy')).toBe(false);
  });

  it('uses the same refresh icon on admin and spins it during loading', async () => {
    const deferred = createDeferred();
    window.contractManager = {
      getAccessState: vi.fn(async () => ({
        owner: null,
        isOwner: false,
        isSigner: false,
        ownerError: null,
        signerError: null,
        error: null,
      })),
      refreshStatus: vi.fn(() => deferred.promise),
    };

    const infoTab = new InfoTab();
    infoTab.load();

    const opsTab = new OperationsTab();
    opsTab.load();

    const infoIcon = infoTab.refreshBtn?.querySelector('[data-refresh-icon]');
    const opsIcon = opsTab.refreshBtn?.querySelector('[data-refresh-icon]');

    expect(infoIcon?.outerHTML).toBe(opsIcon?.outerHTML);
    expect(opsTab.refreshBtn?.textContent?.trim()).toBe('');

    opsTab.refreshBtn?.click();
    const refreshPromise = opsTab.refreshControl._runPromise;

    expect(opsTab.refreshBtn?.disabled).toBe(true);
    expect(opsTab.refreshBtn?.classList.contains('is-loading')).toBe(true);
    expect(opsTab.refreshBtn?.getAttribute('aria-busy')).toBe('true');
    expect(opsTab.refreshBtn?.textContent).not.toContain('Refreshing...');

    deferred.resolve();
    await Promise.resolve();

    expect(opsTab.refreshBtn?.disabled).toBe(true);
    expect(opsTab.refreshBtn?.classList.contains('is-loading')).toBe(true);
    expect(opsTab.refreshBtn?.textContent).not.toContain('Refreshing...');

    await vi.advanceTimersByTimeAsync(MIN_REFRESH_SPIN_MS);
    await refreshPromise;

    expect(opsTab.refreshBtn?.textContent?.trim()).toBe('');
    expect(opsTab.refreshBtn?.disabled).toBe(false);
    expect(opsTab.refreshBtn?.classList.contains('is-loading')).toBe(false);
    expect(opsTab.refreshBtn?.hasAttribute('aria-busy')).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsTab } from '../js/components/operations-tab.js';
import { flushPromises, installCommonWindowStubs, normalizeAddress, setupOperationsTabDom } from './helpers/test-utils.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const SIGNER = '0x2222222222222222222222222222222222222222';
const OTHER_SIGNER = '0x4444444444444444444444444444444444444444';

describe('OperationsTab access behavior', () => {
  beforeEach(() => {
    setupOperationsTabDom();
    installCommonWindowStubs();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('shows owner-only access with owner controls', async () => {
    window.walletManager.isConnected = vi.fn(() => true);
    window.walletManager.getAddress = vi.fn(() => OWNER);
    window.contractManager.getAccessState = vi.fn(async () => ({
      owner: OWNER,
      isOwner: true,
      isSigner: false,
      ownerError: null,
      signerError: null,
      error: null,
    }));

    const tab = new OperationsTab();
    tab.load();
    await tab._syncAccess();

    expect(tab.tabButton.hidden).toBe(false);
    expect(document.querySelector('[data-ops-role]').textContent).toBe('Owner');
    expect(document.querySelector('[data-ops-status]').textContent).toBe('Ready.');
    expect(document.querySelector('[data-ops-admin-section]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-ownership-section]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-multisig-section]').hidden).toBe(true);
    expect(document.querySelector('[data-ops-owner]').textContent).toBe(normalizeAddress(OWNER));
    expect(document.querySelector('[data-ops-is-signer]').textContent).toBe('No');
  });

  it('shows signer-only access with multisig controls', async () => {
    window.walletManager.isConnected = vi.fn(() => true);
    window.walletManager.getAddress = vi.fn(() => SIGNER);
    window.contractManager.getAccessState = vi.fn(async () => ({
      owner: OWNER,
      isOwner: false,
      isSigner: true,
      ownerError: null,
      signerError: null,
      error: null,
    }));

    const tab = new OperationsTab();
    tab.load();
    await tab._syncAccess();

    expect(tab.tabButton.hidden).toBe(false);
    expect(document.querySelector('[data-ops-role]').textContent).toBe('Multisig');
    expect(document.querySelector('[data-ops-admin-section]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-ownership-section]').hidden).toBe(true);
    expect(document.querySelector('[data-ops-multisig-section]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-is-signer]').textContent).toBe('Yes');
  });

  it('distinguishes verified and known partial access states', () => {
    const tab = new OperationsTab();

    tab._access = { ownerError: 'owner unavailable', signerError: null, isMultisig: true, isAdmin: false };
    expect(tab._partialAccessStatusMessage()).toBe('Signer verified, owner status unavailable.');

    tab._access = { ownerError: 'owner unavailable', signerError: null, isMultisig: false, isAdmin: false };
    expect(tab._partialAccessStatusMessage()).toBe('Signer status known, owner status unavailable.');

    tab._access = { ownerError: null, signerError: 'signer unavailable', isMultisig: false, isAdmin: true };
    expect(tab._partialAccessStatusMessage()).toBe('Owner verified, signer status unavailable.');

    tab._access = { ownerError: null, signerError: 'signer unavailable', isMultisig: false, isAdmin: false };
    expect(tab._partialAccessStatusMessage()).toBe('Owner status known, signer status unavailable.');
  });

  it('keeps proven access visible when owner or signer reads partially fail', async () => {
    const tab = new OperationsTab();

    window.walletManager.isConnected = vi.fn(() => true);
    window.walletManager.getAddress = vi.fn(() => SIGNER);
    window.contractManager.getAccessState = vi.fn(async () => ({
      owner: null,
      isOwner: false,
      isSigner: true,
      ownerError: 'owner unavailable',
      signerError: null,
      error: 'owner unavailable',
    }));

    tab.load();
    await tab._syncAccess();

    expect(tab.tabButton.hidden).toBe(false);
    expect(document.querySelector('[data-ops-owner]').textContent).toBe('Unavailable');
    expect(document.querySelector('[data-ops-is-signer]').textContent).toBe('Yes');
    expect(document.querySelector('[data-ops-status]').textContent).toBe('Signer verified, owner status unavailable.');

    window.walletManager.getAddress = vi.fn(() => OWNER);
    window.contractManager.getAccessState = vi.fn(async () => ({
      owner: OWNER,
      isOwner: true,
      isSigner: false,
      ownerError: null,
      signerError: 'signer unavailable',
      error: 'signer unavailable',
    }));

    await tab._syncAccess();

    expect(tab.tabButton.hidden).toBe(false);
    expect(document.querySelector('[data-ops-owner]').textContent).toBe(normalizeAddress(OWNER));
    expect(document.querySelector('[data-ops-is-signer]').textContent).toBe('Unavailable');
    expect(document.querySelector('[data-ops-status]').textContent).toBe('Owner verified, signer status unavailable.');
  });

  it('keeps authorized users on Admin while refreshing access for the same wallet', async () => {
    window.walletManager.isConnected = vi.fn(() => true);
    window.walletManager.getAddress = vi.fn(() => OWNER);

    window.contractManager.getAccessState = vi.fn(async () => ({
      owner: OWNER,
      isOwner: true,
      isSigner: false,
      ownerError: null,
      signerError: null,
      error: null,
    }));

    const tab = new OperationsTab();
    tab.load();
    await flushPromises();

    window.location.hash = '#operations';
    const pending = new Promise(() => {});
    window.contractManager.getAccessState = vi.fn(() => pending);
    void tab._syncAccess();
    await flushPromises();

    expect(tab.tabButton.hidden).toBe(false);
    expect(window.location.hash).toBe('#operations');
    expect(document.querySelector('[data-ops-role]').textContent).toBe('Checking...');
    expect(document.querySelector('[data-ops-status]').textContent).toBe('Checking wallet access against the Vault.');
    expect(document.querySelector('[data-ops-admin-section]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-ownership-section]').hidden).toBe(false);
  });

  it('does not redirect away from Admin while the initial access lookup is still loading', async () => {
    window.walletManager.isConnected = vi.fn(() => true);
    window.walletManager.getAddress = vi.fn(() => OWNER);

    const pending = new Promise(() => {});
    window.contractManager.getAccessState = vi.fn(() => pending);
    window.location.hash = '#operations';

    const tab = new OperationsTab();
    tab.load();
    await flushPromises();

    expect(tab.tabButton.hidden).toBe(true);
    expect(window.location.hash).toBe('#operations');
    expect(document.querySelector('[data-ops-status]').textContent).toBe('Checking wallet access against the Vault.');
  });

  it('hides the Admin tab and redirects away from operations when disconnected', async () => {
    window.walletManager.isConnected = vi.fn(() => false);
    window.walletManager.getAddress = vi.fn(() => null);
    window.location.hash = '#operations';

    const tab = new OperationsTab();
    tab.load();
    await tab._syncAccess();

    expect(tab.tabButton.hidden).toBe(true);
    expect(window.location.hash).toBe('#info');
    expect(document.querySelector('[data-ops-status]').textContent).toBe('Connect a wallet to check access.');
  });

  it('ignores stale access responses after an account switch', async () => {
    window.walletManager.isConnected = vi.fn(() => true);

    let currentAddress = OWNER;
    const pending = new Map();
    window.walletManager.getAddress = vi.fn(() => currentAddress);

    const tab = new OperationsTab();
    tab.load();
    await flushPromises();

    window.contractManager.getAccessState = vi.fn(
      (address) =>
        new Promise((resolve) => {
          pending.set(address, resolve);
        })
    );

    const firstSync = tab._syncAccess();
    currentAddress = OTHER_SIGNER;
    const secondSync = tab._syncAccess();

    pending.get(normalizeAddress(OTHER_SIGNER))({
      owner: OWNER,
      isOwner: false,
      isSigner: true,
      ownerError: null,
      signerError: null,
      error: null,
    });
    await secondSync;

    pending.get(normalizeAddress(OWNER))({
      owner: OWNER,
      isOwner: true,
      isSigner: false,
      ownerError: null,
      signerError: null,
      error: null,
    });
    await firstSync;

    expect(tab._access.address).toBe(normalizeAddress(OTHER_SIGNER));
    expect(tab._access.isAdmin).toBe(false);
    expect(tab._access.isMultisig).toBe(true);
    expect(document.querySelector('[data-ops-role]').textContent).toBe('Multisig');
    expect(document.querySelector('[data-ops-owner]').textContent).toBe(normalizeAddress(OWNER));
  });
});

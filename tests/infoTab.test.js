import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InfoTab } from '../js/components/info-tab.js';
import { installCommonWindowStubs } from './helpers/test-utils.js';

function setupInfoTabDom() {
  document.body.innerHTML = '<div class="tab-panel" data-panel="info"></div>';
}

describe('InfoTab read warning toasts', () => {
  beforeEach(() => {
    setupInfoTabDom();
    installCommonWindowStubs();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('suppresses destination read warning toasts', () => {
    const tab = new InfoTab();
    tab.load();

    tab._notifyReadError({
      source: { error: null },
      destination: { error: 'Destination RPC down' },
    });

    expect(window.toastManager.error).not.toHaveBeenCalled();
  });

  it('still shows source read warning toasts', () => {
    const tab = new InfoTab();
    tab.load();

    tab._notifyReadError({
      source: { error: 'Source RPC down' },
      destination: { error: null },
    });

    expect(window.toastManager.error).toHaveBeenCalledWith(
      'Source Vault read warning: Source RPC down',
      { timeoutMs: 4000 }
    );
  });

  it('shows -- for destination cooldown when the destination snapshot is degraded', () => {
    const tab = new InfoTab();
    tab.load();

    tab.render({
      source: {
        configuredNetworkName: 'Polygon Amoy',
        configuredAddress: '0x1111111111111111111111111111111111111111',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: null,
        token: null,
        halted: null,
        maxBridgeOutAmount: null,
        vaultBalance: null,
        requiredSignatures: null,
        signers: [],
        operationDeadlineSeconds: null,
      },
      destination: {
        configuredNetworkName: 'BNB Testnet',
        configuredAddress: '0x2222222222222222222222222222222222222222',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: null,
        bridgeInCaller: null,
        bridgeInEnabled: null,
        maxBridgeInAmount: null,
        bridgeInCooldown: 0,
        minBridgeOutAmount: null,
        lastBridgeInTime: null,
        symbol: null,
        totalSupply: null,
        requiredSignatures: null,
        signers: [],
        operationDeadlineSeconds: null,
        error: 'Destination contract unavailable',
        errors: {},
      },
    });

    expect(document.querySelector('[data-info-field="destination:bridge-in-cooldown"]').textContent).toBe('--');
  });

  it('still shows 0s for destination cooldown when the snapshot is healthy', () => {
    const tab = new InfoTab();
    tab.load();

    tab.render({
      source: {
        configuredNetworkName: 'Polygon Amoy',
        configuredAddress: '0x1111111111111111111111111111111111111111',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: null,
        token: null,
        halted: null,
        maxBridgeOutAmount: null,
        vaultBalance: null,
        requiredSignatures: null,
        signers: [],
        operationDeadlineSeconds: null,
      },
      destination: {
        configuredNetworkName: 'BNB Testnet',
        configuredAddress: '0x2222222222222222222222222222222222222222',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: true,
        bridgeInCaller: '0x3333333333333333333333333333333333333333',
        bridgeInEnabled: true,
        maxBridgeInAmount: '1000000000000000000',
        bridgeInCooldown: 0,
        minBridgeOutAmount: '1000000000000000',
        lastBridgeInTime: null,
        symbol: 'LIB',
        totalSupply: '1000000000000000000',
        requiredSignatures: 2,
        signers: ['0x4444444444444444444444444444444444444444'],
        operationDeadlineSeconds: 259200,
        error: null,
        errors: {},
      },
    });

    expect(document.querySelector('[data-info-field="destination:bridge-in-cooldown"]').textContent).toBe('0s');
  });

  it('shows the destination bridge-in caller gas-fee balance in the native token', () => {
    const tab = new InfoTab();
    tab.load();

    tab.render({
      source: {
        configuredNetworkName: 'Polygon Amoy',
        configuredAddress: '0x1111111111111111111111111111111111111111',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: null,
        token: null,
        halted: null,
        maxBridgeOutAmount: null,
        vaultBalance: null,
        requiredSignatures: null,
        signers: [],
        operationDeadlineSeconds: null,
      },
      destination: {
        configuredNetworkName: 'BNB Testnet',
        configuredAddress: '0x2222222222222222222222222222222222222222',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: true,
        bridgeInCaller: '0x3333333333333333333333333333333333333333',
        bridgeInCallerGasBalance: '1500000000000000000',
        bridgeInEnabled: true,
        maxBridgeInAmount: '1000000000000000000',
        bridgeInCooldown: 0,
        minBridgeOutAmount: '1000000000000000',
        lastBridgeInTime: null,
        symbol: 'LIB',
        totalSupply: '1000000000000000000',
        requiredSignatures: 2,
        signers: ['0x4444444444444444444444444444444444444444'],
        operationDeadlineSeconds: 259200,
        error: null,
        errors: {},
      },
    });

    expect(document.querySelector('[data-info-field="destination:bridge-in-caller-fee-balance"]').textContent).toBe('1.5 tBNB');
  });

  it('shows destination read failures inline in the destination contract section', () => {
    const tab = new InfoTab();
    tab.load();

    tab.render({
      source: {
        configuredNetworkName: 'Polygon Amoy',
        configuredAddress: '0x1111111111111111111111111111111111111111',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: null,
        token: null,
        halted: null,
        maxBridgeOutAmount: null,
        vaultBalance: null,
        requiredSignatures: null,
        signers: [],
        operationDeadlineSeconds: null,
        error: null,
      },
      destination: {
        configuredNetworkName: 'BNB Testnet',
        configuredAddress: '0x2222222222222222222222222222222222222222',
        owner: null,
        onChainId: null,
        onChainChainId: null,
        bridgeOutEnabled: null,
        bridgeInCaller: null,
        bridgeInEnabled: null,
        maxBridgeInAmount: null,
        bridgeInCooldown: null,
        minBridgeOutAmount: null,
        lastBridgeInTime: null,
        symbol: null,
        totalSupply: null,
        requiredSignatures: null,
        signers: [],
        operationDeadlineSeconds: null,
        error: 'Destination contract unavailable',
        errors: {},
      },
    });

    const alert = document.querySelector('[data-info-field="destination:read-alert"]');
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toBe('Read warning: Destination contract unavailable');
  });
});

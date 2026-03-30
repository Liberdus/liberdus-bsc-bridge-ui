import { vi } from 'vitest';

export function normalizeAddress(value) {
  const input = String(value || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
    throw new Error('invalid address');
  }
  return `0x${input.slice(2).toLowerCase()}`;
}

export function installCommonWindowStubs({ txEnabled = true } = {}) {
  window.CONFIG = {
    TOKEN: { SYMBOL: 'LIB', DECIMALS: 18 },
    BRIDGE: {
      CHAINS: {
        SOURCE: {
          NAME: 'Polygon Amoy',
          CHAIN_ID: 80002,
          BLOCK_EXPLORER: 'https://amoy.polygonscan.com',
        },
      },
      CONTRACTS: {
        SOURCE: {
          ADDRESS: '0x1111111111111111111111111111111111111111',
        },
      },
    },
  };

  window.ethers = {
    utils: {
      getAddress: normalizeAddress,
      formatUnits: (value, decimals = 18) => {
        const scale = 10 ** Number(decimals || 18);
        const numeric = Number(value?.toString?.() ?? value ?? 0);
        return String(numeric / scale);
      },
    },
  };

  window.walletManager = {
    isConnected: vi.fn(() => false),
    getAddress: vi.fn(() => null),
  };

  window.contractManager = {
    getAccessState: vi.fn(async () => ({
      owner: null,
      isOwner: false,
      isSigner: false,
      ownerError: null,
      signerError: null,
      error: null,
    })),
    getStatusSnapshot: vi.fn(() => ({ requiredSignatures: 3 })),
    getReadOnlyProvider: vi.fn(() => null),
    getReadContract: vi.fn(() => null),
    getOperationsBatch: vi.fn(async () => new Map()),
    refreshStatus: vi.fn(async () => ({})),
  };

  window.networkManager = {
    isTxEnabled: vi.fn(() => txEnabled),
    isOnRequiredNetwork: vi.fn(() => txEnabled),
    ensureRequiredNetwork: vi.fn(async () => ({ switched: false })),
  };

  window.toastManager = {
    show: vi.fn(() => null),
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    update: vi.fn(),
  };

  window.location.hash = '';
}

export function setupOperationsTabDom() {
  document.body.innerHTML = `
    <button class="tab-button" data-tab="operations">Admin</button>
    <div class="tab-panel" data-panel="operations"></div>
  `;
}

export async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/utils/transaction-progress-session.js', () => ({
  createTransactionProgressSession: () => ({
    updateStep: vi.fn(),
    finishFailure: vi.fn(),
    finishCancelled: vi.fn(),
    finishSuccess: vi.fn(),
    setTransactionLink: vi.fn(),
    onVisibilityChange: vi.fn(() => () => {}),
    isVisible: vi.fn(() => false),
    isHidden: vi.fn(() => false),
    isActive: vi.fn(() => true),
    reopen: vi.fn(),
  }),
}));

import { PolygonBscBridgeModule } from '../js/modules/polygon-bsc-bridge-module.js';

class FakeBigNumber {
  constructor(value) {
    this.value = BigInt(value);
  }

  gt(other) {
    return this.value > toBigInt(other);
  }

  gte(other) {
    return this.value >= toBigInt(other);
  }

  lt(other) {
    return this.value < toBigInt(other);
  }

  lte(other) {
    return this.value <= toBigInt(other);
  }

  toString() {
    return this.value.toString();
  }
}

function toBigInt(value) {
  if (value instanceof FakeBigNumber) return value.value;
  if (typeof value === 'bigint') return value;
  if (value && typeof value.toString === 'function') return BigInt(value.toString());
  return BigInt(value || 0);
}

function parseUnits(value, decimals = 0) {
  const text = String(value || '').trim();
  const [wholePart, fractionPart = ''] = text.split('.');
  const whole = wholePart ? BigInt(wholePart) : 0n;
  const scale = 10n ** BigInt(decimals);
  const paddedFraction = `${fractionPart}0`.repeat(decimals ? 1 : 0).slice(0, decimals);
  const fraction = paddedFraction ? BigInt(paddedFraction) : 0n;
  return new FakeBigNumber((whole * scale) + fraction);
}

function formatUnits(value, decimals = 0) {
  const raw = toBigInt(value);
  if (decimals === 0) return raw.toString();

  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function getAddress(value) {
  const text = String(value || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(text)) {
    throw new Error('Invalid address');
  }
  return text;
}

function createModule() {
  const address = '0x1111111111111111111111111111111111111111';
  const tokenAddr = '0x2222222222222222222222222222222222222222';
  const vaultAddr = '0x3333333333333333333333333333333333333333';
  const snapshot = {
    maxBridgeOutAmount: '1000',
    bridgeOutEnabled: true,
    halted: false,
    onChainId: 56,
    token: tokenAddr,
  };

  const writeContract = {
    connect: vi.fn(function connect() {
      return this;
    }),
    bridgeOut: vi.fn().mockResolvedValue({
      hash: '0xabc',
      wait: vi.fn().mockResolvedValue({ status: 1, logs: null }),
    }),
  };

  const contractManager = {
    provider: {},
    abi: [],
    isReady: vi.fn(() => true),
    refreshStatus: vi.fn().mockResolvedValue(undefined),
    getStatusSnapshot: vi.fn(() => snapshot),
    getWriteContract: vi.fn(() => writeContract),
    getReadContract: vi.fn(() => null),
  };

  const walletProvider = {
    getSigner: vi.fn(() => ({})),
  };

  const walletManager = {
    isConnected: vi.fn(() => true),
    getAddress: vi.fn(() => address),
    getProvider: vi.fn(() => walletProvider),
    getSigner: vi.fn(() => ({})),
  };

  const networkManager = {
    isTxEnabled: vi.fn(() => true),
    isOnRequiredNetwork: vi.fn(() => true),
    ensureRequiredNetwork: vi.fn().mockResolvedValue({ switched: false }),
  };

  const toastManager = {
    show: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
  };

  const config = {
    TOKEN: {
      SYMBOL: 'LIB',
      DECIMALS: 0,
      ADDRESS: tokenAddr,
    },
    BRIDGE: {
      COORDINATOR_URL: 'https://coordinator.example.test/observer/',
      CONTRACTS: {
        SOURCE: {
          ADDRESS: vaultAddr,
        },
      },
      CHAINS: {
        SOURCE: {
          NAME: 'Polygon',
          CHAIN_ID: 56,
          BLOCK_EXPLORER: 'https://example.test',
        },
        DESTINATION: {
          NAME: 'BNB Chain',
        },
      },
    },
  };

  const module = new PolygonBscBridgeModule({
    contractManager,
    walletManager,
    networkManager,
    toastManager,
    config,
  });

  module._lastSnapshot = snapshot;
  module._els = {
    amount: document.createElement('textarea'),
    amountField: document.createElement('div'),
    userBalance: document.createElement('span'),
    maxAmountHint: document.createElement('span'),
    bridgeBtn: document.createElement('button'),
    setMaxBtn: document.createElement('button'),
    copyAddressButtons: [],
  };
  module._els.amount.value = '5';

  return {
    address,
    tokenAddr,
    vaultAddr,
    writeContract,
    module,
  };
}

beforeEach(() => {
  window.ethers = {
    BigNumber: {
      from: (value) => new FakeBigNumber(value),
    },
    utils: {
      Interface: class {
        parseLog() {
          throw new Error('no logs');
        }
      },
      formatUnits,
      getAddress,
      parseUnits,
    },
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ Ok: 'triggered' }),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PolygonBscBridgeModule token state reads', () => {
  it('refreshes the visible balance without reading allowance', async () => {
    const { module, address } = createModule();
    const balanceOf = vi.fn().mockResolvedValue('7');
    const allowance = vi.fn().mockResolvedValue('99');
    window.ethers.Contract = vi.fn(() => ({
      balanceOf,
      allowance,
    }));

    await module._refreshBalance();

    expect(balanceOf).toHaveBeenCalledWith(address);
    expect(allowance).not.toHaveBeenCalled();
    expect(module._availableBalanceWei?.toString()).toBe('7');
    expect(module._els.userBalance.textContent).toBe('7 LIB Available');
  });

  it('uses a freshly refreshed balance when setting the max amount', async () => {
    const { module } = createModule();
    module._availableBalanceWei = new FakeBigNumber(999);

    vi.spyOn(module, '_refreshBalance').mockImplementation(async () => {
      module._setAvailableBalance(new FakeBigNumber(12));
    });

    await module._onSetMaxClicked();

    expect(module._els.amount.value).toBe('12');
    expect(module._availableBalanceWei?.toString()).toBe('12');
  });

  it('returns balance even when the allowance read fails', async () => {
    const { module, address, tokenAddr, vaultAddr } = createModule();
    const balanceOf = vi.fn().mockResolvedValue('7');
    const allowance = vi.fn().mockRejectedValue(new Error('allowance read failed'));
    window.ethers.Contract = vi.fn(() => ({
      balanceOf,
      allowance,
    }));

    const result = await module._readSourceTokenState({
      tokenAddr,
      vaultAddr,
      address,
    });

    expect(balanceOf).toHaveBeenCalledWith(address);
    expect(allowance).toHaveBeenCalledWith(address, vaultAddr);
    expect(result.balanceWei?.toString()).toBe('7');
    expect(result.allowanceWei).toBeNull();
  });

  it('loads fresh token state during bridge-out preflight even with an existing balance value', async () => {
    const { module, address, tokenAddr, vaultAddr, writeContract } = createModule();
    module._availableBalanceWei = new FakeBigNumber(999);

    const liveTokenState = vi.spyOn(module, '_readSourceTokenState').mockResolvedValue({
      balanceWei: new FakeBigNumber(25),
      allowanceWei: new FakeBigNumber(10),
    });
    vi.spyOn(module, '_ensureRequiredNetworkForAction').mockResolvedValue({ switched: false, toastId: null });
    vi.spyOn(module, '_getTokenAddress').mockResolvedValue(tokenAddr);
    vi.spyOn(module, '_refreshBalance').mockResolvedValue(undefined);

    await module._onBridgeClicked();

    expect(liveTokenState).toHaveBeenCalledWith({
      tokenAddr,
      vaultAddr,
      address,
    });
    expect(module._availableBalanceWei?.toString()).toBe('25');
    expect(writeContract.bridgeOut).toHaveBeenCalledTimes(1);
  });

  it('debounces scheduled balance refreshes', async () => {
    vi.useFakeTimers();
    const { module } = createModule();
    const refreshBalance = vi.spyOn(module, '_refreshBalance').mockResolvedValue(undefined);

    module._scheduleRefreshBalance();
    module._scheduleRefreshBalance();

    await vi.advanceTimersByTimeAsync(249);
    expect(refreshBalance).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(module._refreshTimerId).toBeNull();
  });
});

describe('PolygonBscBridgeModule bridge-out observer notify', () => {
  it('posts the source chain id to the coordinator notify endpoint after a successful bridge out', async () => {
    const { module } = createModule();
    vi.spyOn(module, '_readSourceTokenState').mockResolvedValue({
      balanceWei: new FakeBigNumber(25),
      allowanceWei: new FakeBigNumber(25),
    });
    const refreshBalance = vi.spyOn(module, '_refreshBalance').mockResolvedValue(undefined);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ Ok: 'triggered' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const acceptedEvents = [];
    const onAccepted = (event) => acceptedEvents.push(event.detail);
    document.addEventListener('bridgeOutNotifyAccepted', onAccepted);

    await module._onBridgeClicked();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://coordinator.example.test/observer/notify-bridgeout',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: 56 }),
        keepalive: true,
      }),
    );
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(acceptedEvents).toEqual([{ chainId: 56, status: 'triggered' }]);
    document.removeEventListener('bridgeOutNotifyAccepted', onAccepted);
  });

  it('does not block bridge success when the observer notify request fails', async () => {
    const { module } = createModule();
    vi.spyOn(module, '_readSourceTokenState').mockResolvedValue({
      balanceWei: new FakeBigNumber(25),
      allowanceWei: new FakeBigNumber(25),
    });
    const refreshBalance = vi.spyOn(module, '_refreshBalance').mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('notify failed')));

    const outcome = await Promise.race([
      module._onBridgeClicked().then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 25)),
    ]);
    await Promise.resolve();

    expect(outcome).toBe('resolved');
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});

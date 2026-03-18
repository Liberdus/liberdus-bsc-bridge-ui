import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { CONFIG } from '../js/config.js';
import { TransactionsTab } from '../js/components/transactions-tab.js';
import { PolygonBscBridgeModule } from '../js/modules/polygon-bsc-bridge-module.js';
import { getReadOnlyProvider, resetReadOnlyProvider } from '../js/utils/read-only-provider.js';
import { resetReadOnlyProvidersForNetworks } from '../js/utils/read-only-provider-for-network.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeEthersStub() {
  class FakeProvider {
    constructor(rpcUrl, network) {
      this.rpcUrl = rpcUrl;
      this.network = network;
      this.lastFilter = null;
      this.lastHandler = null;
    }

    async send(method) {
      if (method === 'eth_chainId') {
        return `0x${Number(this.network?.chainId || 0).toString(16)}`;
      }
      return null;
    }

    async getBlockNumber() {
      return 1;
    }

    on(filter, handler) {
      this.lastFilter = filter;
      this.lastHandler = handler;
    }

    off(filter, handler) {
      if (this.lastFilter === filter && this.lastHandler === handler) {
        this.lastFilter = null;
        this.lastHandler = null;
      }
    }
  }

  class FakeInterface {
    constructor(abi) {
      this.abi = abi;
    }

    getEventTopic(name) {
      return `topic:${name}`;
    }

    parseLog(log) {
      return { args: log?.args || {} };
    }
  }

  return {
    providers: {
      StaticJsonRpcProvider: FakeProvider,
    },
    BigNumber: {
      from(value) {
        const normalized = BigInt(value);
        return {
          _value: normalized,
          toString() {
            return normalized.toString();
          },
        };
      },
    },
    utils: {
      formatUnits(value, decimals) {
        const normalized = typeof value === 'object' && value !== null && '_value' in value
          ? value._value
          : BigInt(value);
        const scale = 10n ** BigInt(decimals);
        const whole = normalized / scale;
        const fraction = normalized % scale;
        if (fraction === 0n) return whole.toString();
        return `${whole}.${fraction.toString().padStart(Number(decimals), '0').replace(/0+$/, '')}`;
      },
      Interface: FakeInterface,
      getAddress(value) {
        return value;
      },
    },
  };
}

function attachRenderTargets(tab) {
  tab.panel = {};
  tab.tableBody = { innerHTML: '' };
  tab.searchInput = { value: '' };
  tab.totalEl = { textContent: '' };
  tab.pageInfoEl = { textContent: '' };
  tab.prevBtn = { disabled: false };
  tab.nextBtn = { disabled: false };
  tab.pageSizeEl = { value: String(tab.pageSize) };
}

function resetGlobals() {
  resetReadOnlyProvider();
  resetReadOnlyProvidersForNetworks();
  delete global.window;
  delete global.fetch;
  delete global.document;
  delete global.CustomEvent;
}

afterEach(() => {
  resetGlobals();
});

test('source-side consumers read canonical bridge config directly', async () => {
  global.window = {
    ethers: makeEthersStub(),
    CONFIG,
  };

  const provider = await getReadOnlyProvider();

  assert.equal(CONFIG.NETWORK, undefined);
  assert.equal(CONFIG.CONTRACT, undefined);
  assert.equal(provider.rpcUrl, CONFIG.BRIDGE.CHAINS.SOURCE.RPC_URL);
  assert.equal(provider.network?.chainId, CONFIG.BRIDGE.CHAINS.SOURCE.CHAIN_ID);
  assert.equal(CONFIG.BRIDGE.CHAINS.SOURCE.BLOCK_EXPLORER, 'https://amoy.polygonscan.com');
  assert.equal(CONFIG.BRIDGE.CONTRACTS.SOURCE.ABI_PATH, './abi/vault.json');
});

test('PolygonBscBridgeModule syncs labels and vault address from config only', async () => {
  global.window = {};

  const module = new PolygonBscBridgeModule({
    config: {
      TOKEN: {
        SYMBOL: 'LIB',
        DECIMALS: 18,
      },
      BRIDGE: {
        CHAINS: {
          SOURCE: {
            CHAIN_ID: 80002,
            NAME: 'Configured Source',
            BLOCK_EXPLORER: 'https://configured.example',
          },
          DESTINATION: {
            CHAIN_ID: 97,
            NAME: 'Configured Destination',
          },
        },
        CONTRACTS: {
          SOURCE: {
            ADDRESS: '0x1111111111111111111111111111111111111111',
          },
        },
      },
    },
  });

  module._els = {
    sourceName: { textContent: '' },
    destName: { textContent: '' },
    sourceChain: { textContent: '' },
    destChain: { textContent: '' },
    destChainId: { value: '' },
    vaultAddress: { textContent: '' },
  };

  module._syncChainText();

  assert.equal(module._els.sourceName.textContent, 'Configured Source');
  assert.equal(module._els.destName.textContent, 'Configured Destination');
  assert.equal(module._els.sourceChain.textContent, 'Configured Source (80002)');
  assert.equal(module._els.destChain.textContent, 'Configured Destination (97)');
  assert.equal(module._els.destChainId.value, '97');
  assert.equal(module._els.vaultAddress.textContent, '0x1111…1111');
  assert.equal(module._getBridgeOutChainId({ onChainId: 90001 }), 90001);
  assert.equal(module._getBridgeOutChainId({ onChainId: 0 }), 80002);
  assert.deepEqual(await module._buildGasOverrides({}, '1', '0xrecipient', 80002), {});
});

test('TransactionsTab uses bridge config for zero-sentinel source routing and explorer links', () => {
  global.window = {
    ethers: makeEthersStub(),
    addEventListener() {},
    removeEventListener() {},
  };

  const tab = new TransactionsTab();
  attachRenderTargets(tab);

  tab._onBridgeOutEvent({
    detail: {
      txHash: '0xabc123',
      from: '0x1111111111111111111111111111111111111111',
      amount: '1000000000000000000',
      targetChainId: CONFIG.BRIDGE.CHAINS.DESTINATION.CHAIN_ID,
      sourceChainId: 0,
      timestamp: Math.floor(Date.now() / 1000),
    },
  });

  assert.equal(tab._rows[0].srcChainKey, 'SOURCE');
  assert.equal(tab._rows[0].srcName, CONFIG.BRIDGE.CHAINS.SOURCE.NAME);

  tab._rows[0].dstChainKey = 'DESTINATION';
  tab._rows[0].receiptTxHash = '0xdef456';
  tab.render();

  const sourceExplorer = CONFIG.BRIDGE.CHAINS.SOURCE.BLOCK_EXPLORER.replace(/\/$/, '');
  const destinationExplorer = CONFIG.BRIDGE.CHAINS.DESTINATION.BLOCK_EXPLORER.replace(/\/$/, '');

  assert.match(tab.tableBody.innerHTML, new RegExp(`${escapeRegExp(sourceExplorer)}/tx/0xabc123`));
  assert.match(tab.tableBody.innerHTML, new RegExp(`${escapeRegExp(destinationExplorer)}/tx/0xdef456`));
});

test('TransactionsTab uses configured coordinator URL and never fetches chain-config.json', async () => {
  global.window = {
    ethers: makeEthersStub(),
    addEventListener() {},
    removeEventListener() {},
  };

  const fetches = [];
  global.fetch = async (url) => {
    fetches.push(String(url));
    if (url === `${CONFIG.BRIDGE.COORDINATOR_URL}/transaction?page=1`) {
      return {
        ok: true,
        async json() {
          return {
            Ok: {
              transactions: [],
              totalPages: 1,
            },
          };
        },
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const tab = new TransactionsTab();
  attachRenderTargets(tab);
  await tab.refresh();

  assert.deepEqual(fetches, [`${CONFIG.BRIDGE.COORDINATOR_URL}/transaction?page=1`]);
  assert.ok(fetches.every((url) => !url.includes('chain-config.json')));
});

test('TransactionsTab bridge watch uses configured source contract address without chain-config fetch', async () => {
  global.window = {
    ethers: makeEthersStub(),
    addEventListener() {},
    removeEventListener() {},
  };

  const fetches = [];
  global.fetch = async (url) => {
    fetches.push(String(url));

    if (url === CONFIG.BRIDGE.CONTRACTS.SOURCE.ABI_PATH) {
      return {
        ok: true,
        async json() {
          return [{ type: 'event', name: 'BridgedOut', inputs: [] }];
        },
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const tab = new TransactionsTab();
  await tab._ensureBridgeOutWatch();

  assert.equal(tab._bridgeOutFilter?.address, CONFIG.BRIDGE.CONTRACTS.SOURCE.ADDRESS);
  assert.equal(tab._bridgeOutFilter?.topics?.[0], 'topic:BridgedOut');
  assert.deepEqual(fetches, [CONFIG.BRIDGE.CONTRACTS.SOURCE.ABI_PATH]);
});

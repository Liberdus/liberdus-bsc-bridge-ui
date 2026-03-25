import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG } from '../js/config.js';
import {
  getReadOnlyProvider,
  getReadOnlyProviderForNetwork,
  peekReadOnlyProvider,
  peekReadOnlyProviderForNetwork,
  resetReadOnlyProvider,
  resetReadOnlyProvidersForNetworks,
} from '../js/utils/read-only-provider.js';

function makeNetwork({
  chainId,
  name,
  rpcUrl,
  fallbackRpcs = [],
}) {
  return {
    CHAIN_ID: chainId,
    NAME: name,
    RPC_URL: rpcUrl,
    FALLBACK_RPCS: fallbackRpcs,
  };
}

function installEthersProviderStub({
  chainIdByUrl = {},
  sendErrorsByUrl = {},
  blockErrorsByUrl = {},
  blockNumberByUrl = {},
} = {}) {
  const instances = [];
  const sendCalls = [];
  const blockCalls = [];

  class FakeProvider {
    constructor(url, network) {
      this.url = url;
      this.network = network;
      instances.push(this);
    }

    async send(method, params) {
      sendCalls.push({ url: this.url, method, params });

      const error = sendErrorsByUrl[this.url];
      if (error) throw error;

      if (method === 'eth_chainId') {
        const chainId = chainIdByUrl[this.url] ?? this.network?.chainId ?? 0;
        return `0x${Number(chainId).toString(16)}`;
      }

      return `${method}:${this.url}`;
    }

    async getBlockNumber() {
      blockCalls.push({ url: this.url });

      const error = blockErrorsByUrl[this.url];
      if (error) throw error;

      return blockNumberByUrl[this.url] ?? 123456;
    }
  }

  window.ethers = {
    providers: {
      StaticJsonRpcProvider: FakeProvider,
    },
  };

  return { instances, sendCalls, blockCalls };
}

describe('read-only provider utility', () => {
  const originalSourceNetwork = structuredClone(CONFIG.BRIDGE.CHAINS.SOURCE);

  beforeEach(() => {
    resetReadOnlyProvidersForNetworks();
    CONFIG.BRIDGE.CHAINS.SOURCE = structuredClone(originalSourceNetwork);
  });

  afterEach(() => {
    resetReadOnlyProvidersForNetworks();
    CONFIG.BRIDGE.CHAINS.SOURCE = structuredClone(originalSourceNetwork);
    delete window.ethers;
    vi.restoreAllMocks();
  });

  it('shares the same provider between the source wrapper and explicit source-network lookup', async () => {
    const sourceNetwork = makeNetwork({
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc.source.example',
      fallbackRpcs: ['https://rpc.source-fallback.example'],
    });
    CONFIG.BRIDGE.CHAINS.SOURCE = sourceNetwork;

    const { instances } = installEthersProviderStub({
      chainIdByUrl: {
        'https://rpc.source.example': 80002,
      },
    });

    const bySource = await getReadOnlyProvider();
    const byNetwork = await getReadOnlyProviderForNetwork(sourceNetwork);

    expect(byNetwork).toBe(bySource);
    expect(peekReadOnlyProvider()).toBe(bySource);
    expect(peekReadOnlyProviderForNetwork(sourceNetwork)).toBe(bySource);
    expect(instances).toHaveLength(1);
  });

  it('keeps separate cache entries for distinct networks', async () => {
    const sourceNetwork = makeNetwork({
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc.source.example',
    });
    const destinationNetwork = makeNetwork({
      chainId: 97,
      name: 'BNB Testnet',
      rpcUrl: 'https://rpc.destination.example',
    });
    CONFIG.BRIDGE.CHAINS.SOURCE = sourceNetwork;

    const { instances } = installEthersProviderStub({
      chainIdByUrl: {
        'https://rpc.source.example': 80002,
        'https://rpc.destination.example': 97,
      },
    });

    const sourceProvider = await getReadOnlyProvider();
    const destinationProvider = await getReadOnlyProviderForNetwork(destinationNetwork);

    expect(destinationProvider).not.toBe(sourceProvider);
    expect(peekReadOnlyProvider()).toBe(sourceProvider);
    expect(peekReadOnlyProviderForNetwork(destinationNetwork)).toBe(destinationProvider);
    expect(instances).toHaveLength(2);
  });

  it('resetReadOnlyProvider only clears the source-network cache entry', async () => {
    const sourceNetwork = makeNetwork({
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc.source.example',
    });
    const destinationNetwork = makeNetwork({
      chainId: 97,
      name: 'BNB Testnet',
      rpcUrl: 'https://rpc.destination.example',
    });
    CONFIG.BRIDGE.CHAINS.SOURCE = sourceNetwork;

    const { instances } = installEthersProviderStub({
      chainIdByUrl: {
        'https://rpc.source.example': 80002,
        'https://rpc.destination.example': 97,
      },
    });

    const firstSourceProvider = await getReadOnlyProvider();
    const destinationProvider = await getReadOnlyProviderForNetwork(destinationNetwork);

    resetReadOnlyProvider();

    expect(peekReadOnlyProvider()).toBeNull();
    expect(peekReadOnlyProviderForNetwork(destinationNetwork)).toBe(destinationProvider);

    const secondSourceProvider = await getReadOnlyProvider();

    expect(secondSourceProvider).not.toBe(firstSourceProvider);
    expect(destinationProvider).toBe(peekReadOnlyProviderForNetwork(destinationNetwork));
    expect(instances).toHaveLength(3);
  });

  it('falls back to the next RPC when the primary endpoint fails validation', async () => {
    const sourceNetwork = makeNetwork({
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc.bad.example',
      fallbackRpcs: ['https://rpc.good.example'],
    });
    CONFIG.BRIDGE.CHAINS.SOURCE = sourceNetwork;

    const { instances, sendCalls, blockCalls } = installEthersProviderStub({
      chainIdByUrl: {
        'https://rpc.bad.example': 99999,
        'https://rpc.good.example': 80002,
      },
    });

    const provider = await getReadOnlyProvider();

    expect(provider.url).toBe('https://rpc.good.example');
    expect(instances).toHaveLength(2);
    expect(sendCalls.filter((call) => call.method === 'eth_chainId')).toHaveLength(2);
    expect(blockCalls).toEqual([{ url: 'https://rpc.good.example' }]);
  });

  it('throws a combined error when every RPC endpoint fails', async () => {
    const sourceNetwork = makeNetwork({
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc.bad-chain.example',
      fallbackRpcs: ['https://rpc.bad-block.example'],
    });
    CONFIG.BRIDGE.CHAINS.SOURCE = sourceNetwork;

    installEthersProviderStub({
      chainIdByUrl: {
        'https://rpc.bad-chain.example': 99999,
        'https://rpc.bad-block.example': 80002,
      },
      blockErrorsByUrl: {
        'https://rpc.bad-block.example': new Error('block lookup failed'),
      },
    });

    await expect(getReadOnlyProvider()).rejects.toThrow(
      /Failed to initialize read-only RPC provider/,
    );
    await expect(getReadOnlyProvider()).rejects.toThrow(
      /https:\/\/rpc\.bad-chain\.example -> Unexpected chainId 99999/,
    );
    await expect(getReadOnlyProvider()).rejects.toThrow(
      /https:\/\/rpc\.bad-block\.example -> block lookup failed/,
    );
  });

  it('cleans up a failed in-flight provider promise so the next attempt can retry', async () => {
    const network = makeNetwork({
      chainId: 97,
      name: 'BNB Testnet',
      rpcUrl: 'https://rpc.retry.example',
    });

    installEthersProviderStub({
      sendErrorsByUrl: {
        'https://rpc.retry.example': new Error('temporary send failure'),
      },
    });

    const [firstAttempt, secondAttempt] = await Promise.allSettled([
      getReadOnlyProviderForNetwork(network),
      getReadOnlyProviderForNetwork(network),
    ]);

    expect(firstAttempt.status).toBe('rejected');
    expect(secondAttempt.status).toBe('rejected');
    expect(peekReadOnlyProviderForNetwork(network)).toBeNull();

    const { instances } = installEthersProviderStub({
      chainIdByUrl: {
        'https://rpc.retry.example': 97,
      },
    });

    const provider = await getReadOnlyProviderForNetwork(network);

    expect(provider.url).toBe('https://rpc.retry.example');
    expect(peekReadOnlyProviderForNetwork(network)).toBe(provider);
    expect(instances).toHaveLength(1);
  });
});

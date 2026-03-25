import { CONFIG } from '../config.js';

const providers = new Map();
const providerPromises = new Map();

function hashString(str) {
  const s = String(str || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function makeRpcKey(method, params) {
  try {
    if (method === 'eth_chainId' || method === 'eth_blockNumber') return method;

    if (method === 'eth_getCode' && Array.isArray(params)) {
      const addr = String(params[0] || '').toLowerCase();
      const blockTag = String(params[1] ?? 'latest');
      return `eth_getCode:${addr}:${blockTag}`;
    }

    if (method === 'eth_call' && Array.isArray(params)) {
      const call = params[0] || {};
      const blockTag = String(params[1] ?? 'latest');
      const to = String(call.to || '').toLowerCase();
      const from = call.from ? String(call.from).toLowerCase() : '';
      const value = call.value ? String(call.value) : '';
      const data = String(call.data || '');
      return `eth_call:${to}:${from}:${value}:${blockTag}:${data.length}:${hashString(data)}`;
    }

    if (method === 'eth_getLogs' && Array.isArray(params)) {
      const filter = params[0] || {};
      const address = String(filter.address || '').toLowerCase();
      const fromBlock = String(filter.fromBlock ?? '');
      const toBlock = String(filter.toBlock ?? '');
      const topics = Array.isArray(filter.topics) ? hashString(JSON.stringify(filter.topics)) : '';
      return `eth_getLogs:${address}:${fromBlock}:${toBlock}:${topics}`;
    }
  } catch {
    // Fall through to the generic key path.
  }

  try {
    return `${method}:${hashString(JSON.stringify(params || []))}`;
  } catch {
    return `${method}:${String(params)}`;
  }
}

function getRpcCacheTtlMs(method) {
  if (method === 'eth_chainId') return 24 * 60 * 60 * 1000;
  if (method === 'eth_blockNumber') return 1500;
  if (method === 'eth_getCode') return 60 * 1000;
  if (method === 'eth_call') return 10 * 1000;
  if (method === 'eth_getLogs') return 10 * 1000;
  return 0;
}

function wrapProviderWithRpcCache(provider, { maxEntries = 500 } = {}) {
  if (!provider || typeof provider.send !== 'function') return provider;
  if (provider.__rpcCacheWrapped) return provider;

  const originalSend = provider.send.bind(provider);
  const cache = new Map();
  const inflight = new Map();

  const prune = () => {
    while (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey == null) break;
      cache.delete(firstKey);
    }
  };

  provider.send = async (method, params) => {
    const key = makeRpcKey(method, params);
    const ttlMs = getRpcCacheTtlMs(method);
    const now = Date.now();

    if (ttlMs > 0) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now) return hit.value;
      if (hit && hit.expiresAt <= now) cache.delete(key);
    }

    const inFlight = inflight.get(key);
    if (inFlight) return await inFlight;

    const p = (async () => {
      const value = await originalSend(method, params);
      if (ttlMs > 0) {
        cache.set(key, { expiresAt: now + ttlMs, value });
        prune();
      }
      return value;
    })();

    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  };

  provider.__rpcCacheWrapped = true;
  return provider;
}

function getEthers() {
  const ethers = window.ethers;
  if (!ethers || !ethers.providers) {
    throw new Error('Ethers.js not loaded');
  }
  return ethers;
}

function normalizeNetworkConfig(network) {
  const chainId = Number(network?.CHAIN_ID);
  const name = String(network?.NAME || 'unknown');
  const primaryRpcUrl = network?.RPC_URL;
  const fallbackRpcs = Array.isArray(network?.FALLBACK_RPCS) ? network.FALLBACK_RPCS : [];
  const rpcUrls = Array.from(new Set([primaryRpcUrl, ...fallbackRpcs].filter(Boolean)));

  if (!Number.isFinite(chainId)) throw new Error('Missing/invalid chainId');
  if (rpcUrls.length === 0) throw new Error('Missing RPC_URL');

  return { chainId, name, rpcUrls };
}

function makeKey(network) {
  try {
    const { chainId, name, rpcUrls } = normalizeNetworkConfig(network);
    return `${chainId}:${name}:${hashString(rpcUrls.join('|'))}`;
  } catch {
    return hashString(JSON.stringify(network || {}));
  }
}

function getSourceNetwork() {
  return CONFIG?.BRIDGE?.CHAINS?.SOURCE || null;
}

async function createProvider(network) {
  const ethers = getEthers();
  const { chainId, name, rpcUrls } = normalizeNetworkConfig(network);
  const ProviderCtor = ethers.providers.StaticJsonRpcProvider || ethers.providers.JsonRpcProvider;
  const failures = [];

  for (const rpcUrl of rpcUrls) {
    const provider = new ProviderCtor(rpcUrl, { chainId, name });
    wrapProviderWithRpcCache(provider);

    try {
      const chainIdHex = await provider.send('eth_chainId', []);
      const actualChainId = typeof chainIdHex === 'string' ? parseInt(chainIdHex, 16) : Number(chainIdHex);
      if (Number(actualChainId) !== chainId) {
        throw new Error(`Unexpected chainId ${actualChainId} (expected ${chainId})`);
      }

      await provider.getBlockNumber();
      return provider;
    } catch (error) {
      const msg = error?.reason || error?.message || String(error);
      failures.push(`${rpcUrl} -> ${msg}`);
    }
  }

  throw new Error(`Failed to initialize read-only RPC provider. Tried: ${failures.join(' | ')}`);
}

export async function getReadOnlyProviderForNetwork(network) {
  const key = makeKey(network);
  const existing = providers.get(key);
  if (existing) return existing;

  const inFlight = providerPromises.get(key);
  if (inFlight) return await inFlight;

  const promise = createProvider(network)
    .then((provider) => {
      providers.set(key, provider);
      providerPromises.delete(key);
      return provider;
    })
    .catch((error) => {
      providerPromises.delete(key);
      throw error;
    });

  providerPromises.set(key, promise);
  return await promise;
}

export async function getReadOnlyProvider() {
  return await getReadOnlyProviderForNetwork(getSourceNetwork());
}

export function peekReadOnlyProviderForNetwork(network) {
  return providers.get(makeKey(network)) || null;
}

export function peekReadOnlyProvider() {
  return peekReadOnlyProviderForNetwork(getSourceNetwork());
}

export function resetReadOnlyProvidersForNetworks() {
  providers.clear();
  providerPromises.clear();
}

export function resetReadOnlyProvider() {
  const sourceNetwork = getSourceNetwork();
  const key = makeKey(sourceNetwork);
  providers.delete(key);
  providerPromises.delete(key);
}

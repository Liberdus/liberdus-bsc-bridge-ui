import { CONFIG } from '../config.js';
import { getReadOnlyProviderForNetwork } from '../utils/read-only-provider-for-network.js';

function shortenHex(value, { head = 4, tail = 4 } = {}) {
  const s = String(value || '');
  if (!s.startsWith('0x') || s.length <= head + tail + 2) return s || '--';
  return `${s.slice(0, 2 + head)}…${s.slice(-tail)}`;
}

function shortenAny(value, { head = 4, tail = 4 } = {}) {
  const s = String(value || '');
  if (!s || s.length <= head + tail + 1) return s || '--';
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function shortenAddress(value) {
  return shortenHex(value, { head: 4, tail: 4 });
}

function safeLowerHex(value) {
  const s = String(value || '');
  return s.startsWith('0x') ? s.toLowerCase() : s.toLowerCase();
}

function formatRelativeTime(unixSeconds) {
  const ts = Number(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return '--';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);

  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function toBigNumber(value) {
  try {
    return window.ethers.BigNumber.from(value);
  } catch {
    return null;
  }
}

function formatTokenAmount(amount, decimals, symbol) {
  try {
    const ethers = window.ethers;
    const bn = toBigNumber(amount);
    if (!bn) return '--';
    const formatted = ethers.utils.formatUnits(bn, Number(decimals || 18));
    const value = Number(formatted);
    if (!Number.isFinite(value)) return '--';
    const rounded = value.toFixed(2);
    return `${rounded} ${symbol || ''}`.trim();
  } catch {
    return '--';
  }
}

function getChainConfig() {
  const chains = CONFIG?.BRIDGE?.CHAINS || {};
  const polygon = chains.POLYGON || CONFIG?.NETWORK;
  const bsc = chains.BSC || null;

  const normalized = {};
  if (polygon?.CHAIN_ID) normalized.POLYGON = polygon;
  if (bsc?.CHAIN_ID) normalized.BSC = bsc;
  return normalized;
}

function getContractsConfig() {
  const contracts = CONFIG?.BRIDGE?.CONTRACTS || {};
  const fallbackAddr = CONFIG?.CONTRACT?.ADDRESS;
  return {
    POLYGON: contracts.POLYGON?.ADDRESS || fallbackAddr,
    BSC: contracts.BSC?.ADDRESS || fallbackAddr,
  };
}

function getExplorer(chainKey) {
  const chains = getChainConfig();
  const base = chains?.[chainKey]?.BLOCK_EXPLORER || '';
  return String(base || '').replace(/\/$/, '');
}

function linkTx(chainKey, txHash) {
  if (!chainKey) return '';
  const explorer = getExplorer(chainKey);
  if (!explorer || !txHash) return '';
  return `${explorer}/tx/${txHash}`;
}

let _chainConfigCache = null;

function getDefaultCoordinatorUrl() {
  return normalizeCoordinatorUrl(
    CONFIG?.BRIDGE?.COORDINATOR_URL ||
      CONFIG?.COORDINATOR?.URL ||
      CONFIG?.COORDINATOR_URL ||
      'https://tss-test1.liberdus.com'
  );
}

async function fetchChainConfig() {
  if (_chainConfigCache) return _chainConfigCache;

  const defaultCoordinatorUrl = getDefaultCoordinatorUrl();
  let remoteConfig = null;

  try {
    const response = await fetch('./tss-signer/chain-config.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load chain config: ${response.status}`);
    const json = await response.json();
    remoteConfig = json && typeof json === 'object' ? json : null;
  } catch {
    remoteConfig = null;
  }

  const remoteCoordinatorUrl = normalizeCoordinatorUrl(remoteConfig?.coordinatorUrl);
  const isLocalCoordinatorUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(remoteCoordinatorUrl);

  _chainConfigCache = {
    ...(remoteConfig || {}),
    coordinatorUrl:
      remoteCoordinatorUrl && !isLocalCoordinatorUrl
        ? remoteCoordinatorUrl
        : defaultCoordinatorUrl,
  };

  return _chainConfigCache;
}

function resolveChainConfig(chainId, chainConfig) {
  if (!chainConfig || !Number.isFinite(chainId)) return null;
  const supported = chainConfig?.supportedChains?.[String(chainId)];
  if (supported && supported.chainId) return supported;
  if (Number(chainConfig?.vaultChain?.chainId) === chainId) return chainConfig.vaultChain;
  if (Number(chainConfig?.secondaryChainConfig?.chainId) === chainId) return chainConfig.secondaryChainConfig;
  return null;
}

async function fetchAbi() {
  const abiPath = CONFIG?.CONTRACT?.ABI_PATH || './abi/vault.json';
  const response = await fetch(abiPath, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Failed to load ABI (${abiPath}): ${response.status}`);
  const json = await response.json();
  const abi = Array.isArray(json) ? json : json?.abi;
  if (!Array.isArray(abi)) throw new Error('Invalid ABI format');
  return abi;
}

async function getLogsChunked(provider, baseFilter, fromBlock, toBlock, chunkSize) {
  const f = Number(fromBlock);
  const t = Number(toBlock);
  if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return [];

  const size = Number(chunkSize || 3000);
  const results = [];

  for (let start = f; start <= t; start += size) {
    const end = Math.min(t, start + size - 1);
    const logs = await provider.getLogs({ ...baseFilter, fromBlock: start, toBlock: end });
    if (Array.isArray(logs) && logs.length) results.push(...logs);
  }

  return results;
}

async function fetchTransactionReceipt(provider, txHash) {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
    };
  } catch {
    return null;
  }
}

function buildChainIdIndex(chains) {
  const map = new Map();
  for (const [key, cfg] of Object.entries(chains || {})) {
    const id = Number(cfg?.CHAIN_ID);
    if (Number.isFinite(id)) map.set(id, key);
  }
  return map;
}

function sortByTimestampDesc(a, b) {
  const at = Number(a?.timestamp || 0);
  const bt = Number(b?.timestamp || 0);
  if (bt !== at) return bt - at;
  return String(b?.txHash || '').localeCompare(String(a?.txHash || ''));
}

function normalizeCoordinatorUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.replace(/\/$/, '');
}

function renderTxLink(chainKey, txHash) {
  if (!txHash) return '<span class="tx-muted">--</span>';
  const raw = String(txHash || '');
  const url = linkTx(chainKey, raw);
  const label = raw.startsWith('0x')
    ? shortenHex(raw, { head: 4, tail: 4 })
    : shortenAny(raw, { head: 4, tail: 4 });
  if (!url) return `<code class="tx-code">${label}</code>`;
  return `<a class="tx-link" href="${url}" target="_blank" rel="noopener"><code class="tx-code">${label}</code><span class="tx-ext">↗</span></a>`;
}

function renderAddress(address) {
  const label = shortenAddress(address);
  return `<code class="tx-code">${label}</code>`;
}

function renderChainRoute(src, dst, srcName, dstName) {
  const s = srcName || src || '--';
  const d = dstName || dst || '--';
  return `
    <div class="tx-route">
      <span class="tx-pill tx-pill--src">${s}</span>
      <span class="tx-arrow">→</span>
      <span class="tx-pill tx-pill--dst">${d}</span>
    </div>
  `;
}

function renderStatus(status) {
  const num = Number(status);
  if (num === 2) return `<span class="tx-status tx-status--ok">Completed</span>`;
  if (num === 1) return `<span class="tx-status tx-status--pending">Processing</span>`;
  if (num === 0) return `<span class="tx-status tx-status--pending">Pending</span>`;
  if (num === 3 || num === 4) return `<span class="tx-status tx-status--error">error</span>`;
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return `<span class="tx-status tx-status--ok">Completed</span>`;
  if (s === 'pending') return `<span class="tx-status tx-status--pending">Pending</span>`;
  if (s === 'processing') return `<span class="tx-status tx-status--pending">Processing</span>`;
  if (s === 'failed' || s === 'reverted') return `<span class="tx-status tx-status--error">error</span>`;
  return `<span class="tx-status tx-status--unknown">Unknown</span>`;
}

async function loadTransactionsFromCoordinator({ limit = 200 } = {}) {
  const chains = getChainConfig();
  const chainConfig = await fetchChainConfig();
  const chainIdIndex = buildChainIdIndex(chains);
  const coordinatorUrl = normalizeCoordinatorUrl(chainConfig?.coordinatorUrl) || getDefaultCoordinatorUrl();
  if (!coordinatorUrl) throw new Error('Coordinator URL is not configured');

  const secondaryChainId =
    Number(chainConfig?.secondaryChainConfig?.chainId) ||
    Number(chains?.BSC?.CHAIN_ID) ||
    0;

  const allTransactions = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetch(`${coordinatorUrl}/transaction?page=${page}`);
    if (!response.ok) throw new Error(`Failed to load transactions: ${response.status}`);
    const data = await response.json();
    const ok = data?.Ok || null;
    const txs = Array.isArray(ok?.transactions) ? ok.transactions : [];
    totalPages = Number(ok?.totalPages || totalPages);
    if (txs.length) allTransactions.push(...txs);
    if (!Number.isFinite(totalPages) || totalPages < 1) break;
    page += 1;
  }

  const rows = allTransactions
    .map((tx) => {
      const type = Number(tx?.type);
      const chainId = Number(tx?.chainId);
      const srcChainId = type === 0 ? 0 : chainId;
      const dstChainId = type === 0 ? chainId : type === 2 ? secondaryChainId : 0;

      const srcChainKey = chainIdIndex.get(Number(srcChainId)) || null;
      const dstChainKey = chainIdIndex.get(Number(dstChainId)) || null;

      const srcName =
        srcChainId === 0
          ? 'Liberdus Network'
          : chains?.[srcChainKey]?.NAME || `Chain ${srcChainId}`;
      const dstName =
        dstChainId === 0
          ? 'Liberdus Network'
          : chains?.[dstChainKey]?.NAME || `Chain ${dstChainId}`;

      const rawTimestamp = Number(tx?.txTimestamp || 0);
      const timestamp = rawTimestamp > 1e12 ? Math.floor(rawTimestamp / 1000) : rawTimestamp;

      return {
        id: tx?.txId,
        srcChainKey,
        dstChainKey,
        srcName,
        dstName,
        from: tx?.sender,
        amount: tx?.value,
        timestamp,
        txHash: tx?.txId,
        receiptTxHash: tx?.receiptId || '',
        status: tx?.status,
        type,
      };
    })
    .sort(sortByTimestampDesc)
    .slice(0, Number(limit || 200));

  return rows;
}


async function loadTransactionsFromOnchain({ limit = 200 } = {}) {

  const ethers = window.ethers;
  const abi = await fetchAbi();
  const iface = new ethers.utils.Interface(abi);
  const bridgedOutTopic = iface.getEventTopic('BridgedOut');
  const relinquishedTopic = iface.getEventTopic('TokensRelinquished');

  const chains = getChainConfig();
  const contracts = getContractsConfig();
  const chainConfig = await fetchChainConfig();
  const chainIdIndex = buildChainIdIndex(chains);

  const lookbackBlocks = Number(CONFIG?.BRIDGE?.LOOKBACK_BLOCKS || 60000);
  const perChain = Object.entries(chains).map(async ([chainKey, cfg]) => {
    try {
      const provider = await getReadOnlyProviderForNetwork(cfg);
      const toBlock = await provider.getBlockNumber();
      const chainId = Number(cfg?.CHAIN_ID);
      const resolvedChain = resolveChainConfig(chainId, chainConfig);
      const deploymentBlock = Number(resolvedChain?.deploymentBlock);
      const fallbackFrom = Math.max(0, toBlock - lookbackBlocks);
      const fromBlock =
        Number.isFinite(deploymentBlock) && deploymentBlock > 0 && deploymentBlock <= toBlock
          ? Math.min(deploymentBlock, fallbackFrom)
          : fallbackFrom;
      const address = resolvedChain?.contractAddress || contracts?.[chainKey];
      if (!address) return { chainKey, bridgedOut: [], relinquished: [], error: '' };

      const bridgedOutLogs = await getLogsChunked(
        provider,
        { address, topics: [bridgedOutTopic] },
        fromBlock,
        toBlock,
        3000
      );

      const relinquishedLogs = await getLogsChunked(
        provider,
        { address, topics: [relinquishedTopic] },
        fromBlock,
        toBlock,
        3000
      );

      const bridgedOut = bridgedOutLogs
        .map((log) => {
          try {
            const parsed = iface.parseLog(log);
            return {
              chainKey,
              txHash: log.transactionHash,
              from: parsed.args?.from,
              amount: parsed.args?.amount,
              targetAddress: parsed.args?.targetAddress,
              targetChainId: Number(parsed.args?.chainId),
              timestamp: Number(parsed.args?.timestamp),
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const relinquished = relinquishedLogs
        .map((log) => {
          try {
            const parsed = iface.parseLog(log);
            return {
              chainKey,
              txHash: log.transactionHash,
              to: parsed.args?.to,
              amount: parsed.args?.amount,
              timestamp: Number(parsed.args?.timestamp),
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return { chainKey, bridgedOut, relinquished, error: '' };
    } catch (error) {
      const msg = error?.reason || error?.message || String(error);
      return { chainKey, bridgedOut: [], relinquished: [], error: msg };
    }
  });

  const results = await Promise.all(perChain);
  const errors = results.map((r) => r.error).filter(Boolean);
  const hasData = results.some((r) => (r.bridgedOut || []).length > 0 || (r.relinquished || []).length > 0);
  if (!hasData && errors.length) {
    throw new Error(errors.join(' | '));
  }
  const bridgedOutAll = results.flatMap((r) => r.bridgedOut || []);
  const relinquishedAll = results.flatMap((r) => r.relinquished || []);

  const relinquishedIndex = new Map();
  for (const ev of relinquishedAll) {
    const key = `${ev.chainKey}|${safeLowerHex(ev.to)}|${toBigNumber(ev.amount)?.toString() || ''}`;
    const list = relinquishedIndex.get(key) || [];
    list.push(ev);
    relinquishedIndex.set(key, list);
  }

  for (const list of relinquishedIndex.values()) {
    list.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  }

  const usedReceipts = new Set();
  let rows = await Promise.all(
    bridgedOutAll.map(async (ev) => {
      const destChainKey = chainIdIndex.get(Number(ev.targetChainId)) || null;
      const destName = destChainKey ? chains?.[destChainKey]?.NAME : `Chain ${ev.targetChainId}`;
      const srcName = chains?.[ev.chainKey]?.NAME || ev.chainKey;

      const amountKey = toBigNumber(ev.amount)?.toString() || '';
      const matchKey = destChainKey
        ? `${destChainKey}|${safeLowerHex(ev.targetAddress)}|${amountKey}`
        : null;
      const candidates = matchKey ? relinquishedIndex.get(matchKey) || [] : [];
      const receipt = candidates.find(
        (c) => Number(c.timestamp || 0) >= Number(ev.timestamp || 0) && !usedReceipts.has(c.txHash)
      );
      if (receipt?.txHash) usedReceipts.add(receipt.txHash);

      let status = receipt?.txHash ? 'Completed' : 'Pending';

      if (!receipt?.txHash) {
        const chainCfg = chains?.[ev.chainKey];
        if (chainCfg) {
          try {
            const provider = await getReadOnlyProviderForNetwork(chainCfg);
            const receiptData = await fetchTransactionReceipt(provider, ev.txHash);
            if (receiptData) {
              if (receiptData.status === 1) {
                status = 'Completed';
              } else if (receiptData.status === 0) {
                status = 'Failed';
              }
            }
          } catch {}
        }
      }

      return {
        id: ev.txHash,
        srcChainKey: ev.chainKey,
        dstChainKey: destChainKey,
        srcName,
        dstName: destName,
        from: ev.from,
        amount: ev.amount,
        timestamp: ev.timestamp,
        txHash: ev.txHash,
        receiptTxHash: receipt?.txHash || '',
        status,
        type: 1,
      };
    })
  );

  rows = rows.sort(sortByTimestampDesc).slice(0, Number(limit || 200));

  return rows;
}

async function loadTransactionsData({ limit = 200 } = {}) {
  return await loadTransactionsFromCoordinator({ limit });
}

export class TransactionsTab {
  constructor() {
    this.panel = null;
    this.refreshBtn = null;
    this.statusEl = null;
    this.searchInput = null;
    this.totalEl = null;
    this.tableBody = null;
    this._isLoading = false;
    this._rows = [];
    this._refreshTimer = null;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="transactions"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="tx-header card">
        <div class="tx-header-row">
          <div>
            <div class="tx-title">Search Transactions</div>
            <div class="muted" data-tx-status>Load recent bridge transactions from Polygon and BSC.</div>
          </div>
          <div class="tx-header-actions">
            <div class="tx-total"><span class="tx-total-label">Total Transactions:</span> <strong data-tx-total>0</strong></div>
            <button type="button" class="btn btn--icon" title="Refresh" data-tx-refresh aria-label="Refresh transactions">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M20 4v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="tx-search">
          <div class="tx-search-prefix">Transaction ID</div>
          <input class="field-input tx-search-input" type="text" placeholder="Enter transaction ID..." data-tx-search />
        </div>
      </div>

      <div class="card tx-table-card">
        <div class="tx-table-wrap">
          <table class="tx-table">
            <thead>
              <tr>
                <th>TRANSACTION</th>
                <th>SENDER</th>
                <th>VALUE</th>
                <th>CHAIN → CHAIN</th>
                <th>TYPE</th>
                <th>STATUS</th>
                <th>ISSUED</th>
                <th>RECEIPT</th>
              </tr>
            </thead>
            <tbody data-tx-body>
              <tr><td colspan="8" class="tx-muted tx-center">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.refreshBtn = this.panel.querySelector('[data-tx-refresh]');
    this.statusEl = this.panel.querySelector('[data-tx-status]');
    this.searchInput = this.panel.querySelector('[data-tx-search]');
    this.totalEl = this.panel.querySelector('[data-tx-total]');
    this.tableBody = this.panel.querySelector('[data-tx-body]');

    this.refreshBtn?.addEventListener('click', () => this.refresh());
    this.searchInput?.addEventListener('input', () => this.render());

    document.addEventListener('tabActivated', (e) => {
      if (e?.detail?.tabName === 'transactions') {
        if (e?.detail?.isFirstActivation) this.refresh();
        this._startIssuedTicker();
      }
    });

    document.addEventListener('tabDeactivated', (e) => {
      if (e?.detail?.tabName === 'transactions') this._stopIssuedTicker();
    });
  }

  async refresh() {
    if (this._isLoading) return;
    this._isLoading = true;
    this._setLoading(true);
    this._setStatus('Loading recent transactions...');

    try {
      this._rows = await loadTransactionsData({ limit: 250 });
      this.render();
      this._setStatus('Transactions updated.');
    } catch (error) {
      this._rows = [];
      this.render();
      this._setStatus(error?.message || 'Failed to load transactions.');
    } finally {
      this._isLoading = false;
      this._setLoading(false);
    }
  }

  render() {
    if (!this.panel || !this.tableBody) return;
    const q = String(this.searchInput?.value || '').trim().toLowerCase();

    const filtered = q
      ? this._rows.filter((r) => {
          const a = String(r.txHash || '').toLowerCase();
          const b = String(r.receiptTxHash || '').toLowerCase();
          return a.includes(q) || b.includes(q);
        })
      : this._rows;

    if (this.totalEl) this.totalEl.textContent = String(filtered.length);

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `<tr><td colspan="8" class="tx-muted tx-center">No transactions found.</td></tr>`;
      return;
    }

    const symbol = CONFIG?.TOKEN?.SYMBOL || 'LIB';
    const decimals = Number(CONFIG?.TOKEN?.DECIMALS || 18);

    this.tableBody.innerHTML = filtered
      .map((row) => {
        const tx = renderTxLink(row.srcChainKey, row.txHash);
        const sender = renderAddress(row.from);
        const value = formatTokenAmount(row.amount, decimals, symbol);
        const route = renderChainRoute(row.srcChainKey, row.dstChainKey, row.srcName, row.dstName);
        const typeLabel =
          row.type === 0 ? 'Bridge In' : row.type === 1 ? 'Bridge Out' : row.type === 2 ? 'Bridge Vault' : 'Unknown';
        const type = `<span class="tx-type">${typeLabel}</span>`;
        const status = renderStatus(row.status);
        const issued = `<span class="tx-muted">${formatRelativeTime(row.timestamp)}</span>`;
        const receipt = row.receiptTxHash ? renderTxLink(row.dstChainKey, row.receiptTxHash) : '<span class="tx-muted">--</span>';

        return `
          <tr>
            <td class="tx-cell-mono">${tx}</td>
            <td class="tx-cell-mono">${sender}</td>
            <td><strong>${value}</strong></td>
            <td>${route}</td>
            <td>${type}</td>
            <td>${status}</td>
            <td>${issued}</td>
            <td class="tx-cell-mono">${receipt}</td>
          </tr>
        `;
      })
      .join('');
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = String(text || '');
  }

  _setLoading(isLoading) {
    if (this.refreshBtn) this.refreshBtn.disabled = !!isLoading;
  }

  _startIssuedTicker() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => this.render(), 60000);
  }

  _stopIssuedTicker() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }
}

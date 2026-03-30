import { CONFIG } from '../config.js';
import { getReadOnlyProviderForNetwork } from '../utils/read-only-provider.js';
import { getObserverBaseUrl } from '../utils/observer-url.js';
import { RefreshButton } from './refresh-button.js';

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

function getExplorer(chainKey) {
  if (!chainKey) return '';
  const base = CONFIG.BRIDGE.CHAINS[chainKey].BLOCK_EXPLORER;
  return String(base).replace(/\/$/, '');
}

function linkTx(chainKey, txHash) {
  if (!chainKey) return '';
  const explorer = getExplorer(chainKey);
  const canonical = canonicalizeTxHash(txHash);
  if (!explorer || !canonical) return '';
  return `${explorer}/tx/${canonical}`;
}

async function fetchAbi() {
  const abiPath = CONFIG.BRIDGE.CONTRACTS.SOURCE.ABI_PATH;
  const response = await fetch(abiPath, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Failed to load ABI (${abiPath}): ${response.status}`);
  const json = await response.json();
  const abi = Array.isArray(json) ? json : json?.abi;
  if (!Array.isArray(abi)) throw new Error('Invalid ABI format');
  return abi;
}

function buildChainIdIndex(chains) {
  const map = new Map();
  for (const [key, cfg] of Object.entries(chains || {})) {
    const id = cfg?.CHAIN_ID;
    if (Number.isInteger(id) && id > 0) map.set(id, key);
  }
  return map;
}

function sortByTimestampDesc(a, b) {
  const at = Number(a?.timestamp || 0);
  const bt = Number(b?.timestamp || 0);
  if (bt !== at) return bt - at;
  return String(b?.txHash || '').localeCompare(String(a?.txHash || ''));
}

export function normalizeTxHash(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  return v.startsWith('0x') ? v.slice(2) : v;
}

export const TRANSACTION_STATUS = Object.freeze({
  PENDING: 0,
  PROCESSING: 1,
  COMPLETED: 2,
  FAILED: 3,
  REVERTED: 4,
});

function canonicalizeTxHash(value) {
  const normalized = normalizeTxHash(value);
  return normalized ? `0x${normalized}` : '';
}

export function isPendingStatus(status) {
  const num = Number(status);
  if (num === TRANSACTION_STATUS.PENDING || num === TRANSACTION_STATUS.PROCESSING) return true;
  const s = String(status || '').toLowerCase();
  return s === 'pending' || s === 'processing';
}

function mergeTransactionRow(base, incoming) {
  if (!base) return incoming;
  if (!incoming) return base;

  const merged = { ...base };
  const baseStatus = String(base.status || '');
  const incomingStatus = String(incoming.status || '');
  const baseIsPending = isPendingStatus(base.status);
  const incomingIsPending = isPendingStatus(incoming.status);

  if (!merged.receiptTxHash && incoming.receiptTxHash) merged.receiptTxHash = incoming.receiptTxHash;
  if (baseIsPending && !incomingIsPending && incomingStatus) merged.status = incoming.status;
  if (!merged.dstChainKey && incoming.dstChainKey) merged.dstChainKey = incoming.dstChainKey;
  if (!merged.dstName && incoming.dstName) merged.dstName = incoming.dstName;
  if (!merged.from && incoming.from) merged.from = incoming.from;
  if (!merged.amount && incoming.amount) merged.amount = incoming.amount;
  if (!Number.isFinite(Number(merged.timestamp)) && Number.isFinite(Number(incoming.timestamp))) merged.timestamp = incoming.timestamp;

  return merged;
}

export function mergeTransactions(primary, secondary, { limit = 500 } = {}) {
  const map = new Map();
  for (const row of [...(primary || []), ...(secondary || [])]) {
    const key = normalizeTxHash(row?.txHash);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, row);
      continue;
    }
    map.set(key, mergeTransactionRow(map.get(key), row));
  }
  return Array.from(map.values()).sort(sortByTimestampDesc).slice(0, Number(limit || 500));
}

function renderTxLink(chainKey, txHash) {
  if (!txHash) return '<span class="tx-muted">--</span>';
  const raw = normalizeTxHash(txHash) || String(txHash || '');
  const url = linkTx(chainKey, raw);
  const label = shortenAny(raw, { head: 4, tail: 4 });
  if (!url) return `<code class="tx-code">${label}</code>`;
  return `<a class="tx-link" href="${url}" target="_blank" rel="noopener"><code class="tx-code">${label}</code><span class="tx-ext">↗</span></a>`;
}

function renderAddress(address) {
  if (!address) return '<span class="tx-muted">--</span>';
  const label = shortenAddress(address);
  const fullAddress = String(address);
  return `
    <button
      type="button"
      class="tx-address-copy"
      data-copy-address
      data-address="${fullAddress}"
      title="${fullAddress}"
      aria-label="Copy sender address ${fullAddress}"
    >
      <code class="tx-code" title="${fullAddress}">${label}</code>
    </button>
  `;
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
  if (num === TRANSACTION_STATUS.COMPLETED) return `<span class="tx-status tx-status--ok">Completed</span>`;
  if (num === TRANSACTION_STATUS.PROCESSING) return `<span class="tx-status tx-status--pending">Processing</span>`;
  if (num === TRANSACTION_STATUS.PENDING) return `<span class="tx-status tx-status--pending">Pending</span>`;
  if (num === TRANSACTION_STATUS.FAILED || num === TRANSACTION_STATUS.REVERTED) return `<span class="tx-status tx-status--error">error</span>`;
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return `<span class="tx-status tx-status--ok">Completed</span>`;
  if (s === 'pending') return `<span class="tx-status tx-status--pending">Pending</span>`;
  if (s === 'processing') return `<span class="tx-status tx-status--pending">Processing</span>`;
  if (s === 'failed' || s === 'reverted') return `<span class="tx-status tx-status--error">error</span>`;
  return `<span class="tx-status tx-status--unknown">Unknown</span>`;
}

function mapObserverTransaction(tx, chains, chainIdIndex) {
  const type = Number(tx?.type);
  const chainId = Number(tx?.chainId);
  const destinationChainId = chains.DESTINATION.CHAIN_ID;
  let srcChainId;
  let dstChainId;

  switch (type) {
    case 0:
      srcChainId = 0;
      dstChainId = chainId;
      break;
    case 1:
      srcChainId = chainId;
      dstChainId = 0;
      break;
    case 2:
      srcChainId = chainId;
      dstChainId = destinationChainId;
      break;
    default:
      srcChainId = chainId;
      dstChainId = 0;
      break;
  }

  const srcChainKey = chainIdIndex.get(srcChainId) || null;
  const dstChainKey = chainIdIndex.get(dstChainId) || null;
  const rawTimestamp = Number(tx?.txTimestamp || 0);
  const timestamp = rawTimestamp > 1e12 ? Math.floor(rawTimestamp / 1000) : rawTimestamp;

  return {
    id: normalizeTxHash(tx?.txId),
    srcChainKey,
    dstChainKey,
    srcName: srcChainId === 0 ? 'Liberdus Network' : chains[srcChainKey]?.NAME || `Chain ${srcChainId}`,
    dstName: dstChainId === 0 ? 'Liberdus Network' : chains[dstChainKey]?.NAME || `Chain ${dstChainId}`,
    from: tx?.sender,
    amount: tx?.value,
    timestamp,
    txHash: normalizeTxHash(tx?.txId),
    receiptTxHash: normalizeTxHash(tx?.receiptId),
    status: tx?.status,
    type,
  };
}

async function loadTransactionsFromObserver({ limit = 200 } = {}) {
  const chains = CONFIG.BRIDGE.CHAINS;
  const chainIdIndex = buildChainIdIndex(chains);
  const observerUrl = getObserverBaseUrl(CONFIG);

  const allTransactions = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetch(`${observerUrl}/transaction?page=${page}`);
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
    .map((tx) => mapObserverTransaction(tx, chains, chainIdIndex))
    .sort(sortByTimestampDesc)
    .slice(0, Number(limit || 200));

  return rows;
}

export class TransactionsTab {
  constructor() {
    this.panel = null;
    this.refreshBtn = null;
    this.searchInput = null;
    this.totalEl = null;
    this.tableBody = null;
    this._rows = [];
    this._refreshTimer = null;
    this.page = 1;
    this.pageSize = 10;
    this.prevBtn = null;
    this.nextBtn = null;
    this.pageInfoEl = null;
    this.pageSizeEl = null;
    this._bridgeListenerBound = false;
    this._bridgeOutWatchInit = false;
    this._bridgeOutWatchStarting = false;
    this._bridgeOutProvider = null;
    this._bridgeOutFilter = null;
    this._bridgeOutHandler = null;
    this._seenBridgeOutTx = new Set();
    this._bridgeOutWatchRetryTimer = null;
    this.onlyMine = false;
    this.onlyMineCheckbox = null;
    this._pendingPollerTimer = null;
    this._pendingOnlyMineDefault = false;
    this.refreshControl = new RefreshButton({
      ariaLabel: 'Refresh transactions',
      attributes: { 'data-tx-refresh': '' },
      onRefresh: () => this._runRefresh(),
    });
  }

  load() {
    setTimeout(() => {
      if (this._rows.length === 0) this.refresh();
    }, 0);

    this.panel = document.querySelector('.tab-panel[data-panel="transactions"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="tx-header card">
        <div class="tx-header-row">
          <div>
            <div class="tx-title">Search Transactions</div>
          </div>
          <div class="tx-header-actions">
            <div class="tx-total"><span class="tx-total-label">Total Transactions:</span> <strong data-tx-total>0</strong></div>
            ${this.refreshControl.render()}
          </div>
        </div>

        <div class="tx-search">
          <input class="field-input tx-search-input" type="text" placeholder="Enter transaction ID..." data-tx-search />
        </div>
        <div class="tx-filters">
          <label class="field-checkbox" data-tx-onlymine-label>
            <input type="checkbox" data-tx-onlymine />
            <span>Only my transactions</span>
          </label>
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
      <div class="tx-pager">
        <div class="tx-page-size">
          <label for="tx-page-size" class="sr-only">Page size</label>
          <select id="tx-page-size" data-tx-page-size class="field-input">
            <option value="10" selected>10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <div class="tx-page-controls">
          <button type="button" class="btn" data-tx-prev>Prev</button>
          <span class="tx-page-info" data-tx-page-info>Page 1 of 1</span>
          <button type="button" class="btn" data-tx-next>Next</button>
        </div>
      </div>
    `;

    this.refreshBtn = this.panel.querySelector('[data-tx-refresh]');
    this.searchInput = this.panel.querySelector('[data-tx-search]');
    this.totalEl = this.panel.querySelector('[data-tx-total]');
    this.tableBody = this.panel.querySelector('[data-tx-body]');
    this.prevBtn = this.panel.querySelector('[data-tx-prev]');
    this.nextBtn = this.panel.querySelector('[data-tx-next]');
    this.pageInfoEl = this.panel.querySelector('[data-tx-page-info]');
    this.pageSizeEl = this.panel.querySelector('[data-tx-page-size]');
    this.onlyMineCheckbox = this.panel.querySelector('[data-tx-onlymine]');
    this.onlyMineLabel = this.panel.querySelector('[data-tx-onlymine-label]');
    this._pendingOnlyMineDefault = !!window.walletManager?.isConnected?.();

    this.refreshControl.mount(this.refreshBtn);
    this.panel.addEventListener('click', (event) => this._handleClick(event));
    this.searchInput?.addEventListener('input', () => {
      this.page = 1;
      this.render();
    });
    this.prevBtn?.addEventListener('click', () => {
      this.page = Math.max(1, this.page - 1);
      this.render();
    });
    this.nextBtn?.addEventListener('click', () => {
      this.page = this.page + 1;
      this.render();
    });
    this.pageSizeEl?.addEventListener('change', () => {
      const v = Number(this.pageSizeEl.value);
      this.pageSize = Number.isFinite(v) && v > 0 ? v : 25;
      this.page = 1;
      this.render();
    });
    this.onlyMineCheckbox?.addEventListener('change', () => {
      this.onlyMine = !!this.onlyMineCheckbox.checked;
      this.page = 1;
      this._updateOnlyMineUI();
      this.render();
    });
    if (!this._bridgeListenerBound) {
      document.addEventListener('bridgeOutEvent', (e) => this._onBridgeOutEvent(e));
      this._bridgeListenerBound = true;
    }

    const armOnlyMineDefault = () => {
      this._pendingOnlyMineDefault = true;
      if (this._isActive()) {
        this._applyPendingOnlyMineDefault();
        return;
      }
      this._updateOnlyMineUI();
      if (this.onlyMine) this.render();
    };

    this._ensureBridgeOutWatch();
    window.addEventListener('beforeunload', () => this._teardownBridgeOutWatch());

    document.addEventListener('tabActivated', (e) => {
      if (e?.detail?.tabName === 'transactions') {
        this._applyPendingOnlyMineDefault();
        if (e?.detail?.isFirstActivation && this._rows.length === 0) {
          this.refresh();
        } else {
          this._checkPendingStatuses();
        }
        this._startIssuedTicker();
        this._startPendingPoller();
      }
    });

    document.addEventListener('tabDeactivated', (e) => {
      if (e?.detail?.tabName === 'transactions') {
        this._stopIssuedTicker();
        this._stopPendingPoller();
      }
    });

    document.addEventListener('walletConnected', armOnlyMineDefault);
    document.addEventListener('walletDisconnected', () => {
      this._pendingOnlyMineDefault = false;
      this.onlyMine = false;
      this.page = 1;
      this._updateOnlyMineUI();
      this.render();
    });
    document.addEventListener('walletAccountChanged', armOnlyMineDefault);
    this._updateOnlyMineUI();
  }

  async refresh() {
    return this.refreshControl.run();
  }

  async _runRefresh() {
    try {
      console.debug?.('[Transactions] Prefetch: starting');
    } catch {}

    try {
      const fetched = await loadTransactionsFromObserver({ limit: 250 });
      this._rows = mergeTransactions(fetched, this._rows, { limit: 500 });
      this.render();
      try {
        console.debug?.(`[Transactions] Prefetch: completed with ${this._rows.length} rows`);
      } catch {}
    } catch (error) {
      this.render();
      window.toastManager?.error?.(error?.message || 'Failed to load transactions.');
      try {
        console.debug?.('[Transactions] Prefetch: failed', error);
      } catch {}
    }
  }

  render() {
    if (!this.panel || !this.tableBody) return;
    const q = normalizeTxHash(this.searchInput?.value);

    const connected = !!window.walletManager?.isConnected?.();
    const addr = connected ? String(window.walletManager?.getAddress?.() || '').toLowerCase() : '';
    let filtered = this._rows;
    if (this.onlyMine) {
      if (connected && addr) filtered = filtered.filter((r) => String(r.from || '').toLowerCase() === addr);
    }
    if (q) {
      filtered = filtered.filter((r) => {
        const a = normalizeTxHash(r.txHash);
        const b = normalizeTxHash(r.receiptTxHash);
        return a.includes(q) || b.includes(q);
      });
    }

    if (this.totalEl) this.totalEl.textContent = String(filtered.length);

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `<tr><td colspan="8" class="tx-muted tx-center">No transactions found.</td></tr>`;
      if (this.pageInfoEl) this.pageInfoEl.textContent = 'Page 1 of 1';
      if (this.prevBtn) this.prevBtn.disabled = true;
      if (this.nextBtn) this.nextBtn.disabled = true;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
    if (this.page > totalPages) this.page = totalPages;
    if (this.page < 1) this.page = 1;
    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageRows = filtered.slice(start, end);
    if (this.pageInfoEl) this.pageInfoEl.textContent = `Page ${this.page} of ${totalPages}`;
    if (this.prevBtn) this.prevBtn.disabled = this.page <= 1;
    if (this.nextBtn) this.nextBtn.disabled = this.page >= totalPages;
    if (this.pageSizeEl) this.pageSizeEl.value = String(this.pageSize);

    const symbol = CONFIG?.TOKEN?.SYMBOL || 'LIB';
    const decimals = Number(CONFIG?.TOKEN?.DECIMALS || 18);

    this.tableBody.innerHTML = pageRows
      .map((row) => {
        const tx = renderTxLink(row.srcChainKey, row.txHash);
        const sender = renderAddress(row.from);
        const value = formatTokenAmount(row.amount, decimals, symbol);
        const route = renderChainRoute(row.srcChainKey, row.dstChainKey, row.srcName, row.dstName);
        let typeLabel;
        switch (row.type) {
          case 0:
            typeLabel = 'Bridge In';
            break;
          case 1:
            typeLabel = 'Bridge Out';
            break;
          case 2:
            typeLabel = 'Bridge Vault';
            break;
          default:
            typeLabel = 'Unknown';
            break;
        }
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

  _onBridgeOutEvent(e) {
    const d = e?.detail || null;
    if (!d) return;
    const txHash = normalizeTxHash(d.txHash);
    if (!txHash) return;
    const chains = CONFIG.BRIDGE.CHAINS;
    const chainIdIndex = buildChainIdIndex(chains);
    const srcChainKey = chainIdIndex.get(Number(d.sourceChainId)) || 'SOURCE';
    const dstChainKey = chainIdIndex.get(Number(d.targetChainId)) || null;
    const srcName = chains[srcChainKey].NAME;
    const dstName = dstChainKey ? chains[dstChainKey]?.NAME || `Chain ${d.targetChainId}` : `Chain ${d.targetChainId}`;
    const row = {
      id: txHash,
      srcChainKey,
      dstChainKey,
      srcName,
      dstName,
      from: d.from,
      amount: d.amount,
      timestamp: Number(d.timestamp || Math.floor(Date.now() / 1000)),
      txHash,
      receiptTxHash: '',
      status: TRANSACTION_STATUS.PENDING,
      type: 1,
    };
    const next = mergeTransactions([row], this._rows, { limit: 500 });
    this._rows = next;
    this.render();
  }

  async _ensureBridgeOutWatch() {
    if (this._bridgeOutWatchInit || this._bridgeOutWatchStarting) return;
    this._bridgeOutWatchStarting = true;

    try {
      const ethers = window.ethers;
      if (!ethers) return;

      const abi = await fetchAbi();
      const iface = new ethers.utils.Interface(abi);
      const bridgedOutTopic = iface.getEventTopic('BridgedOut');

      const chains = CONFIG.BRIDGE.CHAINS;
      const sourceCfg = chains.SOURCE;
      const address = CONFIG.BRIDGE.CONTRACTS.SOURCE.ADDRESS;

      const provider = await getReadOnlyProviderForNetwork(sourceCfg);
      const filter = { address, topics: [bridgedOutTopic] };

      const handler = (log) => {
        try {
          const parsed = iface.parseLog(log);
          const txHash = normalizeTxHash(log?.transactionHash);
          if (!txHash) return;
          const key = txHash;
          if (this._seenBridgeOutTx.has(key)) return;
          this._seenBridgeOutTx.add(key);
          if (this._seenBridgeOutTx.size > 2000) this._seenBridgeOutTx.clear();

          const chainsLocal = CONFIG.BRIDGE.CHAINS;
          const chainIdIndex = buildChainIdIndex(chainsLocal);
          const dstChainId = Number(parsed.args?.chainId);
          const dstChainKey = chainIdIndex.get(dstChainId) || null;
          const srcChainKey = 'SOURCE';
          const srcName = chainsLocal.SOURCE.NAME;
          const dstName = dstChainKey ? chainsLocal?.[dstChainKey]?.NAME || `Chain ${dstChainId}` : `Chain ${dstChainId}`;

          const row = {
            id: txHash,
            srcChainKey,
            dstChainKey,
            srcName,
            dstName,
            from: parsed.args?.from,
            amount: parsed.args?.amount,
            timestamp: Number(parsed.args?.timestamp || Math.floor(Date.now() / 1000)),
            txHash,
            receiptTxHash: '',
            status: TRANSACTION_STATUS.PENDING,
            type: 1,
          };

          const next = mergeTransactions([row], this._rows, { limit: 500 });
          this._rows = next;
          this.render();
        } catch {}
      };

      provider.on(filter, handler);
      this._bridgeOutProvider = provider;
      this._bridgeOutFilter = filter;
      this._bridgeOutHandler = handler;
      this._bridgeOutWatchInit = true;
      this._bridgeOutWatchStarting = false;
      if (this._bridgeOutWatchRetryTimer) {
        clearTimeout(this._bridgeOutWatchRetryTimer);
        this._bridgeOutWatchRetryTimer = null;
      }
    } catch {
      this._bridgeOutWatchStarting = false;
      this._scheduleBridgeOutWatchRetry();
    }
  }

  _teardownBridgeOutWatch() {
    try {
      const provider = this._bridgeOutProvider;
      const filter = this._bridgeOutFilter;
      const handler = this._bridgeOutHandler;
      if (provider && filter && handler) provider.off(filter, handler);
    } catch {}
    this._bridgeOutProvider = null;
    this._bridgeOutFilter = null;
    this._bridgeOutHandler = null;
    if (this._bridgeOutWatchRetryTimer) {
      clearTimeout(this._bridgeOutWatchRetryTimer);
      this._bridgeOutWatchRetryTimer = null;
    }
    this._bridgeOutWatchStarting = false;
    this._bridgeOutWatchInit = false;
  }

  _scheduleBridgeOutWatchRetry() {
    if (this._bridgeOutWatchRetryTimer) return;
    this._bridgeOutWatchRetryTimer = setTimeout(() => {
      this._bridgeOutWatchRetryTimer = null;
      this._ensureBridgeOutWatch();
    }, 15000);
  }

  _applyPendingOnlyMineDefault() {
    if (!this._pendingOnlyMineDefault) return;
    if (!window.walletManager?.isConnected?.()) return;

    this.onlyMine = true;
    this.page = 1;
    this._pendingOnlyMineDefault = false;
    this._updateOnlyMineUI();
    this.render();
  }

  _isActive() {
    return !!this.panel && this.panel.classList.contains('is-active') && !this.panel.hidden;
  }

  _updateOnlyMineUI() {
    const connected = !!window.walletManager?.isConnected?.();
    if (this.onlyMineCheckbox) {
      this.onlyMineCheckbox.checked = !!this.onlyMine;
      this.onlyMineCheckbox.disabled = !connected;
    }
    if (this.onlyMineLabel) {
      this.onlyMineLabel.hidden = !connected;
    }
  }

  async _handleClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const copyTrigger = target.closest('[data-copy-address]');
    if (!copyTrigger) return;

    const address = copyTrigger.getAttribute('data-address') || '';
    if (!address) return;

    const copied = await this._copy(address);
    if (!copied) {
      window.toastManager?.error?.('Failed to copy address');
      return;
    }

    copyTrigger.classList.add('success');
    setTimeout(() => copyTrigger.classList.remove('success'), 900);
    window.toastManager?.success?.('Address copied to clipboard', { timeoutMs: 1800 });
  }

  async _copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch {
        document.body.removeChild(ta);
        return false;
      }
    }
  }

  _startIssuedTicker() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => this.render(), 60000);
  }

  _stopIssuedTicker() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }

  _startPendingPoller() {
    if (this._pendingPollerTimer) return;
    this._pendingPollerTimer = setInterval(() => this._checkPendingStatuses(), 10000);
  }

  _stopPendingPoller() {
    if (this._pendingPollerTimer) {
      clearInterval(this._pendingPollerTimer);
      this._pendingPollerTimer = null;
    }
  }

  async _checkPendingStatuses() {
    const hasPending = this._rows.some((r) => isPendingStatus(r.status));
    if (!hasPending) return;

    try {
      const fetched = await loadTransactionsFromObserver({ limit: 50 });
      const before = JSON.stringify(this._rows);
      this._rows = mergeTransactions(fetched, this._rows, { limit: 500 });
      const after = JSON.stringify(this._rows);
      
      if (before !== after) {
        this.render();
      }
    } catch (error) {
      try {
        console.debug?.('[Transactions] Pending poll failed', error);
      } catch {}
    }
  }
}

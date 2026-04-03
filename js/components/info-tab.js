import { RefreshButton } from './refresh-button.js';
import { escapeHtml } from '../utils/helpers.js';
import { CONTRACT_KEYS, getContractMetadata } from '../contracts/contract-types.js';

export class InfoTab {
  constructor() {
    this.panel = null;
    this.refreshBtn = null;
    this._lastErrorToastMessageByContract = new Map();
    this.refreshControl = new RefreshButton({
      ariaLabel: 'Refresh contract info',
      attributes: { 'data-info-refresh': '' },
      onRefresh: () => this._runRefresh(),
    });
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="info"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="info-shell">
        <div class="panel-header info-hero">
          <div class="card-title-row info-hero-row">
            <h2>Contract Info</h2>
            ${this.refreshControl.render()}
          </div>
        </div>

        <div class="info-contracts">
          ${CONTRACT_KEYS.map((contractKey) => this._renderContractShell(contractKey)).join('')}
        </div>
      </div>
    `;

    this.refreshBtn = this.panel.querySelector('[data-info-refresh]');
    this.refreshControl.mount(this.refreshBtn);
    this.panel.addEventListener('click', (event) => this._handlePanelClick(event));

    document.addEventListener('contractManagerUpdated', () => {
      const snapshots = window.contractManager?.getStatusSnapshots?.();
      if (!snapshots) return;
      this.render(snapshots);
      this._notifyReadError(snapshots);
    });

    const snapshots = window.contractManager?.getStatusSnapshots?.();
    if (snapshots) {
      this.render(snapshots);
      this._notifyReadError(snapshots);
    }
  }

  async refresh() {
    return this.refreshControl.run();
  }

  async _runRefresh() {
    try {
      const contractManager = window.contractManager;
      if (!contractManager) {
        window.toastManager?.error?.('Contract manager is not available.', { timeoutMs: 4000 });
        return;
      }

      const snapshots = contractManager.refreshAllStatus
        ? await contractManager.refreshAllStatus({ reason: 'infoTabRefresh' })
        : { source: await contractManager.refreshStatus({ reason: 'infoTabRefresh' }) };
      this.render(snapshots);
      this._notifyReadError(snapshots);
    } catch (error) {
      const fallback = window.contractManager?.getStatusSnapshots?.();
      if (fallback) this.render(fallback);
      window.toastManager?.error?.(error?.message || 'Failed to refresh contract status.', { timeoutMs: 4000 });
    }
  }

  render(snapshots) {
    if (!snapshots || !this.panel) return;

    for (const contractKey of CONTRACT_KEYS) {
      const snapshot = snapshots[contractKey];
      if (!snapshot) continue;
      this._renderContract(contractKey, snapshot);
    }
  }

  _renderContract(contractKey, snapshot) {
    const meta = getContractMetadata(contractKey);
    this._setText(contractKey, 'network', snapshot.configuredNetworkName || '--');
    this._renderAddress(contractKey, 'contract-address', snapshot.configuredAddress || '--');
    this._renderAddress(contractKey, 'owner-address', snapshot.owner || '--');
    this._setText(contractKey, 'chain-id', this._valueOrDash(snapshot.onChainId ?? snapshot.onChainChainId));
    this._setText(contractKey, 'bridge-out-enabled', this._boolLabel(snapshot.bridgeOutEnabled));

    if (contractKey === 'destination') {
      this._renderAddress(contractKey, 'bridge-in-caller', snapshot.bridgeInCaller || '--');
      this._setText(contractKey, 'bridge-in-enabled', this._boolLabel(snapshot.bridgeInEnabled));
      this._setText(contractKey, 'max-bridge-in', this._formatTokenAmount(snapshot.maxBridgeInAmount));
      this._setText(contractKey, 'bridge-in-cooldown', this._formatSeconds(snapshot.bridgeInCooldown));
      this._setText(contractKey, 'min-bridge-out', this._formatTokenAmount(snapshot.minBridgeOutAmount));
      this._setText(contractKey, 'last-bridge-in', this._formatUnix(snapshot.lastBridgeInTime));
      this._setText(contractKey, 'token-symbol', this._valueOrDash(snapshot.symbol));
      this._setText(contractKey, 'total-supply', this._formatTokenAmount(snapshot.totalSupply));
    } else {
      this._renderAddress(contractKey, 'token-address', snapshot.token || '--');
      this._setText(contractKey, 'vault-halted', this._boolLabel(snapshot.halted));
      this._setText(contractKey, 'max-bridge-out', this._formatTokenAmount(snapshot.maxBridgeOutAmount));
      this._setText(contractKey, 'vault-balance', this._formatTokenAmount(snapshot.vaultBalance));
    }

    this._renderSignersMeta(contractKey, snapshot.requiredSignatures, snapshot.signers || [], snapshot.operationDeadlineSeconds);
    this._renderSigners(contractKey, snapshot.signers || []);
  }

  _renderContractShell(contractKey) {
    const meta = getContractMetadata(contractKey);
    const summaryFields = contractKey === 'destination'
      ? [
          this._kvHtml(contractKey, 'Network', 'network'),
          this._kvHtml(contractKey, 'Chain ID', 'chain-id'),
          this._kvHtml(contractKey, 'Bridge In Enabled', 'bridge-in-enabled'),
          this._kvHtml(contractKey, 'Bridge Out Enabled', 'bridge-out-enabled'),
          this._kvHtml(contractKey, 'Max Bridge In Amount', 'max-bridge-in'),
          this._kvHtml(contractKey, 'Bridge In Cooldown', 'bridge-in-cooldown'),
          this._kvHtml(contractKey, 'Min Bridge Out Amount', 'min-bridge-out'),
          this._kvHtml(contractKey, 'Last Bridge In', 'last-bridge-in'),
          this._kvHtml(contractKey, 'Contract Address', 'contract-address', { address: true }),
          this._kvHtml(contractKey, 'Bridge In Caller', 'bridge-in-caller', { address: true }),
          this._kvHtml(contractKey, 'Owner', 'owner-address', { address: true }),
          this._kvHtml(contractKey, 'Token Symbol', 'token-symbol'),
          this._kvHtml(contractKey, 'Total Supply', 'total-supply'),
        ]
      : [
          this._kvHtml(contractKey, 'Network', 'network'),
          this._kvHtml(contractKey, 'Vault Chain ID', 'chain-id'),
          this._kvHtml(contractKey, 'Bridge Out Enabled', 'bridge-out-enabled'),
          this._kvHtml(contractKey, 'Vault Halted', 'vault-halted'),
          this._kvHtml(contractKey, 'Max Bridge Out Amount', 'max-bridge-out'),
          this._kvHtml(contractKey, 'Vault Balance', 'vault-balance'),
          this._kvHtml(contractKey, 'Contract Address', 'contract-address', { address: true }),
          this._kvHtml(contractKey, 'Token Address', 'token-address', { address: true }),
          this._kvHtml(contractKey, 'Owner', 'owner-address', { address: true }),
        ];

    return `
      <section class="info-contract-section" data-info-contract="${meta.key}">
        <div class="card-title-row info-contract-header">
          <div>
            <div class="card-title">${escapeHtml(meta.label)}</div>
            <div class="muted">On-chain configuration and multisig state</div>
          </div>
        </div>
        <div class="info-layout">
          <div class="card info-card info-card--summary">
            <div class="kv-grid info-kv-grid">
              ${summaryFields.join('')}
            </div>
          </div>

          <div class="card info-card info-card--signers">
            <div class="card-title-row info-signers-header">
              <div class="card-title" data-info-field="${meta.key}:signers-title">Signers</div>
              <div class="info-signers-subtitle" data-info-field="${meta.key}:signers-subtitle">Multisig participants</div>
            </div>
            <div class="info-signers-grid" data-info-field="${meta.key}:signers">
              <div class="param-row muted">No signer data returned.</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  _kvHtml(contractKey, label, field, { address = false } = {}) {
    return `
      <div class="kv">
        <div class="kv-label">${escapeHtml(label)}</div>
        <div class="kv-value">
          ${address
            ? `
              <div class="param-address">
                <code data-info-field="${contractKey}:${field}">--</code>
                <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
              </div>
            `
            : `<div data-info-field="${contractKey}:${field}">--</div>`}
        </div>
      </div>
    `;
  }

  _renderSignersMeta(contractKey, requiredSignatures, signers, operationDeadlineSeconds) {
    const titleEl = this._fieldElement(contractKey, 'signers-title');
    const subtitleEl = this._fieldElement(contractKey, 'signers-subtitle');
    if (!titleEl) return;

    const total = Array.isArray(signers) ? signers.length : 0;
    const required = Number(requiredSignatures);
    if (Number.isFinite(required) && required > 0 && total > 0) {
      titleEl.textContent = `Signers (${required} of ${total} required)`;
    } else {
      titleEl.textContent = 'Signers';
    }

    if (!subtitleEl) return;

    const approvalWindow = this._formatOperationDeadline(operationDeadlineSeconds);
    subtitleEl.textContent =
      approvalWindow && approvalWindow !== '--'
        ? `Approval window ${approvalWindow}`
        : '';
  }

  _renderSigners(contractKey, signers) {
    const listEl = this._fieldElement(contractKey, 'signers');
    if (!listEl) return;

    if (!Array.isArray(signers) || signers.length === 0) {
      listEl.innerHTML = '<div class="param-row muted">No signer data returned.</div>';
      return;
    }

    listEl.innerHTML = signers
      .map((address, index) => {
        const display = this._shortenAddress(address);
        const safeAddress = this._escapeHtml(address);
        const safeDisplay = this._escapeHtml(display);
        return `
          <div class="info-signer-card">
            <div class="info-signer-meta">
              <span class="info-signer-index">Signer ${index + 1}</span>
            </div>
            <div class="param-address info-signer-address">
              <code title="${safeAddress}">${safeDisplay}</code>
              <button type="button" class="copy-inline" data-copy-address data-address="${safeAddress}">Copy</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  _fieldElement(contractKey, field) {
    return this.panel?.querySelector(`[data-info-field="${contractKey}:${field}"]`);
  }

  _renderAddress(contractKey, field, address) {
    const wrapper = this._fieldElement(contractKey, field)?.closest('.param-address');
    if (!wrapper) return;

    const codeEl = wrapper.querySelector('code');
    const copyBtn = wrapper.querySelector('[data-copy-address]');

    if (codeEl) {
      const display = this._shortenAddress(address);
      codeEl.textContent = display || '--';
      codeEl.setAttribute('title', address || '');
    }
    if (copyBtn) copyBtn.setAttribute('data-address', address && address !== '--' ? address : '');
  }

  async _handlePanelClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const copyBtn = target.closest('[data-copy-address]');
    if (!copyBtn) return;

    const address = copyBtn.getAttribute('data-address');
    if (!address) return;

    const copied = await this._copy(address);
    if (!copied) return;

    copyBtn.classList.add('success');
    setTimeout(() => copyBtn.classList.remove('success'), 900);
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

  _setText(contractKey, field, text) {
    const el = this._fieldElement(contractKey, field);
    if (el) el.textContent = text;
  }

  _valueOrDash(value) {
    return value == null || value === '' ? '--' : String(value);
  }

  _boolLabel(value) {
    if (value == null) return '--';
    return value ? 'Yes' : 'No';
  }

  _formatTokenAmount(value) {
    if (value == null) return '--';

    try {
      if (window.ethers?.utils?.formatUnits) {
        const decimals = Number(window.CONFIG?.TOKEN?.DECIMALS ?? 18);
        const symbol = window.CONFIG?.TOKEN?.SYMBOL || 'TOKEN';
        const formatted = window.ethers.utils.formatUnits(value, Number.isFinite(decimals) ? decimals : 18);
        return `${this._trimDecimals(formatted)} ${symbol}`;
      }
    } catch {
      // Fall back to raw value below.
    }

    return `${String(value)} (raw)`;
  }

  _formatOperationDeadline(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return '--';
    const days = Math.floor(n / 86400);
    const hours = Math.floor((n % 86400) / 3600);
    const mins = Math.floor((n % 3600) / 60);
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins || !parts.length) parts.push(`${mins}m`);
    return `${parts.join(' ')} (${n}s)`;
  }

  _formatSeconds(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return '--';
    if (n === 0) return '0s';
    const mins = Math.floor(n / 60);
    const secs = n % 60;
    if (mins && secs) return `${mins}m ${secs}s`;
    if (mins) return `${mins}m`;
    return `${secs}s`;
  }

  _formatUnix(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return '--';
    try {
      return new Date(n * 1000).toLocaleString();
    } catch {
      return String(seconds);
    }
  }

  _trimDecimals(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  _shortenHex(value, head = 4, tail = 4) {
    const s = String(value || '');
    if (!s.startsWith('0x') || s.length <= head + tail + 2) return s || '--';
    return `${s.slice(0, 2 + head)}...${s.slice(-tail)}`;
  }

  _shortenAddress(value) {
    return this._shortenHex(value, 4, 4);
  }

  _escapeHtml(value) {
    return escapeHtml(value);
  }

  _notifyReadError(snapshots) {
    for (const contractKey of CONTRACT_KEYS) {
      const snapshot = snapshots?.[contractKey];
      const label = getContractMetadata(contractKey).label;
      const message = snapshot?.error ? `${label} read warning: ${snapshot.error}` : null;
      if (!message) {
        this._lastErrorToastMessageByContract.delete(contractKey);
        continue;
      }
      if (message === this._lastErrorToastMessageByContract.get(contractKey)) continue;
      this._lastErrorToastMessageByContract.set(contractKey, message);
      window.toastManager?.error?.(message, { timeoutMs: 4000 });
    }
  }
}

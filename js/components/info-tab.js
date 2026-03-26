import { RefreshButton } from './refresh-button.js';
import { escapeHtml } from '../utils/helpers.js';

export class InfoTab {
  constructor() {
    this.panel = null;
    this.refreshBtn = null;
    this._lastErrorToastMessage = null;
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

        <div class="info-layout">
          <div class="card info-card info-card--summary">
            <div class="kv-grid info-kv-grid">
            <div class="kv">
              <div class="kv-label">Vault Chain ID</div>
              <div class="kv-value" data-info-chain-id>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Bridge Out Enabled</div>
              <div class="kv-value" data-info-bridge-enabled>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Vault Halted</div>
              <div class="kv-value" data-info-vault-halted>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Max Bridge Out Amount</div>
              <div class="kv-value" data-info-max-bridge-out>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Vault Balance</div>
              <div class="kv-value" data-info-vault-balance>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Contract Address</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-info-contract-address>--</code>
                  <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
                </div>
              </div>
            </div>

            <div class="kv">
              <div class="kv-label">Token Address</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-info-token-address>--</code>
                  <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
                </div>
              </div>
            </div>

            <div class="kv">
              <div class="kv-label">Owner</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-info-owner-address>--</code>
                  <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div class="card info-card info-card--signers">
            <div class="card-title-row info-signers-header">
              <div class="card-title" data-info-signers-title>Signers</div>
              <div class="info-signers-subtitle" data-info-signers-subtitle>Multisig participants</div>
            </div>
            <div class="info-signers-grid" data-info-signers>
              <div class="param-row muted">No signer data returned.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.refreshBtn = this.panel.querySelector('[data-info-refresh]');

    this.refreshControl.mount(this.refreshBtn);
    this.panel.addEventListener('click', (event) => this._handlePanelClick(event));

    document.addEventListener('contractManagerUpdated', () => {
      const snapshot = window.contractManager?.getStatusSnapshot?.();
      if (!snapshot) return;
      this.render(snapshot);
      this._notifyReadError(snapshot);
    });

    const snapshot = window.contractManager?.getStatusSnapshot?.();
    if (snapshot) {
      this.render(snapshot);
      this._notifyReadError(snapshot);
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

      const snapshot = await contractManager.refreshStatus({ reason: 'infoTabRefresh' });
      this.render(snapshot);
      this._notifyReadError(snapshot);
    } catch (error) {
      const fallback = contractManager.getStatusSnapshot?.();
      if (fallback) this.render(fallback);
      window.toastManager?.error?.(error?.message || 'Failed to refresh contract status.', { timeoutMs: 4000 });
    }
  }

  render(snapshot) {
    if (!snapshot || !this.panel) return;

    this._renderAddress('[data-info-contract-address]', snapshot.configuredAddress || '--');
    this._renderAddress('[data-info-token-address]', snapshot.token || '--');
    this._renderAddress('[data-info-owner-address]', snapshot.owner || '--');

    this._setText('[data-info-chain-id]', this._valueOrDash(snapshot.onChainId ?? snapshot.onChainChainId));
    this._setText('[data-info-bridge-enabled]', this._boolLabel(snapshot.bridgeOutEnabled));
    this._setText('[data-info-vault-halted]', this._boolLabel(snapshot.halted));
    this._setText('[data-info-max-bridge-out]', this._formatTokenAmount(snapshot.maxBridgeOutAmount));
    this._setText('[data-info-vault-balance]', this._formatTokenAmount(snapshot.vaultBalance));

    this._renderSignersMeta(snapshot.requiredSignatures, snapshot.signers || [], snapshot.operationDeadlineSeconds);
    this._renderSigners(snapshot.signers || []);
  }

  _renderSignersMeta(requiredSignatures, signers, operationDeadlineSeconds) {
    const titleEl = this.panel?.querySelector('[data-info-signers-title]');
    const subtitleEl = this.panel?.querySelector('[data-info-signers-subtitle]');
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

  _renderSigners(signers) {
    const listEl = this.panel?.querySelector('[data-info-signers]');
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

  _renderAddress(selector, address) {
    const wrapper = this.panel?.querySelector(selector)?.closest('.param-address');
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

  _setText(selector, text) {
    const el = this.panel?.querySelector(selector);
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

  _notifyReadError(snapshot) {
    const message = snapshot?.error ? `Contract read warning: ${snapshot.error}` : null;
    if (!message) {
      this._lastErrorToastMessage = null;
      return;
    }
    if (message === this._lastErrorToastMessage) return;
    this._lastErrorToastMessage = message;
    window.toastManager?.error?.(message, { timeoutMs: 4000 });
  }
}

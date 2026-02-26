export class ContractTab {
  constructor() {
    this.panel = null;
    this.refreshBtn = null;
    this.statusEl = null;
    this._isLoading = false;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="contract"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="panel-header">
        <div class="card-title-row">
          <h2>Contract</h2>
          <button type="button" class="btn btn--ghost btn--footer" data-contract-refresh>Refresh</button>
        </div>
        <p class="muted" data-contract-status>Loading contract status...</p>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-title">Vault Status</div>
          <div class="kv-grid">
            <div class="kv kv--full">
              <div class="kv-label">Configured Address</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-contract-address>--</code>
                  <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
                </div>
              </div>
            </div>

            <div class="kv">
              <div class="kv-label">Configured Chain ID</div>
              <div class="kv-value" data-config-chain-id>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">On-Chain chainId()</div>
              <div class="kv-value" data-onchain-chain-id-view>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">On-Chain getChainId()</div>
              <div class="kv-value" data-onchain-chain-id>--</div>
            </div>

            <div class="kv kv--full">
              <div class="kv-label">Token Address</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-token-address>--</code>
                  <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
                </div>
              </div>
            </div>

            <div class="kv">
              <div class="kv-label">Required Signatures</div>
              <div class="kv-value" data-required-signatures>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Operation Count</div>
              <div class="kv-value" data-operation-count>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Operation Deadline</div>
              <div class="kv-value" data-operation-deadline>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Bridge Out Enabled</div>
              <div class="kv-value" data-bridge-enabled>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Vault Halted</div>
              <div class="kv-value" data-vault-halted>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Max Bridge Out Amount</div>
              <div class="kv-value" data-max-bridge-out>--</div>
            </div>

            <div class="kv">
              <div class="kv-label">Vault Balance</div>
              <div class="kv-value" data-vault-balance>--</div>
            </div>

            <div class="kv kv--full">
              <div class="kv-label">Owner</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-owner-address>--</code>
                  <button type="button" class="copy-inline" data-copy-address data-address="">Copy</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Signers</div>
          <div class="param-list" data-contract-signers>
            <div class="param-row muted">Loading...</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Read Diagnostics</div>
          <div class="muted" data-contract-error>--</div>
        </div>
      </div>
    `;

    this.refreshBtn = this.panel.querySelector('[data-contract-refresh]');
    this.statusEl = this.panel.querySelector('[data-contract-status]');

    this.refreshBtn?.addEventListener('click', () => this.refresh());
    this.panel.addEventListener('click', (e) => this._handlePanelClick(e));

    document.addEventListener('contractManagerUpdated', () => {
      const snapshot = window.contractManager?.getStatusSnapshot?.();
      if (snapshot) this.render(snapshot);
    });

    document.addEventListener('tabActivated', (e) => {
      if (e?.detail?.tabName === 'contract') {
        this.refresh();
      }
    });

    this.refresh();
  }

  async refresh() {
    if (this._isLoading) return;
    this._isLoading = true;
    this._setLoading(true);

    const contractManager = window.contractManager;
    if (!contractManager) {
      this._setStatus('Contract manager is not available.');
      this._isLoading = false;
      this._setLoading(false);
      return;
    }

    try {
      const snapshot = await contractManager.refreshStatus({ reason: 'contractTabRefresh' });
      this.render(snapshot);
      this._setStatus('Contract status updated.');
    } catch (error) {
      const fallback = contractManager.getStatusSnapshot?.();
      if (fallback) this.render(fallback);
      this._setStatus(error?.message || 'Failed to refresh contract status.');
    } finally {
      this._isLoading = false;
      this._setLoading(false);
    }
  }

  render(snapshot) {
    if (!snapshot || !this.panel) return;

    this._renderAddress('[data-contract-address]', snapshot.configuredAddress || '--');
    this._renderAddress('[data-token-address]', snapshot.token || '--');
    this._renderAddress('[data-owner-address]', snapshot.owner || '--');

    this._setText('[data-config-chain-id]', this._valueOrDash(snapshot.configuredChainId));
    this._setText('[data-onchain-chain-id]', this._valueOrDash(snapshot.onChainId));
    this._setText('[data-onchain-chain-id-view]', this._valueOrDash(snapshot.onChainChainId));
    this._setText('[data-required-signatures]', this._valueOrDash(snapshot.requiredSignatures));
    this._setText('[data-operation-count]', this._valueOrDash(snapshot.operationCount));
    this._setText('[data-operation-deadline]', this._formatOperationDeadline(snapshot.operationDeadlineSeconds));
    this._setText('[data-bridge-enabled]', this._boolLabel(snapshot.bridgeOutEnabled));
    this._setText('[data-vault-halted]', this._boolLabel(snapshot.halted));
    this._setText('[data-max-bridge-out]', this._formatTokenAmount(snapshot.maxBridgeOutAmount));
    this._setText('[data-vault-balance]', this._formatTokenAmount(snapshot.vaultBalance));

    this._renderSigners(snapshot.signers || []);
    this._setText('[data-contract-error]', snapshot.error || 'No read errors detected.');
  }

  _renderSigners(signers) {
    const listEl = this.panel?.querySelector('[data-contract-signers]');
    if (!listEl) return;

    if (!Array.isArray(signers) || signers.length === 0) {
      listEl.innerHTML = '<div class="param-row muted">No signer data returned.</div>';
      return;
    }

    listEl.innerHTML = signers
      .map(
        (address, index) => `
          <div class="param-row">
            <strong>Signer ${index}:</strong>
            <div class="param-address">
              <code>${address}</code>
              <button type="button" class="copy-inline" data-copy-address data-address="${address}">Copy</button>
            </div>
          </div>
        `
      )
      .join('');
  }

  _renderAddress(selector, address) {
    const wrapper = this.panel?.querySelector(selector)?.closest('.param-address');
    if (!wrapper) return;

    const codeEl = wrapper.querySelector('code');
    const copyBtn = wrapper.querySelector('[data-copy-address]');

    if (codeEl) codeEl.textContent = address || '--';
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

  _setLoading(isLoading) {
    if (!this.refreshBtn) return;
    this.refreshBtn.disabled = !!isLoading;
    this.refreshBtn.textContent = isLoading ? 'Refreshing...' : 'Refresh';
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
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
      // fall back to raw below
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
}

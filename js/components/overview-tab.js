export class OverviewTab {
  constructor() {
    this.panel = null;
  }

  _shortenHex(value, head = 4, tail = 4) {
    const s = String(value || '');
    if (!s.startsWith('0x') || s.length <= head + tail + 2) return s || '--';
    return `${s.slice(0, 2 + head)}…${s.slice(-tail)}`;
  }

  _shortenAddress(value) {
    return this._shortenHex(value, 4, 4);
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="overview"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="panel-header">
        <h2>Overview</h2>
        <p class="muted">Skeleton baseline for the Liberdus Polygon Vault bridge UI.</p>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-title">Runtime Status</div>
          <div class="kv-grid">
            <div class="kv">
              <div class="kv-label">Wallet</div>
              <div class="kv-value" data-overview-wallet-status>--</div>
            </div>
            <div class="kv">
              <div class="kv-label">Wallet Address</div>
              <div class="kv-value" data-overview-wallet-address>--</div>
            </div>
            <div class="kv">
              <div class="kv-label">Wallet Chain</div>
              <div class="kv-value" data-overview-wallet-chain>--</div>
            </div>
            <div class="kv">
              <div class="kv-label">Tx Enabled</div>
              <div class="kv-value" data-overview-tx-enabled>--</div>
            </div>
            <div class="kv kv--full">
              <div class="kv-label">Contract Address</div>
              <div class="kv-value"><code data-overview-contract-address>--</code></div>
            </div>
            <div class="kv">
              <div class="kv-label">Contract Ready</div>
              <div class="kv-value" data-overview-contract-ready>--</div>
            </div>
            <div class="kv">
              <div class="kv-label">Contract Chain</div>
              <div class="kv-value" data-overview-contract-chain>--</div>
            </div>
            <div class="kv kv--full">
              <div class="kv-label">Status Note</div>
              <div class="kv-value" data-overview-note>--</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Planned Buildout</div>
          <ul class="list">
            <li>Bridge Out flow UI and validation.</li>
            <li>Operations/multisig request and signature workflows.</li>
            <li>Expanded contract reads and transaction status handling.</li>
          </ul>
        </div>
      </div>
    `;

    const rerender = () => this.render();
    document.addEventListener('walletConnected', rerender);
    document.addEventListener('walletDisconnected', rerender);
    document.addEventListener('walletAccountChanged', rerender);
    document.addEventListener('walletChainChanged', rerender);
    document.addEventListener('contractManagerUpdated', rerender);

    this.render();
  }

  render() {
    if (!this.panel) return;

    const walletManager = window.walletManager;
    const networkManager = window.networkManager;
    const contractManager = window.contractManager;

    const connected = !!walletManager?.isConnected?.();
    const addressRaw = walletManager?.getAddress?.() || '--';
    const address = this._shortenAddress(addressRaw);
    const chainId = walletManager?.getChainId?.();
    const txEnabled = !!networkManager?.isTxEnabled?.();

    const snapshot = contractManager?.getStatusSnapshot?.() || null;
    const contractAddressRaw = snapshot?.configuredAddress || '--';
    const contractAddress = this._shortenAddress(contractAddressRaw);
    const configuredChainId = snapshot?.configuredChainId;

    this._setText('[data-overview-wallet-status]', connected ? 'Connected' : 'Disconnected');
    this._setText('[data-overview-wallet-address]', address);
    this._setText('[data-overview-wallet-chain]', chainId != null ? String(chainId) : '--');
    this._setText('[data-overview-tx-enabled]', txEnabled ? 'Yes' : 'No');
    this._setText('[data-overview-contract-address]', contractAddress);
    this._setText('[data-overview-contract-ready]', contractManager?.isReady?.() ? 'Yes' : 'No');
    this._setText('[data-overview-contract-chain]', configuredChainId != null ? String(configuredChainId) : '--');

    if (snapshot?.error) {
      this._setText('[data-overview-note]', `Contract read warning: ${snapshot.error}`);
    } else {
      this._setText('[data-overview-note]', 'Skeleton mode: placeholder tabs are intentionally non-functional.');
    }
  }

  _setText(selector, text) {
    const el = this.panel?.querySelector(selector);
    if (el) el.textContent = text;
  }
}

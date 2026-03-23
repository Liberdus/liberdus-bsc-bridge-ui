import { PolygonBscBridgeModule } from '../modules/polygon-bsc-bridge-module.js';

export class BridgeOutTab {
  constructor() {
    this.panel = null;
    this.module = null;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="bridge"]');
    if (!this.panel) return;

    try {
      this.module = new PolygonBscBridgeModule({
        contractManager: window.contractManager,
        walletManager: window.walletManager,
        networkManager: window.networkManager,
        toastManager: window.toastManager,
        config: window.CONFIG,
      });
      this.module.mount(this.panel);
    } catch (error) {
      this.module = null;
      this._renderLoadError(error);
    }
  }

  _renderLoadError(error) {
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="panel-header">
        <h2>Bridge</h2>
        <p class="muted">Bridge is unavailable right now.</p>
      </div>
      <div class="card">
        <p class="muted">Failed to initialize the bridge module.</p>
      </div>
    `;

    console.error('[BridgeOutTab] Failed to initialize bridge module', error);
    window.toastManager?.error?.(error?.message || 'Failed to initialize bridge module');
  }
}

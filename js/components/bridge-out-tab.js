import { PolygonBscBridgeModule } from '../modules/polygon-bsc-bridge-module.js?v=20260305f';

export class BridgeOutTab {
  constructor() {
    this.panel = null;
    this.module = null;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="bridge"]');
    if (!this.panel) return;

    this.module = new PolygonBscBridgeModule({
      contractManager: window.contractManager,
      walletManager: window.walletManager,
      networkManager: window.networkManager,
    });
    this.module.mount(this.panel);
  }
}

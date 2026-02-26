import { PolygonBscBridgeModule } from '../modules/polygon-bsc-bridge-module.js';

export class BridgeOutTab {
  constructor() {
    this.panel = null;
    this.module = null;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="bridge-out"]');
    if (!this.panel) return;

    this.module = new PolygonBscBridgeModule();
    this.module.mount(this.panel);
  }
}

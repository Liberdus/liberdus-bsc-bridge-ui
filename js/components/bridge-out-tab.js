export class BridgeOutTab {
  constructor() {
    this.panel = null;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="bridge-out"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="panel-header">
        <h2>Bridge Out</h2>
        <p class="muted">Placeholder tab. Transaction handling will be wired in a follow-up phase.</p>
      </div>

      <div class="card">
        <div class="form-grid">
          <label class="field field--full">
            <span class="field-label">Target Address (BSC)</span>
            <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-always-disabled="true" disabled />
          </label>

          <label class="field">
            <span class="field-label">Amount (LIB)</span>
            <input class="field-input" type="text" placeholder="0" data-requires-tx="true" data-always-disabled="true" disabled />
          </label>

          <label class="field">
            <span class="field-label">Source Chain ID</span>
            <input class="field-input" type="text" value="137" data-requires-tx="true" data-always-disabled="true" disabled />
          </label>
        </div>

        <p class="muted">Coming soon: allowance checks, amount validation, and <code>bridgeOut</code> submit flow.</p>

        <div class="actions">
          <button type="button" class="btn btn--primary" data-requires-tx="true" data-always-disabled="true" disabled>
            Bridge Out (Coming Soon)
          </button>
        </div>
      </div>
    `;
  }
}

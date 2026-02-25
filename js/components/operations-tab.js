export class OperationsTab {
  constructor() {
    this.panel = null;
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="operations"]');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="panel-header">
        <h2>Operations</h2>
        <p class="muted">Placeholder tab for multisig admin actions and signature workflows.</p>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-title">Operation Request (Placeholder)</div>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Operation Type</span>
              <select class="field-input" data-requires-tx="true" data-always-disabled="true" disabled>
                <option>SetBridgeOutAmount</option>
                <option>UpdateSigner</option>
                <option>SetBridgeOutEnabled</option>
                <option>RelinquishTokens</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Target</span>
              <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-always-disabled="true" disabled />
            </label>
            <label class="field">
              <span class="field-label">Value</span>
              <input class="field-input" type="text" placeholder="0" data-requires-tx="true" data-always-disabled="true" disabled />
            </label>
            <label class="field">
              <span class="field-label">Data</span>
              <input class="field-input" type="text" placeholder="0x" data-requires-tx="true" data-always-disabled="true" disabled />
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn btn--primary" data-requires-tx="true" data-always-disabled="true" disabled>
              Request Operation (Coming Soon)
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Signature Submission (Placeholder)</div>
          <div class="form-grid">
            <label class="field field--full">
              <span class="field-label">Operation ID</span>
              <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-always-disabled="true" disabled />
            </label>
            <label class="field field--full">
              <span class="field-label">Signature</span>
              <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-always-disabled="true" disabled />
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn" data-requires-tx="true" data-always-disabled="true" disabled>
              Submit Signature (Coming Soon)
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

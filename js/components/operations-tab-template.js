export function renderOperationsTabTemplate({ refreshButton, tokenSymbol }) {
  return `
    <div class="panel-header">
      <div class="card-title-row">
        <h2>Admin</h2>
        ${refreshButton}
      </div>
      <p class="ops-status-banner is-neutral" data-ops-status>Connect a wallet to check access.</p>
    </div>

    <div class="stack">
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">Contract</div>
          <div class="muted" data-ops-contract-helper>Choose which contract to administer.</div>
        </div>
        <div class="tab-bar ops-contract-switch" role="tablist" aria-label="Admin contract switch">
          <button type="button" class="tab-button is-active" data-ops-contract-tab="source" aria-selected="true">Source</button>
          <button type="button" class="tab-button" data-ops-contract-tab="destination" aria-selected="false">Destination</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Access</div>
        <div class="kv-grid">
          <div class="kv">
            <div class="kv-label">Selected Contract</div>
            <div class="kv-value" data-ops-contract-label>--</div>
          </div>
          <div class="kv">
            <div class="kv-label">Required Network</div>
            <div class="kv-value" data-ops-required-network>--</div>
          </div>
          <div class="kv kv--full">
            <div class="kv-label">Connected Address</div>
            <div class="kv-value">
              <div class="param-address">
                <code data-ops-address>--</code>
                <button type="button" class="copy-inline" data-ops-copy data-copy-value="">Copy</button>
              </div>
            </div>
          </div>
          <div class="kv">
            <div class="kv-label">Role</div>
            <div class="kv-value" data-ops-role>--</div>
          </div>
          <div class="kv">
            <div class="kv-label">Tx Enabled</div>
            <div class="kv-value" data-ops-tx-enabled>--</div>
          </div>
          <div class="kv kv--full">
            <div class="kv-label">On-Chain Owner</div>
            <div class="kv-value">
              <div class="param-address">
                <code data-ops-owner>--</code>
                <button type="button" class="copy-inline" data-ops-copy data-copy-value="">Copy</button>
              </div>
            </div>
          </div>
          <div class="kv">
            <div class="kv-label">On-Chain Signer</div>
            <div class="kv-value" data-ops-is-signer>--</div>
          </div>
        </div>
      </div>

      <div class="card" data-ops-history-section hidden>
        <div class="ops-history-lookup">
          <div class="ops-history-section-title">Operation Lookup</div>
          <p class="muted" data-ops-history-copy>Paste an operation ID or select one below to review it.</p>
          <label class="field field--full">
            <span class="field-label">Operation ID</span>
            <div class="ops-history-lookup-row">
              <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-ops-operation-id />
              <button type="button" class="btn" data-requires-tx="true" data-ops-load-operation>View Operation</button>
            </div>
          </label>
        </div>
        <div class="ops-history-divider" role="presentation"></div>
        <div class="ops-history-intro">
          <div class="card-title">Requested Operations</div>
          <p class="muted" data-ops-history-intro>Loaded from the selected contract&apos;s current on-chain operation storage.</p>
        </div>
        <div class="proposals-filters">
          <label class="filter-field">
            <span class="filter-label">Operation</span>
            <select class="field-input" data-ops-history-filter-type></select>
          </label>
          <label class="filter-field">
            <span class="filter-label">Status</span>
            <select class="field-input" data-ops-history-filter-status>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Executed">Executed</option>
              <option value="Expired">Expired</option>
            </select>
          </label>
        </div>
        <div class="proposal-list" data-ops-history-list></div>
        <div class="proposal-footer">
          <button type="button" class="btn" data-ops-history-load-more>Load more</button>
          <div class="muted" data-ops-history-count>Showing 0</div>
        </div>
      </div>

      <div class="card" data-ops-admin-section hidden>
        <div class="card-title" data-ops-actions-title>Admin Actions</div>
        <div class="form-grid">
          <label class="field">
            <span class="field-label">Request Operation</span>
            <select class="field-input" data-op-type></select>
          </label>

          <label class="field" data-op-field="amount" hidden>
            <span class="field-label">Max Bridge Out Amount (${tokenSymbol})</span>
            <input class="field-input" type="text" inputmode="decimal" placeholder="0" data-op-amount />
          </label>

          <label class="field" data-op-field="enabled" hidden>
            <span class="field-label">Bridge Out Enabled</span>
            <select class="field-input" data-op-enabled>
              <option value="true">Enable</option>
              <option value="false">Disable</option>
            </select>
          </label>

          <label class="field" data-op-field="destBridgeInCaller" hidden>
            <span class="field-label">Bridge In Caller</span>
            <input class="field-input" type="text" placeholder="0x..." data-op-dest-bridge-in-caller />
          </label>

          <label class="field" data-op-field="destBridgeInAmount" hidden>
            <span class="field-label">Max Bridge In Amount (${tokenSymbol})</span>
            <input class="field-input" type="text" inputmode="decimal" placeholder="0" data-op-dest-bridge-in-amount />
          </label>

          <label class="field" data-op-field="destBridgeInCooldown" hidden>
            <span class="field-label">Bridge In Cooldown (seconds)</span>
            <input class="field-input" type="text" inputmode="numeric" placeholder="60" data-op-dest-bridge-in-cooldown />
          </label>

          <label class="field" data-op-field="destBridgeInEnabled" hidden>
            <span class="field-label">Bridge In Enabled</span>
            <select class="field-input" data-op-dest-bridge-in-enabled>
              <option value="true">Enable</option>
              <option value="false">Disable</option>
            </select>
          </label>

          <label class="field" data-op-field="destBridgeOutEnabled" hidden>
            <span class="field-label">Bridge Out Enabled</span>
            <select class="field-input" data-op-dest-bridge-out-enabled>
              <option value="true">Enable</option>
              <option value="false">Disable</option>
            </select>
          </label>

          <label class="field" data-op-field="destMinBridgeOutAmount" hidden>
            <span class="field-label">Min Bridge Out Amount (${tokenSymbol})</span>
            <input class="field-input" type="text" inputmode="decimal" placeholder="0" data-op-dest-min-bridge-out-amount />
          </label>

          <label class="field" data-op-field="oldSigner" hidden>
            <span class="field-label">Old Signer</span>
            <input class="field-input" type="text" placeholder="0x..." data-op-old-signer />
          </label>

          <label class="field" data-op-field="newSigner" hidden>
            <span class="field-label">New Signer</span>
            <input class="field-input" type="text" placeholder="0x..." data-op-new-signer />
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn btn--primary" data-requires-tx="true" data-ops-request-op>
            Request Operation
          </button>
        </div>
        <div class="ops-panel" data-ops-request-result hidden>
          <div class="ops-panel-content">
            <div class="ops-panel-row">
              <div class="ops-panel-label">Operation ID</div>
              <div class="ops-panel-value">
                <div class="param-address">
                  <code data-ops-last-operation>--</code>
                  <button type="button" class="copy-inline" data-ops-copy data-copy-value="">Copy</button>
                  <button type="button" class="copy-inline" data-ops-use-operation>Use</button>
                </div>
              </div>
            </div>
            <div class="ops-panel-row">
              <div class="ops-panel-label">Tx</div>
              <div class="ops-panel-value" data-ops-last-tx>--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" data-ops-ownership-section hidden>
        <div class="card-title">Ownership</div>
        <div class="form-grid">
          <label class="field field--full">
            <span class="field-label">Transfer Ownership</span>
            <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-ops-new-owner />
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn btn--warning" data-requires-tx="true" data-ops-transfer-owner>
            Transfer
          </button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" data-ops-operation-modal hidden>
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" data-ops-operation-modal-title>Operation Details</div>
          <button
            type="button"
            class="notification-close"
            aria-label="Close"
            title="Close"
            data-ops-close-operation
          >×</button>
        </div>
        <div class="modal-body">
          <div class="ops-panel" data-ops-operation-details hidden>
            <div class="ops-panel-content" data-ops-operation-detail-rows></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn--success" data-requires-tx="true" data-ops-sign-submit hidden>
            Sign & Submit
          </button>
        </div>
      </div>
    </div>
  `;
}

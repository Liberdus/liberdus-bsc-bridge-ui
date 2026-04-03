import { escapeHtml } from '../utils/helpers.js';
import { getContractMetadata } from '../contracts/contract-types.js';

const SOURCE_SUMMARY_FIELDS = Object.freeze([
  { label: 'Network', field: 'network' },
  { label: 'Vault Chain ID', field: 'chain-id' },
  { label: 'Bridge Out Enabled', field: 'bridge-out-enabled' },
  { label: 'Vault Halted', field: 'vault-halted' },
  { label: 'Max Bridge Out Amount', field: 'max-bridge-out' },
  { label: 'Vault Balance', field: 'vault-balance' },
  { label: 'Contract Address', field: 'contract-address', address: true },
  { label: 'Token Address', field: 'token-address', address: true },
  { label: 'Owner', field: 'owner-address', address: true },
]);

const DESTINATION_SUMMARY_FIELDS = Object.freeze([
  { label: 'Network', field: 'network' },
  { label: 'Chain ID', field: 'chain-id' },
  { label: 'Bridge In Enabled', field: 'bridge-in-enabled' },
  { label: 'Bridge Out Enabled', field: 'bridge-out-enabled' },
  { label: 'Max Bridge In Amount', field: 'max-bridge-in' },
  { label: 'Bridge In Cooldown', field: 'bridge-in-cooldown' },
  { label: 'Min Bridge Out Amount', field: 'min-bridge-out' },
  { label: 'Last Bridge In', field: 'last-bridge-in' },
  { label: 'Contract Address', field: 'contract-address', address: true },
  { label: 'Bridge In Caller', field: 'bridge-in-caller', address: true },
  { label: 'Owner', field: 'owner-address', address: true },
  { label: 'Token Symbol', field: 'token-symbol' },
  { label: 'Total Supply', field: 'total-supply' },
]);

export function renderInfoTabTemplate({ contractKeys, refreshButton }) {
  return `
    <div class="info-shell">
      <div class="panel-header info-hero">
        <div class="card-title-row info-hero-row">
          <h2>Contract Info</h2>
          ${refreshButton}
        </div>
      </div>

      <div class="info-contracts">
        ${contractKeys.map((contractKey) => renderInfoContractShell(contractKey)).join('')}
      </div>
    </div>
  `;
}

function renderInfoContractShell(contractKey) {
  const meta = getContractMetadata(contractKey);
  const summaryFields = getSummaryFields(contractKey);

  return `
    <section class="info-contract-section" data-info-contract="${meta.key}">
      <div class="card-title-row info-contract-header">
        <div>
          <div class="card-title">${escapeHtml(meta.label)}</div>
          <div class="muted">On-chain configuration and multisig state</div>
        </div>
      </div>
      <div class="info-contract-alert hidden" data-info-field="${meta.key}:read-alert" role="status"></div>
      <div class="info-layout">
        <div class="card info-card info-card--summary">
          <div class="kv-grid info-kv-grid">
            ${summaryFields.map((field) => renderInfoKv(contractKey, field)).join('')}
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

function getSummaryFields(contractKey) {
  return contractKey === 'destination' ? DESTINATION_SUMMARY_FIELDS : SOURCE_SUMMARY_FIELDS;
}

function renderInfoKv(contractKey, { label, field, address = false }) {
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

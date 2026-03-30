const SET_BRIDGE_OUT_AMOUNT = 0;
const UPDATE_SIGNER = 1;
const SET_BRIDGE_OUT_ENABLED = 2;
const RELINQUISH_TOKENS = 3;

export const VAULT_OPERATION_TYPES = Object.freeze([
  { value: SET_BRIDGE_OUT_AMOUNT, label: 'Set Bridge Out Amount' },
  { value: UPDATE_SIGNER, label: 'Update Signer' },
  { value: SET_BRIDGE_OUT_ENABLED, label: 'Set Bridge Out Enabled' },
  { value: RELINQUISH_TOKENS, label: 'Relinquish Tokens' },
]);

export const REQUEST_VAULT_OPERATION_TYPE_ORDER = Object.freeze([
  SET_BRIDGE_OUT_AMOUNT,
  SET_BRIDGE_OUT_ENABLED,
  UPDATE_SIGNER,
  RELINQUISH_TOKENS,
]);

export function renderVaultOperationOptions({ includeAll = false, allLabel = 'All Operations', order = null } = {}) {
  const values = order || VAULT_OPERATION_TYPES.map(({ value }) => value);
  const options = values.map((value) => `<option value="${value}">${getVaultOperationTypeLabel(value)}</option>`);

  if (includeAll) {
    options.unshift(`<option value="">${allLabel}</option>`);
  }

  return options.join('\n');
}

export function getVaultOperationTypeLabel(opType) {
  switch (Number(opType)) {
    case SET_BRIDGE_OUT_AMOUNT:
      return 'Set Bridge Out Amount';
    case UPDATE_SIGNER:
      return 'Update Signer';
    case SET_BRIDGE_OUT_ENABLED:
      return 'Set Bridge Out Enabled';
    case RELINQUISH_TOKENS:
      return 'Relinquish Tokens';
    default:
      throw new Error(`Unknown vault operation type: ${opType}`);
  }
}

export function isOwnerSignableVaultOperationType(opType) {
  switch (Number(opType)) {
    case SET_BRIDGE_OUT_AMOUNT:
    case SET_BRIDGE_OUT_ENABLED:
    case RELINQUISH_TOKENS:
      return false;
    case UPDATE_SIGNER:
      return true;
    default:
      throw new Error(`Unknown vault operation type: ${opType}`);
  }
}

export function normalizeVaultOperation(operationId, operation, expired) {
  return {
    operationId,
    opType: readNumber(operation, 'opType', 0),
    target: readString(operation, 'target', 1),
    value: readField(operation, 'value', 2),
    data: readString(operation, 'data', 3),
    numSignatures: readNumber(operation, 'numSignatures', 4),
    executed: Boolean(readField(operation, 'executed', 5)),
    deadline: readNumber(operation, 'deadline', 6),
    expired: Boolean(expired),
  };
}

export function createUnavailableVaultOperation(operationId) {
  return {
    state: 'unavailable',
    operationId,
    message: 'Operation details unavailable. Refresh to retry.',
  };
}

export function buildVaultOperationSummary(item, helpers) {
  switch (item.opType) {
    case SET_BRIDGE_OUT_AMOUNT:
      return `Set max bridge out amount to ${helpers.formatTokenAmount(item.value)}`;
    case UPDATE_SIGNER: {
      const newSigner = helpers.uint256ToAddress(item.value) || String(item.value);
      return `Replace signer ${helpers.shortenAddress(item.target)} with ${helpers.shortenAddress(newSigner)}`;
    }
    case SET_BRIDGE_OUT_ENABLED: {
      const enabled = helpers.decodeBoolData(item.data);
      return enabled == null ? 'Update bridge out enabled flag' : `Set bridge out ${enabled ? 'enabled' : 'disabled'}`;
    }
    case RELINQUISH_TOKENS:
      return 'Relinquish all vault tokens and halt the vault';
    default:
      throw new Error(`Unknown vault operation type: ${item.opType}`);
  }
}

export function buildVaultOperationDetailRows(item, helpers) {
  const target = helpers.normalizeAddress(item.target) || String(item.target);
  const data = helpers.formatOperationDataDisplay(item.data);

  switch (item.opType) {
    case SET_BRIDGE_OUT_AMOUNT: {
      const rows = [detailRow('maxBridgeOutAmount', 'Max Bridge Out Amount', helpers.formatTokenAmount(item.value))];
      if (!helpers.isZeroAddress(item.target)) {
        rows.push(copyRow('target', 'Target', target, target));
      }
      if (data !== 'None') {
        rows.push(detailRow('data', 'Data', data, true));
      }
      return rows;
    }
    case UPDATE_SIGNER: {
      const newSigner = helpers.uint256ToAddress(item.value) || String(item.value);
      return [
        copyRow('oldSigner', 'Old Signer', target, target),
        copyRow('newSigner', 'New Signer', newSigner, helpers.normalizeAddress(newSigner) || newSigner),
        ...(data === 'None' ? [] : [detailRow('data', 'Data', data, true)]),
      ];
    }
    case SET_BRIDGE_OUT_ENABLED: {
      const enabled = helpers.decodeBoolData(item.data);
      const rows = [detailRow('bridgeOutStatus', 'Bridge Out Status', enabled == null ? data : enabled ? 'Enabled' : 'Disabled')];
      if (!helpers.isZeroAddress(item.target)) {
        rows.push(copyRow('target', 'Target', target, target));
      }
      return rows;
    }
    case RELINQUISH_TOKENS: {
      const rows = [detailRow('action', 'Action', 'Relinquish all vault tokens and halt the vault')];
      if (!helpers.isZeroAddress(item.target)) {
        rows.push(copyRow('target', 'Target', target, target));
      }
      if (String(item.value) !== '0') {
        rows.push(detailRow('value', 'Value', String(item.value), true));
      }
      if (data !== 'None') {
        rows.push(detailRow('data', 'Data', data, true));
      }
      return rows;
    }
    default:
      throw new Error(`Unknown vault operation type: ${item.opType}`);
  }
}

function detailRow(key, label, value, code = false) {
  return { key, label, value, copyValue: '', code };
}

function copyRow(key, label, value, copyValue) {
  return { key, label, value, copyValue, code: true };
}

function readField(operation, key, tupleIndex) {
  if (operation?.[key] != null) return operation[key];
  return operation?.[tupleIndex];
}

function readNumber(operation, key, tupleIndex) {
  return Number(readField(operation, key, tupleIndex));
}

function readString(operation, key, tupleIndex) {
  return String(readField(operation, key, tupleIndex));
}

const SET_BRIDGE_IN_CALLER = 0;
const SET_BRIDGE_IN_LIMITS = 1;
const UPDATE_SIGNER = 2;
const SET_BRIDGE_IN_ENABLED = 3;
const SET_BRIDGE_OUT_ENABLED = 4;
const SET_MIN_BRIDGE_OUT_AMOUNT = 5;

export const DESTINATION_OPERATION_TYPES = Object.freeze([
  { value: SET_BRIDGE_IN_CALLER, label: 'Set Bridge In Caller' },
  { value: SET_BRIDGE_IN_LIMITS, label: 'Set Bridge In Limits' },
  { value: UPDATE_SIGNER, label: 'Update Signer' },
  { value: SET_BRIDGE_IN_ENABLED, label: 'Set Bridge In Enabled' },
  { value: SET_BRIDGE_OUT_ENABLED, label: 'Set Bridge Out Enabled' },
  { value: SET_MIN_BRIDGE_OUT_AMOUNT, label: 'Set Min Bridge Out Amount' },
]);

export const REQUEST_DESTINATION_OPERATION_TYPE_ORDER = Object.freeze([
  SET_BRIDGE_IN_CALLER,
  SET_BRIDGE_IN_LIMITS,
  SET_BRIDGE_IN_ENABLED,
  SET_BRIDGE_OUT_ENABLED,
  SET_MIN_BRIDGE_OUT_AMOUNT,
  UPDATE_SIGNER,
]);

export function renderDestinationOperationOptions({ includeAll = false, allLabel = 'All Operations', order = null } = {}) {
  const values = order || DESTINATION_OPERATION_TYPES.map(({ value }) => value);
  const options = values.map((value) => `<option value="${value}">${getDestinationOperationTypeLabel(value)}</option>`);

  if (includeAll) {
    options.unshift(`<option value="">${allLabel}</option>`);
  }

  return options.join('\n');
}

export function getDestinationOperationTypeLabel(opType) {
  switch (Number(opType)) {
    case SET_BRIDGE_IN_CALLER:
      return 'Set Bridge In Caller';
    case SET_BRIDGE_IN_LIMITS:
      return 'Set Bridge In Limits';
    case UPDATE_SIGNER:
      return 'Update Signer';
    case SET_BRIDGE_IN_ENABLED:
      return 'Set Bridge In Enabled';
    case SET_BRIDGE_OUT_ENABLED:
      return 'Set Bridge Out Enabled';
    case SET_MIN_BRIDGE_OUT_AMOUNT:
      return 'Set Min Bridge Out Amount';
    default:
      throw new Error(`Unknown destination operation type: ${opType}`);
  }
}

export function isOwnerSignableDestinationOperationType(opType) {
  switch (Number(opType)) {
    case UPDATE_SIGNER:
      return true;
    case SET_BRIDGE_IN_CALLER:
    case SET_BRIDGE_IN_LIMITS:
    case SET_BRIDGE_IN_ENABLED:
    case SET_BRIDGE_OUT_ENABLED:
    case SET_MIN_BRIDGE_OUT_AMOUNT:
      return false;
    default:
      throw new Error(`Unknown destination operation type: ${opType}`);
  }
}

export function buildDestinationOperationSummary(item, helpers) {
  switch (item.opType) {
    case SET_BRIDGE_IN_CALLER:
      return `Set bridge in caller to ${helpers.shortenAddress(item.target)}`;
    case SET_BRIDGE_IN_LIMITS: {
      const cooldown = helpers.decodeUint256Data(item.data);
      return `Set bridge in limits to ${helpers.formatTokenAmount(item.value)} max, ${helpers.formatSeconds(cooldown)} cooldown`;
    }
    case UPDATE_SIGNER: {
      const newSigner = helpers.uint256ToAddress(item.value) || String(item.value);
      return `Replace signer ${helpers.shortenAddress(item.target)} with ${helpers.shortenAddress(newSigner)}`;
    }
    case SET_BRIDGE_IN_ENABLED: {
      const enabled = helpers.decodeBoolData(item.data);
      return enabled == null ? 'Update bridge in enabled flag' : `Set bridge in ${enabled ? 'enabled' : 'disabled'}`;
    }
    case SET_BRIDGE_OUT_ENABLED: {
      const enabled = helpers.decodeBoolData(item.data);
      return enabled == null ? 'Update bridge out enabled flag' : `Set bridge out ${enabled ? 'enabled' : 'disabled'}`;
    }
    case SET_MIN_BRIDGE_OUT_AMOUNT:
      return `Set min bridge out amount to ${helpers.formatTokenAmount(item.value)}`;
    default:
      throw new Error(`Unknown destination operation type: ${item.opType}`);
  }
}

export function buildDestinationOperationDetailRows(item, helpers) {
  const target = helpers.normalizeAddress(item.target) || String(item.target);
  const data = helpers.formatOperationDataDisplay(item.data);

  switch (item.opType) {
    case SET_BRIDGE_IN_CALLER:
      return [copyRow('bridgeInCaller', 'Bridge In Caller', target, target)];
    case SET_BRIDGE_IN_LIMITS: {
      const cooldown = helpers.decodeUint256Data(item.data);
      const rows = [
        detailRow('maxBridgeInAmount', 'Max Bridge In Amount', helpers.formatTokenAmount(item.value)),
      ];
      if (cooldown != null) {
        rows.push(detailRow('bridgeInCooldown', 'Bridge In Cooldown', helpers.formatSeconds(cooldown)));
      } else if (data !== 'None') {
        rows.push(detailRow('data', 'Data', data, true));
      }
      if (!helpers.isZeroAddress(item.target)) {
        rows.push(copyRow('target', 'Target', target, target));
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
    case SET_BRIDGE_IN_ENABLED: {
      const enabled = helpers.decodeBoolData(item.data);
      return [detailRow('bridgeInStatus', 'Bridge In Status', enabled == null ? data : enabled ? 'Enabled' : 'Disabled')];
    }
    case SET_BRIDGE_OUT_ENABLED: {
      const enabled = helpers.decodeBoolData(item.data);
      return [detailRow('bridgeOutStatus', 'Bridge Out Status', enabled == null ? data : enabled ? 'Enabled' : 'Disabled')];
    }
    case SET_MIN_BRIDGE_OUT_AMOUNT:
      return [detailRow('minBridgeOutAmount', 'Min Bridge Out Amount', helpers.formatTokenAmount(item.value))];
    default:
      throw new Error(`Unknown destination operation type: ${item.opType}`);
  }
}

function detailRow(key, label, value, code = false) {
  return { key, label, value, copyValue: '', code };
}

function copyRow(key, label, value, copyValue) {
  return { key, label, value, copyValue, code: true };
}

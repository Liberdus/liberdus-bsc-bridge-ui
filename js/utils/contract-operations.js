import {
  buildVaultOperationDetailRows,
  buildVaultOperationSummary,
  getVaultOperationTypeLabel,
  isOwnerSignableVaultOperationType,
  renderVaultOperationOptions,
  REQUEST_VAULT_OPERATION_TYPE_ORDER,
} from './vault-operations.js';
import {
  buildDestinationOperationDetailRows,
  buildDestinationOperationSummary,
  getDestinationOperationTypeLabel,
  isOwnerSignableDestinationOperationType,
  renderDestinationOperationOptions,
  REQUEST_DESTINATION_OPERATION_TYPE_ORDER,
} from './destination-operations.js';

export function renderOperationOptions(contractKey, options) {
  return contractKey === 'destination'
    ? renderDestinationOperationOptions(options)
    : renderVaultOperationOptions(options);
}

export function getOperationTypeLabel(contractKey, opType) {
  return contractKey === 'destination'
    ? getDestinationOperationTypeLabel(opType)
    : getVaultOperationTypeLabel(opType);
}

export function isOwnerSignableOperationType(contractKey, opType) {
  return contractKey === 'destination'
    ? isOwnerSignableDestinationOperationType(opType)
    : isOwnerSignableVaultOperationType(opType);
}

export function buildOperationSummary(contractKey, item, helpers) {
  return contractKey === 'destination'
    ? buildDestinationOperationSummary(item, helpers)
    : buildVaultOperationSummary(item, helpers);
}

export function buildOperationDetailRows(contractKey, item, helpers) {
  return contractKey === 'destination'
    ? buildDestinationOperationDetailRows(item, helpers)
    : buildVaultOperationDetailRows(item, helpers);
}

export function getRequestOperationTypeOrder(contractKey) {
  return contractKey === 'destination'
    ? REQUEST_DESTINATION_OPERATION_TYPE_ORDER
    : REQUEST_VAULT_OPERATION_TYPE_ORDER;
}

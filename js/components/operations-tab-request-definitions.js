import { normalizeContractKey } from '../contracts/contract-types.js';

export const REQUEST_OPERATION_FIELD_NAMES = Object.freeze([
  'amount',
  'enabled',
  'destBridgeInCaller',
  'destBridgeInAmount',
  'destBridgeInCooldown',
  'destBridgeInEnabled',
  'destBridgeOutEnabled',
  'destMinBridgeOutAmount',
  'oldSigner',
  'newSigner',
]);

const REQUEST_OPERATION_DEFINITIONS = Object.freeze({
  source: Object.freeze({
    0: Object.freeze({
      visibleFields: Object.freeze(['amount']),
      buildPayload: ({ AddressZero, Zero, parseTokenAmount, requireInputValue }) => ({
        target: AddressZero,
        value: parseTokenAmount(requireInputValue('[data-op-amount]', 'Enter a max bridge out amount.')),
        data: '0x',
      }),
    }),
    1: Object.freeze({
      visibleFields: Object.freeze(['oldSigner', 'newSigner']),
      buildPayload: ({ buildUpdateSignerPayload }) => buildUpdateSignerPayload(),
    }),
    2: Object.freeze({
      visibleFields: Object.freeze(['enabled']),
      buildPayload: ({ AddressZero, Zero, encodeBooleanSelection }) => ({
        target: AddressZero,
        value: Zero,
        data: encodeBooleanSelection('[data-op-enabled]'),
      }),
    }),
    3: Object.freeze({
      visibleFields: Object.freeze([]),
      buildPayload: ({ AddressZero, Zero }) => ({
        target: AddressZero,
        value: Zero,
        data: '0x',
      }),
    }),
  }),
  destination: Object.freeze({
    0: Object.freeze({
      visibleFields: Object.freeze(['destBridgeInCaller']),
      buildPayload: ({ Zero, readAddress }) => ({
        target: readAddress('[data-op-dest-bridge-in-caller]', 'Invalid bridge in caller address.'),
        value: Zero,
        data: '0x',
      }),
    }),
    1: Object.freeze({
      visibleFields: Object.freeze(['destBridgeInAmount', 'destBridgeInCooldown']),
      buildPayload: ({ AddressZero, parseTokenAmount, requireInputValue, encodeUint256 }) => ({
        target: AddressZero,
        value: parseTokenAmount(requireInputValue('[data-op-dest-bridge-in-amount]', 'Enter a max bridge in amount.')),
        data: encodeUint256(
          requireInputValue('[data-op-dest-bridge-in-cooldown]', 'Enter a bridge in cooldown.'),
          { positive: true, positiveMessage: 'Bridge in cooldown must be greater than zero.' }
        ),
      }),
    }),
    2: Object.freeze({
      visibleFields: Object.freeze(['oldSigner', 'newSigner']),
      buildPayload: ({ buildUpdateSignerPayload }) => buildUpdateSignerPayload(),
    }),
    3: Object.freeze({
      visibleFields: Object.freeze(['destBridgeInEnabled']),
      buildPayload: ({ AddressZero, Zero, encodeBooleanSelection }) => ({
        target: AddressZero,
        value: Zero,
        data: encodeBooleanSelection('[data-op-dest-bridge-in-enabled]'),
      }),
    }),
    4: Object.freeze({
      visibleFields: Object.freeze(['destBridgeOutEnabled']),
      buildPayload: ({ AddressZero, Zero, encodeBooleanSelection }) => ({
        target: AddressZero,
        value: Zero,
        data: encodeBooleanSelection('[data-op-dest-bridge-out-enabled]'),
      }),
    }),
    5: Object.freeze({
      visibleFields: Object.freeze(['destMinBridgeOutAmount']),
      buildPayload: ({ AddressZero, parseTokenAmount, requireInputValue }) => ({
        target: AddressZero,
        value: parseTokenAmount(requireInputValue('[data-op-dest-min-bridge-out-amount]', 'Enter a min bridge out amount.')),
        data: '0x',
      }),
    }),
  }),
});

export function getRequestOperationVisibleFields(contractKey, opType) {
  return getRequestOperationDefinition(contractKey, opType).visibleFields;
}

export function buildRequestOperationPayload(contractKey, opType, context) {
  return getRequestOperationDefinition(contractKey, opType).buildPayload(context);
}

function getRequestOperationDefinition(contractKey, opType) {
  const normalizedKey = normalizeContractKey(contractKey);
  const definition = REQUEST_OPERATION_DEFINITIONS[normalizedKey]?.[Number(opType)];
  if (!definition) {
    throw new Error('Unknown operation type.');
  }
  return definition;
}

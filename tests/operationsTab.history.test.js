import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsTab } from '../js/components/operations-tab.js';
import { flushPromises, installCommonWindowStubs, setupOperationsTabDom } from './helpers/test-utils.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const OPERATION_ID_ONE = `0x${'1'.repeat(64)}`;
const OPERATION_ID_TWO = `0x${'2'.repeat(64)}`;
const OLD_SIGNER = '0x3333333333333333333333333333333333333333';
const NEW_SIGNER = '0x4444444444444444444444444444444444444444';

function encodeAddressValue(address) {
  return BigInt(address).toString();
}

function detailValue(key) {
  const row = document.querySelector(`[data-ops-detail-row="${key}"]`);
  if (!row) return null;
  const code = row.querySelector('code');
  if (code) return code.textContent;
  return row.querySelector('.ops-panel-value')?.textContent?.replace(/\s+/g, ' ').trim() || null;
}

function makeHistoryItem({
  operationId,
  opType,
  target = OWNER,
  value = '1000000000000000000',
  data = '0x',
  deadline = 2000000000,
  numSignatures = 1,
  executed = false,
  expired = false,
} = {}) {
  return {
    operationId,
    opType,
    target,
    value,
    data,
    deadline,
    numSignatures,
    executed,
    expired,
  };
}

function installReadContract(item) {
  const contract = {
    operations: vi.fn(async () => ({
      opType: item.opType,
      target: item.target,
      value: item.value,
      data: item.data,
      numSignatures: item.numSignatures,
      executed: item.executed,
      deadline: item.deadline,
    })),
    isOperationExpired: vi.fn(async () => item.expired),
  };

  window.contractManager.getReadContract = vi.fn(() => contract);
  return contract;
}

describe('OperationsTab requested operations history', () => {
  beforeEach(() => {
    setupOperationsTabDom();
    installCommonWindowStubs();
    window.walletManager.isConnected = vi.fn(() => true);
    window.walletManager.getAddress = vi.fn(() => OWNER);
    window.contractManager.getAccessState = vi.fn(async () => ({
      owner: OWNER,
      isOwner: true,
      isSigner: false,
      ownerError: null,
      signerError: null,
      error: null,
    }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders requested operations from the injected history service', async () => {
    window.contractManager.getStatusSnapshot = vi.fn(() => ({ requiredSignatures: 3 }));

    const historyService = {
      load: vi.fn(async () => ({
        activeCount: 4,
        items: [
          makeHistoryItem({ operationId: OPERATION_ID_ONE, opType: 0, numSignatures: 2 }),
          makeHistoryItem({ operationId: OPERATION_ID_TWO, opType: 2, value: '0', data: `0x${'0'.repeat(63)}1`, executed: true }),
        ],
      })),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    const rows = Array.from(document.querySelectorAll('[data-ops-history-row]'));
    const historySection = document.querySelector('[data-ops-history-section]');
    expect(historyService.load).toHaveBeenCalledTimes(1);
    expect(historySection).not.toBeNull();
    expect(historySection.querySelector('[data-ops-operation-id]')).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Set Bridge Out Amount');
    expect(rows[0].textContent).toContain('2/3');
    expect(rows[1].textContent).toContain('Executed');
    expect(document.querySelector('[data-ops-history-count]').textContent).toBe('Showing 2 of 4 total');
  });

  it('renders a friendly error state when the history service fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Contract ABI does not expose enumerable operation IDs.');

    const historyService = {
      load: vi.fn(async () => {
        throw error;
      }),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    expect(document.querySelector('.ops-history-error-title').textContent).toBe('Unable to load requested operations');
    expect(document.querySelector('.ops-history-error-detail').textContent).toContain('enumerable operation IDs');
    expect(window.toastManager.error).toHaveBeenCalledWith('Failed to load requested operations', expect.objectContaining({
      message: expect.stringContaining('enumerable operation IDs'),
    }));
    expect(consoleError).toHaveBeenCalledWith(
      '[OperationsTab] Failed to load requested operations',
      expect.objectContaining({
        error,
        title: 'Unable to load requested operations',
      })
    );
  });

  it('fills the lookup input and loads operation details when a history row is clicked', async () => {
    const freshOperation = makeHistoryItem({
      operationId: OPERATION_ID_ONE,
      opType: 1,
      target: OLD_SIGNER,
      value: encodeAddressValue(NEW_SIGNER),
      numSignatures: 2,
    });
    const contract = installReadContract(freshOperation);

    const historyService = {
      load: vi.fn(async () => ({
        items: [makeHistoryItem({
          operationId: OPERATION_ID_ONE,
          opType: 1,
          target: OLD_SIGNER,
          value: encodeAddressValue(NEW_SIGNER),
          numSignatures: 0,
        })],
      })),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    document.querySelector('[data-ops-history-row]').click();
    await flushPromises();

    expect(contract.operations).toHaveBeenCalledWith(OPERATION_ID_ONE);
    expect(contract.isOperationExpired).toHaveBeenCalledWith(OPERATION_ID_ONE);
    expect(document.querySelector('[data-ops-operation-id]').value).toBe(OPERATION_ID_ONE);
    expect(document.querySelector('[data-ops-history-row]').className).toContain('is-selected');
    expect(document.querySelector('[data-ops-operation-modal]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-operation-details]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-operation-modal-title]').textContent).toBe('Update Signer Details');
    expect(detailValue('operation')).toBe('Update Signer');
    expect(detailValue('oldSigner')).toBe(OLD_SIGNER);
    expect(detailValue('newSigner')).toBe(NEW_SIGNER);
    expect(detailValue('signatures')).toBe('2/3');
    expect(document.querySelector('[data-ops-detail-row="target"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="value"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="data"]')).toBeNull();
    expect(document.querySelector('[data-ops-sign-submit]').hidden).toBe(false);
    expect(document.querySelector('[data-ops-sign-submit]').disabled).toBe(false);
    expect(detailValue('executed')).toBe('No');
  });

  it('renders only relevant fields for Set Bridge Out Amount operations', async () => {
    installReadContract(makeHistoryItem({
      operationId: OPERATION_ID_ONE,
      opType: 0,
      target: '0x0000000000000000000000000000000000000000',
      value: '20000000000000000000000',
      numSignatures: 0,
    }));

    const historyService = {
      load: vi.fn(async () => ({
        items: [makeHistoryItem({
          operationId: OPERATION_ID_ONE,
          opType: 0,
          target: '0x0000000000000000000000000000000000000000',
          value: '20000000000000000000000',
          numSignatures: 0,
        })],
      })),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    document.querySelector('[data-ops-history-row]').click();
    await flushPromises();

    expect(detailValue('operation')).toBe('Set Bridge Out Amount');
    expect(detailValue('maxBridgeOutAmount')).toBe('20,000 LIB');
    expect(detailValue('signatures')).toBe('0/3');
    expect(document.querySelector('[data-ops-detail-row="target"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="value"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="data"]')).toBeNull();
    expect(document.querySelector('[data-ops-sign-submit]').hidden).toBe(true);
  });

  it('renders only relevant fields for Set Bridge Out Enabled operations', async () => {
    installReadContract(makeHistoryItem({
      operationId: OPERATION_ID_ONE,
      opType: 2,
      target: '0x0000000000000000000000000000000000000000',
      value: '0',
      data: `0x${'0'.repeat(63)}1`,
    }));

    const historyService = {
      load: vi.fn(async () => ({
        items: [makeHistoryItem({
          operationId: OPERATION_ID_ONE,
          opType: 2,
          target: '0x0000000000000000000000000000000000000000',
          value: '0',
          data: `0x${'0'.repeat(63)}1`,
        })],
      })),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    document.querySelector('[data-ops-history-row]').click();
    await flushPromises();

    expect(detailValue('operation')).toBe('Set Bridge Out Enabled');
    expect(detailValue('bridgeOutStatus')).toBe('Enabled');
    expect(document.querySelector('[data-ops-detail-row="target"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="value"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="data"]')).toBeNull();
  });

  it('renders only relevant fields for Relinquish Tokens operations', async () => {
    installReadContract(makeHistoryItem({
      operationId: OPERATION_ID_ONE,
      opType: 3,
      target: '0x0000000000000000000000000000000000000000',
      value: '0',
      data: '0x',
    }));

    const historyService = {
      load: vi.fn(async () => ({
        items: [makeHistoryItem({
          operationId: OPERATION_ID_ONE,
          opType: 3,
          target: '0x0000000000000000000000000000000000000000',
          value: '0',
          data: '0x',
        })],
      })),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    document.querySelector('[data-ops-history-row]').click();
    await flushPromises();

    expect(detailValue('operation')).toBe('Relinquish Tokens');
    expect(detailValue('action')).toContain('Relinquish all vault tokens and halt the vault');
    expect(document.querySelector('[data-ops-detail-row="target"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="value"]')).toBeNull();
    expect(document.querySelector('[data-ops-detail-row="data"]')).toBeNull();
  });

  it('disables signing for expired operations', async () => {
    const expiredOperation = makeHistoryItem({
      operationId: OPERATION_ID_ONE,
      opType: 1,
      target: OLD_SIGNER,
      value: encodeAddressValue(NEW_SIGNER),
      expired: true,
    });
    installReadContract(expiredOperation);

    const historyService = {
      load: vi.fn(async () => ({
        items: [expiredOperation],
      })),
    };

    const tab = new OperationsTab({ operationsService: historyService });
    tab.load();
    await tab._syncAccess();
    tab._isActive = true;
    await tab._refreshRequestedOperations();

    document.querySelector('[data-ops-history-row]').click();
    await flushPromises();

    const signBtn = document.querySelector('[data-ops-sign-submit]');
    expect(signBtn.hidden).toBe(false);
    expect(signBtn.disabled).toBe(true);
    expect(signBtn.title).toBe('Operation expired.');
  });

});

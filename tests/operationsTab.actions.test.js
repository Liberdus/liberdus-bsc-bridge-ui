import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsTab } from '../js/components/operations-tab.js';
import { flushPromises, installCommonWindowStubs, setupOperationsTabDom } from './helpers/test-utils.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const NEXT_OWNER = '0x9999999999999999999999999999999999999999';
const OPERATION_ID = `0x${'1'.repeat(64)}`;

function makeTx(hash) {
  return {
    hash,
    wait: vi.fn(async () => ({ events: [] })),
  };
}

async function setupAdminTab({ isOwner = true, isSigner = false } = {}) {
  window.walletManager.isConnected = vi.fn(() => true);
  window.walletManager.getAddress = vi.fn(() => OWNER);
  window.walletManager.getSigner = vi.fn(() => ({
    signMessage: vi.fn(async () => '0xsigned'),
  }));
  window.contractManager.getAccessState = vi.fn(async () => ({
    owner: OWNER,
    isOwner,
    isSigner,
    ownerError: null,
    signerError: null,
    error: null,
  }));

  const tab = new OperationsTab();
  tab.load();
  await tab._syncAccess();
  return tab;
}

describe('OperationsTab action contract pinning', () => {
  beforeEach(() => {
    setupOperationsTabDom();
    installCommonWindowStubs();
    window.ethers.utils.arrayify = vi.fn((value) => value);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('pins request-operation writes to the contract selected before the wallet prompt', async () => {
    const sourceContract = { requestOperation: vi.fn(async () => makeTx('0xsource')) };
    const destinationContract = { requestOperation: vi.fn(async () => makeTx('0xdestination')) };
    window.contractManager.getWriteContract = vi.fn((key) => (key === 'source' ? sourceContract : destinationContract));

    const tab = await setupAdminTab({ isOwner: true, isSigner: false });
    tab._selectedContractKey = 'source';
    tab._buildRequestOperationPayload = vi.fn(() => ({
      target: OWNER,
      value: 0,
      data: '0x',
    }));
    vi.spyOn(tab, '_ensureRequiredNetworkForAction').mockImplementation(async (_toastId, key) => {
      expect(key).toBe('source');
      tab._selectedContractKey = 'destination';
      return { switched: true, toastId: null };
    });

    await tab._requestOperation();

    expect(window.contractManager.getWriteContract).toHaveBeenCalledWith('source');
    expect(sourceContract.requestOperation).toHaveBeenCalledTimes(1);
    expect(destinationContract.requestOperation).not.toHaveBeenCalled();
    expect(window.contractManager.refreshStatus).toHaveBeenCalledWith({ key: 'source', reason: 'operationRequested' });
  });

  it('pins signature submissions to the contract selected before the wallet prompt', async () => {
    const sourceRead = { getOperationHash: vi.fn(async () => '0xhash') };
    const destinationRead = { getOperationHash: vi.fn(async () => '0xotherhash') };
    const sourceWrite = { submitSignature: vi.fn(async () => makeTx('0xsource')) };
    const destinationWrite = { submitSignature: vi.fn(async () => makeTx('0xdestination')) };
    window.contractManager.getReadContract = vi.fn((key) => (key === 'source' ? sourceRead : destinationRead));
    window.contractManager.getWriteContract = vi.fn((key) => (key === 'source' ? sourceWrite : destinationWrite));

    const tab = await setupAdminTab({ isOwner: false, isSigner: true });
    tab._selectedContractKey = 'source';
    tab._selectedOperation = {
      operationId: OPERATION_ID,
      opType: 0,
      executed: false,
      expired: false,
    };
    vi.spyOn(tab, '_ensureRequiredNetworkForAction').mockImplementation(async (_toastId, key) => {
      expect(key).toBe('source');
      tab._selectedContractKey = 'destination';
      return { switched: true, toastId: null };
    });

    await tab._signAndSubmit();

    expect(window.contractManager.getReadContract).toHaveBeenCalledWith('source');
    expect(window.contractManager.getWriteContract).toHaveBeenCalledWith('source');
    expect(sourceRead.getOperationHash).toHaveBeenCalledWith(OPERATION_ID);
    expect(sourceWrite.submitSignature).toHaveBeenCalledWith(OPERATION_ID, '0xsigned');
    expect(destinationWrite.submitSignature).not.toHaveBeenCalled();
    expect(window.contractManager.refreshStatus).toHaveBeenCalledWith({ key: 'source', reason: 'signatureSubmitted' });
  });

  it('pins ownership transfers to the contract selected before the wallet prompt', async () => {
    const sourceContract = { transferOwnership: vi.fn(async () => makeTx('0xsource')) };
    const destinationContract = { transferOwnership: vi.fn(async () => makeTx('0xdestination')) };
    window.contractManager.getWriteContract = vi.fn((key) => (key === 'source' ? sourceContract : destinationContract));

    const tab = await setupAdminTab({ isOwner: true, isSigner: false });
    tab._selectedContractKey = 'source';
    const input = document.querySelector('[data-ops-new-owner]');
    input.value = NEXT_OWNER;
    vi.spyOn(tab, '_ensureRequiredNetworkForAction').mockImplementation(async (_toastId, key) => {
      expect(key).toBe('source');
      tab._selectedContractKey = 'destination';
      return { switched: true, toastId: null };
    });

    await tab._transferOwnership();

    expect(window.contractManager.getWriteContract).toHaveBeenCalledWith('source');
    expect(sourceContract.transferOwnership).toHaveBeenCalledWith(NEXT_OWNER);
    expect(destinationContract.transferOwnership).not.toHaveBeenCalled();
    expect(window.contractManager.refreshStatus).toHaveBeenCalledWith({ key: 'source', reason: 'ownershipTransferred' });
  });
});

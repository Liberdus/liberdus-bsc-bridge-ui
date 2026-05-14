import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsTab } from '../js/components/operations-tab.js';
import { flushPromises, installCommonWindowStubs, setupOperationsTabDom } from './helpers/test-utils.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const NEXT_OWNER = '0x9999999999999999999999999999999999999999';
const NEXT_SIGNER = '0x2222222222222222222222222222222222222222';
const BRIDGE_IN_CALLER = '0x3333333333333333333333333333333333333333';
const OPERATION_ID = `0x${'1'.repeat(64)}`;
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

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

function installPayloadEthersStubs() {
  window.ethers.constants = {
    AddressZero: ADDRESS_ZERO,
    Zero: '0',
  };
  window.ethers.BigNumber = {
    from: vi.fn((value) => ({ kind: 'BigNumber', value, toString: () => String(value) })),
  };
  window.ethers.utils.parseUnits = vi.fn((value, decimals) => `parsed:${value}:${decimals}`);
  window.ethers.utils.defaultAbiCoder = {
    encode: vi.fn((types, values) => `encoded:${types.join(',')}:${values.join(',')}`),
  };
}

function setInputValue(selector, value) {
  const input = document.querySelector(selector);
  input.value = value;
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

  it.each([
    {
      contractKey: 'source',
      opType: 0,
      name: 'source set bridge out amount',
      fill: () => setInputValue('[data-op-amount]', '123.45'),
      expected: {
        target: ADDRESS_ZERO,
        value: 'parsed:123.45:18',
        data: '0x',
      },
    },
    {
      contractKey: 'source',
      opType: 1,
      name: 'source update signer',
      fill: () => {
        setInputValue('[data-op-old-signer]', OWNER);
        setInputValue('[data-op-new-signer]', NEXT_SIGNER);
      },
      expected: {
        target: OWNER,
        value: expect.objectContaining({ kind: 'BigNumber', value: NEXT_SIGNER }),
        data: '0x',
      },
    },
    {
      contractKey: 'source',
      opType: 2,
      name: 'source set bridge out enabled',
      fill: () => setInputValue('[data-op-enabled]', 'false'),
      expected: {
        target: ADDRESS_ZERO,
        value: '0',
        data: 'encoded:bool:false',
      },
    },
    {
      contractKey: 'source',
      opType: 3,
      name: 'source relinquish tokens',
      fill: () => {},
      expected: {
        target: ADDRESS_ZERO,
        value: '0',
        data: '0x',
      },
    },
    {
      contractKey: 'destination',
      opType: 0,
      name: 'destination set bridge in caller',
      fill: () => setInputValue('[data-op-dest-bridge-in-caller]', BRIDGE_IN_CALLER),
      expected: {
        target: BRIDGE_IN_CALLER,
        value: '0',
        data: '0x',
      },
    },
    {
      contractKey: 'destination',
      opType: 1,
      name: 'destination set bridge in limits',
      fill: () => {
        setInputValue('[data-op-dest-bridge-in-amount]', '456.78');
        setInputValue('[data-op-dest-bridge-in-cooldown]', '60');
      },
      expected: {
        target: ADDRESS_ZERO,
        value: 'parsed:456.78:18',
        data: 'encoded:uint256:60',
      },
    },
    {
      contractKey: 'destination',
      opType: 2,
      name: 'destination update signer',
      fill: () => {
        setInputValue('[data-op-old-signer]', OWNER);
        setInputValue('[data-op-new-signer]', NEXT_SIGNER);
      },
      expected: {
        target: OWNER,
        value: expect.objectContaining({ kind: 'BigNumber', value: NEXT_SIGNER }),
        data: '0x',
      },
    },
    {
      contractKey: 'destination',
      opType: 3,
      name: 'destination set bridge in enabled',
      fill: () => setInputValue('[data-op-dest-bridge-in-enabled]', 'false'),
      expected: {
        target: ADDRESS_ZERO,
        value: '0',
        data: 'encoded:bool:false',
      },
    },
    {
      contractKey: 'destination',
      opType: 4,
      name: 'destination set bridge out enabled',
      fill: () => setInputValue('[data-op-dest-bridge-out-enabled]', 'false'),
      expected: {
        target: ADDRESS_ZERO,
        value: '0',
        data: 'encoded:bool:false',
      },
    },
    {
      contractKey: 'destination',
      opType: 5,
      name: 'destination set min bridge out amount',
      fill: () => setInputValue('[data-op-dest-min-bridge-out-amount]', '0.5'),
      expected: {
        target: ADDRESS_ZERO,
        value: 'parsed:0.5:18',
        data: '0x',
      },
    },
  ])('builds a complete request payload for $name', async ({ contractKey, opType, fill, expected }) => {
    installPayloadEthersStubs();
    const tab = await setupAdminTab({ isOwner: true, isSigner: false });
    tab._selectedContractKey = contractKey;
    fill();

    const payload = tab._buildRequestOperationPayload(opType, contractKey);

    expect(payload).toEqual(expected);
    expect(payload.target).toBeDefined();
    expect(payload.value).toBeDefined();
    expect(payload.data).toBeDefined();
  });
});

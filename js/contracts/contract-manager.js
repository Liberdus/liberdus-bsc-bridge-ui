import { CONFIG } from '../config.js';
import { getReadOnlyProvider } from '../utils/read-only-provider.js';
import { createUnavailableVaultOperation, normalizeVaultOperation } from '../utils/vault-operations.js';

export class ContractManager {
  constructor({ walletManager, networkManager } = {}) {
    this.walletManager = walletManager || null;
    this.networkManager = networkManager || null;

    this.readOnlyProvider = null;
    this.provider = null;
    this.signer = null;

    this.abi = null;
    this.contractRead = null;
    this.contractWrite = null;

    this._statusSnapshot = this._emptySnapshot();
    this._loadPromise = null;
    this._walletEventsBound = false;
  }

  load() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._load().catch((error) => {
      this._loadPromise = null;
      throw error;
    });
    return this._loadPromise;
  }

  async _load() {
    if (!window.ethers) {
      throw new Error('Ethers.js not loaded');
    }

    this.readOnlyProvider = await getReadOnlyProvider();
    this.abi = await this._fetchAbi();

    this.updateConnections({ reason: 'load' });
    this._bindWalletEvents();
    await this.refreshStatus({ reason: 'load' });
  }

  async _fetchAbi() {
    const abiPath = CONFIG.BRIDGE.CONTRACTS.SOURCE.ABI_PATH;
    const response = await fetch(abiPath, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load ABI (${abiPath}): ${response.status}`);
    }

    const json = await response.json();
    const abi = Array.isArray(json) ? json : json?.abi;
    if (!Array.isArray(abi)) {
      throw new Error('Invalid ABI format: expected ABI array or { abi: [] }');
    }

    return abi;
  }

  _bindWalletEvents() {
    if (this._walletEventsBound) return;
    this._walletEventsBound = true;

    const syncOnWalletEvent = () => {
      this.updateConnections({ reason: 'connectionsChanged' });
      this.refreshStatus({ reason: 'connectionsChanged' }).catch(() => {});
    };

    document.addEventListener('walletConnected', syncOnWalletEvent);
    document.addEventListener('walletDisconnected', syncOnWalletEvent);
    document.addEventListener('walletAccountChanged', syncOnWalletEvent);
    document.addEventListener('walletChainChanged', syncOnWalletEvent);
    document.addEventListener('walletProvidersChanged', syncOnWalletEvent);
  }

  _makeContract(signerOrProvider) {
    const address = CONFIG.BRIDGE.CONTRACTS.SOURCE.ADDRESS;
    if (!address || !this.abi || !signerOrProvider || !window.ethers) return null;
    return new window.ethers.Contract(address, this.abi, signerOrProvider);
  }

  updateConnections({ reason = 'updated' } = {}) {
    const txEnabled = !!this.networkManager?.isTxEnabled?.();
    // Keep read traffic on the public RPC to avoid MetaMask provider churn during chain switches.
    const readProvider = this.readOnlyProvider || this.walletManager?.getProvider?.() || null;
    this.provider = readProvider;
    this.signer = txEnabled ? this.walletManager?.getSigner?.() || null : null;

    this.contractRead = this._makeContract(readProvider);
    this.contractWrite = this.signer ? this._makeContract(this.signer) : null;

    this._emitUpdatedEvent({ reason });
  }

  isReady() {
    return !!this.contractRead;
  }

  getReadOnlyProvider() {
    return this.readOnlyProvider || this.provider || null;
  }

  getReadContract() {
    return this.contractRead;
  }

  getWriteContract() {
    return this.contractWrite;
  }

  async getOperationsBatch(operationIds) {
    const contract = this.getReadContract();
    if (!contract) return new Map();
    if (!Array.isArray(operationIds) || operationIds.length === 0) return new Map();

    const results = await Promise.allSettled(operationIds.map(async (operationId) => {
      const [operation, expired] = await Promise.all([
        contract.operations(operationId),
        contract.isOperationExpired(operationId),
      ]);

      return normalizeVaultOperation(operationId, operation, expired);
    }));

    const out = new Map();
    results.forEach((result, index) => {
      const operationId = operationIds[index];
      if (result.status === 'fulfilled') {
        out.set(operationId, result.value);
        return;
      }

      out.set(operationId, createUnavailableVaultOperation(operationId));
    });

    return out;
  }

  getStatusSnapshot() {
    return { ...this._statusSnapshot, signers: [...(this._statusSnapshot.signers || [])] };
  }

  async getAccessState(address) {
    const normalizedAddress = this._normalizeAddress(address);
    const contract = this.getReadContract();

    if (!normalizedAddress) {
      return {
        address: null,
        owner: null,
        isOwner: false,
        isSigner: false,
        ownerError: null,
        signerError: null,
        error: 'Invalid address',
      };
    }

    if (!contract) {
      return {
        address: normalizedAddress,
        owner: null,
        isOwner: false,
        isSigner: false,
        ownerError: null,
        signerError: null,
        error: 'Contract not ready',
      };
    }

    const [ownerResult, signerResult] = await Promise.all([
      this._safeRead(contract, 'owner'),
      this._safeRead(contract, 'isSigner', [normalizedAddress]),
    ]);

    const owner = this._normalizeAddress(ownerResult.value);
    const isOwner = !!owner && owner === normalizedAddress;
    const isSigner = !signerResult.error && !!signerResult.value;
    const error = ownerResult.error || signerResult.error || null;

    return {
      address: normalizedAddress,
      owner,
      isOwner,
      isSigner,
      ownerError: ownerResult.error,
      signerError: signerResult.error,
      error,
    };
  }

  async refreshStatus({ reason = 'refresh' } = {}) {
    const snapshot = this._emptySnapshot();
    const contract = this.getReadContract();

    if (!contract) {
      snapshot.error = 'Contract not ready';
      this._statusSnapshot = snapshot;
      this._emitUpdatedEvent({ reason });
      return this.getStatusSnapshot();
    }

    const [
      onChainId,
      chainId,
      owner,
      operationCount,
      operationDeadline,
      token,
      requiredSignatures,
      bridgeOutEnabled,
      halted,
      maxBridgeOutAmount,
      vaultBalance,
      signer0,
      signer1,
      signer2,
      signer3,
    ] = await Promise.all([
      this._safeRead(contract, 'getChainId'),
      this._safeRead(contract, 'chainId'),
      this._safeRead(contract, 'owner'),
      this._safeRead(contract, 'operationCount'),
      this._safeRead(contract, 'OPERATION_DEADLINE'),
      this._safeRead(contract, 'token'),
      this._safeRead(contract, 'REQUIRED_SIGNATURES'),
      this._safeRead(contract, 'bridgeOutEnabled'),
      this._safeRead(contract, 'halted'),
      this._safeRead(contract, 'maxBridgeOutAmount'),
      this._safeRead(contract, 'getVaultBalance'),
      this._safeRead(contract, 'signers', [0]),
      this._safeRead(contract, 'signers', [1]),
      this._safeRead(contract, 'signers', [2]),
      this._safeRead(contract, 'signers', [3]),
    ]);

    snapshot.onChainId = this._toNumberOrNull(onChainId.value);
    snapshot.onChainChainId = this._toNumberOrNull(chainId.value);
    snapshot.owner = owner.value ? String(owner.value) : null;
    snapshot.operationCount = this._toNumberOrNull(operationCount.value);
    snapshot.operationDeadlineSeconds = this._toNumberOrNull(operationDeadline.value);
    snapshot.token = token.value ? String(token.value) : null;
    snapshot.requiredSignatures = this._toNumberOrNull(requiredSignatures.value);
    snapshot.bridgeOutEnabled = this._toBoolOrNull(bridgeOutEnabled.value);
    snapshot.halted = this._toBoolOrNull(halted.value);
    snapshot.maxBridgeOutAmount = this._toStringOrNull(maxBridgeOutAmount.value);
    snapshot.vaultBalance = this._toStringOrNull(vaultBalance.value);
    snapshot.signers = [signer0.value, signer1.value, signer2.value, signer3.value]
      .map((v) => (v ? String(v) : null))
      .filter(Boolean);

    snapshot.errors = {
      getChainId: onChainId.error,
      chainId: chainId.error,
      owner: owner.error,
      operationCount: operationCount.error,
      OPERATION_DEADLINE: operationDeadline.error,
      token: token.error,
      REQUIRED_SIGNATURES: requiredSignatures.error,
      bridgeOutEnabled: bridgeOutEnabled.error,
      halted: halted.error,
      maxBridgeOutAmount: maxBridgeOutAmount.error,
      getVaultBalance: vaultBalance.error,
      signers0: signer0.error,
      signers1: signer1.error,
      signers2: signer2.error,
      signers3: signer3.error,
    };

    const firstError = Object.values(snapshot.errors).find((v) => !!v) || null;
    snapshot.error = firstError;

    this._statusSnapshot = snapshot;
    this._emitUpdatedEvent({ reason });
    return this.getStatusSnapshot();
  }

  async _safeRead(contract, methodName, args = []) {
    if (!contract || typeof contract[methodName] !== 'function') {
      return { value: null, error: `${methodName}() not available on ABI` };
    }

    try {
      const value = await contract[methodName](...args);
      return { value, error: null };
    } catch (error) {
      return {
        value: null,
        error: error?.reason || error?.message || `Failed to call ${methodName}()`,
      };
    }
  }

  _emptySnapshot() {
    return {
      configuredAddress: CONFIG.BRIDGE.CONTRACTS.SOURCE.ADDRESS,
      configuredChainId: CONFIG.BRIDGE.CHAINS.SOURCE.CHAIN_ID,
      onChainId: null,
      onChainChainId: null,
      owner: null,
      operationCount: null,
      operationDeadlineSeconds: null,
      token: null,
      requiredSignatures: null,
      bridgeOutEnabled: null,
      halted: null,
      maxBridgeOutAmount: null,
      vaultBalance: null,
      signers: [],
      errors: {},
      error: null,
      lastUpdatedAt: Date.now(),
    };
  }

  _toNumberOrNull(value) {
    if (value == null) return null;
    const n = Number(value?.toString?.() ?? value);
    return Number.isFinite(n) ? n : null;
  }

  _toBoolOrNull(value) {
    if (value == null) return null;
    return Boolean(value);
  }

  _toStringOrNull(value) {
    if (value == null) return null;
    return String(value?.toString?.() ?? value);
  }

  _normalizeAddress(value) {
    if (!value || !window.ethers?.utils?.getAddress) return null;
    try {
      return window.ethers.utils.getAddress(String(value));
    } catch {
      return null;
    }
  }

  _emitUpdatedEvent({ reason = 'updated' } = {}) {
    document.dispatchEvent(
      new CustomEvent('contractManagerUpdated', {
        detail: {
          reason,
          txEnabled: !!this.networkManager?.isTxEnabled?.(),
          ready: this.isReady(),
          address: CONFIG.BRIDGE.CONTRACTS.SOURCE.ADDRESS,
          chainId: CONFIG.BRIDGE.CHAINS.SOURCE.CHAIN_ID,
          status: this.getStatusSnapshot(),
        },
      })
    );
  }
}

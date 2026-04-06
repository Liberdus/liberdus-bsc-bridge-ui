import { getReadOnlyProviderForNetwork } from '../utils/read-only-provider.js';
import { createUnavailableVaultOperation, normalizeVaultOperation } from '../utils/vault-operations.js';
import { CONTRACT_KEYS, getContractConfig, getContractMetadata, getNetworkConfig, normalizeContractKey } from './contract-types.js';

export class ContractManager {
  constructor({ walletManager, networkManager } = {}) {
    this.walletManager = walletManager || null;
    this.networkManager = networkManager || null;

    this._contexts = Object.fromEntries(CONTRACT_KEYS.map((key) => [key, this._createContext(key)]));
    this._loadPromise = null;
    this._walletEventsBound = false;
  }

  get readOnlyProvider() {
    return this.getReadOnlyProvider('source');
  }

  set readOnlyProvider(value) {
    this.getContext('source').readOnlyProvider = value;
  }

  get provider() {
    return this.getContext('source').provider;
  }

  set provider(value) {
    this.getContext('source').provider = value;
  }

  get signer() {
    return this.getContext('source').signer;
  }

  set signer(value) {
    this.getContext('source').signer = value;
  }

  get abi() {
    return this.getContext('source').abi;
  }

  set abi(value) {
    this.getContext('source').abi = value;
  }

  get contractRead() {
    return this.getContext('source').contractRead;
  }

  set contractRead(value) {
    this.getContext('source').contractRead = value;
  }

  get contractWrite() {
    return this.getContext('source').contractWrite;
  }

  set contractWrite(value) {
    this.getContext('source').contractWrite = value;
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

    const results = await Promise.allSettled(CONTRACT_KEYS.map((key) => this._loadContext(key)));
    const failures = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      const key = CONTRACT_KEYS[index];
      const label = getContractMetadata(key).label;
      const message = result.reason?.message || `Failed to initialize ${label}`;
      failures.push({ key, label, message });
      console.warn('[ContractManager] Context load failed', { key, label, error: result.reason });
    });

    this.updateConnections({ reason: 'load' });
    this._bindWalletEvents();
    await this.refreshAllStatus({ reason: 'load' });

    if (failures.length === CONTRACT_KEYS.length) {
      throw new Error(failures.map(({ label, message }) => `${label}: ${message}`).join(' | '));
    }
  }

  async _loadContext(key) {
    const context = this.getContext(key);
    context.loadError = null;

    const [abiResult, providerResult] = await Promise.allSettled([
      context.abi ? Promise.resolve(context.abi) : this._fetchAbi(key),
      getReadOnlyProviderForNetwork(getNetworkConfig(key)),
    ]);

    if (abiResult.status === 'fulfilled') {
      context.abi = abiResult.value;
    }

    if (providerResult.status === 'fulfilled') {
      context.readOnlyProvider = providerResult.value;
    } else {
      context.readOnlyProvider = null;
    }

    const failures = [abiResult, providerResult].filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      const failureMessages = failures.map((result) => result.reason?.message).filter(Boolean);
      context.loadError =
        failureMessages[0] ||
        `Failed to initialize ${getContractMetadata(key).label}`;
      throw failures[0].reason;
    }
  }

  async _fetchAbi(key) {
    const abiPath = getContractConfig(key)?.ABI_PATH;
    const label = getContractMetadata(key).label;
    const response = await fetch(abiPath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load ABI for ${label} (${abiPath}): ${response.status}`);
    }

    const json = await response.json();
    const abi = Array.isArray(json) ? json : json?.abi;
    if (!Array.isArray(abi)) {
      throw new Error(`Invalid ABI format for ${label}: expected ABI array or { abi: [] }`);
    }

    return abi;
  }

  _createContext(key) {
    return {
      key,
      abi: null,
      readOnlyProvider: null,
      provider: null,
      signer: null,
      contractRead: null,
      contractWrite: null,
      loadError: null,
      statusSnapshot: this._emptySnapshot(key),
    };
  }

  _bindWalletEvents() {
    if (this._walletEventsBound) return;
    this._walletEventsBound = true;

    const syncOnWalletEvent = () => {
      this.updateConnections({ reason: 'connectionsChanged' });
      this.refreshAllStatus({ reason: 'connectionsChanged' }).catch(() => {});
    };

    document.addEventListener('walletConnected', syncOnWalletEvent);
    document.addEventListener('walletDisconnected', syncOnWalletEvent);
    document.addEventListener('walletAccountChanged', syncOnWalletEvent);
    document.addEventListener('walletChainChanged', syncOnWalletEvent);
    document.addEventListener('walletProvidersChanged', syncOnWalletEvent);
  }

  _makeContract(key, signerOrProvider) {
    const address = getContractConfig(key)?.ADDRESS;
    const abi = this.getAbi(key);
    if (!address || !abi || !signerOrProvider || !window.ethers) return null;
    return new window.ethers.Contract(address, abi, signerOrProvider);
  }

  updateConnections({ reason = 'updated' } = {}) {
    for (const key of CONTRACT_KEYS) {
      const context = this.getContext(key);
      const txEnabled = !!this.networkManager?.isTxEnabledFor?.(key);
      const readProvider = context.readOnlyProvider || this.walletManager?.getProvider?.() || null;

      context.provider = readProvider;
      context.signer = txEnabled ? this.walletManager?.getSigner?.() || null : null;
      context.contractRead = this._makeContract(key, readProvider);
      context.contractWrite = context.signer ? this._makeContract(key, context.signer) : null;
    }

    this._emitUpdatedEvent({ reason });
  }

  getContext(key = 'source') {
    return this._contexts[normalizeContractKey(key)] || this._contexts.source;
  }

  isReady(key = 'source') {
    return !!this.getReadContract(key);
  }

  areAllContextsReady() {
    return CONTRACT_KEYS.every((key) => this.isReady(key));
  }

  getAbi(key = 'source') {
    return this.getContext(key).abi;
  }

  getReadOnlyProvider(key = 'source') {
    const context = this.getContext(key);
    return context.readOnlyProvider || context.provider || null;
  }

  getReadContract(key = 'source') {
    return this.getContext(key).contractRead;
  }

  getWriteContract(key = 'source') {
    return this.getContext(key).contractWrite;
  }

  async getOperationsBatch(operationIds, key = 'source') {
    const contract = this.getReadContract(key);
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

  getStatusSnapshot(key = 'source') {
    const snapshot = this.getContext(key).statusSnapshot;
    return {
      ...snapshot,
      signers: [...(snapshot.signers || [])],
      errors: { ...(snapshot.errors || {}) },
    };
  }

  getStatusSnapshots() {
    return Object.fromEntries(CONTRACT_KEYS.map((key) => [key, this.getStatusSnapshot(key)]));
  }

  async getAccessState(address, key = 'source') {
    const normalizedKey = normalizeContractKey(key);
    const normalizedAddress = this._normalizeAddress(address);
    const contract = this.getReadContract(normalizedKey);

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
        error: this._contractNotReadyError(normalizedKey),
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

  async refreshAllStatus({ reason = 'refresh' } = {}) {
    const entries = await Promise.all(
      CONTRACT_KEYS.map(async (key) => [key, await this.refreshStatus({ key, reason })])
    );
    return Object.fromEntries(entries);
  }

  async refreshStatus({ key = 'source', reason = 'refresh' } = {}) {
    const normalizedKey = normalizeContractKey(key);
    const snapshot = this._emptySnapshot(normalizedKey);
    const contract = this.getReadContract(normalizedKey);

    if (!contract) {
      snapshot.error = this._contractNotReadyError(normalizedKey);
      this.getContext(normalizedKey).statusSnapshot = snapshot;
      this._emitUpdatedEvent({ reason, key: normalizedKey });
      return this.getStatusSnapshot(normalizedKey);
    }

    const readers = this._getStatusReaders(normalizedKey);
    const results = await Promise.all(
      readers.map(({ methodName, args = [] }) => this._safeRead(contract, methodName, args))
    );

    readers.forEach((reader, index) => {
      const result = results[index];
      snapshot.errors[reader.errorKey] = result.error;
      reader.apply(snapshot, result.value);
    });

    const firstError = Object.values(snapshot.errors).find((value) => !!value) || null;
    snapshot.error = firstError;
    snapshot.lastUpdatedAt = Date.now();

    this.getContext(normalizedKey).statusSnapshot = snapshot;
    this._emitUpdatedEvent({ reason, key: normalizedKey });
    return this.getStatusSnapshot(normalizedKey);
  }

  _getStatusReaders(key) {
    const shared = [
      this._reader('onChainId', 'getChainId', this._toNumberOrNull),
      this._reader('onChainChainId', 'chainId', this._toNumberOrNull),
      this._reader('owner', 'owner', this._toStringOrNull),
      this._reader('operationCount', 'operationCount', this._toNumberOrNull),
      this._reader('operationDeadlineSeconds', 'OPERATION_DEADLINE', this._toNumberOrNull),
      this._reader('requiredSignatures', 'REQUIRED_SIGNATURES', this._toNumberOrNull),
      this._reader('bridgeOutEnabled', 'bridgeOutEnabled', this._toBoolOrNull),
      this._signerReader(0),
      this._signerReader(1),
      this._signerReader(2),
      this._signerReader(3),
    ];

    if (key === 'destination') {
      return [
        ...shared,
        this._reader('name', 'name', this._toStringOrNull),
        this._reader('symbol', 'symbol', this._toStringOrNull),
        this._reader('totalSupply', 'totalSupply', this._toStringOrNull),
        this._reader('bridgeInCaller', 'bridgeInCaller', this._toStringOrNull),
        this._reader('maxBridgeInAmount', 'maxBridgeInAmount', this._toStringOrNull),
        this._reader('minBridgeOutAmount', 'minBridgeOutAmount', this._toStringOrNull),
        this._reader('bridgeInCooldown', 'bridgeInCooldown', this._toNumberOrNull),
        this._reader('lastBridgeInTime', 'lastBridgeInTime', this._toNumberOrNull),
        this._reader('bridgeInEnabled', 'bridgeInEnabled', this._toBoolOrNull),
      ];
    }

    return [
      ...shared,
      this._reader('token', 'token', this._toStringOrNull),
      this._reader('halted', 'halted', this._toBoolOrNull),
      this._reader('maxBridgeOutAmount', 'maxBridgeOutAmount', this._toStringOrNull),
      this._reader('vaultBalance', 'getVaultBalance', this._toStringOrNull),
    ];
  }

  _reader(field, methodName, transform = null, args = []) {
    return {
      field,
      methodName,
      args,
      errorKey: methodName,
      apply: (snapshot, value) => {
        snapshot[field] = typeof transform === 'function' ? transform.call(this, value) : value;
      },
    };
  }

  _signerReader(index) {
    return {
      field: `signers${index}`,
      methodName: 'signers',
      args: [index],
      errorKey: `signers${index}`,
      apply: (snapshot, value) => {
        if (!value) return;
        const signer = String(value);
        if (!snapshot.signers.includes(signer)) {
          snapshot.signers.push(signer);
        }
      },
    };
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

  _emptySnapshot(key) {
    const metadata = getContractMetadata(key);
    const contractConfig = getContractConfig(key);
    const networkConfig = getNetworkConfig(key);

    return {
      contractKey: metadata.key,
      contractLabel: metadata.label,
      shortLabel: metadata.shortLabel,
      configuredAddress: contractConfig?.ADDRESS || null,
      configuredChainId: networkConfig?.CHAIN_ID ?? null,
      configuredNetworkName: networkConfig?.NAME || null,
      onChainId: null,
      onChainChainId: null,
      owner: null,
      operationCount: null,
      operationDeadlineSeconds: null,
      requiredSignatures: null,
      bridgeOutEnabled: null,
      signers: [],
      errors: {},
      error: null,
      lastUpdatedAt: Date.now(),
      token: null,
      halted: null,
      maxBridgeOutAmount: null,
      vaultBalance: null,
      name: null,
      symbol: null,
      totalSupply: null,
      bridgeInCaller: null,
      maxBridgeInAmount: null,
      minBridgeOutAmount: null,
      bridgeInCooldown: null,
      lastBridgeInTime: null,
      bridgeInEnabled: null,
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

  _contractNotReadyError(key = 'source') {
    return this.getContext(key).loadError || 'Contract not ready';
  }

  _emitUpdatedEvent({ reason = 'updated', key = null } = {}) {
    const status = this.getStatusSnapshot('source');
    const statuses = this.getStatusSnapshots();
    document.dispatchEvent(
      new CustomEvent('contractManagerUpdated', {
        detail: {
          reason,
          key,
          txEnabled: !!this.networkManager?.isTxEnabled?.(),
          txEnabledByKey: Object.fromEntries(CONTRACT_KEYS.map((contractKey) => [contractKey, !!this.networkManager?.isTxEnabledFor?.(contractKey)])),
          ready: this.isReady('source'),
          readyByKey: Object.fromEntries(CONTRACT_KEYS.map((contractKey) => [contractKey, this.isReady(contractKey)])),
          address: getContractConfig('source')?.ADDRESS || null,
          chainId: getNetworkConfig('source')?.CHAIN_ID ?? null,
          status,
          statuses,
        },
      })
    );
  }
}

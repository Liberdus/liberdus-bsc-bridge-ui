import { MetaMaskConnector } from './metamask-connector.js';

/**
 * WalletManager
 * - Explicit injected-wallet selection
 * - Silent restore from the last selected wallet
 * - Dispatches DOM events:
 *   - walletConnected, walletDisconnected, walletAccountChanged, walletChainChanged
 */
export class WalletManager {
  constructor({
    storageKey = 'liberdus_token_ui_wallet_connection',
    lastSelectedWalletStorageKey = 'liberdus_token_ui_last_selected_wallet_id',
    userDisconnectedStorageKey = 'liberdus_token_ui_wallet_user_disconnected',
  } = {}) {
    this.storageKey = storageKey;
    this.lastSelectedWalletStorageKey = lastSelectedWalletStorageKey;
    this.userDisconnectedStorageKey = userDisconnectedStorageKey;

    this.connector = new MetaMaskConnector();
    this.provider = null; // ethers.providers.Web3Provider
    this.signer = null; // ethers.Signer
    this.address = null;
    this.chainId = null; // number
    this.walletType = null;
    this.walletId = null;
    this.walletName = null;

    this.isConnecting = false;
    this._connectionPromise = null;
    this._restoreConnectionPromise = null;
    this._disconnectProbeToken = 0;
  }

  load() {
    this.connector.onWalletsChanged = () => {
      void this._maybeRestorePreviousConnection();
    };
    this.connector.onAccountsChanged = (accounts) => this._handleAccountsChanged(accounts);
    this.connector.onConnect = (connectInfo) => this._handleProviderConnect(connectInfo);
    this.connector.onChainChanged = (chainId) => this._handleChainChanged(chainId);
    this.connector.onDisconnected = (error) => this._handleDisconnected(error);

    this.connector.load();
  }

  async init() {
    await this._maybeRestorePreviousConnection();
  }

  isConnected() {
    return !!(this.address && this.provider && this.signer);
  }

  getAddress() {
    return this.address;
  }

  getChainId() {
    return this.chainId;
  }

  getProvider() {
    return this.provider;
  }

  getSigner() {
    return this.signer;
  }

  getLastSelectedWalletId() {
    return this._readStorageString(this.lastSelectedWalletStorageKey);
  }

  getAvailableWallets() {
    return this.connector?.getAvailableWallets?.() || [];
  }

  hasAvailableWallets() {
    return !!this.connector?.hasAvailableWallets?.();
  }

  getWalletById(walletId) {
    return this.connector?.getWalletById?.(walletId) || null;
  }

  async getEip1193Provider(options = {}) {
    return await this.connector?.getEip1193Provider?.(options);
  }

  async connect({ walletId = null, userInitiated = false } = {}) {
    if (this._connectionPromise) return this._connectionPromise;
    this._connectionPromise = this._performConnect({ walletId, userInitiated });
    try {
      return await this._connectionPromise;
    } finally {
      this._connectionPromise = null;
    }
  }

  async _performConnect({ walletId = null, userInitiated = false } = {}) {
    if (!this.hasAvailableWallets()) {
      throw new Error('No injected wallet detected');
    }
    if (!walletId) {
      throw new Error('Choose a wallet to connect');
    }
    if (this.isConnected()) {
      return {
        success: true,
        address: this.address,
        chainId: this.chainId,
        walletType: this.walletType,
        walletId: this.walletId,
        walletName: this.walletName,
      };
    }

    this.isConnecting = true;
    try {
      const result = await this.connector.connect(walletId);
      const wallet = result.wallet || this.getWalletById(walletId);
      this._applyConnectedSession({
        provider: result.provider,
        signer: result.signer,
        address: result.account,
        chainId: result.chainId,
        wallet,
      });

      this._setLastSelectedWalletId(wallet?.id || walletId);
      this._setUserDisconnected(false);
      this._storeConnectionInfo();

      const data = this._currentWalletData({ userInitiated });
      this._notify('connected', data);

      return { success: true, ...data };
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect() {
    const disconnectData = this._currentWalletData({ userInitiated: true });
    await this.connector.disconnect({ revokePermissions: true });
    this._setUserDisconnected(true);
    this._clearStateAndNotifyDisconnect(disconnectData);
  }

  async checkPreviousConnection() {
    if (this.hasUserDisconnected()) return false;
    if (!this.hasAvailableWallets()) return false;

    const stored = this._readConnectionInfo();
    const restoreWallet = this._resolveRestoreWallet(stored);
    if (!restoreWallet?.id) return false;

    try {
      const eip1193Provider = await this.getEip1193Provider({ walletId: restoreWallet.id, waitMs: 200 });
      if (!eip1193Provider) return false;

      const accounts = await this.connector.getAccounts({ walletId: restoreWallet.id, waitMs: 200 });
      if (!accounts || accounts.length === 0) {
        this._clearConnectionInfo();
        return false;
      }

      if (!window.ethers) return false;

      const provider = new window.ethers.providers.Web3Provider(eip1193Provider, 'any');
      const signer = provider.getSigner();
      const chainId = this._normalizeChainId(await eip1193Provider.request({ method: 'eth_chainId' }));

      this._applyConnectedSession({
        provider,
        signer,
        address: accounts[0],
        chainId,
        wallet: restoreWallet,
      });

      this._setLastSelectedWalletId(restoreWallet.id);
      this._setUserDisconnected(false);
      this._storeConnectionInfo();

      this._notify('connected', this._currentWalletData({ restored: true }));
      return true;
    } catch {
      this._clearConnectionInfo();
      return false;
    }
  }

  async _maybeRestorePreviousConnection() {
    if (this.isConnected()) return true;
    if (this.isConnecting || this._connectionPromise) return false;
    if (this.hasUserDisconnected()) return false;
    if (!this._hasStoredConnectionCandidate()) return false;

    if (this._restoreConnectionPromise) {
      return await this._restoreConnectionPromise;
    }

    this._restoreConnectionPromise = this.checkPreviousConnection();
    try {
      return await this._restoreConnectionPromise;
    } finally {
      this._restoreConnectionPromise = null;
    }
  }

  hasUserDisconnected() {
    return this._readStorageString(this.userDisconnectedStorageKey) === 'true';
  }

  _resolveRestoreWallet(stored) {
    const lastSelectedWalletId = this.getLastSelectedWalletId();
    if (lastSelectedWalletId) {
      const lastSelectedWallet = this.getWalletById(lastSelectedWalletId);
      if (lastSelectedWallet) return lastSelectedWallet;
    }

    const storedWalletId = normalizeStoredWalletId(stored?.walletId);
    if (storedWalletId) {
      const storedWallet = this.getWalletById(storedWalletId);
      if (storedWallet) return storedWallet;
    }

    if (!stored?.address) return null;

    const wallets = this.getAvailableWallets();
    if (wallets.length === 1) {
      return wallets[0];
    }

    return null;
  }

  _applyConnectedSession({ provider, signer, address, chainId, wallet }) {
    this.provider = provider || null;
    this.signer = signer || null;
    this.address = address || null;
    this.chainId = this._normalizeChainId(chainId);
    this.walletId = wallet?.id || null;
    this.walletName = wallet?.name || null;
    this.walletType = wallet?.rdns || wallet?.name || 'injected';

    this.connector.bindConnectedWallet(this.walletId, {
      account: this.address,
      chainId: this.chainId,
      provider: this.provider,
      signer: this.signer,
    });
  }

  _handleAccountsChanged(accounts) {
    this._cancelDisconnectProbe();

    if (!accounts || accounts.length === 0) {
      this._clearStateAndNotifyDisconnect(this._currentWalletData());
      return;
    }

    this.address = accounts[0];
    this.connector.account = this.address;
    this.connector.isConnected = true;
    this._storeConnectionInfo();
    this._notify('accountChanged', this._currentWalletData());
  }

  _handleProviderConnect(_connectInfo) {
    this._cancelDisconnectProbe();
    if (this.address) {
      this.connector.account = this.address;
      this.connector.isConnected = true;
    }
  }

  _handleChainChanged(chainId) {
    this._cancelDisconnectProbe();

    this.chainId = this._normalizeChainId(chainId);
    this.connector.chainId = this.chainId;
    if (this.address) this.connector.isConnected = true;
    this._storeConnectionInfo();
    this._notify('chainChanged', this._currentWalletData());
  }

  _handleDisconnected(_error) {
    if (!this.address && !this.provider && !this.signer) {
      this._clearStateAndNotifyDisconnect(this._currentWalletData());
      return;
    }

    const probeToken = this._startDisconnectProbe();
    this._verifyDisconnectProbe(probeToken).catch(() => {});
  }

  _notify(event, data) {
    const eventNameMap = {
      connected: 'walletConnected',
      disconnected: 'walletDisconnected',
      accountChanged: 'walletAccountChanged',
      chainChanged: 'walletChainChanged',
    };
    const domName = eventNameMap[event] || `wallet${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    document.dispatchEvent(new CustomEvent(domName, { detail: { event, data } }));
  }

  _currentWalletData(extra = {}) {
    return {
      address: this.address,
      chainId: this.chainId,
      walletType: this.walletType || 'injected',
      walletId: this.walletId || this.getLastSelectedWalletId() || null,
      walletName: this.walletName || this.getWalletById(this.getLastSelectedWalletId())?.name || null,
      ...extra,
    };
  }

  _storeConnectionInfo() {
    if (!this.address) return;
    const payload = {
      walletType: this.walletType || 'injected',
      walletId: this.walletId || null,
      walletName: this.walletName || null,
      address: this.address,
      chainId: this.chainId,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  _readConnectionInfo() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || 'null');
    } catch {
      return null;
    }
  }

  _hasStoredConnectionCandidate() {
    const stored = this._readConnectionInfo();
    return !!(
      this.getLastSelectedWalletId()
      || normalizeStoredWalletId(stored?.walletId)
      || stored?.address
    );
  }

  _clearConnectionInfo() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
  }

  _setLastSelectedWalletId(walletId) {
    try {
      if (!walletId) {
        localStorage.removeItem(this.lastSelectedWalletStorageKey);
        return;
      }
      localStorage.setItem(this.lastSelectedWalletStorageKey, String(walletId));
    } catch {
      // ignore
    }
  }

  _setUserDisconnected(value) {
    try {
      localStorage.setItem(this.userDisconnectedStorageKey, value ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  _readStorageString(key) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? null : String(value);
    } catch {
      return null;
    }
  }

  _clearStateAndNotifyDisconnect(disconnectData = {}) {
    const wasConnected = !!(
      this.provider
      || this.signer
      || this.address
      || this.walletType
      || this.walletId
      || this.walletName
      || this.chainId != null
    );

    this._cancelDisconnectProbe();
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.walletType = null;
    this.walletId = null;
    this.walletName = null;
    this.connector?.clearSession?.({ clearActiveWallet: true });

    this._clearConnectionInfo();
    if (wasConnected) {
      this._notify('disconnected', disconnectData);
    }
  }

  _startDisconnectProbe() {
    this._disconnectProbeToken += 1;
    return this._disconnectProbeToken;
  }

  _cancelDisconnectProbe() {
    this._disconnectProbeToken += 1;
  }

  async _verifyDisconnectProbe(probeToken) {
    const deadlineAt = Date.now() + 10000;
    const walletId = this.walletId;
    const disconnectData = this._currentWalletData();

    while (probeToken === this._disconnectProbeToken) {
      try {
        const walletProvider = await this.getEip1193Provider({ walletId, waitMs: 200 });
        if (!walletProvider?.request) throw new Error('Wallet not available');

        const [accounts, chainIdHex] = await Promise.all([
          this.connector?.getAccounts?.({ walletId, waitMs: 0 }),
          walletProvider.request({ method: 'eth_chainId' }),
        ]);
        if (probeToken !== this._disconnectProbeToken) return;

        if (Array.isArray(accounts)) {
          if (accounts.length === 0) {
            this._clearStateAndNotifyDisconnect(disconnectData);
            return;
          }

          const nextAddress = accounts[0];
          const nextChainId = this._normalizeChainId(chainIdHex);
          const addressChanged =
            String(nextAddress || '').toLowerCase() !== String(this.address || '').toLowerCase();
          const chainChanged = nextChainId != null && Number(nextChainId) !== Number(this.chainId);

          this.address = nextAddress;
          if (nextChainId != null) this.chainId = nextChainId;
          this.connector.account = nextAddress;
          if (nextChainId != null) this.connector.chainId = nextChainId;
          this.connector.isConnected = true;
          this._storeConnectionInfo();

          if (addressChanged) {
            this._notify('accountChanged', this._currentWalletData());
          }
          if (chainChanged) {
            this._notify('chainChanged', this._currentWalletData());
          }
          return;
        }
      } catch {
        // Ignore transient provider errors while the wallet is recovering.
      }

      if (Date.now() >= deadlineAt) {
        this._clearStateAndNotifyDisconnect(disconnectData);
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  _normalizeChainId(chainId) {
    let cid = chainId;
    if (typeof cid === 'string' && cid.startsWith('0x')) {
      try {
        cid = parseInt(cid, 16);
      } catch {
        cid = NaN;
      }
    }
    return Number(cid);
  }
}

function normalizeStoredWalletId(walletId) {
  return walletId == null ? null : String(walletId);
}

import { createWalletCore } from '../../vendor/liberdus-wallet-module/index.js';

const WALLET_SESSION_KEY = 'liberdus_bsc_bridge_ui:wallet-session';
const LEGACY_CONNECTION_STORAGE_KEY = 'liberdus_token_ui_wallet_connection';
const LEGACY_LAST_SELECTED_WALLET_STORAGE_KEY = 'liberdus_token_ui_last_selected_wallet_id';
const LEGACY_USER_DISCONNECTED_STORAGE_KEY = 'liberdus_token_ui_wallet_user_disconnected';

/**
 * WalletManager
 * - Explicit injected-wallet selection via wallet-core
 * - Silent restore from saved session (wallet-core owns persistence)
 * - Dispatches DOM events:
 *   - walletConnected, walletDisconnected, walletAccountChanged, walletChainChanged, walletProvidersChanged
 */
export class WalletManager {
  constructor() {
    this.walletCore = createWalletCore({
      storage: window.localStorage,
      walletSessionKey: WALLET_SESSION_KEY,
    });

    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.walletType = null;
    this.walletId = null;
    this.walletName = null;
    this._connectionPromise = null;
  }

  load() {
    this._clearLegacyStorageKeys();

    this.walletCore.subscribe((event, data) => {
      if (event === 'connected') {
        this._syncFromCoreState();
        this._notify('connected');
        return;
      }

      if (event === 'disconnected' || (event === 'accountChanged' && !data)) {
        const wasConnected = this._hasLocalWalletState();
        this._clearEthersState();
        if (wasConnected) {
          this._notify('disconnected');
        }
        return;
      }

      if (event === 'providersChanged') {
        if (this.isConnected() && this.walletCore.getState().account) {
          this._syncFromCoreState();
        }
        this._notify('providersChanged', { wallets: this.getAvailableWallets() });
        return;
      }

      if ((event === 'accountChanged' || event === 'chainChanged') && !this._hasActiveWalletSession()) {
        return;
      }

      if (event === 'accountChanged' || event === 'chainChanged') {
        this._syncFromCoreState();
        this._notify(event);
      }
    });

    void this.walletCore.discoverWallets().then(() => {
      this._notify('providersChanged', { wallets: this.getAvailableWallets() });
    });
  }

  async init() {
    return await this.checkPreviousConnection();
  }

  get isConnecting() {
    return !!this.walletCore.getState().isConnecting || !!this._connectionPromise;
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
    const state = this.walletCore.getState();
    return state.sessionWalletId || state.selectedWalletId || null;
  }

  getAvailableWallets() {
    return this._disambiguateWalletNames(
      this.walletCore.getAvailableWallets().map((wallet) => this._mapWallet(wallet))
    );
  }

  hasAvailableWallets() {
    return this.getAvailableWallets().length > 0;
  }

  getWalletById(walletId) {
    if (!walletId) return null;
    const wallet = this.walletCore.getAvailableWallets().find((entry) => entry.id === walletId);
    return wallet ? this._mapWallet(wallet) : null;
  }

  async getEip1193Provider({ walletId = null, waitMs = 0 } = {}) {
    if (walletId) {
      await this.walletCore.discoverWallets(waitMs);
      const wallet = await this.walletCore.resolveWalletById(walletId);
      if (!wallet?.provider) return null;
      this.walletCore.applyActiveWallet(wallet);
      return wallet.provider;
    }

    if (waitMs > 0 && !this.walletCore.getEip1193Provider()) {
      await this.walletCore.discoverWallets(waitMs);
    }
    return this.walletCore.getEip1193Provider();
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
    await this.walletCore.discoverWallets();

    if (!this.hasAvailableWallets()) {
      throw new Error('No injected wallet detected');
    }
    if (!walletId) {
      throw new Error('Choose a wallet to connect');
    }
    if (this.isConnected()) {
      return {
        success: true,
        ...this._currentWalletData({ userInitiated }),
      };
    }

    try {
      await this.walletCore.connect({ walletId });
    } catch (error) {
      throw this._normalizeWalletError(error);
    }

    const data = this._currentWalletData({ userInitiated });
    return { success: true, ...data };
  }

  async disconnect() {
    await this.walletCore.disconnect();
  }

  async checkPreviousConnection() {
    try {
      await this.walletCore.sync();
    } catch {
      await this.walletCore.disconnect();
      this._clearEthersState();
      return false;
    }

    const state = this.walletCore.getState();
    if (!state.account) {
      return false;
    }

    this._syncFromCoreState();
    if (!this.isConnected()) return false;
    this._notify('connected', { restored: true });
    return true;
  }

  _syncFromCoreState() {
    const state = this.walletCore.getState();
    const injectedProvider = this.walletCore.getEip1193Provider();

    if (!state.account || !injectedProvider || !window.ethers) {
      this._clearEthersState();
      return;
    }

    this.provider = new window.ethers.providers.Web3Provider(injectedProvider, 'any');
    this.signer = this.provider.getSigner();
    this.address = state.account;
    this.chainId = state.chainId;
    this.walletId = state.selectedWalletId || state.sessionWalletId || null;
    this.walletName = state.selectedWalletName || null;
    this.walletType = state.selectedWalletRdns || state.selectedWalletName || 'wallet';
  }

  _hasActiveWalletSession() {
    const state = this.walletCore.getState();
    return !!state.sessionWalletId;
  }

  _hasLocalWalletState() {
    return !!(
      this.provider
      || this.signer
      || this.address
      || this.walletType
      || this.walletId
      || this.walletName
      || this.chainId != null
    );
  }

  _clearEthersState() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.walletType = null;
    this.walletId = null;
    this.walletName = null;
  }

  _mapWallet(wallet) {
    return {
      id: wallet.id,
      name: wallet.info?.name || 'Browser Wallet',
      icon: wallet.info?.icon || null,
      rdns: wallet.info?.rdns || null,
      source: wallet.source,
      provider: wallet.provider || null,
    };
  }

  _disambiguateWalletNames(wallets) {
    const countsByName = new Map();
    wallets.forEach((wallet) => {
      const name = wallet.name || 'Browser Wallet';
      countsByName.set(name, (countsByName.get(name) || 0) + 1);
    });

    const seenByName = new Map();
    return wallets.map((wallet) => {
      const name = wallet.name || 'Browser Wallet';
      if ((countsByName.get(name) || 0) <= 1) return wallet;

      const seen = (seenByName.get(name) || 0) + 1;
      seenByName.set(name, seen);
      if (seen === 1) return wallet;
      return {
        ...wallet,
        name: `${name} (${seen})`,
      };
    });
  }

  _notify(event, extra = {}) {
    const eventNameMap = {
      connected: 'walletConnected',
      disconnected: 'walletDisconnected',
      accountChanged: 'walletAccountChanged',
      chainChanged: 'walletChainChanged',
      providersChanged: 'walletProvidersChanged',
    };
    const domName = eventNameMap[event] || `wallet${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    document.dispatchEvent(new CustomEvent(domName, {
      detail: {
        event,
        data: this._currentWalletData(extra),
      },
    }));
  }

  _currentWalletData(extra = {}) {
    const walletId = this.walletId || this.getLastSelectedWalletId();
    const walletName = this.walletName || (walletId ? this.getWalletById(walletId)?.name : null);
    return {
      address: this.address,
      chainId: this.chainId,
      walletType: this.walletType || 'wallet',
      walletId,
      walletName,
      ...extra,
    };
  }

  _clearLegacyStorageKeys() {
    localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_LAST_SELECTED_WALLET_STORAGE_KEY);
    localStorage.removeItem(LEGACY_USER_DISCONNECTED_STORAGE_KEY);
  }

  _normalizeWalletError(error) {
    if (!error || typeof error !== 'object') return error;
    if (error.code === 4001 || error.code === -32002) return error;
    if (typeof error.message === 'string' && /user rejected/i.test(error.message)) {
      error.code = 4001;
    }
    return error;
  }
}

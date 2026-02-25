/**
 * MetaMaskConnector (Phase 2)
 * - Low-level MetaMask interactions (EIP-1193)
 * - EIP-6963 discovery first, legacy injected fallback
 * - Creates an ethers Web3Provider when connected
 *
 * This stays intentionally small; higher-level app logic lives in WalletManager.
 */

export class MetaMaskConnector {
  constructor() {
    this.account = null;
    this.chainId = null; // number
    this.provider = null; // ethers.providers.Web3Provider
    this.signer = null; // ethers.Signer
    this.isConnected = false;

    this.eip1193Provider = null; // currently selected wallet provider
    this.providerInfo = null; // EIP-6963 provider info
    this.discoveredProviders = new Map();
    this._eventProvider = null;
    this._discoveryLoaded = false;
    this._boundAnnounceProvider = null;

    this._boundAccountsChanged = null;
    this._boundChainChanged = null;
    this._boundDisconnect = null;

    // Optional callbacks (set by WalletManager)
    this.onAccountsChanged = null;
    this.onChainChanged = null;
    this.onDisconnected = null;
  }

  isAvailable() {
    this.load();
    this._refreshLegacyFallbackProvider();
    return !!this.eip1193Provider;
  }

  load() {
    if (this._discoveryLoaded || typeof window === 'undefined') return;

    this._discoveryLoaded = true;
    this._boundAnnounceProvider = (event) => {
      const detail = event?.detail || {};
      const info = detail.info || null;
      const provider = detail.provider || null;
      if (!provider || typeof provider.request !== 'function') return;

      const key = String(info?.uuid || info?.rdns || `provider_${Date.now()}_${Math.random()}`);
      this.discoveredProviders.set(key, { info, provider });

      if (this._isMetaMaskProvider(provider, info)) {
        this.eip1193Provider = provider;
        this.providerInfo = info || null;
      }
    };

    window.addEventListener('eip6963:announceProvider', this._boundAnnounceProvider);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback for legacy single-provider injection.
    this._refreshLegacyFallbackProvider();
  }

  async getEip1193Provider({ waitMs = 0 } = {}) {
    this.load();
    this._refreshLegacyFallbackProvider();
    if (this.eip1193Provider) return this.eip1193Provider;
    if (!waitMs || waitMs <= 0) return null;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this._refreshLegacyFallbackProvider();
    return this.eip1193Provider || null;
  }

  peekEip1193Provider() {
    this.load();
    this._refreshLegacyFallbackProvider();
    return this.eip1193Provider || null;
  }

  async connect() {
    const walletProvider = await this.getEip1193Provider({ waitMs: 300 });
    if (!walletProvider) {
      throw new Error('MetaMask is not installed');
    }
    if (!window.ethers) {
      throw new Error('Ethers.js not loaded');
    }

    const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }

    this.account = accounts[0];
    this.chainId = await this._readChainId(walletProvider);

    this.provider = new window.ethers.providers.Web3Provider(walletProvider);
    this.signer = this.provider.getSigner();
    this.isConnected = true;

    this.attachEventListeners();

    return {
      account: this.account,
      chainId: this.chainId,
      provider: this.provider,
      signer: this.signer,
    };
  }

  /**
   * Attach MetaMask event listeners without prompting the user.
   * Useful when restoring a previous connection via eth_accounts.
   */
  attachEventListeners() {
    this._setupEventListeners();
  }

  async disconnect({ revokePermissions = false } = {}) {
    const walletProvider = this.peekEip1193Provider();

    if (revokePermissions && walletProvider?.request) {
      // Best-effort: not all wallets/providers support this method.
      try {
        await walletProvider.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // ignore; local state cleanup still proceeds
      }
    }

    // MetaMask does not support programmatic disconnection.
    // We just clear local app state and listeners.
    this.isConnected = false;
    this.account = null;
    this.chainId = null;
    this.provider = null;
    this.signer = null;

    this._removeEventListeners();
  }

  async getAccounts() {
    const walletProvider = await this.getEip1193Provider({ waitMs: 200 });
    if (!walletProvider) return [];
    return await walletProvider.request({ method: 'eth_accounts' });
  }

  async _readChainId(walletProvider = null) {
    const provider = walletProvider || this.peekEip1193Provider();
    if (!provider) return null;
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    return this._hexToNumber(chainIdHex);
  }

  getAccount() {
    return this.account;
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

  _setupEventListeners() {
    const walletProvider = this.peekEip1193Provider();
    if (!walletProvider || !walletProvider.on) return;

    this._removeEventListeners();

    this._boundAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        // user disconnected in MetaMask UI
        this.isConnected = false;
        this.account = null;
        if (typeof this.onDisconnected === 'function') this.onDisconnected();
        return;
      }
      this.account = accounts[0];
      this.isConnected = true;
      if (typeof this.onAccountsChanged === 'function') this.onAccountsChanged(accounts);
    };

    this._boundChainChanged = (chainIdHex) => {
      this.chainId = this._hexToNumber(chainIdHex);
      if (typeof this.onChainChanged === 'function') this.onChainChanged(this.chainId);
    };

    this._boundDisconnect = () => {
      this.isConnected = false;
      this.account = null;
      if (typeof this.onDisconnected === 'function') this.onDisconnected();
    };

    walletProvider.on('accountsChanged', this._boundAccountsChanged);
    walletProvider.on('chainChanged', this._boundChainChanged);
    walletProvider.on('disconnect', this._boundDisconnect);
    this._eventProvider = walletProvider;
  }

  _removeEventListeners() {
    const walletProvider = this._eventProvider;
    if (!walletProvider || !walletProvider.removeListener) return;
    if (this._boundAccountsChanged) walletProvider.removeListener('accountsChanged', this._boundAccountsChanged);
    if (this._boundChainChanged) walletProvider.removeListener('chainChanged', this._boundChainChanged);
    if (this._boundDisconnect) walletProvider.removeListener('disconnect', this._boundDisconnect);

    this._boundAccountsChanged = null;
    this._boundChainChanged = null;
    this._boundDisconnect = null;
    this._eventProvider = null;
  }

  _hexToNumber(hex) {
    if (!hex) return null;
    if (typeof hex === 'number') return hex;
    try {
      return parseInt(hex, 16);
    } catch {
      return null;
    }
  }

  _refreshLegacyFallbackProvider() {
    if (typeof window === 'undefined') return;
    if (this.eip1193Provider) return;

    const injected = this._findLegacyMetaMaskProvider();
    if (injected) {
      this.eip1193Provider = injected;
      this.providerInfo = this.providerInfo || null;
    }
  }

  _findLegacyMetaMaskProvider() {
    const eth = window?.ethereum;
    if (!eth) return null;

    if (Array.isArray(eth.providers)) {
      const mm = eth.providers.find((p) => !!p?.isMetaMask);
      if (mm) return mm;
    }

    return eth.isMetaMask ? eth : null;
  }

  _isMetaMaskProvider(provider, info) {
    if (provider?.isMetaMask) return true;
    const rdns = String(info?.rdns || '').toLowerCase();
    return rdns.includes('metamask');
  }
}

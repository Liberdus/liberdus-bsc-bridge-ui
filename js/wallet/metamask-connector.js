/**
 * Multi-wallet injected connector.
 *
 * The file name stays the same to minimize churn in the current bridge app,
 * but the implementation now discovers and connects explicit injected wallets
 * rather than auto-selecting a MetaMask-compatible provider.
 */

function isRequestCapableProvider(provider) {
  return !!provider && typeof provider.request === 'function';
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeRdns(value) {
  return normalizeString(value).toLowerCase();
}

function toSafeIdFragment(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function cloneWalletOption(wallet) {
  if (!wallet) return null;
  return {
    ...wallet,
    flags: { ...(wallet.flags || {}) },
  };
}

const GENERIC_IDENTITY_TOKENS = new Set([
  'app',
  'browser',
  'coinbase',
  'com',
  'eip1193',
  'eip6963',
  'ethereum',
  'injected',
  'io',
  'metamask',
  'provider',
  'wallet',
]);

function normalizeIdentityToken(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function addIdentityToken(tokens, value) {
  const token = normalizeIdentityToken(value);
  if (!token || GENERIC_IDENTITY_TOKENS.has(token)) return;
  tokens.add(token);
}

function collectIdentityTokens({ provider = null, info = null, wallet = null } = {}) {
  const tokens = new Set();

  const sources = [
    { provider, name: info?.name, rdns: info?.rdns },
    wallet ? { provider: wallet.provider, name: wallet.name, rdns: wallet.rdns } : null,
  ].filter(Boolean);

  sources.forEach((source) => {
    normalizeString(source.name)
      .split(/[^a-z0-9]+/i)
      .forEach((part) => addIdentityToken(tokens, part));

    normalizeRdns(source.rdns)
      .split('.')
      .forEach((part) => addIdentityToken(tokens, part));

    Object.entries(source.provider || {}).forEach(([key, value]) => {
      if (typeof value !== 'boolean' || !value) return;
      if (!/^is[A-Z]/.test(key)) return;

      const flagName = key.slice(2).replace(/Wallet$/i, '');
      addIdentityToken(tokens, flagName);
    });
  });

  return tokens;
}

export class MetaMaskConnector {
  constructor() {
    this.account = null;
    this.chainId = null; // number
    this.provider = null; // ethers.providers.Web3Provider
    this.signer = null; // ethers.Signer
    this.isConnected = false;

    this.activeWalletId = null;
    this.discoveredWallets = new Map();
    this._walletIdByProvider = new Map();
    this._walletIdByUuid = new Map();
    this._walletIdByRdns = new Map();
    this._generatedWalletCount = 0;
    this._eip6963Order = 0;

    this._eventProvider = null;
    this._discoveryLoaded = false;
    this._boundAnnounceProvider = null;

    this._boundAccountsChanged = null;
    this._boundConnect = null;
    this._boundChainChanged = null;
    this._boundDisconnect = null;

    // Optional callbacks (set by WalletManager)
    this.onWalletsChanged = null;
    this.onAccountsChanged = null;
    this.onConnect = null;
    this.onChainChanged = null;
    this.onDisconnected = null;
  }

  load() {
    if (this._discoveryLoaded || typeof window === 'undefined') return;

    this._discoveryLoaded = true;
    this._boundAnnounceProvider = (event) => {
      const detail = event?.detail || {};
      const info = detail.info || null;
      const provider = detail.provider || null;
      const wallet = this._registerWallet({
        provider,
        info,
        source: 'eip6963',
        sortIndex: this._eip6963Order++,
      });
      const prunedLegacyShim = this._pruneLegacyShimWallets(wallet);
      if (wallet || prunedLegacyShim) {
        this._notifyWalletsChanged();
      }
    };

    window.addEventListener('eip6963:announceProvider', this._boundAnnounceProvider);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if (this._registerLegacyWallets()) {
      this._notifyWalletsChanged();
    }
  }

  hasAvailableWallets() {
    return this.getAvailableWallets().length > 0;
  }

  getAvailableWallets() {
    this.load();
    this._registerLegacyWallets();

    const wallets = Array.from(this.discoveredWallets.values())
      .sort((a, b) => {
        if (a.sourcePriority !== b.sourcePriority) return a.sourcePriority - b.sourcePriority;
        if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
        return String(a.name || '').localeCompare(String(b.name || ''));
      })
      .map((wallet) => cloneWalletOption(wallet));

    return this._disambiguateWalletNames(wallets);
  }

  getWalletById(walletId) {
    this.load();
    this._registerLegacyWallets();
    if (!walletId) return null;
    return cloneWalletOption(this.discoveredWallets.get(String(walletId)));
  }

  getActiveWallet() {
    return this.getWalletById(this.activeWalletId);
  }

  async getEip1193Provider({ walletId = null, waitMs = 0 } = {}) {
    const wallet = walletId ? this.getWalletById(walletId) : this.getActiveWallet();
    if (wallet?.provider) return wallet.provider;
    if (!waitMs || waitMs <= 0) return null;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const waitedWallet = walletId ? this.getWalletById(walletId) : this.getActiveWallet();
    return waitedWallet?.provider || null;
  }

  peekEip1193Provider() {
    return this.getActiveWallet()?.provider || null;
  }

  async connect(walletId) {
    const wallet = this.getWalletById(walletId);
    if (!wallet?.provider) {
      if (!this.hasAvailableWallets()) {
        throw new Error('No injected wallet detected');
      }
      throw new Error('Selected wallet is not available');
    }
    if (!window.ethers) {
      throw new Error('Ethers.js not loaded');
    }

    const walletProvider = wallet.provider;
    const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }

    const chainId = await this._readChainId(walletProvider);
    const provider = new window.ethers.providers.Web3Provider(walletProvider, 'any');
    const signer = provider.getSigner();

    this.activeWalletId = wallet.id;
    this.account = accounts[0];
    this.chainId = chainId;
    this.provider = provider;
    this.signer = signer;
    this.isConnected = true;

    this.attachEventListeners();

    return {
      account: this.account,
      chainId: this.chainId,
      provider: this.provider,
      signer: this.signer,
      wallet,
    };
  }

  bindConnectedWallet(walletId, { account = null, chainId = null, provider = null, signer = null } = {}) {
    const wallet = this.getWalletById(walletId);
    if (!wallet?.provider) return null;

    this.activeWalletId = wallet.id;
    this.account = account;
    this.chainId = chainId;
    this.provider = provider;
    this.signer = signer;
    this.isConnected = !!account;
    this.attachEventListeners();
    return wallet;
  }

  /**
   * Attach provider event listeners without prompting the user.
   * Useful when restoring a previous connection via eth_accounts.
   */
  attachEventListeners() {
    this._setupEventListeners();
  }

  async disconnect({ revokePermissions = false } = {}) {
    const walletProvider = this.peekEip1193Provider();

    if (revokePermissions && walletProvider?.request) {
      try {
        await walletProvider.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // ignore; local state cleanup still proceeds
      }
    }

    this.clearSession({ clearActiveWallet: true });
  }

  clearSession({ clearActiveWallet = true } = {}) {
    this.isConnected = false;
    this.account = null;
    this.chainId = null;
    this.provider = null;
    this.signer = null;
    if (clearActiveWallet) {
      this.activeWalletId = null;
    }

    this._removeEventListeners();
  }

  async getAccounts({ walletId = null, waitMs = 200 } = {}) {
    const walletProvider = await this.getEip1193Provider({ walletId, waitMs });
    if (!walletProvider) return [];
    return await walletProvider.request({ method: 'eth_accounts' });
  }

  async _readChainId(walletProvider = null) {
    const provider = walletProvider || this.peekEip1193Provider();
    if (!provider) return null;
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    return this._hexToNumber(chainIdHex);
  }

  _setupEventListeners() {
    const walletProvider = this.peekEip1193Provider();
    if (!walletProvider || typeof walletProvider.on !== 'function') return;

    this._removeEventListeners();

    this._boundAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        this.isConnected = false;
        this.account = null;
        if (typeof this.onAccountsChanged === 'function') this.onAccountsChanged([]);
        return;
      }
      this.account = accounts[0];
      this.isConnected = true;
      if (typeof this.onAccountsChanged === 'function') this.onAccountsChanged(accounts);
    };

    this._boundConnect = (connectInfo) => {
      this.isConnected = !!this.account;
      if (typeof this.onConnect === 'function') this.onConnect(connectInfo);
    };

    this._boundChainChanged = (chainIdHex) => {
      this.chainId = this._hexToNumber(chainIdHex);
      if (typeof this.onChainChanged === 'function') this.onChainChanged(this.chainId);
    };

    this._boundDisconnect = (error) => {
      this.isConnected = false;
      if (typeof this.onDisconnected === 'function') this.onDisconnected(error);
    };

    walletProvider.on('accountsChanged', this._boundAccountsChanged);
    walletProvider.on('connect', this._boundConnect);
    walletProvider.on('chainChanged', this._boundChainChanged);
    walletProvider.on('disconnect', this._boundDisconnect);
    this._eventProvider = walletProvider;
  }

  _removeEventListeners() {
    const walletProvider = this._eventProvider;
    if (!walletProvider || typeof walletProvider.removeListener !== 'function') return;
    if (this._boundAccountsChanged) walletProvider.removeListener('accountsChanged', this._boundAccountsChanged);
    if (this._boundConnect) walletProvider.removeListener('connect', this._boundConnect);
    if (this._boundChainChanged) walletProvider.removeListener('chainChanged', this._boundChainChanged);
    if (this._boundDisconnect) walletProvider.removeListener('disconnect', this._boundDisconnect);

    this._boundAccountsChanged = null;
    this._boundConnect = null;
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

  _registerLegacyWallets() {
    if (typeof window === 'undefined') return;
    const ethereum = window?.ethereum;
    if (!ethereum) return;

    let changed = false;
    const providers = Array.isArray(ethereum.providers) ? ethereum.providers.filter(Boolean) : [];
    providers.forEach((provider, index) => {
      const wallet = this._registerWallet({
        provider,
        info: null,
        source: 'legacy',
        sortIndex: index,
      });
      changed = changed || !!wallet;
    });

    if (providers.length > 0) return changed;
    if (this._hasDiscoveredEip6963Wallets()) return changed;

    if (!this._walletIdByProvider.has(ethereum)) {
      const wallet = this._registerWallet({
        provider: ethereum,
        info: null,
        source: 'legacy',
        sortIndex: 0,
      });
      changed = changed || !!wallet;
    }

    return changed;
  }

  _hasDiscoveredEip6963Wallets() {
    return Array.from(this.discoveredWallets.values()).some((wallet) => wallet.source === 'eip6963');
  }

  _pruneLegacyShimWallets(latestWallet) {
    if (!latestWallet || typeof window === 'undefined') return;

    const ethereum = window?.ethereum;
    if (!ethereum || Array.isArray(ethereum.providers)) return false;

    let changed = false;
    for (const [walletId, wallet] of this.discoveredWallets.entries()) {
      if (walletId === latestWallet.id) continue;
      if (wallet.source !== 'legacy') continue;
      if (wallet.provider !== ethereum) continue;

      this.discoveredWallets.delete(walletId);
      this._walletIdByProvider.delete(wallet.provider);
      if (wallet.rdns) this._walletIdByRdns.delete(wallet.rdns);
      changed = true;
    }

    return changed;
  }

  _registerWallet({ provider, info = null, source = 'legacy', sortIndex = 0 } = {}) {
    if (!isRequestCapableProvider(provider)) return null;

    const normalizedInfo = this._normalizeProviderInfo(info);
    const existingWalletId = this._findWalletId({ provider, info: normalizedInfo });
    const walletId = existingWalletId || this._createWalletId(normalizedInfo, provider, source);
    const existingWallet = existingWalletId ? this.discoveredWallets.get(existingWalletId) : null;
    const flags = this._deriveWalletFlags(provider, normalizedInfo);
    const sourcePriority = source === 'eip6963' ? 0 : 1;
    const shouldPreferExistingProvider = !!existingWallet && existingWallet.sourcePriority < sourcePriority;

    const wallet = {
      id: walletId,
      name: this._deriveWalletName(provider, normalizedInfo, existingWallet),
      icon: normalizedInfo.icon || existingWallet?.icon || '',
      rdns: normalizedInfo.rdns || existingWallet?.rdns || '',
      provider: shouldPreferExistingProvider ? existingWallet.provider : provider,
      source,
      flags: {
        ...(existingWallet?.flags || {}),
        ...flags,
      },
      sourcePriority,
      sortIndex: existingWallet ? Math.min(existingWallet.sortIndex, sortIndex) : sortIndex,
    };

    if (sourcePriority < (existingWallet?.sourcePriority ?? Number.POSITIVE_INFINITY)) {
      wallet.source = source;
      wallet.sourcePriority = sourcePriority;
      wallet.sortIndex = sortIndex;
    } else if (existingWallet) {
      wallet.source = existingWallet.source;
      wallet.sourcePriority = existingWallet.sourcePriority;
    }

    if (existingWallet && this._walletsMatch(existingWallet, wallet)) {
      this._walletIdByProvider.set(provider, walletId);
      if (normalizedInfo.uuid) this._walletIdByUuid.set(normalizedInfo.uuid, walletId);
      if (wallet.rdns) this._walletIdByRdns.set(wallet.rdns, walletId);
      return null;
    }

    this.discoveredWallets.set(walletId, wallet);
    this._walletIdByProvider.set(provider, walletId);
    if (normalizedInfo.uuid) this._walletIdByUuid.set(normalizedInfo.uuid, walletId);
    if (wallet.rdns) this._walletIdByRdns.set(wallet.rdns, walletId);
    if (walletId === this.activeWalletId && this._eventProvider && this._eventProvider !== wallet.provider) {
      this.attachEventListeners();
    }

    return cloneWalletOption(wallet);
  }

  _findWalletId({ provider, info }) {
    if (provider && this._walletIdByProvider.has(provider)) {
      return this._walletIdByProvider.get(provider);
    }

    if (info?.uuid && this._walletIdByUuid.has(info.uuid)) {
      return this._walletIdByUuid.get(info.uuid);
    }

    if (info?.rdns && this._walletIdByRdns.has(info.rdns)) {
      return this._walletIdByRdns.get(info.rdns);
    }

    if (info?.rdns) {
      const legacyWalletId = this._findLegacyWalletIdByRdns(info.rdns);
      if (legacyWalletId) return legacyWalletId;
    }

    const legacyWalletId = this._findLegacyWalletIdByIdentity({ provider, info });
    if (legacyWalletId) return legacyWalletId;

    return null;
  }

  _createWalletId(info, provider, source) {
    const preferredBase = toSafeIdFragment(info?.rdns)
      || toSafeIdFragment(info?.name)
      || toSafeIdFragment(this._deriveWalletName(provider, info))
      || source
      || 'wallet';

    let walletId = preferredBase;
    let suffix = 2;
    while (this.discoveredWallets.has(walletId)) {
      walletId = `${preferredBase}-${suffix}`;
      suffix += 1;
    }

    if (!walletId) {
      this._generatedWalletCount += 1;
      walletId = `wallet-${this._generatedWalletCount}`;
    }

    return walletId;
  }

  _normalizeProviderInfo(info) {
    return {
      uuid: normalizeString(info?.uuid),
      name: normalizeString(info?.name),
      icon: normalizeString(info?.icon),
      rdns: normalizeRdns(info?.rdns),
    };
  }

  _deriveWalletName(provider, info, existingWallet = null) {
    if (info?.name) return info.name;
    if (existingWallet?.name) return existingWallet.name;

    const flags = this._deriveWalletFlags(provider, info);
    if (flags.isBraveWallet) return 'Brave Wallet';
    if (flags.isCoinbaseWallet) return 'Coinbase Wallet';
    if (flags.isPhantom) return 'Phantom';
    if (flags.isRabby) return 'Rabby';
    if (flags.isMetaMask) return 'MetaMask';
    return 'Browser Wallet';
  }

  _deriveWalletFlags(provider, info) {
    const rdns = normalizeRdns(info?.rdns);
    return {
      isMetaMask: !!provider?.isMetaMask || rdns.includes('metamask'),
      isBraveWallet: !!provider?.isBraveWallet || rdns.includes('brave'),
      isCoinbaseWallet: !!provider?.isCoinbaseWallet || rdns.includes('coinbase'),
      isPhantom: !!provider?.isPhantom || rdns.includes('phantom'),
      isRabby: !!provider?.isRabby || rdns.includes('rabby'),
    };
  }

  _findLegacyWalletIdByRdns(rdns) {
    const normalizedRdns = normalizeRdns(rdns);
    if (!normalizedRdns) return null;

    for (const [walletId, wallet] of this.discoveredWallets.entries()) {
      if (wallet.source !== 'legacy') continue;

      const walletRdns = normalizeRdns(wallet.rdns) || this._legacyRdnsFromFlags(wallet.flags);
      if (walletRdns === normalizedRdns) {
        return walletId;
      }
    }

    return null;
  }

  _legacyRdnsFromFlags(flags = {}) {
    if (flags.isBraveWallet) return 'com.brave.wallet';
    if (flags.isCoinbaseWallet) return 'com.coinbase.wallet';
    if (flags.isPhantom) return 'app.phantom';
    if (flags.isMetaMask && !flags.isRabby) return 'io.metamask';
    return '';
  }

  _findLegacyWalletIdByIdentity({ provider, info }) {
    const identityTokens = collectIdentityTokens({ provider, info });
    if (identityTokens.size === 0) return null;

    for (const [walletId, wallet] of this.discoveredWallets.entries()) {
      if (wallet.source !== 'legacy') continue;

      const legacyTokens = collectIdentityTokens({ wallet });
      if (legacyTokens.size === 0) continue;

      for (const token of identityTokens) {
        if (legacyTokens.has(token)) {
          return walletId;
        }
      }
    }

    return null;
  }

  _notifyWalletsChanged() {
    if (typeof this.onWalletsChanged !== 'function') return;
    try {
      this.onWalletsChanged(this.getAvailableWallets());
    } catch {
      // ignore
    }
  }

  _disambiguateWalletNames(wallets) {
    const counts = new Map();
    wallets.forEach((wallet) => {
      const name = String(wallet?.name || 'Browser Wallet');
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    const seen = new Map();
    return wallets.map((wallet) => {
      const name = String(wallet?.name || 'Browser Wallet');
      const nextSeen = (seen.get(name) || 0) + 1;
      seen.set(name, nextSeen);

      if ((counts.get(name) || 0) <= 1 || nextSeen === 1) {
        return wallet;
      }

      const qualifier = wallet.source === 'legacy'
        ? `legacy ${nextSeen}`
        : `${nextSeen}`;

      return {
        ...wallet,
        name: `${name} (${qualifier})`,
      };
    });
  }

  _walletsMatch(previousWallet, nextWallet) {
    if (!previousWallet || !nextWallet) return false;
    if (previousWallet.id !== nextWallet.id) return false;
    if (previousWallet.name !== nextWallet.name) return false;
    if (previousWallet.icon !== nextWallet.icon) return false;
    if (previousWallet.rdns !== nextWallet.rdns) return false;
    if (previousWallet.provider !== nextWallet.provider) return false;
    if (previousWallet.source !== nextWallet.source) return false;
    if (previousWallet.sourcePriority !== nextWallet.sourcePriority) return false;
    if (previousWallet.sortIndex !== nextWallet.sortIndex) return false;

    const previousFlags = previousWallet.flags || {};
    const nextFlags = nextWallet.flags || {};
    const previousKeys = Object.keys(previousFlags);
    const nextKeys = Object.keys(nextFlags);
    if (previousKeys.length !== nextKeys.length) return false;

    return previousKeys.every((key) => previousFlags[key] === nextFlags[key]);
  }
}

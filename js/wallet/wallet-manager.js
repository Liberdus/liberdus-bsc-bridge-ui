import { MetaMaskConnector } from './metamask-connector.js?v=20260317i';

/**
 * WalletManager (Phase 2)
 * - MetaMask-only connection
 * - Restores previous connection (best-effort)
 * - Dispatches DOM events:
 *   - walletConnected, walletDisconnected, walletAccountChanged, walletChainChanged
 */
export class WalletManager {
  constructor({ storageKey = 'liberdus_token_ui_wallet_connection' } = {}) {
    this.storageKey = storageKey;

    this.connector = new MetaMaskConnector();
    this.provider = null; // ethers.providers.Web3Provider
    this.signer = null; // ethers.Signer
    this.address = null;
    this.chainId = null; // number
    this.walletType = null; // 'metamask'

    this.isConnecting = false;
    this._connectionPromise = null;
    this._disconnectProbeToken = 0;

    this.listeners = new Set();
  }

  load() {
    this.connector.load();

    // Wire connector callbacks → WalletManager events
    this.connector.onAccountsChanged = (accounts) => this._handleAccountsChanged(accounts);
    this.connector.onConnect = (connectInfo) => this._handleProviderConnect(connectInfo);
    this.connector.onChainChanged = (chainId) => this._handleChainChanged(chainId);
    this.connector.onDisconnected = (error) => this._handleDisconnected(error);
  }

  async init() {
    // Best-effort restore before user clicks.
    await this.checkPreviousConnection();
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

  hasAvailableWallet() {
    return !!this.connector?.isAvailable?.();
  }

  async getEip1193Provider(options = {}) {
    return await this.connector?.getEip1193Provider?.(options);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async connectMetaMask() {
    if (this._connectionPromise) return this._connectionPromise;
    this._connectionPromise = this._performConnectMetaMask();
    try {
      return await this._connectionPromise;
    } finally {
      this._connectionPromise = null;
    }
  }

  async _performConnectMetaMask() {
    if (!this.connector.isAvailable()) {
      throw new Error('MetaMask not installed');
    }
    if (this.isConnected()) {
      return { success: true, address: this.address, chainId: this.chainId, walletType: this.walletType };
    }

    this.isConnecting = true;
    try {
      const result = await this.connector.connect();

      this.provider = result.provider;
      this.signer = result.signer;
      this.address = result.account;
      this.chainId = result.chainId;
      this.walletType = 'metamask';

      this._storeConnectionInfo();

      this._notify('connected', {
        address: this.address,
        chainId: this.chainId,
        walletType: this.walletType,
      });

      return { success: true, address: this.address, chainId: this.chainId, walletType: this.walletType };
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect() {
    await this.connector.disconnect({ revokePermissions: true });
    this._clearStateAndNotifyDisconnect();
  }

  async checkPreviousConnection() {
    if (!this.connector.isAvailable()) return false;

    // If we stored a previous connection, verify MetaMask still exposes the same account.
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
    } catch {
      stored = null;
    }
    if (!stored?.address) return false;

    try {
      const eip1193Provider = await this.getEip1193Provider({ waitMs: 200 });
      if (!eip1193Provider) return false;

      const accounts = await this.connector.getAccounts(); // does not prompt
      if (!accounts || accounts.length === 0) {
        this._clearConnectionInfo();
        return false;
      }

      const addr = accounts[0];
      if (addr.toLowerCase() !== String(stored.address).toLowerCase()) {
        // Different account than last time; still restore with the current one.
      }

      // Create provider/signer without prompting
      if (!window.ethers) {
        return false;
      }

      // Use the "any" network so restored wallet providers survive later chain changes.
      this.provider = new window.ethers.providers.Web3Provider(eip1193Provider, 'any');
      this.signer = this.provider.getSigner();
      this.address = addr;

      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
      this.walletType = 'metamask';

      // Keep connector state in sync and ensure events are wired.
      this.connector.account = this.address;
      this.connector.chainId = this.chainId;
      this.connector.provider = this.provider;
      this.connector.signer = this.signer;
      this.connector.isConnected = true;
      this.connector.attachEventListeners();

      this._notify('connected', {
        address: this.address,
        chainId: this.chainId,
        walletType: this.walletType,
        restored: true,
      });

      return true;
    } catch (e) {
      // If anything goes wrong, clear stored state so we don't loop.
      this._clearConnectionInfo();
      return false;
    }
  }

  _handleAccountsChanged(accounts) {
    this._cancelDisconnectProbe();

    if (!accounts || accounts.length === 0) {
      this._clearStateAndNotifyDisconnect();
      return;
    }
    this.address = accounts[0];
    this.connector.account = this.address;
    this.connector.isConnected = true;
    this._storeConnectionInfo();
    this._notify('accountChanged', { address: this.address, chainId: this.chainId });
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
    this._notify('chainChanged', { address: this.address, chainId: this.chainId });
  }

  _handleDisconnected(_error) {
    // MetaMask can emit a transient provider disconnect during add/switch flows.
    // Only keep the session if both account access and basic RPC calls recover.
    if (!this.address && !this.provider && !this.signer) {
      this._clearStateAndNotifyDisconnect();
      return;
    }

    const probeToken = this._startDisconnectProbe();
    this._verifyDisconnectProbe(probeToken).catch(() => {});
  }

  _notify(event, data) {
    // Listener callbacks
    this.listeners.forEach((cb) => {
      try {
        cb(event, data);
      } catch (e) {
        // ignore
      }
    });

    // DOM events (for simple integration)
    const eventNameMap = {
      connected: 'walletConnected',
      disconnected: 'walletDisconnected',
      accountChanged: 'walletAccountChanged',
      chainChanged: 'walletChainChanged',
    };
    const domName = eventNameMap[event] || `wallet${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    document.dispatchEvent(new CustomEvent(domName, { detail: { event, data } }));
  }

  _storeConnectionInfo() {
    if (!this.address) return;
    const payload = {
      walletType: this.walletType || 'metamask',
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

  _clearConnectionInfo() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
  }

  _clearStateAndNotifyDisconnect() {
    const wasConnected = !!(this.provider || this.signer || this.address || this.walletType || this.chainId != null);

    this._cancelDisconnectProbe();
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.walletType = null;

    this._clearConnectionInfo();
    if (wasConnected) {
      this._notify('disconnected', {});
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

    while (probeToken === this._disconnectProbeToken) {
      try {
        const walletProvider = await this.getEip1193Provider({ waitMs: 200 });
        if (!walletProvider?.request) throw new Error('MetaMask not available');

        const [accounts, chainIdHex] = await Promise.all([
          this.connector?.getAccounts?.(),
          walletProvider.request({ method: 'eth_chainId' }),
        ]);
        if (probeToken !== this._disconnectProbeToken) return;

        if (Array.isArray(accounts)) {
          if (accounts.length === 0) {
            this._clearStateAndNotifyDisconnect();
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
            this._notify('accountChanged', { address: this.address, chainId: this.chainId });
          }
          if (chainChanged) {
            this._notify('chainChanged', { address: this.address, chainId: this.chainId });
          }
          return;
        }
      } catch {
        // Ignore transient provider errors while MetaMask is recovering.
      }

      if (Date.now() >= deadlineAt) {
        this._clearStateAndNotifyDisconnect();
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

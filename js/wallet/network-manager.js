import { CONFIG } from '../config.js';
import { peekReadOnlyProvider } from '../utils/read-only-provider.js';

/**
 * NetworkManager (Phase 2)
 * Configured source-network only:
 * - Read-only mode uses CONFIG.NETWORK.RPC_URL
 * - Tx-enabled mode requires MetaMask connected AND chainId === CONFIG.NETWORK.CHAIN_ID
 */
export class NetworkManager {
  constructor({ walletManager } = {}) {
    this.walletManager = walletManager || null;
  }

  load() {
    // Subscribe to wallet events so UI can stay in sync.
    document.addEventListener('walletConnected', () => this.updateUIState());
    document.addEventListener('walletDisconnected', () => this.updateUIState());
    document.addEventListener('walletAccountChanged', () => this.updateUIState());
    document.addEventListener('walletChainChanged', () => this.updateUIState());

    // Initial UI state
    this.updateUIState();
  }

  isOnRequiredNetwork(chainId = null) {
    const cid = this._normalizeChainId(chainId ?? this.getCurrentChainId());
    return Number(cid) === Number(this._requiredChainId());
  }

  isTxEnabled() {
    const connected = !!this.walletManager?.isConnected?.();
    return connected && this.isOnRequiredNetwork();
  }

  getReadOnlyProvider() {
    // Reuse the singleton read-only provider (do not create new providers here).
    return peekReadOnlyProvider() || null;
  }

  getTxProvider() {
    return this.walletManager?.getProvider?.() || null;
  }

  async ensurePolygonNetwork() {
    const network = this._networkConfig();
    return await this.switchToChain({
      chainId: network?.CHAIN_ID,
      name: network?.NAME,
      rpcUrl: network?.RPC_URL,
      fallbackRpcs: network?.FALLBACK_RPCS || [],
      blockExplorer: network?.BLOCK_EXPLORER,
      nativeCurrency: network?.NATIVE_CURRENCY,
    });
  }

  async ensureRequiredNetwork({ timeoutMs = 15000 } = {}) {
    if (this.isOnRequiredNetwork()) {
      return { switched: false };
    }

    await this.switchToChain(this._requiredNetworkDescriptor());
    if (this.isOnRequiredNetwork()) {
      return { switched: true };
    }

    const waiter = this._createRequiredNetworkWaiter({ timeoutMs });
    try {
      await waiter.promise;
      return { switched: true };
    } catch (error) {
      waiter.cancel();
      throw error;
    }
  }

  async addPolygonNetwork() {
    const walletProvider = await this.walletManager?.getEip1193Provider?.({ waitMs: 200 });
    if (!walletProvider) throw new Error('MetaMask not available');
    const networkConfig = this.buildPolygonNetworkConfig();
    await walletProvider.request({
      method: 'wallet_addEthereumChain',
      params: [networkConfig],
    });
  }

  getAvailableNetworks() {
    const config = this._config();
    const polygon = config?.BRIDGE?.CHAINS?.POLYGON || config?.NETWORK || null;
    const bsc = config?.BRIDGE?.CHAINS?.BSC || null;
    const polygonNative = polygon?.NATIVE_CURRENCY || config?.NETWORK?.NATIVE_CURRENCY || { name: 'MATIC', symbol: 'MATIC', decimals: 18 };
    const bscNative = bsc?.NATIVE_CURRENCY || { name: 'BNB', symbol: 'tBNB', decimals: 18 };
    return [
      {
        key: 'polygon',
        chainId: polygon?.CHAIN_ID || config?.NETWORK?.CHAIN_ID || 80002,
        name: polygon?.NAME || config?.NETWORK?.NAME || 'Polygon Amoy Testnet',
        rpcUrl: polygon?.RPC_URL || config?.NETWORK?.RPC_URL || '',
        fallbackRpcs: polygon?.FALLBACK_RPCS || config?.NETWORK?.FALLBACK_RPCS || [],
        blockExplorer: polygon?.BLOCK_EXPLORER || config?.NETWORK?.BLOCK_EXPLORER || '',
        nativeCurrency: polygonNative,
      },
      {
        key: 'bsc',
        chainId: bsc?.CHAIN_ID || 97,
        name: bsc?.NAME || 'BSC Testnet',
        rpcUrl: bsc?.RPC_URL || '',
        fallbackRpcs: bsc?.FALLBACK_RPCS || [],
        blockExplorer: bsc?.BLOCK_EXPLORER || '',
        nativeCurrency: bscNative,
      },
    ];
  }

  getCurrentChainId() {
    const fromManager = this.walletManager?.getChainId?.();
    if (fromManager != null) return this._normalizeChainId(fromManager);
    const fromProvider = this.walletManager?.getProvider?.()?.provider?.chainId;
    if (fromProvider != null) return this._normalizeChainId(fromProvider);
    return null;
  }

  async switchToNetworkByKey(key) {
    const target = this.getAvailableNetworks().find((n) => n.key === key);
    if (!target) throw new Error('Unsupported network');
    return await this.switchToChain(target);
  }

  async switchToChain(chain) {
    const walletProvider = await this.walletManager?.getEip1193Provider?.({ waitMs: 200 });
    if (!walletProvider) throw new Error('MetaMask not available');
    const chainHex = this._toHexChainId(chain.chainId);
    try {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      });
      return true;
    } catch (error) {
      if (error && error.code === 4902) {
        await walletProvider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainHex,
            chainName: chain.name,
            rpcUrls: [chain.rpcUrl, ...(chain.fallbackRpcs || [])].filter(Boolean),
            nativeCurrency: chain.nativeCurrency,
            blockExplorerUrls: [chain.blockExplorer].filter(Boolean),
          }],
        });
        await walletProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainHex }],
        });
        return true;
      }
      throw error;
    }
  }

  buildPolygonNetworkConfig() {
    const network = this._networkConfig();
    const chainId = Number(network?.CHAIN_ID || this._requiredChainId() || 80002);
    return {
      chainId: this._toHexChainId(chainId),
      chainName: network?.NAME || 'Polygon Amoy',
      rpcUrls: [network?.RPC_URL, ...(network?.FALLBACK_RPCS || [])].filter(Boolean),
      nativeCurrency: network?.NATIVE_CURRENCY || { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      blockExplorerUrls: [network?.BLOCK_EXPLORER].filter(Boolean),
    };
  }

  networkSymbol() {
    return this._networkConfig()?.NATIVE_CURRENCY?.symbol || 'MATIC';
  }

  updateUIState() {
    this.updateTxGatedControls();
  }

  /**
   * Simple gating: any element marked data-requires-tx="true"
   * will be hard-disabled unless a wallet is connected.
   */
  updateTxGatedControls() {
    const connected = !!this.walletManager?.isConnected?.();
    const gated = Array.from(document.querySelectorAll('[data-requires-tx="true"]'));
    gated.forEach((el) => {
      // Allow permanent disable for placeholders (Phase 1/5/6 UI)
      if (el.getAttribute('data-always-disabled') === 'true') return;
      // Allow data entry even when wallet connection is missing for specified inputs
      if (el.getAttribute('data-allow-input-when-locked') === 'true') {
        if ('disabled' in el) {
          el.disabled = !connected;
        }
        el.classList.toggle('is-disabled', !connected);
        return;
      }

      if ('disabled' in el) {
        el.disabled = !connected;
      }
      el.classList.toggle('is-disabled', !connected);
    });
  }

  _toHexChainId(chainId) {
    return '0x' + Number(chainId).toString(16);
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

  _config() {
    return window.CONFIG || CONFIG;
  }

  _networkConfig() {
    return this._config()?.NETWORK || null;
  }

  _requiredChainId() {
    return Number(this._networkConfig()?.CHAIN_ID || 0) || null;
  }

  _requiredNetworkDescriptor() {
    const network = this._networkConfig();
    return {
      chainId: network?.CHAIN_ID,
      name: network?.NAME || 'Required Network',
      rpcUrl: network?.RPC_URL || '',
      fallbackRpcs: network?.FALLBACK_RPCS || [],
      blockExplorer: network?.BLOCK_EXPLORER || '',
      nativeCurrency: network?.NATIVE_CURRENCY || { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    };
  }

  _requiredNetworkName() {
    return this._requiredNetworkDescriptor().name || 'the required network';
  }

  _createRequiredNetworkWaiter({ timeoutMs = 3000 } = {}) {
    if (this.isOnRequiredNetwork()) {
      return {
        promise: Promise.resolve(true),
        cancel() {},
      };
    }

    let timeoutId = null;
    let pollId = null;
    let resolved = false;
    let chainChangedHandler = null;

    const cleanup = () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (pollId != null) window.clearInterval(pollId);
      if (chainChangedHandler) {
        document.removeEventListener('walletChainChanged', chainChangedHandler);
      }
    };

    const resolveIfReady = (resolve) => {
      if (!resolved && this.isOnRequiredNetwork()) {
        resolved = true;
        cleanup();
        resolve(true);
      }
    };

    const promise = new Promise((resolve, reject) => {
      chainChangedHandler = () => resolveIfReady(resolve);
      document.addEventListener('walletChainChanged', chainChangedHandler);

      timeoutId = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new Error(`Timed out waiting for wallet to switch to ${this._requiredNetworkName()}`));
      }, timeoutMs);

      pollId = window.setInterval(() => resolveIfReady(resolve), 50);
      resolveIfReady(resolve);
    });

    return {
      promise,
      cancel() {
        if (resolved) return;
        resolved = true;
        cleanup();
      },
    };
  }
}

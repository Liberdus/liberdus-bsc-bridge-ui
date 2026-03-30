import { CONFIG } from '../config.js';

/**
 * NetworkManager (Phase 2)
 * Configured source-network only:
 * - Read-only mode uses CONFIG.BRIDGE.CHAINS.SOURCE.RPC_URL
 * - Tx-enabled mode requires a connected wallet AND chainId === CONFIG.BRIDGE.CHAINS.SOURCE.CHAIN_ID
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

  async ensureRequiredNetwork({ timeoutMs = 15000 } = {}) {
    if (this.isOnRequiredNetwork()) {
      return { switched: false };
    }

    await this.switchToChain(CONFIG.BRIDGE.CHAINS.SOURCE);
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

  getAvailableNetworks() {
    const { SOURCE, DESTINATION } = CONFIG.BRIDGE.CHAINS;
    return [
      {
        key: 'source',
        chainId: SOURCE.CHAIN_ID,
        name: SOURCE.NAME,
        rpcUrl: SOURCE.RPC_URL,
        fallbackRpcs: SOURCE.FALLBACK_RPCS,
        blockExplorer: SOURCE.BLOCK_EXPLORER,
        nativeCurrency: SOURCE.NATIVE_CURRENCY,
      },
      {
        key: 'destination',
        chainId: DESTINATION.CHAIN_ID,
        name: DESTINATION.NAME,
        rpcUrl: DESTINATION.RPC_URL,
        fallbackRpcs: DESTINATION.FALLBACK_RPCS,
        blockExplorer: DESTINATION.BLOCK_EXPLORER,
        nativeCurrency: DESTINATION.NATIVE_CURRENCY,
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

  async switchToChain(network) {
    const walletProvider = await this.walletManager?.getEip1193Provider?.({ waitMs: 200 });
    if (!walletProvider) throw new Error('Wallet not available');
    const chainHex = this._toHexChainId(network.CHAIN_ID);
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
            chainName: network.NAME,
            rpcUrls: [network.RPC_URL, ...network.FALLBACK_RPCS],
            nativeCurrency: network.NATIVE_CURRENCY,
            blockExplorerUrls: [network.BLOCK_EXPLORER],
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
          el.disabled = false;
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

  _requiredChainId() {
    return CONFIG.BRIDGE.CHAINS.SOURCE.CHAIN_ID;
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
        reject(new Error(`Timed out waiting for wallet to switch to ${CONFIG.BRIDGE.CHAINS.SOURCE.NAME}`));
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

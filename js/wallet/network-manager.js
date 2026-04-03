import { CONFIG } from '../config.js';
import { getContractMetadata, normalizeContractKey } from '../contracts/contract-types.js';

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

  getNetworkConfig(key = 'source') {
    const meta = getContractMetadata(key);
    return CONFIG?.BRIDGE?.CHAINS?.[meta.networkConfigKey] || null;
  }

  getCurrentNetworkKey(chainId = null) {
    const cid = this._normalizeChainId(chainId ?? this.getCurrentChainId());
    if (!Number.isFinite(cid)) return null;

    const source = this.getNetworkConfig('source');
    if (Number(source?.CHAIN_ID) === cid) return 'source';

    const destination = this.getNetworkConfig('destination');
    if (Number(destination?.CHAIN_ID) === cid) return 'destination';

    return null;
  }

  isOnRequiredNetwork(chainId = null) {
    return this.isOnNetwork('source', chainId);
  }

  isOnNetwork(key = 'source', chainId = null) {
    const cid = this._normalizeChainId(chainId ?? this.getCurrentChainId());
    return Number(cid) === Number(this._requiredChainId(key));
  }

  isTxEnabled() {
    return this.isTxEnabledFor('source');
  }

  isTxEnabledFor(key = 'source') {
    const connected = !!this.walletManager?.isConnected?.();
    return connected && this.isOnNetwork(key);
  }

  async ensureRequiredNetwork({ timeoutMs = 15000 } = {}) {
    return await this.ensureNetwork('source', { timeoutMs });
  }

  async ensureNetwork(key = 'source', { timeoutMs = 15000 } = {}) {
    const normalizedKey = normalizeContractKey(key);
    const network = this.getNetworkConfig(normalizedKey);
    if (!network) {
      throw new Error(`Unknown network for ${normalizedKey}`);
    }

    if (this.isOnNetwork(normalizedKey)) {
      return { switched: false };
    }

    await this.switchToChain(network);
    if (this.isOnNetwork(normalizedKey)) {
      return { switched: true };
    }

    const waiter = this._createNetworkWaiter(network, { timeoutMs });
    try {
      await waiter.promise;
      return { switched: true };
    } catch (error) {
      waiter.cancel();
      throw error;
    }
  }

  getAvailableNetworks() {
    const source = this.getNetworkConfig('source');
    const destination = this.getNetworkConfig('destination');
    return [
      {
        key: 'source',
        chainId: source?.CHAIN_ID,
        name: source?.NAME,
        rpcUrl: source?.RPC_URL,
        fallbackRpcs: source?.FALLBACK_RPCS,
        blockExplorer: source?.BLOCK_EXPLORER,
        nativeCurrency: source?.NATIVE_CURRENCY,
      },
      {
        key: 'destination',
        chainId: destination?.CHAIN_ID,
        name: destination?.NAME,
        rpcUrl: destination?.RPC_URL,
        fallbackRpcs: destination?.FALLBACK_RPCS,
        blockExplorer: destination?.BLOCK_EXPLORER,
        nativeCurrency: destination?.NATIVE_CURRENCY,
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

  _requiredChainId(key = 'source') {
    return this.getNetworkConfig(key)?.CHAIN_ID;
  }

  _createNetworkWaiter(network, { timeoutMs = 3000 } = {}) {
    const expectedChainId = Number(network?.CHAIN_ID);
    const networkName = network?.NAME || 'the required network';

    if (this.isOnNetwork(this.getCurrentNetworkKey(expectedChainId) || 'source', expectedChainId)) {
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
      if (!resolved && this._normalizeChainId(this.getCurrentChainId()) === expectedChainId) {
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
        reject(new Error(`Timed out waiting for wallet to switch to ${networkName}`));
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

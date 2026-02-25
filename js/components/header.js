export class Header {
  constructor() {
    this.connectWalletBtn = null;
    this._connectBtnText = 'Connect Wallet';
  }

  load() {
    this.connectWalletBtn = document.getElementById('connect-wallet-btn');
    if (!this.connectWalletBtn) return;

    this._connectBtnText = this.connectWalletBtn.textContent?.trim() || this._connectBtnText;

    // Phase 2: MetaMask-only connection (Polygon-only tx)
    this.connectWalletBtn.addEventListener('click', () => this.onConnectWalletClick());

    // React to wallet events
    document.addEventListener('walletConnected', () => this.updateConnectButtonStatus());
    document.addEventListener('walletDisconnected', () => this.updateConnectButtonStatus());
    document.addEventListener('walletAccountChanged', () => this.updateConnectButtonStatus());
    document.addEventListener('walletChainChanged', () => this.updateConnectButtonStatus());

    this.updateConnectButtonStatus();
  }

  async onConnectWalletClick() {
    const btn = this.connectWalletBtn;
    if (!btn) return;

    const walletManager = window.walletManager;
    const networkManager = window.networkManager;
    const walletPopup = window.walletPopup;

    // No MetaMask
    if (!walletManager?.hasAvailableWallet?.()) {
      window.alert('MetaMask is required for this app (Phase 2).');
      return;
    }

    // Connecting
    if (walletManager?.isConnecting) {
      return;
    }

    // Connected + on Polygon → show popup
    if (walletManager?.isConnected?.() && networkManager?.isOnRequiredNetwork?.()) {
      walletPopup?.toggle?.(btn);
      return;
    }

    // Connected but wrong network → add/switch to Polygon
    if (walletManager?.isConnected?.() && !networkManager?.isOnRequiredNetwork?.()) {
      this.renderConnectButton({ text: 'Connecting to Polygon…', disabled: true });
      try {
        await networkManager.ensurePolygonNetwork();
      } catch (e) {
        if (e?.code === 4001) {
          window.alert('Network switch request was rejected.');
        } else if (e?.code === -32002) {
          window.alert('Network switch request already pending in MetaMask.');
        } else {
          window.alert('Please connect to Polygon in MetaMask.');
        }
      } finally {
        this.updateConnectButtonStatus();
      }
      return;
    }

    // Not connected → connect
    this.renderConnectButton({ text: 'Connecting…', disabled: true });
    try {
      await walletManager?.connectMetaMask?.();
      // If connected but wrong network, keep simple: user can click again to switch.
    } catch (e) {
      if (e?.code === 4001) {
        window.alert('Connection request was rejected.');
      } else if (e?.code === -32002) {
        window.alert('Connection request already pending in MetaMask.');
      } else {
        window.alert(e?.message || 'Failed to connect wallet');
      }
    } finally {
      this.updateConnectButtonStatus();
    }
  }

  updateConnectButtonStatus() {
    const walletManager = window.walletManager;
    const networkManager = window.networkManager;

    if (!this.connectWalletBtn) return;

    // MetaMask not installed
    if (!walletManager?.hasAvailableWallet?.()) {
      this.renderConnectButton({ text: 'Install MetaMask', disabled: false });
      return;
    }

    if (walletManager?.isConnecting) {
      this.renderConnectButton({ text: 'Connecting…', disabled: true });
      return;
    }

    const isConnected = !!walletManager?.isConnected?.();
    const address = walletManager?.getAddress?.();
    const onPolygon = !!networkManager?.isOnRequiredNetwork?.();

    if (!isConnected) {
      this.renderConnectButton({ text: 'Connect Wallet', disabled: false });
      return;
    }

    if (!onPolygon) {
      this.renderConnectButton({ text: 'Connect to Polygon', disabled: false });
      return;
    }

    const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected';
    this.renderConnectButton({ text: short, disabled: false, connected: true });
  }

  renderConnectButton({ text, disabled = false, connected = false } = {}) {
    const btn = this.connectWalletBtn;
    if (!btn) return;

    btn.textContent = text || this._connectBtnText;
    btn.disabled = !!disabled;
    btn.classList.toggle('is-connected', !!connected);
  }
}

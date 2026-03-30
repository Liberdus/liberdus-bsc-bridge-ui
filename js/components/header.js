import { escapeHtml } from '../utils/helpers.js';

export class Header {
  constructor() {
    this.connectWalletBtn = null;
    this._connectBtnText = 'Connect Wallet';
    this._pickerContainer = null;
    this._isPickerOpen = false;
    this._pickerSelectionId = null;
    this._walletApprovalToastId = null;
  }

  load() {
    this.connectWalletBtn = document.getElementById('connect-wallet-btn');
    if (!this.connectWalletBtn) return;

    this._connectBtnText = this.connectWalletBtn.textContent?.trim() || this._connectBtnText;
    this._ensurePickerContainer();

    this.connectWalletBtn.addEventListener('click', () => this.onConnectWalletClick());

    document.addEventListener('walletConnected', () => {
      this._dismissWalletApprovalToast();
      this.hideWalletPicker();
      this.updateConnectButtonStatus();
    });
    document.addEventListener('walletDisconnected', () => {
      this._dismissWalletApprovalToast();
      this.updateConnectButtonStatus();
    });
    document.addEventListener('walletAccountChanged', () => this.updateConnectButtonStatus());
    document.addEventListener('walletChainChanged', () => this.updateConnectButtonStatus());
    document.addEventListener('walletProvidersChanged', () => {
      if (!this._isPickerOpen) return;
      this._renderWalletPicker();
    });

    document.addEventListener('keydown', (event) => {
      if (!this._isPickerOpen || event.key !== 'Escape') return;
      if (window.walletManager?.isConnecting) return;
      this.hideWalletPicker();
    });

    this._pickerContainer.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest('[data-wallet-picker-close]')) {
        if (window.walletManager?.isConnecting) return;
        this.hideWalletPicker();
        return;
      }

      if (target.classList.contains('wallet-picker-backdrop')) {
        if (window.walletManager?.isConnecting) return;
        this.hideWalletPicker();
        return;
      }

      const walletButton = target.closest('[data-wallet-picker-id]');
      if (!walletButton) return;

      const walletId = walletButton.getAttribute('data-wallet-picker-id');
      if (!walletId) return;
      await this._connectSelectedWallet(walletId);
    });

    this.updateConnectButtonStatus();
  }

  async onConnectWalletClick() {
    const btn = this.connectWalletBtn;
    if (!btn) return;

    const { walletManager, walletPopup } = window;

    if (walletManager?.isConnecting) return;

    if (walletManager?.isConnected?.()) {
      walletPopup?.toggle?.(btn);
      return;
    }

    this.showWalletPicker();
  }

  showWalletPicker() {
    this._ensurePickerContainer();
    this._pickerSelectionId = window.walletManager?.getLastSelectedWalletId?.() || null;
    this._isPickerOpen = true;
    this._renderWalletPicker();
  }

  hideWalletPicker() {
    if (!this._pickerContainer) return;
    this._pickerContainer.innerHTML = '';
    this._pickerContainer.classList.add('hidden');
    this._isPickerOpen = false;
  }

  async _connectSelectedWallet(walletId) {
    const btn = this.connectWalletBtn;
    const { walletManager, walletPopup } = window;

    if (!btn || !walletManager) return;

    this._pickerSelectionId = walletId;
    this.renderConnectButton({ text: 'Connecting...', disabled: true });
    this._renderWalletPicker();
    this._showWalletApprovalToast();

    try {
      await walletManager.connect({ walletId, userInitiated: true });
      this._dismissWalletApprovalToast();
      this.hideWalletPicker();
      walletPopup?.show?.(btn);
    } catch (error) {
      this._dismissWalletApprovalToast();
      const message = error?.code === 4001
        ? 'Connection request was rejected.'
        : error?.code === -32002
          ? 'Connection request already pending in your wallet.'
          : error?.message || 'Failed to connect wallet';
      this._showWalletError(message);
      this._renderWalletPicker();
    } finally {
      this.updateConnectButtonStatus();
    }
  }

  _showWalletApprovalToast() {
    if (!window.toastManager?.show) return;
    this._walletApprovalToastId = window.toastManager.show({
      id: this._walletApprovalToastId || undefined,
      title: 'Wallet Connection',
      message: 'Waiting for wallet approval. Finish connecting in your wallet.',
      type: 'loading',
      timeoutMs: 0,
      dismissible: true,
      delayMs: 0,
    });
  }

  _dismissWalletApprovalToast() {
    if (!this._walletApprovalToastId) return;
    window.toastManager?.dismiss?.(this._walletApprovalToastId);
    this._walletApprovalToastId = null;
  }

  _showWalletError(message) {
    if (window.toastManager?.error) {
      window.toastManager.error(message, { title: 'Wallet Error' });
      return;
    }
    window.alert(message);
  }

  _renderWalletPicker() {
    if (!this._pickerContainer || !this._isPickerOpen) return;

    const { walletManager } = window;
    const wallets = walletManager?.getAvailableWallets?.() || [];
    const isConnecting = !!walletManager?.isConnecting;
    const selectedId = this._pickerSelectionId || walletManager?.getLastSelectedWalletId?.() || wallets[0]?.id || null;

    const walletOptions = wallets.length
      ? wallets.map((wallet) => {
          const isSelected = wallet.id === selectedId;
          const iconHtml = wallet.icon
            ? `
              <span class="wallet-picker-option-icon wallet-picker-option-icon--image">
                <img class="wallet-picker-option-icon-image" src="${escapeHtml(wallet.icon)}" alt="" />
              </span>
            `
            : `
              <span class="wallet-picker-option-icon">
                <span class="wallet-picker-option-icon-fallback" aria-hidden="true">${escapeHtml(wallet.name?.slice?.(0, 1) || 'W')}</span>
              </span>
            `;

          return `
            <button
              type="button"
              class="wallet-picker-option${isSelected ? ' is-selected' : ''}"
              data-wallet-picker-id="${escapeHtml(wallet.id)}"
              ${isConnecting ? 'disabled' : ''}
            >
              ${iconHtml}
              <span class="wallet-picker-option-name">${escapeHtml(wallet.name || 'Browser Wallet')}</span>
            </button>
          `;
        }).join('')
      : `
        <div class="wallet-picker-empty">
          <p class="wallet-picker-empty-title">No browser wallet found</p>
          <p class="wallet-picker-empty-copy">Install or unlock an EVM-compatible wallet to continue.</p>
        </div>
      `;

    this._pickerContainer.classList.remove('hidden');
    this._pickerContainer.innerHTML = `
      <div class="modal-backdrop wallet-picker-backdrop" role="presentation">
        <div class="modal wallet-picker-modal" role="dialog" aria-modal="true" aria-label="Choose a wallet">
          <div class="modal-header wallet-picker-header">
            <div class="modal-title">Choose a wallet</div>
            <button
              type="button"
              class="wallet-picker-close"
              aria-label="Close wallet picker"
              data-wallet-picker-close
              ${isConnecting ? 'disabled' : ''}
            >
              ×
            </button>
          </div>
          <div class="modal-body wallet-picker-body">
            ${walletOptions}
          </div>
        </div>
      </div>
    `;
  }

  _ensurePickerContainer() {
    if (this._pickerContainer) return;

    this._pickerContainer = document.getElementById('wallet-picker-container');
    if (!this._pickerContainer) {
      this._pickerContainer = document.createElement('div');
      this._pickerContainer.id = 'wallet-picker-container';
      this._pickerContainer.className = 'hidden';
      document.body.appendChild(this._pickerContainer);
    }
  }

  updateConnectButtonStatus() {
    const { walletManager } = window;

    if (!this.connectWalletBtn) return;

    if (walletManager?.isConnecting) {
      this.renderConnectButton({ text: 'Connecting...', disabled: true });
      return;
    }

    const isConnected = !!walletManager?.isConnected?.();
    const address = walletManager?.getAddress?.();
    if (!isConnected) {
      this.renderConnectButton({ text: 'Connect Wallet', disabled: false });
      return;
    }

    const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected';
    this.renderConnectButton({ text: short, disabled: false, connected: isConnected });
  }

  renderConnectButton({ text, disabled = false, connected = false } = {}) {
    const btn = this.connectWalletBtn;
    if (!btn) return;

    btn.textContent = text || this._connectBtnText;
    btn.disabled = !!disabled;
    btn.classList.toggle('is-connected', !!connected);
  }
}

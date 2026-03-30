import { createTransactionProgressSession } from '../utils/transaction-progress-session.js';
import { getObserverBaseUrl } from '../utils/observer-url.js';

export class PolygonBscBridgeModule {
  constructor({
    contractManager = null,
    walletManager = null,
    networkManager = null,
    toastManager = null,
    config = null,
  } = {}) {
    this.contractManager = contractManager || window.contractManager || null;
    this.walletManager = walletManager || window.walletManager || null;
    this.networkManager = networkManager || window.networkManager || null;
    this.toastManager = toastManager || window.toastManager || null;
    this.config = config || window.CONFIG;

    this.container = null;

    this._els = {};
    this._lastSnapshot = null;
    this._availableBalanceWei = null;
    this._refreshTimerId = null;
    this._actionToastSequence = 0;
    this._bridgeProgressSession = null;
    this._bridgeProgressVisibilityCleanup = null;
    this._isBridgePreflightPending = false;
    this._bound = false;

    this._onWalletEvent = this._onWalletEvent.bind(this);
    this._onContractUpdated = this._onContractUpdated.bind(this);
    this._onBridgeClicked = this._onBridgeClicked.bind(this);
    this._onSetMaxClicked = this._onSetMaxClicked.bind(this);
    this._onCopyAddressClicked = this._onCopyAddressClicked.bind(this);
    this._onAmountInput = this._onAmountInput.bind(this);
    this._onAmountPaste = this._onAmountPaste.bind(this);
  }

  mount(container) {
    if (!container) return;
    this.container = container;
    this._render();
    this._bind();
    this.refresh().catch(() => {});
  }

  destroy() {
    this._unbind();
    this._clearBridgeProgressSession();
    if (this._refreshTimerId) window.clearTimeout(this._refreshTimerId);
    this._refreshTimerId = null;
    this.container = null;
    this._els = {};
  }

  async refresh() {
    if (!this.contractManager?.isReady?.()) return;
    await this.contractManager.refreshStatus({ reason: 'bridgeModuleRefresh' });
    await this._refreshBalance();
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;

    document.addEventListener('walletConnected', this._onWalletEvent);
    document.addEventListener('walletDisconnected', this._onWalletEvent);
    document.addEventListener('walletAccountChanged', this._onWalletEvent);
    document.addEventListener('walletChainChanged', this._onWalletEvent);
    document.addEventListener('contractManagerUpdated', this._onContractUpdated);

    this._els.bridgeBtn?.addEventListener('click', this._onBridgeClicked);
    this._els.setMaxBtn?.addEventListener('click', this._onSetMaxClicked);
    for (const button of this._els.copyAddressButtons) {
      button.addEventListener('click', this._onCopyAddressClicked);
    }
    this._els.amount?.addEventListener('input', this._onAmountInput);
    this._els.amount?.addEventListener('paste', this._onAmountPaste);
  }

  _unbind() {
    if (!this._bound) return;
    this._bound = false;

    document.removeEventListener('walletConnected', this._onWalletEvent);
    document.removeEventListener('walletDisconnected', this._onWalletEvent);
    document.removeEventListener('walletAccountChanged', this._onWalletEvent);
    document.removeEventListener('walletChainChanged', this._onWalletEvent);
    document.removeEventListener('contractManagerUpdated', this._onContractUpdated);

    this._els.bridgeBtn?.removeEventListener('click', this._onBridgeClicked);
    this._els.setMaxBtn?.removeEventListener('click', this._onSetMaxClicked);
    for (const button of this._els.copyAddressButtons) {
      button.removeEventListener('click', this._onCopyAddressClicked);
    }
    this._els.amount?.removeEventListener('input', this._onAmountInput);
    this._els.amount?.removeEventListener('paste', this._onAmountPaste);
  }

  _render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="card bridge-module" data-bridge-module>
        <div class="bridge-route-shell">
          <div class="bridge-route-grid">
            <div class="bridge-route-card">
              <div class="bridge-route-copy">
                <div class="bridge-route-label">From</div>
                <div class="bridge-route-title-row">
                  <div class="bridge-route-name"><span data-bridge-source-name></span></div>
                  <div class="bridge-route-icon">
                    <img src="${this._assetPath('chain-polygon.png')}" alt="Polygon logo" />
                  </div>
                </div>
                <div class="bridge-route-wallet-row">
                  <div class="bridge-route-wallet-label">Sender</div>
                  <button type="button" class="bridge-route-address" data-bridge-copy-address data-address="" aria-label="Copy address">
                    <span class="bridge-route-address-full">Connect wallet</span>
                    <span class="bridge-route-address-short">Connect wallet</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="bridge-route-arrow" aria-hidden="true">
              <svg class="bridge-route-arrow-icon" viewBox="0 0 24 24" focusable="false">
                <path d="M3 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <div class="bridge-route-card">
              <div class="bridge-route-copy">
                <div class="bridge-route-label">To</div>
                <div class="bridge-route-title-row">
                  <div class="bridge-route-name"><span data-bridge-dest-name></span></div>
                  <div class="bridge-route-icon">
                    <img src="${this._assetPath('chain-bnb.png')}" alt="BNB Chain logo" />
                  </div>
                </div>
                <div class="bridge-route-wallet-row">
                  <div class="bridge-route-wallet-label">Recipient</div>
                  <button type="button" class="bridge-route-address" data-bridge-copy-address data-address="" aria-label="Copy address">
                    <span class="bridge-route-address-full">Connect wallet</span>
                    <span class="bridge-route-address-short">Connect wallet</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="field bridge-amount-field" data-bridge-amount-field>
          <div class="bridge-amount-top">
            <textarea class="field-input bridge-amount-input" placeholder="0" inputmode="decimal" rows="1" data-bridge-amount data-requires-tx="true" data-allow-input-when-locked="true"></textarea>
            <div class="bridge-token-chip" aria-hidden="true">
              <img class="bridge-token-chip-icon" src="${this._assetPath('lib-token.png')}" alt="" />
              <span>${this._tokenSymbol()}</span>
            </div>
          </div>
          <div class="bridge-amount-footer">
            <span class="bridge-amount-max-value" data-bridge-max-hint>Max bridge out <span data-bridge-max-amount>-</span> ${this._tokenSymbol()}</span>
            <span class="bridge-amount-available-value" data-bridge-user-balance>- ${this._tokenSymbol()} Available</span>
            <button type="button" class="btn bridge-max-btn" data-bridge-set-max data-requires-tx="true">Max</button>
          </div>
        </div>

        <div class="actions bridge-actions">
          <button type="button" class="btn btn--primary" data-bridge-submit data-requires-tx="true">Bridge Out</button>
        </div>
      </div>
    `;

    this._els = {
      sourceName: this.container.querySelector('[data-bridge-source-name]'),
      destName: this.container.querySelector('[data-bridge-dest-name]'),
      copyAddressButtons: Array.from(this.container.querySelectorAll('[data-bridge-copy-address]')),
      amountField: this.container.querySelector('[data-bridge-amount-field]'),
      amount: this.container.querySelector('[data-bridge-amount]'),
      userBalance: this.container.querySelector('[data-bridge-user-balance]'),
      maxAmountHint: this.container.querySelector('[data-bridge-max-hint]'),
      maxAmount: this.container.querySelector('[data-bridge-max-amount]'),
      bridgeBtn: this.container.querySelector('[data-bridge-submit]'),
      setMaxBtn: this.container.querySelector('[data-bridge-set-max]'),
    };

    this._syncChainText();
    this._syncAmountInput();
    this._updateActionStates();
  }

  _syncChainText() {
    const source = this.config.BRIDGE.CHAINS.SOURCE;
    const dest = this.config.BRIDGE.CHAINS.DESTINATION;

    if (this._els.sourceName) this._els.sourceName.textContent = source.NAME;
    if (this._els.destName) this._els.destName.textContent = dest.NAME;
    this._syncRouteAddresses();
  }

  _onWalletEvent() {
    this._syncRouteAddresses();
    this._updateActionStates();
    this._scheduleRefresh();
  }

  _onContractUpdated(e) {
    this._lastSnapshot = e?.detail?.status || null;
    this._renderFromSnapshot();
    this._updateActionStates();
    this._scheduleRefreshBalance();
  }

  _renderFromSnapshot() {
    const s = this._lastSnapshot;
    if (!s) return;

    if (this._els.maxAmount) this._els.maxAmount.textContent = s.maxBridgeOutAmount ? this._formatTokenUnits(s.maxBridgeOutAmount) : '-';
    this._syncAmountInput();
  }

  _onAmountInput() {
    this._syncAmountInput();
    this._updateActionStates();
  }

  _onAmountPaste(event) {
    const amount = this._els.amount;
    if (!amount) return;

    const pasted = String(event.clipboardData?.getData('text') || '').trim();
    const start = amount.selectionStart;
    const end = amount.selectionEnd;
    const nextValue = `${amount.value.slice(0, start)}${pasted}${amount.value.slice(end)}`;

    if (!this._isEditableAmountValue(nextValue)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    amount.value = nextValue;
    this._syncAmountInput();
    this._updateActionStates();
  }

  _updateActionStates() {
    const txEnabled = !!this.networkManager?.isTxEnabled?.();
    const connected = !!this.walletManager?.isConnected?.();
    const session = this._bridgeProgressSession;
    const snapshot = this._lastSnapshot;
    const amountInput = this._els.amount;
    if (!amountInput) return;

    const balanceWei = this._availableBalanceWei || null;
    const formLocked = this._isBridgePreflightPending || !!session;
    amountInput.disabled = formLocked;

    const recipient = this._getRecipientAddress();
    const recipientOk = this._isAddress(recipient);
    const amountWei = this._parseAmountToWei(amountInput.value);
    const hasAmount = !!amountWei && amountWei.gt(0);
    const exceedsBalance = hasAmount && !!balanceWei && amountWei.gt(balanceWei);
    const exceedsMax = hasAmount && !!snapshot?.maxBridgeOutAmount && amountWei.gt(this._bn(snapshot.maxBridgeOutAmount));

    const bridgeEnabled = snapshot?.bridgeOutEnabled !== false && snapshot?.halted !== true;
    const amountOk = hasAmount && !exceedsBalance && !exceedsMax;
    const canBridge = connected && recipientOk && amountOk && bridgeEnabled;

    const amountInvalid = exceedsBalance || exceedsMax;
    this._els.amountField?.classList.toggle('is-invalid', amountInvalid);
    amountInput.classList.toggle('is-invalid', amountInvalid);
    this._els.userBalance?.classList.toggle('is-invalid', exceedsBalance);
    this._els.maxAmountHint?.classList.toggle('is-invalid', exceedsMax);

    if (this._els.bridgeBtn) {
      const button = this._els.bridgeBtn;
      let disabled = true;
      let label = 'Bridging...';

      if (!this._isBridgePreflightPending && !session?.isVisible?.()) {
        if (session?.isHidden?.() && session.isActive()) {
          disabled = false;
          label = 'View Progress';
        } else {
          disabled = !canBridge;
          label = 'Bridge Out';
        }
      } else if (session?.isVisible?.() && !session.isActive()) {
        label = 'Checklist Open';
      }

      button.disabled = disabled;
      button.classList.toggle('disabled', disabled);
      button.textContent = label;
    }
    if (this._els.setMaxBtn) this._els.setMaxBtn.disabled = !txEnabled || formLocked;
  }

  _needsApproval(amountWei, allowanceWei) {
    if (!amountWei || amountWei.lte(0)) return true;
    if (!allowanceWei) return true;
    return allowanceWei.lt(amountWei);
  }

  _assertBridgeRequestUnchanged(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Bridge request snapshot is required');
    }

    const address = this._comparableAddress(this.walletManager?.getAddress?.());
    if (address !== this._comparableAddress(request.address)) {
      throw new Error('Wallet account changed during bridge flow. Please review and try again.');
    }

    if (Object.prototype.hasOwnProperty.call(request, 'recipient')) {
      const recipient = this._comparableAddress(this._getRecipientAddress());
      if (recipient !== this._comparableAddress(request.recipient)) {
        throw new Error('Recipient changed during bridge flow. Please review and try again.');
      }
    }

    const amountInput = this._els.amount;
    const amountWei = amountInput ? this._parseAmountToWei(amountInput.value) : null;
    if (!amountWei || amountWei.toString() !== request.amountWei) {
      throw new Error('Amount changed during bridge flow. Please review and try again.');
    }
  }

  _assertActionRequestContext(request) {
    this._assertBridgeRequestUnchanged(request);
    if (!this.networkManager?.isOnRequiredNetwork?.()) {
      throw new Error('Wallet network changed during bridge flow. Please review and try again.');
    }
  }

  _isCurrentAccount(address) {
    return this._comparableAddress(this.walletManager?.getAddress?.()) === this._comparableAddress(address);
  }

  _assertBridgeSubmitStillAllowed(amountWei) {
    if (!amountWei || typeof amountWei.gt !== 'function') {
      throw new Error('Bridge amount is required');
    }

    const balanceWei = this._availableBalanceWei;
    if (balanceWei && amountWei.gt(balanceWei)) {
      throw new Error('Amount exceeds available balance. Please review and try again.');
    }

    const snapshot = this.contractManager?.getStatusSnapshot?.();
    if (snapshot?.bridgeOutEnabled === false) {
      throw new Error('Bridge out is currently disabled');
    }
    if (snapshot?.halted === true) {
      throw new Error('Vault is currently halted');
    }
    if (snapshot?.maxBridgeOutAmount && amountWei.gt(this._bn(snapshot.maxBridgeOutAmount))) {
      throw new Error('Amount exceeds max bridge out limit');
    }
  }

  _getRequestSigner(address) {
    if (!address) return null;
    const provider = this.walletManager?.getProvider?.();
    if (provider?.getSigner) {
      try {
        return provider.getSigner(address);
      } catch (_) {}
    }
    return this.walletManager?.getSigner?.() || null;
  }

  _bindWriteContractToRequestAddress(contract, address) {
    if (!contract) return null;
    const signer = this._getRequestSigner(address);
    if (!signer) return null;
    if (typeof contract.connect === 'function') {
      try {
        return contract.connect(signer);
      } catch (_) {}
    }
    return contract;
  }

  async _onSetMaxClicked() {
    const snapshot = this.contractManager?.getStatusSnapshot?.() || this._lastSnapshot;
    const maxStr = snapshot?.maxBridgeOutAmount || null;
    if (!this._els.amount) return;
    if (!maxStr) {
      this.toastManager?.error?.('Unable to read max bridge out amount from contract');
      return;
    }

    const maxWei = this._bn(maxStr);
    const lastKnownBalanceWei = this._availableBalanceWei || null;
    const address = this.walletManager?.getAddress?.() || null;
    const refreshedBalanceWei = address ? await this._refreshBalance({ clearOnReadFailure: false }).catch(() => null) : null;
    if (address && !this._isCurrentAccount(address)) return;
    const userBalWei = refreshedBalanceWei || this._availableBalanceWei || lastKnownBalanceWei || null;
    const setWei = userBalWei && userBalWei.lt(maxWei) ? userBalWei : maxWei;
    this._els.amount.value = this._formatEditableTokenUnits(setWei.toString());
    this._syncAmountInput();
    this._updateActionStates();
  }

  _clearBridgeProgressSession() {
    if (this._bridgeProgressVisibilityCleanup) {
      this._bridgeProgressVisibilityCleanup();
      this._bridgeProgressVisibilityCleanup = null;
    }

    this._bridgeProgressSession = null;
    this._updateActionStates();
  }

  _setBridgeProgressSession(session) {
    if (this._bridgeProgressVisibilityCleanup) {
      this._bridgeProgressVisibilityCleanup();
      this._bridgeProgressVisibilityCleanup = null;
    }

    this._bridgeProgressSession = session;
    if (!session) {
      this._updateActionStates();
      return;
    }

    this._bridgeProgressVisibilityCleanup = session.onVisibilityChange(({ hidden, active }) => {
      if (this._bridgeProgressSession !== session) {
        return;
      }
      if (hidden && !active) {
        this._clearBridgeProgressSession();
        return;
      }
      this._updateActionStates();
    });

    this._updateActionStates();
  }

  async _onBridgeClicked() {
    if (this._bridgeProgressSession) {
      if (this._bridgeProgressSession.isHidden()) {
        this._bridgeProgressSession.reopen();
      }
      this._updateActionStates();
      return;
    }

    if (this._isBridgePreflightPending) {
      return;
    }

    const actionToastId = this._nextActionToastId('bridgeOut');
    this._isBridgePreflightPending = true;
    this._updateActionStates();

    try {
      const address = this.walletManager?.getAddress?.();
      if (!address) throw new Error('Wallet not connected');

      const amountInput = this._els.amount;
      if (!amountInput) throw new Error('Amount input is required');

      const recipient = this._getRecipientAddress();
      if (!this._isAddress(recipient)) throw new Error('Invalid recipient address');

      const amountWei = this._parseAmountToWei(amountInput.value);
      if (!amountWei || amountWei.lte(0)) throw new Error('Enter a valid amount');

      const bridgeRequest = {
        address: String(address).trim(),
        recipient,
        amountWei: amountWei.toString(),
      };

      this._assertBridgeSubmitStillAllowed(amountWei);

      const snapshot = this.contractManager?.getStatusSnapshot?.();
      const bridgeChainId = this._getBridgeOutChainId(snapshot);
      if (!bridgeChainId) throw new Error('Bridge chain ID is not configured');

      const switchResult = await this._ensureRequiredNetworkForAction(actionToastId);
      if (switchResult.toastId) {
        this.toastManager?.dismiss?.(switchResult.toastId);
      }

      this._assertActionRequestContext(bridgeRequest);

      const tokenAddr = await this._getTokenAddress();
      if (!tokenAddr) throw new Error('Token address not available');

      const vault = this.config.BRIDGE.CONTRACTS.SOURCE.ADDRESS;
      if (!vault) throw new Error('Vault address not configured');

      const signer = this._getRequestSigner(bridgeRequest.address);
      if (!signer) throw new Error('Wallet not connected');

      let contract = this.contractManager?.getWriteContract?.();
      contract = this._bindWriteContractToRequestAddress(contract, bridgeRequest.address);
      if (!contract) throw new Error('Wallet not connected');

      const { balanceWei, allowanceWei } = await this._readSourceTokenState({
        tokenAddr,
        vaultAddr: vault,
        address: bridgeRequest.address,
      });
      this._assertActionRequestContext(bridgeRequest);
      if (balanceWei == null) {
        this._setAvailableBalance(null);
        throw new Error('Unable to refresh available balance. Please try again.');
      }
      this._setAvailableBalance(balanceWei);
      this._assertBridgeSubmitStillAllowed(amountWei);

      const needsApproval = this._needsApproval(amountWei, allowanceWei);
      const stepId = {
        approve: 'approve-bridge-token',
        submit: 'submit-bridge-out',
        confirm: 'confirm-bridge-out',
      };
      const progressSession = createTransactionProgressSession(this.toastManager, {
        title: 'Bridging Out',
        successTitle: 'Bridge Out Confirmed',
        failureTitle: 'Bridge Out Failed',
        cancelledTitle: 'Bridge Out Cancelled',
        summary: 'Complete the steps below in your wallet and on-chain.',
        steps: [
          {
            id: stepId.approve,
            label: `Approve ${this._tokenSymbol()}`,
            status: needsApproval ? 'pending' : 'completed',
            detail: needsApproval ? '' : 'Already approved',
          },
          { id: stepId.submit, label: 'Submit bridge out', status: 'pending', detail: '' },
          { id: stepId.confirm, label: 'Confirm bridge on-chain', status: 'pending', detail: '' },
        ],
      });
      this._isBridgePreflightPending = false;
      this._setBridgeProgressSession(progressSession);

      const finishProgressFailure = ({ step, error, fallback }) => {
        const message = this._actionErrorMessage(error, fallback);
        progressSession.updateStep(step, { status: 'failed', detail: message });
        progressSession.finishFailure(message);
      };

      const failForPreApprovalContext = ({ step }) => {
        try {
          this._assertActionRequestContext(bridgeRequest);
          return false;
        } catch (error) {
          finishProgressFailure({ step, error, fallback: 'Bridge failed' });
          return true;
        }
      };

      const failForChangedRequest = ({ step }) => {
        try {
          this._assertBridgeRequestUnchanged(bridgeRequest);
          return false;
        } catch (error) {
          finishProgressFailure({ step, error, fallback: 'Bridge failed' });
          return true;
        }
      };

      if (failForPreApprovalContext({ step: needsApproval ? stepId.approve : stepId.submit })) {
        return;
      }

      if (needsApproval) {
        const token = new window.ethers.Contract(tokenAddr, this._erc20Abi(), signer);
        progressSession.updateStep(stepId.approve, { status: 'active', detail: 'Confirm in wallet' });

        let approveTx;
        try {
          approveTx = await token.approve(vault, amountWei);
        } catch (error) {
          if (this._isUserRejectionError(error)) {
            progressSession.updateStep(stepId.approve, {
              status: 'cancelled',
              detail: 'Wallet request rejected',
            });
            progressSession.finishCancelled('Cancelled during token approval.');
            return;
          }

          const message = this._actionErrorMessage(error, 'Approval failed');
          progressSession.updateStep(stepId.approve, { status: 'failed', detail: message });
          progressSession.finishFailure(message);
          return;
        }

        progressSession.updateStep(stepId.approve, { status: 'active', detail: 'Waiting for confirmation' });
        try {
          await approveTx.wait(1);
        } catch (error) {
          const message = this._actionErrorMessage(error, 'Approval failed');
          progressSession.updateStep(stepId.approve, { status: 'failed', detail: message });
          progressSession.finishFailure(message);
          return;
        }

        await this._refreshBalance({ clearOnReadFailure: false }).catch(() => {});
        await this.contractManager?.refreshStatus?.({ reason: 'bridgeApprovalConfirmed' }).catch(() => {});
        progressSession.updateStep(stepId.approve, { status: 'completed', detail: 'Approved' });
      }

      if (failForChangedRequest({ step: stepId.submit })) {
        return;
      }

      try {
        this._assertBridgeSubmitStillAllowed(amountWei);
      } catch (error) {
        finishProgressFailure({ step: stepId.submit, error, fallback: 'Bridge failed' });
        return;
      }

      let postApprovalSwitchResult;
      try {
        postApprovalSwitchResult = await this._ensureRequiredNetworkForAction(actionToastId);
      } catch (error) {
        const dismissId = error?._actionToastId;
        if (dismissId) {
          this.toastManager?.dismiss?.(dismissId);
        }
        finishProgressFailure({ step: stepId.submit, error, fallback: 'Bridge failed' });
        return;
      }
      if (postApprovalSwitchResult.toastId) {
        this.toastManager?.dismiss?.(postApprovalSwitchResult.toastId);
      }

      if (failForChangedRequest({ step: stepId.submit })) {
        return;
      }

      const submitSigner = this._getRequestSigner(bridgeRequest.address);
      if (!submitSigner) {
        finishProgressFailure({
          step: stepId.submit,
          error: new Error('Wallet not connected'),
          fallback: 'Bridge failed',
        });
        return;
      }

      contract = this.contractManager?.getWriteContract?.();
      contract = this._bindWriteContractToRequestAddress(contract, bridgeRequest.address);
      if (!contract) {
        finishProgressFailure({
          step: stepId.submit,
          error: new Error('Wallet not connected'),
          fallback: 'Bridge failed',
        });
        return;
      }

      progressSession.updateStep(stepId.submit, { status: 'active', detail: 'Confirm in wallet' });

      let tx;
      try {
        tx = await contract.bridgeOut(amountWei, recipient, bridgeChainId);
      } catch (error) {
        if (this._isUserRejectionError(error)) {
          progressSession.updateStep(stepId.submit, {
            status: 'cancelled',
            detail: 'Wallet request rejected',
          });
          progressSession.finishCancelled('Cancelled before bridge submission.');
          return;
        }

        const message = this._actionErrorMessage(error, 'Bridge failed');
        progressSession.updateStep(stepId.submit, { status: 'failed', detail: message });
        progressSession.finishFailure(message);
        return;
      }

      progressSession.updateStep(stepId.submit, { status: 'completed', detail: 'Submitted' });
      progressSession.setTransactionLink({
        hash: tx.hash,
        url: this._getTransactionExplorerUrl(tx.hash),
      });
      progressSession.updateStep(stepId.confirm, { status: 'active', detail: 'Waiting for confirmation' });

      let receipt;
      try {
        receipt = await tx.wait(1);
      } catch (error) {
        const message = this._actionErrorMessage(error, 'Bridge failed');
        progressSession.updateStep(stepId.confirm, { status: 'failed', detail: message });
        progressSession.finishFailure(message);
        return;
      }

      if (receipt?.status === 0) {
        const message = 'Bridge transaction failed on-chain';
        progressSession.updateStep(stepId.confirm, { status: 'failed', detail: message });
        progressSession.finishFailure(message);
        return;
      }

      const bridgedOut = this._parseBridgedOutFromReceipt(receipt);
      progressSession.updateStep(stepId.confirm, { status: 'completed', detail: 'Confirmed' });
      progressSession.finishSuccess(bridgedOut ? 'Bridge out confirmed.' : 'Bridge confirmed.');

      void this._notifyBridgeOutObserver({ chainId: this.config?.BRIDGE?.CHAINS?.SOURCE?.CHAIN_ID });

      if (bridgedOut) {
        const detail = {
          txHash: tx.hash,
          from: bridgedOut.from,
          amount: bridgedOut.amount,
          targetAddress: bridgedOut.targetAddress,
          targetChainId: Number(bridgedOut.chainId),
          sourceChainId: this.config.BRIDGE.CHAINS.SOURCE.CHAIN_ID,
          timestamp: Math.floor(Date.now() / 1000),
        };
        document.dispatchEvent(new CustomEvent('bridgeOutEvent', { detail }));
      }

      await this._refreshBalance();
    } catch (error) {
      const toastId = error?._actionToastId || actionToastId;
      const message = this._actionErrorMessage(error, 'Bridge failed');
      this._showActionToast({ toastId, title: 'Error', message, type: 'error', timeoutMs: 0, dismissible: true });
    } finally {
      this._isBridgePreflightPending = false;
      this._updateActionStates();
    }
  }

  _parseBridgedOutFromReceipt(receipt) {
    try {
      if (!receipt?.logs || !this.contractManager?.abi || !window.ethers) return null;
      const iface = new window.ethers.utils.Interface(this.contractManager.abi);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'BridgedOut') {
            return {
              from: parsed.args?.from,
              amount: parsed.args?.amount?.toString?.() ?? String(parsed.args?.amount ?? ''),
              targetAddress: parsed.args?.targetAddress,
              chainId: parsed.args?.chainId?.toString?.() ?? String(parsed.args?.chainId ?? ''),
            };
          }
        } catch (_) {}
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async _notifyBridgeOutObserver({ chainId }) {
    const normalizedChainId = Number(chainId);
    if (!Number.isFinite(normalizedChainId) || normalizedChainId <= 0) return;

    const observerBaseUrl = getObserverBaseUrl(this.config);
    if (!observerBaseUrl || typeof fetch !== 'function') return;

    try {
      const response = await fetch(`${observerBaseUrl}/notify-bridgeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: normalizedChainId }),
        keepalive: true,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {}

      if (!response.ok) {
        const message = payload?.Err || `HTTP ${response.status}`;
        throw new Error(message);
      }

    } catch (error) {
      try {
        console.warn?.('[BridgeOut] Observer notify failed', error);
      } catch {}
    }
  }

  _setAvailableBalance(balanceWei) {
    this._availableBalanceWei = balanceWei || null;
    if (this._els.userBalance)
      this._els.userBalance.textContent = balanceWei ? `${this._formatTokenUnits(balanceWei.toString())} ${this._tokenSymbol()} Available` : `- ${this._tokenSymbol()} Available`;

    this._updateActionStates();
  }

  async _readSourceTokenState({ tokenAddr = null, vaultAddr = null, address = null } = {}) {
    if (!window.ethers) {
      return { balanceWei: null, allowanceWei: null };
    }

    const provider = this.contractManager?.provider || null;
    const accountAddress = address || this.walletManager?.getAddress?.() || null;
    if (!provider || !accountAddress) {
      return { balanceWei: null, allowanceWei: null };
    }

    const resolvedTokenAddr = tokenAddr || (await this._getTokenAddress());
    if (!resolvedTokenAddr) {
      return { balanceWei: null, allowanceWei: null };
    }

    const token = new window.ethers.Contract(resolvedTokenAddr, this._erc20Abi(), provider);
    const reads = [token.balanceOf(accountAddress).catch(() => null)];
    if (vaultAddr) {
      reads.push(token.allowance(accountAddress, vaultAddr).catch(() => null));
    } else {
      reads.push(Promise.resolve(null));
    }

    const [bal, allowance] = await Promise.all(reads);
    return {
      balanceWei: bal ? this._bn(bal.toString()) : null,
      allowanceWei: allowance ? this._bn(allowance.toString()) : null,
    };
  }

  async _refreshBalance({ clearOnReadFailure = true } = {}) {
    if (!window.ethers) return null;

    const provider = this.contractManager?.provider || null;
    const address = this.walletManager?.getAddress?.() || null;
    if (!provider || !address) {
      this._setAvailableBalance(null);
      return null;
    }

    const { balanceWei } = await this._readSourceTokenState({ address });
    if (!this._isCurrentAccount(address)) {
      return null;
    }
    if (balanceWei == null) {
      if (clearOnReadFailure) this._setAvailableBalance(null);
      return null;
    }

    this._setAvailableBalance(balanceWei);
    return balanceWei;
  }

  async _getTokenAddress() {
    const configured = this.config?.TOKEN?.ADDRESS;
    if (configured && window.ethers?.utils?.getAddress) {
      try {
        return window.ethers.utils.getAddress(configured);
      } catch (_) {
        // fall through to contract-derived address
      }
    }

    const snapshot = this.contractManager?.getStatusSnapshot?.();
    if (snapshot?.token) return snapshot.token;

    const contract = this.contractManager?.getReadContract?.();
    if (!contract?.token) return null;
    try {
      const tokenAddr = await contract.token();
      return tokenAddr ? String(tokenAddr) : null;
    } catch (_) {
      return null;
    }
  }

  _getBridgeOutChainId(snapshot = null) {
    const status = snapshot ?? this.contractManager?.getStatusSnapshot?.() ?? null;
    const onChainId = Number(status?.onChainId);
    if (Number.isInteger(onChainId) && onChainId > 0) return onChainId;
    return this.config.BRIDGE.CHAINS.SOURCE.CHAIN_ID;
  }

  async _ensureRequiredNetworkForAction(toastId) {
    if (this.networkManager?.isOnRequiredNetwork?.()) {
      return { switched: false, toastId: null };
    }
    const requiredNetworkName = this.config.BRIDGE.CHAINS.SOURCE.NAME;

    const activeToastId = this._showActionToast({
      toastId,
      title: 'Loading',
      message: `Switch to ${requiredNetworkName} in your wallet to continue`,
      type: 'loading',
      timeoutMs: 0,
      dismissible: false,
    });

    try {
      const result = await this.networkManager?.ensureRequiredNetwork?.();
      await this.contractManager?.refreshStatus?.({ reason: 'requiredNetworkEnsured' }).catch(() => {});
      await this._refreshBalance().catch(() => {});
      this._updateActionStates();
      return { switched: !!result?.switched, toastId: activeToastId };
    } catch (error) {
      if (error && typeof error === 'object') {
        error._phase = 'networkSwitch';
        error._actionToastId = activeToastId;
      }
      throw error;
    }
  }

  _showActionToast({ toastId = null, title, message, type = 'info', timeoutMs = 0, dismissible = true, allowHtml = false }) {
    return (
      this.toastManager?.show?.({
        id: toastId || undefined,
        title,
        message,
        type,
        timeoutMs,
        dismissible,
        delayMs: 0,
        allowHtml,
      }) || toastId || null
    );
  }

  _nextActionToastId(base) {
    this._actionToastSequence += 1;
    return `${base}-${Date.now()}-${this._actionToastSequence}`;
  }

  _actionErrorMessage(error, fallback) {
    if (error?._phase === 'networkSwitch') {
      const requiredNetworkName = this.config.BRIDGE.CHAINS.SOURCE.NAME;
      if (error?.code === 4001) return 'Network switch request was rejected.';
      if (error?.code === -32002) return 'Network switch request already pending in your wallet.';
      return this._extractActionErrorMessage(error) || `Failed to switch to ${requiredNetworkName}.`;
    }
    return this._extractActionErrorMessage(error) || fallback;
  }

  _isUserRejectionError(error) {
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
      return true;
    }
    const message = this._extractActionErrorMessage(error);
    return typeof message === 'string' && /rejected/i.test(message);
  }

  _extractActionErrorMessage(error) {
    const candidates = [
      error?.data?.message,
      error?.error?.data?.message,
      error?.reason,
      error?.shortMessage,
      error?.error?.message,
      error?.message,
    ];

    let fallback = null;
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const normalized = this._normalizeActionErrorMessage(candidate);
      if (!normalized) continue;
      if (!/^internal json-rpc error\.?$/i.test(normalized)) return normalized;
      fallback = fallback || normalized;
    }

    return fallback;
  }

  _normalizeActionErrorMessage(message) {
    let text = String(message || '').trim();
    if (!text) return null;

    text = text.replace(/^Internal JSON-RPC error\.?\s*/i, '').trim();
    text = text.replace(/^execution reverted:\s*/i, '').trim();
    if (!text) return 'Internal JSON-RPC error.';

    return text;
  }

  _scheduleRefresh() {
    if (this._refreshTimerId) window.clearTimeout(this._refreshTimerId);
    this._refreshTimerId = window.setTimeout(() => {
      this._refreshTimerId = null;
      this.refresh().catch(() => {});
    }, 200);
  }

  _scheduleRefreshBalance() {
    if (this._refreshTimerId) window.clearTimeout(this._refreshTimerId);
    this._refreshTimerId = window.setTimeout(() => {
      this._refreshTimerId = null;
      this._refreshBalance().catch(() => {});
    }, 250);
  }

  _getTransactionExplorerUrl(txHash) {
    const explorerBase = this.config.BRIDGE.CHAINS.SOURCE.BLOCK_EXPLORER;
    if (!explorerBase || !txHash) {
      return '';
    }
    return `${explorerBase.replace(/\/$/, '')}/tx/${txHash}`;
  }

  _erc20Abi() {
    return [
      { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
      {
        type: 'function',
        name: 'allowance',
        stateMutability: 'view',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
      },
      {
        type: 'function',
        name: 'approve',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ];
  }

  _tokenSymbol() {
    return this.config?.TOKEN?.SYMBOL || 'LIB';
  }

  _formatTokenUnits(valueWeiStr) {
    try {
      const dec = Number(this.config?.TOKEN?.DECIMALS ?? 18);
      const s = window.ethers.utils.formatUnits(valueWeiStr, dec);
      const [a, b] = s.split('.');
      if (!b) return a;
      return `${a}.${b.slice(0, 6)}`.replace(/\.$/, '');
    } catch (_) {
      return String(valueWeiStr || '-');
    }
  }

  _formatEditableTokenUnits(valueWeiStr) {
    const dec = Number(this.config?.TOKEN?.DECIMALS ?? 18);
    const formatted = window.ethers.utils.formatUnits(valueWeiStr, dec);
    if (!formatted.includes('.')) return formatted;
    return formatted.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/\.$/, '');
  }

  _parseAmountToWei(value) {
    const v = String(value || '').trim();
    if (!v) return null;

    const normalized = v.endsWith('.') ? v.slice(0, -1) : v;
    if (!normalized) return null;

    return window.ethers.utils.parseUnits(normalized, this.config.TOKEN.DECIMALS);
  }

  _bn(value) {
    return window.ethers.BigNumber.from(value);
  }

  _shortAddress(address) {
    const a = String(address || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return a || '-';
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  }

  _comparableAddress(address) {
    return String(address || '').trim().toLowerCase();
  }

  _getRecipientAddress() {
    return String(this.walletManager?.getAddress?.() || '').trim();
  }

  _syncAmountInput() {
    const amount = this._els.amount;
    if (!amount) return;

    amount.value = this._sanitizeAmountValue(amount.value);

    const maxBridgeOutAmount = this._lastSnapshot?.maxBridgeOutAmount;
    if (maxBridgeOutAmount) {
      const amountWei = this._parseAmountToWei(amount.value);
      const maxWei = this._bn(maxBridgeOutAmount);
      if (amountWei && amountWei.gt(maxWei)) {
        amount.value = this._formatEditableTokenUnits(maxWei.toString());
      }
    }

    amount.style.height = 'auto';
    const minHeight = window.innerWidth <= 720 ? 44 : 56;
    amount.style.height = `${Math.max(amount.scrollHeight, minHeight)}px`;
  }

  _sanitizeAmountValue(value) {
    const text = String(value || '');
    const decimals = this.config.TOKEN.DECIMALS;
    let whole = '';
    let fraction = '';
    let hasDot = false;

    for (const char of text) {
      if (char >= '0' && char <= '9') {
        if (hasDot) {
          if (fraction.length < decimals) fraction += char;
        } else {
          whole += char;
        }
        continue;
      }

      if (char === '.' && !hasDot) {
        hasDot = true;
      }
    }

    if (!whole && !fraction) return '';
    if (!whole) whole = '0';
    if (!hasDot) return whole;
    return `${whole}.${fraction}`;
  }

  _isEditableAmountValue(value) {
    const text = String(value || '').trim();
    if (!text) return true;

    const parts = text.split('.');
    if (parts.length > 2) return false;

    const [whole, fraction = ''] = parts;
    if (whole && !/^\d+$/.test(whole)) return false;
    if (fraction && !/^\d+$/.test(fraction)) return false;
    if (fraction.length > this.config.TOKEN.DECIMALS) return false;
    if (parts.length === 2 && !whole && !fraction) return false;

    return true;
  }

  _syncRouteAddresses() {
    const recipient = this._getRecipientAddress();
    const hasRecipient = this._isAddress(recipient);
    const fullText = hasRecipient ? recipient : 'Connect wallet';
    const shortText = hasRecipient ? this._shortAddress(recipient) : 'Connect wallet';
    for (const button of this._els.copyAddressButtons) {
      button.querySelector('.bridge-route-address-full').textContent = fullText;
      button.querySelector('.bridge-route-address-short').textContent = shortText;
      button.setAttribute('data-address', hasRecipient ? recipient : '');
      button.disabled = !hasRecipient;
    }
  }

  _assetPath(filename) {
    return `./assets/${filename}`;
  }

  async _onCopyAddressClicked(event) {
    const button = event.currentTarget;
    const text = button.getAttribute('data-address');
    if (!text) return;
    const copied = await this._copy(text);
    if (!copied) {
      this.toastManager?.error?.('Failed to copy address');
      return;
    }
    this.toastManager?.success?.('Address copied to clipboard', { timeoutMs: 1800 });
  }

  async _copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch {
        document.body.removeChild(ta);
        return false;
      }
    }
  }

  _isAddress(address) {
    try {
      return !!window.ethers.utils.getAddress(String(address || '').trim());
    } catch (_) {
      return false;
    }
  }
}

import { RefreshButton } from './refresh-button.js';

export class OperationsTab {
  constructor() {
    this.panel = null;
    this.tabButton = null;
    this.refreshBtn = null;
    this._access = {
      connected: false,
      address: null,
      owner: null,
      isAdmin: false,
      isMultisig: false,
      loading: false,
      ownerError: null,
      signerError: null,
      error: null,
    };
    this._lastOperationId = null;
    this._isLoadingOperation = false;
    this._actionToastSequence = 0;
    this._accessRequestId = 0;
    this.refreshControl = new RefreshButton({
      ariaLabel: 'Refresh admin access',
      attributes: { 'data-ops-refresh': '' },
      onRefresh: () => this._runRefresh(),
    });
  }

  load() {
    this.panel = document.querySelector('.tab-panel[data-panel="operations"]');
    if (!this.panel) return;

    this.tabButton = document.querySelector('.tab-button[data-tab="operations"]');
    if (this.tabButton) {
      this.tabButton.hidden = true;
      this.tabButton.setAttribute('aria-hidden', 'true');
      this.tabButton.tabIndex = -1;
    }

    this.panel.innerHTML = `
      <div class="panel-header">
        <div class="card-title-row">
          <h2>Admin</h2>
          ${this.refreshControl.render()}
        </div>
        <p class="muted" data-ops-status>Connect a wallet to check access.</p>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-title">Access</div>
          <div class="kv-grid">
            <div class="kv kv--full">
              <div class="kv-label">Connected Address</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-ops-address>--</code>
                  <button type="button" class="copy-inline" data-ops-copy data-copy-value="">Copy</button>
                </div>
              </div>
            </div>
            <div class="kv">
              <div class="kv-label">Role</div>
              <div class="kv-value" data-ops-role>--</div>
            </div>
            <div class="kv">
              <div class="kv-label">Tx Enabled</div>
              <div class="kv-value" data-ops-tx-enabled>--</div>
            </div>
            <div class="kv kv--full">
              <div class="kv-label">On-Chain Owner</div>
              <div class="kv-value">
                <div class="param-address">
                  <code data-ops-owner>--</code>
                  <button type="button" class="copy-inline" data-ops-copy data-copy-value="">Copy</button>
                </div>
              </div>
            </div>
            <div class="kv">
              <div class="kv-label">On-Chain Signer</div>
              <div class="kv-value" data-ops-is-signer>--</div>
            </div>
          </div>
        </div>

        <div class="card" data-ops-admin-section hidden>
          <div class="card-title">Admin Actions</div>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Request Operation</span>
              <select class="field-input" data-op-type>
                <option value="0">SetBridgeOutAmount</option>
                <option value="2">SetBridgeOutEnabled</option>
                <option value="1">UpdateSigner</option>
                <option value="3">RelinquishTokens</option>
              </select>
            </label>
            <label class="field" data-op-field="amount">
              <span class="field-label">Max Bridge Out Amount (${this._tokenSymbol()})</span>
              <input class="field-input" type="text" inputmode="decimal" placeholder="0" data-op-amount />
            </label>
            <label class="field" data-op-field="enabled" hidden>
              <span class="field-label">Bridge Out Enabled</span>
              <select class="field-input" data-op-enabled>
                <option value="true">Enable</option>
                <option value="false">Disable</option>
              </select>
            </label>
            <label class="field" data-op-field="oldSigner" hidden>
              <span class="field-label">Old Signer</span>
              <input class="field-input" type="text" placeholder="0x..." data-op-old-signer />
            </label>
            <label class="field" data-op-field="newSigner" hidden>
              <span class="field-label">New Signer</span>
              <input class="field-input" type="text" placeholder="0x..." data-op-new-signer />
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn btn--primary" data-requires-tx="true" data-ops-request-op>
              Request Operation
            </button>
          </div>
          <div class="mint-readiness" data-ops-request-result hidden>
            <div class="mint-readiness-content">
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Operation ID</div>
                <div class="mint-readiness-value">
                  <div class="param-address">
                    <code data-ops-last-operation>--</code>
                    <button type="button" class="copy-inline" data-ops-copy data-copy-value="">Copy</button>
                    <button type="button" class="copy-inline" data-ops-use-operation>Use</button>
                  </div>
                </div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Tx</div>
                <div class="mint-readiness-value" data-ops-last-tx>--</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card" data-ops-ownership-section hidden>
          <div class="card-title">Ownership</div>
          <div class="form-grid">
            <label class="field field--full">
              <span class="field-label">Transfer Ownership</span>
              <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-ops-new-owner />
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn btn--warning" data-requires-tx="true" data-ops-transfer-owner>
              Transfer
            </button>
          </div>
        </div>

        <div class="card" data-ops-multisig-section hidden>
          <div class="card-title">Multisig Actions</div>
          <div class="form-grid">
            <label class="field field--full">
              <span class="field-label">Operation ID</span>
              <input class="field-input" type="text" placeholder="0x..." data-requires-tx="true" data-ops-operation-id />
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn" data-requires-tx="true" data-ops-load-operation>Load Operation</button>
            <button type="button" class="btn btn--success" data-requires-tx="true" data-ops-sign-submit>
              Sign & Submit
            </button>
          </div>
          <div class="mint-readiness" data-ops-operation-details hidden>
            <div class="mint-readiness-content">
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Type</div>
                <div class="mint-readiness-value" data-ops-optype>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Target</div>
                <div class="mint-readiness-value" data-ops-optarget>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Value</div>
                <div class="mint-readiness-value" data-ops-opvalue>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Data</div>
                <div class="mint-readiness-value" data-ops-opdata>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Signatures</div>
                <div class="mint-readiness-value" data-ops-opsigs>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Deadline</div>
                <div class="mint-readiness-value" data-ops-opdeadline>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Executed</div>
                <div class="mint-readiness-value" data-ops-opexecuted>--</div>
              </div>
              <div class="mint-readiness-row">
                <div class="mint-readiness-label">Expired</div>
                <div class="mint-readiness-value" data-ops-opexpired>--</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.refreshBtn = this.panel.querySelector('[data-ops-refresh]');
    this.refreshControl.mount(this.refreshBtn);
    this.panel.addEventListener('click', (e) => this._onClick(e));
    this.panel.addEventListener('change', (e) => this._onChange(e));
    document.addEventListener('walletConnected', () => void this._syncAccess());
    document.addEventListener('walletDisconnected', () => void this._syncAccess());
    document.addEventListener('walletAccountChanged', () => void this._syncAccess());
    document.addEventListener('walletChainChanged', () => void this._syncAccess());
    document.addEventListener('contractManagerUpdated', () => void this._syncAccess());

    void this._syncAccess();
  }

  async refresh() {
    return this.refreshControl.run();
  }

  async _runRefresh() {
    await window.contractManager?.refreshStatus?.({ reason: 'operationsTabRefresh' }).catch(() => {});
    await this._syncAccess().catch(() => {});
  }

  _tokenSymbol() {
    return window.CONFIG?.TOKEN?.SYMBOL || 'TOKEN';
  }

  _tokenDecimals() {
    const d = Number(window.CONFIG?.TOKEN?.DECIMALS ?? 18);
    return Number.isFinite(d) ? d : 18;
  }

  _normalizeAddress(address) {
    if (!address || !window.ethers?.utils?.getAddress) return null;
    try {
      return window.ethers.utils.getAddress(String(address));
    } catch {
      return null;
    }
  }

  async _syncAccess() {
    const walletManager = window.walletManager;
    const address = walletManager?.getAddress?.() || null;
    const connected = !!walletManager?.isConnected?.();
    const normalizedAddress = this._normalizeAddress(address);
    const requestId = ++this._accessRequestId;
    const previousAccess = this._access;
    const preserveConfirmedAccess = !!(
      connected &&
      normalizedAddress &&
      previousAccess?.connected &&
      previousAccess?.address === normalizedAddress &&
      (previousAccess?.isAdmin || previousAccess?.isMultisig)
    );

    this._access = {
      connected,
      address: normalizedAddress || address,
      owner: preserveConfirmedAccess ? previousAccess.owner : null,
      isAdmin: preserveConfirmedAccess ? !!previousAccess.isAdmin : false,
      isMultisig: preserveConfirmedAccess ? !!previousAccess.isMultisig : false,
      loading: !!(connected && normalizedAddress),
      ownerError: null,
      signerError: null,
      error: connected && address && !normalizedAddress ? 'Invalid connected address' : null,
    };

    this._updateTabVisibility();
    this._renderAccessSummary();
    this._syncOperationTypeFields();

    if (!connected || !normalizedAddress) return;

    try {
      const nextAccess = await window.contractManager?.getAccessState?.(normalizedAddress);
      if (requestId !== this._accessRequestId) return;

      this._access = {
        connected,
        address: normalizedAddress,
        owner: nextAccess?.owner || null,
        isAdmin: !!nextAccess?.isOwner,
        isMultisig: !!nextAccess?.isSigner,
        loading: false,
        ownerError: nextAccess?.ownerError || null,
        signerError: nextAccess?.signerError || null,
        error: nextAccess?.error || null,
      };
    } catch (error) {
      if (requestId !== this._accessRequestId) return;

      this._access = {
        connected,
        address: normalizedAddress,
        owner: null,
        isAdmin: false,
        isMultisig: false,
        loading: false,
        ownerError: error?.message || 'Failed to read contract access state.',
        signerError: error?.message || 'Failed to read contract access state.',
        error: error?.message || 'Failed to read contract access state.',
      };
    }

    this._updateTabVisibility();
    this._renderAccessSummary();
  }

  _updateTabVisibility() {
    if (!this.tabButton) return;
    const allowed = this._access.connected && (this._access.isAdmin || this._access.isMultisig);

    this.tabButton.hidden = !allowed;
    this.tabButton.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    this.tabButton.tabIndex = allowed ? -1 : -1;

    if (!allowed && !this._access.loading && (window.location.hash || '') === '#operations') {
      window.location.hash = '#bridge';
    }
  }

  _renderAccessSummary() {
    const statusEl = this.panel?.querySelector('[data-ops-status]');
    const addressEl = this.panel?.querySelector('[data-ops-address]');
    const copyBtn = this.panel?.querySelector('[data-ops-copy][data-copy-value]');
    const roleEl = this.panel?.querySelector('[data-ops-role]');
    const txEnabledEl = this.panel?.querySelector('[data-ops-tx-enabled]');
    const ownerEl = this.panel?.querySelector('[data-ops-owner]');
    const ownerCopyBtn = ownerEl?.closest('.param-address')?.querySelector('[data-ops-copy][data-copy-value]');
    const isSignerEl = this.panel?.querySelector('[data-ops-is-signer]');

    const address = this._normalizeAddress(this._access.address) || null;
    if (addressEl) addressEl.textContent = address || '--';
    if (copyBtn) copyBtn.setAttribute('data-copy-value', address || '');

    const txEnabled = !!window.networkManager?.isTxEnabled?.();
    if (txEnabledEl) txEnabledEl.textContent = txEnabled ? 'Yes' : 'No';

    const ownerAddress = this._normalizeAddress(this._access.owner) || null;
    if (ownerEl) {
      ownerEl.textContent = this._access.loading
        ? 'Checking...'
        : this._access.ownerError
          ? 'Unavailable'
          : ownerAddress || '--';
    }
    if (ownerCopyBtn) ownerCopyBtn.setAttribute('data-copy-value', this._access.ownerError ? '' : ownerAddress || '');
    if (isSignerEl) {
      isSignerEl.textContent = this._access.loading
        ? 'Checking...'
        : this._access.connected
          ? this._access.signerError
            ? 'Unavailable'
            : this._access.isMultisig
              ? 'Yes'
              : 'No'
          : '--';
    }

    const role = !this._access.connected
      ? 'Not connected'
      : this._access.loading
        ? 'Checking...'
        : this._access.isAdmin && this._access.isMultisig
          ? 'Owner + Multisig'
          : this._access.isAdmin
            ? 'Owner'
            : this._access.isMultisig
              ? 'Multisig'
              : this._access.error
                ? 'Unavailable'
                : 'None';
    if (roleEl) roleEl.textContent = role;

    const adminSection = this.panel?.querySelector('[data-ops-admin-section]');
    const multisigSection = this.panel?.querySelector('[data-ops-multisig-section]');
    if (adminSection) adminSection.hidden = !(this._access.connected && (this._access.isAdmin || this._access.isMultisig));
    if (multisigSection) multisigSection.hidden = !(this._access.connected && this._access.isMultisig);
    const ownershipSection = this.panel?.querySelector('[data-ops-ownership-section]');
    if (ownershipSection) ownershipSection.hidden = !(this._access.connected && this._access.isAdmin);

    if (statusEl) {
      const partialStatus = this._partialAccessStatusMessage();
      if (!this._access.connected) {
        statusEl.textContent = 'Connect a wallet to check access.';
      } else if (this._access.loading) {
        statusEl.textContent = 'Checking wallet access against the Vault.';
      } else if (partialStatus) {
        statusEl.textContent = partialStatus;
      } else if (this._access.error) {
        statusEl.textContent = `Unable to read Vault access state: ${this._access.error}`;
      } else if (!this._access.isAdmin && !this._access.isMultisig) {
        statusEl.textContent = 'Connected wallet is not allowed to access Admin.';
      } else if (!txEnabled) {
        statusEl.textContent = `Connected on the wrong network. Transaction actions will prompt a switch to ${this._requiredNetworkName()} when used.`;
      } else {
        statusEl.textContent = 'Ready.';
      }
    }
  }

  _partialAccessStatusMessage() {
    const ownerUnavailable = !!this._access.ownerError;
    const signerUnavailable = !!this._access.signerError;
    const wrongNetworkNote = !window.networkManager?.isTxEnabled?.()
      ? ` Transaction actions will prompt a switch to ${this._requiredNetworkName()} when used.`
      : '';

    if (ownerUnavailable && !signerUnavailable) {
      return this._access.isMultisig
        ? `Signer verified, owner status unavailable.${wrongNetworkNote}`
        : `Signer status known, owner status unavailable.${wrongNetworkNote}`;
    }

    if (signerUnavailable && !ownerUnavailable) {
      return this._access.isAdmin
        ? `Owner verified, signer status unavailable.${wrongNetworkNote}`
        : `Owner status known, signer status unavailable.${wrongNetworkNote}`;
    }

    return null;
  }

  _syncOperationTypeFields() {
    const typeSelect = this.panel?.querySelector('[data-op-type]');
    if (!(typeSelect instanceof HTMLSelectElement)) return;

    const opType = Number(typeSelect.value);
    const show = (name, on) => {
      const el = this.panel?.querySelector(`[data-op-field="${name}"]`);
      if (el) el.hidden = !on;
    };

    show('amount', opType === 0);
    show('enabled', opType === 2);
    show('oldSigner', opType === 1);
    show('newSigner', opType === 1);
  }

  async _onChange(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.matches('[data-op-type]')) {
      this._syncOperationTypeFields();
    }
  }

  async _onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const copyBtn = target.closest('[data-ops-copy]');
    if (copyBtn) {
      const value = copyBtn.getAttribute('data-copy-value') || '';
      if (!value) return;
      const ok = await this._copy(value);
      if (!ok) return;
      copyBtn.classList.add('success');
      setTimeout(() => copyBtn.classList.remove('success'), 900);
      window.toastManager?.success?.('Copied to clipboard', { timeoutMs: 1600 });
      return;
    }

    if (target.closest('[data-ops-use-operation]')) {
      const input = this.panel?.querySelector('[data-ops-operation-id]');
      if (input instanceof HTMLInputElement && this._lastOperationId) {
        input.value = this._lastOperationId;
        window.toastManager?.success?.('Operation ID filled', { timeoutMs: 1600 });
      }
      return;
    }

    if (target.closest('[data-ops-request-op]')) {
      await this._requestOperation();
      return;
    }

    if (target.closest('[data-ops-load-operation]')) {
      await this._loadOperationDetails();
      return;
    }

    if (target.closest('[data-ops-sign-submit]')) {
      await this._signAndSubmit();
      return;
    }

    if (target.closest('[data-ops-transfer-owner]')) {
      await this._transferOwnership();
      return;
    }
  }

  async _requestOperation() {
    if (!this._access.connected || !(this._access.isAdmin || this._access.isMultisig)) return;

    const typeSelect = this.panel?.querySelector('[data-op-type]');
    const opType = typeSelect instanceof HTMLSelectElement ? Number(typeSelect.value) : NaN;
    if (!Number.isFinite(opType)) {
      window.toastManager?.error?.('Select an operation type.');
      return;
    }

    const ethers = window.ethers;
    const utils = ethers?.utils;
    const AddressZero = ethers?.constants?.AddressZero || '0x0000000000000000000000000000000000000000';

    let target = AddressZero;
    let value = ethers?.constants?.Zero || 0;
    let data = '0x';

    try {
      if (opType === 0) {
        const amountInput = this.panel?.querySelector('[data-op-amount]');
        const amountStr = amountInput instanceof HTMLInputElement ? amountInput.value.trim() : '';
        if (!amountStr) throw new Error('Enter a max bridge out amount.');
        if (!utils?.parseUnits) throw new Error('Ethers utils unavailable.');
        value = utils.parseUnits(amountStr, this._tokenDecimals());
      } else if (opType === 2) {
        const enabledSelect = this.panel?.querySelector('[data-op-enabled]');
        const enabled = enabledSelect instanceof HTMLSelectElement ? enabledSelect.value === 'true' : null;
        if (enabled == null) throw new Error('Select enabled/disabled.');
        if (!utils?.defaultAbiCoder?.encode) throw new Error('Ethers encoder unavailable.');
        data = utils.defaultAbiCoder.encode(['bool'], [enabled]);
      } else if (opType === 1) {
        const oldInput = this.panel?.querySelector('[data-op-old-signer]');
        const newInput = this.panel?.querySelector('[data-op-new-signer]');
        const oldSigner = oldInput instanceof HTMLInputElement ? oldInput.value.trim() : '';
        const newSigner = newInput instanceof HTMLInputElement ? newInput.value.trim() : '';
        const oldAddr = this._normalizeAddress(oldSigner);
        const newAddr = this._normalizeAddress(newSigner);
        if (!oldAddr) throw new Error('Invalid old signer address.');
        if (!newAddr) throw new Error('Invalid new signer address.');
        target = oldAddr;
        value = ethers.BigNumber.from(newAddr);
      } else if (opType === 3) {
        target = AddressZero;
        value = 0;
        data = '0x';
      } else {
        throw new Error('Unknown operation type.');
      }
    } catch (error) {
      window.toastManager?.error?.(error?.message || 'Invalid operation parameters.');
      return;
    }

    const actionToastId = this._nextActionToastId('requestOperation');
    let toastId = null;
    try {
      const switchResult = await this._ensureRequiredNetworkForAction(actionToastId);
      toastId = switchResult.toastId || null;

      const contract = window.contractManager?.getWriteContract?.();
      if (!contract) throw new Error(`Connect a wallet on ${this._requiredNetworkName()} to request operations.`);

      toastId = this._showActionLoadingToast({
        toastId: toastId || actionToastId,
        message: 'Submitting request…',
      });
      const tx = await contract.requestOperation(opType, target, value, data);
      const receipt = await tx.wait?.();

      const opId = receipt?.events?.find?.((e) => e?.event === 'OperationRequested')?.args?.operationId || null;
      const operationId = opId ? String(opId) : null;
      this._lastOperationId = operationId;

      this._renderRequestResult({
        operationId,
        txHash: tx?.hash ? String(tx.hash) : null,
      });

      const explorer = window.CONFIG?.BRIDGE?.CHAINS?.SOURCE?.BLOCK_EXPLORER || '';
      const link = tx?.hash && explorer ? `${explorer.replace(/\/$/, '')}/tx/${tx.hash}` : '';

      const message = link
        ? `Request submitted. <a href="${link}" target="_blank">View transaction</a>`
        : 'Request submitted.';
      this._showActionToast({ toastId, type: 'success', title: 'Done', message, timeoutMs: 3500, dismissible: true, allowHtml: true });

      await window.contractManager?.refreshStatus?.({ reason: 'operationRequested' }).catch(() => {});
    } catch (error) {
      toastId = toastId || error?._actionToastId || actionToastId;
      const msg = this._actionErrorMessage(error, 'Request failed.');
      this._showActionToast({ toastId, type: 'error', title: 'Error', message: msg, timeoutMs: 0, dismissible: true });
    }
  }

  async _transferOwnership() {
    if (!this._access.connected || !this._access.isAdmin) return;

    const input = this.panel?.querySelector('[data-ops-new-owner]');
    const newOwner = input instanceof HTMLInputElement ? input.value.trim() : '';
    const normalized = this._normalizeAddress(newOwner);
    if (!normalized) {
      window.toastManager?.error?.('Invalid new owner address.');
      return;
    }

    const actionToastId = this._nextActionToastId('transferOwnership');
    let toastId = null;
    try {
      const switchResult = await this._ensureRequiredNetworkForAction(actionToastId);
      toastId = switchResult.toastId || null;

      const contract = window.contractManager?.getWriteContract?.();
      if (!contract) throw new Error(`Connect a wallet on ${this._requiredNetworkName()} to transfer ownership.`);

      toastId = this._showActionLoadingToast({
        toastId: toastId || actionToastId,
        message: 'Submitting transfer…',
      });
      const tx = await contract.transferOwnership(normalized);
      await tx.wait?.();

      const explorer = window.CONFIG?.BRIDGE?.CHAINS?.SOURCE?.BLOCK_EXPLORER || '';
      const link = tx?.hash && explorer ? `${explorer.replace(/\/$/, '')}/tx/${tx.hash}` : '';
      const message = link
        ? `Transfer submitted. <a href="${link}" target="_blank">View transaction</a>`
        : 'Transfer submitted.';
      this._showActionToast({ toastId, type: 'success', title: 'Done', message, timeoutMs: 3500, dismissible: true, allowHtml: true });

      await window.contractManager?.refreshStatus?.({ reason: 'ownershipTransferred' }).catch(() => {});
    } catch (error) {
      toastId = toastId || error?._actionToastId || actionToastId;
      const msg = this._actionErrorMessage(error, 'Transfer failed.');
      this._showActionToast({ toastId, type: 'error', title: 'Error', message: msg, timeoutMs: 0, dismissible: true });
    }
  }

  _renderRequestResult({ operationId, txHash }) {
    const wrapper = this.panel?.querySelector('[data-ops-request-result]');
    const opEl = this.panel?.querySelector('[data-ops-last-operation]');
    const txEl = this.panel?.querySelector('[data-ops-last-tx]');
    const opCopyBtn = opEl?.closest('.param-address')?.querySelector('[data-ops-copy][data-copy-value]');

    if (opEl) opEl.textContent = operationId || '--';
    if (opCopyBtn) opCopyBtn.setAttribute('data-copy-value', operationId || '');
    if (txEl) txEl.textContent = txHash || '--';
    if (wrapper) wrapper.hidden = !(operationId || txHash);
  }

  async _loadOperationDetails() {
    if (this._isLoadingOperation) return;
    this._isLoadingOperation = true;

    const idInput = this.panel?.querySelector('[data-ops-operation-id]');
    const operationId = idInput instanceof HTMLInputElement ? idInput.value.trim() : '';
    if (!operationId) {
      window.toastManager?.error?.('Enter an operation ID.');
      this._isLoadingOperation = false;
      return;
    }

    const contract = window.contractManager?.getReadContract?.();
    if (!contract) {
      window.toastManager?.error?.('Contract is not ready.');
      this._isLoadingOperation = false;
      return;
    }

    const toastId = window.toastManager?.loading?.('Loading operation…', { id: 'loadOperation' });
    try {
      const [op, expired] = await Promise.all([contract.operations(operationId), contract.isOperationExpired(operationId)]);
      this._renderOperationDetails({ operationId, op, expired: !!expired });
      window.toastManager?.update?.(toastId, { type: 'success', title: 'Done', message: 'Operation loaded.', timeoutMs: 2000 });
    } catch (error) {
      const msg = error?.reason || error?.message || 'Failed to load operation.';
      window.toastManager?.update?.(toastId, { type: 'error', title: 'Error', message: msg, timeoutMs: 0 });
    } finally {
      this._isLoadingOperation = false;
    }
  }

  _renderOperationDetails({ operationId, op, expired }) {
    const details = this.panel?.querySelector('[data-ops-operation-details]');
    if (!details) return;

    const opType = Number(op?.opType?.toString?.() ?? op?.opType);
    const target = op?.target ? String(op.target) : '--';
    const value = op?.value?.toString?.() ? String(op.value.toString()) : String(op?.value ?? '--');
    const data = op?.data ? String(op.data) : '--';
    const numSignatures = op?.numSignatures?.toString?.() ? Number(op.numSignatures.toString()) : Number(op?.numSignatures ?? 0);
    const executed = !!op?.executed;
    const deadlineRaw = op?.deadline?.toString?.() ? Number(op.deadline.toString()) : Number(op?.deadline ?? 0);

    const setText = (sel, txt) => {
      const el = this.panel?.querySelector(sel);
      if (el) el.textContent = txt;
    };

    setText('[data-ops-optype]', this._opTypeLabel(opType));
    setText('[data-ops-optarget]', target);
    setText('[data-ops-opvalue]', value);
    setText('[data-ops-opdata]', data);
    setText('[data-ops-opsigs]', Number.isFinite(numSignatures) ? String(numSignatures) : '--');
    setText('[data-ops-opdeadline]', deadlineRaw ? this._formatUnix(deadlineRaw) : '--');
    setText('[data-ops-opexecuted]', executed ? 'Yes' : 'No');
    setText('[data-ops-opexpired]', expired ? 'Yes' : 'No');

    details.hidden = false;
    this._lastOperationId = operationId;
  }

  _opTypeLabel(opType) {
    if (opType === 0) return 'SetBridgeOutAmount';
    if (opType === 1) return 'UpdateSigner';
    if (opType === 2) return 'SetBridgeOutEnabled';
    if (opType === 3) return 'RelinquishTokens';
    return String(opType);
  }

  _formatUnix(seconds) {
    const ms = Number(seconds) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return '--';
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return String(seconds);
    }
  }

  async _signAndSubmit() {
    if (!this._access.connected || !this._access.isMultisig) return;

    const idInput = this.panel?.querySelector('[data-ops-operation-id]');
    const operationId = idInput instanceof HTMLInputElement ? idInput.value.trim() : '';
    if (!operationId) {
      window.toastManager?.error?.('Enter an operation ID.');
      return;
    }

    const utils = window.ethers?.utils;
    if (!utils?.arrayify) {
      window.toastManager?.error?.('Ethers utils unavailable.');
      return;
    }

    const actionToastId = this._nextActionToastId('submitSignature');
    let toastId = null;
    try {
      const switchResult = await this._ensureRequiredNetworkForAction(actionToastId);
      toastId = switchResult.toastId || null;

      const contractRead = window.contractManager?.getReadContract?.();
      const contractWrite = window.contractManager?.getWriteContract?.();
      const signer = window.walletManager?.getSigner?.();
      if (!contractRead || !contractWrite || !signer) {
        throw new Error(`Connect a wallet on ${this._requiredNetworkName()} to submit signatures.`);
      }

      toastId = this._showActionLoadingToast({
        toastId: toastId || actionToastId,
        message: 'Signing & submitting…',
      });
      const messageHash = await contractRead.getOperationHash(operationId);
      const signature = await signer.signMessage(utils.arrayify(messageHash));
      const tx = await contractWrite.submitSignature(operationId, signature);
      await tx.wait?.();

      const explorer = window.CONFIG?.BRIDGE?.CHAINS?.SOURCE?.BLOCK_EXPLORER || '';
      const link = tx?.hash && explorer ? `${explorer.replace(/\/$/, '')}/tx/${tx.hash}` : '';
      const message = link
        ? `Signature submitted. <a href="${link}" target="_blank">View transaction</a>`
        : 'Signature submitted.';
      this._showActionToast({ toastId, type: 'success', title: 'Done', message, timeoutMs: 3500, dismissible: true, allowHtml: true });

      await this._loadOperationDetails().catch(() => {});
      await window.contractManager?.refreshStatus?.({ reason: 'signatureSubmitted' }).catch(() => {});
    } catch (error) {
      toastId = toastId || error?._actionToastId || actionToastId;
      const msg = this._actionErrorMessage(error, 'Submission failed.');
      this._showActionToast({ toastId, type: 'error', title: 'Error', message: msg, timeoutMs: 0, dismissible: true });
    }
  }

  async _ensureRequiredNetworkForAction(toastId) {
    if (window.networkManager?.isOnRequiredNetwork?.()) {
      return { switched: false, toastId: null };
    }

    const activeToastId = this._showActionToast({
      toastId,
      type: 'loading',
      title: 'Loading',
      message: `Switch to ${this._requiredNetworkName()} in MetaMask to continue`,
      timeoutMs: 0,
      dismissible: false,
    });

    try {
      const result = await window.networkManager?.ensureRequiredNetwork?.();
      await window.contractManager?.refreshStatus?.({ reason: 'requiredNetworkEnsured' }).catch(() => {});
      await this._syncAccess().catch(() => {});
      return { switched: !!result?.switched, toastId: activeToastId };
    } catch (error) {
      if (error && typeof error === 'object') {
        error._phase = 'networkSwitch';
        error._actionToastId = activeToastId;
      }
      throw error;
    }
  }

  _requiredNetworkName() {
    return window.CONFIG?.BRIDGE?.CHAINS?.SOURCE?.NAME || 'the required network';
  }

  _showActionLoadingToast({ toastId = null, message }) {
    return this._showActionToast({
      toastId,
      type: 'loading',
      title: 'Loading',
      message,
      timeoutMs: 0,
      dismissible: false,
    });
  }

  _showActionToast({ toastId = null, title, message, type = 'info', timeoutMs = 0, dismissible = true, allowHtml = false }) {
    return (
      window.toastManager?.show?.({
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
      if (error?.code === 4001) return 'Network switch request was rejected.';
      if (error?.code === -32002) return 'Network switch request already pending in MetaMask.';
      return this._extractActionErrorMessage(error) || `Failed to switch to ${this._requiredNetworkName()}.`;
    }
    return this._extractActionErrorMessage(error) || fallback;
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
}

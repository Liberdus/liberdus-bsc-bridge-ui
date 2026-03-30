import { RefreshButton } from './refresh-button.js';
import { renderOperationsTabTemplate } from './operations-tab-template.js';
import { AdminOperationsService } from '../services/admin-operations-service.js';
import { escapeHtml } from '../utils/helpers.js';
import {
  buildVaultOperationDetailRows,
  buildVaultOperationSummary,
  getVaultOperationTypeLabel,
  isOwnerSignableVaultOperationType,
  normalizeVaultOperation,
} from '../utils/vault-operations.js';

export class OperationsTab {
  constructor({ operationsService = null } = {}) {
    this.panel = null;
    this.tabButton = null;
    this.refreshBtn = null;
    this._operationsService = operationsService;
    this.historyPageSize = 10;
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
    this._historyEvents = [];
    this._historyActiveCount = 0;
    this._historyLoaded = false;
    this._historyLoading = false;
    this._historyError = null;
    this._historyVisibleCount = this.historyPageSize;
    this._historyFilterOpType = null;
    this._historyFilterStatus = null;
    this._isActive = false;
    this._lastOperationId = null;
    this._selectedOperation = null;
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
    this.panel.innerHTML = renderOperationsTabTemplate({
      refreshButton: this.refreshControl.render(),
      tokenSymbol: this._tokenSymbol(),
    });

    this.refreshBtn = this.panel.querySelector('[data-ops-refresh]');
    this.refreshControl.mount(this.refreshBtn);
    this.panel.addEventListener('click', (e) => this._onClick(e));
    this.panel.addEventListener('change', (e) => this._onChange(e));
    this.panel.addEventListener('input', (e) => this._onInput(e));
    document.addEventListener('walletConnected', () => void this._syncAccess());
    document.addEventListener('walletDisconnected', () => void this._syncAccess());
    document.addEventListener('walletAccountChanged', () => void this._syncAccess());
    document.addEventListener('walletChainChanged', () => void this._syncAccess());
    document.addEventListener('contractManagerUpdated', () => void this._syncAccess());
    document.addEventListener('tabActivated', (e) => {
      if (e?.detail?.tabName !== 'operations') return;
      this._isActive = true;
      void this._ensureHistoryLoaded();
    });
    document.addEventListener('tabDeactivated', (e) => {
      if (e?.detail?.tabName !== 'operations') return;
      this._isActive = false;
    });

    void this._syncAccess();
  }

  async refresh() {
    return this.refreshControl.run();
  }

  async _runRefresh() {
    await window.contractManager?.refreshStatus?.({ reason: 'operationsTabRefresh' }).catch(() => {});
    await this._syncAccess().catch(() => {});
    if (this._hasAdminAccess()) {
      await this._refreshRequestedOperations().catch(() => {});
    }
  }

  _tokenSymbol() {
    return window.CONFIG?.TOKEN?.SYMBOL || 'TOKEN';
  }

  _tokenDecimals() {
    const d = Number(window.CONFIG?.TOKEN?.DECIMALS ?? 18);
    return Number.isFinite(d) ? d : 18;
  }

  _hasAdminAccess() {
    return !!(this._access.connected && (this._access.isAdmin || this._access.isMultisig));
  }

  _getOperationsService() {
    if (!this._operationsService) {
      this._operationsService = new AdminOperationsService(window.contractManager);
    }

    return this._operationsService;
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
    void this._ensureHistoryLoaded();
  }

  _updateTabVisibility() {
    if (!this.tabButton) return;
    const allowed = this._hasAdminAccess();

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

    const hasAccess = this._hasAdminAccess();
    const adminSection = this.panel?.querySelector('[data-ops-admin-section]');
    const historySection = this.panel?.querySelector('[data-ops-history-section]');
    if (adminSection) adminSection.hidden = !hasAccess;
    if (historySection) historySection.hidden = !hasAccess;
    this._syncSignButtonVisibility();
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

  _syncHistoryFilters() {
    const typeSelect = this.panel?.querySelector('[data-ops-history-filter-type]');
    const statusSelect = this.panel?.querySelector('[data-ops-history-filter-status]');
    this._historyFilterOpType =
      typeSelect instanceof HTMLSelectElement && typeSelect.value !== '' ? Number(typeSelect.value) : null;
    this._historyFilterStatus =
      statusSelect instanceof HTMLSelectElement && statusSelect.value !== '' ? String(statusSelect.value) : null;
    this._historyVisibleCount = this.historyPageSize;
    this._renderRequestedOperations();
  }

  async _ensureHistoryLoaded() {
    if (!this._isActive) return;
    if (!this._hasAdminAccess()) return;
    if (this._historyLoaded || this._historyLoading) return;
    await this._refreshRequestedOperations();
  }

  async _refreshRequestedOperations() {
    if (this._historyLoading) return;
    if (!this._hasAdminAccess()) return;

    this._historyLoading = true;
    this._historyError = null;
    this._setHistoryLoading(true);
    this._renderRequestedOperations();

    try {
      const result = await this._getOperationsService().load();
      this._historyEvents = Array.isArray(result?.items) ? result.items : [];
      this._historyActiveCount = Number.isFinite(result?.activeCount) ? result.activeCount : this._historyEvents.length;
      this._historyError = null;
      this._historyLoaded = true;
      this._historyVisibleCount = Math.max(this._historyVisibleCount, this.historyPageSize);
      this._renderRequestedOperations();
    } catch (error) {
      const errorState = this._describeHistoryLoadError(error);
      this._historyError = errorState;
      console.error('[OperationsTab] Failed to load requested operations', {
        error,
        title: errorState.title,
        detail: errorState.detail,
      });
      window.toastManager?.error?.('Failed to load requested operations', {
        message: errorState.detail,
        timeoutMs: 0,
        dismissible: true,
      });
    } finally {
      this._historyLoading = false;
      this._setHistoryLoading(false);
      if (this._historyError) {
        this._renderRequestedOperations();
      }
    }
  }

  _getFilteredHistoryEvents() {
    return this._historyEvents.filter((event) => {
      if (event?.state === 'unavailable') return true;
      if (this._historyFilterOpType != null && event.opType !== this._historyFilterOpType) return false;
      if (this._historyFilterStatus != null && this._historyFilterStatus !== this._historyStatusLabel(event)) return false;
      return true;
    });
  }

  _renderRequestedOperations() {
    const listEl = this.panel?.querySelector('[data-ops-history-list]');
    const countEl = this.panel?.querySelector('[data-ops-history-count]');
    const loadMoreBtn = this.panel?.querySelector('[data-ops-history-load-more]');
    if (!listEl || !countEl || !loadMoreBtn) return;

    const filtered = this._getFilteredHistoryEvents();
    const visible = filtered.slice(0, this._historyVisibleCount);
    const loadedTotal = this._historyEvents.length;
    const onChainTotal = this._historyTotalCount();

    if (this._historyError && loadedTotal === 0 && !this._historyLoading) {
      listEl.innerHTML = this._renderHistoryError(this._historyError);
      countEl.textContent = 'Error loading history';
      loadMoreBtn.classList.add('hidden');
      loadMoreBtn.disabled = false;
      return;
    }

    if (visible.length === 0) {
      const emptyText =
        loadedTotal === 0
          ? (this._historyLoading ? 'Loading requested operations...' : 'No requested operations found.')
          : 'No requested operations match the current filters.';
      listEl.innerHTML = `<div class="param-row muted">${escapeHtml(emptyText)}</div>`;
    } else {
      listEl.innerHTML = visible.map((event) => this._renderHistoryRow(event)).join('');
    }

    if (filtered.length !== loadedTotal) {
      countEl.textContent = `Showing ${visible.length} of ${filtered.length} filtered (${onChainTotal} total)`;
    } else {
      countEl.textContent = `Showing ${visible.length} of ${onChainTotal} total`;
    }
    loadMoreBtn.classList.toggle('hidden', visible.length >= filtered.length || filtered.length === 0);
    loadMoreBtn.disabled = this._historyLoading;
  }

  _historyTotalCount() {
    if (Number.isFinite(this._historyActiveCount) && this._historyActiveCount >= 0) {
      return this._historyActiveCount;
    }
    return this._historyEvents.length;
  }

  _renderHistoryError(errorState) {
    return `
      <div class="ops-history-error" role="alert">
        <div class="ops-history-error-title">${escapeHtml(errorState?.title || 'Unable to load requested operations')}</div>
        <div class="ops-history-error-detail">${escapeHtml(errorState?.detail || 'Unknown error.')}</div>
      </div>
    `;
  }

  _renderHistoryRow(event) {
    const status = this._historyStatusLabel(event);
    const statusClass = status === 'Executed' ? 'is-executed' : status === 'Expired' ? 'is-expired' : '';
    const selectedClass = this._selectedOperation?.operationId === event.operationId ? ' is-selected' : '';
    if (event?.state === 'unavailable') {
      return `
        <button type="button" class="proposal-row${selectedClass}" data-ops-history-row="${escapeHtml(event.operationId)}">
          <div class="proposal-row-main">
            <div class="proposal-row-top">
              <div class="proposal-opid"><code>${escapeHtml(this._shortenHex(event.operationId, 8, 6))}</code></div>
              <div class="proposal-status">${escapeHtml(status)}</div>
            </div>
            <div class="proposal-row-bottom">
              <div class="proposal-meta">Refresh to retry</div>
              <div class="proposal-sigs"></div>
            </div>
            <div class="ops-history-summary">${escapeHtml(event.message)}</div>
          </div>
        </button>
      `;
    }

    const helpers = this._vaultOperationDisplayHelpers();
    return `
      <button type="button" class="proposal-row ${statusClass}${selectedClass}" data-ops-history-row="${escapeHtml(event.operationId)}">
        <div class="proposal-row-main">
          <div class="proposal-row-top">
            <div class="proposal-opid"><code>${escapeHtml(this._shortenHex(event.operationId, 8, 6))}</code></div>
            <div class="proposal-status">${escapeHtml(status)}</div>
          </div>
          <div class="proposal-row-bottom">
            <div class="proposal-meta">${escapeHtml(getVaultOperationTypeLabel(event.opType))}${this._renderHistoryDeadlineMeta(event)}</div>
            <div class="proposal-sigs">${escapeHtml(this._historySignatureLabel(event))}</div>
          </div>
          <div class="ops-history-summary">${escapeHtml(buildVaultOperationSummary(event, helpers))}</div>
        </div>
      </button>
    `;
  }

  _setHistoryLoading(isLoading) {
    const loadMoreBtn = this.panel?.querySelector('[data-ops-history-load-more]');
    if (loadMoreBtn instanceof HTMLButtonElement) {
      loadMoreBtn.disabled = !!isLoading;
    }
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
      return;
    }

    if (target.matches('[data-ops-history-filter-type], [data-ops-history-filter-status]')) {
      this._syncHistoryFilters();
    }
  }

  _onInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-ops-operation-id]')) return;
    if (target.value.trim() === this._selectedOperation?.operationId) return;

    this._selectedOperation = null;
    this._syncSignButtonVisibility();
    this._renderRequestedOperations();
  }

  async _onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-ops-operation-modal]')) {
      this._closeOperationModal();
      return;
    }

    if (target.closest('[data-ops-close-operation]')) {
      this._closeOperationModal();
      return;
    }

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

    const historyRow = target.closest('[data-ops-history-row]');
    if (historyRow) {
      const operationId = historyRow.getAttribute('data-ops-history-row') || '';
      const input = this.panel?.querySelector('[data-ops-operation-id]');
      if (input instanceof HTMLInputElement) {
        input.value = operationId;
      }
      await this._loadOperationDetails({ operationId });
      return;
    }

    if (target.closest('[data-ops-history-load-more]')) {
      this._historyVisibleCount += this.historyPageSize;
      this._renderRequestedOperations();
      return;
    }

    if (target.closest('[data-ops-use-operation]')) {
      const input = this.panel?.querySelector('[data-ops-operation-id]');
      if (input instanceof HTMLInputElement && this._lastOperationId) {
        input.value = this._lastOperationId;
        window.toastManager?.success?.('Operation ID filled', { timeoutMs: 1600 });
        await this._loadOperationDetails({ operationId: this._lastOperationId });
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
        message: 'Submitting request...',
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
      await this._refreshRequestedOperations();
      if (operationId) {
        const input = this.panel?.querySelector('[data-ops-operation-id]');
        if (input instanceof HTMLInputElement) {
          input.value = operationId;
        }
        await this._loadOperationDetails().catch(() => {});
      }
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
        message: 'Submitting transfer...',
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

  async _loadOperationDetails({ operationId: requestedOperationId = null } = {}) {
    if (this._isLoadingOperation) return;
    this._isLoadingOperation = true;

    const idInput = this.panel?.querySelector('[data-ops-operation-id]');
    const operationId = String(
      requestedOperationId || (idInput instanceof HTMLInputElement ? idInput.value.trim() : '')
    ).trim();
    if (!operationId) {
      window.toastManager?.error?.('Enter an operation ID.');
      this._isLoadingOperation = false;
      return;
    }

    if (idInput instanceof HTMLInputElement) {
      idInput.value = operationId;
    }

    const contract = window.contractManager?.getReadContract?.();
    if (!contract) {
      window.toastManager?.error?.('Contract is not ready.');
      this._isLoadingOperation = false;
      return;
    }

    const toastId = window.toastManager?.loading?.('Loading operation...', { id: 'loadOperation' });
    try {
      const [operation, expired] = await Promise.all([
        contract.operations(operationId),
        contract.isOperationExpired(operationId),
      ]);
      this._renderOperationDetails(normalizeVaultOperation(operationId, operation, expired));
      if (toastId) {
        window.toastManager?.dismiss?.(toastId);
      }
    } catch (error) {
      const msg = error?.reason || error?.message || 'Failed to load operation.';
      window.toastManager?.update?.(toastId, { type: 'error', title: 'Error', message: msg, timeoutMs: 0 });
    } finally {
      this._isLoadingOperation = false;
    }
  }

  _renderOperationDetails(item) {
    const details = this.panel?.querySelector('[data-ops-operation-details]');
    const rowsEl = this.panel?.querySelector('[data-ops-operation-detail-rows]');
    const titleEl = this.panel?.querySelector('[data-ops-operation-modal-title]');
    if (!details || !(rowsEl instanceof HTMLElement)) return;

    const status = this._historyStatusLabel(item);
    const typeLabel = getVaultOperationTypeLabel(item.opType);
    const rows = [
      {
        key: 'operationId',
        label: 'Operation ID',
        value: item.operationId || '--',
        copyValue: item.operationId || '',
        code: true,
      },
      {
        key: 'operation',
        label: 'Operation',
        value: typeLabel,
      },
      {
        key: 'status',
        label: 'Status',
        value: status,
      },
      ...buildVaultOperationDetailRows(item, this._vaultOperationDisplayHelpers()),
      {
        key: 'signatures',
        label: 'Signatures',
        value: this._historySignatureLabel(item),
      },
      {
        key: 'deadline',
        label: 'Deadline',
        value: item.deadline ? this._formatUnix(item.deadline) : '--',
      },
      {
        key: 'executed',
        label: 'Executed',
        value: item.executed ? 'Yes' : 'No',
      },
      {
        key: 'expired',
        label: 'Expired',
        value: item.expired ? 'Yes' : 'No',
      },
    ];

    rowsEl.innerHTML = rows.map((row) => this._renderOperationDetailRow(row)).join('');
    if (titleEl) {
      titleEl.textContent = typeLabel ? `${typeLabel} Details` : 'Operation Details';
    }

    this._selectedOperation = item;
    details.hidden = false;
    this._lastOperationId = item.operationId;
    this._openOperationModal();
    this._syncSignButtonVisibility();
    this._renderRequestedOperations();
  }

  _vaultOperationDisplayHelpers() {
    return {
      decodeBoolData: (data) => this._decodeBoolData(data),
      formatOperationDataDisplay: (data) => this._formatOperationDataDisplay(data),
      formatTokenAmount: (value) => this._formatTokenAmount(value),
      isZeroAddress: (value) => this._isZeroAddress(value),
      normalizeAddress: (value) => this._normalizeAddress(value),
      shortenAddress: (value) => this._shortenAddress(value),
      uint256ToAddress: (value) => this._uint256ToAddress(value),
    };
  }

  _renderOperationDetailRow(row) {
    const key = escapeHtml(row?.key || 'detail');
    const label = escapeHtml(row?.label || '--');
    const value = this._renderOperationDetailValue(row);

    return `
      <div class="ops-panel-row" data-ops-detail-row="${key}">
        <div class="ops-panel-label">${label}</div>
        <div class="ops-panel-value">${value}</div>
      </div>
    `;
  }

  _renderOperationDetailValue(row) {
    const text = String(row?.value ?? '--');
    const escapedText = escapeHtml(text);
    const copyValue = String(row?.copyValue || '').trim();

    if (copyValue) {
      return `
        <div class="param-address">
          <code>${escapedText}</code>
          <button type="button" class="copy-inline" data-ops-copy data-copy-value="${escapeHtml(copyValue)}">Copy</button>
        </div>
      `;
    }

    if (row?.code) {
      return `<code>${escapedText}</code>`;
    }

    return escapedText;
  }

  _openOperationModal() {
    const modal = this.panel?.querySelector('[data-ops-operation-modal]');
    if (!(modal instanceof HTMLElement)) return;
    modal.hidden = false;
  }

  _closeOperationModal() {
    const modal = this.panel?.querySelector('[data-ops-operation-modal]');
    if (!(modal instanceof HTMLElement)) return;
    modal.hidden = true;
  }

  _historyStatusLabel(item) {
    if (item?.state === 'unavailable') return 'Unavailable';
    return item?.executed === true ? 'Executed' : this._isOperationExpiredState(item) ? 'Expired' : 'Pending';
  }

  _canOwnerSignSelectedOperation() {
    if (!this._access.connected || !this._access.isAdmin || this._access.isMultisig) return false;
    if (!this._selectedOperation) return false;
    return isOwnerSignableVaultOperationType(this._selectedOperation.opType);
  }

  _canCurrentUserSignOperation() {
    return !!(this._access.isMultisig || this._canOwnerSignSelectedOperation());
  }

  _getSignDisabledReason() {
    const item = this._selectedOperation;
    if (!item) return 'Load an operation first.';
    if (item.executed) return 'Operation already executed.';
    if (this._isOperationExpiredState(item)) return 'Operation expired.';
    return null;
  }

  _syncSignButtonVisibility() {
    const signBtn = this.panel?.querySelector('[data-ops-sign-submit]');
    if (!(signBtn instanceof HTMLButtonElement)) return;

    const canSign = this._canCurrentUserSignOperation();
    const disabledReason = canSign ? this._getSignDisabledReason() : null;

    signBtn.hidden = !canSign;
    signBtn.disabled = !!disabledReason;
    signBtn.title = disabledReason || '';
  }

  _historySignatureLabel(item) {
    const count = Number.isFinite(item?.numSignatures) ? Number(item.numSignatures) : null;
    const required = Number(window.contractManager?.getStatusSnapshot?.()?.requiredSignatures || 3) || 3;
    return count == null ? `--/${required}` : `${count}/${required}`;
  }

  _renderHistoryDeadlineMeta(item) {
    if (item?.state === 'unavailable') return '';
    const deadline = Number(item?.deadline || 0);
    if (!Number.isFinite(deadline) || deadline <= 0) return '';
    return ` | ${this._formatDeadlineRelative(deadline, item?.expired === true)}`;
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

  _formatDeadlineRelative(unixSeconds, expired = false) {
    const seconds = Number(unixSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return 'No deadline';
    const diff = seconds - Math.floor(Date.now() / 1000);
    const abs = Math.abs(diff);

    if (expired) {
      if (abs < 60) return 'Expired just now';
      const minutes = Math.floor(abs / 60);
      if (minutes < 60) return `Expired ${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `Expired ${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `Expired ${days}d ago`;
    }

    if (diff <= 0 || abs < 60) return 'Expires soon';

    const minutes = Math.floor(abs / 60);
    if (minutes < 60) return `Expires in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Expires in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Expires in ${days}d`;
  }

  _describeHistoryLoadError(error) {
    return {
      title: 'Unable to load requested operations',
      detail: error?.message || 'Failed to load requested operations.',
    };
  }

  async _signAndSubmit() {
    if (!this._access.connected) return;
    if (!this._canCurrentUserSignOperation()) {
      window.toastManager?.error?.('Load an Update Signer operation to sign as owner.');
      return;
    }

    const disabledReason = this._getSignDisabledReason();
    if (disabledReason) {
      window.toastManager?.error?.(disabledReason);
      return;
    }

    const operationId = this._selectedOperation?.operationId || '';
    if (!operationId) {
      window.toastManager?.error?.('Load an operation first.');
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
        message: 'Signing & submitting...',
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

      await window.contractManager?.refreshStatus?.({ reason: 'signatureSubmitted' }).catch(() => {});
      await this._refreshRequestedOperations();
      await this._loadOperationDetails().catch(() => {});
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
      message: `Switch to ${this._requiredNetworkName()} in your wallet to continue`,
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
      if (error?.code === -32002) return 'Network switch request already pending in your wallet.';
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

  _isOperationExpiredState(item) {
    return item?.expired === true;
  }

  _formatTokenAmount(value) {
    if (value == null) return '--';
    try {
      if (window.ethers?.utils?.formatUnits) {
        const formatted = window.ethers.utils.formatUnits(value, this._tokenDecimals());
        const numeric = Number(formatted);
        const pretty = Number.isFinite(numeric)
          ? numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })
          : formatted;
        return `${pretty} ${this._tokenSymbol()}`;
      }
    } catch {
      // Fall back to the raw value below.
    }

    return `${String(value?.toString?.() ?? value)} ${this._tokenSymbol()}`;
  }

  _decodeBoolData(data) {
    const normalized = String(data || '').trim().toLowerCase();
    if (!/^0x[0-9a-f]+$/.test(normalized)) return null;
    const body = normalized.slice(2).padStart(64, '0');
    if (body.length !== 64) return null;
    if (/^0{63}1$/.test(body)) return true;
    if (/^0{64}$/.test(body)) return false;
    return null;
  }

  _formatOperationDataDisplay(data) {
    const text = String(data ?? '--').trim();
    if (!text || text === '--') return '--';
    return text.toLowerCase() === '0x' ? 'None' : text;
  }

  _isZeroAddress(value) {
    return this._normalizeAddress(value) === '0x0000000000000000000000000000000000000000';
  }

  _uint256ToAddress(value) {
    try {
      const bigIntValue = BigInt(String(value?.toString?.() ?? value ?? '0'));
      const hex = bigIntValue.toString(16).padStart(40, '0').slice(-40);
      return this._normalizeAddress(`0x${hex}`) || `0x${hex}`;
    } catch {
      return null;
    }
  }

  _shortenHex(value, head = 4, tail = 4) {
    const text = String(value || '');
    if (!text.startsWith('0x') || text.length <= head + tail + 2) return text || '--';
    return `${text.slice(0, 2 + head)}...${text.slice(-tail)}`;
  }

  _shortenAddress(value) {
    return this._shortenHex(value, 4, 4);
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

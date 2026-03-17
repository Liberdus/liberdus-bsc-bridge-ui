export class PolygonBscBridgeModule {
  constructor({
    contractManager = null,
    walletManager = null,
    networkManager = null,
    toastManager = null,
    config = null,
    chainConfigUrl = './tss-signer/chain-config.json',
    abiPath = null,
  } = {}) {
    this.contractManager = contractManager || window.contractManager || null;
    this.walletManager = walletManager || window.walletManager || null;
    this.networkManager = networkManager || window.networkManager || null;
    this.toastManager = toastManager || window.toastManager || null;
    this.config = config || window.CONFIG || null;
    this.chainConfigUrl = chainConfigUrl;
    this.abiPath = abiPath;

    this.container = null;
    this._chainConfig = null;

    this._els = {};
    this._lastSnapshot = null;
    this._refreshTimerId = null;
    this._bound = false;

    this._onWalletEvent = this._onWalletEvent.bind(this);
    this._onContractUpdated = this._onContractUpdated.bind(this);
    this._onApproveClicked = this._onApproveClicked.bind(this);
    this._onBridgeClicked = this._onBridgeClicked.bind(this);
    this._onSetMaxClicked = this._onSetMaxClicked.bind(this);
  }

  mount(container) {
    if (!container) return;
    this.container = container;
    this._render();
    this._bind();
    this._loadChainConfig().finally(() => {
      this._syncChainText();
      this.refresh().catch(() => {});
    });
  }

  destroy() {
    this._unbind();
    if (this._refreshTimerId) window.clearTimeout(this._refreshTimerId);
    this._refreshTimerId = null;
    this.container = null;
    this._els = {};
  }

  async refresh() {
    if (!this.contractManager?.isReady?.()) return;
    await this.contractManager.refreshStatus({ reason: 'bridgeModuleRefresh' });
    await this._refreshBalances();
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;

    document.addEventListener('walletConnected', this._onWalletEvent);
    document.addEventListener('walletDisconnected', this._onWalletEvent);
    document.addEventListener('walletAccountChanged', this._onWalletEvent);
    document.addEventListener('walletChainChanged', this._onWalletEvent);
    document.addEventListener('contractManagerUpdated', this._onContractUpdated);

    this._els.approveBtn?.addEventListener('click', this._onApproveClicked);
    this._els.bridgeBtn?.addEventListener('click', this._onBridgeClicked);
    this._els.setMaxBtn?.addEventListener('click', this._onSetMaxClicked);
    
    // Listen to input changes for real-time validation
    this._els.recipient?.addEventListener('input', () => this._updateActionStates());
    this._els.amount?.addEventListener('input', () => this._updateActionStates());
  }

  _unbind() {
    if (!this._bound) return;
    this._bound = false;

    document.removeEventListener('walletConnected', this._onWalletEvent);
    document.removeEventListener('walletDisconnected', this._onWalletEvent);
    document.removeEventListener('walletAccountChanged', this._onWalletEvent);
    document.removeEventListener('walletChainChanged', this._onWalletEvent);
    document.removeEventListener('contractManagerUpdated', this._onContractUpdated);

    this._els.approveBtn?.removeEventListener('click', this._onApproveClicked);
    this._els.bridgeBtn?.removeEventListener('click', this._onBridgeClicked);
    this._els.setMaxBtn?.removeEventListener('click', this._onSetMaxClicked);
  }

  _render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-header">
        <h2>Bridge</h2>
        <p class="muted">Bridge ${this._tokenSymbol()} from <span data-bridge-source-name></span> to <span data-bridge-dest-name></span>.</p>
      </div>

      <div class="card bridge-module" data-bridge-module>
        <div class="bridge-kv">
          <div class="bridge-kv-row">
            <div class="bridge-kv-label">Source</div>
            <div class="bridge-kv-value"><span data-bridge-source-chain></span></div>
          </div>
          <div class="bridge-kv-row">
            <div class="bridge-kv-label">Destination</div>
            <div class="bridge-kv-value"><span data-bridge-dest-chain></span></div>
          </div>
          <div class="bridge-kv-row">
            <div class="bridge-kv-label">Vault Contract</div>
            <div class="bridge-kv-value"><span data-bridge-vault-address></span></div>
          </div>
        </div>

        <div class="form-grid">
          <label class="field field--full">
            <span class="field-label">Recipient Address (BSC)</span>
            <input class="field-input" type="text" placeholder="0x..." data-bridge-recipient data-requires-tx="true" data-allow-input-when-locked="true" />
          </label>

          <label class="field">
            <span class="field-label">Amount (${this._tokenSymbol()})</span>
            <input class="field-input" type="text" placeholder="0" inputmode="decimal" data-bridge-amount data-requires-tx="true" data-allow-input-when-locked="true" />
          </label>

          <label class="field">
            <span class="field-label">Destination Chain ID</span>
            <input class="field-input" type="text" data-bridge-dest-chainid disabled />
          </label>
        </div>

        <div class="bridge-meta">
          <div class="bridge-meta-row">
            <div class="bridge-meta-label">Your balance</div>
            <div class="bridge-meta-value"><span data-bridge-user-balance>-</span> ${this._tokenSymbol()}</div>
          </div>
          <div class="bridge-meta-row">
            <div class="bridge-meta-label">Allowance</div>
            <div class="bridge-meta-value"><span data-bridge-user-allowance>-</span> ${this._tokenSymbol()}</div>
          </div>
          <div class="bridge-meta-row">
            <div class="bridge-meta-label">Max bridge out</div>
            <div class="bridge-meta-value"><span data-bridge-max-amount>-</span> ${this._tokenSymbol()}</div>
          </div>
          <div class="bridge-meta-row">
            <div class="bridge-meta-label">Bridge enabled</div>
            <div class="bridge-meta-value"><span data-bridge-enabled>-</span></div>
          </div>
          <div class="bridge-meta-row">
            <div class="bridge-meta-label">Vault halted</div>
            <div class="bridge-meta-value"><span data-bridge-halted>-</span></div>
          </div>
        </div>

        <div class="actions bridge-actions">
          <button type="button" class="btn" data-bridge-set-max data-requires-tx="true">Use Max</button>
          <button type="button" class="btn" data-bridge-approve data-requires-tx="true">Approve</button>
          <button type="button" class="btn btn--primary" data-bridge-submit data-requires-tx="true">Bridge Out</button>
        </div>

        <div class="bridge-status" data-bridge-status hidden>
          <div class="bridge-status-title" data-bridge-status-title></div>
          <div class="bridge-status-body" data-bridge-status-body></div>
        </div>
      </div>
    `;

    const root = this.container.querySelector('[data-bridge-module]');
    this._els = {
      root,
      sourceName: this.container.querySelector('[data-bridge-source-name]'),
      destName: this.container.querySelector('[data-bridge-dest-name]'),
      sourceChain: this.container.querySelector('[data-bridge-source-chain]'),
      destChain: this.container.querySelector('[data-bridge-dest-chain]'),
      vaultAddress: this.container.querySelector('[data-bridge-vault-address]'),
      recipient: this.container.querySelector('[data-bridge-recipient]'),
      amount: this.container.querySelector('[data-bridge-amount]'),
      destChainId: this.container.querySelector('[data-bridge-dest-chainid]'),
      userBalance: this.container.querySelector('[data-bridge-user-balance]'),
      userAllowance: this.container.querySelector('[data-bridge-user-allowance]'),
      maxAmount: this.container.querySelector('[data-bridge-max-amount]'),
      enabled: this.container.querySelector('[data-bridge-enabled]'),
      halted: this.container.querySelector('[data-bridge-halted]'),
      approveBtn: this.container.querySelector('[data-bridge-approve]'),
      bridgeBtn: this.container.querySelector('[data-bridge-submit]'),
      setMaxBtn: this.container.querySelector('[data-bridge-set-max]'),
      status: this.container.querySelector('[data-bridge-status]'),
      statusTitle: this.container.querySelector('[data-bridge-status-title]'),
      statusBody: this.container.querySelector('[data-bridge-status-body]'),
    };

    this._syncChainText();
    this._updateActionStates();
  }

  _syncChainText() {
    const source = this._getSourceChain();
    const dest = this._getDestChain();

    const sourceLabel = source ? `${source.name} (${source.chainId})` : '-';
    const destLabel = dest ? `${dest.name} (${dest.chainId})` : '-';

    if (this._els.sourceName) this._els.sourceName.textContent = source?.name || '-';
    if (this._els.destName) this._els.destName.textContent = dest?.name || '-';
    if (this._els.sourceChain) this._els.sourceChain.textContent = sourceLabel;
    if (this._els.destChain) this._els.destChain.textContent = destLabel;
    if (this._els.destChainId) this._els.destChainId.value = dest?.chainId != null ? String(dest.chainId) : '';
    if (this._els.vaultAddress) this._els.vaultAddress.textContent = this._shortAddress(this._getVaultAddress());
  }

  _onWalletEvent() {
    const addr = this.walletManager?.getAddress?.() || null;
    if (addr && this._els.recipient && !this._els.recipient.value) {
      this._els.recipient.value = addr;
    }
    this._updateActionStates();
    this._scheduleRefresh();
  }

  _onContractUpdated(e) {
    this._lastSnapshot = e?.detail?.status || null;
    this._renderFromSnapshot();
    this._updateActionStates();
    this._scheduleRefreshBalances();
  }

  _renderFromSnapshot() {
    const s = this._lastSnapshot;
    if (!s) return;

    if (this._els.enabled) this._els.enabled.textContent = s.bridgeOutEnabled == null ? '-' : s.bridgeOutEnabled ? 'Yes' : 'No';
    if (this._els.halted) this._els.halted.textContent = s.halted == null ? '-' : s.halted ? 'Yes' : 'No';
    if (this._els.maxAmount) this._els.maxAmount.textContent = s.maxBridgeOutAmount ? this._formatTokenUnits(s.maxBridgeOutAmount) : '-';
  }

  _updateActionStates() {
    const txEnabled = !!this.networkManager?.isTxEnabled?.();
    const snapshot = this._lastSnapshot;

    if (this._els.recipient) this._els.recipient.disabled = false;
    if (this._els.amount) this._els.amount.disabled = false;

    const recipientOk = this._isAddress(this._els.recipient?.value);
    const amountWei = this._parseAmountToWei(this._els.amount?.value);
    const amountOk = amountWei && amountWei.gt(0);

    const bridgeEnabled = snapshot?.bridgeOutEnabled !== false && snapshot?.halted !== true;
    const maxOk = snapshot?.maxBridgeOutAmount ? amountWei && amountWei.lte(this._bn(snapshot.maxBridgeOutAmount)) : true;

    const needsApproval = this._needsApproval(amountWei);

    if (this._els.approveBtn) this._els.approveBtn.disabled = !txEnabled || !amountOk || !needsApproval;
    if (this._els.bridgeBtn)
      this._els.bridgeBtn.disabled =
        !txEnabled || !recipientOk || !amountOk || !bridgeEnabled || !maxOk || needsApproval;
    if (this._els.setMaxBtn) this._els.setMaxBtn.disabled = !txEnabled;
  }

  _needsApproval(amountWei) {
    if (!amountWei || amountWei.lte(0)) return true;
    const allowanceWei = this._balanceCache?.allowanceWei || null;
    if (!allowanceWei) return true;
    return allowanceWei.lt(amountWei);
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
    const userBalWei = this._balanceCache?.balanceWei || null;
    const setWei = userBalWei && userBalWei.lt(maxWei) ? userBalWei : maxWei;
    this._els.amount.value = this._formatTokenUnits(setWei.toString());
    this._updateActionStates();
  }

  async _onApproveClicked() {
    try {
      const signer = this.walletManager?.getSigner?.();
      const address = this.walletManager?.getAddress?.();
      if (!signer || !address) throw new Error('Wallet not connected');

      const tokenAddr = await this._getTokenAddress();
      if (!tokenAddr) throw new Error('Token address not available');

      const amountWei = this._parseAmountToWei(this._els.amount?.value);
      if (!amountWei || amountWei.lte(0)) throw new Error('Enter a valid amount');

      const token = new window.ethers.Contract(tokenAddr, this._erc20Abi(), signer);
      const vault = this._getVaultAddress();
      if (!vault) throw new Error('Vault address not configured');

      const toastId = this.toastManager?.loading?.('Confirm the approval in your wallet', { id: 'bridgeApprove' });

      const tx = await token.approve(vault, window.ethers.constants.MaxUint256);
      this._showStatus('Approval submitted', this._txLinkHtml(this._getSourceChainExplorer(), tx.hash));

      this.toastManager?.update?.(toastId, {
        title: 'Approval submitted',
        message: `Tx: ${tx.hash}`,
        type: 'info',
        timeoutMs: 3500,
        dismissible: true,
      });

      await tx.wait(1);

      this.toastManager?.success?.('Approval confirmed', { id: toastId, timeoutMs: 2500 });
      await this._refreshBalances();
      this._updateActionStates();
    } catch (error) {
      this.toastManager?.error?.(error?.reason || error?.message || 'Approval failed');
      this._showStatus('Approval failed', this._escapeHtml(error?.reason || error?.message || 'Unknown error'));
    }
  }

  async _onBridgeClicked() {
    try {
      const contract = this.contractManager?.getWriteContract?.();
      const address = this.walletManager?.getAddress?.();
      if (!contract || !address) throw new Error('Wallet not connected');

      const recipient = String(this._els.recipient?.value || '').trim();
      if (!this._isAddress(recipient)) throw new Error('Invalid recipient address');

      const amountWei = this._parseAmountToWei(this._els.amount?.value);
      if (!amountWei || amountWei.lte(0)) throw new Error('Enter a valid amount');

      const snapshot = this.contractManager?.getStatusSnapshot?.();
      if (snapshot?.bridgeOutEnabled === false) throw new Error('Bridge out is currently disabled');
      if (snapshot?.halted === true) throw new Error('Vault is currently halted');
      if (snapshot?.maxBridgeOutAmount && amountWei.gt(this._bn(snapshot.maxBridgeOutAmount))) {
        throw new Error('Amount exceeds max bridge out limit');
      }

      const dest = this._getDestChain();
      if (!dest?.chainId) throw new Error('Destination chain not configured');
      const bridgeChainId = this._getBridgeOutChainId(snapshot);
      if (!bridgeChainId) throw new Error('Bridge chain ID is not configured');

      if (this._needsApproval(amountWei)) throw new Error('Approval required before bridging');

      const overrides = await this._buildGasOverrides(contract, amountWei, recipient, bridgeChainId);

      const toastId = this.toastManager?.loading?.('Confirm the bridge transaction in your wallet', { id: 'bridgeOut' });
      const tx = await contract.bridgeOut(amountWei, recipient, bridgeChainId, overrides);

      this._showStatus('Bridge transaction submitted', this._txLinkHtml(this._getSourceChainExplorer(), tx.hash));
      this.toastManager?.update?.(toastId, {
        title: 'Bridge submitted',
        message: `Tx: ${tx.hash}`,
        type: 'info',
        timeoutMs: 3500,
        dismissible: true,
      });

      const receipt = await tx.wait(1);

      const bridgedOut = this._parseBridgedOutFromReceipt(receipt);
      if (bridgedOut) {
        const { from, amount, targetAddress, chainId } = bridgedOut;
        const msg = `From ${this._shortAddress(from)} • ${this._formatTokenUnits(amount)} ${this._tokenSymbol()} → ${this._shortAddress(
          targetAddress
        )} (chain ${chainId})`;
        this.toastManager?.success?.('Bridge out confirmed', { id: toastId, timeoutMs: 3500 });
        this._showStatus('Bridge out confirmed', this._escapeHtml(msg));
      } else {
        this.toastManager?.success?.('Bridge confirmed', { id: toastId, timeoutMs: 2500 });
        this._showStatus('Bridge confirmed', 'Transaction confirmed on Polygon');
      }

      await this._refreshBalances();
      this._updateActionStates();
    } catch (error) {
      this.toastManager?.error?.(error?.reason || error?.message || 'Bridge failed');
      this._showStatus('Bridge failed', this._escapeHtml(error?.reason || error?.message || 'Unknown error'));
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

  async _buildGasOverrides(contract, amountWei, recipient, chainId) {
    const gasConfig = this._chainConfig?.vaultChain?.gasConfig || null;
    if (!gasConfig || !contract?.estimateGas?.bridgeOut) return {};
    try {
      const est = await contract.estimateGas.bridgeOut(amountWei, recipient, chainId);
      const padded = est.mul(120).div(100);
      const cap = this._bn(String(gasConfig.gasLimit || 0));
      if (cap.gt(0) && padded.gt(cap)) return { gasLimit: cap };
      return { gasLimit: padded };
    } catch (_) {
      const cap = this._bn(String(gasConfig.gasLimit || 0));
      return cap.gt(0) ? { gasLimit: cap } : {};
    }
  }

  async _refreshBalances() {
    if (!window.ethers) return;
    const provider = this.walletManager?.getProvider?.() || this.contractManager?.provider || null;
    const address = this.walletManager?.getAddress?.() || null;
    if (!provider || !address) {
      this._balanceCache = null;
      if (this._els.userBalance) this._els.userBalance.textContent = '-';
      if (this._els.userAllowance) this._els.userAllowance.textContent = '-';
      this._updateActionStates();
      return;
    }

    const tokenAddr = await this._getTokenAddress();
    const vaultAddr = this._getVaultAddress();
    if (!tokenAddr || !vaultAddr) return;

    const token = new window.ethers.Contract(tokenAddr, this._erc20Abi(), provider);

    const [bal, allowance] = await Promise.all([
      token.balanceOf(address).catch(() => null),
      token.allowance(address, vaultAddr).catch(() => null),
    ]);

    const balanceWei = bal ? this._bn(bal.toString()) : null;
    const allowanceWei = allowance ? this._bn(allowance.toString()) : null;

    this._balanceCache = { balanceWei, allowanceWei };
    if (this._els.userBalance) this._els.userBalance.textContent = balanceWei ? this._formatTokenUnits(balanceWei.toString()) : '-';
    if (this._els.userAllowance)
      this._els.userAllowance.textContent = allowanceWei ? this._formatTokenUnits(allowanceWei.toString()) : '-';

    this._updateActionStates();
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

  async _loadChainConfig() {
    if (!this.chainConfigUrl) return null;
    try {
      const res = await fetch(this.chainConfigUrl, { cache: 'no-cache' });
      if (!res.ok) return null;
      const json = await res.json();
      this._chainConfig = json;
      return json;
    } catch (_) {
      return null;
    }
  }

  _getVaultAddress() {
    const fromChainCfg = this._chainConfig?.vaultChain?.contractAddress || null;
    const fromConfig = this.config?.CONTRACT?.ADDRESS || this.config?.BRIDGE?.CONTRACTS?.POLYGON?.ADDRESS || null;
    return fromConfig || fromChainCfg || null;
  }

  _getSourceChain() {
    const fromChainCfg = this._chainConfig?.vaultChain || this._chainConfig?.supportedChains?.[String(this.config?.NETWORK?.CHAIN_ID || '')];
    if (fromChainCfg?.chainId) return { name: fromChainCfg.name, chainId: Number(fromChainCfg.chainId) };
    const cfg = this.config?.NETWORK;
    if (cfg?.CHAIN_ID) return { name: cfg.NAME || 'Polygon', chainId: Number(cfg.CHAIN_ID) };
    return null;
  }

  _getDestChain() {
    const fromChainCfg = this._chainConfig?.secondaryChainConfig || null;
    if (fromChainCfg?.chainId) return { name: fromChainCfg.name, chainId: Number(fromChainCfg.chainId) };
    const cfg = this.config?.BRIDGE?.CHAINS?.BSC;
    if (cfg?.CHAIN_ID) return { name: cfg.NAME || 'BSC', chainId: Number(cfg.CHAIN_ID) };
    return null;
  }

  _getBridgeOutChainId(snapshot = null) {
    const status = snapshot || this.contractManager?.getStatusSnapshot?.() || null;
    const onChainId = Number(status?.onChainId || 0);
    if (Number.isFinite(onChainId) && onChainId > 0) return onChainId;
    const configuredChainId = Number(this.config?.NETWORK?.CHAIN_ID || 0);
    return Number.isFinite(configuredChainId) && configuredChainId > 0 ? configuredChainId : null;
  }

  _getSourceChainExplorer() {
    const cfg = this.config?.NETWORK?.BLOCK_EXPLORER || '';
    if (cfg) return cfg;
    const name = (this._getSourceChain()?.name || '').toLowerCase();
    if (name.includes('amoy')) return 'https://amoy.polygonscan.com';
    return '';
  }

  _scheduleRefresh() {
    if (this._refreshTimerId) window.clearTimeout(this._refreshTimerId);
    this._refreshTimerId = window.setTimeout(() => {
      this._refreshTimerId = null;
      this.refresh().catch(() => {});
    }, 200);
  }

  _scheduleRefreshBalances() {
    if (this._refreshTimerId) window.clearTimeout(this._refreshTimerId);
    this._refreshTimerId = window.setTimeout(() => {
      this._refreshTimerId = null;
      this._refreshBalances().catch(() => {});
    }, 250);
  }

  _showStatus(title, bodyHtml) {
    if (!this._els.status || !this._els.statusTitle || !this._els.statusBody) return;
    this._els.status.hidden = false;
    this._els.statusTitle.textContent = String(title || '');
    this._els.statusBody.innerHTML = String(bodyHtml || '');
  }

  _txLinkHtml(explorerBase, txHash) {
    const href = explorerBase ? `${explorerBase.replace(/\/$/, '')}/tx/${txHash}` : '#';
    const safeHash = this._escapeHtml(txHash);
    return `<a href="${href}" target="_blank" rel="noopener">${safeHash}</a>`;
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

  _parseAmountToWei(value) {
    try {
      const v = String(value || '').trim();
      if (!v) return null;
      const dec = Number(this.config?.TOKEN?.DECIMALS ?? 18);
      return window.ethers.utils.parseUnits(v, dec);
    } catch (_) {
      return null;
    }
  }

  _bn(value) {
    return window.ethers.BigNumber.from(value);
  }

  _shortAddress(address) {
    const a = String(address || '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return a || '-';
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }

  _isAddress(address) {
    try {
      return !!window.ethers.utils.getAddress(String(address || '').trim());
    } catch (_) {
      return false;
    }
  }

  _escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

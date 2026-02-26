import { CONFIG } from './config.js';
import { Header } from './components/header.js';
import { TabBar } from './components/tab-bar.js';
import { OverviewTab } from './components/overview-tab.js';
import { BridgeOutTab } from './components/bridge-out-tab.js';
import { OperationsTab } from './components/operations-tab.js';
import { ContractTab } from './components/contract-tab.js';
import { TransactionsTab } from './components/transactions-tab.js';
import { ToastManager } from './components/toast-manager.js';
import { WalletManager } from './wallet/wallet-manager.js';
import { NetworkManager } from './wallet/network-manager.js';
import { WalletPopup } from './wallet/wallet-popup.js';
import { ContractManager } from './contracts/contract-manager.js';

const header = new Header();
const tabBar = new TabBar();
const overviewTab = new OverviewTab();
const bridgeOutTab = new BridgeOutTab();
const operationsTab = new OperationsTab();
const contractTab = new ContractTab();
const transactionsTab = new TransactionsTab();
const toastManager = new ToastManager();
const walletManager = new WalletManager();
const networkManager = new NetworkManager({ walletManager });
const walletPopup = new WalletPopup({ walletManager, networkManager });
const contractManager = new ContractManager({ walletManager, networkManager });

document.addEventListener('DOMContentLoaded', async () => {
  window.CONFIG = CONFIG;

  const versionEl = document.querySelector('.app-version');
  if (versionEl && CONFIG?.APP?.VERSION) {
    versionEl.textContent = `(${CONFIG.APP.VERSION})`;
  }

  window.toastManager = toastManager;
  window.walletManager = walletManager;
  window.networkManager = networkManager;
  window.walletPopup = walletPopup;
  window.contractManager = contractManager;

  toastManager.load();
  walletManager.load();
  await walletManager.init();
  networkManager.load();
  walletPopup.load();

  try {
    await contractManager.load();
  } catch (error) {
    toastManager.error(error?.message || 'Failed to initialize contract manager');
  }

  header.load();
  overviewTab.load();
  bridgeOutTab.load();
  operationsTab.load();
  contractTab.load();
  transactionsTab.load();

  tabBar.load();
});

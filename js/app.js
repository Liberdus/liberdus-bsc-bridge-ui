import { CONFIG } from './config.js?v=20260309k';
import { Header } from './components/header.js?v=20260309k';
import { TabBar } from './components/tab-bar.js?v=20260309k';
import { OverviewTab } from './components/overview-tab.js?v=20260309k';
import { BridgeOutTab } from './components/bridge-out-tab.js?v=20260309k';
import { OperationsTab } from './components/operations-tab.js?v=20260309k';
import { ContractTab } from './components/contract-tab.js?v=20260309k';
import { TransactionsTab } from './components/transactions-tab.js?v=20260309k';
import { ToastManager } from './components/toast-manager.js?v=20260309k';
import { WalletManager } from './wallet/wallet-manager.js?v=20260309k';
import { NetworkManager } from './wallet/network-manager.js?v=20260309k';
import { WalletPopup } from './wallet/wallet-popup.js?v=20260309k';
import { ContractManager } from './contracts/contract-manager.js?v=20260309k';

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
  networkManager.load();
  walletPopup.load();
  await walletManager.init();

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

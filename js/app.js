import { CONFIG } from './config.js';
import { Header } from './components/header.js';
import { TabBar } from './components/tab-bar.js';
import { InfoTab } from './components/info-tab.js';
import { BridgeOutTab } from './components/bridge-out-tab.js';
import { OperationsTab } from './components/operations-tab.js';
import { TransactionsTab } from './components/transactions-tab.js';
import { ToastManager } from './components/toast-manager.js';
import { WalletManager } from './wallet/wallet-manager.js';
import { NetworkManager } from './wallet/network-manager.js';
import { WalletPopup } from './wallet/wallet-popup.js';
import { ContractManager } from './contracts/contract-manager.js';

export async function startApp() {
  const header = new Header();
  const tabBar = new TabBar();
  const infoTab = new InfoTab();
  const bridgeOutTab = new BridgeOutTab();
  const operationsTab = new OperationsTab();
  const transactionsTab = new TransactionsTab();
  const toastManager = new ToastManager();
  const walletManager = new WalletManager();
  const networkManager = new NetworkManager({ walletManager });
  const contractManager = new ContractManager({ walletManager, networkManager });
  const walletPopup = new WalletPopup({ walletManager, contractManager });

  window.CONFIG = CONFIG;

  const versionEl = document.querySelector('.app-version');
  if (versionEl && CONFIG.APP.VERSION) {
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
  infoTab.load();
  bridgeOutTab.load();
  operationsTab.load();
  transactionsTab.load();

  tabBar.load();
}

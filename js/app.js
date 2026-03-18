import { CONFIG } from './config.js?v=20260318b';
import { Header } from './components/header.js?v=20260317i';
import { TabBar } from './components/tab-bar.js?v=20260317o';
import { InfoTab } from './components/info-tab.js?v=20260317a';
import { BridgeOutTab } from './components/bridge-out-tab.js?v=20260318b';
import { OperationsTab } from './components/operations-tab.js?v=20260317d';
import { TransactionsTab } from './components/transactions-tab.js?v=20260318b';
import { ToastManager } from './components/toast-manager.js?v=20260317k';
import { WalletManager } from './wallet/wallet-manager.js?v=20260317j';
import { NetworkManager } from './wallet/network-manager.js?v=20260318b';
import { WalletPopup } from './wallet/wallet-popup.js?v=20260317a';
import { ContractManager } from './contracts/contract-manager.js?v=20260317e';

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
const walletPopup = new WalletPopup({ walletManager, networkManager, contractManager });

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
  infoTab.load();
  bridgeOutTab.load();
  operationsTab.load();
  transactionsTab.load();

  tabBar.load();
});

const VERSION_STORAGE_KEY = 'app_version';
const REQUEST_TIMEOUT_MS = 3000;
const VERSION_URL = 'version.html';
const RELOAD_BATCH_SIZE = 4;
const CRITICAL_FILES = [
  'index.html',
  'version.html',
  'assets/logo.png',
  'abi/vault.json',
  'css/base.css',
  'css/bridge-module.css',
  'css/header.css',
  'css/notifications.css',
  'css/tabs.css',
  'css/wallet-popup.css',
  'libs/ethers.umd.min.js',
  'js/bootstrap.js',
  'js/app.js',
  'js/config.js',
  'js/version-service.js',
  'js/components/bridge-out-tab.js',
  'js/components/header.js',
  'js/components/info-tab.js',
  'js/components/operations-tab.js',
  'js/components/tab-bar.js',
  'js/components/toast-manager.js',
  'js/components/transactions-tab.js',
  'js/contracts/contract-manager.js',
  'js/modules/polygon-bsc-bridge-module.js',
  'js/utils/read-only-provider-for-network.js',
  'js/utils/read-only-provider.js',
  'js/wallet/metamask-connector.js',
  'js/wallet/network-manager.js',
  'js/wallet/wallet-manager.js',
  'js/wallet/wallet-popup.js',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getReloadUrl() {
  return window.location.href.split('?')[0];
}

async function fetchNoCache(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: 'reload',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function reloadCriticalFiles() {
  const urls = [getReloadUrl(), ...CRITICAL_FILES];

  for (let i = 0; i < urls.length; i += RELOAD_BATCH_SIZE) {
    await Promise.all(
      urls.slice(i, i + RELOAD_BATCH_SIZE).map(async (url) => {
        const response = await fetchNoCache(url);
        assert(response.ok, `Failed to reload ${url}: ${response.status} ${response.statusText}`);
        await response.arrayBuffer();
      })
    );
  }
}

export async function initializeVersionService() {
  const response = await fetchNoCache(VERSION_URL);
  assert(response.ok, `Failed to load ${VERSION_URL}: ${response.status} ${response.statusText}`);

  const nextVersion = (await response.text()).trim();
  assert(nextVersion, `${VERSION_URL} is empty`);

  const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
  if (storedVersion === nextVersion) {
    return false;
  }

  await reloadCriticalFiles();
  localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
  window.location.replace(getReloadUrl());
  return true;
}

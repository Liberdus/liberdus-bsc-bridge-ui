const VERSION_STORAGE_KEY = 'app_version';
const REQUEST_TIMEOUT_MS = 3000;
const VERSION_URL = 'version.html';
const RELOAD_BATCH_SIZE = 4;
const NO_CACHE_REQUEST = {
  cache: 'reload',
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
};

const STATIC_CRITICAL_FILES = [
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
    return await fetch(url, { ...NO_CACHE_REQUEST, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchVersion() {
  const response = await fetchNoCache(VERSION_URL);
  assert(response.ok, `Failed to load ${VERSION_URL}: ${response.status} ${response.statusText}`);

  const version = (await response.text()).trim();
  assert(version, `${VERSION_URL} is empty`);
  return version;
}

async function reloadFile(url) {
  const response = await fetchNoCache(url);
  assert(response.ok, `Failed to reload ${url}: ${response.status} ${response.statusText}`);
  await response.arrayBuffer();
}

async function reloadCriticalFiles() {
  const urls = [getReloadUrl(), ...STATIC_CRITICAL_FILES];

  for (let i = 0; i < urls.length; i += RELOAD_BATCH_SIZE) {
    const batch = urls.slice(i, i + RELOAD_BATCH_SIZE);
    await Promise.all(batch.map((url) => reloadFile(url)));
  }
}

export const versionService = {
  async initialize() {
    try {
      const nextVersion = await fetchVersion();
      const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)?.trim() || null;

      if (storedVersion === nextVersion) {
        return false;
      }

      await reloadCriticalFiles();
      localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
      window.location.replace(getReloadUrl());
      return true;
    } catch {
      return false;
    }
  },
};

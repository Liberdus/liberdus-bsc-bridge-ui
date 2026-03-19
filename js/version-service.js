const VERSION_STORAGE_KEY = 'app_version';
const DEFAULT_REQUEST_TIMEOUT_MS = 3000;
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

function createRequestSignal(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, timerId };
}

async function fetchText(url, { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  const { signal, timerId } = createRequestSignal(timeoutMs);
  try {
    const response = await fetch(url, { ...NO_CACHE_REQUEST, signal });
    assert(response.ok, `Failed to load ${url}: ${response.status} ${response.statusText}`);

    const text = (await response.text()).trim();
    assert(text, `${url} is empty`);
    return text;
  } finally {
    window.clearTimeout(timerId);
  }
}

async function fetchAndDrain(url, { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  const { signal, timerId } = createRequestSignal(timeoutMs);
  try {
    const response = await fetch(url, { ...NO_CACHE_REQUEST, signal });
    assert(response.ok, `Failed to reload ${url}: ${response.status} ${response.statusText}`);
    await response.arrayBuffer();
  } finally {
    window.clearTimeout(timerId);
  }
}

async function reloadCriticalFiles({ timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  const criticalFiles = [getReloadUrl(), ...STATIC_CRITICAL_FILES];
  await Promise.all(criticalFiles.map((url) => fetchAndDrain(url, { timeoutMs })));
}

export const versionService = {
  async initialize({ timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
    try {
      const nextVersion = await fetchText('version.html', { timeoutMs });
      const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)?.trim() || null;

      if (storedVersion === nextVersion) {
        return false;
      }

      await reloadCriticalFiles({ timeoutMs });
      localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
      window.location.replace(getReloadUrl());
      return true;
    } catch {
      return false;
    }
  },
};

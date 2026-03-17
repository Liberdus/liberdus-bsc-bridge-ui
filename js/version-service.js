const VERSION_STORAGE_KEY = 'app_version';
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function debug(...args) {
  console.debug('[VersionService]', ...args);
}

function warn(...args) {
  console.warn('[VersionService]', ...args);
}

function error(...args) {
  console.error('[VersionService]', ...args);
}

export class VersionService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.updateInProgress = false;

    window.addEventListener('online', () => {
      this.isOnline = true;
      debug('Network connection restored');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      warn('Network connection lost');
    });
  }

  async initialize() {
    debug('Initializing version service...');

    try {
      return await this.checkVersion();
    } catch (err) {
      error('Version service initialization failed:', err);
      return false;
    }
  }

  async checkVersion() {
    const storedVersionRaw = localStorage.getItem(VERSION_STORAGE_KEY);
    const hasStoredVersion = typeof storedVersionRaw === 'string' && storedVersionRaw.trim().length > 0;
    const storedVersion = hasStoredVersion ? storedVersionRaw.trim() : null;
    let nextVersion;

    debug('Checking version. Stored version:', storedVersion);

    try {
      const response = await fetch('version.html', {
        cache: 'reload',
        headers: NO_CACHE_HEADERS,
      });

      if (!response.ok) {
        throw new Error(`Version check failed: ${response.status} ${response.statusText}`);
      }

      nextVersion = (await response.text()).trim();
      debug('Server version:', nextVersion);
    } catch (err) {
      error('Version check failed:', err);

      if (!this.isOnline || err instanceof TypeError) {
        warn('Version check failed due to network issues. Continuing with cached version.');
        return false;
      }

      warn('Version check failed. Continuing with cached version.');
      return false;
    }

    if (!hasStoredVersion) {
      localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
      debug('No stored version found. Bootstrapping app_version without update.');
      return false;
    }

    if (storedVersion !== nextVersion) {
      debug('Version update detected, performing cache bust...');
      await this.performUpdate(nextVersion);
      return true;
    }

    debug('No version update needed');
    return false;
  }

  async performUpdate(nextVersion) {
    if (this.updateInProgress) {
      debug('Update already in progress, skipping...');
      return;
    }

    this.updateInProgress = true;

    try {
      localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
      await this.forceReloadCriticalFiles();
      debug('Update complete, reloading page...');
      window.location.replace(window.location.href.split('?')[0]);
    } catch (err) {
      error('Update failed:', err);
      this.updateInProgress = false;
    }
  }

  async forceReloadCriticalFiles() {
    const criticalFiles = Array.from(new Set([
      window.location.href.split('?')[0],
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
      'js/components/contract-tab.js',
      'js/components/header.js',
      'js/components/operations-tab.js',
      'js/components/overview-tab.js',
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
    ]));

    debug('Force reloading critical files...');

    try {
      await Promise.all(criticalFiles.map((url) => fetch(url, {
        cache: 'reload',
        headers: NO_CACHE_HEADERS,
      })));
      debug('Critical files reloaded successfully');
    } catch (err) {
      error('Failed to reload critical files:', err);
    }
  }
}

export const versionService = new VersionService();

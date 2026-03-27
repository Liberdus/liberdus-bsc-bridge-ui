const VERSION_STORAGE_KEY = 'app_version';
const REQUEST_TIMEOUT_MS = 3000;
const VERSION_URL = 'version.html';
const CRITICAL_FILES_MANIFEST_URL = 'critical-files.json';
const RELOAD_BATCH_SIZE = 4;

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

function normalizeManifestPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.files)) {
    return payload.files;
  }

  throw new Error(`${CRITICAL_FILES_MANIFEST_URL} is invalid`);
}

async function loadCriticalFiles() {
  const response = await fetchNoCache(CRITICAL_FILES_MANIFEST_URL);

  if (!response.ok) {
    throw new Error(`Failed to load ${CRITICAL_FILES_MANIFEST_URL}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const files = normalizeManifestPayload(payload)
    .filter((file) => typeof file === 'string')
    .map((file) => file.trim())
    .filter(Boolean);

  assert(files.length > 0, `${CRITICAL_FILES_MANIFEST_URL} is empty`);
  return files;
}

async function reloadCriticalFiles(files) {
  const urls = [getReloadUrl(), ...files];

  for (let i = 0; i < urls.length; i += RELOAD_BATCH_SIZE) {
    await Promise.all(
      urls.slice(i, i + RELOAD_BATCH_SIZE).map(async (url) => {
        try {
          const response = await fetchNoCache(url);
          assert(response.ok, `Failed to reload ${url}: ${response.status} ${response.statusText}`);
          await response.arrayBuffer();
        } catch (error) {
          console.error('Critical asset preload failed', { url, error });
          throw error;
        }
      })
    );
  }
}

export async function initializeVersionService() {
  try {
    const response = await fetchNoCache(VERSION_URL);
    assert(response.ok, `Failed to load ${VERSION_URL}: ${response.status} ${response.statusText}`);

    const nextVersion = (await response.text()).trim();
    assert(nextVersion, `${VERSION_URL} is empty`);

    if (localStorage.getItem(VERSION_STORAGE_KEY) === nextVersion) {
      return false;
    }

    const criticalFiles = await loadCriticalFiles();
    await reloadCriticalFiles(criticalFiles);

    localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
    window.location.reload();
    return true;
  } catch (error) {
    console.warn('Version refresh skipped, continuing with current app', error);
    return false;
  }
}

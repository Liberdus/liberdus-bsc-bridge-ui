import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeVersionService } from '../js/version-service.js';

function makeResponse({ ok = true, status = 200, statusText = 'OK', text = '', json, arrayBuffer } = {}) {
  return {
    ok,
    status,
    statusText,
    text: vi.fn(async () => text),
    json: vi.fn(async () => json),
    arrayBuffer: vi.fn(async () => arrayBuffer ?? new ArrayBuffer(8)),
  };
}

describe('initializeVersionService', () => {
  const originalLocation = window.location;
  let reloadSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'https://bridge.test/index.html?cache=1',
        reload: reloadSpy,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('does nothing when the stored version already matches', async () => {
    localStorage.setItem('app_version', 'v1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === 'version.html') {
          return makeResponse({ text: 'v1' });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    await expect(initializeVersionService()).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('uses the deployment manifest when a new version is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === 'version.html') {
          return makeResponse({ text: 'v2' });
        }

        if (url === 'critical-files.json') {
          return makeResponse({ json: { files: ['css/base.css', 'js/app.js'] } });
        }

        return makeResponse();
      })
    );

    await expect(initializeVersionService()).resolves.toBe(true);

    const fetchedUrls = fetch.mock.calls.map(([url]) => url);
    expect(fetchedUrls).toContain('critical-files.json');
    expect(fetchedUrls).toContain('https://bridge.test/index.html');
    expect(fetchedUrls).toContain('css/base.css');
    expect(fetchedUrls).toContain('js/app.js');
    expect(localStorage.getItem('app_version')).toBe('v2');
    expect(reloadSpy).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips refresh when the manifest is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === 'version.html') {
          return makeResponse({ text: 'v2' });
        }

        if (url === 'critical-files.json') {
          return makeResponse({ ok: false, status: 404, statusText: 'Not Found' });
        }

        return makeResponse();
      })
    );

    await expect(initializeVersionService()).resolves.toBe(false);

    const fetchedUrls = fetch.mock.calls.map(([url]) => url);
    expect(fetchedUrls).toContain('critical-files.json');
    expect(warnSpy).toHaveBeenCalledWith(
      'Version refresh skipped, continuing with current app',
      expect.any(Error)
    );
    expect(localStorage.getItem('app_version')).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('does not request removed legacy assets when the manifest omits them', async () => {
    const removedLegacyAsset = 'js/utils/read-only-provider-for-network.js';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === 'version.html') {
          return makeResponse({ text: 'v2' });
        }

        if (url === 'critical-files.json') {
          return makeResponse({ json: { files: ['css/base.css', 'js/app.js'] } });
        }

        if (url === removedLegacyAsset) {
          throw new Error(`Unexpected legacy asset preload: ${url}`);
        }

        return makeResponse();
      })
    );

    await expect(initializeVersionService()).resolves.toBe(true);

    const fetchedUrls = fetch.mock.calls.map(([url]) => url);
    expect(fetchedUrls).not.toContain(removedLegacyAsset);
    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it('logs and aborts when a required manifest asset fails to preload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === 'version.html') {
          return makeResponse({ text: 'v2' });
        }

        if (url === 'critical-files.json') {
          return makeResponse({ json: { files: ['js/app.js'] } });
        }

        if (url === 'js/app.js') {
          return makeResponse({ ok: false, status: 500, statusText: 'Server Error' });
        }

        return makeResponse();
      })
    );

    await expect(initializeVersionService()).resolves.toBe(false);

    expect(localStorage.getItem('app_version')).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Critical asset preload failed',
      expect.objectContaining({
        url: 'js/app.js',
        error: expect.any(Error),
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Version refresh skipped, continuing with current app',
      expect.any(Error)
    );
  });
});

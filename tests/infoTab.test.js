import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InfoTab } from '../js/components/info-tab.js';
import { installCommonWindowStubs } from './helpers/test-utils.js';

function setupInfoTabDom() {
  document.body.innerHTML = '<div class="tab-panel" data-panel="info"></div>';
}

describe('InfoTab read warning toasts', () => {
  beforeEach(() => {
    setupInfoTabDom();
    installCommonWindowStubs();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('suppresses destination read warning toasts', () => {
    const tab = new InfoTab();
    tab.load();

    tab._notifyReadError({
      source: { error: null },
      destination: { error: 'Destination RPC down' },
    });

    expect(window.toastManager.error).not.toHaveBeenCalled();
  });

  it('still shows source read warning toasts', () => {
    const tab = new InfoTab();
    tab.load();

    tab._notifyReadError({
      source: { error: 'Source RPC down' },
      destination: { error: null },
    });

    expect(window.toastManager.error).toHaveBeenCalledWith(
      'Source Vault read warning: Source RPC down',
      { timeoutMs: 4000 }
    );
  });
});

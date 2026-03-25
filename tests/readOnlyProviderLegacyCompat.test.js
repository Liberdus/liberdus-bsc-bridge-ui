import { describe, expect, it } from 'vitest';

import {
  getReadOnlyProviderForNetwork as getMergedReadOnlyProviderForNetwork,
  peekReadOnlyProviderForNetwork as peekMergedReadOnlyProviderForNetwork,
  resetReadOnlyProvidersForNetworks as resetMergedReadOnlyProvidersForNetworks,
} from '../js/utils/read-only-provider.js';
import {
  getReadOnlyProviderForNetwork as getLegacyReadOnlyProviderForNetwork,
  peekReadOnlyProviderForNetwork as peekLegacyReadOnlyProviderForNetwork,
  resetReadOnlyProvidersForNetworks as resetLegacyReadOnlyProvidersForNetworks,
} from '../js/utils/read-only-provider-for-network.js';

describe('read-only provider legacy compatibility module', () => {
  it('re-exports the network-scoped helpers from the merged module', () => {
    expect(getLegacyReadOnlyProviderForNetwork).toBe(getMergedReadOnlyProviderForNetwork);
    expect(peekLegacyReadOnlyProviderForNetwork).toBe(peekMergedReadOnlyProviderForNetwork);
    expect(resetLegacyReadOnlyProvidersForNetworks).toBe(resetMergedReadOnlyProvidersForNetworks);
  });
});

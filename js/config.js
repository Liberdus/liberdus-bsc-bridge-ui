const PROFILES = {
  dev: {
    SOURCE_NETWORK: {
      CHAIN_ID: 80002,
      NAME: 'Polygon Amoy',
      RPC_URL: 'https://polygon-amoy-bor-rpc.publicnode.com',
      FALLBACK_RPCS: [
        'https://rpc-amoy.polygon.technology/',
        'https://polygon-amoy.drpc.org',
      ],
      BLOCK_EXPLORER: 'https://amoy.polygonscan.com',
      NATIVE_CURRENCY: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    SOURCE_CONTRACT: {
      ADDRESS: '0xaA2616CD3A3d3d63F8e1ac9c7d7BDc37f16709dA',
      ABI_PATH: './abi/vault.json',
    },
    DESTINATION_NETWORK: {
      CHAIN_ID: 97,
      NAME: 'BNB Testnet',
      RPC_URL: 'https://bsc-testnet.publicnode.com',
      FALLBACK_RPCS: [
        'https://bsc-testnet-dataseed.bnbchain.org',
        'https://bsc-testnet.bnbchain.org',
      ],
      BLOCK_EXPLORER: 'https://testnet.bscscan.com',
      NATIVE_CURRENCY: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
    },
    DESTINATION_CONTRACT: {
      ADDRESS: '0xf5A75e4bC827c9cC31BacD4c4d365107C698b465',
    },
    BRIDGE: {
      COORDINATOR_URL: 'https://tss1-test.liberdus.com',
    },
  },
  prod: {
    // Replace these placeholder deployment values with the final Polygon / BNB Chain values when available.
    SOURCE_NETWORK: {
      CHAIN_ID: 80002,
      NAME: 'Polygon',
      RPC_URL: 'https://polygon-amoy-bor-rpc.publicnode.com',
      FALLBACK_RPCS: [
        'https://rpc-amoy.polygon.technology/',
        'https://polygon-amoy.drpc.org',
      ],
      BLOCK_EXPLORER: 'https://amoy.polygonscan.com',
      NATIVE_CURRENCY: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    SOURCE_CONTRACT: {
      ADDRESS: '0xaA2616CD3A3d3d63F8e1ac9c7d7BDc37f16709dA',
      ABI_PATH: './abi/vault.json',
    },
    DESTINATION_NETWORK: {
      CHAIN_ID: 97,
      NAME: 'BNB Chain',
      RPC_URL: 'https://bsc-testnet.publicnode.com',
      FALLBACK_RPCS: [
        'https://bsc-testnet-dataseed.bnbchain.org',
        'https://bsc-testnet.bnbchain.org',
      ],
      BLOCK_EXPLORER: 'https://testnet.bscscan.com',
      NATIVE_CURRENCY: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
    },
    DESTINATION_CONTRACT: {
      ADDRESS: '0xf5A75e4bC827c9cC31BacD4c4d365107C698b465',
    },
    BRIDGE: {
      COORDINATOR_URL: 'https://tss1-test.liberdus.com',
    },
  },
};

export const CONFIG = {
  APP: {
    NAME: 'Liberdus BSC Bridge UI',
    VERSION: '0.1.1',
  },

  RUNTIME: {
    PROFILE: 'dev', // 'dev' or 'prod'
  },

  TOKEN: {
    SYMBOL: 'LIB',
    DECIMALS: 18,
    ADDRESS: '0xD5409531c857AfD1b2fF6Cd527038e9981ef4863',
  },

  BRIDGE: {
    LOOKBACK_BLOCKS: 60000,
    COORDINATOR_URL: '',
    CHAINS: {},
    CONTRACTS: {},
  },
};

/**
 * Normalize and validate the selected runtime profile.
 *
 * Profiles must use the SOURCE_* / DESTINATION_* shape.
 * CONFIG.BRIDGE.* is the canonical runtime shape consumed throughout the app.
 */
function profileError(profileName, message) {
  return new Error(`Invalid profile ${profileName}: ${message}`);
}

function requiredString(profileName, path, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw profileError(profileName, `missing ${path}`);
  return normalized;
}

function requiredInteger(profileName, path, value, { min = 1 } = {}) {
  if (value == null || value === '') {
    throw profileError(profileName, `missing ${path}`);
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min) {
    throw profileError(profileName, `invalid ${path}`);
  }
  return normalized;
}

function normalizeNetwork(profileName, value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw profileError(profileName, `missing ${path}`);
  }

  const fallbackRpcs = value.FALLBACK_RPCS;
  if (fallbackRpcs != null && !Array.isArray(fallbackRpcs)) {
    throw profileError(profileName, `invalid ${path}.FALLBACK_RPCS`);
  }

  const nativeCurrency = value.NATIVE_CURRENCY;
  if (!nativeCurrency || typeof nativeCurrency !== 'object' || Array.isArray(nativeCurrency)) {
    throw profileError(profileName, `missing ${path}.NATIVE_CURRENCY`);
  }

  return {
    CHAIN_ID: requiredInteger(profileName, `${path}.CHAIN_ID`, value.CHAIN_ID),
    NAME: requiredString(profileName, `${path}.NAME`, value.NAME),
    RPC_URL: requiredString(profileName, `${path}.RPC_URL`, value.RPC_URL),
    FALLBACK_RPCS: (fallbackRpcs || []).map((entry, index) =>
      requiredString(profileName, `${path}.FALLBACK_RPCS[${index}]`, entry)
    ),
    BLOCK_EXPLORER: requiredString(profileName, `${path}.BLOCK_EXPLORER`, value.BLOCK_EXPLORER),
    NATIVE_CURRENCY: {
      name: requiredString(profileName, `${path}.NATIVE_CURRENCY.name`, nativeCurrency.name),
      symbol: requiredString(profileName, `${path}.NATIVE_CURRENCY.symbol`, nativeCurrency.symbol),
      decimals: requiredInteger(profileName, `${path}.NATIVE_CURRENCY.decimals`, nativeCurrency.decimals, { min: 0 }),
    },
  };
}

function normalizeContract(profileName, value, path, { requireAbiPath = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw profileError(profileName, `missing ${path}`);
  }

  return {
    ADDRESS: requiredString(profileName, `${path}.ADDRESS`, value.ADDRESS),
    ...(requireAbiPath
      ? { ABI_PATH: requiredString(profileName, `${path}.ABI_PATH`, value.ABI_PATH) }
      : {}),
  };
}

function normalizeBridge(profileName, value) {
  if (value == null) return { COORDINATOR_URL: '' };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw profileError(profileName, 'invalid BRIDGE');
  }

  const coordinatorUrl = value.COORDINATOR_URL;
  if (coordinatorUrl == null) return { COORDINATOR_URL: '' };
  if (typeof coordinatorUrl !== 'string') {
    throw profileError(profileName, 'invalid BRIDGE.COORDINATOR_URL');
  }

  return {
    COORDINATOR_URL: coordinatorUrl.trim(),
  };
}

function normalizeProfile(profileName, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw profileError(profileName, `missing ${profileName}`);
  }

  return {
    SOURCE_NETWORK: normalizeNetwork(profileName, profile.SOURCE_NETWORK, 'SOURCE_NETWORK'),
    SOURCE_CONTRACT: normalizeContract(profileName, profile.SOURCE_CONTRACT, 'SOURCE_CONTRACT', { requireAbiPath: true }),
    DESTINATION_NETWORK: normalizeNetwork(profileName, profile.DESTINATION_NETWORK, 'DESTINATION_NETWORK'),
    DESTINATION_CONTRACT: normalizeContract(profileName, profile.DESTINATION_CONTRACT, 'DESTINATION_CONTRACT'),
    BRIDGE: normalizeBridge(profileName, profile.BRIDGE),
  };
}

// Apply active profile
const RESOLVED_PROFILE = PROFILES[CONFIG.RUNTIME.PROFILE] ? CONFIG.RUNTIME.PROFILE : 'dev';
const {
  SOURCE_NETWORK: ACTIVE_SOURCE_NETWORK,
  SOURCE_CONTRACT: ACTIVE_SOURCE_CONTRACT,
  DESTINATION_NETWORK: ACTIVE_DESTINATION_NETWORK,
  DESTINATION_CONTRACT: ACTIVE_DESTINATION_CONTRACT,
  BRIDGE: ACTIVE_BRIDGE,
} = normalizeProfile(RESOLVED_PROFILE, PROFILES[RESOLVED_PROFILE]);

/**
 * Project the active profile into the runtime CONFIG object.
 *
 * CONFIG.BRIDGE.* is the canonical runtime shape.
 */
CONFIG.RUNTIME.PROFILE = RESOLVED_PROFILE;
CONFIG.BRIDGE.COORDINATOR_URL = ACTIVE_BRIDGE.COORDINATOR_URL || 'https://tss1-test.liberdus.com';
Object.assign(CONFIG.BRIDGE.CHAINS, {
  SOURCE: {
    ...ACTIVE_SOURCE_NETWORK,
  },
  DESTINATION: {
    ...ACTIVE_DESTINATION_NETWORK,
  },
});
Object.assign(CONFIG.BRIDGE.CONTRACTS, {
  SOURCE: {
    ...ACTIVE_SOURCE_CONTRACT,
  },
  DESTINATION: {
    ...ACTIVE_DESTINATION_CONTRACT,
  },
});

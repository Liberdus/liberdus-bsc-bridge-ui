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

  NETWORK: {},

  CONTRACT: {},

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
 * CONFIG.BRIDGE.* is canonical at runtime.
 * CONFIG.NETWORK and CONFIG.CONTRACT are transitional source-side compatibility
 * aliases for existing wallet/provider/contract consumers.
 */
// Validation helpers
function profileError(profileName, message) {
  return new Error(`Invalid profile ${profileName}: ${message}`);
}

function requireObject(profileName, value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw profileError(profileName, `missing ${path}`);
  }
  return value;
}

function requireString(profileName, value, path) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw profileError(profileName, `missing ${path}`);
  return normalized;
}

function requireInteger(profileName, value, path, { min = 1 } = {}) {
  if (value == null || value === '') {
    throw profileError(profileName, `missing ${path}`);
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min) {
    throw profileError(profileName, `invalid ${path}`);
  }
  return normalized;
}

function normalizeFallbackRpcs(profileName, value, path) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw profileError(profileName, `invalid ${path}`);

  return value.map((entry, index) => requireString(profileName, entry, `${path}[${index}]`));
}

function normalizeNativeCurrency(profileName, value, path) {
  const currency = requireObject(profileName, value, path);
  return {
    name: requireString(profileName, currency.name, `${path}.name`),
    symbol: requireString(profileName, currency.symbol, `${path}.symbol`),
    decimals: requireInteger(profileName, currency.decimals, `${path}.decimals`, { min: 0 }),
  };
}

function normalizeNetwork(profileName, value, path) {
  const network = requireObject(profileName, value, path);
  return {
    CHAIN_ID: requireInteger(profileName, network.CHAIN_ID, `${path}.CHAIN_ID`),
    NAME: requireString(profileName, network.NAME, `${path}.NAME`),
    RPC_URL: requireString(profileName, network.RPC_URL, `${path}.RPC_URL`),
    FALLBACK_RPCS: normalizeFallbackRpcs(profileName, network.FALLBACK_RPCS, `${path}.FALLBACK_RPCS`),
    BLOCK_EXPLORER: requireString(profileName, network.BLOCK_EXPLORER, `${path}.BLOCK_EXPLORER`),
    NATIVE_CURRENCY: normalizeNativeCurrency(profileName, network.NATIVE_CURRENCY, `${path}.NATIVE_CURRENCY`),
  };
}

function normalizeContract(profileName, value, path, { requireAbiPath = false } = {}) {
  const contract = requireObject(profileName, value, path);
  return {
    ADDRESS: requireString(profileName, contract.ADDRESS, `${path}.ADDRESS`),
    ...(requireAbiPath
      ? { ABI_PATH: requireString(profileName, contract.ABI_PATH, `${path}.ABI_PATH`) }
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
  const normalizedProfile = requireObject(profileName, profile, profileName);
  return {
    SOURCE_NETWORK: normalizeNetwork(profileName, normalizedProfile.SOURCE_NETWORK, 'SOURCE_NETWORK'),
    SOURCE_CONTRACT: normalizeContract(profileName, normalizedProfile.SOURCE_CONTRACT, 'SOURCE_CONTRACT', { requireAbiPath: true }),
    DESTINATION_NETWORK: normalizeNetwork(profileName, normalizedProfile.DESTINATION_NETWORK, 'DESTINATION_NETWORK'),
    DESTINATION_CONTRACT: normalizeContract(profileName, normalizedProfile.DESTINATION_CONTRACT, 'DESTINATION_CONTRACT'),
    BRIDGE: normalizeBridge(profileName, normalizedProfile.BRIDGE),
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
 * CONFIG.NETWORK and CONFIG.CONTRACT are thin source-side compatibility aliases
 * that point at the canonical bridge config objects.
 * TODO: Migrate remaining CONFIG.NETWORK / CONFIG.CONTRACT consumers to CONFIG.BRIDGE.*.
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
CONFIG.NETWORK = CONFIG.BRIDGE.CHAINS.SOURCE;
CONFIG.CONTRACT = CONFIG.BRIDGE.CONTRACTS.SOURCE;

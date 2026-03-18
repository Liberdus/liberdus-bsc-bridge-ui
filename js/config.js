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

function assertProfile(profileName, profile) {
  const fail = (message) => {
    throw profileError(profileName, message);
  };
  const requireObject = (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`missing ${path}`);
    return value;
  };
  const requireString = (value, path) => {
    if (!String(value ?? '').trim()) fail(`missing ${path}`);
  };
  const requireInteger = (value, path, { min = 1 } = {}) => {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < min) fail(`invalid ${path}`);
  };
  const assertFallbackRpcs = (value, path) => {
    if (value != null && !Array.isArray(value)) fail(`invalid ${path}`);
    (value || []).forEach((entry, index) => requireString(entry, `${path}[${index}]`));
  };
  const assertCurrency = (value, path) => {
    const currency = requireObject(value, path);
    requireString(currency.name, `${path}.name`);
    requireString(currency.symbol, `${path}.symbol`);
    requireInteger(currency.decimals, `${path}.decimals`, { min: 0 });
  };
  const assertNetwork = (value, path) => {
    const network = requireObject(value, path);
    requireInteger(network.CHAIN_ID, `${path}.CHAIN_ID`);
    ['NAME', 'RPC_URL', 'BLOCK_EXPLORER'].forEach((field) => {
      requireString(network[field], `${path}.${field}`);
    });
    assertFallbackRpcs(network.FALLBACK_RPCS, `${path}.FALLBACK_RPCS`);
    assertCurrency(network.NATIVE_CURRENCY, `${path}.NATIVE_CURRENCY`);
  };
  const assertContract = (value, path, { requireAbiPath = false } = {}) => {
    const contract = requireObject(value, path);
    requireString(contract.ADDRESS, `${path}.ADDRESS`);
    if (requireAbiPath) requireString(contract.ABI_PATH, `${path}.ABI_PATH`);
  };

  requireObject(profile, profileName);
  assertNetwork(profile.SOURCE_NETWORK, 'SOURCE_NETWORK');
  assertContract(profile.SOURCE_CONTRACT, 'SOURCE_CONTRACT', { requireAbiPath: true });
  assertNetwork(profile.DESTINATION_NETWORK, 'DESTINATION_NETWORK');
  assertContract(profile.DESTINATION_CONTRACT, 'DESTINATION_CONTRACT');

  if (profile.BRIDGE != null) {
    const bridge = requireObject(profile.BRIDGE, 'BRIDGE');
    if (bridge.COORDINATOR_URL != null && typeof bridge.COORDINATOR_URL !== 'string') {
      fail('invalid BRIDGE.COORDINATOR_URL');
    }
  }
}

// Apply active profile
const RESOLVED_PROFILE = PROFILES[CONFIG.RUNTIME.PROFILE] ? CONFIG.RUNTIME.PROFILE : 'dev';
const ACTIVE_PROFILE = PROFILES[RESOLVED_PROFILE];

assertProfile(RESOLVED_PROFILE, ACTIVE_PROFILE);

const sourceNetwork = ACTIVE_PROFILE.SOURCE_NETWORK;
const sourceContract = ACTIVE_PROFILE.SOURCE_CONTRACT;
const destinationNetwork = ACTIVE_PROFILE.DESTINATION_NETWORK;
const destinationContract = ACTIVE_PROFILE.DESTINATION_CONTRACT;
const bridge = ACTIVE_PROFILE.BRIDGE || {};

/**
 * Project the active profile into the runtime CONFIG object.
 *
 * CONFIG.BRIDGE.* is the canonical runtime shape.
 */
CONFIG.RUNTIME.PROFILE = RESOLVED_PROFILE;
CONFIG.BRIDGE.COORDINATOR_URL = String(bridge.COORDINATOR_URL || '').trim() || 'https://tss1-test.liberdus.com';
Object.assign(CONFIG.BRIDGE.CHAINS, {
  SOURCE: {
    CHAIN_ID: Number(sourceNetwork.CHAIN_ID),
    NAME: String(sourceNetwork.NAME).trim(),
    RPC_URL: String(sourceNetwork.RPC_URL).trim(),
    FALLBACK_RPCS: (sourceNetwork.FALLBACK_RPCS || []).map((entry) => String(entry).trim()),
    BLOCK_EXPLORER: String(sourceNetwork.BLOCK_EXPLORER).trim(),
    NATIVE_CURRENCY: {
      name: String(sourceNetwork.NATIVE_CURRENCY.name).trim(),
      symbol: String(sourceNetwork.NATIVE_CURRENCY.symbol).trim(),
      decimals: Number(sourceNetwork.NATIVE_CURRENCY.decimals),
    },
  },
  DESTINATION: {
    CHAIN_ID: Number(destinationNetwork.CHAIN_ID),
    NAME: String(destinationNetwork.NAME).trim(),
    RPC_URL: String(destinationNetwork.RPC_URL).trim(),
    FALLBACK_RPCS: (destinationNetwork.FALLBACK_RPCS || []).map((entry) => String(entry).trim()),
    BLOCK_EXPLORER: String(destinationNetwork.BLOCK_EXPLORER).trim(),
    NATIVE_CURRENCY: {
      name: String(destinationNetwork.NATIVE_CURRENCY.name).trim(),
      symbol: String(destinationNetwork.NATIVE_CURRENCY.symbol).trim(),
      decimals: Number(destinationNetwork.NATIVE_CURRENCY.decimals),
    },
  },
});
Object.assign(CONFIG.BRIDGE.CONTRACTS, {
  SOURCE: {
    ADDRESS: String(sourceContract.ADDRESS).trim(),
    ABI_PATH: String(sourceContract.ABI_PATH).trim(),
  },
  DESTINATION: {
    ADDRESS: String(destinationContract.ADDRESS).trim(),
  },
});

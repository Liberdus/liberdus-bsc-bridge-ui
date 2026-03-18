const PROFILES = {
  dev: {
    SOURCE_NETWORK: {
      CHAIN_ID: 80002,
      NAME: 'Polygon Amoy',
      RPC_URL: 'https://polygon-amoy-bor-rpc.publicnode.com',
      FALLBACK_RPCS: [
        'https://polygon-amoy-bor-rpc.publicnode.com',
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
        'https://rpc.ankr.com/bsc_testnet',
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
      RPC_URL: 'https://rpc.ankr.com/polygon_amoy',
      FALLBACK_RPCS: [
        'https://polygon-amoy-bor-rpc.publicnode.com',
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
        'https://rpc.ankr.com/bsc_testnet',
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
    NAME: 'Liberdus Bridge UI',
    VERSION: '0.1.1',
  },

  RUNTIME: {
    PROFILE: 'dev',
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
 * Resolve the selected runtime profile into a normalized source/destination view.
 *
 * The new canonical shape is SOURCE_* / DESTINATION_*, but we still accept the
 * older NETWORK / CONTRACT and BRIDGE.{CHAINS,CONTRACTS}.BSC layout as a
 * fallback so existing profile data can be migrated without breaking the app.
 */
const RESOLVED_PROFILE = PROFILES[CONFIG.RUNTIME.PROFILE] ? CONFIG.RUNTIME.PROFILE : 'dev';
const ACTIVE_PROFILE = PROFILES[RESOLVED_PROFILE];
const ACTIVE_SOURCE_NETWORK = ACTIVE_PROFILE.SOURCE_NETWORK || ACTIVE_PROFILE.NETWORK || {};
const ACTIVE_SOURCE_CONTRACT = ACTIVE_PROFILE.SOURCE_CONTRACT || ACTIVE_PROFILE.CONTRACT || {};
const ACTIVE_DESTINATION_NETWORK =
  ACTIVE_PROFILE.DESTINATION_NETWORK ||
  ACTIVE_PROFILE.BRIDGE?.CHAINS?.DESTINATION ||
  ACTIVE_PROFILE.BRIDGE?.CHAINS?.BSC ||
  {};
const ACTIVE_DESTINATION_CONTRACT =
  ACTIVE_PROFILE.DESTINATION_CONTRACT ||
  ACTIVE_PROFILE.BRIDGE?.CONTRACTS?.DESTINATION ||
  ACTIVE_PROFILE.BRIDGE?.CONTRACTS?.BSC ||
  {};

/**
 * Project the active profile into the runtime CONFIG object.
 *
 * CONFIG.NETWORK and CONFIG.CONTRACT remain the source-chain aliases used by
 * the existing wallet, provider, and contract code. SOURCE / DESTINATION are
 * the canonical bridge aliases going forward, while POLYGON / BSC are mirrored
 * compatibility aliases for older consumers that have not been renamed yet.
 */
CONFIG.RUNTIME.PROFILE = RESOLVED_PROFILE;
Object.assign(CONFIG.NETWORK, ACTIVE_SOURCE_NETWORK);
Object.assign(CONFIG.CONTRACT, ACTIVE_SOURCE_CONTRACT);
CONFIG.BRIDGE.COORDINATOR_URL = ACTIVE_PROFILE.BRIDGE?.COORDINATOR_URL || 'https://tss1-test.liberdus.com';
Object.assign(CONFIG.BRIDGE.CHAINS, {
  SOURCE: {
    ...ACTIVE_SOURCE_NETWORK,
  },
  DESTINATION: {
    ...ACTIVE_DESTINATION_NETWORK,
  },
  POLYGON: {
    ...ACTIVE_SOURCE_NETWORK,
  },
  BSC: {
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
  POLYGON: {
    ...ACTIVE_SOURCE_CONTRACT,
  },
  BSC: {
    ...ACTIVE_DESTINATION_CONTRACT,
  },
});

const PROFILES = {
  dev: {
    NETWORK: {
      CHAIN_ID: 80002,
      NAME: 'Polygon Amoy',
      RPC_URL: 'https://rpc.ankr.com/polygon_amoy',
      FALLBACK_RPCS: [
        'https://polygon-amoy-bor-rpc.publicnode.com',
      ],
      BLOCK_EXPLORER: 'https://amoy.polygonscan.com',
      NATIVE_CURRENCY: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    CONTRACT: {
      ADDRESS: '0xaA2616CD3A3d3d63F8e1ac9c7d7BDc37f16709dA',
      ABI_PATH: './abi/vault.json',
    },
    BRIDGE: {
      COORDINATOR_URL: 'https://tss1-test.liberdus.com',
    },
  },
  prod: {
    // Replace these mirrored values with the deployed Polygon profile when available.
    NETWORK: {
      CHAIN_ID: 80002,
      NAME: 'Polygon Amoy',
      RPC_URL: 'https://rpc.ankr.com/polygon_amoy',
      FALLBACK_RPCS: [
        'https://polygon-amoy-bor-rpc.publicnode.com',
      ],
      BLOCK_EXPLORER: 'https://amoy.polygonscan.com',
      NATIVE_CURRENCY: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    },
    CONTRACT: {
      ADDRESS: '0xaA2616CD3A3d3d63F8e1ac9c7d7BDc37f16709dA',
      ABI_PATH: './abi/vault.json',
    },
    BRIDGE: {
      COORDINATOR_URL: 'https://tss1-test.liberdus.com',
    },
  },
};

const BSC_DESTINATION_CHAIN = {
  CHAIN_ID: 97,
  NAME: 'BSC Testnet',
  RPC_URL: 'https://bsc-testnet.publicnode.com',
  FALLBACK_RPCS: [
    'https://rpc.ankr.com/bsc_testnet',
  ],
  BLOCK_EXPLORER: 'https://testnet.bscscan.com',
  NATIVE_CURRENCY: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
};

const BSC_DESTINATION_CONTRACT = {
  ADDRESS: '0xf5A75e4bC827c9cC31BacD4c4d365107C698b465',
};

export const CONFIG = {
  APP: {
    NAME: 'Liberdus BSC Bridge UI',
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

const RESOLVED_PROFILE = PROFILES[CONFIG.RUNTIME.PROFILE] ? CONFIG.RUNTIME.PROFILE : 'dev';
const ACTIVE_PROFILE = PROFILES[RESOLVED_PROFILE];

CONFIG.RUNTIME.PROFILE = RESOLVED_PROFILE;
Object.assign(CONFIG.NETWORK, ACTIVE_PROFILE.NETWORK);
Object.assign(CONFIG.CONTRACT, ACTIVE_PROFILE.CONTRACT);
CONFIG.BRIDGE.COORDINATOR_URL = ACTIVE_PROFILE.BRIDGE?.COORDINATOR_URL || 'https://tss1-test.liberdus.com';
Object.assign(CONFIG.BRIDGE.CHAINS, {
  POLYGON: {
    ...CONFIG.NETWORK,
  },
  BSC: {
    ...BSC_DESTINATION_CHAIN,
  },
});
Object.assign(CONFIG.BRIDGE.CONTRACTS, {
  POLYGON: {
    ADDRESS: CONFIG.CONTRACT.ADDRESS,
  },
  BSC: {
    ...BSC_DESTINATION_CONTRACT,
  },
});

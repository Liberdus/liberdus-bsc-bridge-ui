export const CONFIG = {
  APP: {
    NAME: 'Liberdus BSC Bridge UI',
    VERSION: '0.1.1-amoy-sync',
  },

  TOKEN: {
    SYMBOL: 'LIB',
    DECIMALS: 18,
    ADDRESS: '0xD5409531c857AfD1b2fF6Cd527038e9981ef4863',
  },

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
    LOOKBACK_BLOCKS: 60000,
    COORDINATOR_URL: 'https://dev.liberdus.com:3030',
    CHAINS: {
      POLYGON: {
        CHAIN_ID: 80002,
        NAME: 'Polygon Amoy',
        RPC_URL: 'https://rpc.ankr.com/polygon_amoy',
        FALLBACK_RPCS: [
          'https://polygon-amoy-bor-rpc.publicnode.com',
        ],
        BLOCK_EXPLORER: 'https://amoy.polygonscan.com',
      },
      BSC: {
        CHAIN_ID: 97,
        NAME: 'BSC Testnet',
        RPC_URL: 'https://bsc-testnet.publicnode.com',
        FALLBACK_RPCS: [
          'https://rpc.ankr.com/bsc_testnet',
        ],
        BLOCK_EXPLORER: 'https://testnet.bscscan.com',
      },
    },
    CONTRACTS: {
      POLYGON: {
        ADDRESS: '0xaA2616CD3A3d3d63F8e1ac9c7d7BDc37f16709dA',
      },
      BSC: {
        ADDRESS: '0xf5A75e4bC827c9cC31BacD4c4d365107C698b465',
      },
    },
  },
};

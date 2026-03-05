export const CONFIG = {
  APP: {
    NAME: 'Liberdus BSC Bridge UI',
    VERSION: '0.1.0-skeleton',
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
    ADDRESS: '0x1469f20C91da50BF9Cc82d7cFB9A8D9EF1dEe86a',
    ABI_PATH: './abi/vault.json',
  },

  BRIDGE: {
    LOOKBACK_BLOCKS: 60000,
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
        ADDRESS: '0x1469f20C91da50BF9Cc82d7cFB9A8D9EF1dEe86a',
      },
      BSC: {
        ADDRESS: '0xA8Da42C5C915384e5d0938A0CbeC5720af736E27',
      },
    },
  },
};

export const CONFIG = {
  APP: {
    NAME: 'Liberdus BSC Bridge UI',
    VERSION: '0.1.0-skeleton',
  },

  NETWORK: {
    CHAIN_ID: 137,
    NAME: 'Polygon',
    RPC_URL: 'https://polygon-bor-rpc.publicnode.com',
    FALLBACK_RPCS: [
      'https://polygon.llamarpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon-rpc.com',
    ],
    BLOCK_EXPLORER: 'https://polygonscan.com',
    NATIVE_CURRENCY: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },

  CONTRACT: {
    ADDRESS: '0x1469f20C91da50BF9Cc82d7cFB9A8D9EF1dEe86a',
    ABI_PATH: './abi/vault.json',
  },
};

const PROFILES = {
  dev: {
    TOKEN: {
      SYMBOL: 'LIB',
      DECIMALS: 18,
      ADDRESS: '0xD5409531c857AfD1b2fF6Cd527038e9981ef4863',
    },
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
      ADDRESS: '0x45F54526165b0dC75E298A560F9a1B1cb06bb41E',
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
      ADDRESS: '0x48463C89254d001Bdc6B5d2af92d531E60FB4f72',
    },
    BRIDGE: {
      OBSERVER_URL: 'https://dev.liberdus.com:3030/observer',
    },
  },
  prod: {
    // Replace these placeholder deployment values with the final Polygon / BNB Chain values when available.
    TOKEN: {
      SYMBOL: 'LIB',
      DECIMALS: 18,
      ADDRESS: '0x693ed886545970F0a3ADf8C59af5cCdb6dDF0a76',
    },
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
      ADDRESS: '0x45F54526165b0dC75E298A560F9a1B1cb06bb41E',
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
      ADDRESS: '0x48463C89254d001Bdc6B5d2af92d531E60FB4f72',
    },
    BRIDGE: {
      OBSERVER_URL: 'https://dev.liberdus.com:3030/observer',
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
  BRIDGE: {
    LOOKBACK_BLOCKS: 60000,
    OBSERVER_URL: '',
    CHAINS: {},
    CONTRACTS: {},
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, path, profileName) {
  assert(typeof value === 'string' && value.trim() !== '', `Invalid profile ${profileName}: missing ${path}`);
}

function assertInteger(value, path, profileName) {
  assert(Number.isInteger(value) && value >= 0, `Invalid profile ${profileName}: invalid ${path}`);
}

function assertToken(profileName, token) {
  assert(token && typeof token === 'object' && !Array.isArray(token), `Invalid profile ${profileName}: missing TOKEN`);
  assertString(token.SYMBOL, 'TOKEN.SYMBOL', profileName);
  assertInteger(token.DECIMALS, 'TOKEN.DECIMALS', profileName);
  assertString(token.ADDRESS, 'TOKEN.ADDRESS', profileName);
}

function assertNetwork(profileName, kind, network) {
  assert(network && typeof network === 'object' && !Array.isArray(network), `Invalid profile ${profileName}: missing ${kind}`);
  assertInteger(network.CHAIN_ID, `${kind}.CHAIN_ID`, profileName);
  assertString(network.NAME, `${kind}.NAME`, profileName);
  assertString(network.RPC_URL, `${kind}.RPC_URL`, profileName);
  assert(Array.isArray(network.FALLBACK_RPCS), `Invalid profile ${profileName}: invalid ${kind}.FALLBACK_RPCS`);
  network.FALLBACK_RPCS.forEach((rpc, index) => assertString(rpc, `${kind}.FALLBACK_RPCS[${index}]`, profileName));
  assertString(network.BLOCK_EXPLORER, `${kind}.BLOCK_EXPLORER`, profileName);
  assert(network.NATIVE_CURRENCY && typeof network.NATIVE_CURRENCY === 'object', `Invalid profile ${profileName}: missing ${kind}.NATIVE_CURRENCY`);
  assertString(network.NATIVE_CURRENCY.name, `${kind}.NATIVE_CURRENCY.name`, profileName);
  assertString(network.NATIVE_CURRENCY.symbol, `${kind}.NATIVE_CURRENCY.symbol`, profileName);
  assertInteger(network.NATIVE_CURRENCY.decimals, `${kind}.NATIVE_CURRENCY.decimals`, profileName);
}

function assertContract(profileName, kind, contract) {
  assert(contract && typeof contract === 'object' && !Array.isArray(contract), `Invalid profile ${profileName}: missing ${kind}`);
  assertString(contract.ADDRESS, `${kind}.ADDRESS`, profileName);
  if (kind === 'SOURCE_CONTRACT') assertString(contract.ABI_PATH, `${kind}.ABI_PATH`, profileName);
}

function assertProfile(profileName, profile) {
  assert(profile && typeof profile === 'object' && !Array.isArray(profile), `Invalid profile ${profileName}: missing profile`);
  assertToken(profileName, profile.TOKEN);
  assertNetwork(profileName, 'SOURCE_NETWORK', profile.SOURCE_NETWORK);
  assertContract(profileName, 'SOURCE_CONTRACT', profile.SOURCE_CONTRACT);
  assertNetwork(profileName, 'DESTINATION_NETWORK', profile.DESTINATION_NETWORK);
  assertContract(profileName, 'DESTINATION_CONTRACT', profile.DESTINATION_CONTRACT);
  assert(profile.BRIDGE && typeof profile.BRIDGE === 'object' && !Array.isArray(profile.BRIDGE), `Invalid profile ${profileName}: missing BRIDGE`);
  assertString(profile.BRIDGE.OBSERVER_URL, 'BRIDGE.OBSERVER_URL', profileName);
}

const profileName = CONFIG.RUNTIME.PROFILE;
const profile = PROFILES[profileName];

// create alert if error is thrown during assert
try {
  assert(profile, `Unknown runtime profile: ${profileName}`);
  assertProfile(profileName, profile);
} catch (error) {
  alert(`Error: ${error.message}. Please check your profile configuration.`);
  throw error;
}

CONFIG.TOKEN = profile.TOKEN;
CONFIG.BRIDGE.OBSERVER_URL = profile.BRIDGE.OBSERVER_URL;
CONFIG.BRIDGE.CHAINS = {
  SOURCE: profile.SOURCE_NETWORK,
  DESTINATION: profile.DESTINATION_NETWORK,
};
CONFIG.BRIDGE.CONTRACTS = {
  SOURCE: profile.SOURCE_CONTRACT,
  DESTINATION: profile.DESTINATION_CONTRACT,
};

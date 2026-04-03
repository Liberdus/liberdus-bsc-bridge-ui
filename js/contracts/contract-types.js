import { CONFIG } from '../config.js';

export const CONTRACT_KEYS = Object.freeze(['source', 'destination']);

export const CONTRACT_METADATA = Object.freeze({
  source: Object.freeze({
    key: 'source',
    shortLabel: 'Source',
    label: 'Source Vault',
    contractLabel: 'Vault',
    networkConfigKey: 'SOURCE',
    contractConfigKey: 'SOURCE',
    notifyInfoReadErrors: true,
  }),
  destination: Object.freeze({
    key: 'destination',
    shortLabel: 'Destination',
    label: 'Destination Liberdus',
    contractLabel: 'Liberdus',
    networkConfigKey: 'DESTINATION',
    contractConfigKey: 'DESTINATION',
    notifyInfoReadErrors: false,
  }),
});

export function normalizeContractKey(key) {
  return String(key || 'source').trim().toLowerCase() === 'destination' ? 'destination' : 'source';
}

export function getContractMetadata(key) {
  return CONTRACT_METADATA[normalizeContractKey(key)];
}

export function getContractConfig(key, config = CONFIG) {
  const meta = getContractMetadata(key);
  return config?.BRIDGE?.CONTRACTS?.[meta.contractConfigKey] || null;
}

export function getNetworkConfig(key, config = CONFIG) {
  const meta = getContractMetadata(key);
  return config?.BRIDGE?.CHAINS?.[meta.networkConfigKey] || null;
}

export function getContractLabel(key) {
  return getContractMetadata(key).label;
}

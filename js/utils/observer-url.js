import { CONFIG } from '../config.js';

export function normalizeObserverUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.replace(/\/$/, '');
}

export function getObserverBaseUrl(config = CONFIG) {
  return normalizeObserverUrl(config?.BRIDGE?.OBSERVER_URL);
}

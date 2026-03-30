import { CONFIG } from '../config.js';

export function normalizeCoordinatorUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.replace(/\/$/, '');
}

export function getCoordinatorBaseUrl(config = CONFIG) {
  return normalizeCoordinatorUrl(config?.BRIDGE?.COORDINATOR_URL);
}

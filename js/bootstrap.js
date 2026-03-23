import { initializeVersionService } from './version-service.js';
import { assert } from './utils/assert.js';

const bootstrapLoading = document.getElementById('bootstrap-loading');
const bootstrapTitle = document.querySelector('[data-bootstrap-title]');

assert(bootstrapLoading, '#bootstrap-loading is required');
assert(bootstrapTitle, '[data-bootstrap-title] is required');

function setBootstrapLoadingTitle(title) {
  bootstrapLoading.classList.remove('hidden');
  bootstrapTitle.textContent = title;
}

async function start() {
  setBootstrapLoadingTitle('Loading latest version.');

  if (await initializeVersionService()) return;

  setBootstrapLoadingTitle('Loading bridge UI.');

  const { startApp } = await import('./app.js');
  await startApp();
  bootstrapLoading.classList.add('hidden');
}

start();

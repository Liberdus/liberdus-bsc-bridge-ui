import { initializeVersionService } from './version-service.js';

const bootstrapLoading = document.getElementById('bootstrap-loading');
const bootstrapTitle = document.querySelector('[data-bootstrap-title]');

function setBootstrapLoadingTitle(title) {
  if (!bootstrapLoading || !bootstrapTitle) return;
  bootstrapLoading.classList.remove('hidden');
  bootstrapTitle.textContent = title;
}

async function start() {
  setBootstrapLoadingTitle('Loading latest version.');

  if (await initializeVersionService()) return;

  try {
    setBootstrapLoadingTitle('Loading bridge UI.');

    const { startApp } = await import('./app.js');
    await startApp();

    bootstrapLoading?.classList.add('hidden');
  } catch (error) {
    console.error('Bootstrap failed', error);
    setBootstrapLoadingTitle('Failed to load bridge. Refresh to retry.');
  }
}

start();

import { initializeVersionService } from './version-service.js';

async function start() {
  if (await initializeVersionService()) return;

  const { startApp } = await import('./app.js');
  await startApp();
}

start();

import { versionService } from './version-service.js';

async function bootstrap() {
  if (await versionService.initialize()) return;

  const { startApp } = await import('./app.js');
  await startApp();
}

bootstrap().catch(() => {});

import { buildApp } from './app.js';

const app = await buildApp();

async function shutdown(signal) {
  console.log(`\n server ${signal} recived, shutting down ...`);

  try {
    await app.close();

    console.log('server shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error(`server shutdown error: ${err}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: app.config.PORT, host: app.config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createAiService } from './providers/provider-factory.js';

function loadServerEnv() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.GMS_SERVER_ENV_PATH,
    path.resolve(currentDir, '../.env'),
    path.resolve(process.cwd(), '.env'),
  ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  for (const candidate of candidates) {
    const result = dotenv.config({ path: candidate, override: false });
    if (result.error && result.error.code !== 'ENOENT') {
      console.warn(`Could not read environment file at ${candidate}. Continuing with process environment values.`);
    }
  }
}

loadServerEnv();

const port = Number.parseInt(process.env.PORT || '8000', 10);
const app = createApp({ aiService: createAiService() });
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`GMS Suite AI API listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

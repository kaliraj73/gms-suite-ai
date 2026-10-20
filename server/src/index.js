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
      console.warn('Could not read a backend environment file. Continuing with process environment values.');
    }
  }
}

loadServerEnv();

const requestedPort = Number.parseInt(process.env.PORT || '8000', 10);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error('PORT must be a valid TCP port between 0 and 65535.');
}
const app = createApp({ aiService: createAiService() });
const server = app.listen(requestedPort, '0.0.0.0', () => {
  const address = server.address();
  console.log(`GMS Suite AI API listening on port ${address.port}`);
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${requestedPort} is already in use. Stop the process using it or choose another PORT, e.g. PORT=8002 npm start.`);
    process.exitCode = 1;
  } else {
    console.error(`Backend server failed to start (${error.code || 'unknown error'}).`);
    process.exitCode = 1;
  }
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

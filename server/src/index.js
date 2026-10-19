import 'dotenv/config';
import { createApp } from './app.js';
import { createAiService } from './providers/provider-factory.js';

const port = Number.parseInt(process.env.PORT || '8000', 10);
const app = createApp({ aiService: createAiService() });
const server = app.listen(port, '0.0.0.0', () => console.log(`GMS Suite AI API listening on port ${port}`));

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

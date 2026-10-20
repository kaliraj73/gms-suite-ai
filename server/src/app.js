import express from 'express';
import helmet from 'helmet';
import { apiRateLimit } from './middleware/rateLimit.js';
import { validatePrompt } from './middleware/validate.js';

export function createApp({ aiService }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '20kb', strict: true }));

  app.get('/api/ai/health', (_req, res) => res.json(aiService.health()));

  app.get('/api/ai/models', async (req, res) => {
    try { res.json(await aiService.listModels({ refresh: req.query.refresh === '1' })); }
    catch { res.status(502).json({ error: 'Could not load models from configured providers.' }); }
  });

  app.post('/api/ai', apiRateLimit, validatePrompt, async (req, res) => {
    try { res.json(await aiService.generate(req.aiInput)); }
    catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 502;
      res.status(status).json({ error: error?.message || 'AI request failed.' });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON body.' });
    return res.status(500).json({ error: 'Unexpected server error.' });
  });
  return app;
}

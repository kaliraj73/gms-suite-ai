import express from 'express';
import helmet from 'helmet';
import { apiRateLimit } from './middleware/rateLimit.js';
import { validatePrompt } from './middleware/validate.js';

export function createApp({ aiService, deepAgentsService = { enabled: false, generate: async () => { const error = new Error('Deep Agents is disabled.'); error.status = 404; throw error; } } }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '20kb', strict: true }));

  app.get('/api/ai/health', (_req, res) => res.json({ ...aiService.health(), deepAgents: { enabled: Boolean(deepAgentsService.enabled) } }));

  app.get('/api/ai/models', async (_req, res) => {
    try { res.json(await aiService.listModels()); }
    catch { res.status(502).json({ error: 'Could not load models from configured providers.' }); }
  });

  app.post('/api/ai', apiRateLimit, validatePrompt, async (req, res) => {
    try { res.json(await aiService.generate(req.aiInput)); }
    catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 502;
      res.status(status).json({ error: error?.message || 'AI request failed.' });
    }
  });

  app.post('/api/ai/agent', apiRateLimit, validatePrompt, async (req, res) => {
    if (!deepAgentsService.enabled) return res.status(404).json({ error: 'Deep Agents is disabled. Set ENABLE_DEEP_AGENTS=true to enable it.' });
    try { res.json(await deepAgentsService.generate(req.aiInput)); }
    catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 502;
      res.status(status).json({ error: error?.message || 'Deep Agents request failed.' });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON body.' });
    return res.status(500).json({ error: 'Unexpected server error.' });
  });
  return app;
}

export function validatePrompt(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const maxLength = Number.parseInt(process.env.MAX_PROMPT_LENGTH || '12000', 10);
  if (!prompt) return res.status(400).json({ error: 'A non-empty prompt is required.' });
  if (prompt.length > maxLength) return res.status(413).json({ error: `Prompt exceeds the ${maxLength} character limit.` });
  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 256)) {
    return res.status(400).json({ error: 'Model must be a string of at most 256 characters.' });
  }
  req.aiInput = { prompt, model: body.model || '' };
  return next();
}
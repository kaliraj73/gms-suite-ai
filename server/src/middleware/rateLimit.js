import rateLimit from 'express-rate-limit';

export const apiRateLimit = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  limit: Number.parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait and try again.' },
});
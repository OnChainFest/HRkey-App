/**
 * Simple in-memory rate limiter (fixed window).
 *
 * Configurable via env:
 * - RATE_LIMIT_ENABLED (default "true")
 * - RATE_LIMIT_WINDOW_MS (default 60000)
 * - RATE_LIMIT_MAX_DEFAULT (default 120)
 * - RATE_LIMIT_ALLOWLIST (comma-separated IPs)
 */

const DEFAULT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const DEFAULT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX_DEFAULT || '120', 10);

const buckets = new Map();

const getAllowlist = () => {
  const raw = process.env.RATE_LIMIT_ALLOWLIST || '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || 'unknown';
};

const buildKey = (req, keyPrefix) => {
  const ip = getClientIp(req);
  const prefix = keyPrefix || 'default';
  return `${prefix}:${req.path}:${ip}`;
};

export const resetRateLimiter = () => {
  buckets.clear();
};

export function createRateLimiter(options = {}) {
  const enabled = (process.env.RATE_LIMIT_ENABLED || 'true').toLowerCase() !== 'false';
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const max = options.max ?? DEFAULT_MAX;
  const keyPrefix = options.keyPrefix ?? 'default';

  return (req, res, next) => {
    if (!enabled) return next();

    const allowlist = getAllowlist();
    const clientIp = getClientIp(req);
    if (allowlist.includes(clientIp)) return next();

    const key = buildKey(req, keyPrefix);
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now - existing.start >= windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return next();
    }

    if (existing.count >= max) {
      return res.status(429).json({
        ok: false,
        error: 'RATE_LIMITED'
      });
    }

    existing.count += 1;
    return next();
  };
}

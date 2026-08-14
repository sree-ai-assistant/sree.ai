import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  lastSubmit: number;
  timestamps: number[];
}

// In-memory sliding window cache for feature requests
const rateLimitCache = new Map<string, RateLimitRecord>();

const COOLDOWN_MS = 30 * 1000; // 30 seconds
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5; // 5 requests per hour

// Cleanup expired cache keys every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitCache.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
    if (record.timestamps.length === 0 && now - record.lastSubmit > WINDOW_MS) {
      rateLimitCache.delete(key);
    }
  }
}, 15 * 60 * 1000).unref();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || req.ip || '0.0.0.0';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.trim() || req.ip || '0.0.0.0';
  }
  return (req.headers['x-real-ip'] as string) || req.ip || '0.0.0.0';
}

/**
 * Rate limiter middleware specifically for feature request submissions
 */
export const featureRequestRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const anonId = (req as any).anonId || (req as any).anonymousUser?.anon_id;
  const ip = getClientIp(req);

  // Key identity: user_id > anon_id > client IP
  const identityKey = user?.id ? `user:${user.id}` : anonId ? `anon:${anonId}` : `ip:${ip}`;
  const now = Date.now();

  let record = rateLimitCache.get(identityKey);
  if (!record) {
    record = { lastSubmit: 0, timestamps: [] };
    rateLimitCache.set(identityKey, record);
  }

  // 1. Check cooldown (30s)
  const timeSinceLast = now - record.lastSubmit;
  if (timeSinceLast < COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLast) / 1000);
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_COOLDOWN',
      message: `Please wait ${remainingSeconds}s before submitting another feature request.`,
      retryAfterSeconds: remainingSeconds,
    });
  }

  // 2. Check 1-hour sliding window quota
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
  if (record.timestamps.length >= MAX_PER_WINDOW) {
    const oldest = record.timestamps[0] ?? now;
    const resetSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    const minutes = Math.ceil(resetSeconds / 60);
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Hourly feature request limit reached (${MAX_PER_WINDOW} requests/hr). Please try again in ~${minutes} minute(s).`,
      retryAfterSeconds: resetSeconds,
    });
  }

  // Attach recorder to response so we only count successful requests
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      record.lastSubmit = Date.now();
      record.timestamps.push(Date.now());
    }
  });

  next();
};

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

// In-memory sliding window cache for screenshot uploads
const screenshotRateLimitCache = new Map<string, RateLimitRecord>();

const SCREENSHOT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown (1 upload / 5 min)
const SCREENSHOT_HOUR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SCREENSHOT_MAX_PER_HOUR = 10; // 10 uploads per hour
const SCREENSHOT_DAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const SCREENSHOT_MAX_PER_DAY = 10; // 10 uploads per day

// Periodic cleanup of expired screenshot cache keys
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of screenshotRateLimitCache.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < SCREENSHOT_DAY_WINDOW_MS);
    if (record.timestamps.length === 0 && now - record.lastSubmit > SCREENSHOT_DAY_WINDOW_MS) {
      screenshotRateLimitCache.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

/**
 * Rate limiter middleware for bug report screenshot uploads:
 * - 1 upload every 5 minutes (cooldown)
 * - Max 10 uploads per hour
 * - Max 10 uploads per day
 */
export const featureRequestScreenshotRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const anonId = (req as any).anonId || (req as any).anonymousUser?.anon_id;
  const ip = getClientIp(req);

  // Key identity: user_id > anon_id > client IP
  const identityKey = user?.id ? `ss_user:${user.id}` : anonId ? `ss_anon:${anonId}` : `ss_ip:${ip}`;
  const now = Date.now();

  let record = screenshotRateLimitCache.get(identityKey);
  if (!record) {
    record = { lastSubmit: 0, timestamps: [] };
    screenshotRateLimitCache.set(identityKey, record);
  }

  // 1. Check 5-minute cooldown (1 upload / 5 min)
  const timeSinceLast = now - record.lastSubmit;
  if (timeSinceLast < SCREENSHOT_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((SCREENSHOT_COOLDOWN_MS - timeSinceLast) / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    return res.status(429).json({
      success: false,
      code: 'SCREENSHOT_RATE_LIMIT_COOLDOWN',
      message: `Screenshot upload cooldown: Please wait ${timeStr} before uploading another screenshot (Limit: 1 upload per 5 minutes).`,
      retryAfterSeconds: remainingSeconds,
    });
  }

  // 2. Check 1-hour window quota (10 / hour)
  const hourTimestamps = record.timestamps.filter((t) => now - t < SCREENSHOT_HOUR_WINDOW_MS);
  if (hourTimestamps.length >= SCREENSHOT_MAX_PER_HOUR) {
    const oldest = hourTimestamps[0] ?? now;
    const resetSeconds = Math.ceil((oldest + SCREENSHOT_HOUR_WINDOW_MS - now) / 1000);
    const minutes = Math.ceil(resetSeconds / 60);

    return res.status(429).json({
      success: false,
      code: 'SCREENSHOT_HOURLY_LIMIT_EXCEEDED',
      message: `Hourly screenshot limit reached (${SCREENSHOT_MAX_PER_HOUR} uploads/hr). Please try again in ~${minutes} minute(s).`,
      retryAfterSeconds: resetSeconds,
    });
  }

  // 3. Check 24-hour day window quota (10 / day)
  record.timestamps = record.timestamps.filter((t) => now - t < SCREENSHOT_DAY_WINDOW_MS);
  if (record.timestamps.length >= SCREENSHOT_MAX_PER_DAY) {
    const oldest = record.timestamps[0] ?? now;
    const resetSeconds = Math.ceil((oldest + SCREENSHOT_DAY_WINDOW_MS - now) / 1000);
    const hours = Math.ceil(resetSeconds / 3600);

    return res.status(429).json({
      success: false,
      code: 'SCREENSHOT_DAILY_LIMIT_EXCEEDED',
      message: `Daily screenshot upload limit reached (${SCREENSHOT_MAX_PER_DAY} uploads/day). Please try again in ~${hours} hour(s).`,
      retryAfterSeconds: resetSeconds,
    });
  }

  // Attach recorder to response so we only count successful uploads
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      record.lastSubmit = Date.now();
      record.timestamps.push(Date.now());
    }
  });

  next();
};


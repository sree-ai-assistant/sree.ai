import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

// In-memory sliding window caches (separated for validate vs save)
const validateRateLimitCache = new Map<string, RateLimitRecord>();
const saveRateLimitCache = new Map<string, RateLimitRecord>();

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Production-ready thresholds (protects external APIs without blocking real humans)
export const API_KEY_RATE_LIMITS = {
  VALIDATE: {
    PER_MINUTE: 15,
    PER_HOUR: 60,
    PER_DAY: 150,
  },
  SAVE: {
    PER_MINUTE: 10,
    PER_HOUR: 30,
    PER_DAY: 80,
  },
};

// Periodic garbage collection every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  cleanCache(validateRateLimitCache, now);
  cleanCache(saveRateLimitCache, now);
}, 10 * 60 * 1000).unref();

function cleanCache(cache: Map<string, RateLimitRecord>, now: number) {
  for (const [key, record] of cache.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < ONE_DAY_MS);
    if (record.timestamps.length === 0) {
      cache.delete(key);
    }
  }
}

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

function checkSlidingWindow(
  cache: Map<string, RateLimitRecord>,
  identityKey: string,
  limits: { PER_MINUTE: number; PER_HOUR: number; PER_DAY: number },
  now: number
): { allowed: boolean; retryAfterSeconds: number; reason?: string; remainingMinute: number } {
  let record = cache.get(identityKey);
  if (!record) {
    record = { timestamps: [] };
    cache.set(identityKey, record);
  }

  // Filter timestamps to 24h window
  record.timestamps = record.timestamps.filter((t) => now - t < ONE_DAY_MS);

  // Check 1-minute window
  const inMinute = record.timestamps.filter((t) => now - t < ONE_MINUTE_MS);
  if (inMinute.length >= limits.PER_MINUTE) {
    const oldest = inMinute[0]!;
    const retryAfter = Math.max(1, Math.ceil((oldest + ONE_MINUTE_MS - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: `minute limit (${limits.PER_MINUTE}/min)`,
      remainingMinute: 0,
    };
  }

  // Check 1-hour window
  const inHour = record.timestamps.filter((t) => now - t < ONE_HOUR_MS);
  if (inHour.length >= limits.PER_HOUR) {
    const oldest = inHour[0]!;
    const retryAfter = Math.max(1, Math.ceil((oldest + ONE_HOUR_MS - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: `hourly limit (${limits.PER_HOUR}/hour)`,
      remainingMinute: 0,
    };
  }

  // Check 24-hour window
  if (record.timestamps.length >= limits.PER_DAY) {
    const oldest = record.timestamps[0]!;
    const retryAfter = Math.max(1, Math.ceil((oldest + ONE_DAY_MS - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: `daily limit (${limits.PER_DAY}/day)`,
      remainingMinute: 0,
    };
  }

  // Record this attempt
  record.timestamps.push(now);

  const remainingMinute = Math.max(0, limits.PER_MINUTE - (inMinute.length + 1));
  return { allowed: true, retryAfterSeconds: 0, remainingMinute };
}

/**
 * Rate limiter middleware for API Key Validation (/settings/keys/validate)
 * Protects external provider APIs (Google, Groq, Nvidia, Deepgram) from being abused or spammed.
 */
export const apiKeyValidateRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  const ip = getClientIp(req);
  const identityKey = userId ? `user:${userId}` : `ip:${ip}`;
  const now = Date.now();

  const check = checkSlidingWindow(
    validateRateLimitCache,
    identityKey,
    API_KEY_RATE_LIMITS.VALIDATE,
    now
  );

  if (!res.headersSent) {
    res.setHeader('X-RateLimit-Limit', API_KEY_RATE_LIMITS.VALIDATE.PER_MINUTE);
    res.setHeader('X-RateLimit-Remaining', check.remainingMinute);
  }

  if (!check.allowed) {
    if (!res.headersSent) {
      res.setHeader('Retry-After', check.retryAfterSeconds);
    }
    return res.status(429).json({
      valid: false,
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many API key validation attempts. Please wait ${check.retryAfterSeconds} second${check.retryAfterSeconds !== 1 ? 's' : ''} before trying again.`,
      retryAfter: check.retryAfterSeconds,
    });
  }

  next();
};

/**
 * Rate limiter middleware for API Key Saving (/settings/keys & /save-api-key)
 * Protects database storage from write flooding while allowing normal onboarding batch saves.
 */
export const apiKeySaveRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  const ip = getClientIp(req);
  const identityKey = userId ? `user:${userId}` : `ip:${ip}`;
  const now = Date.now();

  const check = checkSlidingWindow(
    saveRateLimitCache,
    identityKey,
    API_KEY_RATE_LIMITS.SAVE,
    now
  );

  if (!res.headersSent) {
    res.setHeader('X-RateLimit-Limit', API_KEY_RATE_LIMITS.SAVE.PER_MINUTE);
    res.setHeader('X-RateLimit-Remaining', check.remainingMinute);
  }

  if (!check.allowed) {
    if (!res.headersSent) {
      res.setHeader('Retry-After', check.retryAfterSeconds);
    }
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many API key save attempts. Please wait ${check.retryAfterSeconds} second${check.retryAfterSeconds !== 1 ? 's' : ''} before trying again.`,
      retryAfter: check.retryAfterSeconds,
    });
  }

  next();
};

// Helper to reset cache for testing
export function _resetApiKeyRateLimitCaches() {
  validateRateLimitCache.clear();
  saveRateLimitCache.clear();
}

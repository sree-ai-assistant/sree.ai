import type { Request, Response, NextFunction } from 'express';
import { checkAndIncrementUsage, checkRateLimit, type RateLimitIdentity } from '../services/usage.service';
import { canAccessFeature, type SubscriptionRecord } from '../services/subscription.service';
import type { ToolType, PlanConfig } from '../config/plans';

import { ApiKeyService } from '../services/apiKey.service';

import { resolveProvider } from '../utils/providerResolver';

/**
 * Simple in-memory TTL cache for charged voice session IDs to prevent multiple charges
 * for consecutive sentence requests within a single voice response session.
 */
class SessionCache {
  private cache = new Map<string, number>();
  private intervalId: ReturnType<typeof setInterval>;

  constructor() {
    this.intervalId = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.cache.entries()) {
        if (now - timestamp > 5 * 60 * 1000) {
          this.cache.delete(key);
        }
      }
    }, 60 * 1000);
    if (this.intervalId && typeof this.intervalId === 'object' && 'unref' in this.intervalId) {
      (this.intervalId as any).unref();
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  add(key: string) {
    this.cache.set(key, Date.now());
  }

  clear() {
    this.cache.clear();
  }
}

export const voiceSessionCache = new SessionCache();

/**
 * Rate Limit Middleware
 * 
 * Intercepts AI requests, checks against tiered limits (minute/daily/monthly),
 * and returns structured 429 responses when exceeded.
 */
export const rateLimitMiddleware = (toolType: ToolType, provider?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Determine the actual tool type based on attachments or mode parameters
      let actualToolType = toolType;
      if (toolType === 'chat') {
        if (req.body?.mode === 'voice' || req.body?.isVoice === true) {
          actualToolType = 'voice';
        } else if (req.body?.attachments && Array.isArray(req.body.attachments)) {
          const hasAudio = req.body.attachments.some((a: any) => a.type === 'audio');
          if (hasAudio) {
            actualToolType = 'voice';
          }
        }
      }

      // 1. Resolve identity and tier from flexAuthMiddleware/anonymousIdentity
      const user = (req as any).user;
      const anonId = (req as any).anonId;
      const tier = (req as any).userTier || 'anonymous';
      const isAbuseStrictMode = !!(req as any).abuseStrictMode;
      
      let isByok = false;
      let apiKey = null;
      let detectedProvider = provider;

      // If provider is not passed, try to detect from model in request
      if (!detectedProvider) {
        const model = req.body?.model || req.query?.model || (req as any).model;
        if (model) {
          detectedProvider = await resolveProvider(model);
        }
      }

      // Detect BYOK if provider is specified or detected
      if (detectedProvider && detectedProvider !== 'unknown') {
        const result = await ApiKeyService.getUserApiKey(user?.id, detectedProvider);
        apiKey = result.key;
        isByok = result.source === 'user';
        
        // Attach to request for route handler use
        (req as any).apiKey = apiKey;
        (req as any).isByok = isByok;
        (req as any).provider = detectedProvider;
      }

      // For voice requests using Deepgram, check if the user has a Deepgram BYOK key
      if (actualToolType === 'voice') {
        const result = await ApiKeyService.getUserApiKey(user?.id, 'deepgram');
        // If they provided a custom deepgram key, we treat it as BYOK for quota purposes.
        // Even if they also use nvidia, deepgram is the primary cost for voice in this context.
        if (result.source === 'user') {
          isByok = true;
        }
      }

      // Check if this is a consecutive request in an already-charged voice session
      const voiceSessionId = req.body?.voiceSessionId || req.query?.voiceSessionId;
      let result;
      let voiceSessionCharged = false;

      if (voiceSessionId && voiceSessionCache.has(voiceSessionId as string)) {
        voiceSessionCharged = true;
      }

      if (voiceSessionCharged) {
        // Skip usage check and charge, allow the request for free
        result = { allowed: true };
      } else {
        const identity: RateLimitIdentity = user
          ? { type: 'authenticated', userId: user.id, tier }
          : { type: 'anonymous', anonId: anonId || 'unknown', tier: 'anonymous' };

        // 2. Atomic Check and Increment OR Check Only
        if (actualToolType === 'chat') {
          // For chat requests, only perform a read-only check.
          // Credits will be consumed in the route handler only upon successful AI response.
          result = await checkRateLimit(identity, actualToolType);
          if (!result.allowed) {
            const limitName = result.reason === 'minute' ? 'per minute' : result.reason === 'daily' ? 'daily' : 'monthly';
            result.message = `Chat ${limitName} limit reached (${result.used}/${result.limit}). Please upgrade or try again later.`;
          }
        } else {
          // We increment at the start of the request to prevent race conditions for other tools.
          result = await checkAndIncrementUsage(identity, actualToolType, isByok);
        }

        // If the request was allowed, register the session as charged
        if (voiceSessionId && result.allowed && actualToolType !== 'chat') {
          voiceSessionCache.add(voiceSessionId as string);
        }
      }

      // 2b. Abuse strict mode: halve the effective limit (ABUSE-03)
      // When abuse detection flags severity 3, limits are reduced by 50%
      if (isAbuseStrictMode && result.allowed && result.limit) {
        const strictLimit = Math.floor(result.limit / 2);
        if ((result.used ?? 0) > strictLimit) {
          return res.status(429).json({
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            reason: 'abuse_strict',
            tool: actualToolType,
            limit: strictLimit,
            current: result.used,
            resetsIn: result.resetsIn,
            message: 'Usage restricted due to unusual activity. Limits have been temporarily reduced.',
            upgradeUrl: '/pricing'
          });
        }
      }

      if (!result.allowed) {
        // Return structured 429 Error
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          reason: result.reason || 'daily',
          tool: actualToolType,
          limit: result.limit,
          current: result.used,
          resetsIn: result.resetsIn,
          message: result.message || 'Usage limit exceeded. Please try again later or upgrade your plan.',
          upgradeUrl: '/pricing'
        });
      }

      // 3. Attach usage info to request
      (req as any).rateLimitInfo = result;
      (req as any).toolType = actualToolType;

      next();
    } catch (error) {
      console.error('[RateLimitMiddleware] Unexpected error:', error);
      next(error);
    }
  };
};

/**
 * Feature Gate Middleware
 * 
 * Blocks requests when the user's tier doesn't include the feature.
 */
export const featureGateMiddleware = (feature: keyof PlanConfig['features']) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const tier = (req as any).userTier || 'anonymous';
    const hasAccess = canAccessFeature(tier, feature);

    if (!hasAccess) {
      const isAuth = !!(req as any).user;
      
      // If feature is locked and user isn't logged in, suggest logging in first
      if (!isAuth && tier === 'anonymous') {
         return res.status(401).json({
           success: false,
           code: 'AUTH_REQUIRED',
           message: 'This feature requires a free account. Please sign in or sign up.'
         });
      }

      return res.status(403).json({
        success: false,
        code: 'FEATURE_LOCKED',
        message: `The ${feature.replace(/([A-Z])/g, ' $1').toLowerCase()} feature is not available on your current plan.`,
        upgradeUrl: '/pricing'
      });
    }

    next();
  };
};

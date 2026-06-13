/**
 * Abuse Detection Middleware
 * 
 * Express middleware that intercepts AI requests, runs abuse detection
 * checks, and enforces graduated responses based on severity level.
 * 
 * Sits in the middleware chain AFTER identity resolution (flexAuth)
 * but BEFORE rate limiting, so flagged users get stricter limits.
 * 
 * Escalation levels:
 * 1. Warning — request proceeds, X-Abuse-Warning header set
 * 2. Cooldown — 429 with Retry-After header
 * 3. Strict limits — request proceeds with req.abuseStrictMode = true
 * 4. Captcha — 403 with captcha challenge requirement
 * 5. Auth required — 401 for anonymous users
 * 6. IP restricted — 403 hard block
 * 
 * References: ABUSE-01 through ABUSE-06
 * Phase 11
 */

import type { Request, Response, NextFunction } from 'express';
import { checkForAbuse, hashIp, type IdentitySignals, type EnforcementAction } from '../services/abuse.service';

/**
 * Create the abuse detection middleware.
 * 
 * Usage in route chain:
 *   flexAuthMiddleware → abuseDetectionMiddleware() → rateLimitMiddleware
 */
export const abuseDetectionMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // return next(); //------>to bypass or off the abuse protection!
    try {
      // Build identity signals from previous middleware
      const user = (req as any).user;
      const anonymousUser = (req as any).anonymousUser;
      const anonId = (req as any).anonId || anonymousUser?.anon_id;

      // Extract raw IP for datacenter detection
      const rawIp = getClientIp(req);

      const signals: IdentitySignals = {
        anonId,
        userId: user?.id,
        userEmail: user?.email,
        fingerprintHash: anonymousUser?.fingerprint_hash
          || req.headers['x-fingerprint'] as string | undefined,
        rawIp,
        ipHash: anonymousUser?.ip_hash,
        userAgent: req.headers['user-agent'] || undefined,
        prompt: req.body?.message || req.body?.prompt || undefined,
      };

      // Skip abuse check if no identity signals at all
      if (!signals.anonId && !signals.userId && !signals.fingerprintHash && !signals.rawIp) {
        return next();
      }

      // Run abuse detection pipeline
      const result = await checkForAbuse(signals);

      // Attach abuse info to request for downstream middleware
      (req as any).abuseCheck = result;

      if (!result.flagged) {
        return next();
      }

      // Apply enforcement based on severity
      return applyEnforcement(req, res, next, result.action, result.severity, result.cooldownSeconds, result.message);
    } catch (error) {
      // Abuse detection must NEVER crash the request pipeline
      console.error('[AbuseDetection] Middleware error:', error);
      next();
    }
  };
};

/**
 * Apply graduated enforcement actions.
 */
function applyEnforcement(
  req: Request,
  res: Response,
  next: NextFunction,
  action: EnforcementAction,
  severity: number,
  cooldownSeconds: number | undefined,
  message: string | undefined
): void {
  switch (action) {
    case 'warning':
      // Level 1: Let request through but set warning header
      res.setHeader('X-Abuse-Warning', 'true');
      res.setHeader('X-Abuse-Severity', severity.toString());
      return next();

    case 'cooldown':
      // Level 2: Reject with retry-after
      res.setHeader('Retry-After', (cooldownSeconds || 30).toString());
      res.status(429).json({
        success: false,
        code: 'ABUSE_COOLDOWN',
        message: message || 'Too many requests. Please wait before trying again.',
        retryAfter: cooldownSeconds || 30,
        severity,
      });
      return;

    case 'strict_limits':
      // Level 3: Let request through with strict mode flag
      // The rate limit middleware will check req.abuseStrictMode and apply 50% limits
      (req as any).abuseStrictMode = true;
      res.setHeader('X-Abuse-Warning', 'true');
      res.setHeader('X-Abuse-Severity', severity.toString());
      return next();

    case 'captcha':
      // Level 4: Require captcha verification
      res.status(403).json({
        success: false,
        code: 'ABUSE_CAPTCHA_REQUIRED',
        message: message || 'Please verify you are human to continue.',
        severity,
        requiresCaptcha: true,
      });
      return;

    case 'auth_required':
      // Level 5: Block anonymous access, require sign-in
      if (!(req as any).user) {
        res.status(401).json({
          success: false,
          code: 'ABUSE_AUTH_REQUIRED',
          message: message || 'Anonymous access has been suspended. Please sign in to continue.',
          severity,
        });
        return;
      }
      // If user IS authenticated, treat as strict limits instead
      (req as any).abuseStrictMode = true;
      return next();

    case 'ip_restricted':
      // Level 6: Hard block
      res.status(403).json({
        success: false,
        code: 'ABUSE_IP_RESTRICTED',
        message: message || 'Access from this network has been temporarily restricted.',
        severity,
      });
      return;

    default:
      // Unknown action — let through
      return next();
  }
}

/**
 * Extract the real client IP from request headers.
 * Duplicated from anonymousIdentity.ts to avoid circular imports.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || req.ip || '0.0.0.0';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.trim() || req.ip || '0.0.0.0';
  }
  return req.headers['x-real-ip'] as string || req.ip || '0.0.0.0';
}

/**
 * Anonymous Identity Middleware
 * 
 * Express middleware that sits before auth middleware on routes that
 * support anonymous access. It:
 * 
 * 1. Checks for Bearer token → if present, skips anonymous flow
 * 2. Extracts x-anon-id and x-fingerprint headers from request
 * 3. Resolves or creates the anonymous identity
 * 4. Sets httpOnly cookie with the resolved anon_id
 * 5. Attaches anonymous user to req.anonymousUser
 * 6. Updates last_seen_at
 * 
 * References: ANON-01, ANON-02, ANON-05, ANON-06
 */

import type { Request, Response, NextFunction } from 'express';
import {
  resolveAnonymousIdentity,
  getByAnonId,
  touchLastSeen,
} from '../services/anonymous.service';
import { PLAN_CONFIGS } from '../config/plans';

// Cookie settings for anonymous ID (ANON-02)
const ANON_COOKIE_NAME = 'sreeai_anon_id';
const ANON_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year in ms

/**
 * Extract the real client IP from request headers.
 * Supports common reverse proxy headers.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.trim() || req.ip || '0.0.0.0';
  }
  return req.headers['x-real-ip'] as string || req.ip || '0.0.0.0';
}

/**
 * Set the anonymous ID as an httpOnly cookie (ANON-02).
 */
function setAnonCookie(res: Response, anonId: string): void {
  res.cookie(ANON_COOKIE_NAME, anonId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ANON_COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Middleware: Identify anonymous users.
 * 
 * Use on routes that support both authenticated and anonymous access.
 * After this middleware, check:
 *   - (req as any).user → authenticated user (set by authMiddleware)
 *   - (req as any).anonymousUser → anonymous user record
 *   - (req as any).userTier → resolved plan tier string
 * 
 * If neither is present, the request is from an unknown client
 * without fingerprint — treated as anonymous with most restricted limits.
 */
export const anonymousIdentityMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip if already authenticated (Bearer token was validated by auth middleware)
    if ((req as any).user) {
      return next();
    }

    // Extract identity signals from headers
    const anonId = req.headers['x-anon-id'] as string | undefined
      || req.cookies?.[ANON_COOKIE_NAME];
    const fingerprintHash = req.headers['x-fingerprint'] as string | undefined;
    const rawIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || undefined;

    // If no fingerprint provided, we can't do much — set minimal anonymous context
    if (!fingerprintHash) {
      if (anonId) {
        const existing = await getByAnonId(anonId);
        if (existing) {
          await touchLastSeen(existing.anon_id);
          (req as any).anonymousUser = existing;
          (req as any).userTier = 'anonymous';
          return next();
        }
      }
      // No fingerprint and no valid anon_id — treat as brand new anonymous
      (req as any).userTier = 'anonymous';
      return next();
    }

    // Resolve identity: lookup → restore → create
    const result = await resolveAnonymousIdentity({
      anonId,
      fingerprintHash,
      rawIp,
      userAgent,
    });

    // Set httpOnly cookie with the resolved/restored anon_id
    setAnonCookie(res, result.user.anon_id);

    // If identity was restored (cookie lost but fingerprint matched),
    // tell the frontend to update its local storage
    if (result.restoredId) {
      res.setHeader('X-Restored-Anon-Id', result.restoredId);
    }

    // Attach to request
    (req as any).anonymousUser = result.user;
    (req as any).userTier = 'anonymous';
    (req as any).anonId = result.user.anon_id;

    next();
  } catch (error) {
    // Identity resolution should never block a request — degrade gracefully
    console.error('Anonymous identity middleware error:', error);
    (req as any).userTier = 'anonymous';
    next();
  }
};

/**
 * Middleware: Flexible auth that supports both authenticated and anonymous users.
 * 
 * Use this INSTEAD OF authMiddleware on routes that allow anonymous access (e.g. chat, voice).
 * 
 * Flow:
 * 1. If Bearer token present → validate with Supabase → set req.user
 * 2. If no Bearer token → run anonymous identity flow → set req.anonymousUser
 * 3. Set req.userTier based on resolved identity
 */
export const flexAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      // Authenticated flow — import inline to avoid circular deps
      const { supabaseAdmin } = await import('../lib/supabase');
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (!error && user) {
        (req as any).user = user;

        // Look up plan tier from profiles
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('plan_type')
          .eq('id', user.id)
          .single();

        (req as any).userTier = (profile?.plan_type || 'free').toLowerCase();
        return next();
      }
      // If token is invalid, fall through to anonymous
    }

    // No valid auth token — run anonymous identity flow
    return anonymousIdentityMiddleware(req, res, next);
  } catch (error) {
    console.error('Flex auth middleware error:', error);
    (req as any).userTier = 'anonymous';
    next();
  }
};

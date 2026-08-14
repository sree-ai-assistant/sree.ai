import type { Request, Response, NextFunction } from 'express';
import { posthog } from '../services/posthog.service';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('[Error]:', err.message || err);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  // ── PostHog: Capture 5xx server errors ─────────────────────────
  // Only capture server errors (5xx), not client errors (4xx).
  // Uses the authenticated user's ID if available, otherwise 'anonymous'.
  if (status >= 500 && posthog) {
    try {
      // Try to extract the user ID from the request (set by your auth middleware)
      const userId = (req as any).userId || (req as any).user?.id || 'anonymous-server';

      posthog.captureException(err, userId, {
        source: 'express_error_handler',
        endpoint: `${req.method} ${req.originalUrl}`,
        status_code: status,
        user_agent: req.get('user-agent'),
      });
    } catch (posthogErr) {
      // Never let PostHog errors affect the response
      console.warn('[PostHog] Failed to capture exception:', posthogErr);
    }
  }

  res.status(status).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

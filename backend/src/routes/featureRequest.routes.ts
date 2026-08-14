import { Router, type Request, type Response, type NextFunction } from 'express';
import { flexAuthMiddleware } from '../middleware/anonymousIdentity';
import { featureRequestRateLimiter } from '../middleware/featureRequestRateLimit';
import {
  FeatureRequestService,
  FEATURE_REQUEST_WEBHOOK_SECRET,
  type FeatureStatus,
} from '../services/featureRequest.service';

const router = Router();

/**
 * POST /api/feature-requests
 * Submit a new feature request with rate limiting and database persistence
 */
router.post(
  '/',
  flexAuthMiddleware,
  featureRequestRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        title,
        category,
        categoryLabel,
        priority,
        description,
        useCase,
        referenceUrl,
        userName,
        userEmail,
        notifyOnUpdate,
        clientMetadata,
      } = req.body;

      if (!title || typeof title !== 'string' || title.trim().length < 4) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Title is required and must be at least 4 characters long.',
        });
      }

      if (!description || typeof description !== 'string' || description.trim().length < 10) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Description is required and must be at least 10 characters long.',
        });
      }

      const user = (req as any).user;
      const anonymousUser = (req as any).anonymousUser;
      const anonId = (req as any).anonId || anonymousUser?.anon_id;
      const userTier = (req as any).userTier || 'free';

      const email = user?.email || userEmail;
      const name = user ? user.display_name || user.email?.split('@')[0] : userName;

      const result = await FeatureRequestService.create({
        title,
        category: category || 'general_idea',
        categoryLabel,
        priority: priority || 'helpful',
        description,
        useCase,
        referenceUrl,
        userId: user?.id,
        anonId,
        userName: name,
        userEmail: email,
        userPlan: userTier,
        notifyOnUpdate,
        clientMetadata,
      });

      return res.status(201).json({
        success: true,
        ticketId: result.ticketId,
        request: result.request,
        webhookDelivered: result.webhookDelivered,
        message: 'Feature request submitted successfully and logged to roadmap.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/feature-requests/my
 * Get feature requests submitted by the current user or anonymous session
 */
router.get('/my', flexAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const anonymousUser = (req as any).anonymousUser;
    const anonId = (req as any).anonId || anonymousUser?.anon_id;

    const requests = await FeatureRequestService.getUserRequests(user?.id, anonId);

    return res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/feature-requests/public
 * Get public roadmap list for community transparency
 */
router.get('/public', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const requests = await FeatureRequestService.getPublicRoadmap(limit);

    return res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/feature-requests/:ticketId/status
 * Webhook or admin endpoint to update status: [Raised, In Progress, Resolved, Rejected]
 */
router.patch('/:ticketId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secretHeader =
      req.headers['x-webhook-secret'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    const bodySecret = req.body.secret || req.body.webhook_secret;

    if (
      secretHeader !== FEATURE_REQUEST_WEBHOOK_SECRET &&
      bodySecret !== FEATURE_REQUEST_WEBHOOK_SECRET
    ) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid webhook secret header or token.',
      });
    }

    const rawTicketId = req.params.ticketId;
    const ticketId = Array.isArray(rawTicketId) ? rawTicketId[0] : rawTicketId;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Ticket ID parameter is required.',
      });
    }

    const { status, adminNotes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Status is required (Raised, In Progress, Resolved, Rejected).',
      });
    }

    const updated = await FeatureRequestService.updateStatus(
      ticketId,
      status as FeatureStatus,
      adminNotes
    );

    return res.json({
      success: true,
      request: updated,
      message: `Feature request status updated to ${status}.`,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update feature request status.',
    });
  }
});

export default router;

import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-key';
});

import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { starterPlanMiddleware, videoModelValidationMiddleware } from './auth';

describe('auth middleware plan & model validation', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    
    req = {
      body: {},
      query: {},
    };
    
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    
    next = vi.fn();
  });

  describe('starterPlanMiddleware', () => {
    it('should reject anonymous users with 401', async () => {
      (req as any).user = null;
      (req as any).userTier = 'anonymous';

      await starterPlanMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'AUTH_REQUIRED'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject free tier users with 403', async () => {
      (req as any).user = { id: 'test-user-id' };
      (req as any).userTier = 'free';

      await starterPlanMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'FEATURE_LOCKED'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow starter tier users', async () => {
      (req as any).user = { id: 'test-user-id' };
      (req as any).userTier = 'starter';

      await starterPlanMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow pro tier users', async () => {
      (req as any).user = { id: 'test-user-id' };
      (req as any).userTier = 'pro';

      await starterPlanMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('videoModelValidationMiddleware', () => {
    it('should allow veo-3.1-fast-generate-preview model', async () => {
      req.body = { model: 'veo-3.1-fast-generate-preview' };

      await videoModelValidationMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow veo-2.0-generate-preview model', async () => {
      req.body = { model: 'veo-2.0-generate-preview' };

      await videoModelValidationMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow requests with no model specified (defaulting to fast model)', async () => {
      req.body = {};

      await videoModelValidationMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject non-Google Veo models with 400', async () => {
      req.body = { model: 'unsupported-model' };

      await videoModelValidationMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'INVALID_MODEL',
        message: expect.stringContaining('Only Google Veo models are supported')
      }));
      expect(next).not.toHaveBeenCalled();
    });
  });
});

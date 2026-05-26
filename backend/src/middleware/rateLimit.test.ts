import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-key';
});

import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimitMiddleware } from './rateLimit';
import { checkAndIncrementUsage, checkRateLimit } from '../services/usage.service';
import { ApiKeyService } from '../services/apiKey.service';
import { resolveProvider } from '../utils/providerResolver';

// Mock dependencies
vi.mock('../services/usage.service', () => ({
  checkAndIncrementUsage: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('../services/apiKey.service', () => ({
  ApiKeyService: {
    getUserApiKey: vi.fn().mockResolvedValue({ key: null, source: 'system' }),
  },
}));

vi.mock('../utils/providerResolver', () => ({
  resolveProvider: vi.fn().mockResolvedValue('unknown'),
}));

describe('rateLimitMiddleware', () => {
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

  it('should treat normal chat request as chat tool', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    
    const middleware = rateLimitMiddleware('chat');
    await middleware(req as Request, res as Response, next);
    
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      'chat'
    );
    expect(next).toHaveBeenCalled();
  });

  it('should detect voice request when req.body.mode is voice', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    req.body = { mode: 'voice' };
    
    const middleware = rateLimitMiddleware('chat');
    await middleware(req as Request, res as Response, next);
    
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      'voice'
    );
    expect(next).toHaveBeenCalled();
  });

  it('should detect voice request when req.body.isVoice is true', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    req.body = { isVoice: true };
    
    const middleware = rateLimitMiddleware('chat');
    await middleware(req as Request, res as Response, next);
    
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      'voice'
    );
    expect(next).toHaveBeenCalled();
  });

  it('should detect voice request when req.body.attachments has audio type', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    req.body = {
      attachments: [
        { type: 'image' },
        { type: 'audio' }
      ]
    };
    
    const middleware = rateLimitMiddleware('chat');
    await middleware(req as Request, res as Response, next);
    
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      'voice'
    );
    expect(next).toHaveBeenCalled();
  });
});

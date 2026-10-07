import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  apiKeyValidateRateLimiter,
  apiKeySaveRateLimiter,
  API_KEY_RATE_LIMITS,
  _resetApiKeyRateLimitCaches,
} from './apiKeyRateLimit';

interface MockRequest extends Partial<Request> {
  user?: { id: string } | null;
  headers: Record<string, string | undefined>;
  ip?: string;
}

interface MockResponse extends Partial<Response> {
  status: any;
  setHeader: any;
}

describe('API Key Rate Limiting Middleware', () => {
  let mockReq: MockRequest;
  let mockRes: MockResponse;
  let nextFn: NextFunction;
  let statusMock: any;
  let jsonMock: any;
  let setHeaderMock: any;

  beforeEach(() => {
    _resetApiKeyRateLimitCaches();
    nextFn = vi.fn();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = vi.fn();

    mockRes = {
      status: statusMock,
      setHeader: setHeaderMock,
    };
  });

  describe('apiKeyValidateRateLimiter', () => {
    it('allows up to 15 validation requests in a minute and decrements remaining header', () => {
      mockReq = {
        headers: {},
        user: { id: 'user-validate-1' },
      };

      for (let i = 1; i <= 15; i++) {
        nextFn = vi.fn();
        apiKeyValidateRateLimiter(mockReq as unknown as Request, mockRes as unknown as Response, nextFn);
        expect(nextFn).toHaveBeenCalled();
        expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 15);
        expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 15 - i);
      }
    });

    it('blocks the 16th validation request with HTTP 429 and Retry-After header', () => {
      mockReq = {
        headers: {},
        user: { id: 'user-validate-burst' },
      };

      // 15 allowed
      for (let i = 0; i < 15; i++) {
        apiKeyValidateRateLimiter(mockReq as unknown as Request, mockRes as unknown as Response, vi.fn());
      }

      // 16th blocked
      const blockedNext = vi.fn();
      apiKeyValidateRateLimiter(mockReq as unknown as Request, mockRes as unknown as Response, blockedNext);

      expect(blockedNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: expect.any(Number),
        })
      );
    });

    it('does not cross-contaminate limits between different users', () => {
      const reqUserA: MockRequest = { headers: {}, user: { id: 'user-a' } };
      const reqUserB: MockRequest = { headers: {}, user: { id: 'user-b' } };

      // Max out User A
      for (let i = 0; i < 15; i++) {
        apiKeyValidateRateLimiter(reqUserA as unknown as Request, mockRes as unknown as Response, vi.fn());
      }

      // 16th for User A is blocked
      const nextA = vi.fn();
      apiKeyValidateRateLimiter(reqUserA as unknown as Request, mockRes as unknown as Response, nextA);
      expect(nextA).not.toHaveBeenCalled();

      // User B is fresh and allowed
      const nextB = vi.fn();
      apiKeyValidateRateLimiter(reqUserB as unknown as Request, mockRes as unknown as Response, nextB);
      expect(nextB).toHaveBeenCalled();
    });
  });

  describe('apiKeySaveRateLimiter', () => {
    it('allows onboarding burst of 4 parallel saves easily (limit is 10/min)', () => {
      mockReq = {
        headers: {},
        user: { id: 'user-onboarding-burst' },
      };

      // 4 parallel saves from OnboardingPage.tsx
      for (let i = 1; i <= 4; i++) {
        nextFn = vi.fn();
        apiKeySaveRateLimiter(mockReq as unknown as Request, mockRes as unknown as Response, nextFn);
        expect(nextFn).toHaveBeenCalled();
        expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
        expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 10 - i);
      }
    });

    it('blocks the 11th save attempt in 1 minute with HTTP 429', () => {
      mockReq = {
        headers: {},
        user: { id: 'user-save-spammer' },
      };

      // 10 allowed
      for (let i = 0; i < 10; i++) {
        apiKeySaveRateLimiter(mockReq as unknown as Request, mockRes as unknown as Response, vi.fn());
      }

      // 11th blocked
      const blockedNext = vi.fn();
      apiKeySaveRateLimiter(mockReq as unknown as Request, mockRes as unknown as Response, blockedNext);

      expect(blockedNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: expect.any(Number),
        })
      );
    });
  });
});

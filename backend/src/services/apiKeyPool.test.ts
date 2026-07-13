import { describe, it, expect } from 'vitest';
import { classifyApiError } from './apiKeyPool.service';

describe('classifyApiError', () => {
  it('should classify standard 401/403 errors as auth failures', () => {
    const error1 = { status: 401, message: 'Unauthorized' };
    const error2 = { response: { status: 403 }, message: 'Forbidden' };
    const error3 = { statusCode: 401, message: 'Invalid credentials' };

    expect(classifyApiError(error1)).toBe('auth');
    expect(classifyApiError(error2)).toBe('auth');
    expect(classifyApiError(error3)).toBe('auth');
  });

  it('should classify string-based key invalidation errors as auth failures', () => {
    const error = new Error('The API key provided is invalid or expired');
    expect(classifyApiError(error)).toBe('auth');
  });

  it('should classify Google blocked service 403 error as auth failure', () => {
    // Original Axios-like error
    const errorOriginal = {
      status: 403,
      message: 'Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked.',
      response: {
        status: 403,
        data: {
          error: {
            code: 403,
            message: 'Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked.',
            status: 'PERMISSION_DENIED',
            details: [
              {
                reason: 'API_KEY_SERVICE_BLOCKED'
              }
            ]
          }
        }
      }
    };

    // Wrapped error as thrown by generateImageGoogle (no status/response directly on it initially, but now we copy them or check string message)
    const errorWrapped = new Error('Image generation failed: Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked.');
    
    // Wrapped error with attached properties (our new implementation)
    const errorWrappedWithProps = new Error('Image generation failed: Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked.');
    (errorWrappedWithProps as any).status = 403;
    (errorWrappedWithProps as any).response = {
      status: 403,
      data: {
        error: {
          code: 403,
          message: 'Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked.',
          status: 'PERMISSION_DENIED',
          details: [
            {
              reason: 'API_KEY_SERVICE_BLOCKED'
            }
          ]
        }
      }
    };

    expect(classifyApiError(errorOriginal)).toBe('auth');
    expect(classifyApiError(errorWrapped)).toBe('auth');
    expect(classifyApiError(errorWrappedWithProps)).toBe('auth');
  });

  it('should classify rate limit (429) errors correctly', () => {
    const error1 = { status: 429, message: 'Too many requests' };
    const error2 = new Error('Rate limit exceeded for this model');
    const error3 = {
      message: 'Some error',
      response: {
        data: {
          error: 'Rate limit has been hit'
        }
      }
    };

    expect(classifyApiError(error1)).toBe('rate_limit');
    expect(classifyApiError(error2)).toBe('rate_limit');
    expect(classifyApiError(error3)).toBe('rate_limit');
  });

  it('should classify server/timeout (5xx) errors correctly', () => {
    const error1 = { status: 500, message: 'Internal Server Error' };
    const error2 = { status: 503, message: 'Service Unavailable' };
    const error3 = new Error('Gateway Timeout occurred');

    expect(classifyApiError(error1)).toBe('server');
    expect(classifyApiError(error2)).toBe('server');
    expect(classifyApiError(error3)).toBe('server');
  });

  it('should classify other client errors as "other"', () => {
    const error1 = new Error('Invalid prompt content or format');
    const error2 = new Error('Image generation blocked by safety filter: safety setting violation');

    expect(classifyApiError(error1)).toBe('other');
    expect(classifyApiError(error2)).toBe('other');
  });
});

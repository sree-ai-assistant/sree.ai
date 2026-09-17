import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
});

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

  it('should classify Live API WebSocket auth errors as auth failures', () => {
    const error1 = new Error('API key not valid. Please pass a valid API key.');
    const error2 = new Error('Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication');
    expect(classifyApiError(error1)).toBe('auth');
    expect(classifyApiError(error2)).toBe('auth');
  });
});

import { classifyWsClose } from './liveVoice.service';

describe('classifyWsClose', () => {
  it('should classify 1007 with invalid API key as key_error (not model_error)', () => {
    expect(
      classifyWsClose(1007, 'API key not valid. Please pass a valid API key.')
    ).toBe('key_error');
  });

  it('should classify 1008 with invalid credentials as key_error', () => {
    expect(
      classifyWsClose(
        1008,
        'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication'
      )
    ).toBe('key_error');
  });

  it('should classify 1008 with model not found as model_error (not key_error)', () => {
    expect(
      classifyWsClose(
        1008,
        'models/gemini-3.8-live- is not found for API version v1beta, or is not supported for bidiGenerateContent. Call ModelService'
      )
    ).toBe('model_error');
  });

  it('should classify 1007 with invalid config payload as model_error', () => {
    expect(
      classifyWsClose(
        1007,
        "Invalid value at 'setup.realtime_input_config.automatic_activity_detection.start_of_speech_sensitivity'"
      )
    ).toBe('model_error');
  });

  it('should classify 1008 with quota exhaustion as key_error', () => {
    expect(
      classifyWsClose(1008, 'Resource has been exhausted (e.g. check quota)')
    ).toBe('key_error');
  });

  it('should fall back to model_error for uninformative 1007 close', () => {
    expect(classifyWsClose(1007, '')).toBe('model_error');
  });

  it('should fall back to key_error for uninformative 1008 close', () => {
    expect(classifyWsClose(1008, '')).toBe('key_error');
  });

  it('should classify 1011 server error as model_error', () => {
    expect(classifyWsClose(1011, 'Internal server error')).toBe('model_error');
  });
});

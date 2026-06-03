import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderValidationService } from './providerValidation.service';

describe('ProviderValidationService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('Google validation', () => {
    it('should return valid true if Google API returns 200', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('google', 'valid-google-key');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Google API key verified');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models?key=valid-google-key'),
        expect.any(Object)
      );
    });

    it('should return valid false with correct message if Google API returns 400', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'API key not valid' } })
      } as Response);

      const result = await ProviderValidationService.validate('google', 'invalid-google-key');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Google API key');
    });

    it('should return rate limit message if Google API returns 429', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } })
      } as Response);

      const result = await ProviderValidationService.validate('google', 'limited-key');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Key rate limited — try again later');
    });
  });

  describe('Groq validation', () => {
    it('should return valid true if Groq API returns 200', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('groq', 'valid-groq-key');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Groq API key verified');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid-groq-key' }
        })
      );
    });

    it('should return valid false if Groq API returns 401', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('groq', 'invalid-groq-key');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Groq API key');
    });
  });

  describe('Nvidia validation', () => {
    it('should return valid true if Nvidia API returns 200', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('nvidia', 'valid-nvidia-key');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Nvidia API key verified');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://integrate.api.nvidia.com/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid-nvidia-key' }
        })
      );
    });

    it('should return valid false if Nvidia API returns 401', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('nvidia', 'invalid-nvidia-key');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Nvidia API key');
    });
  });

  describe('Deepgram validation', () => {
    it('should return valid true if Deepgram API returns 200', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('deepgram', 'valid-dg-key');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Deepgram API key verified');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepgram.com/v1/projects',
        expect.objectContaining({
          headers: { Authorization: 'Token valid-dg-key' }
        })
      );
    });

    it('should return valid false if Deepgram API returns 401', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({})
      } as Response);

      const result = await ProviderValidationService.validate('deepgram', 'invalid-dg-key');
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid Deepgram API key');
    });
  });

  describe('Unknown provider', () => {
    it('should return valid false for unknown provider', async () => {
      const result = await ProviderValidationService.validate('unknown-ai', 'some-key');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Unknown provider');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

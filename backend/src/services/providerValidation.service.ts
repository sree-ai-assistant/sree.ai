/**
 * Provider Validation Service (Backend)
 * 
 * Validates API keys against actual provider endpoints.
 * Makes lightweight requests to verify key authenticity.
 */

interface ValidationResult {
  valid: boolean;
  message: string;
}

export class ProviderValidationService {
  /**
   * Validate an API key against its provider's actual endpoint.
   */
  static async validate(provider: string, key: string): Promise<ValidationResult> {
    switch (provider.toLowerCase()) {
      case 'google':
        return this.validateGoogle(key);
      case 'groq':
        return this.validateGroq(key);
      case 'nvidia':
        return this.validateNvidia(key);
      case 'deepgram':
        return this.validateDeepgram(key);
      default:
        return { valid: false, message: `Unknown provider: ${provider}` };
    }
  }

  /**
   * Google Gemini API validation
   * Uses the models.list endpoint which is lightweight
   */
  private static async validateGoogle(key: string): Promise<ValidationResult> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { method: 'GET', signal: AbortSignal.timeout(10000) }
      );

      if (response.ok) {
        return { valid: true, message: 'Google API key verified' };
      }

      const data = await response.json().catch(() => ({}));
      if (response.status === 400 || response.status === 403) {
        return { valid: false, message: 'Invalid Google API key' };
      }
      if (response.status === 429) {
        return { valid: false, message: 'Key rate limited — try again later' };
      }

      return { valid: false, message: data?.error?.message || 'Authorization failed' };
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        return { valid: false, message: 'Verification timed out — try again' };
      }
      return { valid: false, message: 'Unable to verify key right now' };
    }
  }

  /**
   * Groq API validation
   * Uses the models.list endpoint
   */
  private static async validateGroq(key: string): Promise<ValidationResult> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return { valid: true, message: 'Groq API key verified' };
      }

      if (response.status === 401) {
        return { valid: false, message: 'Invalid Groq API key' };
      }
      if (response.status === 429) {
        return { valid: false, message: 'Key rate limited — try again later' };
      }

      return { valid: false, message: 'Authorization failed' };
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        return { valid: false, message: 'Verification timed out — try again' };
      }
      return { valid: false, message: 'Unable to verify key right now' };
    }
  }

  /**
   * Nvidia NIM API validation
   * Uses the models endpoint
   */
  private static async validateNvidia(key: string): Promise<ValidationResult> {
    try {
      const response = await fetch(
        'https://integrate.api.nvidia.com/v1/models',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.ok) {
        return { valid: true, message: 'Nvidia API key verified' };
      }

      if (response.status === 401 || response.status === 403) {
        return { valid: false, message: 'Invalid Nvidia API key' };
      }

      return { valid: false, message: 'Authorization failed' };
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        return { valid: false, message: 'Verification timed out — try again' };
      }
      return { valid: false, message: 'Unable to verify key right now' };
    }
  }

  /**
   * Deepgram API validation
   * Uses the projects endpoint
   */
  private static async validateDeepgram(key: string): Promise<ValidationResult> {
    try {
      const response = await fetch('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: { Authorization: `Token ${key}` },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return { valid: true, message: 'Deepgram API key verified' };
      }

      if (response.status === 401 || response.status === 403) {
        return { valid: false, message: 'Invalid Deepgram API key' };
      }

      return { valid: false, message: 'Authorization failed' };
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        return { valid: false, message: 'Verification timed out — try again' };
      }
      return { valid: false, message: 'Unable to verify key right now' };
    }
  }
}

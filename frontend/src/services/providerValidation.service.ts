/**
 * Provider Validation Service
 * 
 * Reusable API key validation logic for all AI providers.
 * Used by: Onboarding, Settings, API Key Management
 * 
 * IMPORTANT: Each provider is validated against their real API endpoint.
 * We do NOT just check formatting — we verify the key actually works.
 */

import api from '../lib/api';

export type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export interface ValidationResult {
  status: ValidationStatus;
  message: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  keyPrefix?: string;
  docsUrl: string;
}

export const SUPPORTED_PROVIDERS: ProviderConfig[] = [
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models for chat & reasoning',
    placeholder: 'AIza... or AQ...',
    keyPrefix: 'A',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast LLM inference',
    placeholder: 'gsk_...',
    keyPrefix: 'gsk_',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'nvidia',
    name: 'Nvidia',
    description: 'NIM inference & GPU models',
    placeholder: 'nvapi-...',
    keyPrefix: 'nvapi-',
    docsUrl: 'https://build.nvidia.com/',
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    description: 'Speech-to-text & voice AI',
    placeholder: 'Enter your Deepgram API key',
    docsUrl: 'https://console.deepgram.com/',
  },
];

/**
 * Validate an API key against its provider's actual endpoint.
 * Returns a ValidationResult with status and human-readable message.
 */
export async function validateApiKey(
  provider: string,
  key: string,
  signal?: AbortSignal
): Promise<ValidationResult> {
  if (!key || key.trim().length === 0) {
    return { status: 'idle', message: '' };
  }

  const trimmedKey = key.trim();

  // Basic format check first (fast fail)
  const config = SUPPORTED_PROVIDERS.find(p => p.id === provider);
  if (config?.keyPrefix && !trimmedKey.startsWith(config.keyPrefix)) {
    return {
      status: 'invalid',
      message: `Key should start with "${config.keyPrefix}"`,
    };
  }

  try {
    // Use backend proxy to validate (avoids CORS issues and keeps keys secure)
    const response = await api.post(
      '/user/settings/keys/validate',
      { provider, key: trimmedKey },
      { signal }
    );

    if (response.data.valid) {
      return { status: 'valid', message: 'API key verified successfully' };
    } else {
      return {
        status: 'invalid',
        message: response.data.message || 'Invalid API key',
      };
    }
  } catch (error: any) {
    if (error.name === 'CanceledError' || signal?.aborted) {
      return { status: 'idle', message: '' };
    }

    const serverMessage = error.response?.data?.message;
    if (serverMessage) {
      return { status: 'invalid', message: serverMessage };
    }

    return {
      status: 'invalid',
      message: 'Unable to verify key right now. Please try again later.',
    };
  }
}

/**
 * Get the key name for storage based on provider
 * e.g., "Google" -> "Google_1st-Key"
 */
export function getKeyName(provider: string): string {
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${providerName}_1st-Key`;
}

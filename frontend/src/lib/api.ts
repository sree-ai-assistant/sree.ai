import axios from 'axios';
import { supabase } from './supabase';
import { getStoredAnonId, storeAnonId, generateFingerprintHash, getOrCreateAnonymousIdentity } from './fingerprint';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Cached fingerprint hash — computed once per session
let cachedFingerprintHash: string | null = null;

async function getFingerprintHash(): Promise<string> {
  if (!cachedFingerprintHash) {
    cachedFingerprintHash = await generateFingerprintHash();
  }
  return cachedFingerprintHash;
}

// Add auth token AND anonymous identity headers to every request
api.interceptors.request.use(async (config) => {
  let session = null;
  try {
    const { data } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Session fetch timeout')), 3000))
    ]);
    session = data?.session;
  } catch (e) {
    console.warn('API interceptor session fetch timeout');
  }
  
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  } else {
    // No auth session — send anonymous identity headers
    try {
      const anonId = getStoredAnonId();
      if (anonId) {
        config.headers['X-Anon-Id'] = anonId;
      }
      const fingerprint = await getFingerprintHash();
      config.headers['X-Fingerprint'] = fingerprint;
    } catch {
      // Fingerprint generation failed — request proceeds without it
    }
  }
  return config;
});

// Handle restored anonymous ID from backend
api.interceptors.response.use((response) => {
  const restoredId = response.headers['x-restored-anon-id'];
  if (restoredId) {
    // Backend restored a previous identity — update local storage
    storeAnonId(restoredId);
  }
  return response;
});

export const aiService = {
  generateSpeech: async (text: string, model?: string, voiceSessionId?: string) => {
    try {
      const response = await api.post('/ai/tts', { text, model, voiceSessionId }, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error: any) {
      // If error is a blob (common when responseType is blob), convert it to text to see the message
      if (error.response?.data instanceof Blob) {
        const text = await error.response.data.text();
        try {
          const parsed = JSON.parse(text);
          throw new Error(parsed.message || 'Failed to generate speech');
        } catch (e) {
          throw new Error('Failed to generate speech');
        }
      }
      throw error;
    }
  },
  transcribeAudio: async (formData: FormData) => {
    const response = await api.post('/ai/voice', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  voiceComplete: async (durationSeconds: number, voiceSessionId?: string, apiCallsCount?: number) => {
    const response = await api.post('/ai/voice-complete', { durationSeconds, voiceSessionId, apiCallsCount });
    return response.data;
  },
};

export const sessionService = {
  getSessions: async () => {
    const response = await api.get('/user/sessions');
    return response.data;
  },
  syncSession: async (sessionInfo: { os: string; browser: string; location?: string; ip_address?: string; device_id?: string }) => {
    const response = await api.post('/user/sessions/sync', sessionInfo);
    return response.data;
  },
  deleteSession: async (sessionId: string) => {
    const response = await api.delete(`/user/sessions/${sessionId}`);
    return response.data;
  },
  getDevices: async () => {
    const response = await api.get('/user/devices');
    return response.data;
  },
  revokeOthers: async () => {
    const response = await api.delete('/user/sessions/revoke-others');
    return response.data;
  },
};

export const apiKeyService = {
  listKeys: async () => {
    const response = await api.get('/user/settings/keys');
    return response.data;
  },
  saveKey: async (data: { name: string; provider: string; key: string }) => {
    const response = await api.post('/user/settings/keys', data);
    return response.data;
  },
  toggleKey: async (keyId: string, inUse: boolean) => {
    const response = await api.patch(`/user/settings/keys/${keyId}/toggle`, { in_use: inUse });
    return response.data;
  },
  deleteKey: async (keyId: string) => {
    const response = await api.delete(`/user/settings/keys/${keyId}`);
    return response.data;
  },
};

export const userService = {
  migrateAnonymousData: async (anonId: string) => {
    const response = await api.post('/user/migrate', { anon_id: anonId });
    return response.data;
  },
};

export const usageService = {
  getStatus: async () => {
    const response = await api.get('/ai/usage');
    return response.data;
  },
};


export default api;

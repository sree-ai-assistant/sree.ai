import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Add auth token to every request
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
  }
  return config;
});

export const aiService = {
  generateSpeech: async (text: string, model?: string) => {
    try {
      const response = await api.post('/ai/tts', { text, model }, {
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

export default api;

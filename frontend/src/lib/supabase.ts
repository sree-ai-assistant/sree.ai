import { createClient } from '@supabase/supabase-js';
import { getStoredAnonId } from './fingerprint';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env file.');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    global: {
      fetch: (url, options) => {
        const anonId = getStoredAnonId();
        if (anonId) {
          const headers = new Headers(options?.headers);
          if (!headers.has('x-anon-id')) {
            headers.set('x-anon-id', anonId);
          }
          return fetch(url, { ...options, headers });
        }
        return fetch(url, options);
      }
    }
  }
);

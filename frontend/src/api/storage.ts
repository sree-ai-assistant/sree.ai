import { supabase } from '../lib/supabase';

export interface UploadResponse {
  success: boolean;
  url?: string;
  message?: string;
}

export const uploadFile = async (file: File): Promise<UploadResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: formData,
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('File Upload API Error:', error);
    return {
      success: false,
      message: 'Network error or server unavailable',
    };
  }
};

import api from '../lib/api';
import axios from 'axios';

export interface UploadResponse {
  success: boolean;
  url?: string;
  message?: string;
  deduplicated?: boolean;
}

export const uploadFile = async (
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<UploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/ai/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Keep at max 99% until server returns final 200 response
          onProgress(Math.min(99, Math.max(0, percent)));
        }
      },
    });

    if (onProgress) {
      onProgress(100);
    }

    return response.data;
  } catch (error: any) {
    // Don't log or toast on intentional abort/cancel
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || signal?.aborted) {
      return {
        success: false,
        message: 'Upload cancelled',
      };
    }

    console.error('File Upload API Error:', error);
    const serverMessage =
      error.response?.data?.message ||
      error.message ||
      'Upload failed. Please try again.';
    return {
      success: false,
      message: serverMessage,
    };
  }
};

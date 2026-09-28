import api from '../lib/api';

export interface UploadResponse {
  success: boolean;
  url?: string;
  message?: string;
}

export const uploadFile = async (
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/ai/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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


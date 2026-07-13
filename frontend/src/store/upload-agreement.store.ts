import { create } from 'zustand';
import { useAuthStore } from './auth.store';
import { userService } from '../lib/api';

interface UploadAgreementState {
  isOpen: boolean;
  resolvePromise: ((agreed: boolean) => void) | null;
  checkAgreement: () => Promise<boolean>;
  agree: () => Promise<void>;
  cancel: () => void;
}

export const useUploadAgreementStore = create<UploadAgreementState>((set, get) => ({
  isOpen: false,
  resolvePromise: null,
  checkAgreement: async () => {
    const { user } = useAuthStore.getState();
    
    // If the user has already agreed in their profile, proceed with the upload immediately.
    if (user?.file_upload_agreed) {
      return true;
    }

    // Otherwise, open the agreement modal and return a promise.
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        resolvePromise: resolve,
      });
    });
  },
  agree: async () => {
    const { resolvePromise } = get();
    const { user } = useAuthStore.getState();

    try {
      // Save status and current timestamp to database via backend API
      const result = await userService.agreeUpload();
      
      if (user) {
        useAuthStore.setState({
          user: {
            ...user,
            file_upload_agreed: true,
            file_upload_agreed_at: result.file_upload_agreed_at,
          }
        });
      }
      
      if (resolvePromise) {
        resolvePromise(true);
      }
    } catch (err) {
      console.error('Failed to update upload agreement in DB:', err);
      // Fallback: resolve true if we want them to proceed, but since it's a critical safety feature,
      // let's propagate the error to the UI and let the user retry.
      throw err;
    } finally {
      set({ isOpen: false, resolvePromise: null });
    }
  },
  cancel: () => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise(false);
    }
    set({ isOpen: false, resolvePromise: null });
  },
}));

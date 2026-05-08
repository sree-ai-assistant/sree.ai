import { create } from 'zustand';
import api from '../lib/api';
import toast from 'react-hot-toast';

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  seed?: number;
  created_at: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
}

export interface ImageSettings {
  prompt: string;
  negativePrompt: string;
  modelId: string;
  ratioIndex: number;
  steps: number;
  seed: number;
  cfgScale: number;
}

interface ImageState {
  history: GeneratedImage[];
  activeImage: GeneratedImage | null;
  isGenerating: boolean;
  isFetchingHistory: boolean;
  settings: ImageSettings;
  
  fetchHistory: () => Promise<void>;
  generateImage: (params: any) => Promise<void>;
  deleteImage: (id: string) => Promise<void>;
  setActiveImage: (image: GeneratedImage | null) => void;
  updateSettings: (settings: Partial<ImageSettings>) => void;
}

const DEFAULT_SETTINGS: ImageSettings = {
  prompt: '',
  negativePrompt: '',
  modelId: '',
  ratioIndex: 0,
  steps: 30,
  seed: 0,
  cfgScale: 5,
};

export const useImageStore = create<ImageState>((set, get) => ({
  history: [],
  activeImage: null,
  isGenerating: false,
  isFetchingHistory: false,
  settings: DEFAULT_SETTINGS,

  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  fetchHistory: async () => {
    set({ isFetchingHistory: true });
    try {
      const response = await api.get('/ai/images');
      if (response.data.success) {
        set({ history: response.data.data });
      }
    } catch (error) {
      console.error('History fetch error:', error);
    } finally {
      set({ isFetchingHistory: false });
    }
  },

  setActiveImage: (image) => {
    set({ activeImage: image });
    if (image) {
      set((state) => ({
        settings: {
          ...state.settings,
          prompt: image.prompt,
          modelId: image.model,
          seed: image.seed || 0,
          negativePrompt: image.negative_prompt || '',
          steps: image.steps || state.settings.steps,
          cfgScale: image.cfg_scale || state.settings.cfgScale,
        }
      }));
    }
  },

  generateImage: async (params) => {
    set({ isGenerating: true, activeImage: null });
    try {
      const response = await api.post('/ai/image', params);
      if (response.data.success) {
        const img = response.data.data.images[0];
        if (img) {
          // The API returns the new history or just the image. 
          // fetchHistory to stay synced or just prepend.
          get().fetchHistory();
          set({ activeImage: img });
          toast.success('Image generated!');
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate image');
      throw error;
    } finally {
      set({ isGenerating: false });
    }
  },

  deleteImage: async (id) => {
    try {
      await api.delete(`/ai/image/${id}`);
      set(state => ({
        history: state.history.filter(img => img.id !== id),
        activeImage: state.activeImage?.id === id ? null : state.activeImage
      }));
      toast.success('Image deleted');
    } catch (error) {
      toast.error('Failed to delete image');
    }
  },
}));

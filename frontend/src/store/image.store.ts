import { create } from 'zustand';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useUsageStore } from './usage.store';

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
  imageSize: string;
}

interface ImageState {
  history: GeneratedImage[];
  activeImage: GeneratedImage | null;
  isGenerating: boolean;
  isFetchingHistory: boolean;
  settings: ImageSettings;
  currentGenerationId: string | null;
  
  focusedGenerationId: string | null;
  
  fetchHistory: () => Promise<void>;
  generateImage: (params: any) => Promise<void>;
  deleteImage: (id: string) => Promise<void>;
  setActiveImage: (image: GeneratedImage | null) => void;
  updateSettings: (settings: Partial<ImageSettings>) => void;
  resetGenerationState: () => void;
  setFocusedGenerationId: (id: string | null) => void;
  clearStore: () => void;
}

const DEFAULT_SETTINGS: ImageSettings = {
  prompt: '',
  negativePrompt: '',
  modelId: '',
  ratioIndex: 0,
  steps: 30,
  seed: 0,
  cfgScale: 5,
  imageSize: '1k',
};

export const useImageStore = create<ImageState>((set, get) => ({
  history: [],
  activeImage: null,
  isGenerating: false,
  isFetchingHistory: false,
  settings: DEFAULT_SETTINGS,
  currentGenerationId: null,
  focusedGenerationId: null,

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
    set({ activeImage: image, focusedGenerationId: null });
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
          imageSize: (image as any).image_size || state.settings.imageSize,
        }
      }));
    }
  },

  resetGenerationState: () => {
    set({ 
      activeImage: null, 
      focusedGenerationId: null, 
      isGenerating: false, 
      currentGenerationId: null 
    });
  },

  setFocusedGenerationId: (id) => set({ focusedGenerationId: id }),

  generateImage: async (params) => {
    const generationId = Math.random().toString(36).substring(7);
    set({ isGenerating: true, activeImage: null, currentGenerationId: generationId, focusedGenerationId: generationId });
    
    try {
      const response = await api.post('/ai/image', params);
      if (response.data.success) {
        // Increment usage count locally immediately after a successful request
        useUsageStore.getState().incrementLocalUsage('image');

        const img = response.data.data.images[0];
        if (img) {
          get().fetchHistory();
          // Only update active image if the user hasn't started a new generation
          // or manually reset the view (currentGenerationId would change or become null)
          if (get().currentGenerationId === generationId) {
            set({ activeImage: img, isGenerating: false, focusedGenerationId: null });
            toast.success('Image generated!');
          }
        }
      }
    } catch (error: any) {
      // Only show error toast and stop loading if this is the current active generation
      if (get().currentGenerationId === generationId) {
        set({ isGenerating: false, focusedGenerationId: null });
        toast.error(error.response?.data?.message || 'Failed to generate image');
      }
      throw error;
    } finally {
      // If this was the active generation, ensure loading is off
      if (get().currentGenerationId === generationId) {
        set({ isGenerating: false, focusedGenerationId: null });
      }
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

  clearStore: () => {
    set({ 
      history: [], 
      activeImage: null, 
      isGenerating: false, 
      isFetchingHistory: false, 
      settings: DEFAULT_SETTINGS, 
      currentGenerationId: null, 
      focusedGenerationId: null 
    });
  }
}));

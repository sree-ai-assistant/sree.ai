import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface AIModel {
  id: string;
  name: string;
  model_id: string;
  provider: string;
  tier_required: 'free' | 'premium' | 'pro';
  is_vision: boolean;
  description: string;
}

interface ModelState {
  models: AIModel[];
  selectedModel: AIModel | null;
  loading: boolean;
  
  // Actions
  fetchModels: () => Promise<void>;
  setSelectedModel: (modelId: string) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  selectedModel: null,
  loading: false,

  fetchModels: async () => {
    set({ loading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/models`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        set({ 
          models: data.data,
          // Set default model if none selected
          selectedModel: get().selectedModel || data.data.find((m: AIModel) => m.model_id === 'meta/llama-3.1-70b-instruct') || data.data[0],
          loading: false 
        });
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      set({ loading: false });
    }
  },

  setSelectedModel: (modelId: string) => {
    const model = get().models.find(m => m.model_id === modelId);
    if (model) {
      set({ selectedModel: model });
    }
  },
}));

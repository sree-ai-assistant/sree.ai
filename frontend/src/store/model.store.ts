import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  visionRequired: boolean;
  
  // Actions
  fetchModels: () => Promise<void>;
  setSelectedModel: (modelId: string) => void;
  setVisionRequired: (required: boolean) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      models: [],
      selectedModel: null,
      loading: false,
      visionRequired: false,

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
            const models = data.data;
            const currentSelected = get().selectedModel;
            const visionReq = get().visionRequired;
            
            // Re-sync the selected model with the freshly fetched list to get updated details
            let updatedSelected = currentSelected 
              ? models.find((m: AIModel) => m.model_id === currentSelected.model_id) 
              : null;

            // If vision is required and current model isn't vision, auto-select a vision model
            if (visionReq && (!updatedSelected || !updatedSelected.is_vision)) {
              updatedSelected = models.find((m: AIModel) => m.is_vision) || updatedSelected;
            }

            set({ 
              models,
              selectedModel: updatedSelected || models.find((m: AIModel) => m.model_id === 'meta/llama-3.1-70b-instruct') || models[0],
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

      setVisionRequired: (required: boolean) => {
        const { models, selectedModel } = get();
        set({ visionRequired: required });

        if (required && selectedModel && !selectedModel.is_vision) {
          const visionModel = models.find(m => m.is_vision);
          if (visionModel) {
            set({ selectedModel: visionModel });
          }
        }
      },
    }),
    {
      name: 'model-storage',
      // Only persist selectedModel to ensure the UI shows the choice immediately on reload
      partialize: (state) => ({ selectedModel: state.selectedModel }),
    }
  )
);

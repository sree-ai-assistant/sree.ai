import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth.store';

export interface AIModel {
  id: string;
  name: string;
  model_id: string;
  provider: string;
  tier_required: 'free' | 'starter' | 'pro';
  is_vision: boolean;
  description: string;
  max_tokens: number;
  context_window: number;
  in_maintenance: boolean;
  is_fast: boolean;
  is_new: boolean;
  is_image: boolean;
  created_at: string;
}

const MODELS_CACHE_KEY = 'sree_models_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedModels {
  models: AIModel[];
  cachedAt: number;
  tier?: string;
}

function getCachedModels(): CachedModels | null {
  try {
    const raw = localStorage.getItem(MODELS_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedModels = JSON.parse(raw);
    if (!Array.isArray(parsed.models) || typeof parsed.cachedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedModels(models: AIModel[], tier: string): void {
  try {
    const cache: CachedModels = { models, cachedAt: Date.now(), tier };
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to cache models:', e);
  }
}

interface ModelState {
  models: AIModel[];
  selectedModel: AIModel | null;
  loading: boolean;
  visionRequired: boolean;
  
  // Actions
  fetchModels: (forceRefresh?: boolean) => Promise<void>;
  setSelectedModel: (modelId: string) => void;
  setVisionRequired: (required: boolean) => void;
}

/**
 * Applies model selection logic given a list of models and the current store state.
 * Extracted to avoid duplication between cached-path and API-path.
 */
function resolveSelectedModel(
  models: AIModel[],
  currentSelected: AIModel | null,
  visionRequired: boolean
): AIModel | null {
  // Re-sync the selected model with the list to get updated details
  let updatedSelected = currentSelected
    ? models.find((m) => m.model_id === currentSelected.model_id) ?? null
    : null;

  // If the selected model is now in maintenance, we need to pick a new one
  if (updatedSelected?.in_maintenance) {
    updatedSelected = null;
  }

  // If vision is required and current model isn't vision, auto-select a vision model
  if (visionRequired && (!updatedSelected || !updatedSelected.is_vision)) {
    updatedSelected = models.find((m) => m.is_vision && !m.in_maintenance) || updatedSelected;
  }

  return (
    updatedSelected ||
    models.find((m) => !m.is_image && m.model_id === 'meta/llama-3.1-70b-instruct' && !m.in_maintenance) ||
    models.find((m) => !m.is_image && !m.in_maintenance) ||
    models.find((m) => !m.is_image) ||
    models[0] ||
    null
  );
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      models: [],
      selectedModel: null,
      loading: false,
      visionRequired: false,

      fetchModels: async (forceRefresh = false) => {
        const currentTier = useAuthStore.getState().user?.plan_type || 'anonymous';

        // --- Check localStorage cache first ---
        if (!forceRefresh) {
          const cached = getCachedModels();
          if (
            cached && 
            cached.tier === currentTier && 
            (Date.now() - cached.cachedAt < CACHE_TTL_MS) && 
            cached.models.length > 0
          ) {
            // Cache is fresh and matching tier — use it, but only if the store is currently empty
            // (avoids overwriting in-memory state on every mount)
            if (get().models.length === 0) {
              const selected = resolveSelectedModel(cached.models, get().selectedModel, get().visionRequired);
              set({ models: cached.models, selectedModel: selected, loading: false });
            }
            return;
          }
        }

        // --- Fetch from API ---
        set({ loading: true });
        try {
          let session = null;
          try {
            const { data } = await Promise.race([
              supabase.auth.getSession(),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Session fetch timeout')), 3000))
            ]);
            session = data?.session;
          } catch (e) {
            console.warn('Model store session fetch timeout');
          }
          
          const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/models`, {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
            },
          });
          
          const data = await response.json();
          
          if (data.success) {
            const models = data.data;
            const selected = resolveSelectedModel(models, get().selectedModel, get().visionRequired);

            // Update localStorage cache
            setCachedModels(models, currentTier);

            set({ models, selectedModel: selected, loading: false });
          }
        } catch (error) {
          console.error('Error fetching models:', error);

          // On network failure, try to hydrate from stale cache so the UI isn't empty
          if (get().models.length === 0) {
            const staleCache = getCachedModels();
            if (staleCache && staleCache.models.length > 0) {
              const selected = resolveSelectedModel(staleCache.models, get().selectedModel, get().visionRequired);
              set({ models: staleCache.models, selectedModel: selected });
            }
          }

          set({ loading: false });
        }
      },

      setSelectedModel: (modelId: string) => {
        const model = get().models.find(m => m.model_id === modelId);
        if (model) {
          if (model.in_maintenance) {
            return; // Prevent selection of maintenance models
          }
          set({ selectedModel: model });
        }
      },

      setVisionRequired: (required: boolean) => {
        const { models, selectedModel } = get();
        set({ visionRequired: required });

        if (required && selectedModel && !selectedModel.is_vision) {
          const visionModel = models.find(m => m.is_vision && !m.in_maintenance);
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

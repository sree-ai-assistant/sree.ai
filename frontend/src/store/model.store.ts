import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ModelState {
  models: AIModel[];
  selectedModel: AIModel | null;
  cachedAt: number;
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
  let updatedSelected = currentSelected
    ? models.find((m) => m.model_id === currentSelected.model_id) ?? null
    : null;

  if (updatedSelected?.in_maintenance) {
    updatedSelected = null;
  }

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

// --- Hydration gate: resolved once Zustand finishes restoring from localStorage ---
let resolveHydration: () => void;
const hydrationReady = new Promise<void>((r) => { resolveHydration = r; });

// --- Deduplication lock: prevents concurrent API fetches ---
let inFlightFetch: Promise<void> | null = null;

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      models: [],
      selectedModel: null,
      cachedAt: 0,
      loading: false,
      visionRequired: false,

      fetchModels: async (forceRefresh = false) => {
        // Wait for Zustand to finish hydrating persisted state from localStorage.
        // Without this, get() returns defaults (models:[], cachedAt:0) and the
        // cache check always fails, causing a redundant API call on every page load.
        await hydrationReady;

        // --- Check hydrated in-memory cache ---
        if (!forceRefresh) {
          const { models, cachedAt } = get();
          if (
            models.length > 0 &&
            cachedAt > 0 &&
            (Date.now() - cachedAt < CACHE_TTL_MS)
          ) {
            const selected = resolveSelectedModel(models, get().selectedModel, get().visionRequired);
            set({ selectedModel: selected, loading: false });
            return;
          }
        }

        // --- Deduplicate: if a fetch is already in flight, piggyback on it ---
        if (inFlightFetch) {
          return inFlightFetch;
        }

        const doFetch = async () => {
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
              set({
                models,
                selectedModel: selected,
                cachedAt: Date.now(),
                loading: false
              });
            }
          } catch (error) {
            console.error('Error fetching models:', error);
            set({ loading: false });
          } finally {
            inFlightFetch = null;
          }
        };

        inFlightFetch = doFetch();
        return inFlightFetch;
      },

      setSelectedModel: (modelId: string) => {
        const model = get().models.find(m => m.model_id === modelId);
        if (model) {
          if (model.in_maintenance) {
            return;
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
      partialize: (state) => ({
        models: state.models,
        selectedModel: state.selectedModel,
        cachedAt: state.cachedAt,
      }),
      onRehydrateStorage: () => {
        // Called when hydration completes — unblock any waiting fetchModels calls
        return () => {
          resolveHydration();
        };
      },
    }
  )
);


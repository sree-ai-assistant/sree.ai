/**
 * Onboarding Store
 * 
 * Manages onboarding state with persistence via localStorage + Supabase.
 * Ensures users never lose progress on page refresh.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export interface OnboardingProfile {
  name: string;
  dateOfBirth: string; // ISO date string YYYY-MM-DD
  description: string;
}

export interface OnboardingApiKeys {
  google: string;
  groq: string;
  nvidia: string;
  deepgram: string;
}

interface OnboardingState {
  // Current step (1 or 2)
  currentStep: number;
  
  // Step 1: Profile
  profile: OnboardingProfile;
  
  // Step 2: API Keys
  apiKeys: OnboardingApiKeys;
  
  // Completion
  isCompleted: boolean;
  isSubmitting: boolean;
  
  // Actions
  setStep: (step: number) => void;
  setProfile: (profile: Partial<OnboardingProfile>) => void;
  setApiKey: (provider: keyof OnboardingApiKeys, value: string) => void;
  clearApiKey: (provider: keyof OnboardingApiKeys) => void;
  completeOnboarding: (userId: string) => Promise<boolean>;
  saveStepProgress: (userId: string, step: number) => Promise<void>;
  resetStore: () => void;
  prefillFromProvider: (providerData: { name?: string }) => void;
}

const INITIAL_STATE = {
  currentStep: 1,
  profile: {
    name: '',
    dateOfBirth: '',
    description: '',
  },
  apiKeys: {
    google: '',
    groq: '',
    nvidia: '',
    deepgram: '',
  },
  isCompleted: false,
  isSubmitting: false,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setStep: (step) => set({ currentStep: step }),

      setProfile: (profile) =>
        set((state) => ({
          profile: { ...state.profile, ...profile },
        })),

      setApiKey: (provider, value) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: value },
        })),

      clearApiKey: (provider) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: '' },
        })),

      prefillFromProvider: (providerData) => {
        if (providerData.name) {
          set((state) => ({
            profile: { ...state.profile, name: providerData.name || '' },
          }));
        }
      },

      saveStepProgress: async (userId, step) => {
        try {
          await supabase
            .from('profiles')
            .update({
              onboarding_step: step,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId);
        } catch (error) {
          console.error('[Onboarding] Failed to save step progress:', error);
        }
      },

      completeOnboarding: async (userId: string) => {
        const { profile } = get();
        set({ isSubmitting: true });

        try {
          // Save profile data to Supabase
          const updateData: Record<string, any> = {
            display_name: profile.name.trim(),
            date_of_birth: profile.dateOfBirth || null,
            description: profile.description.trim() || null,
            onboarding_completed: true,
            onboarding_step: 2,
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

          if (error) throw error;

          set({ isCompleted: true, isSubmitting: false });
          return true;
        } catch (error) {
          console.error('[Onboarding] Failed to complete onboarding:', error);
          set({ isSubmitting: false });
          return false;
        }
      },

      resetStore: () => set(INITIAL_STATE),
    }),
    {
      name: 'sree-onboarding',
      partialize: (state) => ({
        currentStep: state.currentStep,
        profile: state.profile,
        apiKeys: {
          // Never persist actual API keys in localStorage
          google: '',
          groq: '',
          nvidia: '',
          deepgram: '',
        },
      }),
    }
  )
);

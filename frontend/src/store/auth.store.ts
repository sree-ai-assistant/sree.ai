import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { userService } from '../lib/api';
import { getStoredAnonId, clearAnonId } from '../lib/fingerprint';
import { useChatStore } from './chat.store';
import { useUsageStore } from './usage.store';
import { useImageStore } from './image.store';
import { useModelStore } from './model.store';

export interface User {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  plan_type: 'free' | 'starter' | 'pro';
  requests_remaining?: number;
  credits?: number;
  onboarding_completed?: boolean;
  nickname?: string;
  occupation?: string;
  custom_instructions?: string;
  more_about_you?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  initialize: async () => {
    if (useAuthStore.getState().initialized) return;
    try {
      let session = null;
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Session fetch timeout')), 3000))
        ]);
        session = data?.session;
      } catch (e) {
        console.warn('Auth store init session fetch timeout');
      }
      
      if (session?.user) {
        // Fetch additional user profile data from public.profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, display_name, avatar_url, plan_type, requests_remaining, onboarding_completed, nickname, occupation, custom_instructions, more_about_you')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          set({ 
            user: {
              id: session.user.id,
              email: session.user.email || profile.email,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              plan_type: profile.plan_type as 'free' | 'starter' | 'pro',
              requests_remaining: profile.requests_remaining,
              credits: profile.requests_remaining,
              onboarding_completed: profile.onboarding_completed ?? false,
              nickname: profile.nickname,
              occupation: profile.occupation,
              custom_instructions: profile.custom_instructions,
              more_about_you: profile.more_about_you,
            }, 
            loading: false, 
            initialized: true 
          });
        } else {
          // Fallback to base user data if profile isn't ready yet
          set({ 
            user: { 
              id: session.user.id, 
              email: session.user.email || '',
              plan_type: 'free' as 'free'
            }, 
            loading: false, 
            initialized: true 
          });
        }
      } else {
        set({ user: null, loading: false, initialized: true });
        useModelStore.getState().fetchModels(false).catch(err => console.error('Failed to fetch models for anonymous user:', err));
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url, plan_type, requests_remaining, onboarding_completed, nickname, occupation, custom_instructions, more_about_you')
            .eq('id', session.user.id)
            .single();
          
          set({ 
            user: {
              id: session.user.id,
              email: session.user.email || '',
              display_name: profile?.display_name,
              avatar_url: profile?.avatar_url,
              plan_type: (profile?.plan_type as 'free' | 'starter' | 'pro') || 'free',
              requests_remaining: profile?.requests_remaining,
              credits: profile?.requests_remaining,
              onboarding_completed: profile?.onboarding_completed ?? false,
              nickname: profile?.nickname,
              occupation: profile?.occupation,
              custom_instructions: profile?.custom_instructions,
              more_about_you: profile?.more_about_you,
            }
          });

          // Let model.store handle cached models based on 24-hour expiration
          useModelStore.getState().fetchModels(false).catch(err => console.error('Failed to fetch models:', err));

          // Trigger data migration ONLY during explicit SIGNED_IN login/signup flow (MIG-04)
          const anonId = getStoredAnonId();
          if (event === 'SIGNED_IN' && anonId) {
            try {
              console.log('[AuthStore] Triggering anonymous data migration...');
              await userService.migrateAnonymousData(anonId);
              clearAnonId();
              console.log('[AuthStore] Migration complete, anonymous identity cleared.');
            } catch (err) {
              console.error('[AuthStore] Migration failed:', err);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          set({ user: null });
          useChatStore.getState().clearStore();
          useUsageStore.getState().clearStore();
          useImageStore.getState().clearStore();
          // Let model.store handle cached models based on 24-hour expiration
          useModelStore.getState().fetchModels(false).catch(err => console.error('Failed to fetch anonymous models on sign out:', err));
          
          if (window.location.pathname !== '/chat' && window.location.pathname !== '/') {
            window.location.href = '/chat';
          }
        }
      });

    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ loading: false, initialized: true });
    }
  },
  updateProfile: async (data: Partial<User>) => {
    const { user } = useAuthStore.getState();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id);

      if (error) throw error;
      set({ user: { ...user, ...data } });
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
    useChatStore.getState().clearStore();
    useUsageStore.getState().clearStore();
    useImageStore.getState().clearStore();
    window.location.href = '/chat';
  },
}));

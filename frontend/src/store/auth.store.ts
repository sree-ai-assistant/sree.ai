import { create } from 'zustand';
import posthog from 'posthog-js';
import { supabase } from '../lib/supabase';
import { userService } from '../lib/api';
import { getStoredAnonId, clearAnonId } from '../lib/fingerprint';
import { getStoredConsent, getStoredConsentTimestamp } from '../components/shared/CookieConsent';
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
  live_voice?: string;
  provider?: string;
  file_upload_agreed?: boolean;
  file_upload_agreed_at?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

let activeInitializePromise: Promise<void> | null = null;

// Tracks whether one-time sign-in tasks (PostHog identify, consent sync,
// TOS sync, data migration) have run for this page load. The flag prevents
// double-runs when both initialize() and onAuthStateChange fire for the
// same user (common after OAuth redirects). Reset on SIGNED_OUT.
let signInTasksCompleted = false;

/**
 * One-time sign-in tasks that MUST run exactly once per page load.
 * Called from both initialize() and onAuthStateChange to cover all flows:
 *   - OAuth redirect (initialize runs first, onAuthStateChange fires late)
 *   - Email login (onAuthStateChange fires with SIGNED_IN)
 *   - Page refresh (initialize finds existing session)
 *
 * The signInTasksCompleted flag ensures idempotency — whichever path
 * calls this first wins, the second call is a no-op.
 */
async function runSignInTasks(session: { user: { id: string; email?: string; app_metadata?: any; identities?: any[]; user_metadata?: any } }) {
  if (signInTasksCompleted) return;
  signInTasksCompleted = true;

  const currentProfile = useAuthStore.getState().user;
  const provider = currentProfile?.provider ||
    session.user.app_metadata?.provider ||
    session.user.identities?.[0]?.provider ||
    'email';

  // ── PostHog: Identify the logged-in user ──────────────────────
  if (posthog.__loaded) {
    try {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: currentProfile?.display_name || currentProfile?.nickname,
        plan_type: currentProfile?.plan_type || 'free',
        occupation: currentProfile?.occupation,
        provider: provider,
      });
    } catch (e) {
      console.warn('[PostHog] identify failed:', e);
    }
  }

  // ── Sync cookie consent to profiles table (first-time only) ────
  const consentStatus = getStoredConsent();
  const consentTimestamp = getStoredConsentTimestamp();
  if (consentStatus) {
    // Only write if the profile doesn't already have a consent record
    const { data: consentProfile } = await supabase
      .from('profiles')
      .select('cookie_consent_at')
      .eq('id', session.user.id)
      .single();

    if (!consentProfile?.cookie_consent_at) {
      supabase
        .from('profiles')
        .update({
          cookie_consent: consentStatus === 'accepted',
          cookie_consent_at: consentTimestamp,
        })
        .eq('id', session.user.id)
        .then(({ error }) => {
          if (error) console.warn('[CookieConsent] Failed to sync consent to profile:', error);
          else console.log('[AuthStore] Cookie consent synced to profile (first-time)');
        });
    }
  }

  // ── Sync pending TOS & Privacy acceptance (first-time only) ────
  // Only fires on signup (LoginForm no longer sets the pending flag).
  // Guard: skip if the profile already has tos_accepted = true,
  // preserving the original acceptance timestamp.
  try {
    const pendingTos = localStorage.getItem('pending_tos_accepted');
    if (pendingTos === 'true') {
      // Check if TOS was already accepted (returning user or re-signup)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('tos_accepted')
        .eq('id', session.user.id)
        .single();

      if (!existingProfile?.tos_accepted) {
        const tosTimestamp = localStorage.getItem('pending_tos_accepted_at') || new Date().toISOString();
        supabase
          .from('profiles')
          .update({
            tos_accepted: true,
            tos_accepted_at: tosTimestamp,
            privacy_accepted: true,
            privacy_accepted_at: tosTimestamp,
          })
          .eq('id', session.user.id)
          .then(({ error }) => {
            if (error) console.warn('[AuthStore] Failed to sync TOS acceptance:', error);
            else console.log('[AuthStore] TOS & Privacy acceptance synced to profile (first-time)');
          });
      }
      // Clear the pending flags regardless
      localStorage.removeItem('pending_tos_accepted');
      localStorage.removeItem('pending_tos_accepted_at');
    }
  } catch (e) {
    console.warn('[AuthStore] Error syncing pending TOS:', e);
  }

  // ── Anonymous data migration (MIG-04) ────────────────────────
  const anonId = getStoredAnonId();
  if (anonId) {
    try {
      console.log('[AuthStore] Triggering anonymous data migration for anon_id:', anonId);
      await userService.migrateAnonymousData(anonId);
      clearAnonId();
      console.log('[AuthStore] Migration complete, anonymous identity cleared.');
    } catch (err) {
      console.error('[AuthStore] Migration failed:', err);
    }
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  initialize: async () => {
    if (useAuthStore.getState().initialized) return;

    if (activeInitializePromise) {
      return activeInitializePromise;
    }

    activeInitializePromise = (async () => {
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
            .select('id, email, display_name, avatar_url, plan_type, requests_remaining, onboarding_completed, nickname, occupation, custom_instructions, more_about_you, live_voice, file_upload_agreed, file_upload_agreed_at')
            .eq('id', session.user.id)
            .single();

          const provider = session.user.app_metadata?.provider ||
            session.user.identities?.[0]?.provider ||
            (session.user.app_metadata?.providers?.[0]) ||
            'email';

          if (profile) {
            let avatarUrl = profile.avatar_url;
            if (!avatarUrl) {
              const oauthAvatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture;
              if (oauthAvatar) {
                avatarUrl = oauthAvatar;
                supabase
                  .from('profiles')
                  .update({ avatar_url: oauthAvatar })
                  .eq('id', session.user.id)
                  .then(({ error }) => {
                    if (error) console.error('Error syncing OAuth avatar on init:', error);
                  });
              }
            }

            set({
              user: {
                id: session.user.id,
                email: session.user.email || profile.email,
                display_name: profile.display_name,
                avatar_url: avatarUrl,
                plan_type: profile.plan_type as 'free' | 'starter' | 'pro',
                requests_remaining: profile.requests_remaining,
                credits: profile.requests_remaining,
                onboarding_completed: profile.onboarding_completed ?? false,
                nickname: profile.nickname,
                occupation: profile.occupation,
                custom_instructions: profile.custom_instructions,
                more_about_you: profile.more_about_you,
                live_voice: profile.live_voice || 'Zephyr',
                provider,
                file_upload_agreed: profile.file_upload_agreed ?? false,
                file_upload_agreed_at: profile.file_upload_agreed_at,
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
                plan_type: 'free' as 'free',
                provider,
              },
              loading: false,
              initialized: true
            });
          }

          // ── Run one-time sign-in tasks from initialize() ──────────
          // Critical: On OAuth redirects, the page reloads fresh. 
          // initialize() runs FIRST and finds the session.
          // onAuthStateChange may fire INITIAL_SESSION later, but by then
          // the user is already loaded and tasks might be skipped.
          // Running tasks here ensures migration, PostHog, and consent
          // sync happen immediately after the session is found.
          await runSignInTasks(session);

        } else {
          set({ user: null, loading: false, initialized: true });
          useModelStore.getState().fetchModels(false).catch(err => console.error('Failed to fetch models for anonymous user:', err));
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
          if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
            const currentUser = useAuthStore.getState().user;
            const alreadyLoaded = currentUser && currentUser.id === session.user.id;

            // ── 1. Profile fetch (skip if already loaded) ──────────────────
            // On OAuth redirects, initialize() already fetched the profile
            // before onAuthStateChange fires, so we can skip the duplicate fetch.
            if (!alreadyLoaded) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name, avatar_url, plan_type, requests_remaining, onboarding_completed, nickname, occupation, custom_instructions, more_about_you, live_voice, file_upload_agreed, file_upload_agreed_at')
                .eq('id', session.user.id)
                .single();

              let avatarUrl = profile?.avatar_url;
              if (!avatarUrl && profile) {
                const oauthAvatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture;
                if (oauthAvatar) {
                  avatarUrl = oauthAvatar;
                  supabase
                    .from('profiles')
                    .update({ avatar_url: oauthAvatar })
                    .eq('id', session.user.id)
                    .then(({ error }) => {
                      if (error) console.error('Error syncing OAuth avatar on auth change:', error);
                    });
                }
              }

              const provider = session.user.app_metadata?.provider ||
                session.user.identities?.[0]?.provider ||
                (session.user.app_metadata?.providers?.[0]) ||
                'email';

              set({
                user: {
                  id: session.user.id,
                  email: session.user.email || '',
                  display_name: profile?.display_name,
                  avatar_url: avatarUrl,
                  plan_type: (profile?.plan_type as 'free' | 'starter' | 'pro') || 'free',
                  requests_remaining: profile?.requests_remaining,
                  credits: profile?.requests_remaining,
                  onboarding_completed: profile?.onboarding_completed ?? false,
                  nickname: profile?.nickname,
                  occupation: profile?.occupation,
                  custom_instructions: profile?.custom_instructions,
                  more_about_you: profile?.more_about_you,
                  live_voice: profile?.live_voice || 'Zephyr',
                  provider,
                  file_upload_agreed: profile?.file_upload_agreed ?? false,
                  file_upload_agreed_at: profile?.file_upload_agreed_at,
                }
              });

              // Let model.store handle cached models based on 24-hour expiration
              useModelStore.getState().fetchModels(false).catch(err => console.error('Failed to fetch models:', err));
            }

            // ── 2. One-time sign-in tasks ───────────────────────────────
            // Delegates to the shared runSignInTasks() function.
            // The signInTasksCompleted flag inside it ensures idempotency —
            // if initialize() already ran tasks, this is a no-op.
            await runSignInTasks(session);
          } else if (event === 'SIGNED_OUT') {
            // ── PostHog: Reset to anonymous state ─────────────────────
            // Only runs if user accepted cookies (PostHog is initialized).
            if (posthog.__loaded) {
              try {
                posthog.reset();
              } catch (e) {
                console.warn('[PostHog] reset failed:', e);
              }
            }

            // Reset sign-in tasks flag so they re-run on next login
            signInTasksCompleted = false;

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
      } finally {
        activeInitializePromise = null;
      }
    })();

    return activeInitializePromise;
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
  fetchProfile: async () => {
    const { user } = useAuthStore.getState();
    if (!user || user.provider === 'anonymous') return;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('plan_type, requests_remaining')
        .eq('id', user.id)
        .single();

      if (!error && profile) {
        set({ user: { ...user, plan_type: profile.plan_type as any, requests_remaining: profile.requests_remaining, credits: profile.requests_remaining } });
      }
    } catch (error) {
      console.error('Fetch profile error:', error);
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

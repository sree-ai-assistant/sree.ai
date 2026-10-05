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
  provider_avatar_url?: string;
  google_avatar_url?: string;
  github_avatar_url?: string;
  providers?: string[];
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

/**
 * Detect the active provider for the current session.
 * In Supabase, if a user links multiple providers (e.g. Google and GitHub),
 * app_metadata.provider always remains the initial provider (e.g. 'google').
 * We resolve the active provider by checking:
 * 1. session.provider_token (e.g. 'gho_' = GitHub, 'ya29.' = Google)
 * 2. localStorage 'last_login_method' (set when user clicks provider button)
 * 3. Most recently used identity by last_sign_in_at in session.user.identities
 * 4. Fallback to app_metadata.provider / first identity / 'email'
 */
export const resolveActiveProvider = (session: any): string => {
  if (!session?.user) return 'email';

  // 1. Check provider_token if present in session
  const providerToken = session.provider_token;
  if (typeof providerToken === 'string') {
    if (providerToken.startsWith('gho_') || providerToken.startsWith('ghu_') || providerToken.startsWith('ghp_')) {
      return 'github';
    }
    if (providerToken.startsWith('ya29.')) {
      return 'google';
    }
  }

  // 2. Check localStorage 'last_login_method'
  try {
    const lastLogin = localStorage.getItem('last_login_method');
    if (lastLogin && (lastLogin === 'github' || lastLogin === 'google')) {
      const hasIdentity = session.user.identities?.some((id: any) => id.provider === lastLogin);
      if (hasIdentity) {
        return lastLogin;
      }
    }
  } catch (e) { }

  // 3. Check identities sorted by last_sign_in_at (most recent first)
  if (Array.isArray(session.user.identities) && session.user.identities.length > 0) {
    const sorted = [...session.user.identities].sort((a: any, b: any) => {
      const timeA = a.last_sign_in_at ? (Date.parse(a.last_sign_in_at) || 0) : 0;
      const timeB = b.last_sign_in_at ? (Date.parse(b.last_sign_in_at) || 0) : 0;
      return timeB - timeA;
    });
    if (sorted[0]?.provider) {
      return sorted[0].provider;
    }
  }

  return session.user.app_metadata?.provider ||
    session.user.identities?.[0]?.provider ||
    session.user.app_metadata?.providers?.[0] ||
    'email';
};

/**
 * Check if an avatar URL is a user-uploaded custom avatar (stored in Supabase assets bucket)
 */
export const isCustomUploadedAvatar = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.includes('/storage/v1/object/public/assets/')) return true;
  if (trimmed.includes('googleusercontent.com') || trimmed.includes('githubusercontent.com') || trimmed.includes('dicebear.com')) {
    return false;
  }
  return true;
};

/**
 * Extract avatar for a specific provider from session user identities or metadata
 */
export const getProviderAvatar = (sessionUser: any, targetProvider: string): string | null => {
  if (!sessionUser) return null;

  // 1. Check identities array (where Supabase stores per-provider payload)
  if (Array.isArray(sessionUser.identities)) {
    const identity = sessionUser.identities.find((id: any) => id.provider === targetProvider);
    if (identity?.identity_data) {
      const data = identity.identity_data;
      if (typeof data.avatar_url === 'string' && data.avatar_url.trim()) return data.avatar_url.trim();
      if (typeof data.picture === 'string' && data.picture.trim()) return data.picture.trim();
    }
  }

  // 2. Check user_metadata
  const meta = sessionUser.user_metadata || {};
  if (targetProvider === 'google') {
    if (meta.iss?.includes('google') || sessionUser.app_metadata?.provider === 'google') {
      if (typeof meta.picture === 'string' && meta.picture.trim()) return meta.picture.trim();
      if (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) return meta.avatar_url.trim();
    }
  }
  if (targetProvider === 'github') {
    if (meta.iss?.includes('github') || sessionUser.app_metadata?.provider === 'github') {
      if (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) return meta.avatar_url.trim();
    }
  }

  return null;
};

/**
 * Safely extract avatar URL from OAuth provider metadata (Google picture/avatar_url, GitHub avatar_url, etc.)
 */
export const extractProviderAvatarUrl = (sessionUser?: any): string | null => {
  if (!sessionUser) return null;
  const meta = sessionUser.user_metadata || {};
  if (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) {
    return meta.avatar_url.trim();
  }
  if (typeof meta.picture === 'string' && meta.picture.trim()) {
    return meta.picture.trim();
  }
  if (Array.isArray(sessionUser.identities)) {
    for (const identity of sessionUser.identities) {
      const idData = identity?.identity_data;
      if (typeof idData?.avatar_url === 'string' && idData.avatar_url.trim()) {
        return idData.avatar_url.trim();
      }
      if (typeof idData?.picture === 'string' && idData.picture.trim()) {
        return idData.picture.trim();
      }
    }
  }
  return null;
};


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
    resolveActiveProvider(session);

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

          const activeProvider = resolveActiveProvider(session);
          const googleAvatar = getProviderAvatar(session.user, 'google');
          const githubAvatar = getProviderAvatar(session.user, 'github');
          const activeProviderAvatar = activeProvider === 'github'
            ? githubAvatar
            : (activeProvider === 'google' ? googleAvatar : extractProviderAvatarUrl(session.user));

          if (profile) {
            let avatarUrl = profile.avatar_url;
            const hasCustomAvatar = isCustomUploadedAvatar(avatarUrl);

            // If user has not uploaded a custom avatar, synchronize with current active login provider
            if (!hasCustomAvatar && activeProviderAvatar) {
              if (avatarUrl !== activeProviderAvatar) {
                avatarUrl = activeProviderAvatar;
                supabase
                  .from('profiles')
                  .update({ avatar_url: activeProviderAvatar })
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
                provider_avatar_url: activeProviderAvatar || undefined,
                google_avatar_url: googleAvatar || undefined,
                github_avatar_url: githubAvatar || undefined,
                providers: session.user.app_metadata?.providers || [activeProvider],
                plan_type: profile.plan_type as 'free' | 'starter' | 'pro',
                requests_remaining: profile.requests_remaining,
                credits: profile.requests_remaining,
                onboarding_completed: profile.onboarding_completed ?? false,
                nickname: profile.nickname,
                occupation: profile.occupation,
                custom_instructions: profile.custom_instructions,
                more_about_you: profile.more_about_you,
                live_voice: profile.live_voice || 'Zephyr',
                provider: activeProvider,
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
                avatar_url: activeProviderAvatar || undefined,
                provider_avatar_url: activeProviderAvatar || undefined,
                google_avatar_url: googleAvatar || undefined,
                github_avatar_url: githubAvatar || undefined,
                providers: session.user.app_metadata?.providers || [activeProvider],
                plan_type: 'free' as 'free',
                provider: activeProvider,
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
            const activeProvider = resolveActiveProvider(session);
            const alreadyLoaded = currentUser && currentUser.id === session.user.id && currentUser.provider === activeProvider;

            // ── 1. Profile fetch (skip if already loaded) ──────────────────
            // On OAuth redirects, initialize() already fetched the profile
            // before onAuthStateChange fires, so we can skip the duplicate fetch.
            if (!alreadyLoaded) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name, avatar_url, plan_type, requests_remaining, onboarding_completed, nickname, occupation, custom_instructions, more_about_you, live_voice, file_upload_agreed, file_upload_agreed_at')
                .eq('id', session.user.id)
                .single();

              const googleAvatar = getProviderAvatar(session.user, 'google');
              const githubAvatar = getProviderAvatar(session.user, 'github');
              const activeProviderAvatar = activeProvider === 'github'
                ? githubAvatar
                : (activeProvider === 'google' ? googleAvatar : extractProviderAvatarUrl(session.user));

              let avatarUrl = profile?.avatar_url;
              const hasCustomAvatar = isCustomUploadedAvatar(avatarUrl);

              if (!hasCustomAvatar && activeProviderAvatar) {
                if (avatarUrl !== activeProviderAvatar) {
                  avatarUrl = activeProviderAvatar;
                  supabase
                    .from('profiles')
                    .update({ avatar_url: activeProviderAvatar })
                    .eq('id', session.user.id)
                    .then(({ error }) => {
                      if (error) console.error('Error syncing OAuth avatar on auth change:', error);
                    });
                }
              }

              set({
                user: {
                  id: session.user.id,
                  email: session.user.email || '',
                  display_name: profile?.display_name,
                  avatar_url: avatarUrl,
                  provider_avatar_url: activeProviderAvatar || undefined,
                  google_avatar_url: googleAvatar || undefined,
                  github_avatar_url: githubAvatar || undefined,
                  providers: session.user.app_metadata?.providers || [activeProvider],
                  plan_type: (profile?.plan_type as 'free' | 'starter' | 'pro') || 'free',
                  requests_remaining: profile?.requests_remaining,
                  credits: profile?.requests_remaining,
                  onboarding_completed: profile?.onboarding_completed ?? false,
                  nickname: profile?.nickname,
                  occupation: profile?.occupation,
                  custom_instructions: profile?.custom_instructions,
                  more_about_you: profile?.more_about_you,
                  live_voice: profile?.live_voice || 'Zephyr',
                  provider: activeProvider,
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
        .select('plan_type, requests_remaining, avatar_url')
        .eq('id', user.id)
        .single();

      if (!error && profile) {
        set({
          user: {
            ...user,
            avatar_url: profile.avatar_url ?? user.avatar_url,
            plan_type: profile.plan_type as any,
            requests_remaining: profile.requests_remaining,
            credits: profile.requests_remaining
          }
        });
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

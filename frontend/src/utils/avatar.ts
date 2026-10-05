import { getStoredAnonId } from '../lib/fingerprint';

/**
 * User Avatar Helpers for Sree AI
 * 
 * Provides fallback avatars via DiceBear API 10.x:
 * - Anonymous / Guest: Micah collection, seeded with their anonymous ID (anonId)
 * - Logged-in without avatar: Toon-head collection, seeded with their user ID (userId)
 * - Google/GitHub OAuth or custom uploaded: uses user.avatar_url
 */

export const getAnonymousAvatarUrl = (seed?: string | null): string => {
  const resolvedSeed = (seed && seed.trim()) || getStoredAnonId() || 'chadda';
  return `https://api.dicebear.com/10.x/micah/svg?backgroundColor=ff5d8f,ffb703,43aa8b,4d96ff,b57bff&flip=horizontal&seed=${encodeURIComponent(resolvedSeed)}`;
};

export const getLoggedInDefaultAvatarUrl = (userId?: string | null): string => {
  const resolvedSeed = (userId && userId.trim()) || 'mtlglvue';
  return `https://api.dicebear.com/10.x/toon-head/svg?backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676&seed=${encodeURIComponent(resolvedSeed)}`;
};

// Static default constants for fallback reference
export const ANONYMOUS_AVATAR_URL =
  'https://api.dicebear.com/10.x/micah/svg?backgroundColor=ff5d8f,ffb703,43aa8b,4d96ff,b57bff&flip=horizontal&seed=chadda';

export const LOGGED_IN_DEFAULT_AVATAR_URL =
  'https://api.dicebear.com/10.x/toon-head/svg?backgroundColor=ff2e63,00c2a8,ffb300,3d5afe,8e24aa,00e676&seed=mtlglvue';

export interface UserAvatarSource {
  avatar_url?: string | null;
  provider_avatar_url?: string | null;
  google_avatar_url?: string | null;
  github_avatar_url?: string | null;
  email?: string | null;
  id?: string | null;
  user_metadata?: any;
}

export const isValidAvatarUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('data:image/') || trimmed.startsWith('blob:');
};

export const getUserAvatarUrl = (
  user?: UserAvatarSource | null,
  isGuest?: boolean,
  anonId?: string | null
): string => {
  if (isGuest || !user || !user.email) {
    return getAnonymousAvatarUrl(anonId);
  }
  if (user.avatar_url && isValidAvatarUrl(user.avatar_url)) {
    return user.avatar_url.trim();
  }
  if (user.provider_avatar_url && isValidAvatarUrl(user.provider_avatar_url)) {
    return user.provider_avatar_url.trim();
  }
  const metaAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  if (metaAvatar && isValidAvatarUrl(metaAvatar)) {
    return metaAvatar.trim();
  }
  return getLoggedInDefaultAvatarUrl(user.id);
};



/**
 * Plan Configuration — Single Source of Truth
 * 
 * All tier limits, features, and pricing defined here.
 * Referenced by: subscription.service.ts, usage.service.ts, rate-limit middleware
 */

export type PlanTier = 'anonymous' | 'free' | 'starter' | 'pro';
export type ToolType = 'chat' | 'voice' | 'image' | 'file_upload' | 'download';

export interface ToolLimits {
  perMinute: number;
  daily: number;
  monthly: number | null; // null = no monthly limit (anonymous)
}

export interface PlanConfig {
  tier: PlanTier;
  displayName: string;
  price: number; // USD per month
  features: {
    basicChat: boolean;
    fileUpload: boolean;
    imageGeneration: boolean;
    voiceToText: boolean;
    allModels: boolean;
    chatHistory: 'none' | 'limited' | 'full';
    priorityQueue: number; // 0=lowest, 3=highest
    storageGb: number;
  };
  limits: Record<ToolType, ToolLimits>;
  uploadLimitMb: number; // 0 = blocked
  requestsPerMinute: number;
}

export const PLAN_CONFIGS: Readonly<Record<PlanTier, PlanConfig>> = Object.freeze({
  anonymous: {
    tier: 'anonymous',
    displayName: 'Anonymous',
    price: 0,
    features: {
      basicChat: true,
      fileUpload: false,
      imageGeneration: false,
      voiceToText: true,
      allModels: false,
      chatHistory: 'none',
      priorityQueue: 0,
      storageGb: 0,
    },
    limits: {
      chat:  { perMinute: 3, daily: 10, monthly: null },
      voice: { perMinute: 3, daily: 10, monthly: null },
      image: { perMinute: 0, daily: 0,  monthly: null },
      file_upload: { perMinute: 0, daily: 0, monthly: null },
      download: { perMinute: 0, daily: 0, monthly: null },
    },
    uploadLimitMb: 0,
    requestsPerMinute: 3,
  },

  free: {
    tier: 'free',
    displayName: 'Free',
    price: 0,
    features: {
      basicChat: true,
      fileUpload: true,
      imageGeneration: true,
      voiceToText: true,
      allModels: false,
      chatHistory: 'limited',
      priorityQueue: 1,
      storageGb: 0.1, // 100MB
    },
    limits: {
      chat:  { perMinute: 5, daily: 10, monthly: 50 },
      voice: { perMinute: 5, daily: 20, monthly: 50 },
      image: { perMinute: 5, daily: 5,  monthly: 30 },
      file_upload: { perMinute: 5, daily: 10, monthly: 50 },
      download: { perMinute: 10, daily: 50, monthly: 200 },
    },
    uploadLimitMb: 10,
    requestsPerMinute: 5,
  },

  starter: {
    tier: 'starter',
    displayName: 'Starter',
    price: 8,
    features: {
      basicChat: true,
      fileUpload: true,
      imageGeneration: true,
      voiceToText: true,
      allModels: true,
      chatHistory: 'full',
      priorityQueue: 2,
      storageGb: 5,
    },
    limits: {
      chat:  { perMinute: 10, daily: 50, monthly: 600 },
      voice: { perMinute: 10, daily: 60, monthly: 500 },
      image: { perMinute: 10, daily: 30,  monthly: 70 },
      file_upload: { perMinute: 10, daily: 100, monthly: 1000 },
      download: { perMinute: 20, daily: 500, monthly: 5000 },
    },
    uploadLimitMb: 100,
    requestsPerMinute: 10,
  },

  pro: {
    tier: 'pro',
    displayName: 'Pro',
    price: 29,
    features: {
      basicChat: true,
      fileUpload: true,
      imageGeneration: true,
      voiceToText: true,
      allModels: true,
      chatHistory: 'full',
      priorityQueue: 3,
      storageGb: 10,
    },
    limits: {
      chat:  { perMinute: 20, daily: 200, monthly: 3000 },
      voice: { perMinute: 20, daily: 100, monthly: 1000 },
      image: { perMinute: 20, daily: 70,  monthly: 1000 },
      file_upload: { perMinute: 50, daily: 999, monthly: 9999 },
      download: { perMinute: 100, daily: 999, monthly: 9999 },
    },
    uploadLimitMb: 500,
    requestsPerMinute: 20,
  },
});

/** BYOK quota multiplier — using own API key reduces quota consumption */
export const BYOK_QUOTA_MULTIPLIER = 0.2;

/** Default tier for new authenticated users */
export const DEFAULT_AUTHENTICATED_TIER: PlanTier = 'free';

/** Helper: Get plan config for a tier, defaults to 'free' for unknown tiers */
export function getPlanConfig(tier: string): PlanConfig {
  const normalizedTier = tier.toLowerCase() as PlanTier;
  return PLAN_CONFIGS[normalizedTier] || PLAN_CONFIGS.free;
}

/** Helper: Get tool limits for a specific tier and tool */
export function getToolLimits(tier: string, tool: ToolType): ToolLimits {
  return getPlanConfig(tier).limits[tool];
}

/** Helper: Check if a tier can access a feature */
export function canAccessFeature(
  tier: string,
  feature: keyof PlanConfig['features']
): boolean {
  const config = getPlanConfig(tier);
  const value = config.features[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return value !== 'none';
}

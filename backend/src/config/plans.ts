/**
 * Plan Configuration — Single Source of Truth
 * 
 * All tier limits, features, and pricing defined here.
 * Referenced by: subscription.service.ts, usage.service.ts, rate-limit middleware
 */

export type PlanTier = 'anonymous' | 'free' | 'starter' | 'pro';
export type ToolType = 'chat' | 'voice' | 'image';

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
    fileUpload: boolean;
    imageGeneration: boolean;
    allModels: boolean;
    chatHistory: 'none' | 'limited' | 'full';
    priorityQueue: number; // 0=lowest, 3=highest
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
      fileUpload: false,
      imageGeneration: false,
      allModels: false,
      chatHistory: 'none',
      priorityQueue: 0,
    },
    limits: {
      chat:  { perMinute: 3, daily: 10, monthly: null },
      voice: { perMinute: 3, daily: 10, monthly: null },
      image: { perMinute: 0, daily: 0,  monthly: null },
    },
    uploadLimitMb: 0,
    requestsPerMinute: 3,
  },

  free: {
    tier: 'free',
    displayName: 'Free',
    price: 0,
    features: {
      fileUpload: true,
      imageGeneration: true,
      allModels: false,
      chatHistory: 'limited',
      priorityQueue: 1,
    },
    limits: {
      chat:  { perMinute: 5, daily: 10, monthly: 50 },
      voice: { perMinute: 5, daily: 20, monthly: 50 },
      image: { perMinute: 5, daily: 5,  monthly: 30 },
    },
    uploadLimitMb: 10,
    requestsPerMinute: 5,
  },

  starter: {
    tier: 'starter',
    displayName: 'Starter',
    price: 8,
    features: {
      fileUpload: true,
      imageGeneration: true,
      allModels: true,
      chatHistory: 'full',
      priorityQueue: 2,
    },
    limits: {
      chat:  { perMinute: 10, daily: 50,  monthly: 600 },
      voice: { perMinute: 10, daily: 60,  monthly: 500 },
      image: { perMinute: 10, daily: 30,  monthly: 70 },
    },
    uploadLimitMb: 50,
    requestsPerMinute: 10,
  },

  pro: {
    tier: 'pro',
    displayName: 'Pro',
    price: 29,
    features: {
      fileUpload: true,
      imageGeneration: true,
      allModels: true,
      chatHistory: 'full',
      priorityQueue: 3,
    },
    limits: {
      chat:  { perMinute: 20, daily: 200, monthly: 3000 },
      voice: { perMinute: 20, daily: 100, monthly: 1000 },
      image: { perMinute: 20, daily: 70,  monthly: 1000 },
    },
    uploadLimitMb: 250,
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

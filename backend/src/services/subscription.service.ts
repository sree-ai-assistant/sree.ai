/**
 * Subscription Service
 *
 * Resolves user tiers, looks up subscription records, and provides
 * feature/tool gating helpers.  All plan logic delegates to plans.ts.
 *
 * Phase 8 — Rate Limiting Engine
 */

import { supabaseAdmin } from '../lib/supabase';
import {
  type PlanTier,
  type PlanConfig,
  type ToolType,
  getPlanConfig,
  canAccessFeature as planCanAccessFeature,
  getToolLimits,
  DEFAULT_AUTHENTICATED_TIER,
} from '../config/plans';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  tier: PlanTier;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Core helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve the effective plan tier for an authenticated user.
 *
 * Lookup order:
 *  1. subscriptions.tier (most authoritative — billing system sets this)
 *  2. profiles.plan_type (legacy / free-tier fallback)
 *  3. DEFAULT_AUTHENTICATED_TIER ('free')
 */
export async function getUserTier(userId: string): Promise<PlanTier> {
  // Try subscriptions first
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('tier')
    .eq('user_id', userId)
    .single();

  if (sub?.tier) {
    const tier = sub.tier.toLowerCase() as PlanTier;
    // Validate against known tiers
    if (['free', 'starter', 'pro'].includes(tier)) return tier;
  }

  // Fall back to profiles.plan_type
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan_type')
    .eq('id', userId)
    .single();

  if (profile?.plan_type) {
    const tier = profile.plan_type.toLowerCase() as PlanTier;
    if (['free', 'starter', 'pro'].includes(tier)) return tier;
  }

  return DEFAULT_AUTHENTICATED_TIER;
}

/**
 * Get the full subscription record (with billing cycle dates).
 */
export async function getSubscription(
  userId: string,
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, tier, billing_cycle_start, billing_cycle_end, created_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as SubscriptionRecord;
}

/**
 * Get the billing-cycle end date for an authenticated user.
 * Returns `null` for anonymous or if no subscription exists.
 */
export async function getBillingCycleEnd(
  userId: string,
): Promise<Date | null> {
  const sub = await getSubscription(userId);
  return sub?.billing_cycle_end ? new Date(sub.billing_cycle_end) : null;
}

/* ------------------------------------------------------------------ */
/*  Feature / tool access checks                                       */
/* ------------------------------------------------------------------ */

/**
 * Check whether a tier grants access to a given feature.
 * Delegates to the canonical helper in plans.ts.
 */
export function canAccessFeature(
  tier: string,
  feature: keyof PlanConfig['features'],
): boolean {
  return planCanAccessFeature(tier, feature);
}

/**
 * Check whether a tier can use a specific tool (daily limit > 0).
 */
export function canAccessTool(tier: string, tool: ToolType): boolean {
  const limits = getToolLimits(tier, tool);
  return limits.daily > 0;
}

/**
 * Get the full plan config for a tier.
 */
export function getPlan(tier: string): PlanConfig {
  return getPlanConfig(tier);
}

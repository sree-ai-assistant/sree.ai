/**
 * Razorpay Service
 *
 * Handles all Razorpay payment gateway interactions:
 * - Plan creation & management
 * - Subscription lifecycle (create, cancel, fetch)
 * - Payment verification (checkout + webhook signatures)
 *
 * Currency: INR (paise). Display-only USD equivalents handled by frontend.
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';

/* ------------------------------------------------------------------ */
/*  SDK Initialisation                                                  */
/* ------------------------------------------------------------------ */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/* ------------------------------------------------------------------ */
/*  Plan Pricing (amounts in paise — 1 INR = 100 paise)                */
/* ------------------------------------------------------------------ */

export const PLAN_PRICES_INR = {
  starter: {
    monthly: 39_900,   // ₹399/mo
    annually: 383_280,  // ₹3,832.80/yr  (₹319.40/mo × 12, ~20% off)
  },
  pro: {
    monthly: 89_900,   // ₹899/mo
    annually: 863_040,  // ₹8,630.40/yr  (₹719.20/mo × 12, ~20% off)
  },
} as const;

type PaidTier = 'starter' | 'pro';
type BillingPeriod = 'monthly' | 'annually';

/* ------------------------------------------------------------------ */
/*  Plan Management                                                     */
/* ------------------------------------------------------------------ */

/**
 * Get or create a Razorpay Plan for a given tier + billing period.
 * Plans are cached in the `app_config` table as:
 *   key = `razorpay_plan_{tier}_{period}`, value = plan_id
 */
export async function getOrCreatePlan(
  tier: PaidTier,
  period: BillingPeriod,
): Promise<string> {
  const configKey = `razorpay_plan_${tier}_${period}`;

  // 1. Check if we already have a plan ID stored
  const { data: existing } = await supabaseAdmin
    .from('app_config')
    .select('value')
    .eq('key', configKey)
    .single();

  if (existing?.value) {
    return existing.value;
  }

  // 2. Create plan on Razorpay
  const razorpayPeriod = period === 'monthly' ? 'monthly' : 'yearly';
  const amount = PLAN_PRICES_INR[tier][period];
  const displayName = `${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
  const periodLabel = period === 'monthly' ? 'Monthly' : 'Annual';

  const plan = await razorpay.plans.create({
    period: razorpayPeriod,
    interval: 1,
    item: {
      name: `Sree AI ${displayName} — ${periodLabel}`,
      amount,
      currency: 'INR',
      description: `${displayName} tier ${periodLabel.toLowerCase()} subscription`,
    },
  });

  // 3. Store plan ID for future use
  await supabaseAdmin
    .from('app_config')
    .upsert({ key: configKey, value: plan.id }, { onConflict: 'key' });

  console.log(`[Razorpay] Created plan: ${plan.id} for ${tier}/${period}`);
  return plan.id;
}

/**
 * Ensure all 4 plans exist (starter×2 + pro×2).
 * Safe to call repeatedly — idempotent via getOrCreatePlan.
 */
export async function syncAllPlans(): Promise<Record<string, string>> {
  const plans: Record<string, string> = {};
  for (const tier of ['starter', 'pro'] as PaidTier[]) {
    for (const period of ['monthly', 'annually'] as BillingPeriod[]) {
      plans[`${tier}_${period}`] = await getOrCreatePlan(tier, period);
    }
  }
  return plans;
}

/* ------------------------------------------------------------------ */
/*  Subscription Lifecycle                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a Razorpay Subscription for a user.
 * Returns the subscription object (contains subscription_id needed for checkout).
 */
export async function createSubscription(
  tier: PaidTier,
  period: BillingPeriod,
  customerEmail: string,
  userId: string,
): Promise<any> {
  const planId = await getOrCreatePlan(tier, period);

  // total_count = how many billing cycles before auto-expiry
  // monthly → 120 (10 years), annually → 10 (10 years)
  const totalCount = period === 'monthly' ? 1 : 1;   // i set it to one month for monthly and 1 year for yearly!

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: totalCount,
    quantity: 1,
    notes: {
      user_id: userId,
      tier,
      period,
      email: customerEmail,
    },
  });

  return subscription;
}

/**
 * Cancel a Razorpay Subscription immediately.
 * cancel_at_cycle_end = false → immediate cancellation.
 */
export async function cancelSubscription(subscriptionId: string): Promise<any> {
  return razorpay.subscriptions.cancel(subscriptionId, false);
}

/**
 * Cancel a Razorpay Subscription at the end of the current billing cycle.
 * The subscription stays active until the cycle ends, then auto-cancels.
 */
export async function cancelSubscriptionAtCycleEnd(subscriptionId: string): Promise<any> {
  return razorpay.subscriptions.cancel(subscriptionId, true);
}

/**
 * Pause a Razorpay Subscription.
 * Unlike cancel, a paused subscription CAN be resumed later.
 * Razorpay stops generating invoices while paused.
 */
export async function pauseSubscription(subscriptionId: string): Promise<any> {
  return razorpay.subscriptions.pause(subscriptionId, { pause_at: 'now' });
}

/**
 * Resume a previously paused Razorpay Subscription.
 * The subscription goes back to 'active' and charges resume.
 */
export async function resumeSubscription(subscriptionId: string): Promise<any> {
  return razorpay.subscriptions.resume(subscriptionId, { resume_at: 'now' });
}

/**
 * Create a deferred Razorpay Subscription (starts at a future date).
 * `start_at` is a Unix timestamp — Razorpay charges the first payment at this time.
 * Used for scheduling plan switches at end-of-cycle.
 */
export async function createDeferredSubscription(
  tier: PaidTier,
  period: BillingPeriod,
  customerEmail: string,
  userId: string,
  startAt: number, // Unix timestamp (seconds)
): Promise<any> {
  const planId = await getOrCreatePlan(tier, period);
  const totalCount = period === 'monthly' ? 120 : 10;

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: totalCount,
    quantity: 1,
    start_at: startAt,
    notes: {
      user_id: userId,
      tier,
      period,
      email: customerEmail,
      deferred: 'true',
    },
  });

  return subscription;
}

/**
 * Fetch a Razorpay Subscription by ID.
 */
export async function fetchSubscription(subscriptionId: string): Promise<any> {
  return razorpay.subscriptions.fetch(subscriptionId);
}

/* ------------------------------------------------------------------ */
/*  Payment / Signature Verification                                    */
/* ------------------------------------------------------------------ */

/**
 * Verify the checkout signature returned by Razorpay after payment.
 * For subscriptions: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret)
 */
export function verifyPaymentSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');

  return expected === signature;
}

/**
 * Verify the webhook signature sent by Razorpay.
 * Uses the webhook secret configured in Razorpay dashboard.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[Razorpay] RAZORPAY_WEBHOOK_SECRET not set — skipping webhook verification');
    return true; // Allow in dev when secret isn't configured
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return expected === signature;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Convert paise to INR display string */
export function paiseToINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

/** Get the Razorpay Key ID (safe to expose to frontend) */
export function getKeyId(): string {
  return process.env.RAZORPAY_KEY_ID!;
}

export default razorpay;

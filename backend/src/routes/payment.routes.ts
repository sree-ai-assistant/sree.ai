/**
 * Payment Routes — Razorpay Integration
 *
 * Handles subscription checkout, verification, webhooks, and cancellation.
 * All monetary amounts are in paise (INR). Frontend handles USD display.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { PLAN_CONFIGS } from '../config/plans';
import {
  createSubscription,
  createDeferredSubscription,
  cancelSubscription,
  cancelSubscriptionAtCycleEnd,
  pauseSubscription,
  resumeSubscription,
  fetchSubscription,
  verifyPaymentSignature,
  verifyWebhookSignature,
  syncAllPlans,
  getKeyId,
  PLAN_PRICES_INR,
} from '../services/razorpay.service';

/* ------------------------------------------------------------------ */
/*  In-memory sliding-window rate limiter for payment endpoints         */
/* ------------------------------------------------------------------ */
const paymentRateLimits = new Map<string, number[]>();

/** Clean up expired entries every 2 minutes */
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, timestamps] of paymentRateLimits.entries()) {
    const valid = timestamps.filter(t => t > cutoff);
    if (valid.length === 0) paymentRateLimits.delete(key);
    else paymentRateLimits.set(key, valid);
  }
}, 120_000);

/**
 * Returns Express middleware that limits `maxRequests` per `windowMs` per key.
 * Key is derived from authenticated user ID or fallback to IP.
 */
function paymentRateLimit(maxRequests: number, windowMs = 60_000) {
  return (req: Request, res: Response, next: Function) => {
    const userId = (req as any).user?.id;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `payment:${userId || ip}:${req.path}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (paymentRateLimits.get(key) || []).filter(t => t > windowStart);

    if (timestamps.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait before trying again.',
      });
    }

    timestamps.push(now);
    paymentRateLimits.set(key, timestamps);
    next();
  };
}

const router = Router();

/* ------------------------------------------------------------------ */
/*  POST /payment/create-subscription                                   */
/*  Creates a Razorpay Subscription and returns data for checkout       */
/* ------------------------------------------------------------------ */

router.post('/create-subscription', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const { tier, period } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Validate inputs
    if (!tier || !['starter', 'pro'].includes(tier)) {
      return res.status(400).json({ success: false, message: 'Invalid tier. Must be "starter" or "pro".' });
    }
    if (!period || !['monthly', 'annually'].includes(period)) {
      return res.status(400).json({ success: false, message: 'Invalid period. Must be "monthly" or "annually".' });
    }

    // Check existing subscription
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('razorpay_subscription_id, tier, status')
      .eq('user_id', userId)
      .single();

    // Handle existing active paid subscription
    if (
      existingSub?.razorpay_subscription_id &&
      existingSub.status === 'active' &&
      existingSub.tier !== 'free'
    ) {
      if (existingSub.tier === tier) {
        // Same tier — nothing to do
        return res.status(400).json({
          success: false,
          message: `You are already on the ${tier.toUpperCase()} plan.`,
        });
      }

      // Different tier (upgrade or downgrade) — cancel old subscription first
      try {
        console.log(`[Payment] Switching plan: ${existingSub.tier} → ${tier}, cancelling old sub ${existingSub.razorpay_subscription_id}`);
        await cancelSubscription(existingSub.razorpay_subscription_id);
      } catch (cancelErr: any) {
        // If already cancelled on Razorpay side, proceed anyway
        if (!cancelErr.message?.includes('already cancelled')) {
          console.error('[Payment] Failed to cancel old subscription:', cancelErr);
        }
      }
    }

    // Create subscription on Razorpay
    const subscription = await createSubscription(
      tier as 'starter' | 'pro',
      period as 'monthly' | 'annually',
      userEmail,
      userId,
    );

    // Store the pending subscription in our DB
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        tier,
        status: 'created',
        plan_id: `plan_${tier}_${period}`,
        razorpay_subscription_id: subscription.id,
        billing_period: period,
        currency: 'INR',
        amount_paid: PLAN_PRICES_INR[tier as 'starter' | 'pro'][period as 'monthly' | 'annually'],
        created_at: now,
      }, { onConflict: 'user_id' });

    res.json({
      success: true,
      data: {
        subscription_id: subscription.id,
        key_id: getKeyId(),
        amount: PLAN_PRICES_INR[tier as 'starter' | 'pro'][period as 'monthly' | 'annually'],
        currency: 'INR',
        tier,
        period,
        name: 'Sree AI',
        description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan — ${period === 'monthly' ? 'Monthly' : 'Annual'}`,
        prefill: {
          email: userEmail,
        },
      },
    });
  } catch (error: any) {
    console.error('[Payment] Create subscription error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create subscription' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/verify                                                */
/*  Verifies payment signature after checkout and activates the plan    */
/* ------------------------------------------------------------------ */

router.post('/verify', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;
    const userId = req.user.id;

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    // 1. Verify signature
    const isValid = verifyPaymentSignature(
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    );

    if (!isValid) {
      console.error('[Payment] Signature verification failed for user:', userId);
      return res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
    }

    // 2. Fetch subscription details from Razorpay for extra validation
    const rzpSub = await fetchSubscription(razorpay_subscription_id);
    const tier = rzpSub.notes?.tier || 'starter';
    const period = rzpSub.notes?.period || 'monthly';

    // 3. Check if this is an "activate now" flow
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('razorpay_subscription_id, upcoming_razorpay_sub_id, pending_activation_sub_id')
      .eq('user_id', userId)
      .single();

    const isActivateNow = !!existingSub && existingSub.pending_activation_sub_id === razorpay_subscription_id;

    if (isActivateNow && existingSub) {
      // Cancel the OLD Razorpay subscription (the one that was active before)
      if (existingSub.razorpay_subscription_id && existingSub.razorpay_subscription_id !== razorpay_subscription_id) {
        try {
          await cancelSubscription(existingSub.razorpay_subscription_id);
        } catch (e: any) {
          if (!e.message?.includes('already cancelled')) {
            console.warn('[Payment] Failed to cancel old sub during activate-now:', e.message);
          }
        }
      }

      // Cancel the deferred upcoming subscription if it exists
      if (existingSub.upcoming_razorpay_sub_id) {
        try {
          await cancelSubscription(existingSub.upcoming_razorpay_sub_id);
        } catch (e: any) {
          if (!e.message?.includes('already cancelled')) {
            console.warn('[Payment] Failed to cancel deferred sub during activate-now:', e.message);
          }
        }
      }

      console.log(`[Payment] Activate-now verified: user=${userId}, switching to ${tier}`);
    }

    // 4. Calculate billing cycle
    const now = new Date();
    const cycleEnd = new Date();
    if (period === 'annually') {
      cycleEnd.setFullYear(now.getFullYear() + 1);
    } else {
      cycleEnd.setMonth(now.getMonth() + 1);
    }

    // 5. Update subscription record
    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        tier,
        status: 'active',
        plan_id: `plan_${tier}_${period}`,
        razorpay_subscription_id,
        razorpay_payment_id,
        billing_period: period,
        currency: 'INR',
        amount_paid: PLAN_PRICES_INR[tier as 'starter' | 'pro']?.[period as 'monthly' | 'annually'] || 0,
        billing_cycle_start: now.toISOString(),
        billing_cycle_end: cycleEnd.toISOString(),
        current_period_end: cycleEnd.toISOString(),
        created_at: now.toISOString(),
        // Clear activate-now and upcoming fields
        pending_activation_sub_id: null,
        upcoming_tier: null,
        upcoming_period: null,
        upcoming_razorpay_sub_id: null,
        upcoming_start_date: null,
        cancel_at_cycle_end: false,
      }, { onConflict: 'user_id' });

    // 6. Update profiles table
    const plan = PLAN_CONFIGS[tier as keyof typeof PLAN_CONFIGS];
    await supabaseAdmin
      .from('profiles')
      .update({
        plan_type: tier,
        updated_at: now.toISOString(),
        ...(plan ? {
          chat_limit_daily: plan.limits.chat.daily,
          chat_limit_monthly: plan.limits.chat.monthly,
          voice_limit_daily: plan.limits.voice.daily,
          voice_limit_monthly: plan.limits.voice.monthly,
          image_limit_daily: plan.limits.image.daily,
          image_limit_monthly: plan.limits.image.monthly,
        } : {}),
      })
      .eq('id', userId);

    // 7. Record in payment history (with duplicate guard — webhook may arrive first)
    const { data: existingPayment } = await supabaseAdmin
      .from('payment_history')
      .select('id')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .maybeSingle();

    if (!existingPayment) {
      await supabaseAdmin.from('payment_history').insert({
        user_id: userId,
        razorpay_payment_id,
        razorpay_subscription_id,
        amount: PLAN_PRICES_INR[tier as 'starter' | 'pro']?.[period as 'monthly' | 'annually'] || 0,
        currency: 'INR',
        status: 'captured',
        tier,
        billing_period: period,
      });
    }

    console.log(`[Payment] ✅ Subscription activated: user=${userId}, tier=${tier}, period=${period}`);

    res.json({
      success: true,
      message: `Welcome to ${tier.charAt(0).toUpperCase() + tier.slice(1)}!`,
      data: { tier, period },
    });
  } catch (error: any) {
    console.error('[Payment] Verify error:', error);
    res.status(500).json({ success: false, message: error.message || 'Payment verification failed' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/webhook                                               */
/*  Razorpay webhook handler — no auth middleware (Razorpay calls this) */
/* ------------------------------------------------------------------ */

router.post('/webhook', paymentRateLimit(30), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;

    // Verify webhook signature (if secret is configured)
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.error('[Webhook] Signature verification failed');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Webhook] Received event: ${event}`);

    switch (event) {
      /* ---- Subscription activated (first payment successful) ---- */
      case 'subscription.activated': {
        const sub = payload.subscription?.entity;
        if (!sub) break;

        const userId = sub.notes?.user_id;
        const tier = sub.notes?.tier;
        const period = sub.notes?.period || 'monthly';
        const isDeferred = sub.notes?.deferred === 'true';

        if (userId && tier) {
          // Check current subscription state
          const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('razorpay_subscription_id, tier, billing_period, status, pending_activation_sub_id, upcoming_razorpay_sub_id')
            .eq('user_id', userId)
            .single();

          // ── GUARD: If this activated sub is a deferred/upcoming sub ──
          // Check whether Razorpay actually started it (status=active, meaning charged)
          // vs. just authenticated it (status=authenticated, just ₹5 auth).
          // Only block the auth event — allow the real activation through.
          const activatedSubId = sub.id;
          const isCurrentSub = existingSub?.razorpay_subscription_id === activatedSubId;
          const isPendingSub = existingSub?.pending_activation_sub_id === activatedSubId;
          const isUpcomingSub = existingSub?.upcoming_razorpay_sub_id === activatedSubId;

          if ((isPendingSub || isUpcomingSub || isDeferred) && !isCurrentSub) {
            // Fetch the sub's actual status from Razorpay to decide
            let rzpStatus = 'unknown';
            try {
              const rzpSub = await fetchSubscription(activatedSubId);
              rzpStatus = rzpSub?.status || 'unknown';
            } catch (_) { /* if we can't fetch, let it through */ }

            if (rzpStatus === 'authenticated') {
              // Just auth — user's current plan is still running. Don't switch yet.
              console.log(`[Webhook] Deferred sub ${activatedSubId} authenticated (₹auth), current plan (${existingSub?.tier}) unaffected: user=${userId}`);
              break;
            }
            // rzpStatus is 'active' — Razorpay actually charged and started it.
            // Fall through to process the plan switch.
            console.log(`[Webhook] Deferred sub ${activatedSubId} is now ACTIVE on Razorpay — processing plan switch: user=${userId}`);
          }

          // ── Normal activation: first-time sub or deferred sub that has actually started ──
          const oldSubId = existingSub?.razorpay_subscription_id;
          const isDeferredSwitch = oldSubId && oldSubId !== sub.id;

          if (isDeferredSwitch) {
            // DON'T pause or cancel the old sub here!
            // The old sub was already set to cancel_at_cycle_end when the user
            // scheduled the plan change. Razorpay cancelled it before activating this one.
            // UPI subs can't be paused anyway.
            // We just save previous_tier/period so we can REVERT if this new sub's
            // payment fails (rollback to old tier limits, user would re-subscribe).
            console.log(`[Webhook] Deferred switch from ${existingSub?.tier} → ${tier}: old sub ${oldSubId} already cancelled by Razorpay, saving rollback info`);
          }

          const now = new Date();
          const cycleEnd = new Date();
          if (period === 'annually') {
            cycleEnd.setFullYear(now.getFullYear() + 1);
          } else {
            cycleEnd.setMonth(now.getMonth() + 1);
          }

          await supabaseAdmin
            .from('subscriptions')
            .upsert({
              user_id: userId,
              tier,
              status: 'active',
              razorpay_subscription_id: sub.id,
              billing_cycle_start: now.toISOString(),
              billing_cycle_end: cycleEnd.toISOString(),
              current_period_end: cycleEnd.toISOString(),
              plan_id: `plan_${tier}_${period}`,
              billing_period: period,
              currency: 'INR',
              // Clear upcoming plan columns (deferred → now active)
              upcoming_tier: null,
              upcoming_period: null,
              upcoming_razorpay_sub_id: null,
              upcoming_start_date: null,
              cancel_at_cycle_end: false,
              pending_activation_sub_id: null,
              // Reset payment failure tracking for the new sub
              payment_failure_count: 0,
              last_payment_failure_at: null,
              // Save previous tier for rollback if this is a deferred switch
              previous_tier: isDeferredSwitch ? (existingSub?.tier || null) : null,
              previous_period: isDeferredSwitch ? (existingSub?.billing_period || null) : null,
              previous_razorpay_sub_id: isDeferredSwitch ? oldSubId : null,
            }, { onConflict: 'user_id' });

          // Also update profile
          const plan = PLAN_CONFIGS[tier as keyof typeof PLAN_CONFIGS];
          if (plan) {
            await supabaseAdmin
              .from('profiles')
              .update({
                plan_type: tier,
                updated_at: now.toISOString(),
                chat_limit_daily: plan.limits.chat.daily,
                chat_limit_monthly: plan.limits.chat.monthly,
                voice_limit_daily: plan.limits.voice.daily,
                voice_limit_monthly: plan.limits.voice.monthly,
                image_limit_daily: plan.limits.image.daily,
                image_limit_monthly: plan.limits.image.monthly,
              })
              .eq('id', userId);
          }

          // Record the activation payment in payment_history
          // (the subscription.charged event may also fire, but we guard against duplicates)
          try {
            const rzpSub = await fetchSubscription(sub.id);
            const latestPaymentId = rzpSub?.payment_id || null;
            if (latestPaymentId) {
              const { data: existingPayment } = await supabaseAdmin
                .from('payment_history')
                .select('id')
                .eq('razorpay_payment_id', latestPaymentId)
                .maybeSingle();

              if (!existingPayment) {
                const amount = rzpSub?.current_end ? (tier === 'pro' ? 89900 : 39900) : 0;
                await supabaseAdmin.from('payment_history').insert({
                  user_id: userId,
                  razorpay_payment_id: latestPaymentId,
                  razorpay_subscription_id: sub.id,
                  amount: amount,
                  currency: 'INR',
                  status: 'captured',
                  tier,
                  billing_period: period,
                });
                console.log(`[Webhook] Payment ${latestPaymentId} recorded for activation: user=${userId}`);
              }
            }
          } catch (payErr: any) {
            console.warn(`[Webhook] Could not record activation payment: ${payErr.message}`);
          }

          console.log(`[Webhook] Subscription activated: user=${userId}, tier=${tier}`);
        }
        break;
      }

      /* ---- Recurring charge successful ---- */
      case 'subscription.charged': {
        const sub = payload.subscription?.entity;
        const payment = payload.payment?.entity;
        if (!sub) break;

        const userId = sub.notes?.user_id;
        const tier = sub.notes?.tier;
        const period = sub.notes?.period || 'monthly';

        if (userId) {
          // Extend billing cycle
          const now = new Date();
          const cycleEnd = new Date();
          if (period === 'annually') {
            cycleEnd.setFullYear(now.getFullYear() + 1);
          } else {
            cycleEnd.setMonth(now.getMonth() + 1);
          }
          // Only clear rollback info if the payment was ACTUALLY captured (confirmed).
          // Razorpay fires subscription.charged even for invoice creation — the payment
          // might still fail later. We must keep previous_* until payment.status === 'captured'.
          const paymentConfirmed = payment && payment.status === 'captured';

          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'active',
              billing_cycle_start: now.toISOString(),
              billing_cycle_end: cycleEnd.toISOString(),
              current_period_end: cycleEnd.toISOString(),
              // Payment succeeded — reset failure tracking
              payment_failure_count: 0,
              last_payment_failure_at: null,
              // Only clear previous tier when payment is confirmed captured
              ...(paymentConfirmed ? {
                previous_tier: null,
                previous_period: null,
                previous_razorpay_sub_id: null,
              } : {}),
            })
            .eq('user_id', userId);

          console.log(`[Webhook] subscription.charged: user=${userId}, payment=${paymentConfirmed ? 'CAPTURED — cleared rollback info' : 'NOT YET CAPTURED — keeping rollback info'}`);

          // Record payment (skip if already recorded by /verify)
          if (payment) {
            const { data: existingPayment } = await supabaseAdmin
              .from('payment_history')
              .select('id')
              .eq('razorpay_payment_id', payment.id)
              .maybeSingle();

            if (!existingPayment) {
              await supabaseAdmin.from('payment_history').insert({
                user_id: userId,
                razorpay_payment_id: payment.id,
                razorpay_subscription_id: sub.id,
                amount: payment.amount,
                currency: payment.currency || 'INR',
                status: 'captured',
                tier,
                billing_period: period,
              });
            }
          }

          console.log(`[Webhook] Subscription charged: user=${userId}, tier=${tier}`);
        }
        break;
      }

      /* ---- Subscription cancelled ---- */
      case 'subscription.cancelled': {
        const sub = payload.subscription?.entity;
        if (!sub) break;

        const userId = sub.notes?.user_id;
        if (userId) {
          // CRITICAL: Check if this cancelled sub is the user's CURRENT subscription.
          // If it's a deferred/pending/old sub, do NOT downgrade the user.
          const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('razorpay_subscription_id, tier, billing_period, upcoming_tier, upcoming_period, upcoming_razorpay_sub_id, upcoming_start_date, pending_activation_sub_id, previous_tier, previous_period, previous_razorpay_sub_id, billing_cycle_start, billing_cycle_end, current_period_end')
            .eq('user_id', userId)
            .single();

          if (!existingSub) break;

          const cancelledSubId = sub.id;
          const isCurrentSub = existingSub.razorpay_subscription_id === cancelledSubId;
          const isUpcomingSub = existingSub.upcoming_razorpay_sub_id === cancelledSubId;
          const isPendingSub = existingSub.pending_activation_sub_id === cancelledSubId;

          // If this is a pending/deferred sub that was cancelled (e.g. user dismissed checkout),
          // just clean up the reference — do NOT touch the current plan.
          if (isPendingSub && !isCurrentSub) {
            await supabaseAdmin
              .from('subscriptions')
              .update({ pending_activation_sub_id: null })
              .eq('user_id', userId);
            console.log(`[Webhook] Pending/deferred sub ${cancelledSubId} cancelled — no plan change: user=${userId}`);
            break;
          }

          // If this is an upcoming deferred sub that was cancelled,
          // clear the upcoming fields — do NOT touch the current plan.
          if (isUpcomingSub && !isCurrentSub) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                upcoming_tier: null,
                upcoming_period: null,
                upcoming_razorpay_sub_id: null,
                upcoming_start_date: null,
                cancel_at_cycle_end: false,
              })
              .eq('user_id', userId);
            console.log(`[Webhook] Upcoming deferred sub ${cancelledSubId} cancelled — current plan unaffected: user=${userId}`);
            break;
          }

          // If it's NOT the current sub and not pending/upcoming, just ignore
          if (!isCurrentSub) {
            console.log(`[Webhook] Ignoring cancellation of unrelated sub ${cancelledSubId}: user=${userId}`);
            break;
          }

          // ── This IS the current subscription being cancelled ──
          if (existingSub.upcoming_tier && existingSub.upcoming_tier !== 'free') {
            // Upcoming plan exists — don't downgrade to free, just mark current as cancelled
            // The deferred subscription will activate via subscription.activated webhook
            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'pending_switch' })
              .eq('user_id', userId);

            console.log(`[Webhook] Current sub cancelled but upcoming plan (${existingSub.upcoming_tier}) scheduled: user=${userId}`);
          } else if (existingSub.upcoming_tier === 'free') {
            // User is downgrading to free at end of cycle
            await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'cancelled',
                tier: 'free',
                upcoming_tier: null,
                upcoming_period: null,
                upcoming_razorpay_sub_id: null,
                upcoming_start_date: null,
                cancel_at_cycle_end: false,
                razorpay_subscription_id: null,
                razorpay_plan_id: null,
              })
              .eq('user_id', userId);

            const freePlan = PLAN_CONFIGS.free;
            await supabaseAdmin
              .from('profiles')
              .update({
                plan_type: 'free',
                updated_at: new Date().toISOString(),
                chat_limit_daily: freePlan.limits.chat.daily,
                chat_limit_monthly: freePlan.limits.chat.monthly,
                voice_limit_daily: freePlan.limits.voice.daily,
                voice_limit_monthly: freePlan.limits.voice.monthly,
                image_limit_daily: freePlan.limits.image.daily,
                image_limit_monthly: freePlan.limits.image.monthly,
              })
              .eq('id', userId);

            console.log(`[Webhook] Current sub cancelled → downgraded to Free (scheduled): user=${userId}`);
          } else if (existingSub.previous_tier && existingSub.previous_tier !== 'free' && existingSub.previous_razorpay_sub_id) {
            // ── ROLLBACK: Deferred sub payment failed → revert to previous plan ──
            // The new sub is being cancelled (payment retries failed or user cancelled).
            // Try to RESUME the paused old subscription.
            const prevTier = existingSub.previous_tier;
            const prevPeriod = existingSub.previous_period || 'monthly';
            const prevSubId = existingSub.previous_razorpay_sub_id;

            let resumedOldSub = false;
            if (prevSubId) {
              try {
                await resumeSubscription(prevSubId);
                resumedOldSub = true;
                console.log(`[Webhook] Resumed paused old sub ${prevSubId} → rolling back to ${prevTier}`);
              } catch (resumeErr: any) {
                console.warn(`[Webhook] Could not resume old sub ${prevSubId}: ${resumeErr?.error?.description || resumeErr.message}`);
              }
            }

            // Compute the new billing cycle for the resumed sub
            const rollbackNow = new Date();
            const rollbackCycleEnd = new Date();
            if (prevPeriod === 'annually') {
              rollbackCycleEnd.setFullYear(rollbackNow.getFullYear() + 1);
            } else {
              rollbackCycleEnd.setMonth(rollbackNow.getMonth() + 1);
            }

            const prevPlan = PLAN_CONFIGS[prevTier as keyof typeof PLAN_CONFIGS] || PLAN_CONFIGS.free;
            await supabaseAdmin
              .from('subscriptions')
              .update({
                status: resumedOldSub ? 'active' : 'cancelled',
                tier: prevTier,
                billing_period: prevPeriod,
                razorpay_subscription_id: resumedOldSub ? prevSubId : null,
                razorpay_plan_id: null,
                plan_id: `plan_${prevTier}_${prevPeriod}`,
                billing_cycle_start: resumedOldSub ? rollbackNow.toISOString() : existingSub.billing_cycle_start,
                billing_cycle_end: resumedOldSub ? rollbackCycleEnd.toISOString() : existingSub.billing_cycle_end,
                current_period_end: resumedOldSub ? rollbackCycleEnd.toISOString() : existingSub.current_period_end,
                cancel_at_cycle_end: false,
                upcoming_tier: null,
                upcoming_period: null,
                upcoming_razorpay_sub_id: null,
                upcoming_start_date: null,
                // Clear rollback fields
                previous_tier: null,
                previous_period: null,
                previous_razorpay_sub_id: null,
                payment_failure_count: 0,
                last_payment_failure_at: null,
              })
              .eq('user_id', userId);

            await supabaseAdmin
              .from('profiles')
              .update({
                plan_type: prevTier,
                updated_at: new Date().toISOString(),
                chat_limit_daily: prevPlan.limits.chat.daily,
                chat_limit_monthly: prevPlan.limits.chat.monthly,
                voice_limit_daily: prevPlan.limits.voice.daily,
                voice_limit_monthly: prevPlan.limits.voice.monthly,
                image_limit_daily: prevPlan.limits.image.daily,
                image_limit_monthly: prevPlan.limits.image.monthly,
              })
              .eq('id', userId);

            console.log(`[Webhook] New sub cancelled → reverted to ${prevTier} (${resumedOldSub ? `resumed old sub ${prevSubId}` : 'old sub dead, user needs to re-subscribe'}): user=${userId}`);
          } else {
            // No upcoming plan, no previous tier — simple cancellation → downgrade to free
            await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'cancelled',
                payment_failure_count: 0,
                last_payment_failure_at: null,
                previous_tier: null,
                previous_period: null,
                previous_razorpay_sub_id: null,
              })
              .eq('user_id', userId);

            const freePlan = PLAN_CONFIGS.free;
            await supabaseAdmin
              .from('profiles')
              .update({
                plan_type: 'free',
                updated_at: new Date().toISOString(),
                chat_limit_daily: freePlan.limits.chat.daily,
                chat_limit_monthly: freePlan.limits.chat.monthly,
                voice_limit_daily: freePlan.limits.voice.daily,
                voice_limit_monthly: freePlan.limits.voice.monthly,
                image_limit_daily: freePlan.limits.image.daily,
                image_limit_monthly: freePlan.limits.image.monthly,
              })
              .eq('id', userId);

            console.log(`[Webhook] Current sub cancelled → downgraded to Free: user=${userId}`);
          }
        }
        break;
      }

      /* ---- Payment failed ---- */
      case 'payment.failed': {
        const payment = payload.payment?.entity;
        if (!payment) break;

        // Try to get user_id from payment notes first
        let failedUserId = payment.notes?.user_id;
        let failedTier = payment.notes?.tier || null;
        let failedPeriod = payment.notes?.period || null;

        // FALLBACK: Auto-retry payments often have empty notes.
        // Try to find the user via the subscription entity in the payload,
        // or by looking up the subscription in our DB.
        if (!failedUserId) {
          // Check if subscription entity is in the webhook payload
          const subFromPayload = payload.subscription?.entity;
          if (subFromPayload?.notes?.user_id) {
            failedUserId = subFromPayload.notes.user_id;
            failedTier = failedTier || subFromPayload.notes?.tier;
            failedPeriod = failedPeriod || subFromPayload.notes?.period;
            console.log(`[Webhook] payment.failed: found user from payload.subscription.entity: ${failedUserId}`);
          }
        }

        if (!failedUserId) {
          // Try to look up via invoice → subscription in Razorpay
          const invoiceId = payment.invoice_id;
          if (invoiceId) {
            try {
              // Invoice notes should have subscription info
              // Look up subscription by checking which of our users has this sub
              const rzpPayment = payment;
              // Try fetching all subs and matching — but simpler: search our DB
              // for any subscription whose razorpay_subscription_id matches
              const { data: allSubs } = await supabaseAdmin
                .from('subscriptions')
                .select('user_id, tier, billing_period, razorpay_subscription_id')
                .not('razorpay_subscription_id', 'is', null);

              if (allSubs) {
                for (const s of allSubs) {
                  try {
                    const rzpSub = await fetchSubscription(s.razorpay_subscription_id!);
                    // Check if this subscription's latest invoice matches
                    if (rzpSub?.id && rzpSub.notes?.user_id) {
                      // Check if the payment belongs to this subscription
                      // by comparing the subscription's current invoice
                      // This is expensive, so we limit to checking recent subs
                      failedUserId = rzpSub.notes.user_id;
                      failedTier = failedTier || rzpSub.notes?.tier;
                      failedPeriod = failedPeriod || rzpSub.notes?.period;
                      // Verify by checking the sub status — only pending subs have failed payments
                      if (rzpSub.status === 'pending' || rzpSub.status === 'active') {
                        console.log(`[Webhook] payment.failed: found user via subscription lookup: ${failedUserId}`);
                        break;
                      }
                    }
                  } catch (_) { /* skip */ }
                }
              }
            } catch (lookupErr: any) {
              console.warn(`[Webhook] payment.failed: invoice lookup failed: ${lookupErr.message}`);
            }
          }
        }

        if (!failedUserId) {
          console.warn(`[Webhook] payment.failed: could not identify user for payment ${payment.id} — notes were empty and subscription lookup failed`);
          break;
        }

        // Increment payment_failure_count on the subscription
        const { data: failSub } = await supabaseAdmin
          .from('subscriptions')
          .select('payment_failure_count, razorpay_subscription_id, tier')
          .eq('user_id', failedUserId)
          .single();

        const newFailCount = (failSub?.payment_failure_count || 0) + 1;
        failedTier = failedTier || failSub?.tier || null;

        await supabaseAdmin
          .from('subscriptions')
          .update({
            payment_failure_count: newFailCount,
            last_payment_failure_at: new Date().toISOString(),
          })
          .eq('user_id', failedUserId);

        // Record in payment_history with retry count
        try {
          await supabaseAdmin.from('payment_history').insert({
            user_id: failedUserId,
            razorpay_payment_id: payment.id,
            razorpay_subscription_id: failSub?.razorpay_subscription_id || null,
            amount: payment.amount,
            currency: payment.currency || 'INR',
            status: 'failed',
            tier: failedTier,
            billing_period: failedPeriod,
            retry_count: newFailCount,
          });
        } catch (insertErr: any) {
          // Duplicate payment_id — ignore (unique index guard)
          if (!insertErr.message?.includes('unique') && !insertErr.message?.includes('duplicate')) {
            console.error(`[Webhook] Failed to record payment failure: ${insertErr.message}`);
          }
        }

        console.log(`[Webhook] Payment failed (attempt ${newFailCount}): user=${failedUserId}, payment=${payment.id}, tier=${failedTier}`);
        break;
      }

      /* ---- Subscription paused ---- */
      /* Fires when sub is paused by our code OR manually in Razorpay dashboard */
      case 'subscription.paused': {
        const sub = payload.subscription?.entity;
        if (!sub) break;

        const userId = sub.notes?.user_id;
        if (userId) {
          // Check if we already have an upcoming plan set (expected pause from our code)
          const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('razorpay_subscription_id, upcoming_tier, cancel_at_cycle_end, billing_cycle_end, pending_activation_sub_id')
            .eq('user_id', userId)
            .single();

          // GUARD: If the paused sub is not the current sub, ignore it
          if (existingSub?.razorpay_subscription_id && existingSub.razorpay_subscription_id !== sub.id) {
            console.log(`[Webhook] Ignoring pause for non-current sub ${sub.id}: user=${userId}`);
            break;
          }

          if (existingSub?.upcoming_tier || existingSub?.pending_activation_sub_id) {
            // Expected pause — our code has or is about to set upcoming_tier
            // (cancel-current → 'free', schedule-change → 'starter'/'pro', verify-schedule-change in progress)
            console.log(`[Webhook] Subscription paused (expected): user=${userId}, upcoming=${existingSub.upcoming_tier || 'pending checkout'}`);
          } else {
            // Unexpected pause — someone paused it manually in Razorpay dashboard
            // Set upcoming_tier='free' so the auto-downgrade in /status catches it
            await supabaseAdmin
              .from('subscriptions')
              .update({
                cancel_at_cycle_end: true,
                upcoming_tier: 'free',
                upcoming_start_date: existingSub?.billing_cycle_end || new Date().toISOString(),
              })
              .eq('user_id', userId);

            console.log(`[Webhook] Subscription paused (UNEXPECTED — manual/admin): user=${userId}. Set upcoming_tier=free for auto-downgrade.`);
          }
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    // Always return 200 to Razorpay to acknowledge receipt
    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error);
    // Still return 200 to avoid Razorpay retries on our errors
    res.status(200).json({ status: 'error', message: error.message });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /payment/status                                                 */
/*  Get current payment/subscription status for the logged-in user      */
/* ------------------------------------------------------------------ */

router.get('/status', authMiddleware, paymentRateLimit(10), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub || (sub.status !== 'active' && sub.status !== 'pending_switch')) {
      // Still fetch payment history for cancelled/free users
      const { data: pastPayments } = await supabaseAdmin
        .from('payment_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      return res.json({
        success: true,
        data: {
          has_active_subscription: false,
          // Return actual tier from DB (e.g. 'starter' after rollback), not hardcoded 'free'
          tier: sub?.tier || 'free',
          status: sub?.status || 'none',
          payment_history: pastPayments || [],
        },
      });
    }

    // ── Auto-downgrade check ──────────────────────────────────────────
    // Since we use PAUSE (not cancel), Razorpay won't fire a webhook at
    // cycle end. We detect the expiry here and trigger the downgrade
    // lazily on the next status check.
    if (
      sub.upcoming_tier === 'free' &&
      sub.cancel_at_cycle_end &&
      sub.billing_cycle_end &&
      new Date(sub.billing_cycle_end) <= new Date()
    ) {
      console.log(`[Payment] Auto-downgrade: billing cycle ended for user=${userId}, downgrading to Free`);

      // Cancel the paused Razorpay subscription permanently
      if (sub.razorpay_subscription_id) {
        try {
          await cancelSubscription(sub.razorpay_subscription_id);
        } catch (_e) {
          // Already dead — ignore
        }
      }

      // Downgrade to free in DB
      const freePlan = PLAN_CONFIGS.free;
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'cancelled',
          tier: 'free',
          upcoming_tier: null,
          upcoming_period: null,
          upcoming_razorpay_sub_id: null,
          upcoming_start_date: null,
          cancel_at_cycle_end: false,
          razorpay_subscription_id: null,
        })
        .eq('user_id', userId);

      await supabaseAdmin
        .from('profiles')
        .update({
          plan_type: 'free',
          updated_at: new Date().toISOString(),
          chat_limit_daily: freePlan.limits.chat.daily,
          chat_limit_monthly: freePlan.limits.chat.monthly,
          voice_limit_daily: freePlan.limits.voice.daily,
          voice_limit_monthly: freePlan.limits.voice.monthly,
          image_limit_daily: freePlan.limits.image.daily,
          image_limit_monthly: freePlan.limits.image.monthly,
        })
        .eq('id', userId);

      // Still fetch payment history for free users (past transactions)
      const { data: freePayments } = await supabaseAdmin
        .from('payment_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      return res.json({
        success: true,
        data: {
          has_active_subscription: false,
          tier: 'free',
          status: 'cancelled',
          payment_history: freePayments || [],
        },
      });
    }

    // Fetch payment history for billing section
    const { data: payments } = await supabaseAdmin
      .from('payment_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // If there are payment failures, fetch the subscription's short_url
    // so the frontend can link users to update their payment method
    let subscriptionShortUrl: string | null = null;
    if ((sub.payment_failure_count || 0) > 0 && sub.razorpay_subscription_id) {
      try {
        const rzpSub = await fetchSubscription(sub.razorpay_subscription_id);
        subscriptionShortUrl = rzpSub?.short_url || null;
      } catch (_) {
        // Non-critical — just skip the link
      }
    }

    res.json({
      success: true,
      data: {
        has_active_subscription: true,
        tier: sub.tier,
        status: sub.status,
        billing_period: sub.billing_period,
        current_period_end: sub.billing_cycle_end,
        billing_cycle_start: sub.billing_cycle_start,
        razorpay_subscription_id: sub.razorpay_subscription_id,
        cancel_at_cycle_end: sub.cancel_at_cycle_end || false,
        // Upcoming plan info
        upcoming_tier: sub.upcoming_tier || null,
        upcoming_period: sub.upcoming_period || null,
        upcoming_start_date: sub.upcoming_start_date || null,
        upcoming_razorpay_sub_id: sub.upcoming_razorpay_sub_id || null,
        // Payment failure info
        payment_failure_count: sub.payment_failure_count || 0,
        last_payment_failure_at: sub.last_payment_failure_at || null,
        subscription_short_url: subscriptionShortUrl,
        // Payment history
        payment_history: payments || [],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/cancel                                                */
/*  Cancel the active subscription immediately                          */
/* ------------------------------------------------------------------ */

router.post('/cancel', authMiddleware, paymentRateLimit(3), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    // Fetch active subscription
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('razorpay_subscription_id, tier, status')
      .eq('user_id', userId)
      .single();

    if (!sub?.razorpay_subscription_id || sub.status !== 'active') {
      return res.status(400).json({ success: false, message: 'No active subscription to cancel' });
    }

    // Cancel on Razorpay (immediate)
    await cancelSubscription(sub.razorpay_subscription_id);

    // Update our DB
    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', userId);

    // Downgrade profile to free immediately
    const freePlan = PLAN_CONFIGS.free;
    await supabaseAdmin
      .from('profiles')
      .update({
        plan_type: 'free',
        updated_at: new Date().toISOString(),
        chat_limit_daily: freePlan.limits.chat.daily,
        chat_limit_monthly: freePlan.limits.chat.monthly,
        voice_limit_daily: freePlan.limits.voice.daily,
        voice_limit_monthly: freePlan.limits.voice.monthly,
        image_limit_daily: freePlan.limits.image.daily,
        image_limit_monthly: freePlan.limits.image.monthly,
      })
      .eq('id', userId);

    console.log(`[Payment] Subscription cancelled: user=${userId}, was=${sub.tier}`);

    res.json({
      success: true,
      message: 'Subscription cancelled. You have been downgraded to the Free plan.',
    });
  } catch (error: any) {
    console.error('[Payment] Cancel error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel subscription' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/schedule-change                                       */
/*  Schedule a plan switch at end of current billing cycle              */
/* ------------------------------------------------------------------ */

router.post('/schedule-change', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const { tier, period } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Validate inputs
    if (!tier || !['starter', 'pro', 'free'].includes(tier)) {
      return res.status(400).json({ success: false, message: 'Invalid tier.' });
    }
    if (tier !== 'free' && (!period || !['monthly', 'annually'].includes(period))) {
      return res.status(400).json({ success: false, message: 'Invalid period.' });
    }

    // Fetch current subscription
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub) {
      return res.status(400).json({ success: false, message: 'No subscription found.' });
    }

    // Handle edge case: subscription stuck in 'created' from a failed activate-now
    // Reset it back to active with the profile's actual plan_type
    if (sub.status === 'created') {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('plan_type')
        .eq('id', userId)
        .single();

      const actualTier = profile?.plan_type || 'free';

      if (actualTier === 'free') {
        return res.status(400).json({ success: false, message: 'No active paid subscription to change.' });
      }

      // Restore the subscription to match the actual profile tier
      await supabaseAdmin
        .from('subscriptions')
        .update({
          tier: actualTier,
          status: 'active',
          pending_activation_sub_id: null,
        })
        .eq('user_id', userId);

      sub.tier = actualTier;
      sub.status = 'active';
      console.log(`[Payment] Auto-repaired subscription from 'created' back to ${actualTier}: user=${userId}`);
    }

    if (sub.status !== 'active' || !sub.razorpay_subscription_id) {
      return res.status(400).json({ success: false, message: 'No active subscription to change.' });
    }

    if (sub.tier === tier) {
      return res.status(400).json({ success: false, message: `You are already on the ${tier} plan.` });
    }

    if (sub.upcoming_tier) {
      return res.status(400).json({
        success: false,
        message: `You already have a pending change to ${sub.upcoming_tier}. Cancel it first.`,
      });
    }

    const cycleEnd = sub.billing_cycle_end
      ? new Date(sub.billing_cycle_end)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // ── CASE A: Paid → Free (no checkout needed, immediate pause) ──
    if (tier === 'free') {
      // Pause current sub (same as cancel-current flow)
      let rzpSubAlive = true;
      try {
        const rzpSub = await fetchSubscription(sub.razorpay_subscription_id);
        const rzpStatus = rzpSub?.status;
        if (['cancelled', 'completed', 'expired'].includes(rzpStatus)) {
          rzpSubAlive = false;
        } else if (rzpStatus === 'paused') {
          rzpSubAlive = false;
        }
      } catch (_) {
        rzpSubAlive = false;
      }

      if (rzpSubAlive) {
        try {
          await pauseSubscription(sub.razorpay_subscription_id);
          console.log(`[Payment] Paused current sub ${sub.razorpay_subscription_id} for free downgrade`);
        } catch (pauseErr: any) {
          try {
            await cancelSubscriptionAtCycleEnd(sub.razorpay_subscription_id);
            console.log(`[Payment] Fallback: cancelled at cycle end instead of pause`);
          } catch (cancelErr: any) {
            const cMsg = cancelErr?.error?.description || cancelErr.message || '';
            const isHarmless = cMsg.includes('already cancelled') || cMsg.includes('no billing cycle');
            if (!isHarmless) {
              return res.status(500).json({ success: false, message: 'Failed to schedule change.' });
            }
          }
        }
      }

      // Save upcoming free plan info in DB immediately
      await supabaseAdmin
        .from('subscriptions')
        .update({
          upcoming_tier: 'free',
          upcoming_period: null,
          upcoming_razorpay_sub_id: null,
          upcoming_start_date: cycleEnd.toISOString(),
          cancel_at_cycle_end: true,
        })
        .eq('user_id', userId);

      console.log(`[Payment] Scheduled downgrade to Free: user=${userId}, at ${cycleEnd.toISOString()}`);

      return res.json({
        success: true,
        message: `Downgrade to Free scheduled for ${cycleEnd.toLocaleDateString()}.`,
        data: {
          upcoming_tier: 'free',
          upcoming_start_date: cycleEnd.toISOString(),
          immediate: true, // signals frontend: no checkout needed
        },
      });
    }

    // ── CASE B: Paid → Paid (needs checkout for ₹0 auth / autopay) ──
    // Create deferred subscription — DON'T pause old sub yet.
    // The pause + DB save happens in /verify-schedule-change AFTER user authenticates.
    const startAtUnix = Math.floor(cycleEnd.getTime() / 1000);
    let deferredSub: any;
    try {
      deferredSub = await createDeferredSubscription(
        tier as 'starter' | 'pro',
        period as 'monthly' | 'annually',
        userEmail,
        userId,
        startAtUnix,
      );
    } catch (err: any) {
      console.error('[Payment] Failed to create deferred subscription:', err);
      return res.status(500).json({ success: false, message: 'Failed to create upcoming subscription.' });
    }

    // Store the deferred sub ID temporarily so verify-schedule-change can find it
    await supabaseAdmin
      .from('subscriptions')
      .update({ pending_activation_sub_id: deferredSub.id })
      .eq('user_id', userId);

    console.log(`[Payment] Schedule-change checkout: user=${userId}, ${sub.tier} → ${tier}, deferredSub=${deferredSub.id}`);

    // Return checkout data — frontend opens Razorpay checkout for ₹0 auth
    res.json({
      success: true,
      data: {
        subscription_id: deferredSub.id,
        key_id: getKeyId(),
        amount: PLAN_PRICES_INR[tier as 'starter' | 'pro'][period as 'monthly' | 'annually'],
        currency: 'INR',
        tier,
        period,
        name: 'Sree AI',
        description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan — Starts ${cycleEnd.toLocaleDateString()}`,
        prefill: { email: userEmail },
        upcoming_start_date: cycleEnd.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Payment] Schedule change error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to schedule plan change' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/verify-schedule-change                                */
/*  Verify auth after schedule-change checkout, then pause old sub     */
/* ------------------------------------------------------------------ */

router.post('/verify-schedule-change', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;
    const userId = req.user.id;

    // 1. Verify signature
    if (razorpay_payment_id && razorpay_subscription_id && razorpay_signature) {
      const isValid = verifyPaymentSignature(
        razorpay_payment_id,
        razorpay_subscription_id,
        razorpay_signature,
      );
      if (!isValid) {
        console.error('[Payment] Schedule-change signature verification failed: user=', userId);
        return res.status(400).json({ success: false, message: 'Signature verification failed.' });
      }
    }

    // 2. Find the pending deferred sub
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub || !sub.pending_activation_sub_id) {
      return res.status(400).json({ success: false, message: 'No pending schedule change found.' });
    }

    const deferredSubId = sub.pending_activation_sub_id;

    // 3. Fetch deferred sub from Razorpay to get tier/period
    const rzpDeferred = await fetchSubscription(deferredSubId);
    const tier = rzpDeferred?.notes?.tier;
    const period = rzpDeferred?.notes?.period || 'monthly';

    if (!tier) {
      return res.status(400).json({ success: false, message: 'Could not determine upcoming plan.' });
    }

    const cycleEnd = sub.billing_cycle_end
      ? new Date(sub.billing_cycle_end)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 4. NOW pause the current Razorpay subscription (safe — user has authenticated)
    if (sub.razorpay_subscription_id) {
      let rzpSubAlive = true;
      try {
        const rzpSub = await fetchSubscription(sub.razorpay_subscription_id);
        const rzpStatus = rzpSub?.status;
        if (['cancelled', 'completed', 'expired', 'paused'].includes(rzpStatus)) {
          rzpSubAlive = false;
        }
      } catch (_) {
        rzpSubAlive = false;
      }

      if (rzpSubAlive) {
        try {
          await pauseSubscription(sub.razorpay_subscription_id);
          console.log(`[Payment] Paused current sub ${sub.razorpay_subscription_id} after schedule-change auth`);
        } catch (pauseErr: any) {
          try {
            await cancelSubscriptionAtCycleEnd(sub.razorpay_subscription_id);
            console.log(`[Payment] Fallback: cancelled at cycle end`);
          } catch (cancelErr: any) {
            const cMsg = cancelErr?.error?.description || cancelErr.message || '';
            const isHarmless = cMsg.includes('already cancelled') || cMsg.includes('no billing cycle');
            if (!isHarmless) {
              console.error('[Payment] Could not pause/cancel old sub:', cMsg);
            }
          }
        }
      }
    }

    // 5. Save upcoming plan info in DB
    await supabaseAdmin
      .from('subscriptions')
      .update({
        upcoming_tier: tier,
        upcoming_period: period,
        upcoming_razorpay_sub_id: deferredSubId,
        upcoming_start_date: cycleEnd.toISOString(),
        cancel_at_cycle_end: true,
        pending_activation_sub_id: null, // clear the temporary field
      })
      .eq('user_id', userId);

    console.log(`[Payment] Schedule-change verified: user=${userId}, ${sub.tier} → ${tier}, activates=${cycleEnd.toISOString()}`);

    res.json({
      success: true,
      message: `Plan change to ${tier.charAt(0).toUpperCase() + tier.slice(1)} scheduled for ${cycleEnd.toLocaleDateString()}.`,
      data: {
        upcoming_tier: tier,
        upcoming_period: period,
        upcoming_start_date: cycleEnd.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Payment] Verify schedule-change error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to verify schedule change' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/cancel-pending-schedule                               */
/*  Cancel a deferred sub created by schedule-change if user dismissed  */
/*  the checkout modal without authenticating.                         */
/* ------------------------------------------------------------------ */

router.post('/cancel-pending-schedule', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('pending_activation_sub_id')
      .eq('user_id', userId)
      .single();

    if (!sub?.pending_activation_sub_id) {
      return res.json({ success: true, message: 'Nothing to clean up.' });
    }

    // Cancel the orphaned deferred sub on Razorpay
    try {
      await cancelSubscription(sub.pending_activation_sub_id);
    } catch (e: any) {
      const desc = e?.error?.description || e.message || '';
      if (!desc.includes('already cancelled')) {
        console.warn('[Payment] Failed to cancel pending schedule sub:', desc);
      }
    }

    // Clear the pending field
    await supabaseAdmin
      .from('subscriptions')
      .update({ pending_activation_sub_id: null })
      .eq('user_id', userId);

    console.log(`[Payment] Cancelled pending schedule-change checkout: user=${userId}`);

    res.json({ success: true, message: 'Schedule change cancelled.' });
  } catch (error: any) {
    console.error('[Payment] Cancel pending schedule error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel pending schedule' });
  }
});


/* ------------------------------------------------------------------ */
/*  POST /payment/activate-now                                          */
/*  Immediately activate the upcoming plan (creates new checkout)       */
/* ------------------------------------------------------------------ */

router.post('/activate-now', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Fetch current subscription with upcoming info
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub?.upcoming_tier) {
      return res.status(400).json({ success: false, message: 'No upcoming plan change to activate.' });
    }

    const upcomingTier = sub.upcoming_tier;
    const upcomingPeriod = sub.upcoming_period || 'monthly';

    // ── Activate Now: downgrade to Free ──────────────────────────
    if (upcomingTier === 'free') {
      // Cancel the deferred subscription if it exists
      if (sub.upcoming_razorpay_sub_id) {
        try {
          await cancelSubscription(sub.upcoming_razorpay_sub_id);
        } catch (e: any) {
          if (!e.message?.includes('already cancelled')) {
            console.warn('[Payment] Failed to cancel deferred sub:', e.message);
          }
        }
      }

      // Cancel current subscription immediately (may be 'active' or 'paused')
      if (sub.razorpay_subscription_id) {
        try {
          await cancelSubscription(sub.razorpay_subscription_id);
        } catch (e: any) {
          const desc = e?.error?.description || e.message || '';
          if (!desc.includes('already cancelled')) {
            console.warn('[Payment] Failed to cancel current sub:', desc);
          }
        }
      }

      // Immediately downgrade to free
      const freePlan = PLAN_CONFIGS.free;
      await supabaseAdmin
        .from('subscriptions')
        .update({
          tier: 'free',
          status: 'cancelled',
          upcoming_tier: null,
          upcoming_period: null,
          upcoming_razorpay_sub_id: null,
          upcoming_start_date: null,
          cancel_at_cycle_end: false,
          razorpay_subscription_id: null,
        })
        .eq('user_id', userId);

      await supabaseAdmin
        .from('profiles')
        .update({
          plan_type: 'free',
          updated_at: new Date().toISOString(),
          chat_limit_daily: freePlan.limits.chat.daily,
          chat_limit_monthly: freePlan.limits.chat.monthly,
          voice_limit_daily: freePlan.limits.voice.daily,
          voice_limit_monthly: freePlan.limits.voice.monthly,
          image_limit_daily: freePlan.limits.image.daily,
          image_limit_monthly: freePlan.limits.image.monthly,
        })
        .eq('id', userId);

      return res.json({
        success: true,
        message: 'Downgraded to Free plan immediately.',
        data: { tier: 'free', immediate: true },
      });
    }

    // ── Activate Now: switch to a paid tier ──────────────────────
    // Razorpay does NOT allow updating start_at for UPI-based subs,
    // so we always create a new immediate subscription and open checkout.
    // IMPORTANT: Do NOT cancel the deferred sub or clear upcoming fields here.
    // That only happens after the user successfully pays in /verify.
    // If the user dismisses checkout, their scheduled plan change is preserved.

    const newSub = await createSubscription(
      upcomingTier as 'starter' | 'pro',
      upcomingPeriod as 'monthly' | 'annually',
      userEmail,
      userId,
    );

    // Store pending activation sub so /verify knows this is an "activate now" flow
    await supabaseAdmin
      .from('subscriptions')
      .update({ pending_activation_sub_id: newSub.id })
      .eq('user_id', userId);

    console.log(`[Payment] Activate-now checkout: user=${userId}, upcoming=${upcomingTier}, newSub=${newSub.id}`);

    // Return checkout data — frontend opens Razorpay checkout
    res.json({
      success: true,
      data: {
        subscription_id: newSub.id,
        key_id: getKeyId(),
        amount: PLAN_PRICES_INR[upcomingTier as 'starter' | 'pro'][upcomingPeriod as 'monthly' | 'annually'],
        currency: 'INR',
        tier: upcomingTier,
        period: upcomingPeriod,
        name: 'Sree AI',
        description: `${upcomingTier.charAt(0).toUpperCase() + upcomingTier.slice(1)} Plan — Activate Now`,
        prefill: { email: userEmail },
      },
    });
  } catch (error: any) {
    console.error('[Payment] Activate now error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to activate plan' });
  }
});




/* ------------------------------------------------------------------ */
/*  POST /payment/cancel-upcoming                                       */
/*  Cancel the scheduled plan change and reinstate current plan         */
/* ------------------------------------------------------------------ */

router.post('/cancel-upcoming', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub?.upcoming_tier) {
      return res.status(400).json({ success: false, message: 'No upcoming plan change to cancel.' });
    }

    // 1. Cancel the deferred Razorpay subscription (the upcoming one)
    if (sub.upcoming_razorpay_sub_id) {
      try {
        await cancelSubscription(sub.upcoming_razorpay_sub_id);
        console.log(`[Payment] Cancelled deferred sub ${sub.upcoming_razorpay_sub_id}`);
      } catch (e: any) {
        const desc = e?.error?.description || e.message || '';
        if (!desc.includes('already cancelled')) {
          console.warn('[Payment] Failed to cancel deferred sub:', desc);
        }
      }
    }

    // 2. RESUME the paused current subscription so it continues charging
    if (sub.razorpay_subscription_id) {
      try {
        const rzpSub = await fetchSubscription(sub.razorpay_subscription_id);
        if (rzpSub?.status === 'paused') {
          await resumeSubscription(sub.razorpay_subscription_id);
          console.log(`[Payment] Resumed paused sub ${sub.razorpay_subscription_id}`);
        } else if (rzpSub?.status === 'active') {
          console.log(`[Payment] Current sub ${sub.razorpay_subscription_id} is still active, no resume needed`);
        } else if (rzpSub?.status === 'cancelled') {
          // Sub is dead — can't resume. Return error so DB stays consistent.
          console.error(`[Payment] Current sub ${sub.razorpay_subscription_id} is cancelled — cannot resume`);
          return res.status(500).json({
            success: false,
            message: 'Your previous subscription has expired and cannot be reinstated. Please subscribe again from the pricing page.',
          });
        } else {
          console.warn(`[Payment] Current sub ${sub.razorpay_subscription_id} is ${rzpSub?.status} — cannot resume`);
          return res.status(500).json({
            success: false,
            message: 'Unable to reinstate your subscription. Please subscribe again from the pricing page.',
          });
        }
      } catch (e: any) {
        console.error('[Payment] Failed to resume current sub:', e?.error?.description || e.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to reinstate your subscription. Please try again or subscribe from the pricing page.',
        });
      }
    }

    // 3. Cancel any pending activation subscription from activate-now
    if (sub.pending_activation_sub_id) {
      try {
        await cancelSubscription(sub.pending_activation_sub_id);
      } catch (e: any) {
        const desc = e?.error?.description || e.message || '';
        if (!desc.includes('already cancelled')) {
          console.warn('[Payment] Failed to cancel pending activation sub:', desc);
        }
      }
    }

    // 4. Clear upcoming plan info in DB
    await supabaseAdmin
      .from('subscriptions')
      .update({
        upcoming_tier: null,
        upcoming_period: null,
        upcoming_razorpay_sub_id: null,
        upcoming_start_date: null,
        cancel_at_cycle_end: false,
        pending_activation_sub_id: null,
      })
      .eq('user_id', userId);

    console.log(`[Payment] Cancelled upcoming change: user=${userId}, was going to ${sub.upcoming_tier}`);

    res.json({
      success: true,
      message: `Scheduled change to ${sub.upcoming_tier} has been cancelled. You will continue on your current plan.`,
    });
  } catch (error: any) {
    console.error('[Payment] Cancel upcoming error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel upcoming change' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/cancel-pending-activation                             */
/*  Clean up after a dismissed/failed activate-now Razorpay checkout    */
/* ------------------------------------------------------------------ */

router.post('/cancel-pending-activation', authMiddleware, paymentRateLimit(5), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('pending_activation_sub_id')
      .eq('user_id', userId)
      .single();

    if (!sub?.pending_activation_sub_id) {
      return res.json({ success: true, message: 'Nothing to clean up.' });
    }

    // Cancel the orphaned Razorpay subscription
    try {
      await cancelSubscription(sub.pending_activation_sub_id);
    } catch (e: any) {
      if (!e.message?.includes('already cancelled')) {
        console.warn('[Payment] Failed to cancel pending activation sub:', e.message);
      }
    }

    // Clear the pending field — the upcoming plan remains scheduled
    await supabaseAdmin
      .from('subscriptions')
      .update({ pending_activation_sub_id: null })
      .eq('user_id', userId);

    console.log(`[Payment] Cleaned up pending activation: user=${userId}`);

    res.json({
      success: true,
      message: 'Pending activation cancelled. Your upcoming plan change remains scheduled.',
    });
  } catch (error: any) {
    console.error('[Payment] Cancel pending activation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel pending activation' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/cancel-current                                        */
/*  Cancel current plan at end of cycle (no renewal, go to Free)       */
/* ------------------------------------------------------------------ */

router.post('/cancel-current', authMiddleware, paymentRateLimit(3), async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub?.razorpay_subscription_id || sub.status !== 'active') {
      return res.status(400).json({ success: false, message: 'No active subscription to cancel.' });
    }

    if (sub.cancel_at_cycle_end) {
      return res.status(400).json({ success: false, message: 'Subscription is already set to cancel at cycle end.' });
    }

    // PAUSE the subscription (not cancel — pause is reversible!)
    // User can undo this via cancel-upcoming, which resumes the paused sub.
    try {
      const rzpSub = await fetchSubscription(sub.razorpay_subscription_id);
      if (rzpSub?.status === 'active') {
        await pauseSubscription(sub.razorpay_subscription_id);
        console.log(`[Payment] Paused sub ${sub.razorpay_subscription_id} for end-of-cycle cancellation`);
      } else if (rzpSub?.status === 'paused') {
        console.log(`[Payment] Sub ${sub.razorpay_subscription_id} already paused`);
      } else {
        // Sub is in an unexpected state — fall back to cancel
        await cancelSubscriptionAtCycleEnd(sub.razorpay_subscription_id);
        console.log(`[Payment] Fallback: cancelled sub at cycle end (was ${rzpSub?.status})`);
      }
    } catch (pauseErr: any) {
      const errMsg = pauseErr?.error?.description || pauseErr.message || '';
      console.error('[Payment] Failed to pause sub:', errMsg);
      // Fall back to cancel at cycle end
      try {
        await cancelSubscriptionAtCycleEnd(sub.razorpay_subscription_id);
        console.log(`[Payment] Fallback: cancelled at cycle end after pause failure`);
      } catch (cancelErr: any) {
        console.error('[Payment] Fallback cancel also failed:', cancelErr?.error?.description || cancelErr.message);
        return res.status(500).json({ success: false, message: 'Failed to cancel subscription.' });
      }
    }

    // Update DB — set upcoming_tier to 'free' so the system knows to downgrade
    await supabaseAdmin
      .from('subscriptions')
      .update({
        cancel_at_cycle_end: true,
        upcoming_tier: 'free',
        upcoming_start_date: sub.billing_cycle_end,
      })
      .eq('user_id', userId);

    console.log(`[Payment] Subscription set to cancel at cycle end: user=${userId}, tier=${sub.tier}`);

    res.json({
      success: true,
      message: `Your ${sub.tier} plan will remain active until ${new Date(sub.billing_cycle_end).toLocaleDateString()}. After that, you will be on the Free plan.`,
      data: {
        cancel_at_cycle_end: true,
        current_period_end: sub.billing_cycle_end,
      },
    });
  } catch (error: any) {
    console.error('[Payment] Cancel current error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to cancel subscription' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/plans/sync                                            */
/*  Admin: ensure all Razorpay plans exist (idempotent)                 */
/* ------------------------------------------------------------------ */

router.post('/plans/sync', authMiddleware, paymentRateLimit(3), async (req: any, res: Response) => {
  try {
    const plans = await syncAllPlans();
    res.json({ success: true, data: plans });
  } catch (error: any) {
    console.error('[Payment] Plan sync error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /payment/test-cycle-end  (DEV ONLY)                           */
/*  Sets up a test scenario where the current plan ends in ~N min      */
/*  and a deferred upcoming sub is ready to take over.                 */
/* ------------------------------------------------------------------ */
router.post('/test-cycle-end', authMiddleware, async (req: any, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ success: false, message: 'Only available in development.' });
  }

  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const minutesFromNow = Number(req.body.minutesFromNow) || 15;
    const upcomingTier = (req.body.tier || 'pro') as 'starter' | 'pro';
    const upcomingPeriod = (req.body.period || 'monthly') as 'monthly' | 'annually';

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!sub) {
      return res.status(400).json({ success: false, message: 'No subscription found.' });
    }

    // Cancel existing deferred sub if any
    if (sub.upcoming_razorpay_sub_id) {
      try {
        await cancelSubscription(sub.upcoming_razorpay_sub_id);
        console.log(`[Test] Cancelled old deferred sub: ${sub.upcoming_razorpay_sub_id}`);
      } catch (e: any) {
        console.warn('[Test] Could not cancel old deferred:', e?.error?.description || e.message);
      }
    }

    // Set cycle end to N minutes from now
    const cycleEnd = new Date(Date.now() + minutesFromNow * 60 * 1000);
    const startAtUnix = Math.floor(cycleEnd.getTime() / 1000);

    // Create deferred sub
    const deferredSub = await createDeferredSubscription(
      upcomingTier, upcomingPeriod, userEmail, userId, startAtUnix,
    );
    console.log(`[Test] Created deferred sub: ${deferredSub.id}, start_at=${cycleEnd.toISOString()}`);

    // Pause current sub if active
    if (sub.razorpay_subscription_id) {
      try {
        const rzpCurrent = await fetchSubscription(sub.razorpay_subscription_id);
        if (rzpCurrent?.status === 'active') {
          await pauseSubscription(sub.razorpay_subscription_id);
          console.log(`[Test] Paused current sub: ${sub.razorpay_subscription_id}`);
        }
      } catch (e: any) {
        console.warn('[Test] Could not pause current:', e?.error?.description || e.message);
      }
    }

    // Update DB
    await supabaseAdmin
      .from('subscriptions')
      .update({
        billing_cycle_end: cycleEnd.toISOString(),
        current_period_end: cycleEnd.toISOString(),
        upcoming_tier: upcomingTier,
        upcoming_period: upcomingPeriod,
        upcoming_razorpay_sub_id: deferredSub.id,
        upcoming_start_date: cycleEnd.toISOString(),
        cancel_at_cycle_end: true,
        pending_activation_sub_id: deferredSub.id,
      })
      .eq('user_id', userId);

    console.log(`[Test] Ready: ${sub.tier} ends ${cycleEnd.toLocaleTimeString()}, ${upcomingTier} starts after`);

    res.json({
      success: true,
      message: `Test set up! ${sub.tier} ends at ${cycleEnd.toLocaleTimeString()}. Now authenticate the ${upcomingTier} plan.`,
      data: {
        subscription_id: deferredSub.id,
        key_id: getKeyId(),
        amount: 500,
        currency: 'INR',
        tier: upcomingTier,
        period: upcomingPeriod,
        cycle_ends_at: cycleEnd.toISOString(),
        start_at_unix: startAtUnix,
        name: 'Sree AI Test',
        description: `${upcomingTier} Plan (starts ${cycleEnd.toLocaleTimeString()})`,
        prefill: { email: userEmail },
      },
    });
  } catch (error: any) {
    console.error('[Test] Setup error:', error);
    res.status(500).json({ success: false, message: error.message || 'Test setup failed' });
  }
});

export default router;

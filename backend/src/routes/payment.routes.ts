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

    // 7. Record in payment history
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
      const rawBody = JSON.stringify(req.body);
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

        if (userId && tier) {
          // Check if there's an existing (paused) subscription to clean up
          const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('razorpay_subscription_id')
            .eq('user_id', userId)
            .single();

          const oldSubId = existingSub?.razorpay_subscription_id;
          if (oldSubId && oldSubId !== sub.id) {
            // Cancel the old (paused) subscription — we're switching to the new one
            try {
              await cancelSubscription(oldSubId);
              console.log(`[Webhook] Cancelled old sub ${oldSubId} (replaced by ${sub.id})`);
            } catch (e: any) {
              // Already dead — ignore
              console.log(`[Webhook] Old sub ${oldSubId} cleanup: ${e?.error?.description || e.message}`);
            }
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

          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'active',
              billing_cycle_start: now.toISOString(),
              billing_cycle_end: cycleEnd.toISOString(),
              current_period_end: cycleEnd.toISOString(),
            })
            .eq('user_id', userId);

          // Record payment
          if (payment) {
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
          // Check if there's an upcoming plan scheduled
          const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('upcoming_tier, upcoming_period, upcoming_razorpay_sub_id, upcoming_start_date')
            .eq('user_id', userId)
            .single();

          if (existingSub?.upcoming_tier && existingSub.upcoming_tier !== 'free') {
            // Upcoming plan exists — don't downgrade to free, just mark current as cancelled
            // The deferred subscription will activate via subscription.activated webhook
            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'pending_switch' })
              .eq('user_id', userId);

            console.log(`[Webhook] Subscription cancelled but upcoming plan (${existingSub.upcoming_tier}) scheduled: user=${userId}`);
          } else if (existingSub?.upcoming_tier === 'free') {
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

            console.log(`[Webhook] Subscription cancelled → downgraded to Free (scheduled): user=${userId}`);
          } else {
            // No upcoming plan — simple cancellation → downgrade to free
            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'cancelled' })
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

            console.log(`[Webhook] Subscription cancelled → downgraded to Free: user=${userId}`);
          }
        }
        break;
      }

      /* ---- Payment failed ---- */
      case 'payment.failed': {
        const payment = payload.payment?.entity;
        if (payment?.notes?.user_id) {
          await supabaseAdmin.from('payment_history').insert({
            user_id: payment.notes.user_id,
            razorpay_payment_id: payment.id,
            amount: payment.amount,
            currency: payment.currency || 'INR',
            status: 'failed',
            tier: payment.notes.tier || null,
          });
          console.log(`[Webhook] Payment failed: user=${payment.notes.user_id}`);
        }
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
            .select('upcoming_tier, cancel_at_cycle_end, billing_cycle_end')
            .eq('user_id', userId)
            .single();

          if (existingSub?.upcoming_tier) {
            // Expected pause — our code already set upcoming_tier
            // (cancel-current set 'free', schedule-change set 'starter'/'pro')
            console.log(`[Webhook] Subscription paused (expected): user=${userId}, upcoming=${existingSub.upcoming_tier}`);
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
      return res.json({
        success: true,
        data: {
          has_active_subscription: false,
          tier: 'free',
          status: sub?.status || 'none',
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

      return res.json({
        success: true,
        data: {
          has_active_subscription: false,
          tier: 'free',
          status: 'cancelled',
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

    // PAUSE current Razorpay subscription (NOT cancel — pause is reversible!)
    // If user later cancels the upcoming plan, we can RESUME this sub.
    // Cancel is irreversible on Razorpay — once cancelled, it's dead forever.
    let rzpSubAlive = true;
    try {
      const rzpSub = await fetchSubscription(sub.razorpay_subscription_id);
      const rzpStatus = rzpSub?.status;
      if (['cancelled', 'completed', 'expired'].includes(rzpStatus)) {
        rzpSubAlive = false;
        console.log(`[Payment] Razorpay sub ${sub.razorpay_subscription_id} already ${rzpStatus}, skipping pause`);
      } else if (rzpStatus === 'paused') {
        rzpSubAlive = false; // Already paused from a previous schedule-change
        console.log(`[Payment] Razorpay sub ${sub.razorpay_subscription_id} already paused`);
      }
    } catch (fetchErr) {
      rzpSubAlive = false;
      console.log(`[Payment] Could not fetch Razorpay sub ${sub.razorpay_subscription_id}, treating as dead`);
    }

    if (rzpSubAlive) {
      try {
        await pauseSubscription(sub.razorpay_subscription_id);
        console.log(`[Payment] Paused current sub ${sub.razorpay_subscription_id}`);
      } catch (pauseErr: any) {
        const errMsg = pauseErr.message || pauseErr?.error?.description || '';
        const errDesc = pauseErr?.error?.description || '';
        console.error('[Payment] Failed to pause current sub:', errMsg || errDesc);
        // If pause fails, fall back to cancel at cycle end
        try {
          await cancelSubscriptionAtCycleEnd(sub.razorpay_subscription_id);
          console.log(`[Payment] Fallback: cancelled at cycle end instead of pause`);
        } catch (cancelErr: any) {
          const cMsg = cancelErr?.error?.description || cancelErr.message || '';
          const isHarmless = cMsg.includes('already cancelled') || cMsg.includes('no billing cycle');
          if (!isHarmless) {
            console.error('[Payment] Fallback cancel also failed:', cMsg);
            return res.status(500).json({ success: false, message: 'Failed to schedule change.' });
          }
        }
      }
    }

    let upcomingSubId: string | null = null;

    if (tier !== 'free') {
      // Create deferred subscription for the new paid plan
      const startAtUnix = Math.floor(cycleEnd.getTime() / 1000);
      try {
        const deferredSub = await createDeferredSubscription(
          tier as 'starter' | 'pro',
          period as 'monthly' | 'annually',
          userEmail,
          userId,
          startAtUnix,
        );
        upcomingSubId = deferredSub.id;
      } catch (err: any) {
        console.error('[Payment] Failed to create deferred subscription:', err);
        return res.status(500).json({ success: false, message: 'Failed to create upcoming subscription.' });
      }
    }

    // Save upcoming plan info in DB
    await supabaseAdmin
      .from('subscriptions')
      .update({
        upcoming_tier: tier,
        upcoming_period: tier === 'free' ? null : period,
        upcoming_razorpay_sub_id: upcomingSubId,
        upcoming_start_date: cycleEnd.toISOString(),
        cancel_at_cycle_end: true,
      })
      .eq('user_id', userId);

    console.log(`[Payment] Scheduled plan change: user=${userId}, ${sub.tier} → ${tier}, activates=${cycleEnd.toISOString()}`);

    res.json({
      success: true,
      message: `Plan change to ${tier.charAt(0).toUpperCase() + tier.slice(1)} scheduled for ${cycleEnd.toLocaleDateString()}.`,
      data: {
        upcoming_tier: tier,
        upcoming_period: tier === 'free' ? null : period,
        upcoming_start_date: cycleEnd.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Payment] Schedule change error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to schedule plan change' });
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
    // IMPORTANT: Do NOT cancel the current subscription or change
    // tier/status yet. Only create a new Razorpay subscription and
    // return checkout data. The actual switch happens in /verify
    // after the user successfully pays.
    const newSub = await createSubscription(
      upcomingTier as 'starter' | 'pro',
      upcomingPeriod as 'monthly' | 'annually',
      userEmail,
      userId,
    );

    // Store the pending activation sub ID so /verify knows this is
    // an "activate now" flow and can complete the switch.
    await supabaseAdmin
      .from('subscriptions')
      .update({
        pending_activation_sub_id: newSub.id,
      })
      .eq('user_id', userId);

    console.log(`[Payment] Activate-now checkout created: user=${userId}, upcoming=${upcomingTier}, newSub=${newSub.id}`);

    // Return checkout data (frontend opens Razorpay checkout)
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

export default router;

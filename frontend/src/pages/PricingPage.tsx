import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Zap, Star, ArrowLeft, Sparkles, CheckCircle2, Lock, HelpCircle, Infinity } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { useUsageStore } from '../store/usage.store';
import { paymentService } from '../lib/api';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import toast from 'react-hot-toast';
import styles from './PricingPage.module.css';

declare global {
  interface Window { Razorpay: any; }
}

/** Load Razorpay checkout.js on demand — avoids 600+ extra requests on every page */
let razorpayLoaded = false;
function loadRazorpayScript(): Promise<void> {
  if (razorpayLoaded || window.Razorpay) {
    razorpayLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.id = 'razorpay-checkout-script';
    script.onload = () => { razorpayLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.head.appendChild(script);
  });
}

/** Remove Razorpay script + iframes to stop background network calls */
function cleanupRazorpay() {
  // Remove the script tag
  const script = document.getElementById('razorpay-checkout-script');
  if (script) script.remove();
  // Remove any Razorpay iframes (checkout modal leftovers)
  document.querySelectorAll('iframe[src*="razorpay"]').forEach(el => el.remove());
  // Remove Razorpay backdrop/overlay divs
  document.querySelectorAll('.razorpay-container, .razorpay-backdrop').forEach(el => el.remove());
  // Reset state so script can be re-loaded if needed
  razorpayLoaded = false;
  delete (window as any).Razorpay;
}

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser } = useAuthStore();
  const { fetchStatus } = useUsageStore();

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('monthly');
  const [loadingTier, setLoadingTier] = useState<'starter' | 'pro' | 'free' | null>(null);
  const [successTier, setSuccessTier] = useState<'starter' | 'pro' | 'free' | null>(null);

  // Dynamic currency display — toggles every 3 seconds
  const [displayCurrency, setDisplayCurrency] = useState<'usd' | 'inr'>('usd');

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayCurrency(prev => prev === 'usd' ? 'inr' : 'usd');
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  // Pre-select tier if passed in query params (e.g. /pricing?plan=pro)
  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (planParam === 'pro' || planParam === 'starter') {
      // Any specific logic on landing on the page can go here
    }
  }, [searchParams]);

  const handleSelectPlan = async (tier: 'free' | 'starter' | 'pro') => {
    if (!user) {
      navigate(`/signup?redirect=pricing&plan=${tier}`);
      return;
    }

    const currentTier = user.plan_type || 'free';

    if (currentTier === tier) {
      toast.success(`You are already on the ${tier.toUpperCase()} plan.`);
      return;
    }

    const tierOrder = { free: 0, starter: 1, pro: 2 };
    const currentOrder = tierOrder[currentTier as keyof typeof tierOrder] ?? 0;
    const targetOrder = tierOrder[tier];
    const isFromFree = currentTier === 'free';

    // ─────────────────────────────────────────────────────────────
    // CASE 1: Free → Paid (immediate Razorpay checkout)
    // ─────────────────────────────────────────────────────────────
    if (isFromFree && targetOrder > 0) {
      setLoadingTier(tier);
      try {
        await loadRazorpayScript();

        const { data } = await paymentService.createSubscription(
          tier as 'starter' | 'pro',
          billingPeriod,
        );

        const options = {
          key: data.key_id,
          subscription_id: data.subscription_id,
          name: data.name,
          description: data.description,
          currency: data.currency,
          prefill: data.prefill,
          theme: { color: '#3b82f6' },
          modal: {
            ondismiss: () => {
              setLoadingTier(null);
              cleanupRazorpay();
              toast('Payment cancelled.', { icon: '⚠️' });
            },
          },
          handler: async (response: any) => {
            cleanupRazorpay();
            try {
              const verifyResult = await paymentService.verifyPayment({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (verifyResult.success) {
                setUser({ ...user, plan_type: tier });
                await fetchStatus(false);
                toast.success(verifyResult.message || `Welcome to ${tier.charAt(0).toUpperCase() + tier.slice(1)}!`);
                navigate('/chat');
              } else {
                toast.error('Payment verification failed. Contact support.');
              }
            } catch (err: any) {
              console.error('Verification error:', err);
              toast.error(err?.response?.data?.message || 'Payment verification failed.');
            } finally {
              setLoadingTier(null);
            }
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp: any) => {
          setLoadingTier(null);
          toast.error(resp.error?.description || 'Payment failed. Please try again.');
        });
        rzp.open();
      } catch (error: any) {
        console.error('Create subscription failed:', error);
        toast.error(error?.response?.data?.message || 'Failed to initiate payment.');
        setLoadingTier(null);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 2: Paid → Free  (end-of-cycle downgrade)
    // CASE 3: Paid → Paid  (end-of-cycle switch — both up & down)
    // ─────────────────────────────────────────────────────────────
    const isDowngrade = targetOrder < currentOrder;
    const isUpgrade = targetOrder > currentOrder;
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const currentLabel = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);

    let confirmMessage: string;
    if (tier === 'free') {
      confirmMessage =
        `Are you sure you want to downgrade from ${currentLabel} to Free?\n\n` +
        `Your ${currentLabel} plan will remain active until the end of your current billing cycle. ` +
        `After that, you'll be on the Free plan with reduced limits.`;
    } else if (isDowngrade) {
      confirmMessage =
        `Are you sure you want to downgrade from ${currentLabel} to ${tierLabel}?\n\n` +
        `Your ${currentLabel} plan will remain active until the end of your current billing cycle. ` +
        `The ${tierLabel} plan will automatically start after that.`;
    } else {
      confirmMessage =
        `Are you sure you want to upgrade from ${currentLabel} to ${tierLabel}?\n\n` +
        `Your ${currentLabel} plan will remain active until the end of your current billing cycle. ` +
        `The ${tierLabel} plan will automatically start after that.`;
    }

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    setLoadingTier(tier);
    try {
      const response = await paymentService.scheduleChange(
        tier,
        tier !== 'free' ? billingPeriod : undefined,
      );
      if (response.success) {
        toast.success(
          response.message ||
          `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${tierLabel} scheduled at end of billing cycle.`
        );
        // Navigate to billing settings so user can see the upcoming plan
        navigate('/settings?tab=billing');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || `Failed to schedule plan change.`);
    } finally {
      setLoadingTier(null);
    }
  };

  // Dual currency pricing: INR for Indian users, USD for international
  const PRICES = {
    free: { usd: 0, inr: 0 },
    starter: { usd: 8, inr: 399 },
    pro: { usd: 29, inr: 899 },
  };

  const getPrice = (tier: 'free' | 'starter' | 'pro') => {
    const base = PRICES[tier];
    const cur = displayCurrency;
    const symbol = cur === 'inr' ? '₹' : '$';
    const monthly = base[cur];

    if (billingPeriod === 'annually' && monthly > 0) {
      const discounted = monthly * 0.8;
      const yearly = discounted * 12;
      return {
        symbol,
        amount: cur === 'inr' ? Math.round(discounted).toString() : discounted.toFixed(2),
        period: '/mo',
        extra: `Billed annually (${symbol}${cur === 'inr' ? Math.round(yearly).toLocaleString('en-IN') : yearly.toFixed(0)}/yr)`,
      };
    }
    return {
      symbol,
      amount: monthly.toString(),
      period: monthly > 0 ? '/mo' : '',
      extra: monthly > 0 ? 'Billed monthly' : 'Free forever',
    };
  };


  const planCards = [
    {
      tier: 'free' as const,
      name: 'Free',
      description: 'Perfect for exploring Sree AI with no initial commitment.',
      price: 0,
      badge: null,
      btnText: 'Choose Free',
      limitsInfo: [
        { label: 'Model Access', value: '18+ Models' },
        { label: 'Chat Requests', daily: '10/day', monthly: '50/month' },
        { label: 'Voice Requests', daily: '20/day', monthly: '50/month' },
        { label: 'Image Requests', daily: '5/day', monthly: '30/month' },
        { label: 'BYOK Support', supported: true },
      ],
      features: [
        'Chat, image & video storage (30 days auto-delete)',
        'Limited chat history search',
        'Access to limited tools (Humanizer, Enhancer)',
      ],
      themeClass: styles.freeTier,
      btnClass: styles.buttonFree,
    },
    {
      tier: 'starter' as const,
      name: 'Starter',
      description: 'Ideal for creators and professionals needing reliable daily limits.',
      price: 8,
      badge: 'Popular',
      btnText: 'Upgrade to Starter',
      limitsInfo: [
        { label: 'Model Access', value: '70+ Models' },
        { label: 'Chat Requests', daily: '50/day', monthly: '600/month' },
        { label: 'Voice Requests', daily: '60/day', monthly: '500/month' },
        { label: 'Image Requests', daily: '30/day', monthly: '70/month' },
        { label: 'BYOK Support', supported: true },
      ],
      features: [
        'Chat, image & video storage (3 months auto-delete)',
        'Unlimited chat history search',
        'Standard processing queues',
        'Access to all tools (incl. 2D to 3D Convertor)',
      ],
      themeClass: styles.starterTier,
      btnClass: styles.buttonStarter,
    },
    {
      tier: 'pro' as const,
      name: 'Pro',
      description: 'Designed for power users demanding highest limits & priority GPU speeds.',
      price: 29,
      badge: 'Unleashed',
      btnText: 'Upgrade to Pro',
      limitsInfo: [
        { label: 'Model Access', value: '75+ Models' },
        { label: 'Chat Requests', daily: '200/day', monthly: '3000/month' },
        { label: 'Voice Requests', daily: '100/day', monthly: '1000/month' },
        { label: 'Image Requests', daily: '70/day', monthly: '1000/month' },
        { label: 'BYOK Support', supported: true },
      ],
      features: [
        'Chat, image & video storage (no expiration)',
        'Unlimited chat history search',
        'Highest priority GPU queues',
        'Dedicated VIP developer support',
        'Access to all tools (incl. 2D to 3D Convertor)',
      ],
      themeClass: styles.proTier,
      btnClass: styles.buttonPro,
    },
  ];

  const renderContent = () => {
    if (successTier) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={styles.successScreen}
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: '32px',
            maxWidth: '600px',
            margin: '40px auto',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          <div style={{ color: 'var(--success)', marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
            <CheckCircle2 size={72} strokeWidth={1.5} />
          </div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 16 }}>Subscription Confirmed!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
            Your account has been successfully upgraded to the <strong>{successTier.toUpperCase()}</strong> plan.
            Your new limits and features are active immediately.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button
              onClick={() => {
                setSuccessTier(null);
                navigate('/chat');
              }}
              style={{
                background: 'var(--primary)',
                color: '#0f172a',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Start Chatting
            </button>
            <button
              onClick={() => {
                setSuccessTier(null);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                padding: '12px 28px',
                borderRadius: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              View Plans
            </button>
          </div>
        </motion.div>
      );
    }

    return (
      <div className={styles.inner}>
        <div className={styles.backBtnWrapper}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Go Back</span>
          </button>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Simple, Transparent Pricing</h1>
          <p className={styles.subtitle}>
            Choose the perfect tier to unlock intelligent AI chats, high-fidelity voice, and professional graphics generation.
          </p>

          {/* Plan Info & Billing Toggle Row (Horizontal Side-by-Side) */}
          <div className={styles.controlsRow}>
            {user && (
              <div className={styles.currentPlanBanner}>
                <CheckCircle2 size={16} />
                <span>Your current plan: <strong>{user.plan_type ? user.plan_type.charAt(0).toUpperCase() + user.plan_type.slice(1) : 'Free'}</strong></span>
              </div>
            )}

            {/* Toggle */}
            <div className={styles.toggleContainer}>
              <button
                className={`${styles.toggleBtn} ${billingPeriod === 'monthly' ? styles.toggleBtnActive : ''}`}
                onClick={() => setBillingPeriod('monthly')}
              >
                {billingPeriod === 'monthly' && (
                  <motion.div
                    layoutId="billingActiveBg"
                    className={styles.activePill}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className={styles.toggleBtnText}>Monthly</span>
              </button>
              <button
                className={`${styles.toggleBtn} ${billingPeriod === 'annually' ? styles.toggleBtnActive : ''}`}
                onClick={() => setBillingPeriod('annually')}
              >
                {billingPeriod === 'annually' && (
                  <motion.div
                    layoutId="billingActiveBg"
                    className={styles.activePill}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className={styles.toggleBtnText}>Annually</span>
                <span className={styles.discountBadge}>Save 20%</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className={styles.grid}>
          {planCards.map((plan) => {
            const isCurrent = user ? user.plan_type === plan.tier : false;
            const price = getPrice(plan.tier);
            const isBestValue = plan.tier === 'starter' && !isCurrent;

            return (
              <div
                key={plan.tier}
                className={`${styles.card} ${plan.badge ? styles.cardFeatured : ''} ${isCurrent ? styles.cardActivePlan : ''}`}
              >
                {isCurrent ? (
                  <span className={styles.currentPlanBadge}>Active Plan</span>
                ) : isBestValue ? (
                  <span className={`${styles.featuredBadge} ${styles.bestValueBadge}`}>Best Value</span>
                ) : (
                  plan.badge && <span className={styles.featuredBadge}>{plan.badge}</span>
                )}
                <div className={styles.cardHeader}>
                  <div className={`${styles.planTier} ${plan.themeClass}`}>{plan.name}</div>
                  <div className={styles.priceDisplay}>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`${plan.tier}-${displayCurrency}-${billingPeriod}`}
                        className={styles.priceAmount}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                      >
                        {price.symbol}{price.amount}
                      </motion.span>
                    </AnimatePresence>
                    {plan.price > 0 && <span className={styles.pricePeriod}>{price.period}</span>}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>{price.extra}</p>
                  <p className={styles.planDesc}>{plan.description}</p>
                </div>

                <button
                  className={`${styles.button} ${plan.btnClass} ${isCurrent ? styles.buttonCurrent : ''} ${isBestValue ? styles.bestValueBtn : ''}`}
                  disabled={isCurrent || loadingTier !== null}
                  onClick={() => handleSelectPlan(plan.tier)}
                >
                  {isBestValue && (
                    <svg className={styles.borderBeam}>
                      {Array.from({ length: 24 }).map((_, i) => {
                        const f = i / 23; // 0 to 1
                        const L = 6.0 + (1 - f) * 22.0;
                        const G = L;

                        // Pure blue color interpolation (deep blue to soft sky blue) from the old style
                        const r = Math.round(30 + f * (96 - 30));
                        const g = Math.round(58 + f * (165 - 58));
                        const b = Math.round(138 + f * (250 - 138));
                        const color = `rgb(${r}, ${g}, ${b})`;

                        // Scale opacity by 0.5 to keep exact brightness balance over 24 layers
                        const opacity = (0.05 + Math.pow(f, 1.5) * 0.75) * 0.5;
                        const strokeWidth = 1.2 + f * 1.2;

                        // Continuous blur and drop-shadow from the old style for seamless volumetric glow
                        const blurVal = (2.0 - f * 1.5).toFixed(2);
                        const shadowVal = (2.0 + f * 6.0).toFixed(2);
                        const filter = `blur(${blurVal}px) drop-shadow(0 0 ${shadowVal}px ${color})`;

                        return (
                          <rect
                            key={i}
                            x="1"
                            y="1"
                            width="calc(100% - 2px)"
                            height="calc(100% - 2px)"
                            rx="15"
                            ry="15"
                            pathLength="100"
                            className={styles.beamRect}
                            style={{
                              stroke: color,
                              strokeWidth: `${strokeWidth}px`,
                              strokeDasharray: `${L} ${100 - L}`,
                              opacity,
                              filter,
                              zIndex: i + 1,
                            } as React.CSSProperties}
                          >
                            <animate
                              attributeName="stroke-dashoffset"
                              values={`${G};${G - 100}`}
                              dur="4s"
                              repeatCount="indefinite"
                            />
                          </rect>
                        );
                      })}
                    </svg>
                  )}
                  <span className={styles.btnContent}>
                    {isCurrent ? (
                      <>
                        <CheckCircle2 size={18} />
                        Current Plan
                      </>
                    ) : loadingTier === plan.tier ? (
                      'Processing...'
                    ) : (() => {
                      const tierOrder = { free: 0, starter: 1, pro: 2 };
                      const currentOrder = tierOrder[user?.plan_type as keyof typeof tierOrder] ?? 0;
                      const targetOrder = tierOrder[plan.tier];
                      const isFromFree = !user?.plan_type || user.plan_type === 'free';
                      const isUpgrade = targetOrder > currentOrder;
                      const isDowngrade = targetOrder < currentOrder && !isFromFree;
                      return (
                        <>
                          {plan.tier === 'pro' && <Zap size={18} />}
                          {plan.tier === 'starter' && <Star size={18} />}
                          {!user && plan.tier === 'free'
                            ? 'Sign Up'
                            : isFromFree && isUpgrade
                              ? `Upgrade to ${plan.name}`
                              : isDowngrade && plan.tier === 'free'
                                ? `Downgrade to Free`
                                : isDowngrade
                                  ? `Switch to ${plan.name}`
                                  : isUpgrade
                                    ? `Switch to ${plan.name}`
                                    : plan.btnText}
                        </>
                      );
                    })()}
                  </span>
                </button>

                {/* Quota Limits Section */}
                <div className={styles.cardLimits}>
                  {plan.limitsInfo.map((limit, idx) => {
                    if ('supported' in limit) {
                      return (
                        <div key={idx} className={styles.limitRow}>
                          <span className={styles.limitLabel}>{limit.label}</span>
                          <span className={styles.limitValue}>
                            BYOK <CheckCircle2 size={16} className={styles.checkIcon} />
                          </span>
                        </div>
                      );
                    }
                    if ('value' in limit) {
                      return (
                        <div key={idx} className={styles.limitRow}>
                          <span className={styles.limitLabel}>{limit.label}</span>
                          <span className={styles.limitValue}>{limit.value}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className={styles.limitRow}>
                        <span className={styles.limitLabel}>{limit.label}</span>
                        <div className={styles.valueWithInfo}>
                          <span className={styles.limitValue}>{limit.daily}</span>
                          <span
                            className={styles.infoIconWrapper}
                            title={`${limit.label}: ${limit.daily} / ${limit.monthly}`}
                          >
                            <HelpCircle size={14} className={styles.infoIcon} />
                            <div className={styles.tooltipContent}>
                              <div className={styles.tooltipTitle}>{limit.label}</div>
                              <div className={styles.tooltipDetail}>
                                <span>Daily Limit:</span> <strong>{limit.daily}</strong>
                              </div>
                              <div className={styles.tooltipDetail}>
                                <span>Monthly Limit:</span> <strong>{limit.monthly}</strong>
                              </div>
                            </div>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <ul className={styles.cardFeatures}>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className={styles.featureItem}>
                      <Check
                        size={16}
                        className={`${styles.featureIcon} ${plan.tier === 'pro' ? styles.featureIconPro : ''}`}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Detailed Comparison Table */}
        <div className={styles.comparisonSection}>
          <h2 className={styles.comparisonTitle}>Compare Plan Details</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.th} ${styles.thLabel}`}>Features & Limits</th>
                  <th className={`${styles.th} ${styles.thCol}`}>Free</th>
                  <th className={`${styles.th} ${styles.thCol}`}>Starter</th>
                  <th className={`${styles.th} ${styles.thCol}`}>Pro</th>
                </tr>
              </thead>
              <tbody>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Monthly Pricing</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>{displayCurrency === 'inr' ? '₹0' : '$0'}</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>{displayCurrency === 'inr' ? '₹399/mo' : '$8/mo'}</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>{displayCurrency === 'inr' ? '₹899/mo' : '$29/mo'}</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Annual Discount</td>
                  <td className={`${styles.td} ${styles.tdCol}`}><span className={styles.dash}>—</span></td>
                  <td className={`${styles.td} ${styles.tdCol}`}>$6.40/mo (Save 20%)</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>$23.20/mo (Save 20%)</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Model Access</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>18+ models</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>70+ models</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>75+ models</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Daily Chat Requests</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>10 / day</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>50 / day</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>200 / day</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Monthly Chat Requests</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>50 / month</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>600 / month</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>3000 / month</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Chat Limit per Minute</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>5 / min</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>10 / min</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>20 / min</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Daily Voice Synthesis</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>20 / day</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>60 / day</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>100 / day</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Monthly Voice Synthesis</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>50 / month</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>500 / month</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>1000 / month</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Daily Image Generations</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>5 / day</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>30 / day</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>70 / day</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Monthly Image Generations</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>30 / month</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>70 / month</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>1000 / month</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span>Database Auto-Delete Period</span>
                      <span
                        title="To optimize database storage, inactive chats, images, and videos are automatically deleted after this duration."
                        style={{ display: 'inline-flex', cursor: 'help' }}
                      >
                        <HelpCircle
                          size={14}
                          style={{ color: 'var(--text-muted)' }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className={`${styles.td} ${styles.tdCol}`}>30 days</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>3 months</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>
                    <div style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Infinity size={20} style={{ color: 'var(--accent)' }} />
                    </div>
                  </td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Tools Access</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>Limited (Humanizer, Enhancer)</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>All Tools (incl. 2D to 3D)</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>All Tools (incl. 2D to 3D)</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Access to Flagship Models</td>
                  <td className={`${styles.td} ${styles.tdCol}`}><span className={styles.dash}>—</span></td>
                  <td className={`${styles.td} ${styles.tdCol}`}><Check className={styles.check} size={16} /></td>
                  <td className={`${styles.td} ${styles.tdCol}`}><Check className={styles.check} size={16} /></td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Priority GPU Queues</td>
                  <td className={`${styles.td} ${styles.tdCol}`}><span className={styles.dash}>—</span></td>
                  <td className={`${styles.td} ${styles.tdCol}`}><span className={styles.dash}>—</span></td>
                  <td className={`${styles.td} ${styles.tdCol}`}><Check className={styles.check} size={16} /></td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Bring Your Own Keys (BYOK)</td>
                  <td className={`${styles.td} ${styles.tdCol}`}><Check className={styles.check} size={16} /></td>
                  <td className={`${styles.td} ${styles.tdCol}`}><Check className={styles.check} size={16} /></td>
                  <td className={`${styles.td} ${styles.tdCol}`}><Check className={styles.check} size={16} /></td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Support Priority</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>Standard</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>Standard</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>24/7 VIP Priority</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // If user is authenticated, we show it inside DashboardLayout. Otherwise, standalone.
  if (user) {
    return <DashboardLayout noSidebar>{renderContent()}</DashboardLayout>;
  }

  return (
    <div className={styles.container}>
      <div className="aurora-bg" />
      {/* Standalone public navbar */}
      <div className={styles.publicNavbar}>
        <Link to="/" className={styles.logoGroup}>
          <img
            src="/Sree-ai-Primary-logo.png"
            alt="Sree AI"
            className={styles.primaryLogo}
          />
          <img
            src="/Sree-Ai-Fav-icon-round.png"
            alt="Sree AI logo"
            className={styles.mobileLogo}
          />
        </Link>
        <div className={styles.navButtons}>
          <Link to="/login" className={styles.loginBtn}>
            Log In
          </Link>
          <Link to="/signup" className={styles.signupBtn}>
            Sign Up
          </Link>
        </div>
      </div>
      {renderContent()}
    </div>
  );
};

export default PricingPage;

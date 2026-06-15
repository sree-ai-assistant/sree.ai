import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Zap, Star, ArrowLeft, Sparkles, CheckCircle2, Lock, HelpCircle } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { useUsageStore } from '../store/usage.store';
import { userService } from '../lib/api';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import toast from 'react-hot-toast';
import styles from './PricingPage.module.css';

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser } = useAuthStore();
  const { fetchStatus } = useUsageStore();

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('monthly');
  const [loadingTier, setLoadingTier] = useState<'starter' | 'pro' | 'free' | null>(null);
  const [successTier, setSuccessTier] = useState<'starter' | 'pro' | 'free' | null>(null);

  // Pre-select tier if passed in query params (e.g. /pricing?plan=pro)
  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (planParam === 'pro' || planParam === 'starter') {
      // Any specific logic on landing on the page can go here
    }
  }, [searchParams]);

  const handleSelectPlan = async (tier: 'free' | 'starter' | 'pro') => {
    if (!user) {
      // Redirect to signup with redirect back to pricing and selected plan
      navigate(`/signup?redirect=pricing&plan=${tier}`);
      return;
    }

    if (user.plan_type === tier) {
      toast.success(`You are already on the ${tier.toUpperCase()} plan.`);
      return;
    }

    setLoadingTier(tier);
    try {
      const response = await userService.upgradeSubscription(tier);
      if (response.success) {
        // Update local user store state
        setUser({
          ...user,
          plan_type: tier,
        });

        // Sync limits and counts to usage store
        await fetchStatus(false);

        setSuccessTier(tier);
        toast.success(`Welcome to ${tier.charAt(0).toUpperCase() + tier.slice(1)}!`);
      } else {
        toast.error(response.message || 'Upgrade failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Plan selection failed:', error);
      toast.error(error.message || 'An error occurred during subscription.');
    } finally {
      setLoadingTier(null);
    }
  };

  const getPrice = (baseMonthlyPrice: number) => {
    if (billingPeriod === 'annually') {
      // 20% discount for annual
      const discounted = baseMonthlyPrice * 0.8;
      return {
        amount: discounted.toFixed(2),
        period: '/mo',
        extra: `Billed annually ($${(discounted * 12).toFixed(0)}/yr)`,
      };
    }
    return {
      amount: baseMonthlyPrice.toString(),
      period: '/mo',
      extra: 'Billed monthly',
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
        '100 MB secure cloud file storage',
        'Upload files up to 10 MB',
        'Limited chat history search',
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
        '5 GB secure cloud file storage',
        'Upload files up to 100 MB',
        'Unlimited chat history search',
        'Standard processing queues',
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
        '10 GB secure cloud file storage',
        'Upload files up to 500 MB',
        'Unlimited chat history search',
        'Highest priority GPU queues',
        'Dedicated VIP developer support',
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
              Monthly
            </button>
            <button
              className={`${styles.toggleBtn} ${billingPeriod === 'annually' ? styles.toggleBtnActive : ''}`}
              onClick={() => setBillingPeriod('annually')}
            >
              Annually
              <span className={styles.discountBadge}>Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className={styles.grid}>
          {planCards.map((plan) => {
            const isCurrent = user ? user.plan_type === plan.tier : false;
            const price = getPrice(plan.price);
            const isBestValue = plan.tier === 'pro' && !isCurrent;

            return (
              <div
                key={plan.tier}
                className={`${styles.card} ${plan.badge ? styles.cardFeatured : ''} ${isCurrent ? styles.cardActivePlan : ''}`}
              >
                {isCurrent && <span className={styles.currentPlanBadge}>Active Plan</span>}
                {isBestValue ? (
                  <span className={`${styles.featuredBadge} ${styles.bestValueBadge}`}>Best Value</span>
                ) : (
                  plan.badge && <span className={styles.featuredBadge}>{plan.badge}</span>
                )}
                <div className={styles.cardHeader}>
                  <div className={`${styles.planTier} ${plan.themeClass}`}>{plan.name}</div>
                  <div className={styles.priceDisplay}>
                    <span className={styles.priceAmount}>${price.amount}</span>
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
                  {isCurrent ? (
                    <>
                      <CheckCircle2 size={18} />
                      Current Plan
                    </>
                  ) : loadingTier === plan.tier ? (
                    'Processing...'
                  ) : (
                    <>
                      {plan.tier === 'pro' && <Zap size={18} />}
                      {plan.tier === 'starter' && <Star size={18} />}
                      {!user && plan.tier === 'free' ? 'Sign Up' : plan.btnText}
                    </>
                  )}
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
                  <td className={`${styles.td} ${styles.tdCol}`}>$0</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>$8/mo</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>$29/mo</td>
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
                  <td className={`${styles.td} ${styles.tdLabel}`}>Secure Cloud Storage</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>100 MB</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>5 GB</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>10 GB</td>
                </tr>
                <tr className={styles.tr}>
                  <td className={`${styles.td} ${styles.tdLabel}`}>Max Upload Size</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>10 MB</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>100 MB</td>
                  <td className={`${styles.td} ${styles.tdCol}`}>500 MB</td>
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
    return <DashboardLayout>{renderContent()}</DashboardLayout>;
  }

  return (
    <div className={styles.container}>
      <div className="aurora-bg" />
      {/* Standalone public navbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1200px',
          margin: '0 auto 40px',
          paddingBottom: '20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#fff', fontWeight: 800 }}>
          <div style={{ background: 'var(--primary)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
            <Zap size={18} fill="currentColor" style={{ color: '#0f172a' }} />
          </div>
          <span style={{ fontSize: '1.2rem', letterSpacing: '-0.02em' }}>Sree AI</span>
        </Link>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, padding: '8px 16px' }}>
            Log In
          </Link>
          <Link
            to="/signup"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: '12px',
            }}
          >
            Sign Up
          </Link>
        </div>
      </div>
      {renderContent()}
    </div>
  );
};

export default PricingPage;

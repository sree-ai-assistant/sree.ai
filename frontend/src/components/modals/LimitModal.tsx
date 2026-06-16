import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Sparkles, AlertCircle, Check, ArrowRight, Lock, Clock, ShieldAlert, UserPlus, LogIn, Key } from 'lucide-react';
import styles from './LimitModal.module.css';
import { useNavigate } from 'react-router-dom';

interface LimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'anonymous' | 'rate-limited' | 'tiered' | 'abuse-cooldown' | 'abuse-captcha' | 'abuse-auth' | 'abuse-restricted';
  limitInfo?: {
    limit?: number;
    current?: number;
    resetsIn?: number;
    tier?: string;
    message?: string;
    severity?: number;
  };
}

export const LimitModal: React.FC<LimitModalProps> = ({
  isOpen,
  onClose,
  type,
  limitInfo
}) => {
  const navigate = useNavigate();

  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds);
    if (s <= 0) return '0s';

    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  };

  const pricingTiers = [
    {
      name: 'Starter',
      price: '$8',
      limit: '50 requests/day',
      features: [
        '50 daily chats (70+ Primium Models)',
        '60 daily voice synthesis',
        '30 daily image generations',
        'Chat, image & video storage (3 months)',
        'Access to all tools (incl. 2D to 3D Convertor)'
      ],
      current: limitInfo?.tier?.toLowerCase() === 'starter',
      color: '#60a5fa'
    },
    {
      name: 'Pro',
      price: '$29',
      limit: '200 requests/day',
      features: [
        '200 daily chats (All 80+ models)',
        '100 daily voice synthesis',
        '70 daily image generations',
        'Chat, image & video storage (no limit)',
        'Priority GPU rendering',
        'Access to all tools (incl. 2D to 3D Convertor)'
      ],
      current: limitInfo?.tier?.toLowerCase() === 'pro',
      color: '#818cf8',
      popular: true
    }
  ];

  // Dynamic Icon selector with styling based on modal type
  const getIconConfig = () => {
    switch (type) {
      case 'rate-limited':
        return {
          icon: <Clock size={32} className={styles.iconClock} />,
          badge: 'RATE LIMIT',
          title: 'Slow Down a Bit',
          colorClass: styles.colorWarning
        };
      case 'abuse-cooldown':
        return {
          icon: <ShieldAlert size={32} className={styles.iconShield} />,
          badge: 'COOLDOWN ACTIVE',
          title: 'Temporary Cooldown',
          colorClass: styles.colorDanger
        };
      case 'abuse-captcha':
        return {
          icon: <Key size={32} className={styles.iconKey} />,
          badge: 'SECURITY CHECK',
          title: 'Verification Required',
          colorClass: styles.colorInfo
        };
      case 'abuse-auth':
        return {
          icon: <Lock size={32} className={styles.iconLock} />,
          badge: 'SIGN IN REQUIRED',
          title: 'Authentication Required',
          colorClass: styles.colorPrimary
        };
      case 'abuse-restricted':
        return {
          icon: <ShieldAlert size={32} className={styles.iconShield} />,
          badge: 'ACCESS RESTRICTED',
          title: 'Network Restricted',
          colorClass: styles.colorDanger
        };
      case 'anonymous':
      default:
        return {
          icon: <Lock size={32} className={styles.iconLock} />,
          badge: 'ANONYMOUS QUOTA',
          title: 'Daily Limit Reached',
          colorClass: styles.colorAccent
        };
    }
  };

  const iconConfig = getIconConfig();

  // Calculate usage percentage for progress bar
  const currentCount = limitInfo?.current ?? 0;
  const limitCount = limitInfo?.limit ?? 1;
  const percentUsed = Math.min(100, Math.round((currentCount / limitCount) * 100));
  const percentRemaining = Math.max(0, 100 - percentUsed);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`${styles.modal} ${type === 'tiered' ? styles.wideModal : ''}`}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Ambient Background Glows */}
            <div className={styles.glowBg} />
            <div className={styles.glowBgSecondary} />

            <button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>

            {type === 'tiered' ? (
              <div className={styles.pricingView}>
                <div className={styles.pricingHeader}>
                  <div className={styles.iconContainer}>
                    <div className={styles.pulseRing1} />
                    <div className={styles.pulseRing2} />
                    <div className={styles.iconWrapper}>
                      <Sparkles size={32} className={styles.sparkleIcon} />
                    </div>
                  </div>

                  <div className={styles.badge}>
                    <Sparkles size={11} className={styles.badgeIcon} />
                    <span>PREMIUM UPGRADE</span>
                  </div>

                  <h2 className={styles.title}>Elevate Your Experience</h2>
                  <p className={styles.description}>
                    {limitInfo?.message || (
                      <>
                        You've reached your daily limit for the <strong>{limitInfo?.tier || 'free'}</strong> plan.
                        Upgrade now for more power and features.
                      </>
                    )}
                  </p>
                </div>

                <div className={styles.pricingGrid}>
                  {pricingTiers.map((tier) => (
                    <div
                      key={tier.name}
                      className={`${styles.priceCard} ${tier.popular ? styles.popular : ''} ${tier.current ? styles.currentPlan : ''}`}
                    >
                      {tier.popular && <div className={styles.popularBadge}>Most Popular</div>}
                      <h3 className={styles.tierName}>{tier.name}</h3>
                      <div className={styles.price}>
                        <span className={styles.currency}>$</span>
                        <span className={styles.amount}>{tier.price.replace('$', '')}</span>
                        <span className={styles.period}>/mo</span>
                      </div>
                      <p className={styles.tierLimit}>{tier.limit}</p>
                      <ul className={styles.featureList}>
                        {tier.features.map(f => (
                          <li key={f} className={styles.featureItem}>
                            <Check size={14} className={styles.checkIcon} />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        className={`${styles.tierButton} ${tier.popular ? styles.popularButton : ''}`}
                        disabled={tier.current}
                        onClick={() => { navigate(`/pricing?plan=${tier.name.toLowerCase()}`); onClose(); }}
                      >
                        {tier.current ? 'Current Plan' : 'Upgrade Now'}
                      </button>
                    </div>
                  ))}
                </div>

                {limitInfo?.resetsIn !== undefined && (
                  <div className={styles.pricingFooter}>
                    <Clock size={14} className={styles.footerClockIcon} />
                    <span>Next reset in <strong>{formatTime(limitInfo.resetsIn)}</strong></span>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.content}>
                {/* Dynamic Icon with pulse rings */}
                <div className={styles.iconContainer}>
                  <div className={styles.pulseRing1} />
                  <div className={styles.pulseRing2} />
                  <div className={`${styles.iconWrapper} ${iconConfig.colorClass}`}>
                    {iconConfig.icon}
                  </div>
                </div>

                <div className={styles.header}>
                  <div className={styles.badge}>
                    <Sparkles size={11} className={styles.badgeIcon} />
                    <span>{iconConfig.badge}</span>
                  </div>
                  <h2 className={styles.title}>{iconConfig.title}</h2>
                  <p className={styles.subtitle}>
                    {type === 'rate-limited'
                      ? "You're moving a bit too fast. Please wait a moment before sending more requests."
                      : type === 'abuse-cooldown'
                        ? (limitInfo?.message || "Your account has been placed on a temporary cooldown due to unusual activity.")
                        : type === 'abuse-captcha'
                          ? (limitInfo?.message || "Please verify you're human to continue using our services.")
                          : type === 'abuse-auth'
                            ? (limitInfo?.message || "To prevent abuse, anonymous access is restricted. Please sign in to continue.")
                            : type === 'abuse-restricted'
                              ? (limitInfo?.message || "Access from this network has been temporarily restricted.")
                              : "You've used all your free requests for today. Create an account to get more requests and save your history."}
                  </p>
                </div>

                {/* Progress / Quota bar for Rate limits & Anonymous limits */}
                {limitInfo && (type === 'rate-limited' || type === 'anonymous') && limitInfo.limit !== undefined && (
                  <div className={styles.quotaBarContainer}>
                    <div className={styles.quotaBarHeader}>
                      <span className={styles.quotaLabel}>Usage Summary</span>
                      <span className={styles.quotaValue}>{percentRemaining}% remaining</span>
                    </div>
                    <div className={styles.quotaBar}>
                      <motion.div
                        className={styles.quotaProgress}
                        initial={{ width: "100%" }}
                        animate={{ width: `${percentRemaining}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        style={{
                          background: percentRemaining <= 10 ? 'linear-gradient(90deg, #ef4444, #f43f5e)' : 'linear-gradient(90deg, #818cf8, #a78bfa)'
                        }}
                      />
                    </div>
                    <div className={styles.quotaDetails}>
                      <span>{currentCount} / {limitCount} Used</span>
                      {limitInfo.resetsIn !== undefined && (
                        <span className={styles.resetsText}>Resets in {formatTime(limitInfo.resetsIn)}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Cooldown duration details */}
                {type === 'abuse-cooldown' && limitInfo?.resetsIn !== undefined && (
                  <div className={styles.cooldownIndicator}>
                    <Clock size={16} />
                    <span>Cooldown active for <strong>{formatTime(limitInfo.resetsIn)}</strong></span>
                  </div>
                )}

                <div className={styles.actions}>
                  {type === 'anonymous' || type === 'abuse-auth' ? (
                    <>
                      <button
                        className={`${styles.button} ${styles.buttonPrimary}`}
                        onClick={() => { navigate('/signup'); onClose(); }}
                      >
                        <UserPlus size={16} />
                        Create Free Account
                        <ArrowRight size={16} style={{ marginLeft: 'auto' }} />
                      </button>

                      <button
                        className={`${styles.button} ${styles.buttonSecondary}`}
                        onClick={() => { navigate('/login'); onClose(); }}
                      >
                        <LogIn size={16} />
                        Sign In
                      </button>
                    </>
                  ) : type === 'abuse-captcha' ? (
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={() => window.location.reload()}
                    >
                      Verify Now
                    </button>
                  ) : (
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={onClose}
                    >
                      I Understand
                    </button>
                  )}
                </div>

                <div className={styles.footer}>
                  <p>
                    {type.startsWith('abuse-') ? (
                      <span>If you think this is a mistake, please <a href="#" className={styles.link}>contact support</a></span>
                    ) : (
                      <>
                        Want unlimited access?{' '}
                        <span className={styles.link} onClick={() => { navigate('/pricing'); onClose(); }}>
                          View Pricing
                        </span>
                        {' '}or{' '}
                        <span
                          className={styles.link}
                          onClick={() => {
                            onClose();
                            navigate('/settings?tab=byok');
                          }}
                        >
                          BYOK
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

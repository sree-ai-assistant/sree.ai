import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Sparkles, AlertCircle, Check, ArrowRight } from 'lucide-react';
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
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    return `${hours}h`;
  };

  const pricingTiers = [
    {
      name: 'Starter',
      price: '$9',
      limit: '50 requests/day',
      features: ['Faster response times', 'Basic storage', 'Discord support'],
      current: limitInfo?.tier === 'starter',
      color: '#60a5fa'
    },
    {
      name: 'Pro',
      price: '$29',
      limit: 'Unlimited requests',
      features: ['Priority generation', 'Advanced storage', 'Early access', 'Priority support'],
      current: limitInfo?.tier === 'pro',
      color: '#818cf8',
      popular: true
    }
  ];

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
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={e => e.stopPropagation()}
          >
            <button className={styles.closeButton} onClick={onClose}>
              <X size={20} />
            </button>

            {type === 'tiered' ? (
              <div className={styles.pricingView}>
                <div className={styles.pricingHeader}>
                  <div className={styles.iconWrapper}>
                    <Sparkles size={32} />
                  </div>
                  <h2 className={styles.title}>Elevate Your Experience</h2>
                  <p className={styles.description}>
                    You've reached your daily limit for the <strong>{limitInfo?.tier || 'free'}</strong> plan. 
                    Upgrade now for more power and features.
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
                        onClick={() => navigate('/upgrade')}
                      >
                        {tier.current ? 'Current Plan' : 'Upgrade Now'}
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className={styles.pricingFooter}>
                  <p>Next reset in <strong>{formatTime(limitInfo?.resetsIn || 0)}</strong></p>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.iconWrapper}>
                  {type === 'rate-limited' || type === 'abuse-cooldown' ? <Zap size={32} /> : 
                   type === 'abuse-captcha' ? <Sparkles size={32} /> :
                   type === 'abuse-restricted' ? <X size={32} /> :
                   <AlertCircle size={32} />}
                </div>

                <h2 className={styles.title}>
                  {type === 'rate-limited' ? 'Slow Down a Bit' : 
                   type === 'abuse-cooldown' ? 'Temporary Cooldown' :
                   type === 'abuse-captcha' ? 'Verification Required' :
                   type === 'abuse-auth' ? 'Sign In Required' :
                   type === 'abuse-restricted' ? 'Access Restricted' :
                   'Daily Limit Reached'}
                </h2>
                
                <p className={styles.description}>
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

                {limitInfo && (type === 'rate-limited' || type === 'anonymous') && limitInfo.limit !== undefined && (
                  <div className={styles.stats}>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>{limitInfo.current}/{limitInfo.limit}</span>
                      <span className={styles.statLabel}>Used Today</span>
                    </div>
                    {limitInfo.resetsIn !== undefined && (
                      <div className={styles.statItem}>
                        <span className={styles.statValue}>{formatTime(limitInfo.resetsIn)}</span>
                        <span className={styles.statLabel}>Resets In</span>
                      </div>
                    )}
                  </div>
                )}

                {type === 'abuse-cooldown' && limitInfo?.resetsIn && (
                  <div className={styles.stats}>
                    <div className={styles.statItem}>
                      <span className={styles.statValue}>{formatTime(limitInfo.resetsIn)}</span>
                      <span className={styles.statLabel}>Ends In</span>
                    </div>
                  </div>
                )}

                <div className={styles.actions}>
                  {type === 'anonymous' || type === 'abuse-auth' ? (
                    <>
                      <button 
                        className={styles.primaryButton}
                        onClick={() => navigate('/login')}
                      >
                        {type === 'abuse-auth' ? 'Sign In' : 'Sign Up for Free'}
                        <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                      </button>
                      <button className={styles.secondaryButton} onClick={onClose}>
                        Continue Exploring
                      </button>
                    </>
                  ) : type === 'abuse-captcha' ? (
                    <button className={styles.primaryButton} onClick={() => window.location.reload()}>
                      Verify Now
                    </button>
                  ) : (
                    <button className={styles.primaryButton} onClick={onClose}>
                      I Understand
                    </button>
                  )}
                </div>

                <div className={styles.footer}>
                  <p>
                    {type.startsWith('abuse-') ? (
                      <span>If you think this is a mistake, please <a href="#" className={styles.link}>contact support</a></span>
                    ) : (
                      <>Want unlimited access? {' '}<a href="/pricing" className={styles.link}>View Pricing</a></>
                    )}
                  </p>
                </div>
              </>
            )}
            <div className={styles.footer}>
              {type === 'anonymous' ? (
                <span>By continuing, you agree to our Terms.</span>
              ) : (
                <span>Need help? <a href="#" className={styles.link}>Contact Support</a></span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

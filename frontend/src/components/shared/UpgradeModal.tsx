import React from 'react';
import { motion } from 'framer-motion';
import { X, Check, Zap } from 'lucide-react';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import styles from './UpgradeModal.module.css';

export const UpgradeModal: React.FC = () => {
  const { upgradeModalOpen, closeUpgradeModal, targetTier } = useUIStore();
  const { user, updateProfile } = useAuthStore();

  const handleUpgrade = async (tier: 'basic' | 'pro') => {
    try {
      // In a real app, this would redirect to Stripe
      // For this demo, we'll update the user profile directly
      await updateProfile({ plan_type: tier });
      alert(`Success! You have been upgraded to ${tier.toUpperCase()}.`);
      closeUpgradeModal();
    } catch (error) {
      console.error('Upgrade failed:', error);
    }
  };

  if (!upgradeModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={closeUpgradeModal}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.close} onClick={closeUpgradeModal}>
          <X size={20} />
        </button>

        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.title}>Unlock Full Intelligence</div>
            <p className={styles.subtitle}>Choose a plan that fits your creative needs</p>
          </div>

          <div className={styles.grid}>
            {/* Basic Plan */}
            <div className={`${styles.plan} ${targetTier === 'basic' ? styles.planFeatured : ''}`}>
              <div className={styles.planHeader}>
                <div className={styles.planTitle}>Basic</div>
                <div className={styles.price}>$9<span>/mo</span></div>
              </div>
              <ul className={styles.features}>
                <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> 30 Hourly Generations</li>
                <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> 150 Daily Credits</li>
                <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> Access to Basic Models</li>
              </ul>
              <button 
                className={`${styles.button} ${styles.buttonBasic}`}
                onClick={() => handleUpgrade('basic')}
              >
                {user?.plan_type === 'basic' ? 'Current Plan' : 'Select Basic'}
              </button>
            </div>

            {/* Pro Plan */}
            <div className={`${styles.plan} ${targetTier === 'pro' || !targetTier ? styles.planFeatured : ''}`}>
              <div className={styles.planHeader}>
                <div className={styles.planTitle}>Pro</div>
                <div className={styles.price}>$29<span>/mo</span></div>
              </div>
              <ul className={styles.features}>
                <li className={styles.feature}><Zap className={styles.checkIcon} size={16} /> 100 Hourly Generations</li>
                <li className={styles.feature}><Zap className={styles.checkIcon} size={16} /> 500 Daily Credits</li>
                <li className={styles.feature}><Zap className={styles.checkIcon} size={16} /> Priority GPU queues</li>
                <li className={styles.feature}><Zap className={styles.checkIcon} size={16} /> Priority AI Support</li>
              </ul>
              <button 
                className={`${styles.button} ${styles.buttonPro}`}
                onClick={() => handleUpgrade('pro')}
              >
                {user?.plan_type === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

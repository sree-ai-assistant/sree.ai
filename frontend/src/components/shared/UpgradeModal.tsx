import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Zap, Star } from 'lucide-react';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useUsageStore } from '../../store/usage.store';
import { userService } from '../../lib/api';
import toast from 'react-hot-toast';
import styles from './UpgradeModal.module.css';

export const UpgradeModal: React.FC = () => {
  const { upgradeModalOpen, closeUpgradeModal, targetTier } = useUIStore();
  const { user, setUser } = useAuthStore();
  const { fetchStatus } = useUsageStore();
  const [loading, setLoading] = useState<'starter' | 'pro' | null>(null);

  const handleUpgrade = async (tier: 'starter' | 'pro') => {
    if (!user) {
      toast.error('You must be logged in to upgrade your plan.');
      return;
    }

    setLoading(tier);
    try {
      const response = await userService.upgradeSubscription(tier);
      if (response.success) {
        // Update user tier in store
        setUser({
          ...user,
          plan_type: tier,
        });

        // Fetch new limits and update usage store
        await fetchStatus(false);

        toast.success(`Success! Welcome to the ${tier.toUpperCase()} plan.`);
        closeUpgradeModal();
      } else {
        toast.error(response.message || 'Upgrade failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Upgrade failed:', error);
      toast.error(error.message || 'An error occurred during upgrade.');
    } finally {
      setLoading(null);
    }
  };

  if (!upgradeModalOpen) return null;

  return (
    <AnimatePresence>
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
              <p className={styles.subtitle}>Elevate your Sree AI limits with our premium packages.</p>
            </div>

            <div className={styles.grid}>
              {/* Starter Plan */}
              <div className={`${styles.plan} ${targetTier === 'starter' ? styles.planFeatured : ''}`}>
                <div className={styles.planHeader}>
                  <div className={styles.planTitle} style={{ color: 'var(--primary)' }}>Starter</div>
                  <div className={styles.price}>$8<span>/mo</span></div>
                </div>
                <ul className={styles.features}>
                  <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> 50 daily chat requests</li>
                  <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> 60 daily voice synthesis</li>
                  <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> 30 daily image gens</li>
                  <li className={styles.feature}><Check className={styles.checkIcon} size={16} /> Chat, image & video storage (3mo auto-delete)</li>
                </ul>
                <button 
                  className={`${styles.button} ${styles.buttonStarter} ${user?.plan_type === 'starter' ? styles.buttonCurrent : ''}`}
                  disabled={user?.plan_type === 'starter' || loading !== null}
                  onClick={() => handleUpgrade('starter')}
                >
                  {user?.plan_type === 'starter' ? 'Current Plan' : loading === 'starter' ? 'Processing...' : 'Select Starter'}
                </button>
              </div>

              {/* Pro Plan */}
              <div className={`${styles.plan} ${targetTier === 'pro' || !targetTier ? styles.planFeatured : ''}`}>
                <div className={styles.planHeader}>
                  <div className={styles.planTitle} style={{ color: 'var(--accent)' }}>Pro</div>
                  <div className={styles.price}>$29<span>/mo</span></div>
                </div>
                <ul className={styles.features}>
                  <li className={styles.feature}><Zap className={styles.checkIcon} size={16} style={{ color: 'var(--accent)' }} /> 200 daily chat requests</li>
                  <li className={styles.feature}><Zap className={styles.checkIcon} size={16} style={{ color: 'var(--accent)' }} /> 100 daily voice synthesis</li>
                  <li className={styles.feature}><Zap className={styles.checkIcon} size={16} style={{ color: 'var(--accent)' }} /> 70 daily image gens</li>
                  <li className={styles.feature}><Zap className={styles.checkIcon} size={16} style={{ color: 'var(--accent)' }} /> Chat, image & video storage (no expiration)</li>
                  <li className={styles.feature}><Zap className={styles.checkIcon} size={16} style={{ color: 'var(--accent)' }} /> Priority GPU queues</li>
                </ul>
                <button 
                  className={`${styles.button} ${styles.buttonPro} ${user?.plan_type === 'pro' ? styles.buttonCurrent : ''}`}
                  disabled={user?.plan_type === 'pro' || loading !== null}
                  onClick={() => handleUpgrade('pro')}
                >
                  {user?.plan_type === 'pro' ? 'Current Plan' : loading === 'pro' ? 'Processing...' : 'Upgrade to Pro'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

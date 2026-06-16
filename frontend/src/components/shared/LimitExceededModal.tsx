import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, UserPlus, LogIn, Sparkles } from 'lucide-react';
import { useUIStore } from '../../store/ui.store';
import styles from './LimitExceededModal.module.css';

export const LimitExceededModal: React.FC = () => {
  const { limitModalOpen, closeLimitModal } = useUIStore();

  return (
    <AnimatePresence>
      {limitModalOpen && (
        <motion.div 
          className={styles.overlay} 
          onClick={closeLimitModal}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Background Glows */}
            <div className={styles.glowBg} />
            <div className={styles.glowBgSecondary} />
            
            <button className={styles.close} onClick={closeLimitModal} aria-label="Close modal">
              <X size={18} />
            </button>

            <div className={styles.content}>
              {/* Dynamic Icon with pulse rings */}
              <div className={styles.iconContainer}>
                <div className={styles.pulseRing1} />
                <div className={styles.pulseRing2} />
                <div className={styles.iconWrapper}>
                  <Lock size={32} className={styles.lockIcon} />
                </div>
              </div>

              <div className={styles.header}>
                <div className={styles.badge}>
                  <Sparkles size={11} className={styles.badgeIcon} />
                  <span>PREMIUM FEATURE</span>
                </div>
                <h2 className={styles.title}>Hourly Limit Reached</h2>
                <p className={styles.subtitle}>
                  Anonymous users are limited to a few requests per hour. 
                  Unlock full access, unlimited chats, and voice synthesis instantly.
                </p>
              </div>

              {/* Visual Quota Indicator */}
              <div className={styles.quotaBarContainer}>
                <div className={styles.quotaBarHeader}>
                  <span className={styles.quotaLabel}>Anonymous Quota</span>
                  <span className={styles.quotaValue}>0% remaining</span>
                </div>
                <div className={styles.quotaBar}>
                  <motion.div 
                    className={styles.quotaProgress}
                    initial={{ width: "100%" }}
                    animate={{ width: "4%" }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>

              <div className={styles.actions}>
                <button 
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={() => {
                    window.location.href = '/signup';
                  }}
                >
                  <UserPlus size={16} />
                  Create Free Account
                </button>
                
                <button 
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                >
                  <LogIn size={16} />
                  Sign In
                </button>
              </div>

              <p className={styles.footerText}>
                Want to use your own API keys?{' '}
                <span 
                  className={styles.link} 
                  onClick={() => {
                    closeLimitModal();
                    window.location.href = '/settings?tab=byok';
                  }}
                >
                  Settings &gt; BYOK
                </span>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

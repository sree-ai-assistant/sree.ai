import React from 'react';
import { motion } from 'framer-motion';
import { X, Lock, UserPlus, LogIn } from 'lucide-react';
import { useUIStore } from '../../store/ui.store';
import styles from './LimitExceededModal.module.css';

export const LimitExceededModal: React.FC = () => {
  const { limitModalOpen, closeLimitModal } = useUIStore();

  if (!limitModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={closeLimitModal}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.close} onClick={closeLimitModal}>
          <X size={20} />
        </button>

        <div className={styles.content}>
          <div className={styles.iconWrapper}>
            <Lock size={48} className={styles.lockIcon} />
          </div>

          <div className={styles.header}>
            <div className={styles.title}>Hourly Limit Reached</div>
            <p className={styles.subtitle}>
              Anonymous users are limited to a few requests per hour to ensure fair access for everyone. 
              Create a free account to continue or upgrade for unlimited access.
            </p>
          </div>

          <div className={styles.actions}>
            <button 
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={() => {
                // In a real app, this would redirect to sign up
                window.location.href = '/signup';
              }}
            >
              <UserPlus size={18} />
              Create Free Account
            </button>
            
            <button 
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => {
                window.location.href = '/login';
              }}
            >
              <LogIn size={18} />
              Sign In
            </button>
          </div>

          <p className={styles.footerText}>
            Want to use your own API keys? <span className={styles.link}>Settings &gt; BYOK</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

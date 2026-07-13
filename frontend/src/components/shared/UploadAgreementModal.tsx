import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, Check, FileText } from 'lucide-react';
import { useUploadAgreementStore } from '../../store/upload-agreement.store';
import styles from './UploadAgreementModal.module.css';
import toast from 'react-hot-toast';

export const UploadAgreementModal: React.FC = () => {
  const { isOpen, agree, cancel } = useUploadAgreementStore();
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset checkbox when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsChecked(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleAgree = async () => {
    if (!isChecked) {
      toast.error('Please read and check the agreement box to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      await agree();
      toast.success('Upload agreement accepted successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save agreement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className={styles.overlay} 
          onClick={cancel}
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
            {/* Background Glows */}
            <div className={styles.glowBg} />
            <div className={styles.glowBgSecondary} />

            <button className={styles.close} onClick={cancel} aria-label="Cancel upload">
              <X size={18} />
            </button>

            <div className={styles.content}>
              {/* Header Icon */}
              <div className={styles.iconContainer}>
                <div className={styles.pulseRing1} />
                <div className={styles.pulseRing2} />
                <div className={styles.iconWrapper}>
                  <ShieldAlert size={32} className={styles.alertIcon} />
                </div>
              </div>

              {/* Title & Description */}
              <div className={styles.header}>
                <h2 className={styles.title}>File Upload Policy</h2>
                <p className={styles.subtitle}>
                  Sree AI requires you to confirm your ownership and agree to the upload rules before submitting any media.
                </p>
              </div>

              {/* Terms Content Card */}
              <div className={styles.termsCard}>
                <ul className={styles.termsList}>
                  <li>
                    <span className={styles.termBullet}>1</span>
                    <span className={styles.termText}>
                      <strong>Ownership:</strong> You confirm that you own or have all necessary licenses and rights for the uploaded files.
                    </span>
                  </li>
                  <li>
                    <span className={styles.termBullet}>2</span>
                    <span className={styles.termText}>
                      <strong>AI Processing:</strong> Uploaded media is processed via AI engines (e.g. Gemini, Veo) and is subject to standard safety filtering.
                    </span>
                  </li>
                  <li>
                    <span className={styles.termBullet}>3</span>
                    <span className={styles.termText}>
                      <strong>Content Restrictions:</strong> No copyrighted materials without permission, sensitive personal data, or illegal files.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Checkbox Acknowledge */}
              <label className={styles.checkboxContainer}>
                <input 
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => setIsChecked(e.target.checked)}
                  disabled={isSubmitting}
                  className={styles.realCheckbox}
                />
                <span className={`${styles.customCheckbox} ${isChecked ? styles.checked : ''}`}>
                  {isChecked && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={styles.checkboxLabel}>
                  I certify that I have read and agree to the Content Upload Terms.
                </span>
              </label>

              {/* Action Buttons */}
              <div className={styles.actions}>
                <button 
                  className={`${styles.button} ${styles.buttonPrimary} ${!isChecked ? styles.disabledBtn : ''}`}
                  onClick={handleAgree}
                  disabled={!isChecked || isSubmitting}
                >
                  {isSubmitting ? 'Saving Agreement...' : 'I Agree & Upload'}
                </button>
                
                <button 
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={cancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

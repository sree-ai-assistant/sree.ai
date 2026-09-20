import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, UserPlus, Sparkles, ArrowRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import styles from './DownloadLimitModal.module.css';

export const DownloadLimitModal: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { 
    downloadLimitModalOpen, 
    downloadLimitInfo, 
    closeDownloadLimitModal, 
  } = useUIStore();

  if (!downloadLimitModalOpen) return null;

  // Determine user tier
  const currentTier = (user?.plan_type || downloadLimitInfo?.tier || 'anonymous').toLowerCase();
  const isAnonymous = !user || currentTier === 'anonymous';

  // Format countdown text if available
  const formatResetsIn = (seconds?: number) => {
    if (!seconds || seconds <= 0) return null;
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const resetsInText = downloadLimitInfo?.resetsIn 
    ? `Resets in ${formatResetsIn(downloadLimitInfo.resetsIn)}.` 
    : '';

  // Detailed custom description message
  const renderDetailedMessage = () => {
    const reason = downloadLimitInfo?.reason || 'daily';
    const limit = downloadLimitInfo?.limit;

    if (reason === 'minute') {
      return (
        <>
          Downloads are capped at <strong className={styles.highlightLimit}>{limit || 1} per minute</strong> on the{' '}
          <span className={styles.highlightTier}>{currentTier.toUpperCase()}</span> plan.{' '}
          {resetsInText && <span className={styles.resetText}>{resetsInText}</span>}
        </>
      );
    }

    if (reason === 'monthly') {
      return (
        <>
          You have reached your monthly ceiling of{' '}
          <strong className={styles.highlightLimit}>{limit || (currentTier === 'anonymous' ? 150 : 200)} downloads</strong> on the{' '}
          <span className={styles.highlightTier}>{currentTier.toUpperCase()}</span> plan.
        </>
      );
    }

    // Default: daily limit reached
    const dayLimitVal = limit || (currentTier === 'anonymous' ? 5 : 50);
    return (
      <>
        Daily downloads are capped at <strong className={styles.highlightLimit}>{dayLimitVal} per day</strong> on the{' '}
        <span className={styles.highlightTier}>{currentTier.toUpperCase()}</span> plan.{' '}
        {resetsInText && <span className={styles.resetText}>{resetsInText}</span>}
      </>
    );
  };

  // Primary action click handler
  const handlePrimaryAction = () => {
    closeDownloadLimitModal();
    if (isAnonymous) {
      navigate('/signup');
    } else {
      navigate('/pricing');
    }
  };

  // Tier grid cards
  const tiers = [
    {
      name: 'Anonymous',
      tierKey: 'anonymous',
      dayLimit: '5',
      perMinute: '1',
      monthly: '150',
      price: 'Free',
      badge: 'Free',
      isUpgrade: false,
    },
    {
      name: 'Free',
      tierKey: 'free',
      dayLimit: '50',
      perMinute: '10',
      monthly: '200',
      price: 'Logged in',
      badge: isAnonymous ? 'Sign Up ↗' : 'Free',
      isUpgrade: isAnonymous,
    },
    {
      name: 'Starter',
      tierKey: 'starter',
      dayLimit: '500',
      perMinute: '20',
      monthly: '5,000',
      price: '$8/mo',
      badge: 'Upgrade ↗',
      isUpgrade: true,
    },
    {
      name: 'Pro',
      tierKey: 'pro',
      dayLimit: '999',
      perMinute: '100',
      monthly: '9,999',
      price: '$29/mo',
      badge: 'Upgrade ↗',
      isUpgrade: true,
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        onClick={closeDownloadLimitModal}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className={styles.modalCard}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        >
          {/* Top Close Button */}
          <button
            onClick={closeDownloadLimitModal}
            className={styles.closeButton}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>

          {/* Header */}
          <div className={styles.modalHeader}>
            <div className={styles.iconBadge}>
              <Clock size={28} />
            </div>
            <h2 className={styles.modalTitle}>Download Limit Reached</h2>
            <p className={styles.modalSubtitle}>
              {renderDetailedMessage()}
            </p>
          </div>

          {/* Tier Limits Section */}
          <div className={styles.tierLimitsSection}>
            <div className={styles.tierLimitsTitle}>Download Limits by Tier</div>
            <div className={styles.tierGrid}>
              {tiers.map((t) => {
                const isCurrent = currentTier === t.tierKey;
                const canInteract = t.isUpgrade && !isCurrent;

                return (
                  <div
                    key={t.tierKey}
                    role={canInteract ? 'button' : undefined}
                    tabIndex={canInteract ? 0 : undefined}
                    onClick={
                      canInteract
                        ? () => {
                            closeDownloadLimitModal();
                            if (t.tierKey === 'free' && isAnonymous) {
                              navigate('/signup');
                            } else {
                              navigate('/pricing');
                            }
                          }
                        : undefined
                    }
                    className={`${styles.tierCard} ${isCurrent ? styles.tierCardActive : ''} ${canInteract ? styles.tierCardInteractive : ''}`}
                  >
                    <div className={styles.tierCardTop}>
                      <span className={styles.tierCardName}>{t.name}</span>
                      {isCurrent ? (
                        <span className={styles.tierCurrentBadge}>Current</span>
                      ) : canInteract ? (
                        <span className={styles.tierUpgradeBadge}>{t.badge}</span>
                      ) : null}
                    </div>

                    {/* Big Daily Limit only */}
                    <div className={styles.tierCardLimit}>
                      <span>{t.dayLimit}</span>
                      <span className={styles.tierCardLimitUnit}>/day</span>
                    </div>

                    <div className={styles.tierCardPrice}>{t.price}</div>

                    {/* Hover Tooltip displaying all limits for that tier */}
                    <div className={styles.tooltipContainer}>
                      <div className={styles.tooltipHeader}>{t.name} Limits</div>
                      <div className={styles.tooltipRow}>
                        <span>Burst:</span>
                        <span>{t.perMinute} / min</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Daily:</span>
                        <span>{t.dayLimit} / day</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Monthly:</span>
                        <span>{t.monthly} / mo</span>
                      </div>
                      <div className={styles.tooltipRow}>
                        <span>Formats:</span>
                        <span>CSV, Excel, Images</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Informational Notice */}
          <p className={styles.limitNotice}>
            {isAnonymous
              ? 'Sign up for a free account to instantly get 50 downloads/day with 10/min burst speed and cloud sync.'
              : 'Upgrade to Starter or Pro for up to 999 downloads/day, faster exports, and priority queue processing.'}
          </p>

          {/* Dynamic Action Buttons */}
          <div className={styles.limitActions}>
            <button
              onClick={handlePrimaryAction}
              className={`${styles.modalBtn} ${styles.primaryBtn}`}
            >
              {isAnonymous ? (
                <>
                  <UserPlus size={16} />
                  <span>Sign Up Now</span>
                  <ArrowRight size={15} />
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Upgrade Plan</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>

            <button
              onClick={closeDownloadLimitModal}
              className={`${styles.modalBtn} ${styles.secondaryBtn}`}
            >
              <span>Ok Got it !!!</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

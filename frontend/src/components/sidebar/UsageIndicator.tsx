import React, { useEffect } from 'react';
import { Zap, Sparkles, AlertCircle } from 'lucide-react';
import { useUsageStore } from '../../store/usage.store';
import styles from './UsageIndicator.module.css';

interface UsageIndicatorProps {
  isCollapsed: boolean;
  onUpgradeClick: () => void;
}

export const UsageIndicator: React.FC<UsageIndicatorProps> = ({ 
  isCollapsed, 
  onUpgradeClick 
}) => {
  const { status, fetchStatus } = useUsageStore();

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (!status) return null;

  const percentage = (status.daily_count / status.daily_limit) * 100;
  const isWarning = percentage > 80;
  const isExceeded = status.remaining_today <= 0;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    return `${hours}h`;
  };

  if (isCollapsed) {
    return (
      <div className={styles.containerCollapsed}>
        <div className={styles.miniIndicator} title={`${status.remaining_today} requests left`}>
          {isExceeded ? (
            <AlertCircle size={20} color="#ef4444" />
          ) : (
            <Zap size={20} />
          )}
          <div 
            className={styles.dot} 
            style={{ 
              backgroundColor: isExceeded ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e' 
            }} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Daily Usage</span>
        <span className={styles.tierBadge}>{status.tier}</span>
      </div>
      
      <div className={styles.progressWrapper}>
        <div 
          className={`${styles.progressBar} ${isWarning ? styles.progressBarWarning : ''}`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      <div className={styles.footer}>
        <span className={styles.count}>
          {status.remaining_today} / {status.daily_limit} left
        </span>
        <span className={styles.reset}>
          Resets in {formatTime(status.resets_in_seconds)}
        </span>
      </div>

      {!isExceeded && status.tier === 'free' && (
        <button className={styles.upgradeBtn} onClick={onUpgradeClick}>
          <Sparkles size={14} />
          Upgrade
        </button>
      )}

      {isExceeded && (
        <button className={styles.upgradeBtn} style={{ color: '#ef4444' }} onClick={onUpgradeClick}>
          <Zap size={14} />
          Limit Reached
        </button>
      )}
    </div>
  );
};

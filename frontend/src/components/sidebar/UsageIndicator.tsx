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

  if (!status || !status.usage) return null;

  const renderProgressBar = (tool: string, data: any) => {
    if (!data || !data.daily) return null;
    const { used, limit } = data.daily;
    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    const isWarning = percentage > 80;
    const remaining = Math.max(0, limit - used);

    return (
      <div key={tool} className={styles.usageGroup}>
        <div className={styles.toolLabel}>
          <span className={styles.toolName}>{tool}</span>
          <span>{remaining} left</span>
        </div>
        <div className={styles.progressWrapper}>
          <div 
            className={`${styles.progressBar} ${isWarning ? styles.progressBarWarning : ''} ${tool === 'voice' ? styles.voiceBar : tool === 'image' ? styles.imageBar : ''}`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      </div>
    );
  };

  const formatTime = (seconds: any) => {
    const s = Number(seconds);
    if (isNaN(s) || s <= 0) return 'tomorrow'; // Fallback if resets_in_seconds is missing
    if (s < 60) return `${s}s`;
    const minutes = Math.ceil(s / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    return `${hours}h`;
  };


  if (isCollapsed) {
    let maxPercentage = 0;
    if (status.profileUsage) {
      const tools = ['chat', 'voice', 'image'] as const;
      const percentages = tools.map(t => {
        const toolData = status.profileUsage?.[t]?.daily;
        if (!toolData || !toolData.limit) return 0;
        return (toolData.used / toolData.limit) * 100;
      });
      maxPercentage = Math.max(...percentages, 0);
    } else if (status.usage) {
      const percentages = Object.values(status.usage).map(u => {
        if (!u.daily || !u.daily.limit) return 0;
        return (u.daily.used / u.daily.limit) * 100;
      });
      maxPercentage = Math.max(...percentages, 0);
    }

    const totalPercentage = maxPercentage;
    const isExceeded = totalPercentage >= 100;
    const isWarning = totalPercentage > 80;

    return (
      <div className={styles.containerCollapsed}>
        <div className={styles.miniIndicator} title="View usage">
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

  const profileUsage = status.profileUsage;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Usage Limits</span>
        <span className={styles.tierBadge}>{status.tier}</span>
      </div>
      
      {profileUsage ? (
        <div className={styles.multiUsage}>
          {renderProgressBar('chat', profileUsage.chat)}
          {renderProgressBar('voice', profileUsage.voice)}
          {renderProgressBar('image', profileUsage.image)}
        </div>
      ) : (
        <div className={styles.usageGroup}>
          <div className={styles.progressWrapper}>
            <div 
              className={styles.progressBar}
              style={{ width: '0%' }}
            />
          </div>
        </div>
      )}

      <div className={styles.footer}>
        {status?.resets_in_seconds !== undefined ? (
          <span className={styles.reset}>
            Resets in {formatTime(status.resets_in_seconds)}
          </span>
        ) : (
          <span className={styles.reset}>Daily reset</span>
        )}
      </div>

      {status.tier === 'free' && (
        <button className={styles.upgradeBtn} onClick={onUpgradeClick}>
          <Sparkles size={14} />
          Upgrade Plan
        </button>
      )}
    </div>
  );
};

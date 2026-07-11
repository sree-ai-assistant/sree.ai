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
  const status = useUsageStore(state => state.status);
  const fetchStatus = useUsageStore(state => state.fetchStatus);

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
    const displayRemaining = parseFloat(remaining.toFixed(1));

    return (
      <div key={tool} className={styles.usageGroup}>
        <div className={styles.toolLabel}>
          <span className={styles.toolName}>{tool}</span>
          <span>{displayRemaining} left</span>
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
    const s = Math.floor(Number(seconds));
    if (isNaN(s) || s <= 0) return 'tomorrow'; // Fallback if resets_in_seconds is missing

    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${secs}s`); // only show seconds if < 1 minute

    return parts.join(' ');
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
      const isAnonymous = status.tier?.toLowerCase() === 'anonymous';
      const percentages = Object.entries(status.usage).map(([tool, u]) => {
        if (isAnonymous && tool === 'image') return 0;
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

  const displayUsage = status.profileUsage || (status.usage ? {
    chat: status.usage.chat,
    voice: status.usage.voice,
    image: status.usage.image,
  } : null);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Usage Limits</span>
        <span className={styles.tierBadge}>{status.tier}</span>
      </div>

      {displayUsage ? (
        <div className={styles.multiUsage}>
          {renderProgressBar('chat', displayUsage.chat)}
          {renderProgressBar('voice', displayUsage.voice)}
          {status.tier?.toLowerCase() !== 'anonymous' && renderProgressBar('image', displayUsage.image)}
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

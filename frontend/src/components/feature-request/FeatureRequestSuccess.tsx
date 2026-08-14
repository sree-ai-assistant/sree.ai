import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Zap,
  Mail,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './FeatureRequestSuccess.module.css';

interface FeatureRequestSuccessProps {
  ticketId: string;
  title: string;
  categoryLabel: string;
  priority: string;
  userEmail: string;
  onReset: () => void;
}

export const FeatureRequestSuccess: React.FC<FeatureRequestSuccessProps> = ({
  ticketId,
  title,
  categoryLabel,
  priority,
  userEmail,
  onReset,
}) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(ticketId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatPriority = (p: string) => {
    switch (p) {
      case 'critical':
        return { label: 'Critical / Blocker', color: '#EF4444' };
      case 'high_impact':
        return { label: 'High Impact', color: '#F59E0B' };
      case 'helpful':
        return { label: 'Helpful', color: '#3B82F6' };
      default:
        return { label: 'Nice to have', color: '#10B981' };
    }
  };

  const pConfig = formatPriority(priority);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={styles.container}
    >
      <div className={styles.iconWrapper}>
        <div className={styles.iconGlow} />
        <div className={styles.iconCircle}>
          <CheckCircle2 size={44} className={styles.checkIcon} />
        </div>
      </div>

      <div className={styles.header}>
        <div className={styles.badge}>
          <Sparkles size={14} />
          <span>Webhook Delivered & Logged</span>
        </div>
        <h2 className={styles.title}>Thank You for Shaping Sree AI!</h2>
        <p className={styles.subtitle}>
          Your feature request has been successfully delivered to our core product pipeline via automated n8n triage.
        </p>
      </div>

      {/* Ticket ID Box */}
      <div className={styles.ticketBox}>
        <div className={styles.ticketInfo}>
          <span className={styles.ticketLabel}>Request Tracking ID</span>
          <span className={styles.ticketId}>{ticketId}</span>
        </div>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={handleCopyId}
          title="Copy Request ID"
        >
          {copied ? <Check size={16} className={styles.copiedIcon} /> : <Copy size={16} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      {/* Summary Card */}
      <div className={styles.summaryCard}>
        <h4 className={styles.summaryTitle}>Submission Summary</h4>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Title:</span>
            <span className={styles.summaryValueTitle}>{title}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Category:</span>
            <span className={styles.summaryValue}>{categoryLabel}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Priority:</span>
            <span
              className={styles.priorityBadge}
              style={{ color: pConfig.color, borderColor: `${pConfig.color}40` }}
            >
              {pConfig.label}
            </span>
          </div>
          {userEmail && (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Updates sent to:</span>
              <span className={styles.summaryEmail}>
                <Mail size={13} /> {userEmail}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* What Happens Next Roadmap Timeline */}
      <div className={styles.timelineSection}>
        <h4 className={styles.timelineTitle}>What happens next?</h4>
        <div className={styles.timelineList}>
          <div className={styles.timelineItem}>
            <div className={styles.stepDot}>1</div>
            <div className={styles.stepContent}>
              <h5>Automated Triage</h5>
              <p>Our n8n workflow parses and tags your suggestion for the product roadmap.</p>
            </div>
          </div>
          <div className={styles.timelineItem}>
            <div className={styles.stepDot}>2</div>
            <div className={styles.stepContent}>
              <h5>Engineering Review</h5>
              <p>Our core architects evaluate technical feasibility and model integration.</p>
            </div>
          </div>
          <div className={styles.timelineItem}>
            <div className={styles.stepDot}>3</div>
            <div className={styles.stepContent}>
              <h5>Status Notification</h5>
              <p>You will receive an update as soon as the feature is prioritized or released.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actionButtons}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => navigate('/chat')}
        >
          <span>Return to Chat</span>
          <ArrowRight size={16} />
        </button>

        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onReset}
        >
          <RotateCcw size={16} />
          <span>Submit Another Idea</span>
        </button>
      </div>
    </motion.div>
  );
};

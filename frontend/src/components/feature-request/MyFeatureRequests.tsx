import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Search,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  Calendar,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag,
  MessageSquare,
  Flame,
  Plus
} from 'lucide-react';
import type { FeatureRequestItem, FeatureStatus } from '../../services/featureRequest.service';
import styles from './MyFeatureRequests.module.css';

interface MyFeatureRequestsProps {
  requests: FeatureRequestItem[];
  loading: boolean;
  onRefresh: () => void;
  onNewRequestClick: () => void;
}

type FilterStatus = 'ALL' | FeatureStatus;

export const MyFeatureRequests: React.FC<MyFeatureRequestsProps> = ({
  requests,
  loading,
  onRefresh,
  onNewRequestClick,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Status configuration
  const getStatusBadge = (status: FeatureStatus) => {
    switch (status) {
      case 'In Progress':
        return {
          label: 'In Progress',
          icon: <Clock size={13} />,
          color: '#F59E0B',
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.3)',
        };
      case 'Resolved':
        return {
          label: 'Resolved / Shipped',
          icon: <CheckCircle2 size={13} />,
          color: '#10B981',
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.3)',
        };
      case 'Rejected':
        return {
          label: 'Rejected / Closed',
          icon: <XCircle size={13} />,
          color: '#EF4444',
          bg: 'rgba(239, 68, 68, 0.12)',
          border: 'rgba(239, 68, 68, 0.3)',
        };
      case 'Raised':
      default:
        return {
          label: 'Raised / Under Review',
          icon: <Sparkles size={13} />,
          color: '#38BDF8',
          bg: 'rgba(56, 189, 248, 0.12)',
          border: 'rgba(56, 189, 248, 0.3)',
        };
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return { label: 'Critical', color: '#EF4444' };
      case 'high_impact':
        return { label: 'High Impact', color: '#F59E0B' };
      case 'helpful':
        return { label: 'Helpful', color: '#3B82F6' };
      default:
        return { label: 'Nice to have', color: '#10B981' };
    }
  };

  // Filter & search
  const filteredRequests = requests.filter((item) => {
    const matchesFilter = activeFilter === 'ALL' || item.status === activeFilter;
    const matchesSearch =
      searchQuery === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.ticket_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const countByStatus = {
    ALL: requests.length,
    Raised: requests.filter((r) => r.status === 'Raised').length,
    'In Progress': requests.filter((r) => r.status === 'In Progress').length,
    Resolved: requests.filter((r) => r.status === 'Resolved').length,
    Rejected: requests.filter((r) => r.status === 'Rejected').length,
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.container}>
      {/* Controls: Search & Filter Tabs */}
      <div className={styles.controlsBar}>
        <div className={styles.filterPills}>
          {(['ALL', 'Raised', 'In Progress', 'Resolved', 'Rejected'] as FilterStatus[]).map(
            (status) => {
              const count = countByStatus[status] || 0;
              const isActive = activeFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  className={`${styles.filterPill} ${isActive ? styles.activeFilter : ''}`}
                  onClick={() => setActiveFilter(status)}
                >
                  <span>{status === 'ALL' ? 'All Requests' : status}</span>
                  <span className={styles.pillCount}>{count}</span>
                </button>
              );
            }
          )}
        </div>

        <div className={styles.actionsRow}>
          <div className={styles.searchWrapper}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by title or ticket ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <button
            type="button"
            className={styles.refreshBtn}
            onClick={onRefresh}
            title="Refresh status"
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? styles.spinning : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Requests List */}
      {loading && requests.length === 0 ? (
        <div className={styles.loadingState}>
          <RefreshCw size={24} className={styles.spinning} />
          <p>Syncing feature requests from database...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIconCircle}>
            <Sparkles size={32} />
          </div>
          <h3>No Feature Requests Found</h3>
          <p>
            {searchQuery || activeFilter !== 'ALL'
              ? 'No requests match your current filters. Try changing your search query.'
              : 'You have not submitted any feature requests yet. Have an idea for Sree AI?'}
          </p>
          <button type="button" className={styles.emptyCreateBtn} onClick={onNewRequestClick}>
            <Plus size={16} />
            <span>Submit a Feature Request</span>
          </button>
        </div>
      ) : (
        <div className={styles.requestsGrid}>
          {filteredRequests.map((req) => {
            const statusConfig = getStatusBadge(req.status);
            const priorityConfig = getPriorityBadge(req.priority);
            const isExpanded = expandedId === req.id;

            return (
              <motion.div
                key={req.id || req.ticket_id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={styles.requestCard}
              >
                {/* Card Top: Ticket ID + Badges */}
                <div className={styles.cardTop}>
                  <div className={styles.ticketPill}>
                    <span>{req.ticket_id}</span>
                  </div>

                  <div className={styles.badgesGroup}>
                    {req.category_label && (
                      <span className={styles.categoryBadge}>
                        <Tag size={11} />
                        {req.category_label}
                      </span>
                    )}

                    <span
                      className={styles.priorityBadge}
                      style={{ color: priorityConfig.color }}
                    >
                      {priorityConfig.label}
                    </span>

                    <span
                      className={styles.statusBadge}
                      style={{
                        color: statusConfig.color,
                        backgroundColor: statusConfig.bg,
                        borderColor: statusConfig.border,
                      }}
                    >
                      {statusConfig.icon}
                      <span>{statusConfig.label}</span>
                    </span>
                  </div>
                </div>

                {/* Card Title */}
                <h3 className={styles.cardTitle}>{req.title}</h3>

                {/* Card Description */}
                <p className={`${styles.cardDesc} ${isExpanded ? styles.expanded : ''}`}>
                  {req.description}
                </p>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={styles.expandedDetails}
                    >
                      {req.use_case && (
                        <div className={styles.detailBlock}>
                          <span className={styles.detailLabel}>Real-World Use Case:</span>
                          <p className={styles.detailText}>{req.use_case}</p>
                        </div>
                      )}

                      {/* Steps to Reproduce */}
                      {(req.steps_to_reproduce || req.client_metadata?.steps_to_reproduce) && (
                        <div className={styles.detailBlock}>
                          <span className={styles.detailLabel}>Steps to Reproduce:</span>
                          <p className={`${styles.detailText} ${styles.preWrap}`}>
                            {req.steps_to_reproduce || req.client_metadata?.steps_to_reproduce}
                          </p>
                        </div>
                      )}

                      {/* Screenshot Attachment */}
                      {(req.screenshot_url || req.client_metadata?.screenshot_url) && (
                        <div className={styles.detailBlock}>
                          <span className={styles.detailLabel}>Attached Screenshot:</span>
                          <a
                            href={req.screenshot_url || req.client_metadata?.screenshot_url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.screenshotLink}
                          >
                            <img
                              src={req.screenshot_url || req.client_metadata?.screenshot_url}
                              alt="Bug screenshot"
                              className={styles.screenshotThumbnail}
                            />
                            <span className={styles.screenshotLinkText}>
                              <ExternalLink size={12} />
                              <span>View Full Image</span>
                            </span>
                          </a>
                        </div>
                      )}

                      {req.reference_url && (
                        <div className={styles.detailBlock}>
                          <span className={styles.detailLabel}>Reference Link:</span>
                          <a
                            href={req.reference_url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.refLink}
                          >
                            <ExternalLink size={13} />
                            <span>{req.reference_url}</span>
                          </a>
                        </div>
                      )}

                      {/* Admin Feedback / Note from Team */}
                      {req.admin_notes && (
                        <div className={styles.adminNotesBox}>
                          <div className={styles.adminNotesHeader}>
                            <Sparkles size={14} color="#60A5FA" />
                            <span>Update from Sree AI Engineering</span>
                          </div>
                          <p className={styles.adminNotesText}>{req.admin_notes}</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Card Footer */}
                <div className={styles.cardFooter}>
                  <div className={styles.dateGroup}>
                    <Calendar size={13} />
                    <span>Submitted on {formatDate(req.created_at)}</span>
                  </div>

                  <button
                    type="button"
                    className={styles.expandToggle}
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  >
                    <span>{isExpanded ? 'Less details' : 'More details'}</span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Video as VideoIcon,
  History,
  ChevronUp,
  ChevronDown,
  Settings,
  HelpCircle,
  Lightbulb,
  LogOut,
  Zap,
  Star,
  PanelLeft,
  User,
  LogIn,
  Gift
} from 'lucide-react';
import { useVideoStore } from '../../store/video.store';
import { useAuthStore } from '../../store/auth.store';
import { useNavigate } from 'react-router-dom';
import { OAuthBadge } from '../layout/OAuthBadge';
import styles from '../layout/Sidebar.module.css';
import { motion, AnimatePresence } from 'framer-motion';

interface VideoSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  onNewVideo: () => void;
  onDeleteClick?: (id: string) => void;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  onSelectVideo?: (vid: any) => void;
}

export const VideoSidebar: React.FC<VideoSidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  onNewVideo,
  onDeleteClick,
  onSelectVideo
}) => {
  const { history, fetchHistory, activeVideo, setActiveVideo, deleteVideo } = useVideoStore();
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [isBottomExpanded, setIsBottomExpanded] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleNewVideo = () => {
    onNewVideo();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteClick) {
      onDeleteClick(id);
    } else if (confirm('Delete this video generation?')) {
      deleteVideo(id);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.topSection}>
        <div className={styles.topHeader}>
          {!isCollapsed && <span className={styles.brand}>SREE AI VIDEOS</span>}
          <button
            className={styles.toggleBtn}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <PanelLeft size={18} />
          </button>
        </div>

        <button className={styles.newChatBtn} onClick={handleNewVideo} title="New Video">
          <Plus size={22} strokeWidth={2.5} />
          {!isCollapsed && <span style={{ marginLeft: '4px' }}>New Video</span>}
        </button>
      </div>

      <div className={styles.historySection}>
        {!isCollapsed && (
          <div className={styles.sectionLabel}>
            <History size={14} />
            <span>Recent Generations</span>
          </div>
        )}

        <div className={styles.historyList}>
          <AnimatePresence mode="popLayout">
            {history.map((vid) => (
              <motion.div
                key={vid.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={styles.historyItemWrapper}
              >
                <div
                  className={`${styles.historyItem} ${activeVideo?.id === vid.id ? styles.active : ''}`}
                  onClick={() => {
                    setActiveVideo(vid);
                    onSelectVideo?.(vid);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveVideo(vid);
                      onSelectVideo?.(vid);
                    }
                  }}
                  title={vid.prompt}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.itemIcon}>
                    {vid.url ? (
                      <video
                        src={vid.url}
                        muted
                        playsInline
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          objectFit: 'cover',
                          background: 'rgba(0, 0, 0, 0.5)'
                        }}
                      />
                    ) : (
                      <VideoIcon size={18} />
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className={styles.itemTitle}>{vid.prompt}</span>
                      <button
                        className={styles.menuBtn}
                        onClick={(e) => handleDelete(e, vid.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {history.length === 0 && !isCollapsed && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              opacity: 0.3,
              fontSize: '0.8rem'
            }}>
              No video generations yet
            </div>
          )}
        </div>
      </div>

      <div className={styles.bottomSection}>
        <div className={styles.utilitiesSection}>
          {isCollapsed ? (
            <div className={styles.utilitiesCollapsed}>
              <button className={styles.miniIconBtn} onClick={() => navigate('/settings')} title="Settings">
                <Settings size={18} />
              </button>
              <button className={styles.miniIconBtn} onClick={() => window.open('https://github.com/your-repo/issues', '_blank')} title="Feature Request">
                <Lightbulb size={18} />
              </button>
              <button className={styles.miniIconBtn} onClick={() => window.open('/help', '_blank')} title="Help & Support">
                <HelpCircle size={18} />
              </button>
            </div>
          ) : isBottomExpanded ? (
            <div className={styles.utilitiesVertical}>
              <button className={styles.utilityItem} onClick={() => navigate('/settings')}>
                <Settings size={18} />
                <span>Settings</span>
              </button>
              <button className={styles.utilityItem} onClick={() => window.open('https://github.com/your-repo/issues', '_blank')}>
                <Lightbulb size={18} />
                <span>Feature Request</span>
              </button>
              <button className={styles.utilityItem} onClick={() => window.open('/help', '_blank')}>
                <HelpCircle size={18} />
                <span>Help & Support</span>
              </button>
              <button className={styles.collapseToggle} onClick={() => setIsBottomExpanded(false)}>
                <ChevronDown size={16} />
                <span>Collapse</span>
              </button>
            </div>
          ) : (
            <div className={styles.utilitiesHorizontal}>
              <div className={styles.miniIcons}>
                <button className={styles.miniIconBtn} onClick={() => navigate('/settings')} title="Settings">
                  <Settings size={16} />
                </button>
                <button className={styles.miniIconBtn} onClick={() => window.open('https://github.com/your-repo/issues', '_blank')} title="Feature Request">
                  <Lightbulb size={16} />
                </button>
                <button className={styles.miniIconBtn} onClick={() => window.open('/help', '_blank')} title="Help & Support">
                  <HelpCircle size={16} />
                </button>
              </div>
              <button className={styles.expandToggle} onClick={() => setIsBottomExpanded(true)} title="Expand Options">
                <ChevronUp size={16} />
              </button>
            </div>
          )}
        </div>

        {user ? (
          <div className={`${styles.profileCard} ${(!isCollapsed && user.plan_type === 'pro') ? styles.proCard : ''}`}>
            <div className={styles.profileInfo}>
              <div className={`${styles.avatar} ${(!user.avatar_url || avatarError) ? styles.avatarPlaceholder : ''}`}>
                <div className={styles.status} />
                {(user.avatar_url && !avatarError) ? (
                  <img src={user.avatar_url} alt={user.display_name || 'User'} className={styles.avatarImg} onError={() => setAvatarError(true)} />
                ) : (
                  <User size={18} className={styles.avatarUserIcon} />
                )}
                <OAuthBadge provider={user.provider} size={12} />
              </div>
              {!isCollapsed && (
                <div className={styles.details}>
                  <span className={styles.name}>{user.display_name || user.email?.split('@')[0]}</span>
                  <div className={styles.badge}>
                    <Zap size={10} fill="currentColor" />
                    <span>{user.plan_type === 'pro' ? 'Pro Member' : user.plan_type === 'starter' ? 'Starter Plan' : 'Free Plan'}</span>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.profileActions}>
              <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign Out">
                <LogOut size={16} />
              </button>
              {user.plan_type !== 'pro' && (
                <button className={styles.upgradeBtn} onClick={() => navigate('/settings')} title="Upgrade Plan">
                  <Star size={16} />
                  {!isCollapsed && <span>Upgrade</span>}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={isCollapsed ? styles.guestContainerCollapsed : styles.guestContainer}>
            {isCollapsed ? (
              <>
                <button className={styles.guestBtnCollapsed} onClick={() => navigate('/login')} title="Login">
                  <LogIn size={18} />
                </button>
                <button className={`${styles.guestBtnCollapsed} ${styles.joinBtnCollapsedHighlight}`} onClick={() => navigate('/signup')} title="Join Sree AI">
                  <Gift size={18} className={styles.giftIconFloating} />
                </button>
              </>
            ) : (
              <>
                <button className={styles.loginBtn} onClick={() => navigate('/login')}>
                  <LogIn size={16} />
                  <span>Login</span>
                </button>
                <button className={styles.joinBtn} onClick={() => navigate('/signup')}>
                  <Gift size={16} className={styles.giftIconFloating} />
                  <span>Join</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

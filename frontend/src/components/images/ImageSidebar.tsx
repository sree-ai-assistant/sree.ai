import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Settings,
  HelpCircle,
  Lightbulb,
  LogOut,
  Zap,
  Star,
  AlertCircle,
  PanelLeft
} from 'lucide-react';
import { useImageStore } from '../../store/image.store';
import { useAuthStore } from '../../store/auth.store';
import { useNavigate } from 'react-router-dom';
import styles from '../layout/Sidebar.module.css';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  onNewImage: () => void;
  onDeleteClick?: (id: string) => void;
  onSelectImage?: (img: any) => void;
}

export const ImageSidebar: React.FC<ImageSidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  onNewImage,
  onDeleteClick,
  onSelectImage
}) => {
  const { history, fetchHistory, activeImage, setActiveImage, deleteImage, isFetchingHistory, resetGenerationState } = useImageStore();
  const { user, signOut } = useAuthStore();
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const [isBottomExpanded, setIsBottomExpanded] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleNewImage = () => {
    resetGenerationState();
    onNewImage();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteClick) {
      onDeleteClick(id);
    } else if (confirm('Delete this generation?')) {
      deleteImage(id);
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
          {!isCollapsed && <span className={styles.brand}>SREE AI IMAGES</span>}
          <button
            className={styles.toggleBtn}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <PanelLeft size={18} />
          </button>
        </div>

        <button className={styles.newChatBtn} onClick={handleNewImage} title="New Image">
          <Plus size={22} strokeWidth={2.5} />
          {!isCollapsed && <span style={{ marginLeft: '4px' }}>New Image</span>}
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
            {history.map((img) => (
              <motion.div
                key={img.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={styles.historyItemWrapper}
              >
                <div
                  className={`${styles.historyItem} ${activeImage?.id === img.id ? styles.active : ''}`}
                  onClick={() => {
                    setActiveImage(img);
                    onSelectImage?.(img);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveImage(img);
                      onSelectImage?.(img);
                    }
                  }}
                  title={img.prompt}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.itemIcon}>
                    {img.url && !imageLoadErrors[img.id] ? (
                      <img
                        src={img.url}
                        alt="Thumbnail"
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          objectFit: 'cover'
                        }}
                        onError={() => {
                          setImageLoadErrors(prev => ({ ...prev, [img.id]: true }));
                        }}
                      />
                    ) : imageLoadErrors[img.id] ? (
                      <AlertCircle size={18} style={{ color: '#ef4444' }} />
                    ) : (
                      <ImageIcon size={18} />
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className={styles.itemTitle}>{img.prompt}</span>
                      <button
                        className={styles.menuBtn}
                        onClick={(e) => handleDelete(e, img.id)}
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

          {!isFetchingHistory && history.length === 0 && !isCollapsed && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              opacity: 0.3,
              fontSize: '0.8rem'
            }}>
              No generations yet
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

        <div className={`${styles.profileCard} ${(!isCollapsed && user?.plan_type === 'pro') ? styles.proCard : ''}`}>
          <div className={styles.profileInfo}>
            <div className={styles.avatar}>
              <div className={styles.status} />
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name || 'User'} className={styles.avatarImg} />
              ) : (
                (user?.display_name?.[0] || user?.email?.[0] || 'U').toUpperCase()
              )}
            </div>
            {!isCollapsed && (
              <div className={styles.details}>
                <span className={styles.name}>{user?.display_name || user?.email?.split('@')[0]}</span>
                <div className={styles.badge}>
                  <Zap size={10} fill="currentColor" />
                  <span>{user?.plan_type === 'pro' ? 'Pro Member' : user?.plan_type === 'starter' ? 'Starter Plan' : 'Free Plan'}</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.profileActions}>
            <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign Out">
              <LogOut size={16} />
            </button>
            {user?.plan_type !== 'pro' && (
              <button className={styles.upgradeBtn} onClick={() => navigate('/settings')} title="Upgrade Plan">
                <Star size={16} />
                {!isCollapsed && <span>Upgrade</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

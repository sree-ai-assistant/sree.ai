import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  History,
  ChevronLeft,
  ChevronRight,
  Settings,
  HelpCircle,
  LogOut,
  Zap,
  Star,
  AlertCircle
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
  onOpenSettings?: () => void;
  onDeleteClick?: (id: string) => void;
  onSelectImage?: (img: any) => void;
}

export const ImageSidebar: React.FC<ImageSidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  onNewImage,
  onOpenSettings,
  onDeleteClick,
  onSelectImage
}) => {
  const { history, fetchHistory, activeImage, setActiveImage, deleteImage, isFetchingHistory, resetGenerationState } = useImageStore();
  const { user, signOut } = useAuthStore();
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  useEffect(() => {
    setIsCollapsed(true);
  }, [setIsCollapsed]);
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
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
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
        <button className={styles.bottomLink} onClick={onOpenSettings} title="Settings">
          <Settings size={20} />
          {!isCollapsed && (
            <>
              <span>Settings</span>
              <ChevronRight size={14} className={styles.arrow} />
            </>
          )}
        </button>

        <button className={styles.bottomLink} title="Help & Support">
          <HelpCircle size={20} />
          {!isCollapsed && (
            <>
              <span>Help & Support</span>
              <ChevronRight size={14} className={styles.arrow} />
            </>
          )}
        </button>

        <div className={styles.profileCard}>
          <div className={styles.profileInfo}>
            <div className={styles.avatar}>
              <div className={styles.status} />
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className={styles.details}>
              <span className={styles.name}>{user?.email?.split('@')[0]}</span>
              <div className={styles.badge}>
                <Zap size={10} fill="currentColor" />
                <span>{user?.plan_type === 'pro' ? 'Pro Member' : user?.plan_type === 'basic' ? 'Basic Member' : 'Free Plan'}</span>
              </div>
            </div>
          </div>
          <div className={styles.profileActions}>
            <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign Out">
              <LogOut size={16} />
            </button>
            {user?.plan_type !== 'pro' && (
              <button className={styles.upgradeBtn} onClick={onOpenSettings}>
                <Star size={14} />
                <span>Upgrade</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

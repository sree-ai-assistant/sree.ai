import React, { useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  History, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Zap
} from 'lucide-react';
import { useImageStore } from '../../store/image.store';
import styles from '../layout/Sidebar.module.css';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  onNewImage: () => void;
}

export const ImageSidebar: React.FC<ImageSidebarProps> = ({ 
  isCollapsed, 
  setIsCollapsed, 
  onNewImage 
}) => {
  const { history, fetchHistory, activeImage, setActiveImage, deleteImage, isFetchingHistory } = useImageStore();

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleNewImage = () => {
    setActiveImage(null);
    onNewImage();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this generation?')) {
      deleteImage(id);
    }
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
                <button 
                  className={`${styles.historyItem} ${activeImage?.id === img.id ? styles.active : ''}`}
                  onClick={() => setActiveImage(img)}
                  title={img.prompt}
                >
                  <div className={styles.itemIcon}>
                    {img.url ? (
                      <img 
                        src={img.url} 
                        alt="Thumbnail" 
                        style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '4px',
                          objectFit: 'cover'
                        }} 
                      />
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
                </button>
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

      {!isCollapsed && (
        <div className={styles.bottomSection}>
          <div style={{ 
            padding: '16px', 
            background: 'rgba(59,130,246,0.05)', 
            borderRadius: '16px', 
            border: '1px solid rgba(59,130,246,0.1)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkles size={14} className="text-primary" />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Generator Info
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Models Active</span>
                <span style={{ fontWeight: 600 }}>{history.length > 0 ? 'Ready' : 'Idle'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Storage</span>
                <span style={{ fontWeight: 600 }}>Cloud Sync</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

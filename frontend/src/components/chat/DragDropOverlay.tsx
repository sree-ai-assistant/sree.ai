import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Image as ImageIcon, FileText, Sparkles } from 'lucide-react';
import styles from './DragDropOverlay.module.css';

interface DragDropOverlayProps {
  isVisible: boolean;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({
  isVisible,
  onDrop,
  onDragOver,
  onDragLeave,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={styles.overlayBackdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <motion.div
            className={styles.dropFrame}
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.iconCluster}>
              {/* Left Badge: Code / Terminal */}
              <motion.div
                className={`${styles.badge} ${styles.badgeLeft}`}
                animate={{ y: [-2, 2, -2], rotate: [-14, -12, -14] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Terminal size={22} strokeWidth={2.2} />
              </motion.div>

              {/* Right Badge: Documents */}
              <motion.div
                className={`${styles.badge} ${styles.badgeRight}`}
                animate={{ y: [2, -2, 2], rotate: [14, 12, 14] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              >
                <FileText size={22} strokeWidth={2.2} />
              </motion.div>

              {/* Center Badge: Vibrant Image / Multimodal */}
              <motion.div
                className={`${styles.badge} ${styles.badgeCenter}`}
                animate={{ y: [-4, 0, -4] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ImageIcon size={26} strokeWidth={2.2} />
              </motion.div>
            </div>

            <div className={styles.contentBox}>
              <h2 className={styles.title}>Add anything</h2>
              <p className={styles.subtitle}>
                Drop any file here to add it to the conversation
              </p>
              <div className={styles.tagPill}>
                <Sparkles size={12} color="#60a5fa" />
                <span>Images, PDFs, Spreadsheets, Docs, Code</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

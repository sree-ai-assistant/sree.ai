import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import styles from './ImagePreviewModal.module.css';

interface ImagePreviewModalProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  src,
  alt = 'Image preview',
  onClose
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Reset zoom whenever image source changes
  useEffect(() => {
    setZoomLevel(1);
  }, [src]);

  // Handle escape key and document body scroll lock
  useEffect(() => {
    if (!src) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [src, onClose]);

  const toggleZoom = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoomLevel(prev => (prev === 1 ? 2 : 1));
  }, []);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src) return;
    try {
      // Append cache-buster so fetch requests a fresh response with CORS headers from Cloudflare R2
      // instead of reading the <img> tag's non-CORS response cached on disk
      const downloadUrl = src.includes('?') ? `${src}&t=${Date.now()}` : `${src}?t=${Date.now()}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cleanFileName = alt && alt !== 'Image preview' && alt !== 'Attachment preview' ? alt : 'image.png';
      a.download = cleanFileName.includes('.') ? cleanFileName : `${cleanFileName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn('[ImagePreviewModal] Direct download failed, falling back to open in new tab:', err);
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  }, [src, alt]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          {/* Top floating control bar */}
          <div className={styles.topBar} onClick={(e) => e.stopPropagation()}>
            {alt && (
              <div className={styles.fileNameBadge} title={alt}>
                <span>{alt}</span>
              </div>
            )}

            <div className={styles.actionsCluster}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={toggleZoom}
                title={zoomLevel === 1 ? 'Zoom in (2x)' : 'Reset zoom (1x)'}
                aria-label="Toggle zoom"
              >
                {zoomLevel === 1 ? <ZoomIn size={18} /> : <ZoomOut size={18} />}
              </button>

              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleDownload}
                title="Download image"
                aria-label="Download image"
              >
                <Download size={18} />
              </button>

              <button
                type="button"
                className={`${styles.actionBtn} ${styles.closeBtn}`}
                onClick={onClose}
                title="Close (Esc)"
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Image Viewport */}
          <div 
            className={styles.imageViewport}
            onClick={onClose}
          >
            <motion.div
              className={styles.imageWrapper}
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={src}
                alt={alt}
                className={styles.previewImage}
                style={{
                  transform: `scale(${zoomLevel})`,
                  cursor: zoomLevel === 1 ? 'zoom-in' : 'zoom-out',
                  transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={toggleZoom}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

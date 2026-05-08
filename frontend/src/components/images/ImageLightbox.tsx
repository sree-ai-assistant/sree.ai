import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Download, ChevronLeft, ChevronRight, 
  Maximize2, Share2, Info, Calendar, Sparkles,
  Copy
} from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './ImageLightbox.module.css';

interface ImageData {
  id: string;
  url: string;
  prompt: string;
  created_at?: string;
  model?: string;
}

interface ImageLightboxProps {
  images: ImageData[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate
}) => {
  const currentImage = images[currentIndex];

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextIdx = (currentIndex - 1 + images.length) % images.length;
    onNavigate(nextIdx);
  }, [currentIndex, images.length, onNavigate]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextIdx = (currentIndex + 1) % images.length;
    onNavigate(nextIdx);
  }, [currentIndex, images.length, onNavigate]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(currentImage.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sree-ai-${currentImage.id}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  if (!isOpen || !currentImage) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={styles.overlay}
        onClick={onClose}
      >
        <div className={styles.header}>
          <div className={styles.headerActions}>
            <button className={styles.iconButton} onClick={onClose} title="Close">
              <X size={24} />
            </button>
          </div>
          <div className={styles.headerActions}>
            <button 
              className={styles.iconButton} 
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(currentImage.prompt);
                toast.success('Prompt copied!');
              }} 
              title="Copy Prompt"
            >
              <Copy size={22} />
            </button>
            <button className={styles.iconButton} onClick={handleDownload} title="Download">
              <Download size={24} />
            </button>
          </div>
        </div>

        <div className={styles.imageContainer}>
          {images.length > 1 && (
            <>
              <button className={`${styles.navButton} ${styles.prev}`} onClick={handlePrev}>
                <ChevronLeft size={32} />
              </button>
              <button className={`${styles.navButton} ${styles.next}`} onClick={handleNext}>
                <ChevronRight size={32} />
              </button>
            </>
          )}

          <motion.img
            key={currentImage.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            src={currentImage.url}
            alt={currentImage.prompt}
            className={styles.mainImage}
            onClick={e => e.stopPropagation()}
          />
        </div>

        <div className={styles.footer}>
          <div className={styles.promptInfo}>
            <p className={styles.promptText}>{currentImage.prompt}</p>
            <div className={styles.metadata}>
              <div className={styles.metadataItem}>
                <Sparkles size={14} />
                <span>{currentImage.model || 'Standard Model'}</span>
              </div>
              {currentImage.created_at && (
                <div className={styles.metadataItem}>
                  <Calendar size={14} />
                  <span>{new Date(currentImage.created_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className={styles.secondaryBtn} 
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(currentImage.prompt);
                toast.success('Prompt copied!');
              }}
            >
              <Copy size={18} />
              Copy Prompt
            </button>
            <button className={styles.downloadBtn} onClick={handleDownload}>
              <Download size={20} />
              Download Artwork
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

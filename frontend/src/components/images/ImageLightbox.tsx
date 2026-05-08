import React, { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Download, ChevronLeft, ChevronRight, 
  Maximize2, Share2, Info, Calendar, Sparkles,
  Copy, Check, Loader2, AlertCircle, ZoomIn, ZoomOut, RefreshCcw
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

  const [isCopied, setIsCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsCopied(false);
    setDownloadStatus('idle');
    resetZoom();
    const nextIdx = (currentIndex - 1 + images.length) % images.length;
    onNavigate(nextIdx);
  }, [currentIndex, images.length, onNavigate, resetZoom]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsCopied(false);
    setDownloadStatus('idle');
    resetZoom();
    const nextIdx = (currentIndex + 1) % images.length;
    onNavigate(nextIdx);
  }, [currentIndex, images.length, onNavigate, resetZoom]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(currentImage.prompt);
    setIsCopied(true);
    toast.success('Prompt copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadStatus === 'loading') return;
    
    setDownloadStatus('loading');
    try {
      const res = await fetch(currentImage.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sree-ai-${currentImage.id}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setDownloadStatus('success');
      toast.success('Downloaded successfully!');
      setTimeout(() => setDownloadStatus('idle'), 2000);
    } catch (err) {
      console.error('Download failed', err);
      setDownloadStatus('error');
      toast.error('Download failed');
      setTimeout(() => setDownloadStatus('idle'), 2000);
    }
  };
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY;
    const zoomIn = delta < 0;
    
    setScale(prev => {
      const step = 0.2;
      const newScale = zoomIn ? prev + step : prev - step;
      return Math.min(Math.max(newScale, 1), 5);
    });
  };

  const handleDragEnd = (_: any, info: any) => {
    setPosition({
      x: info.point.x,
      y: info.point.y
    });
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
              className={`${styles.iconButton} ${isCopied ? styles.success : ''}`} 
              onClick={handleCopy} 
              title="Copy Prompt"
            >
              {isCopied ? <Check size={22} /> : <Copy size={22} />}
            </button>
            <button 
              className={`${styles.iconButton} ${downloadStatus === 'success' ? styles.success : ''} ${downloadStatus === 'error' ? styles.error : ''}`} 
              onClick={handleDownload} 
              title="Download"
              disabled={downloadStatus === 'loading'}
            >
              {downloadStatus === 'loading' ? <Loader2 size={24} className="animate-spin" /> : 
               downloadStatus === 'success' ? <Check size={24} /> :
               downloadStatus === 'error' ? <AlertCircle size={24} /> :
               <Download size={24} />}
            </button>
            {scale > 1 && (
              <button className={styles.iconButton} onClick={resetZoom} title="Reset Zoom">
                <RefreshCcw size={22} />
              </button>
            )}
          </div>
        </div>

        <div 
          className={styles.imageContainer}
          onWheel={handleWheel}
        >
          {images.length > 1 && scale === 1 && (
            <>
              <button className={`${styles.navButton} ${styles.prev}`} onClick={handlePrev}>
                <ChevronLeft size={32} />
              </button>
              <button className={`${styles.navButton} ${styles.next}`} onClick={handleNext}>
                <ChevronRight size={32} />
              </button>
            </>
          )}

          <div className={styles.mainImageWrapper}>
            <motion.img
              key={currentImage.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ 
                scale: scale,
                x: scale === 1 ? 0 : undefined,
                y: scale === 1 ? 0 : undefined,
                opacity: 1 
              }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ 
                scale: { type: 'spring', damping: 25, stiffness: 200 },
                opacity: { duration: 0.2 }
              }}
              src={currentImage.url}
              alt={currentImage.prompt}
              className={styles.mainImage}
              style={{ 
                cursor: scale > 1 ? 'grab' : 'zoom-in',
                touchAction: 'none'
              }}
              drag={scale > 1}
              dragElastic={0.1}
              dragMomentum={false}
              onClick={e => e.stopPropagation()}
              onDoubleClick={resetZoom}
            />
          </div>
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
              className={`${styles.secondaryBtn} ${isCopied ? styles.btnSuccess : ''}`} 
              onClick={handleCopy}
            >
              {isCopied ? <Check size={18} /> : <Copy size={18} />}
              {isCopied ? 'Copied!' : 'Copy Prompt'}
            </button>
            <button 
              className={`${styles.downloadBtn} ${downloadStatus === 'success' ? styles.btnSuccess : ''} ${downloadStatus === 'error' ? styles.btnError : ''}`} 
              onClick={handleDownload}
              disabled={downloadStatus === 'loading'}
            >
              {downloadStatus === 'loading' ? <Loader2 size={20} className="animate-spin" /> : 
               downloadStatus === 'success' ? <Check size={20} /> :
               downloadStatus === 'error' ? <AlertCircle size={20} /> :
               <Download size={20} />}
              {downloadStatus === 'loading' ? 'Downloading...' :
               downloadStatus === 'success' ? 'Downloaded' :
               downloadStatus === 'error' ? 'Failed' :
               'Download Artwork'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

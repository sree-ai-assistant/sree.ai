import React, { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import {
  X, Download, ChevronLeft, ChevronRight,
  Maximize2, Share2, Info, Calendar, Sparkles,
  Copy, Check, Loader2, AlertCircle, ZoomIn, ZoomOut, RefreshCcw, RotateCcw
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
  isOpen: boolean;
  onClose: () => void;
  currentIndex?: number;
  initialIndex?: number;
  onNavigate?: (index: number) => void;
  onResetZoom?: () => void;
  onDownload?: (image: ImageData) => Promise<void>;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  isOpen,
  onClose,
  initialIndex = 0,
  currentIndex: controlledIndex,
  onNavigate,
  onResetZoom,
  onDownload
}) => {
  const [internalIndex, setInternalIndex] = useState(initialIndex);
  const currentIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  useEffect(() => {
    if (isOpen) {
      setInternalIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  const setCurrentIndex = (idx: number) => {
    if (onNavigate) onNavigate(idx);
    setInternalIndex(idx);
  };

  const currentImage = images[currentIndex];

  const [isCopied, setIsCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [hasError, setHasError] = useState(false);
  const controls = useAnimation();

  const resetZoom = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale(1);
    await controls.start({
      x: 0,
      y: 0,
      scale: 1,
      transition: { 
        type: 'spring', 
        damping: 30, 
        stiffness: 250,
        mass: 1
      }
    });
    onResetZoom?.();
  }, [controls, onResetZoom]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsCopied(false);
    setDownloadStatus('idle');
    resetZoom();
    const nextIdx = (currentIndex - 1 + images.length) % images.length;
    setCurrentIndex(nextIdx);
  }, [currentIndex, images.length, setCurrentIndex]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsCopied(false);
    setDownloadStatus('idle');
    resetZoom();
    const nextIdx = (currentIndex + 1) % images.length;
    setCurrentIndex(nextIdx);
  }, [currentIndex, images.length, setCurrentIndex]);

  const handleCopy = () => {
    if (!currentImage) return;
    navigator.clipboard.writeText(currentImage.prompt);
    setIsCopied(true);
    toast.success('Prompt copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!currentImage || downloadStatus === 'loading') return;

    setDownloadStatus('loading');
    try {
      if (onDownload) {
        await onDownload(currentImage);
      } else {
        const res = await fetch(currentImage.url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sree-ai-${currentImage.id}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      setDownloadStatus('success');
      toast.success('Downloaded successfully!');
      setTimeout(() => setDownloadStatus('idle'), 2000);
    } catch (err: any) {
      console.error('Download failed', err);
      setDownloadStatus('error');
      toast.error(err.response?.data?.message || 'Download failed');
      setTimeout(() => setDownloadStatus('idle'), 2000);
    }
  };

  const handleShare = async () => {
    if (!currentImage) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Sree AI Image',
          text: currentImage.prompt,
          url: currentImage.url,
        });
      } else {
        await navigator.clipboard.writeText(currentImage.url);
        toast.success('Image link copied to clipboard!');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed', err);
      }
    }
  };
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    const delta = e.deltaY;
    const zoomIntensity = 0.001;
    const factor = Math.pow(1 - zoomIntensity, delta);
    
    setScale(prev => {
      const newScale = Math.min(Math.max(prev * factor, 1), 8);
      if (newScale !== prev) {
        controls.start({ 
          scale: newScale,
          transition: { duration: 0.1, ease: "easeOut" }
        });
      }
      return newScale;
    });
  }, [controls, isDragging]);

  useEffect(() => {
    setHasError(false);
  }, [currentIndex]);

  const handleImageError = () => {
    setHasError(true);
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
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className={styles.header} onClick={(e) => e.stopPropagation()}>
            <div className={styles.headerActions}>
              <button
                className={`${styles.iconButton} ${isCopied ? styles.success : ''}`}
                onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                title="Copy Prompt"
              >
                {isCopied ? <Check size={22} /> : <Copy size={22} />}
              </button>
              <button
                className={`${styles.iconButton} ${downloadStatus === 'success' ? styles.success : ''} ${downloadStatus === 'error' ? styles.error : ''}`}
                onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                title="Download"
                disabled={downloadStatus === 'loading'}
              >
                {downloadStatus === 'loading' ? <Loader2 size={24} className="animate-spin" /> :
                  downloadStatus === 'success' ? <Check size={24} /> :
                    downloadStatus === 'error' ? <AlertCircle size={24} /> :
                      <Download size={24} />}
              </button>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.iconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  const s = Math.min(scale + 0.5, 8);
                  setScale(s);
                  controls.start({ scale: s });
                }}
                title="Zoom In"
              >
                <ZoomIn size={22} />
              </button>
              <button
                className={styles.iconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  const s = Math.max(scale - 0.5, 1);
                  setScale(s);
                  controls.start({ scale: s });
                }}
                title="Zoom Out"
              >
                <ZoomOut size={22} />
              </button>
              {scale > 1 && (
                <button
                  className={styles.iconButton}
                  onClick={resetZoom}
                  title="Reset Zoom"
                >
                  <RotateCcw size={22} />
                </button>
              )}
              <button
                className={styles.iconButton}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                title="Close"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <button
            className={`${styles.navButton} ${styles.prev}`}
            onClick={handlePrev}
            title="Previous Image"
          >
            <ChevronLeft size={32} />
          </button>

          <button
            className={`${styles.navButton} ${styles.next}`}
            onClick={handleNext}
            title="Next Image"
          >
            <ChevronRight size={32} />
          </button>

          <div
            className={styles.imageContainer}
            onWheel={handleWheel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.mainImageWrapper}>
              {hasError ? (
                <div className={styles.errorContainer}>
                  <AlertCircle size={48} className={styles.errorIcon} />
                  <p className={styles.errorText}>Failed to load image !</p>
                  <p className={styles.errorSubtext}>You can recreate the image with the same Prompt</p>
                  <button className={styles.retryBtn} onClick={(e) => { e.stopPropagation(); setHasError(false); }}>
                    <RefreshCcw size={20} />
                    Retry Loading
                  </button>
                </div>
              ) : (
                <motion.div
                  className={styles.imageWrapper}
                  initial={{ x: 0, y: 0, scale: 1 }}
                  animate={controls}
                  drag={scale > 1}
                  dragConstraints={{ left: -2000 * scale, right: 2000 * scale, top: -2000 * scale, bottom: 2000 * scale }}
                  dragElastic={0.1}
                  dragMomentum={true}
                  onDragStart={() => setIsDragging(true)}
                  onDragEnd={() => {
                    setTimeout(() => setIsDragging(false), 200);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isDragging) return;
                    if (scale === 1) {
                      setScale(2);
                      controls.start({ scale: 2 });
                    } else {
                      resetZoom();
                    }
                  }}
                >
                  <motion.img
                    src={currentImage.url}
                    alt={currentImage.prompt}
                    className={styles.mainImage}
                    style={{
                      cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
                    }}
                    onError={handleImageError}
                  />
                </motion.div>
              )}
            </div>
          </div>

          <div className={styles.footer} onClick={(e) => e.stopPropagation()}>
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

            <div className={styles.footerActions}>
              <button
                className={`${styles.secondaryBtn} ${isCopied ? styles.btnSuccess : ''}`}
                onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              >
                {isCopied ? <Check size={18} /> : <Copy size={18} />}
                {isCopied ? 'Copied!' : 'Copy Prompt'}
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
              >
                <Share2 size={20} />
                Share
              </button>
              <button
                className={`${styles.downloadBtn} ${downloadStatus === 'success' ? styles.btnSuccess : ''} ${downloadStatus === 'error' ? styles.btnError : ''}`}
                onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                disabled={downloadStatus === 'loading'}
              >
                {downloadStatus === 'loading' ? <Loader2 size={20} className="animate-spin" /> :
                  downloadStatus === 'success' ? <Check size={20} /> :
                    downloadStatus === 'error' ? <AlertCircle size={20} /> :
                      <Download size={20} />}
                Download Image
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

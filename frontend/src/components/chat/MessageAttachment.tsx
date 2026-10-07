import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Eye,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './MessageAttachment.module.css';
import { ImagePreviewModal } from './ImagePreviewModal';

interface AttachmentItem {
  name: string;
  type: string;
  url?: string;
}

interface MessageAttachmentProps {
  attachments: AttachmentItem[];
  hasText?: boolean;
}

const isInternalStorageUrl = (url: string): boolean => {
  return url.includes('.r2.dev') ||
         url.includes('.cloudflarestorage.com') ||
         url.includes('/storage/v1/object/') ||
         url.includes('sreeai.qzz.io');
};

const getFileColor = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return '#ef4444';
    case 'doc':
    case 'docx': return '#3b82f6';
    case 'xls':
    case 'xlsx': return '#10b981';
    case 'ppt':
    case 'pptx': return '#f59e0b';
    case 'txt': return '#94a3b8';
    default: return '#6366f1';
  }
};

/**
 * Download helper for files (documents, videos, etc.)
 */
const triggerFileDownload = async (
  e: React.MouseEvent | React.KeyboardEvent,
  url?: string,
  name?: string,
  onUnavailable?: (url: string) => void
) => {
  e.stopPropagation();
  if (!url) return;

  const fileName = name || 'download';
  const isStorage = isInternalStorageUrl(url);

  try {
    const downloadUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
    const res = await fetch(downloadUrl);

    // Check if the file is missing or expired in storage (404 Not Found or 410 Gone)
    if (res.status === 404 || res.status === 410) {
      toast.error(`"${fileName}" has expired or is no longer available.`);
      onUnavailable?.(url);
      return;
    }

    if (!res.ok) {
      if (isStorage) {
        toast.error(`Unable to download "${fileName}". Access was denied or file is unavailable.`);
        onUnavailable?.(url);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err: any) {
    // If it's internal storage, network failures (CORS blocked on 404 error) must never open a raw tab!
    if (isStorage) {
      console.warn(`[MessageAttachment] Storage download failed for "${fileName}":`, err);
      toast.error(`"${fileName}" has expired or cannot be retrieved.`);
      onUnavailable?.(url);
      return;
    }

    // Only for external third-party non-storage URLs where CORS blocked the blob fetch:
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error(`Failed to download "${fileName}".`);
    }
  }
};

/**
 * ScrollableRow with sleek hover navigation arrows.
 * Arrows only appear on hover, and only when there is horizontal overflow in that direction.
 */
const ScrollableRow: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    const handleScroll = () => {
      checkScroll();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });

    // Resize observer to re-check when items load or window resizes
    const observer = new ResizeObserver(() => {
      checkScroll();
    });
    observer.observe(el);

    // Global mousemove and mouseup listeners for smooth grab-and-scroll
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDownRef.current || !containerRef.current) return;
      const deltaX = e.pageX - startXRef.current;
      if (Math.abs(deltaX) > 4) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }
      if (hasDraggedRef.current) {
        containerRef.current.scrollLeft = startScrollLeftRef.current - deltaX;
        checkScroll();
      }
    };

    const handleGlobalMouseUp = () => {
      if (!isDownRef.current) return;
      isDownRef.current = false;
      setIsDragging(false);
      // Brief timeout before clearing hasDraggedRef so child click handlers can be prevented
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [checkScroll]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (e.button !== 0) return; // Only respond to primary click

    // Don't hijack clicks on buttons, range sliders, or audio elements
    const target = e.target as HTMLElement;
    if (target.closest('button, input[type="range"], audio')) {
      return;
    }

    isDownRef.current = true;
    startXRef.current = e.pageX;
    startScrollLeftRef.current = el.scrollLeft;
    hasDraggedRef.current = false;
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    // If user dragged to scroll, suppress child click (preview/download)
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // Smooth mouse wheel horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        checkScroll();
      }
    }
  };

  const scrollBy = (offset: number) => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkScroll, 250);
    }
  };

  const isOverflowing = canScrollLeft || canScrollRight;
  const showLeft = isHovered && canScrollLeft;
  const showRight = isHovered && canScrollRight;

  return (
    <div
      className={`${styles.scrollableRowWrapper} ${isOverflowing ? styles.isGrabbable : ''} ${isDragging ? styles.isDragging : ''}`}
      onMouseEnter={() => {
        setIsHovered(true);
        checkScroll();
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left Chevron Button (only visible when hovered and can scroll left) */}
      <div className={`${styles.navEdge} ${styles.navEdgeLeft} ${showLeft ? styles.navEdgeVisible : ''}`}>
        <button
          type="button"
          className={styles.navArrowBtn}
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(-260);
          }}
          title="Scroll left"
          aria-label="Scroll left"
          tabIndex={showLeft ? 0 : -1}
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* The Scrollable row */}
      <div
        ref={containerRef}
        className={className}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>

      {/* Right Chevron Button (only visible when hovered and can scroll right) */}
      <div className={`${styles.navEdge} ${styles.navEdgeRight} ${showRight ? styles.navEdgeVisible : ''}`}>
        <button
          type="button"
          className={styles.navArrowBtn}
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(260);
          }}
          title="Scroll right"
          aria-label="Scroll right"
          tabIndex={showRight ? 0 : -1}
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

/**
 * High-end Dark Glassmorphic Audio Player Component
 * Meets UI/UX Pro Max guidelines: compact 52px card, smooth waveform animation,
 * non-intrusive controls, glowing accent scrubber, and zero clutter.
 */
const CustomAudioPlayer: React.FC<{ url: string; name: string }> = ({ url, name }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    if (audio.readyState >= 1) {
      setDuration(audio.duration || 0);
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [url]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(err => {
        console.warn('[AudioPlayer] Playback error:', err);
      });
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const extension = name.split('.').pop()?.toUpperCase() || 'AUDIO';
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className={styles.customAudioCard} onClick={(e) => e.stopPropagation()}>
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Left Play/Pause circle button with glowing purple state */}
      <button
        type="button"
        className={`${styles.audioPlayBtn} ${isPlaying ? styles.audioPlayBtnActive : ''}`}
        onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play audio'}
        aria-label={isPlaying ? 'Pause' : 'Play audio'}
      >
        {isPlaying ? (
          <Pause size={13} fill="currentColor" />
        ) : (
          <Play size={13} fill="currentColor" style={{ marginLeft: 2 }} />
        )}
      </button>

      {/* Main Content Column */}
      <div className={styles.audioMainContent}>
        {/* Top line: title, format badge, mini visualizer equalizer, mute toggle */}
        <div className={styles.audioHeaderRow}>
          <div className={styles.audioMetaGroup}>
            <span className={styles.audioTitle} title={name}>{name}</span>
            <span className={styles.audioBadge}>{extension}</span>
            {isPlaying && (
              <div className={styles.audioEqualizer} title="Playing">
                <span className={`${styles.eqBar} ${styles.eqBarAnim}`} style={{ animationDelay: '0ms' }} />
                <span className={`${styles.eqBar} ${styles.eqBarAnim}`} style={{ animationDelay: '180ms' }} />
                <span className={`${styles.eqBar} ${styles.eqBarAnim}`} style={{ animationDelay: '360ms' }} />
              </div>
            )}
          </div>

          <button
            type="button"
            className={styles.audioMuteBtn}
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        </div>

        {/* Bottom line: refined scrubber line and combined timestamp */}
        <div className={styles.audioScrubberRow}>
          <div className={styles.scrubberTrackContainer}>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.05"
              value={currentTime}
              onChange={handleSeek}
              className={styles.audioScrubber}
              style={{
                background: `linear-gradient(to right, #a855f7 0%, #c084fc ${progressPercent}%, rgba(255, 255, 255, 0.1) ${progressPercent}%, rgba(255, 255, 255, 0.1) 100%)`
              }}
            />
          </div>
          <span className={styles.audioTimestamp}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};

const ImageAttachment: React.FC<{
  url?: string;
  name: string;
  index?: number;
  total?: number;
  isUnavailable?: boolean;
  onUnavailable?: (url: string) => void;
  onClick: () => void;
}> = ({
  url,
  name,
  index,
  total = 1,
  isUnavailable = false,
  onUnavailable,
  onClick
}) => {
  const [hasError, setHasError] = useState(false);
  const extension = name.split('.').pop()?.toUpperCase() || 'IMAGE';

  const handleImageError = () => {
    setHasError(true);
    if (url) onUnavailable?.(url);
  };

  if (hasError || isUnavailable || !url) {
    return (
      <div
        className={`${styles.attachmentCard} ${styles.clickableCard} ${isUnavailable || hasError ? styles.cardDisabled : ''}`}
        onClick={onClick}
        title={isUnavailable || hasError ? `Click to inspect ${name} (file may be unavailable)` : `Click to preview ${name}`}
      >
        <div className={styles.cardIcon} style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#f87171' }}>
          <ImageIcon size={16} strokeWidth={2.2} />
        </div>
        <div className={styles.cardInfo}>
          <div className={styles.cardHeaderLine}>
            <span className={styles.cardFileName} title={name}>{name}</span>
            {(isUnavailable || hasError) && <span className={styles.expiredBadge}>Expired</span>}
          </div>
          <span className={styles.cardFileType} style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
            {extension}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.imageCard} onClick={onClick} title={`Click to preview ${name}`}>
      {/* Frame number badge for multi-frame sequences (e.g. video extraction) */}
      {total > 1 && typeof index === 'number' && (
        <span className={styles.frameBadge}>
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <img
        src={url}
        alt={name}
        className={styles.imageContent}
        onError={handleImageError}
        loading="lazy"
      />
      <div className={styles.imageOverlay}>
        <div className={styles.previewPill}>
          <Eye size={11} strokeWidth={2.5} />
          <span>PREVIEW</span>
        </div>
      </div>
    </div>
  );
};

export const MessageAttachment: React.FC<MessageAttachmentProps> = ({ attachments, hasText = false }) => {
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [unavailableUrls, setUnavailableUrls] = useState<Set<string>>(new Set());

  const markUnavailable = useCallback((url: string) => {
    setUnavailableUrls(prev => new Set(prev).add(url));
  }, []);

  if (!attachments || attachments.length === 0) return null;

  // Separate images from non-image files for distinct, well-spaced visual grouping
  const images = attachments.filter(a => a.type === 'image' || a.type?.startsWith('image/'));
  const nonImages = attachments.filter(a => a.type !== 'image' && !a.type?.startsWith('image/'));

  return (
    <div className={`${styles.attachmentsContainer} ${hasText ? styles.withText : ''}`}>
      {/* ─── Image Gallery Row with hover nav arrows ─── */}
      {images.length > 0 && (
        <ScrollableRow className={styles.imageGallery}>
          {images.map((atl, idx) => (
            <ImageAttachment
              key={atl.url ? `${atl.url}-${idx}` : idx}
              url={atl.url}
              name={atl.name || `Image ${idx + 1}`}
              index={idx}
              total={images.length}
              isUnavailable={atl.url ? unavailableUrls.has(atl.url) : false}
              onUnavailable={markUnavailable}
              onClick={() => atl.url && setPreviewImage({ url: atl.url, name: atl.name || `Image ${idx + 1}` })}
            />
          ))}
        </ScrollableRow>
      )}

      {/* ─── Audio and Other Files Row with hover nav arrows & click to download ─── */}
      {nonImages.length > 0 && (
        <ScrollableRow className={styles.filesRow}>
          {nonImages.map((atl, idx) => {
            const key = atl.url ? `${atl.url}-${idx}` : idx;
            const fileColor = atl.type === 'document' ? getFileColor(atl.name) :
                              atl.type === 'audio' ? '#a855f7' :
                              atl.type === 'video' ? '#ec4899' : '#3b82f6';
            const extension = atl.name.split('.').pop()?.toUpperCase() || 'FILE';
            const isUnavailable = atl.url ? unavailableUrls.has(atl.url) : false;

            if (atl.type === 'audio' && atl.url) {
              return <CustomAudioPlayer key={key} url={atl.url} name={atl.name} />;
            }

            const Icon = atl.type === 'video' ? Video :
                         atl.type === 'audio' ? Music : FileText;

            return (
              <div
                key={key}
                className={`${styles.attachmentCard} ${atl.url && !isUnavailable ? styles.clickableCard : ''} ${isUnavailable ? styles.cardDisabled : ''}`}
                onClick={(e) => {
                  if (isUnavailable) {
                    e.stopPropagation();
                    toast.error(`"${atl.name}" has expired or is no longer available.`);
                    return;
                  }
                  if (atl.url) triggerFileDownload(e, atl.url, atl.name, markUnavailable);
                }}
                title={isUnavailable ? `"${atl.name}" has expired and cannot be downloaded` : atl.url ? `Click to download ${atl.name}` : atl.name}
                role={atl.url ? 'button' : undefined}
                tabIndex={atl.url ? 0 : undefined}
                onKeyDown={(e) => {
                  if (atl.url && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    if (isUnavailable) {
                      toast.error(`"${atl.name}" has expired or is no longer available.`);
                      return;
                    }
                    triggerFileDownload(e, atl.url, atl.name, markUnavailable);
                  }
                }}
              >
                <div className={styles.cardIcon} style={{ backgroundColor: `${fileColor}18`, color: fileColor }}>
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                <div className={styles.cardInfo}>
                  <div className={styles.cardHeaderLine}>
                    <span className={styles.cardFileName} title={atl.name}>{atl.name}</span>
                    {isUnavailable && <span className={styles.expiredBadge}>Expired</span>}
                  </div>
                  <span className={styles.cardFileType} style={{ color: isUnavailable ? 'rgba(255, 255, 255, 0.4)' : fileColor }}>
                    {extension}
                  </span>
                </div>
                {atl.url && (
                  <button
                    type="button"
                    className={`${styles.cardDownloadBtn} ${isUnavailable ? styles.btnDisabled : ''}`}
                    onClick={(e) => {
                      if (isUnavailable) {
                        e.stopPropagation();
                        toast.error(`"${atl.name}" has expired or is no longer available.`);
                        return;
                      }
                      triggerFileDownload(e, atl.url, atl.name, markUnavailable);
                    }}
                    title={isUnavailable ? 'File expired' : `Download ${atl.name}`}
                    aria-label={`Download ${atl.name}`}
                    disabled={isUnavailable}
                  >
                    <Download size={13} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            );
          })}
        </ScrollableRow>
      )}

      <ImagePreviewModal
        src={previewImage?.url || null}
        alt={previewImage?.name || 'Attachment image'}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

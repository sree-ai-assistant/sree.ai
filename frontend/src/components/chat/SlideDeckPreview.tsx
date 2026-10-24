import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Presentation,
  Download,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  Palette,
  Check,
  Play,
  Pause,
} from 'lucide-react';
import styles from './SlideDeckPreview.module.css';
import {
  type PresentationTheme,
  PRESENTATION_THEMES,
  DEFAULT_THEME,
} from '../../utils/presentationThemes';
import { getSlideCodeBadge, stripCommonIndentation } from '../../utils/pptxExporter';

/**
 * Exact replica of Microsoft PowerPoint's iconic "Slide Show" projector icon
 */
export const SlideShowIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
  >
    <line x1="2" y1="3" x2="22" y2="3" />
    <rect x="4" y="3" width="16" height="12" rx="1" />
    <polygon points="10,6.5 15,9 10,11.5" fill="currentColor" stroke="none" />
    <line x1="12" y1="15" x2="12" y2="20" />
    <line x1="8" y1="20" x2="16" y2="20" />
  </svg>
);

export interface SlideCodeSnippet {
  language: string;
  code: string;
}

export interface SlideItem {
  id: string | number;
  isTitleSlide: boolean;
  slideNumber: number; // 1-based index (e.g., 1, 2, 3...)
  title: string;
  subtitle?: string;
  bullets: string[];
  paragraphs: string[];
  tableLines: string[];
  codeSnippet?: SlideCodeSnippet;
  hasLogoPlaceholder?: boolean;
  logoPlaceholderText?: string;
  logoUrl?: string;
}

export interface SlideDeckData {
  title: string;
  subtitle?: string;
  slides: SlideItem[];
  totalSlides: number;
  theme?: PresentationTheme;
}

interface SlideDeckPreviewProps {
  slideDeck: SlideDeckData;
  onDownload: (format: 'pptx', theme?: PresentationTheme) => Promise<void> | void;
  isExporting?: boolean;
  fallbackLogoUrl?: string;
}

/**
 * Parses markdown table lines into headers and rows for slide table rendering
 */
function parseSlideTable(tableLines: string[]): { headers: string[]; rows: string[][] } | null {
  if (!tableLines || tableLines.length < 2) return null;
  const nonSeparator = tableLines.filter(l => !/^\|(\s*[:-]+[-| :]*)\|$/.test(l.trim()));
  if (nonSeparator.length === 0) return null;

  const parsed = nonSeparator.map(line =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim())
  );

  const headers = parsed[0] || [];
  const rows = parsed.slice(1);
  return { headers, rows };
}

/**
 * Resolves adaptive CSS classes for slide code snippets and ASCII diagrams.
 * Applies diagramPre / diagramTallPre or codeTallPre to guarantee that tall diagrams
 * and snippets fit cleanly within the 16:9 canvas without triggering scrollbars.
 */
function getSlidePreClassName(codeSnippet: SlideCodeSnippet): string {
  const isDiagram = getSlideCodeBadge(codeSnippet.language, codeSnippet.code) === 'DIAGRAM';
  const cleanCode = (codeSnippet.code || '').trimEnd();
  const lineCount = cleanCode.split('\n').length;

  if (isDiagram) {
    if (lineCount > 20) return styles.diagramUltraTallPre;
    if (lineCount > 14) return styles.diagramTallPre;
    return styles.diagramPre;
  }

  if (lineCount > 14) return styles.codeTallPre;
  if (lineCount >= 8) return styles.codeMediumPre;
  return '';
}

/**
 * Parses markdown bold (**text**), italic (*text*), and code (`text`) into React elements
 */
function renderFormattedText(text: string): React.ReactNode {
  if (!text) return null;
  if (!text.includes('**') && !text.includes('*') && !text.includes('`')) {
    return text;
  }
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          style={{
            padding: '1px 5px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            fontSize: '0.9em',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

export const SlideDeckPreview: React.FC<SlideDeckPreviewProps> = ({
  slideDeck,
  onDownload,
  isExporting = false,
  fallbackLogoUrl,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedLogoUrls, setFailedLogoUrls] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSlideShow, setIsSlideShow] = useState(false);
  const [activeTheme, setActiveTheme] = useState<PresentationTheme>(
    slideDeck.theme || DEFAULT_THEME
  );
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showModalThemeMenu, setShowModalThemeMenu] = useState(false);
  const [showModalMobileThemeMenu, setShowModalMobileThemeMenu] = useState(false);
  const [showSlideShowMenu, setShowSlideShowMenu] = useState(false);
  const [showModalSlideShowMenu, setShowModalSlideShowMenu] = useState(false);
  const [showSlideShowThemeMenu, setShowSlideShowThemeMenu] = useState(false);

  // Auto-play timer state in slide show
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayProgress, setAutoPlayProgress] = useState(0);
  const [showSlideShowControls, setShowSlideShowControls] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);
  const modalCanvasRef = useRef<HTMLDivElement>(null);
  const slideShowCanvasRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const modalThemeMenuRef = useRef<HTMLDivElement>(null);
  const modalMobileThemeMenuRef = useRef<HTMLDivElement>(null);
  const slideShowMenuRef = useRef<HTMLDivElement>(null);
  const modalSlideShowMenuRef = useRef<HTMLDivElement>(null);
  const slideShowThemeMenuRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = slideDeck.slides.length;
  const currentSlide = slideDeck.slides[currentIndex] || slideDeck.slides[0];

  // Sync theme if slideDeck changes
  useEffect(() => {
    if (slideDeck.theme) {
      setActiveTheme(slideDeck.theme);
    }
  }, [slideDeck.theme]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
      if (modalThemeMenuRef.current && !modalThemeMenuRef.current.contains(e.target as Node)) {
        setShowModalThemeMenu(false);
      }
      if (modalMobileThemeMenuRef.current && !modalMobileThemeMenuRef.current.contains(e.target as Node)) {
        setShowModalMobileThemeMenu(false);
      }
      if (slideShowMenuRef.current && !slideShowMenuRef.current.contains(e.target as Node)) {
        setShowSlideShowMenu(false);
      }
      if (modalSlideShowMenuRef.current && !modalSlideShowMenuRef.current.contains(e.target as Node)) {
        setShowModalSlideShowMenu(false);
      }
      if (slideShowThemeMenuRef.current && !slideShowThemeMenuRef.current.contains(e.target as Node)) {
        setShowSlideShowThemeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset scroll to top on slide change
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.scrollTop = 0;
      const body = canvasRef.current.querySelector(`.${styles.contentSlideBody}`);
      if (body) body.scrollTop = 0;
    }
    if (modalCanvasRef.current) {
      modalCanvasRef.current.scrollTop = 0;
      const modalBody = modalCanvasRef.current.querySelector(`.${styles.contentSlideBody}`);
      if (modalBody) modalBody.scrollTop = 0;
    }
    if (slideShowCanvasRef.current) {
      slideShowCanvasRef.current.scrollTop = 0;
      const ssBody = slideShowCanvasRef.current.querySelector(`.${styles.contentSlideBody}`);
      if (ssBody) ssBody.scrollTop = 0;
    }
  }, [currentIndex]);

  // Slide transition animation state
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | null>(null);

  const handlePrevWithAnim = useCallback(() => {
    if (currentIndex <= 0) return;
    setSlideDirection('prev');
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, [currentIndex]);

  const handleNextWithAnim = useCallback(() => {
    if (currentIndex >= total - 1) return;
    setSlideDirection('next');
    setCurrentIndex(prev => Math.min(total - 1, prev + 1));
  }, [currentIndex, total]);

  // Clear animation direction after transition
  useEffect(() => {
    if (slideDirection) {
      const timer = setTimeout(() => {
        setSlideDirection(null);
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [slideDirection, currentIndex]);

  const handlePrev = handlePrevWithAnim;
  const handleNext = handleNextWithAnim;

  // PowerPoint Slide Show launcher and exit helpers
  const startSlideShow = useCallback((fromBeginning = true) => {
    if (fromBeginning) {
      setCurrentIndex(0);
    }
    setIsSlideShow(true);
    setShowSlideShowMenu(false);
    setShowModalSlideShowMenu(false);
    setShowSlideShowControls(true);
    setAutoPlayProgress(0);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // Ignored
    }
  }, []);

  const exitSlideShow = useCallback(() => {
    setIsSlideShow(false);
    setIsAutoPlaying(false);
    setAutoPlayProgress(0);
    setShowSlideShowThemeMenu(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Ignored
    }
  }, []);

  // SlideShow auto-hide toolbar on mouse inactivity
  const handleSlideShowMouseMove = useCallback(() => {
    setShowSlideShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowSlideShowControls(false);
    }, 3200);
  }, []);

  // SlideShow click on slide advances to next slide (PowerPoint standard)
  const handleSlideShowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, [role="button"], [class*="themeDropdown"]')) {
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width * 0.25) {
      handlePrevWithAnim();
    } else {
      handleNextWithAnim();
    }
    handleSlideShowMouseMove();
  };

  // Auto-play timer effect (5s per slide with smooth countdown bar)
  useEffect(() => {
    if (!isSlideShow || !isAutoPlaying) {
      setAutoPlayProgress(0);
      return;
    }

    setAutoPlayProgress(0);

    const slideDuration = 5000;
    const stepMs = 40;
    const startTime = Date.now();

    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / slideDuration) * 100);
      setAutoPlayProgress(progress);

      if (elapsed >= slideDuration) {
        clearInterval(progressTimer);
        if (currentIndex < total - 1) {
          setSlideDirection('next');
          setCurrentIndex(prev => Math.min(total - 1, prev + 1));
        } else {
          setIsAutoPlaying(false);
        }
      }
    }, stepMs);

    return () => {
      clearInterval(progressTimer);
    };
  }, [isSlideShow, isAutoPlaying, currentIndex, total]);

  // Global keyboard navigation: F5, Shift+F5, ArrowLeft, ArrowRight, Space, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // PowerPoint Shortcuts: F5 (from start) / Shift+F5 (from current slide)
      if (e.key === 'F5') {
        e.preventDefault();
        if (e.shiftKey) {
          startSlideShow(false);
        } else {
          startSlideShow(true);
        }
        return;
      }

      if (isSlideShow) {
        if (e.key === 'Escape') {
          exitSlideShow();
        } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') {
          e.preventDefault();
          handleNextWithAnim();
          handleSlideShowMouseMove();
        } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
          e.preventDefault();
          handlePrevWithAnim();
          handleSlideShowMouseMove();
        } else if (e.key === 'Home') {
          e.preventDefault();
          setCurrentIndex(0);
          handleSlideShowMouseMove();
        } else if (e.key === 'End') {
          e.preventDefault();
          setCurrentIndex(total - 1);
          handleSlideShowMouseMove();
        }
        return;
      }

      if (isFullscreen) {
        if (e.key === 'Escape') {
          setIsFullscreen(false);
        } else if (e.key === 'ArrowLeft') {
          handlePrevWithAnim();
        } else if (e.key === 'ArrowRight') {
          handleNextWithAnim();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isSlideShow,
    isFullscreen,
    total,
    handlePrevWithAnim,
    handleNextWithAnim,
    handleSlideShowMouseMove,
    startSlideShow,
    exitSlideShow,
  ]);

  // Lock body scroll when fullscreen modal or slide show is active
  useEffect(() => {
    if (!isFullscreen && !isSlideShow) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isFullscreen, isSlideShow]);

  // Interactive Touch Swipe Handling with real-time finger tracking
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || !isDragging) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX;
    const deltaY = currentY - (touchStartY || currentY);

    // Only drag horizontally if horizontal movement dominates
    if (Math.abs(deltaX) > Math.abs(deltaY) * 0.6) {
      // Damping at edge slides
      if ((currentIndex === 0 && deltaX > 0) || (currentIndex === total - 1 && deltaX < 0)) {
        setDragOffset(deltaX * 0.25);
      } else {
        setDragOffset(deltaX);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 40; // Pixels required to trigger slide change
    if (dragOffset < -threshold && currentIndex < total - 1) {
      setDragOffset(0);
      handleNextWithAnim();
    } else if (dragOffset > threshold && currentIndex > 0) {
      setDragOffset(0);
      handlePrevWithAnim();
    } else {
      setDragOffset(0);
    }
    setTouchStartX(null);
    setTouchStartY(null);
  };

  const slideTableData = useMemo(() => {
    if (!currentSlide || !currentSlide.tableLines || currentSlide.tableLines.length === 0) {
      return null;
    }
    return parseSlideTable(currentSlide.tableLines);
  }, [currentSlide]);

  const renderSlideContent = (slide: SlideItem, inModal = false) => {
    const rawLogoUrl = slide.logoUrl;
    // A logo/image slot is ONLY shown if the slide explicitly requested a logo or image in its outline.
    // If the presentation outline has NO logo on this slide, NEVER inject one from fallbackLogoUrl!
    const isLogoRequestedForSlide = Boolean(slide.hasLogoPlaceholder || rawLogoUrl);

    const effectiveLogoUrl = isLogoRequestedForSlide
      ? (rawLogoUrl && !failedLogoUrls.has(rawLogoUrl))
        ? rawLogoUrl
        : (fallbackLogoUrl && !failedLogoUrls.has(fallbackLogoUrl))
        ? fallbackLogoUrl
        : undefined
      : undefined;

    const shouldShowLogoSlot = isLogoRequestedForSlide;

    // 1. Title Slide (Exact 1:1 match to PowerPoint Slide 1 export)
    if (slide.isTitleSlide) {
      return (
        <div
          ref={inModal ? modalCanvasRef : canvasRef}
          className={`${styles.slideCanvas} ${styles.titleSlideCanvas}`}
          style={{
            backgroundColor: inModal ? 'transparent' : `#${activeTheme.coverBg}`,
            fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
          }}
        >
          {effectiveLogoUrl ? (
            <div className={`${styles.slideLogoImgContainer} ${styles.titleLogoImgContainer}`}>
              <img
                src={effectiveLogoUrl}
                alt={slide.logoPlaceholderText || 'Company Logo'}
                className={styles.slideLogoImg}
                onError={() => {
                  setFailedLogoUrls(prev => new Set(prev).add(effectiveLogoUrl));
                }}
              />
            </div>
          ) : shouldShowLogoSlot && (
            <div
              className={`${styles.slidePlaceholderCard} ${styles.titlePlaceholderCard}`}
              title="Right-click 'Change Picture' in PowerPoint to insert your logo or image"
            >
              <span className={styles.slidePlaceholderText}>
                {(slide.logoPlaceholderText || 'YOUR LOGO HERE').toUpperCase()}
              </span>
            </div>
          )}
          <h2
            className={styles.titleSlideHeading}
            style={{
              color: `#${activeTheme.titleColor}`,
              fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
            }}
          >
            {renderFormattedText(slide.title)}
          </h2>
          {slide.subtitle && (
            <p
              className={styles.titleSlideSubtitle}
              style={{
                color: `#${activeTheme.subtitleColor}`,
                fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
              }}
            >
              {renderFormattedText(slide.subtitle)}
            </p>
          )}
        </div>
      );
    }

    // 2. Content Slides (Exact 1:1 match to PowerPoint Content Slides export)
    return (
      <div
        ref={inModal ? modalCanvasRef : canvasRef}
        className={styles.slideCanvas}
        style={{
          backgroundColor: inModal ? 'transparent' : `#${activeTheme.contentBg}`,
          fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
        }}
      >
        <div className={styles.contentSlideHeader}>
          <div className={styles.contentSlideTitleWrapper}>
            <h3
              className={styles.contentSlideTitle}
              style={{
                color: `#${activeTheme.contentTitleColor}`,
                fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
              }}
            >
              {renderFormattedText(slide.title)}
            </h3>
            {/* Exact Accent Underline bar matching PowerPoint rect shape */}
            <div
              className={styles.slideAccentLine}
              style={{ backgroundColor: `#${activeTheme.accentColor}` }}
            />
          </div>
        </div>

        <div className={styles.contentSlideBody}>
          {effectiveLogoUrl ? (
            <div className={styles.slideLogoImgContainer}>
              <img
                src={effectiveLogoUrl}
                alt={slide.logoPlaceholderText || 'Company Logo'}
                className={styles.slideLogoImg}
                onError={() => {
                  setFailedLogoUrls(prev => new Set(prev).add(effectiveLogoUrl));
                }}
              />
            </div>
          ) : shouldShowLogoSlot && (
            <div
              className={styles.slidePlaceholderCard}
              title="Right-click 'Change Picture' in PowerPoint to insert your image or logo"
            >
              <span className={styles.slidePlaceholderText}>
                {(slide.logoPlaceholderText || 'YOUR IMAGE HERE').toUpperCase()}
              </span>
            </div>
          )}
          {(() => {
            const hasCode = !!slide.codeSnippet && slide.codeSnippet.code.trim().length > 0;
            const cleanCode = hasCode ? slide.codeSnippet!.code.trimEnd() : '';
            const badgeText = hasCode ? getSlideCodeBadge(slide.codeSnippet!.language, cleanCode) : '';
            const isDiagram = badgeText === 'DIAGRAM';
            const codeLineCount = cleanCode.split('\n').length;

            // Hero Layout: Full-width lead intro text + centered wide showcase card
            // Used when:
            // 1. There are 0 bullets (slide text is an introductory subtitle for the code/diagram)
            // 2. OR it's a tall architecture diagram (>14 lines) with sparse bullets (<=1 bullet)
            const isHeroCodeLayout = hasCode && (
              slide.bullets.length === 0 ||
              (isDiagram && codeLineCount > 14 && slide.bullets.length <= 1)
            );
            const isSplit = hasCode && !isHeroCodeLayout && (slide.bullets.length > 0 || slide.paragraphs.length > 0);

            if (isHeroCodeLayout) {
              return (
                <div className={styles.heroSlideLayout}>
                  {slide.paragraphs.length > 0 && (
                    <div className={styles.heroLeadWrapper}>
                      {slide.paragraphs.map((p, idx) => (
                        <p
                          key={`hp-${idx}`}
                          className={styles.heroLeadParagraph}
                          style={{
                            color: `#${activeTheme.bodyColor}`,
                            fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
                          }}
                        >
                          {renderFormattedText(p)}
                        </p>
                      ))}
                    </div>
                  )}

                  {slide.bullets.length > 0 && (
                    <div className={styles.heroLeadBullets}>
                      {slide.bullets.map((b, idx) => (
                        <div
                          key={`hb-${idx}`}
                          className={styles.heroBulletChip}
                          style={{
                            color: `#${activeTheme.bodyColor}`,
                          }}
                        >
                          <span
                            className={styles.bulletDot}
                            style={{ backgroundColor: `#${activeTheme.accentColor}` }}
                          />
                          <span>{renderFormattedText(b)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`${styles.heroCodeContainer} ${isDiagram ? styles.heroDiagramContainer : ''}`}>
                    <div className={styles.slideCodeHeader}>
                      <span
                        className={styles.slideCodeLang}
                        style={{ color: `#${activeTheme.accentColor}` }}
                      >
                        {badgeText}
                      </span>
                      <span className={styles.slideCodeDots}>
                        <span className={styles.slideCodeDot} style={{ background: '#EF4444' }} />
                        <span className={styles.slideCodeDot} style={{ background: '#F59E0B' }} />
                        <span className={styles.slideCodeDot} style={{ background: '#10B981' }} />
                      </span>
                    </div>
                    <pre className={`${styles.slideCodePre} ${getSlidePreClassName(slide.codeSnippet!)}`}>
                      <code>{isDiagram ? stripCommonIndentation(cleanCode) : cleanCode}</code>
                    </pre>
                  </div>
                </div>
              );
            }

            if (isSplit) {
              return (
                <div className={styles.contentSlideSplit}>
                  <div className={styles.contentSlideSplitCol}>
                    {slide.paragraphs.map((p, idx) => (
                      <p
                        key={`p-${idx}`}
                        className={styles.slideParagraph}
                        style={{
                          color: `#${activeTheme.bodyColor}`,
                          fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
                        }}
                      >
                        {renderFormattedText(p)}
                      </p>
                    ))}

                    {slide.bullets.length > 0 && (
                      <ul className={styles.slideBulletList}>
                        {slide.bullets.map((b, idx) => (
                          <li
                            key={`b-${idx}`}
                            className={styles.slideBulletItem}
                            style={{
                              color: `#${activeTheme.bodyColor}`,
                              fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
                            }}
                          >
                            <span
                              className={styles.bulletDot}
                              style={{ backgroundColor: `#${activeTheme.accentColor}` }}
                            />
                            <span>{renderFormattedText(b)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Code Card Column */}
                  <div className={styles.slideCodeContainer}>
                    <div className={styles.slideCodeHeader}>
                      <span
                        className={styles.slideCodeLang}
                        style={{ color: `#${activeTheme.accentColor}` }}
                      >
                        {badgeText}
                      </span>
                      <span className={styles.slideCodeDots}>
                        <span className={styles.slideCodeDot} style={{ background: '#EF4444' }} />
                        <span className={styles.slideCodeDot} style={{ background: '#F59E0B' }} />
                        <span className={styles.slideCodeDot} style={{ background: '#10B981' }} />
                      </span>
                    </div>
                    <pre className={`${styles.slideCodePre} ${getSlidePreClassName(slide.codeSnippet!)}`}>
                      <code>{isDiagram ? stripCommonIndentation(cleanCode) : cleanCode}</code>
                    </pre>
                  </div>
                </div>
              );
            }

            return (
              <>
                {slide.paragraphs.map((p, idx) => (
                  <p
                    key={`p-${idx}`}
                    className={styles.slideParagraph}
                    style={{
                      color: `#${activeTheme.bodyColor}`,
                      fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
                    }}
                  >
                    {renderFormattedText(p)}
                  </p>
                ))}

                {slide.bullets.length > 0 && (
                  <ul className={styles.slideBulletList}>
                    {slide.bullets.map((b, idx) => (
                      <li
                        key={`b-${idx}`}
                        className={styles.slideBulletItem}
                        style={{
                          color: `#${activeTheme.bodyColor}`,
                          fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
                        }}
                      >
                        <span
                          className={styles.bulletDot}
                          style={{ backgroundColor: `#${activeTheme.accentColor}` }}
                        />
                        <span>{renderFormattedText(b)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}

          {slideTableData && (
            <div className={styles.slideTableWrapper}>
              <table className={styles.slideTable}>
                <thead>
                  <tr style={{ backgroundColor: activeTheme.isLight ? '#E2E8F0' : '#1E293B' }}>
                    {slideTableData.headers.map((h, i) => (
                      <th
                        key={i}
                        style={{ color: activeTheme.isLight ? '#0F172A' : '#FFFFFF' }}
                      >
                        {renderFormattedText(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slideTableData.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        backgroundColor:
                          rIdx % 2 === 1
                            ? activeTheme.isLight ? '#F1F5F9' : '#161E2E'
                            : activeTheme.isLight ? '#F8FAFC' : '#0F172A',
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            color: `#${activeTheme.bodyColor}`,
                            fontFamily: activeTheme.fontFace || 'Arial, sans-serif',
                          }}
                        >
                          {renderFormattedText(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Slide Number in bottom right (Exact 1:1 match to PowerPoint export) */}
        <div
          className={styles.slideNumberBottomRight}
          style={{ color: activeTheme.isLight ? '#94A3B8' : '#64748B' }}
        >
          {slide.slideNumber} of {total}
        </div>
      </div>
    );
  };

  const renderSlideShowDropdown = (
    isOpen: boolean,
    onToggle: () => void,
    ref: React.RefObject<HTMLDivElement | null>,
    placement: 'down' | 'up' = 'down'
  ) => (
    <div className={styles.slideShowPickerWrapper} ref={ref}>
      <div className={styles.slideShowSplitBtn}>
        <button
          type="button"
          className={styles.slideShowMainBtn}
          onClick={() => startSlideShow(true)}
          title="Slide Show (F5) - Start from beginning"
          aria-label="Start Slide Show from beginning"
        >
          <SlideShowIcon size={15} />
          <span className={styles.slideShowBtnText}>Slide Show</span>
        </button>
        <button
          type="button"
          className={`${styles.slideShowArrowBtn} ${isOpen ? styles.active : ''}`}
          onClick={onToggle}
          title="Slide Show Options"
          aria-label="Slide Show Options"
        >
          <ChevronDown size={12} />
        </button>
      </div>

      {isOpen && (
        <div className={`${styles.slideShowDropdown} ${placement === 'up' ? styles.slideShowDropdownUp : ''}`}>
          <button
            type="button"
            className={styles.slideShowOption}
            onClick={() => startSlideShow(true)}
          >
            <div className={styles.slideShowOptionIcon}>
              <SlideShowIcon size={18} />
            </div>
            <div className={styles.slideShowOptionText}>
              <div className={styles.slideShowOptionHeader}>
                <span className={styles.slideShowOptionTitle}>Start From Beginning</span>
                <span className={styles.shortcutKbd}>F5</span>
              </div>
              <span className={styles.slideShowOptionDesc}>Start the show from the first slide.</span>
            </div>
          </button>

          <button
            type="button"
            className={styles.slideShowOption}
            onClick={() => startSlideShow(false)}
          >
            <div className={styles.slideShowOptionIcon}>
              <Play size={16} />
            </div>
            <div className={styles.slideShowOptionText}>
              <div className={styles.slideShowOptionHeader}>
                <span className={styles.slideShowOptionTitle}>From Current Slide</span>
                <span className={styles.shortcutKbd}>Shift+F5</span>
              </div>
              <span className={styles.slideShowOptionDesc}>Start the show from slide {currentIndex + 1}.</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );

  const renderThemeDropdown = (
    isOpen: boolean,
    onToggle: () => void,
    ref: React.RefObject<HTMLDivElement | null>,
    placement: 'down' | 'up' = 'down'
  ) => (
    <div className={styles.themePickerWrapper} ref={ref}>
      <button
        type="button"
        className={`${styles.headerActionBtn} ${isOpen ? styles.active : ''}`}
        onClick={onToggle}
        title="Change slide presentation theme & colors"
        aria-label="Change presentation theme"
      >
        <Palette size={13} />
        <span className={styles.themeBtnText}>Theme</span>
      </button>

      {isOpen && (
        <div className={`${styles.themeDropdown} ${placement === 'up' ? styles.themeDropdownUp : ''}`}>
          <div className={styles.themeDropdownTitle}>Select Slide Theme</div>
          {Object.values(PRESENTATION_THEMES).map((thm) => (
            <button
              key={thm.id}
              type="button"
              className={`${styles.themeOption} ${activeTheme.id === thm.id ? styles.activeThemeOption : ''}`}
              onClick={() => {
                setActiveTheme(thm);
                setShowThemeMenu(false);
                setShowModalThemeMenu(false);
                setShowModalMobileThemeMenu(false);
              }}
            >
              <div className={styles.themeSwatchPreview}>
                <span className={styles.swatchBg} style={{ backgroundColor: `#${thm.coverBg}` }} />
                <span className={styles.swatchAccent} style={{ backgroundColor: `#${thm.accentColor}` }} />
              </div>
              <span className={styles.themeName}>{thm.name}</span>
              {activeTheme.id === thm.id && <Check size={14} className={styles.themeCheck} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!slideDeck || total === 0) return null;

  return (
    <>
      <div
        className={styles.slideDeckContainer}
        role="region"
        aria-label="Presentation Slide Carousel"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') handlePrevWithAnim();
          if (e.key === 'ArrowRight') handleNextWithAnim();
        }}
      >
        {/* ─── Header Bar ────────────────────────────────────────── */}
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <div className={styles.deckIconWrapper}>
              <Presentation size={15} />
            </div>
            <span className={styles.deckTitle} title={slideDeck.title}>
              {slideDeck.title}
            </span>
            <span className={`${styles.deckBadge} ${styles.deckBadgeDesktop}`}>{total} Slides</span>
            <span className={`${styles.deckBadge} ${styles.deckBadgeMobile}`}>{currentIndex + 1}/{total}</span>
          </div>

          <div className={styles.headerRight}>
            {/* PowerPoint Slide Show Button (Chat: 1-Click Start From Beginning) */}
            <button
              type="button"
              className={styles.chatSlideShowBtn}
              onClick={() => startSlideShow(true)}
              title="Slide Show (F5) - Start from beginning"
              aria-label="Start Slide Show from beginning"
            >
              <SlideShowIcon size={15} />
              <span className={styles.slideShowBtnText}>Slide Show</span>
            </button>

            {/* Theme Picker Dropdown */}
            {renderThemeDropdown(showThemeMenu, () => setShowThemeMenu(prev => !prev), themeMenuRef)}

            {/* Quick 1-Click Download (.pptx) */}
            <button
              type="button"
              className={styles.quickDownloadBtn}
              onClick={() => onDownload('pptx', activeTheme)}
              disabled={isExporting}
              title={`Download presentation as PowerPoint (.pptx) in ${activeTheme.name}`}
            >
              {isExporting ? <Loader2 size={13} className={styles.spinner} /> : <Download size={13} />}
              <span className={styles.downloadBtnDesktopText}>Download .pptx</span>
              <span className={styles.downloadBtnMobileText}>.pptx</span>
            </button>

            {/* Fullscreen Presenter Mode */}
            <button
              type="button"
              className={styles.headerIconBtn}
              onClick={() => setIsFullscreen(true)}
              title="Presenter View (Fullscreen)"
              aria-label="Presenter View"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* ─── 16:9 Slide Viewport (Touch Swipe Supported) ─────────── */}
        <div
          className={`${styles.slideViewport} ${
            slideDirection === 'next'
              ? styles.slideEnteringFromRight
              : slideDirection === 'prev'
              ? styles.slideEnteringFromLeft
              : ''
          }`}
          style={{
            backgroundColor: `#${currentSlide.isTitleSlide ? activeTheme.coverBg : activeTheme.contentBg}`,
            transform: dragOffset !== 0 ? `translateX(${dragOffset}px)` : undefined,
            transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {renderSlideContent(currentSlide, false)}
        </div>

        {/* ─── Carousel Navigation Footer ──────────────────── */}
        <div className={styles.footerBar}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={handlePrevWithAnim}
            disabled={currentIndex === 0}
            aria-label="Previous Slide"
          >
            <ChevronLeft size={16} />
            <span>Prev</span>
          </button>

          <div className={styles.centerControls}>
            <span className={styles.slideCounterText}>
              Slide {currentIndex + 1} of {total}
            </span>
            <div className={styles.progressDots}>
              {slideDeck.slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.dot} ${idx === currentIndex ? styles.activeDot : ''}`}
                  onClick={() => {
                    if (idx > currentIndex) setSlideDirection('next');
                    else if (idx < currentIndex) setSlideDirection('prev');
                    setCurrentIndex(idx);
                  }}
                  aria-label={`Jump to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className={styles.navBtn}
            onClick={handleNextWithAnim}
            disabled={currentIndex === total - 1}
            aria-label="Next Slide"
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ─── Presenter Modal (Fullscreen Portal) ────────────────────── */}
      {isFullscreen &&
        createPortal(
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Fullscreen Presenter View">
            {/* 3-Zone Header: Left (Title), Center (Slide Nav Pill), Right (Actions) */}
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <div className={styles.deckIconWrapper}>
                  <Presentation size={15} />
                </div>
                <span className={styles.modalDeckTitle} title={slideDeck.title}>
                  {slideDeck.title}
                </span>
                <span className={styles.deckBadge}>
                  {total} Slides
                </span>
              </div>

              <div className={styles.modalHeaderCenter}>
                <div className={styles.slideNavPill}>
                  <button
                    type="button"
                    className={styles.slideNavPillBtn}
                    onClick={handlePrevWithAnim}
                    disabled={currentIndex === 0}
                    title="Previous Slide (←)"
                    aria-label="Previous Slide"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className={styles.slideNavPillText}>
                    Slide {currentIndex + 1} of {total}
                  </span>
                  <button
                    type="button"
                    className={styles.slideNavPillBtn}
                    onClick={handleNextWithAnim}
                    disabled={currentIndex === total - 1}
                    title="Next Slide (→)"
                    aria-label="Next Slide"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className={styles.modalHeaderRight}>
                {/* PowerPoint Slide Show Launcher */}
                {renderSlideShowDropdown(
                  showModalSlideShowMenu,
                  () => setShowModalSlideShowMenu(prev => !prev),
                  modalSlideShowMenuRef,
                  'down'
                )}

                {/* Theme Selector Button & Menu in Fullscreen (Desktop only, mobile moves to footer) */}
                <div className={styles.desktopThemePicker}>
                  {renderThemeDropdown(
                    showModalThemeMenu,
                    () => setShowModalThemeMenu(prev => !prev),
                    modalThemeMenuRef,
                    'down'
                  )}
                </div>

                {/* Quick Download in Fullscreen */}
                <button
                  type="button"
                  className={styles.quickDownloadBtn}
                  onClick={() => onDownload('pptx', activeTheme)}
                  disabled={isExporting}
                  title={`Download presentation as PowerPoint (.pptx) in ${activeTheme.name}`}
                >
                  {isExporting ? <Loader2 size={13} className={styles.spinner} /> : <Download size={13} />}
                  <span className={styles.downloadBtnDesktopText}>Download .pptx</span>
                  <span className={styles.downloadBtnMobileText}>.pptx</span>
                </button>

                <button
                  type="button"
                  className={styles.headerIconBtn}
                  onClick={() => setIsFullscreen(false)}
                  title="Exit Fullscreen (Esc)"
                  aria-label="Exit Fullscreen"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              className={styles.modalContentWrapper}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <button
                type="button"
                className={`${styles.modalSideNavBtn} ${styles.modalPrevBtn}`}
                onClick={handlePrevWithAnim}
                disabled={currentIndex === 0}
                aria-label="Previous slide"
              >
                <ChevronLeft size={28} />
              </button>

              <div
                className={`${styles.modalSlideCanvas} ${
                  slideDirection === 'next'
                    ? styles.slideEnteringFromRight
                    : slideDirection === 'prev'
                    ? styles.slideEnteringFromLeft
                    : ''
                }`}
                style={{
                  backgroundColor: `#${currentSlide.isTitleSlide ? activeTheme.coverBg : activeTheme.contentBg}`,
                  transform: dragOffset !== 0 ? `translateX(${dragOffset}px)` : undefined,
                  transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {renderSlideContent(currentSlide, true)}
              </div>

              <button
                type="button"
                className={`${styles.modalSideNavBtn} ${styles.modalNextBtn}`}
                onClick={handleNextWithAnim}
                disabled={currentIndex === total - 1}
                aria-label="Next slide"
              >
                <ChevronRight size={28} />
              </button>
            </div>

            <div className={styles.modalFooter}>
              {/* Desktop keyboard hint */}
              <div className={styles.modalDesktopHelp}>
                Press <kbd style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>←</kbd>{' '}
                <kbd style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>→</kbd> or swipe to navigate,{' '}
                <kbd style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>F5</kbd> for Slide Show,{' '}
                <kbd style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>Esc</kbd> to exit
              </div>

              {/* Mobile theme button (Bottom-Left) */}
              <div className={styles.modalMobileThemeWrapper}>
                {renderThemeDropdown(
                  showModalMobileThemeMenu,
                  () => setShowModalMobileThemeMenu(prev => !prev),
                  modalMobileThemeMenuRef,
                  'up'
                )}
              </div>

              {/* Centered navigation dots */}
              <div className={styles.modalCenterDots}>
                <div className={styles.progressDots}>
                  {slideDeck.slides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`${styles.dot} ${idx === currentIndex ? styles.activeDot : ''}`}
                      onClick={() => {
                        if (idx > currentIndex) setSlideDirection('next');
                        else if (idx < currentIndex) setSlideDirection('prev');
                        setCurrentIndex(idx);
                      }}
                      aria-label={`Jump to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* Exit Fullscreen (Right) */}
              <div className={styles.modalFooterRight}>
                <button
                  type="button"
                  className={styles.navBtn}
                  onClick={() => setIsFullscreen(false)}
                  aria-label="Exit Fullscreen"
                >
                  <Minimize2 size={14} />
                  <span>Exit Fullscreen</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ─── PowerPoint Slide Show Overlay (Cinema Mode) ─────────── */}
      {isSlideShow &&
        createPortal(
          <div
            className={styles.slideShowOverlay}
            onMouseMove={handleSlideShowMouseMove}
            role="dialog"
            aria-modal="true"
            aria-label="PowerPoint Slide Show Mode"
          >
            {/* Auto-play progress bar */}
            {isAutoPlaying && (
              <div className={styles.slideShowProgressBarContainer}>
                <div
                  className={styles.slideShowProgressBarFill}
                  style={{ width: `${autoPlayProgress}%` }}
                />
              </div>
            )}

            {/* Clickable 16:9 Slide Viewport */}
            <div
              className={styles.slideShowViewport}
              onClick={handleSlideShowClick}
            >
              <div
                ref={slideShowCanvasRef}
                className={`${styles.slideShowCanvas} ${
                  slideDirection === 'next'
                    ? styles.slideEnteringFromRight
                    : slideDirection === 'prev'
                    ? styles.slideEnteringFromLeft
                    : ''
                }`}
                style={{
                  backgroundColor: `#${currentSlide.isTitleSlide ? activeTheme.coverBg : activeTheme.contentBg}`,
                }}
              >
                {renderSlideContent(currentSlide, true)}
              </div>
            </div>

            {/* Auto-Hiding Presenter Toolbar */}
            <div
              className={`${styles.slideShowFloatingToolbar} ${
                showSlideShowControls ? styles.visible : styles.hidden
              }`}
            >
              <button
                type="button"
                className={styles.floatingToolBtn}
                onClick={handlePrevWithAnim}
                disabled={currentIndex === 0}
                title="Previous slide (← / Backspace)"
                aria-label="Previous slide"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                className={`${styles.floatingToolBtn} ${isAutoPlaying ? styles.activeAutoPlay : ''}`}
                onClick={() => {
                  if (!isAutoPlaying && currentIndex >= total - 1) {
                    setCurrentIndex(0);
                  }
                  setIsAutoPlaying(prev => !prev);
                }}
                title={isAutoPlaying ? "Pause Auto-play" : "Play / Auto-advance (5s)"}
                aria-label={isAutoPlaying ? "Pause Auto-play" : "Play / Auto-advance"}
              >
                {isAutoPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <button
                type="button"
                className={styles.floatingToolBtn}
                onClick={handleNextWithAnim}
                disabled={currentIndex === total - 1}
                title="Next slide (→ / Space / Enter)"
                aria-label="Next slide"
              >
                <ChevronRight size={18} />
              </button>

              <span className={styles.floatingSlideCounter}>
                {currentIndex + 1} / {total}
              </span>

              {renderThemeDropdown(
                showSlideShowThemeMenu,
                () => setShowSlideShowThemeMenu(prev => !prev),
                slideShowThemeMenuRef,
                'up'
              )}

              <button
                type="button"
                className={styles.floatingEndShowBtn}
                onClick={exitSlideShow}
                title="End Show (Esc)"
              >
                End Show
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

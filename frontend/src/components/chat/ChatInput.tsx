import React, { useRef, useState } from 'react';
import { Plus, Mic, ArrowUp, X, FileText, Table, Music, Video, Image as ImageIcon, AudioLines, Check, Trash2, Loader2, RotateCcw, ChevronLeft, ChevronRight, Brain, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ChatInput.module.css';
import { ImagePreviewModal } from './ImagePreviewModal';
import { useModelStore, type ReasoningEffort } from '../../store/model.store';
import { useAuthStore } from '../../store/auth.store';
import { uploadFile } from '../../api/storage';
import { aiService } from '../../lib/api';
import { useUploadAgreementStore } from '../../store/upload-agreement.store';
import { WaveformVoiceIcon } from '../icons/WaveformVoiceIcon';

export interface Attachment {
  id: string;
  file: File;
  preview: string;
  url?: string;
  type: 'image' | 'document' | 'audio' | 'video';
  isUploading?: boolean;
  progress?: number;
  hasFailed?: boolean;
  errorMessage?: string;
  extractedText?: string;
}

interface ChatInputProps {
  onSend: (text: string) => void;
  isGenerating?: boolean;
  hasMessages: boolean;
  onVoiceLaunch?: () => void;
  onStop?: () => void;
  attachments: Attachment[];
  onAttachmentsChange: React.Dispatch<React.SetStateAction<Attachment[]>>;
  disabled?: boolean;
  placeholderText?: string;
  onAuthRequired?: () => void;
}

const GOOGLE_THINKING_OPTIONS: { value: ReasoningEffort; label: string; desc: string; isDefault?: boolean }[] = [
  { value: 'minimal', label: 'Minimal', desc: 'Fast, minimal thinking tokens', isDefault: true },
  { value: 'low', label: 'Low', desc: 'Light thinking for simple logic' },
  { value: 'medium', label: 'Medium', desc: 'Balanced thinking depth' },
  { value: 'high', label: 'High', desc: 'Maximum depth for complex problems' },
];

const GROQ_REASONING_OPTIONS: { value: ReasoningEffort; label: string; desc: string; isDefault?: boolean }[] = [
  { value: 'default', label: 'Default', desc: 'Model default reasoning effort', isDefault: true },
  { value: 'none', label: 'None', desc: 'Disable reasoning completely' },
  { value: 'low', label: 'Low', desc: 'Light reasoning for simple logic' },
  { value: 'medium', label: 'Medium', desc: 'Balanced reasoning depth' },
  { value: 'high', label: 'High', desc: 'Maximum depth for complex problems' },
];

const ImageThumb: React.FC<{ src: string; onClick: () => void }> = ({ src, onClick }) => {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <ImageIcon size={18} />;
  return (
    <img
      src={src}
      alt="thumb"
      className={styles.imageThumb}
      onClick={onClick}
      onError={() => setHasError(true)}
      draggable={false}
    />
  );
};

const VoiceWaveformTrace: React.FC<{ stream: MediaStream | null; isPaused: boolean }> = ({ stream, isPaused }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>([]);
  const animRef = useRef<number | null>(null);

  React.useEffect(() => {
    historyRef.current = [];
    if (!stream || !canvasRef.current) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextClass();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0; //0.75
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch (err) {
      console.error('AudioContext setup error:', err);
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    let lastTime = performance.now();

    const render = (time: number) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const width = rect?.width || 300;
      const height = rect?.height || 32;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const barWidth = 4.5;
      const gap = 5;
      const maxBars = Math.floor(canvas.width / (barWidth + gap));

      if (!isPaused && analyser) {
        if (time - lastTime > 55) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          const sampleBins = Math.floor(dataArray.length * 0.7);
          for (let i = 0; i < sampleBins; i++) {
            sum += dataArray[i];
          }
          const avg = sum / (sampleBins || 1);
          const rawNorm = Math.min(1, Math.max(0.1, avg / 70));
          const norm = Math.min(1, Math.pow(rawNorm, 0.75) * 1.25);

          historyRef.current.push(norm);
          if (historyRef.current.length > maxBars) {
            historyRef.current.shift();
          }
          lastTime = time;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const history = historyRef.current;
      const totalBars = history.length;
      const centerY = canvas.height / 2;

      for (let i = 0; i < totalBars; i++) {
        const val = history[i];
        const barHeight = Math.max(6, val * canvas.height);
        const x = canvas.width - (totalBars - i) * (barWidth + gap);
        const y = centerY - barHeight / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isPaused) {
          gradient.addColorStop(0, '#475569');
          gradient.addColorStop(1, '#334155');
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.4;
          ctx.shadowBlur = 0;
        } else {
          gradient.addColorStop(0, '#00f2fe');
          gradient.addColorStop(0.5, '#3b82f6');
          gradient.addColorStop(1, '#1d4ed8');
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.85 + val * 0.15;
          ctx.shadowColor = '#3b82f6';
          ctx.shadowBlur = val > 0.25 ? 10 : 3;
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => { });
      }
    };
  }, [stream, isPaused]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

const AttachmentScrollableRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const checkScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    const handleScroll = () => {
      checkScroll();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      checkScroll();
    });
    observer.observe(el);

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
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 60);
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
    if (e.button !== 0) return; // Only primary mouse button

    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea')) {
      return;
    }

    isDownRef.current = true;
    startXRef.current = e.pageX;
    startScrollLeftRef.current = el.scrollLeft;
    hasDraggedRef.current = false;
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

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
      className={`${styles.attachmentsWrapper} ${isOverflowing ? styles.isGrabbable : ''} ${isDragging ? styles.isDragging : ''}`}
      onMouseEnter={() => {
        setIsHovered(true);
        checkScroll();
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`${styles.attachmentsNavEdge} ${styles.attachmentsNavEdgeLeft} ${showLeft ? styles.attachmentsNavEdgeVisible : ''}`}>
        <button
          type="button"
          className={styles.attachmentsNavArrowBtn}
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(-240);
          }}
          title="Scroll left"
          aria-label="Scroll left"
          tabIndex={showLeft ? 0 : -1}
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div
        ref={containerRef}
        className={styles.attachmentsList}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>

      <div className={`${styles.attachmentsNavEdge} ${styles.attachmentsNavEdgeRight} ${showRight ? styles.attachmentsNavEdgeVisible : ''}`}>
        <button
          type="button"
          className={styles.attachmentsNavArrowBtn}
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(240);
          }}
          title="Scroll right"
          aria-label="Scroll right"
          tabIndex={showRight ? 0 : -1}
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  isGenerating = false,
  hasMessages,
  onVoiceLaunch,
  attachments,
  onAttachmentsChange,
  disabled = false,
  placeholderText,
  onAuthRequired
}) => {
  const [internalValue, setInternalValue] = React.useState('');
  const [isVoiceHovered, setIsVoiceHovered] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = React.useState<{ url: string; name: string } | null>(null);
  const { selectedModel, setVisionRequired, reasoningEffort, setReasoningEffort } = useModelStore();
  const { user } = useAuthStore();

  const provider = selectedModel?.provider?.toLowerCase();
  const isGoogle = provider === 'google';
  const isGroq = provider === 'groq';
  const isNvidia = provider === 'nvidia';
  const showReasoningSelector = (isGoogle || isGroq) && !isNvidia;

  const reasoningOptions = isGoogle ? GOOGLE_THINKING_OPTIONS : GROQ_REASONING_OPTIONS;
  const menuTitle = isGoogle ? 'Thinking Level' : 'Reasoning Level';

  const effectiveEffort: ReasoningEffort = reasoningOptions.some((o) => o.value === reasoningEffort)
    ? reasoningEffort
    : (isGoogle ? 'minimal' : 'default');

  const activeOption = reasoningOptions.find((o) => o.value === effectiveEffort) || reasoningOptions[0];

  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = React.useState(false);
  const voiceMenuRef = useRef<HTMLDivElement>(null);

  const [isReasoningMenuOpen, setIsReasoningMenuOpen] = React.useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const reasoningTriggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownSideOffset, setDropdownSideOffset] = React.useState(12);

  const updateDropdownOffset = React.useCallback(() => {
    if (reasoningTriggerRef.current && inputContainerRef.current) {
      const triggerRect = reasoningTriggerRef.current.getBoundingClientRect();
      const containerRect = inputContainerRef.current.getBoundingClientRect();
      const diff = triggerRect.top - containerRect.top;
      // Float cleanly 10px above the top border of the input container
      const offset = Math.max(8, Math.round(diff + 10));
      setDropdownSideOffset(offset);
    }
  }, []);

  React.useEffect(() => {
    if (isReasoningMenuOpen) {
      updateDropdownOffset();
      window.addEventListener('resize', updateDropdownOffset);
      return () => window.removeEventListener('resize', updateDropdownOffset);
    }
  }, [isReasoningMenuOpen, updateDropdownOffset]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(event.target as Node)) {
        setIsVoiceMenuOpen(false);
      }
    };
    if (isVoiceMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVoiceMenuOpen]);

  const handleVoiceModeClick = () => {
    setIsVoiceMenuOpen(false);
    onVoiceLaunch?.();
  };

  // Dictate Mode States
  const [isDictating, setIsDictating] = useState(false);
  const [dictateState, setDictateState] = useState<'recording' | 'processing'>('recording');
  const [dictateTimer, setDictateTimer] = useState(0);
  const [progressiveText, setProgressiveText] = useState('Processing...');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const progressiveIntervalRef = useRef<any>(null);
  const isCancelledRef = useRef<boolean>(false);
  const sttAbortControllerRef = useRef<AbortController | null>(null);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stopMediaStream = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (progressiveIntervalRef.current) clearInterval(progressiveIntervalRef.current);
    if (sttAbortControllerRef.current) {
      sttAbortControllerRef.current.abort();
      sttAbortControllerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  React.useEffect(() => {
    return () => {
      stopMediaStream();
    };
  }, []);

  const handleCancelDictate = () => {
    isCancelledRef.current = true;
    if (sttAbortControllerRef.current) {
      sttAbortControllerRef.current.abort();
      sttAbortControllerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopMediaStream();
    setIsDictating(false);
    setDictateState('recording');
    setDictateTimer(0);
    audioChunksRef.current = [];
  };

  const processDictation = () => {
    if (!mediaRecorderRef.current) return;

    isCancelledRef.current = false;
    sttAbortControllerRef.current = new AbortController();
    setDictateState('processing');
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Text appearing sequence & speed control (3000ms delay per step)
    const steps = ['Processing...', 'Transcribing...', 'Just There...'];
    let stepIdx = 0;
    setProgressiveText(steps[0]);
    progressiveIntervalRef.current = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      setProgressiveText(steps[stepIdx]);
    }, 3000);

    const recorder = mediaRecorderRef.current;

    const onStopHandler = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm';
        const file = new File([audioBlob], `dictation.${extension}`, { type: mimeType });

        const formData = new FormData();
        formData.append('file', file);

        const response = await aiService.stt(formData, {
          signal: sttAbortControllerRef.current?.signal,
        });

        if (isCancelledRef.current) return;

        const rawText = typeof response.text === 'object' ? response.text?.text : response.text;
        const fallbackText = typeof response.data === 'object' ? response.data?.text : response.data;
        const transcribedText = (typeof rawText === 'string' ? rawText : typeof fallbackText === 'string' ? fallbackText : '').trim();

        if (transcribedText) {
          setInternalValue((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
          if (response.creditsCharged > 0) {
            toast.success('Transcription charged 0.2 credits');
          }
        } else {
          toast.error('No speech detected or transcription failed.');
        }
      } catch (error: any) {
        if (isCancelledRef.current || error.name === 'CanceledError' || error.name === 'AbortError') return;
        console.error('Dictate STT Error:', error);
        const msg = error.response?.data?.message || error.message || 'Failed to transcribe audio.';
        toast.error(msg);
      } finally {
        if (isCancelledRef.current) return;
        stopMediaStream();
        setIsDictating(false);
        setDictateState('recording');
        setDictateTimer(0);
        audioChunksRef.current = [];
      }
    };

    if (recorder.state !== 'inactive') {
      recorder.onstop = onStopHandler;
      recorder.stop();
    } else {
      onStopHandler();
    }
  };

  const handleAcceptDictate = () => {
    if (dictateState === 'processing') return;
    processDictation();
  };

  const handleSpeakClick = async () => {
    setIsVoiceMenuOpen(false);
    if (!user) {
      onAuthRequired?.();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/wav';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(200);
      setIsDictating(true);
      setDictateState('recording');
      setDictateTimer(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setDictateTimer((prev) => {
          if (prev >= 299) {
            clearInterval(timerIntervalRef.current);
            setTimeout(() => {
              processDictation();
            }, 50);
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      toast.error('Could not access microphone. Please check permissions.');
    }
  };

  React.useEffect(() => {
    // Automatically sync vision requirement with current attachments
    const requiresVision = attachments.some(a => a.type === 'image' || a.type === 'video');
    setVisionRequired(requiresVision);
  }, [attachments, setVisionRequired]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMultiLine, setIsMultiLine] = useState(false);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to 0px temporarily to get exact scrollHeight without stale height caching
      textarea.style.height = '0px';
      const scrollHeight = textarea.scrollHeight;

      const val = textarea.value;
      const hasNewline = val.includes('\n');
      const isMulti = hasNewline || scrollHeight > 46;

      if (val.trim().length === 0) {
        setIsMultiLine(false);
      } else if (isMulti) {
        setIsMultiLine(true);
      } else if (!hasNewline && scrollHeight <= 42) {
        setIsMultiLine(false);
      }

      const minH = isMulti ? 42 : 36;
      const targetHeight = Math.min(Math.max(scrollHeight, minH), 200);
      textarea.style.height = `${targetHeight}px`;
      textarea.style.overflowY = scrollHeight > 200 ? 'auto' : 'hidden';
    }
  };

  React.useEffect(() => {
    adjustHeight();
  }, [internalValue]);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      adjustHeight();
    });
    return () => cancelAnimationFrame(raf);
  }, [isMultiLine]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isGenerating) {
        onStop?.();
      } else {
        handleAction();
      }
    }
  };

  const handleAction = () => {
    if (disabled) return;
    if (isGenerating) {
      onStop?.();
    } else {
      // Prevent sending if any file is still actively uploading
      const isUploading = attachments.some(a => a.isUploading);
      if (isUploading) return;

      const validAttachments = attachments.filter(a => !a.hasFailed && (a.url || a.extractedText));
      if (internalValue.trim() || validAttachments.length > 0) {
        onSend(internalValue);
        setInternalValue(''); // Clear local state after sending
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (attachments.length + files.length > 10) {
      toast.error('You can only upload up to 10 files per prompt.', {
        style: {
          background: '#ff4757',
          color: '#fff',
          fontWeight: 'bold',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#ff4757',
        },
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    // Block anonymous users from uploading files
    if (!user) {
      onAuthRequired?.();
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    // Require user agreement to the content upload policy
    const agreed = await useUploadAgreementStore.getState().checkAgreement();
    if (!agreed) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const tier = user.plan_type || 'free';
    const MAX_SIZE_MB = tier === 'pro' ? 250 : tier === 'starter' ? 50 : 10;
    const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

    const validFiles = files.filter(file => file.size <= MAX_SIZE);

    if (validFiles.length < files.length) {
      toast.error(`File Size Limit Exceeded! Your plan (${tier}) allows up to ${MAX_SIZE_MB}MB per file.`, {
        style: {
          background: '#ff4757',
          color: '#fff',
          fontWeight: 'bold',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#ff4757',
        },
      });
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const newAttachments: Attachment[] = await Promise.all(validFiles.map(async file => {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/');
      let extractedText = '';

      if (!isImage && !isAudio && !isVideo) {
        try {
          const textFiles = ['txt', 'md', 'js', 'ts', 'tsx', 'json', 'css', 'html', 'py', 'c', 'cpp', 'rs', 'go', 'sh', 'yaml', 'yml', 'sql', 'xml', 'log'];
          const extension = file.name.split('.').pop()?.toLowerCase();

          if (textFiles.includes(extension || '')) {
            extractedText = await file.text();
          } else if (extension === 'ipynb') {
            const content = await file.text();
            const data = JSON.parse(content);
            if (data.cells) {
              extractedText = data.cells
                .filter((c: any) => c.cell_type === 'markdown' || c.cell_type === 'code')
                .map((c: any) => `\n--- ${c.cell_type} ---\n${Array.isArray(c.source) ? c.source.join('') : c.source}`)
                .join('\n');
            }
          } else if (extension === 'pdf') {
            try {
              const pdfjs = await import('pdfjs-dist');
              pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
              let fullText = '';

              for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n';
              }
              extractedText = fullText;
            } catch (pdfError) {
              console.error('PDF extraction failed:', pdfError);
            }
          } else if (['docx', 'doc', 'odt', 'rtf'].includes(extension || '')) {
            try {
              const mammoth = await import('mammoth');
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer });
              extractedText = result.value;
            } catch (err) {
              console.error('Doc extraction failed:', err);
            }
          } else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'tab', 'prn'].includes(extension || '')) {
            try {
              const XLSX = await import('xlsx');
              const arrayBuffer = await file.arrayBuffer();
              const workbook = XLSX.read(arrayBuffer, {
                type: 'array',
                cellDates: true,
                cellText: true
              });
              let excelText = '';
              workbook.SheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName];
                if (worksheet) {
                  const sheetCsv = XLSX.utils.sheet_to_csv(worksheet, {
                    skipHidden: true,
                    blankrows: false
                  });
                  if (sheetCsv.trim()) {
                    const isMultiSheet = workbook.SheetNames.length > 1 || !['Sheet1', 'sheet1', file.name].includes(sheetName);
                    if (isMultiSheet) {
                      excelText += `\n--- SHEET ${index + 1}: ${sheetName} ---\n`;
                    }
                    excelText += sheetCsv;
                    if (isMultiSheet) {
                      excelText += `\n--- END OF SHEET ${index + 1} ---\n`;
                    }
                  }
                }
              });
              extractedText = excelText;
            } catch (err) {
              console.error('Spreadsheet extraction failed:', err);
            }
          }

          if (extractedText.length > 50000) {
            extractedText = extractedText.slice(0, 50000) + '... [TRUNCATED]';
          }
        } catch (e) {
          console.error('Frontend extraction error:', e);
        }
      }

      let type: 'image' | 'document' | 'audio' | 'video' = 'document';
      if (isImage) type = 'image';
      else if (isAudio) type = 'audio';
      else if (isVideo) type = 'video';

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        preview: isImage ? URL.createObjectURL(file) : '',
        type,
        isUploading: true,
        progress: 0,
        hasFailed: false,
        extractedText: extractedText || undefined
      };
    }));

    const updated = [...attachments, ...newAttachments];
    onAttachmentsChange(updated);

    newAttachments.forEach((atl) => {
      handleUploadSingleAttachment(atl.id, atl.file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleUploadSingleAttachment = async (attachmentId: string, file: File) => {
    // Create an AbortController for this specific upload
    const controller = new AbortController();
    uploadAbortControllersRef.current.set(attachmentId, controller);

    onAttachmentsChange(prev =>
      prev.map(a =>
        a.id === attachmentId
          ? { ...a, isUploading: true, progress: 0, hasFailed: false, errorMessage: undefined }
          : a
      )
    );

    let currentProgress = 0;
    let targetProgress = 10;
    let isDone = false;

    // Smooth progressive update so the circle fills smoothly and visibly
    const progressTimer = setInterval(() => {
      if (isDone) return;
      if (currentProgress < targetProgress) {
        currentProgress = Math.min(targetProgress, currentProgress + Math.max(1, Math.round((targetProgress - currentProgress) * 0.3)));
        onAttachmentsChange(prev =>
          prev.map(a =>
            a.id === attachmentId && a.isUploading
              ? { ...a, progress: currentProgress }
              : a
          )
        );
      } else if (currentProgress < 95) {
        currentProgress = Math.min(95, currentProgress + 1);
        onAttachmentsChange(prev =>
          prev.map(a =>
            a.id === attachmentId && a.isUploading
              ? { ...a, progress: currentProgress }
              : a
          )
        );
      }
    }, 60);

    const startTime = Date.now();

    const result = await uploadFile(file, (percent) => {
      targetProgress = Math.max(targetProgress, Math.min(95, percent));
    }, controller.signal);

    clearInterval(progressTimer);
    isDone = true;
    uploadAbortControllersRef.current.delete(attachmentId);

    // If cancelled, silently exit — the attachment was already removed from state
    if (controller.signal.aborted || result.message === 'Upload cancelled') {
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed < 350) {
      await new Promise(r => setTimeout(r, 350 - elapsed));
    }

    if (result.success && result.url) {
      // Show full circle (100%) briefly before resolving to uploaded asset
      onAttachmentsChange(prev =>
        prev.map(a =>
          a.id === attachmentId
            ? { ...a, progress: 100 }
            : a
        )
      );
      await new Promise(r => setTimeout(r, 200));

      onAttachmentsChange(prev =>
        prev.map(a =>
          a.id === attachmentId
            ? { ...a, isUploading: false, progress: 100, url: result.url, hasFailed: false, errorMessage: undefined }
            : a
        )
      );
    } else {
      const errorReason = result.message || 'File upload failed. Please try again.';
      onAttachmentsChange(prev =>
        prev.map(a =>
          a.id === attachmentId
            ? { ...a, isUploading: false, progress: 0, hasFailed: true, errorMessage: errorReason }
            : a
        )
      );
      toast.error(`Upload failed: ${errorReason}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#1e293b',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          fontSize: '13px',
          fontWeight: '500',
        },
        iconTheme: {
          primary: '#ef4444',
          secondary: '#fff',
        },
      });
    }
  };

  const handleRetry = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const target = attachments.find(a => a.id === id);
    if (target && target.file) {
      handleUploadSingleAttachment(target.id, target.file);
    }
  };

  const removeAttachment = (idOrIndex: string | number) => {
    // Abort any in-progress upload for this attachment
    const targetId = typeof idOrIndex === 'string'
      ? idOrIndex
      : attachments[idOrIndex]?.id;

    if (targetId) {
      const controller = uploadAbortControllersRef.current.get(targetId);
      if (controller) {
        controller.abort();
        uploadAbortControllersRef.current.delete(targetId);
      }
    }

    const updated = typeof idOrIndex === 'string'
      ? attachments.filter(a => a.id !== idOrIndex)
      : attachments.filter((_, i) => i !== idOrIndex);
    onAttachmentsChange(updated);
  };

  const hasContent = internalValue.trim().length > 0 || attachments.length > 0;
  const showVoiceModeBtn = !hasMessages && !hasContent && !isGenerating;

  return (
    <div className={styles.inputWrapper}>
      {!hasMessages && <div className={styles.outerAura} />}

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        multiple
        disabled={disabled}
      />
      <input
        type="file"
        ref={imageInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileChange}
        multiple
        disabled={disabled}
      />

      <div ref={inputContainerRef} className={`${styles.inputContainer} ${disabled ? styles.disabled : ''}`}>
        {!hasMessages && <div className={styles.neonBorder} />}

        {attachments.length > 0 && (
          <AttachmentScrollableRow>
            {attachments.map((atl, idx) => {
              const percentVal = Math.round(atl.progress || 0);
              const circumference = 59.69;
              const strokeDashoffset = Math.max(0, circumference - (circumference * percentVal) / 100);

              return (
                <div
                  key={atl.id || idx}
                  className={`${styles.attachmentCard} ${atl.hasFailed ? styles.cardFailed : ''} ${atl.isUploading ? styles.cardUploading : ''}`}
                >
                  <div
                    className={`${styles.cardIcon} ${atl.isUploading ? styles.uploadingIcon : ''} ${atl.hasFailed ? styles.cardIconFailed : ''}`}
                  >
                    {atl.isUploading ? (
                      <div className={styles.progressRingWrapper} title={`Uploading: ${percentVal}%`}>
                        <svg className={styles.progressSvg} viewBox="0 0 24 24">
                          <circle
                            className={styles.progressTrack}
                            cx="12"
                            cy="12"
                            r="9.5"
                          />
                          <circle
                            className={styles.progressBar}
                            cx="12"
                            cy="12"
                            r="9.5"
                            style={{
                              strokeDasharray: circumference,
                              strokeDashoffset,
                            }}
                          />
                        </svg>
                      </div>
                    ) : atl.hasFailed ? (
                      <button
                        type="button"
                        className={styles.retryIconBtn}
                        onClick={(e) => handleRetry(atl.id, e)}
                        title={`Upload failed: ${atl.errorMessage || 'Click to retry'}`}
                      >
                        <RotateCcw size={16} className={styles.retryRotateIcon} />
                      </button>
                    ) : atl.type === 'image' ? (
                      <ImageThumb src={atl.preview} onClick={() => setPreviewImage({ url: atl.preview, name: atl.file.name })} />
                    ) : atl.type === 'audio' ? (
                      <Music size={18} />
                    ) : atl.type === 'video' ? (
                      <Video size={18} />
                    ) : ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'tab', 'prn'].includes(atl.file.name.split('.').pop()?.toLowerCase() || '') ? (
                      <Table size={18} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>

                  <div className={styles.cardInfo}>
                    <span className={styles.cardFileName} title={atl.file.name}>{atl.file.name}</span>
                    {atl.hasFailed ? (
                      <button
                        type="button"
                        className={styles.cardFailedTextBtn}
                        onClick={(e) => handleRetry(atl.id, e)}
                        title={atl.errorMessage || 'Click to retry upload'}
                      >
                        Failed • Retry
                      </button>
                    ) : atl.isUploading ? (
                      <span className={styles.cardUploadingText}>
                        {percentVal >= 98 ? 'Processing...' : `Uploading ${percentVal}%`}
                      </span>
                    ) : (
                      <span className={styles.cardFileType}>
                        {atl.file.name.split('.').pop()?.toUpperCase() || 'File'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.cardRemoveBtn}
                    onClick={() => removeAttachment(atl.id || idx)}
                    title="Remove file"
                  >
                    <div className={styles.xCircle}><X size={12} /></div>
                  </button>
                </div>
              );
            })}
          </AttachmentScrollableRow>
        )}

        <div className={`${styles.inputInner} ${isMultiLine ? styles.isMultiLine : ''}`}>
          {isDictating ? (
            <div className={styles.dictateContainer}>
              <div className={styles.dictateWaveSection}>
                <div className={styles.waveCanvasContainer}>
                  <VoiceWaveformTrace stream={mediaStreamRef.current} isPaused={dictateState === 'processing'} />
                  {dictateState === 'processing' && (
                    <div className={styles.dictateProcessingOverlay}>
                      <span className={styles.progressiveLoadingText}>
                        <AudioLines size={16} className={styles.wavePulseIcon} />
                        {progressiveText}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.dictateActions}>
                <button
                  className={`${styles.dictateBtn} ${styles.cancelDictateBtn}`}
                  onClick={handleCancelDictate}
                  title="Cancel Dictation"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  className={`${styles.dictateBtn} ${styles.acceptDictateBtn}`}
                  onClick={handleAcceptDictate}
                  title="Accept & Transcribe"
                  disabled={dictateState === 'processing'}
                >
                  {dictateState === 'processing' ? (
                    <Loader2 size={18} className={styles.spinIcon} />
                  ) : (
                    <Check size={18} />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                className={`${styles.input} ${showReasoningSelector && !isMultiLine ? styles.inputWithReasoning : ''}`}
                value={internalValue}
                onChange={(e) => setInternalValue(e.target.value)}
                onInput={adjustHeight}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText || "Ask anything"}
                disabled={disabled}
                rows={1}
              />

              <div className={styles.bottomToolbar}>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.plusBtn}`}
                  onClick={() => !disabled && fileInputRef.current?.click()}
                  disabled={disabled}
                  style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  title="Add files or images"
                  aria-label="Add files or images"
                >
                  <Plus size={22} />
                </button>

                <div className={styles.inputActions}>
                {/* Reasoning / Thinking Level Selector (Hidden for NVIDIA and unsupported models) */}
                {showReasoningSelector && (
                  <div className={styles.reasoningMenuContainer}>
                    <DropdownMenu.Root
                      open={isReasoningMenuOpen}
                      onOpenChange={(open) => {
                        if (open) {
                          updateDropdownOffset();
                        }
                        setIsReasoningMenuOpen(open);
                      }}
                    >
                      <DropdownMenu.Trigger asChild>
                        <button
                          ref={reasoningTriggerRef}
                          type="button"
                          className={`${styles.reasoningPillBtn} ${isReasoningMenuOpen ? styles.reasoningPillActive : ''}`}
                          aria-label={`${menuTitle}: ${activeOption.label}`}
                          title={`${menuTitle}: ${activeOption.label}`}
                          disabled={disabled}
                          style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        >
                          <Brain size={14} className={styles.reasoningIcon} />
                          <span className={styles.reasoningLabel}>
                            {activeOption.label}
                          </span>
                          <ChevronDown size={12} className={`${styles.reasoningChevron} ${isReasoningMenuOpen ? styles.chevronRotated : ''}`} />
                        </button>
                      </DropdownMenu.Trigger>

                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className={styles.reasoningDropdown}
                          side="top"
                          align="center"
                          sideOffset={dropdownSideOffset}
                          collisionPadding={12}
                          avoidCollisions={true}
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <div className={styles.reasoningDropdownHeader}>
                            <Brain size={13} className={styles.headerBrainIcon} />
                            <span>{menuTitle}</span>
                          </div>
                          {reasoningOptions.map((opt) => (
                            <DropdownMenu.Item
                              key={opt.value}
                              className={`${styles.reasoningOptionItem} ${effectiveEffort === opt.value ? styles.reasoningOptionActive : ''}`}
                              onSelect={() => {
                                setReasoningEffort(opt.value);
                              }}
                            >
                              <div className={styles.reasoningOptionContent}>
                                <div className={styles.reasoningOptionTitleRow}>
                                  <span className={styles.reasoningOptionTitle}>{opt.label}</span>
                                  {opt.isDefault && <span className={styles.reasoningDefaultBadge}>Default</span>}
                                </div>
                                <span className={styles.reasoningOptionDesc}>{opt.desc}</span>
                              </div>
                              {effectiveEffort === opt.value && (
                                <Check size={14} className={styles.reasoningCheck} />
                              )}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                )}

                <div className={styles.voiceMenuContainer} ref={voiceMenuRef}>
                  <button
                    className={`${styles.iconBtn} ${isVoiceMenuOpen ? styles.activeMicBtn : ''}`}
                    title={isVoiceMenuOpen ? "Close Menu" : "Voice Options"}
                    onClick={disabled ? undefined : () => setIsVoiceMenuOpen(!isVoiceMenuOpen)}
                    disabled={disabled}
                    style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    {isVoiceMenuOpen ? <X size={20} /> : <Mic size={20} />}
                  </button>

                  <AnimatePresence>
                    {isVoiceMenuOpen && (
                      <motion.div
                        className={styles.voiceDropdown}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                      >
                        <button
                          className={styles.dropdownItem}
                          onClick={handleVoiceModeClick}
                        >
                          <Mic size={16} className={styles.itemIcon} />
                          <div className={styles.itemTextContainer}>
                            <span className={styles.itemTitle}>Voice Mode</span>
                            <span className={styles.itemDesc}>Real-time voice conversation</span>
                          </div>
                        </button>
                        <button
                          className={styles.dropdownItem}
                          onClick={handleSpeakClick}
                        >
                          <AudioLines size={16} className={styles.itemIconSpeak} />
                          <div className={styles.itemTextContainer}>
                            <span className={styles.itemTitle}>Dictate mode</span>
                            <span className={styles.itemDesc}>Transcribe your Speech</span>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <AnimatePresence mode="wait">
                  {showVoiceModeBtn ? (
                    <motion.div
                      key="voice-mode-wrapper"
                      className={styles.voiceModeBtnContainer}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      onMouseEnter={() => setIsVoiceHovered(true)}
                      onMouseLeave={() => setIsVoiceHovered(false)}
                    >
                      <button
                        type="button"
                        className={styles.voiceModeBtn}
                        onClick={handleVoiceModeClick}
                        disabled={disabled}
                        aria-label="Use voice mode"
                      >
                        <WaveformVoiceIcon size={20} />
                      </button>

                      <AnimatePresence>
                        {isVoiceHovered && (
                          <motion.div
                            className={styles.voiceTooltip}
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            transition={{ duration: 0.12 }}
                          >
                            Use voice mode
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="send-action-btn"
                      type="button"
                      className={`${styles.sendBtn} ${isGenerating ? styles.stopBtn : ''}`}
                      onClick={handleAction}
                      disabled={disabled || attachments.some(a => a.isUploading) || (!isGenerating && !internalValue.trim() && !attachments.some(a => !a.hasFailed && (a.url || a.extractedText)))}
                      style={disabled || attachments.some(a => a.isUploading) || (!isGenerating && !internalValue.trim() && !attachments.some(a => !a.hasFailed && (a.url || a.extractedText))) ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <AnimatePresence mode="wait">
                        {isGenerating ? (
                          <motion.div
                            key="stop"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                          >
                            <div className={styles.square} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="send"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                          >
                            <ArrowUp size={20} strokeWidth={3} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  )}
                </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.disclaimer}>
        Sree Ai can make mistakes. Check important info.
      </div>

      <ImagePreviewModal
        src={previewImage?.url || null}
        alt={previewImage?.name || 'Attachment preview'}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};


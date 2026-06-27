import React, { useRef, useState } from 'react';
import { Plus, Mic, ArrowUp, X, FileText, Table, Music, Video, Image as ImageIcon, AudioLines, Check, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ChatInput.module.css';
import { useModelStore } from '../../store/model.store';
import { useAuthStore } from '../../store/auth.store';
import { uploadFile } from '../../api/storage';
import { aiService } from '../../lib/api';

export interface Attachment {
  file: File;
  preview: string;
  url?: string;
  type: 'image' | 'document' | 'audio' | 'video';
  isUploading?: boolean;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const { setVisionRequired } = useModelStore();
  const { user } = useAuthStore();

  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = React.useState(false);
  const voiceMenuRef = useRef<HTMLDivElement>(null);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stopMediaStream = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (progressiveIntervalRef.current) clearInterval(progressiveIntervalRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  React.useEffect(() => {
    return () => {
      stopMediaStream();
      if (sttAbortControllerRef.current) {
        sttAbortControllerRef.current.abort();
      }
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

    // Text appearing sequence & speed control (2000ms delay per step)
    const steps = ['Processing...', 'Transcribing...', 'Just There...'];
    let stepIdx = 0;
    setProgressiveText(steps[0]);
    progressiveIntervalRef.current = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      setProgressiveText(steps[stepIdx]);
    }, 2000);

    const recorder = mediaRecorderRef.current;

    const onStopHandler = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm';
        const file = new File([audioBlob], `dictation.${extension}`, { type: mimeType });

        const formData = new FormData();
        formData.append('file', file);

        const response = await aiService.stt(formData, { signal: sttAbortControllerRef.current?.signal });

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
        sttAbortControllerRef.current = null;
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

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  React.useEffect(() => {
    adjustHeight();
  }, [internalValue]);

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
      // Prevent sending if any file is still uploading
      const isUploading = attachments.some(a => a.isUploading);
      if (isUploading) return;

      if (internalValue.trim() || attachments.length > 0) {
        onSend(internalValue);
        setInternalValue(''); // Clear local state after sending
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Block anonymous users from uploading files
    if (!user) {
      onAuthRequired?.();
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
        file,
        preview: isImage ? URL.createObjectURL(file) : '',
        type,
        isUploading: true,
        extractedText: extractedText || undefined
      };
    }));

    const updated = [...attachments, ...newAttachments];
    onAttachmentsChange(updated);

    newAttachments.forEach(async (atl, idx) => {
      const globalIdx = attachments.length + idx;

      const result = await uploadFile(atl.file);

      onAttachmentsChange(prev => {
        const next = [...prev];
        if (next[globalIdx]) {
          next[globalIdx] = {
            ...next[globalIdx],
            isUploading: false,
            url: result.success ? result.url : undefined
          };
        }
        return next;
      });
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(updated);
  };

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

      <div className={`${styles.inputContainer} ${disabled ? styles.disabled : ''}`}>
        {!hasMessages && <div className={styles.neonBorder} />}

        {attachments.length > 0 && (
          <div className={styles.attachmentsList}>
            {attachments.map((atl, idx) => (
              <div key={idx} className={styles.attachmentCard}>
                <div className={`${styles.cardIcon} ${atl.isUploading ? styles.uploading : ''}`}>
                  {atl.isUploading ? (
                    <div className={styles.progressRing}>
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="40" />
                      </svg>
                    </div>
                  ) : atl.type === 'image' ? (
                    <ImageThumb src={atl.preview} onClick={() => setPreviewImage(atl.preview)} />
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
                  <span className={styles.cardFileName}>{atl.file.name}</span>
                  <span className={styles.cardFileType}>
                    {atl.file.name.split('.').pop()?.toUpperCase() || 'File'}
                  </span>
                </div>
                <button className={styles.cardRemoveBtn} onClick={() => removeAttachment(idx)}>
                  <div className={styles.xCircle}><X size={12} /></div>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.inputInner}>
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
              <button className={`${styles.iconBtn} ${styles.plusBtn}`} onClick={() => !disabled && fileInputRef.current?.click()} disabled={disabled} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                <Plus size={22} />
              </button>

              <textarea
                ref={textareaRef}
                className={styles.input}
                value={internalValue}
                onChange={(e) => setInternalValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText || "Ask anything"}
                disabled={disabled}
                rows={1}
              />

              <div className={styles.inputActions}>
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
                <button
                  className={`${styles.sendBtn} ${isGenerating ? styles.stopBtn : ''}`}
                  onClick={handleAction}
                  disabled={disabled || attachments.some(a => a.isUploading) || (!isGenerating && !internalValue.trim() && attachments.length === 0)}
                  style={disabled || attachments.some(a => a.isUploading) ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
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
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.disclaimer}>
        Sree Ai can make mistakes. Check important info.
      </div>

      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.lightbox}
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={styles.lightboxContent}
              onClick={e => e.stopPropagation()}
            >
              <img src={previewImage} alt="Full preview" />
              <button className={styles.closeLightbox} onClick={() => setPreviewImage(null)}>
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


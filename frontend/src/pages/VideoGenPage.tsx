import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Play, Pause, Volume2, VolumeX, Maximize2, Download,
  Mic, Sparkles, Trash2, Plus, ChevronDown, Music, Lock,
  Info, Loader2, X, RefreshCcw, Sidebar, Eye, RotateCcw, AlertCircle, Check, Zap,
  Minus, ArrowRight, Monitor, Smartphone, Square as SquareIcon, Sliders,
  ImagePlus, ArrowLeftRight, Layers, AudioLines
} from 'lucide-react';
import { uploadFile } from '../api/storage';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useAuthStore } from '../store/auth.store';
import { useVideoStore } from '../store/video.store';
import { useUIStore } from '../store/ui.store';
import { useUsageStore } from '../store/usage.store';
import { aiService, apiKeyService } from '../lib/api';
import styles from './VideoGenPage.module.css';
import { VideoSidebar } from '../components/video/VideoSidebar';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import { LimitModal } from '../components/modals/LimitModal';

// Models configuration — only active, non-deprecated models
const VEO_MODELS = [
  { id: 'veo-3.1-generate-preview', name: 'Veo 3.1', desc: 'High-fidelity video with native audio support', basePrice: 0.40, requiresPremium: true },
  { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', desc: 'Fast, lower-latency rendering', basePrice: 0.10, requiresPremium: true },
  { id: 'veo-3.1-lite-generate-preview', name: 'Veo 3.1 Lite', desc: 'Efficient light model — no 4K support', basePrice: 0.05, requiresPremium: true },
  { id: 'gemini-omni-flash-preview', name: 'Omni Flash', desc: 'Fast multimodal generation via Gemini Live', basePrice: 0.02, requiresPremium: false }
];

// Aspect ratios with sizes
const ASPECT_RATIOS = [
  { label: '16:9', ratio: '16/9', width: 32, height: 18, desc: 'Landscape' },
  { label: '9:16', ratio: '9/16', width: 18, height: 32, desc: 'Portrait' }
];

// Speed/Quality pricing structures
const SPEED_TIERS = [
  { id: 'lite', label: 'Lite Mode', desc: 'Affordable rendering' },
  { id: 'fast', label: 'Fast Mode', desc: 'Quick processing' },
  { id: 'standard', label: 'Standard Mode', desc: 'High visual fidelity' }
];




// Voice waveform tracing canvas component
const VoiceWaveformTrace: React.FC<{ stream: MediaStream | null; isPaused: boolean }> = ({ stream, isPaused }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>([]);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
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
      analyser.smoothingTimeConstant = 0.5;
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
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(x, y, barWidth, barHeight, barWidth / 2);
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

const GridVideoPlayer: React.FC<{
  video: any;
  onDelete: (id: string) => void;
}> = ({ video, onDelete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!videoRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
    setProgress(pos * 100);
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleDownload = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = video.videoUrl || video.url;
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `sree-ai-video-${video.id}.mp4`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={styles.gridVideoCard}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={video.videoUrl || video.url}
        loop
        onClick={() => togglePlay()}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      
      {/* Delete button */}
      <button
        type="button"
        className={styles.videoDeleteBtn}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(video.id);
        }}
        title="Delete video"
      >
        <X size={14} />
      </button>

      <button
        className={`${styles.overlayPlayBtn} ${(!isPlaying || showControls) ? styles.overlayPlayBtnVisible : ''}`}
        onClick={togglePlay}
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', position: 'absolute' }}
      >
        {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ transform: 'translateX(2px)' }} />}
      </button>

      <div className={`${styles.videoControls} ${showControls ? styles.videoControlsVisible : ''}`}>
        <div className={styles.progressContainer} onClick={handleScrub}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }}>
            <div className={styles.progressHandle} />
          </div>
        </div>
        <div className={styles.controlRow}>
          <div className={styles.leftControls}>
            <button className={styles.controlBtn} onClick={togglePlay}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className={styles.controlBtn} onClick={toggleMute}>
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <span className={styles.timeDisplay}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <div className={styles.rightControls}>
            <button className={styles.controlBtn} onClick={handleDownload} title="Download">
              <Download size={14} />
            </button>
            <button className={styles.controlBtn} onClick={toggleFullscreen} title="Fullscreen">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const VideoGenPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { openUpgradeModal } = useUIStore();
  const {
    settings,
    updateSettings,
    isGenerating,
    generateVideo,
    activeVideo,
    setActiveVideo,
    activeVideos,
    setActiveVideos,
    history,
    deleteVideo
  } = useVideoStore();

  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [hasGoogleKey, setHasGoogleKey] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);

  // Input Mode state & File upload state
  const [inputMode, setInputMode] = useState<'ingredients' | 'frames'>('ingredients');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const startFrameInputRef = useRef<HTMLInputElement | null>(null);
  const endFrameInputRef = useRef<HTMLInputElement | null>(null);

  const [uploadedFile, setUploadedFile] = useState<{ file: File; preview: string; url?: string; isUploading: boolean; type: 'image' | 'video' } | null>(null);
  const [startFrameFile, setStartFrameFile] = useState<{ file: File; preview: string; url?: string; isUploading: boolean } | null>(null);
  const [endFrameFile, setEndFrameFile] = useState<{ file: File; preview: string; url?: string; isUploading: boolean } | null>(null);

  // Modals & triggers
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [videoLoadErrors, setVideoLoadErrors] = useState<Record<string, boolean>>({});
  const { status: usageStatus, fetchStatus: fetchUsageStatus } = useUsageStore();
  const [limitModal, setLimitModal] = useState<{
    isOpen: boolean;
    type: 'anonymous' | 'rate-limited' | 'tiered' | 'abuse-cooldown' | 'abuse-captcha' | 'abuse-auth' | 'abuse-restricted' | 'anonymous-upload';
    limitInfo?: any;
  }>({ isOpen: false, type: 'anonymous' });

  // Dictate mode states
  const [isDictating, setIsDictating] = useState(false);
  const [dictateState, setDictateState] = useState<'recording' | 'processing'>('recording');
  const [dictateTimer, setDictateTimer] = useState(0);
  const [progressiveText, setProgressiveText] = useState('Processing...');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const progressiveIntervalRef = useRef<any>(null);
  const isCancelledRef = useRef<boolean>(false);
  const sttAbortControllerRef = useRef<AbortController | null>(null);

  // Gate check: Free plan users cannot generate videos (minimum Starter requirement)
  const isFreePlan = !user || user.plan_type === 'free' || !user.plan_type;

  // Selected Model Object
  const selectedModel = VEO_MODELS.find(m => m.id === settings.modelId) || VEO_MODELS[0];

  // Fetch usage hook
  const fetchUsage = useCallback(async (isManualRefresh: boolean = false) => {
    try {
      await fetchUsageStatus(isManualRefresh);
      if (user) {
        const response = await apiKeyService.listKeys();
        if (response.success && Array.isArray(response.data)) {
          const googleKey = response.data.find((k: any) => k.provider === 'google' && k.in_use);
          setHasGoogleKey(!!googleKey);
        }
      }
    } catch (err) {
      console.error('Failed to fetch usage or keys:', err);
    }
  }, [fetchUsageStatus, user]);

  useEffect(() => {
    fetchUsage(false);
  }, [fetchUsage]);

  // Compute usage limits
  const usage = useMemo(() => {
    if (!usageStatus) return null;
    const videoData = usageStatus.profileUsage?.video || null;
    const videoSummary = usageStatus.usage?.video || null;

    return {
      usedDaily: videoData?.daily?.used ?? videoSummary?.daily?.used ?? 0,
      limitDaily: videoData?.daily?.limit ?? videoSummary?.daily?.limit ?? 0,
      usedMonthly: videoData?.monthly?.used ?? videoSummary?.monthly?.used ?? 0,
      limitMonthly: videoData?.monthly?.limit ?? videoSummary?.monthly?.used ?? null,
      tier: usageStatus.tier ?? 'free',
    };
  }, [usageStatus]);

  // Duration formatting helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Ingredients Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      toast.error('Only image or video files are supported.');
      return;
    }

    const preview = URL.createObjectURL(file);
    const fileType: 'image' | 'video' = isImage ? 'image' : 'video';
    setUploadedFile({ file, preview, isUploading: true, type: fileType });

    try {
      const result = await uploadFile(file);
      if (result.success && result.url) {
        setUploadedFile(prev => prev ? { ...prev, url: result.url, isUploading: false } : null);
        updateSettings({ inputUrl: result.url });
        toast.success('File uploaded successfully');
      } else {
        toast.error(result.message || 'Upload failed');
        setUploadedFile(null);
      }
    } catch (err) {
      toast.error('Failed to upload file');
      setUploadedFile(null);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    updateSettings({ inputUrl: null });
  };

  // Starting Frame Upload
  const handleStartFrameSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are supported for starting frame.');
      return;
    }

    const preview = URL.createObjectURL(file);
    setStartFrameFile({ file, preview, isUploading: true });

    try {
      const result = await uploadFile(file);
      if (result.success && result.url) {
        setStartFrameFile(prev => prev ? { ...prev, url: result.url, isUploading: false } : null);
        updateSettings({ inputUrl: result.url });
        toast.success('Start frame uploaded successfully');
      } else {
        toast.error(result.message || 'Upload failed');
        setStartFrameFile(null);
      }
    } catch (err) {
      toast.error('Failed to upload start frame');
      setStartFrameFile(null);
    }

    if (startFrameInputRef.current) startFrameInputRef.current.value = '';
  };

  const removeStartFrameFile = () => {
    setStartFrameFile(null);
    updateSettings({ inputUrl: null });
  };

  // Ending Frame Upload
  const handleEndFrameSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are supported for ending frame.');
      return;
    }

    const preview = URL.createObjectURL(file);
    setEndFrameFile({ file, preview, isUploading: true });

    try {
      const result = await uploadFile(file);
      if (result.success && result.url) {
        setEndFrameFile(prev => prev ? { ...prev, url: result.url, isUploading: false } : null);
        updateSettings({ lastFrameUrl: result.url });
        toast.success('End frame uploaded successfully');
      } else {
        toast.error(result.message || 'Upload failed');
        setEndFrameFile(null);
      }
    } catch (err) {
      toast.error('Failed to upload end frame');
      setEndFrameFile(null);
    }

    if (endFrameInputRef.current) endFrameInputRef.current.value = '';
  };

  const removeEndFrameFile = () => {
    setEndFrameFile(null);
    updateSettings({ lastFrameUrl: null });
  };

  const handleModeChange = (mode: 'ingredients' | 'frames') => {
    setInputMode(mode);
    if (mode === 'ingredients') {
      updateSettings({
        inputUrl: uploadedFile?.url || null,
        lastFrameUrl: null
      });
    } else {
      updateSettings({
        inputUrl: startFrameFile?.url || null,
        lastFrameUrl: endFrameFile?.url || null
      });
    }
  };

  // Video generation executor
  const handleGenerate = async () => {
    if (isFreePlan) {
      openUpgradeModal('starter');
      return;
    }
    if (!settings.prompt.trim()) {
      toast.error('Please enter a description for the video.');
      return;
    }

    setActiveTab('generate');

    try {
      await generateVideo();
      fetchUsage(false);
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 429) {
        const errorData = err.response.data;
        const code = errorData?.code;

        if (code === 'ABUSE_COOLDOWN' || code === 'ABUSE_CAPTCHA' || code === 'ABUSE_AUTH' || code === 'ABUSE_RESTRICTED') {
          setLimitModal({
            isOpen: true,
            type: code.toLowerCase().replace('_', '-') as any,
            limitInfo: {
              resetsIn: errorData.info?.resets_in_seconds,
              limit: errorData.info?.daily_limit,
              current: errorData.info?.daily_count,
              message: errorData.message
            }
          });
        } else {
          const resetsIn = errorData.resetsIn || 60;
          setLimitModal({
            isOpen: true,
            type: user ? 'tiered' : 'anonymous',
            limitInfo: {
              limit: errorData.limit,
              current: errorData.current,
              resetsIn: resetsIn,
              reason: errorData.reason || 'daily',
              tool: errorData.tool || 'video',
              message: errorData.message,
              tier: user ? user.plan_type || 'free' : 'Anonymous'
            }
          });
        }
      }
    }
  };

  // Dictate dictation activation
  const startDictating = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      setIsDictating(true);
      setDictateState('recording');
      setDictateTimer(0);
      audioChunksRef.current = [];
      isCancelledRef.current = false;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (isCancelledRef.current) return;
        await processSTT(recorder.mimeType);
      };

      recorder.start();

      timerIntervalRef.current = setInterval(() => {
        setDictateTimer((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start dictate mode:', error);
      toast.error('Microphone access denied. Please grant audio input permissions.');
    }
  };

  // Stop recording and process text
  const stopDictating = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
  };

  // Cancel dictate
  const cancelDictating = () => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (progressiveIntervalRef.current) clearInterval(progressiveIntervalRef.current);
    if (sttAbortControllerRef.current) sttAbortControllerRef.current.abort();
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setIsDictating(false);
    setDictateTimer(0);
    audioChunksRef.current = [];
  };

  // Audio processing to STT
  const processSTT = async (mimeType: string) => {
    setDictateState('processing');
    sttAbortControllerRef.current = new AbortController();

    const steps = ['Processing...', 'Transcribing...', 'Finalizing Speech...'];
    let idx = 0;
    setProgressiveText(steps[0]);
    progressiveIntervalRef.current = setInterval(() => {
      idx = (idx + 1) % steps.length;
      setProgressiveText(steps[idx]);
    }, 2000);

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm';
      const file = new File([audioBlob], `video_dictation.${extension}`, { type: mimeType });

      const formData = new FormData();
      formData.append('file', file);

      const response = await aiService.stt(formData, {
        signal: sttAbortControllerRef.current?.signal
      });

      if (isCancelledRef.current) return;

      const rawText = typeof response.text === 'object' ? response.text?.text : response.text;
      const fallbackText = typeof response.data === 'object' ? response.data?.text : response.data;
      const text = (typeof rawText === 'string' ? rawText : typeof fallbackText === 'string' ? fallbackText : '').trim();

      if (text) {
        updateSettings({ prompt: settings.prompt ? `${settings.prompt} ${text}` : text });
        toast.success('Speech transcribed successfully');
      } else {
        toast.error('No speech detected.');
      }
    } catch (err: any) {
      if (isCancelledRef.current || err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error(err);
      toast.error(err.response?.data?.message || err.message || 'Speech-to-text failed.');
    } finally {
      if (progressiveIntervalRef.current) clearInterval(progressiveIntervalRef.current);
      setIsDictating(false);
      setDictateTimer(0);
      audioChunksRef.current = [];
    }
  };

  const handleDownload = (videoObj?: any) => {
    const active = videoObj || activeVideo;
    if (!active) return;
    const a = document.createElement('a');
    a.href = active.videoUrl || active.url;
    a.download = `sree-ai-video-${active.id}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Downloading video asset...');
  };

  return (
    <DashboardLayout
      defaultCollapsed={true}
      sidebar={(props) => (
        <VideoSidebar
          {...props}
          onNewVideo={() => {
            setActiveTab('generate');
            setActiveVideo(null);
            setActiveVideos([]);
            updateSettings({ prompt: '' });
          }}
          onDeleteClick={(id) => setDeleteConfirmId(id)}
          onSelectVideo={() => setActiveTab('generate')}
        />
      )}
    >
      <div className={styles.container}>
        <div className={styles.glowBlobLeft} />
        <div className={styles.glowBlobRight} />

        <div className={styles.main}>
          <div className={styles.headerContainer}>
            <div className={styles.tabHeader} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <button
                  className={`${styles.tabButton} ${activeTab === 'generate' ? styles.tabButtonActive : ''}`}
                  onClick={() => setActiveTab('generate')}
                >
                  Workspace
                </button>
                <button
                  className={`${styles.tabButton} ${activeTab === 'gallery' ? styles.tabButtonActive : ''}`}
                  onClick={() => setActiveTab('gallery')}
                >
                  Collection
                </button>
              </div>
            </div>
          </div>

          <div className={styles.viewport}>
            <AnimatePresence mode="wait">
              {activeTab === 'generate' ? (
                <motion.div
                  key="generate"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  transition={{ duration: 0.35 }}
                  className={styles.workspaceArea}
                >
                  {/* Video Output Area */}
                  <div className={styles.videoOutputArea}>
                    {isGenerating ? (
                      <div
                        className={styles.videoGrid}
                        style={{
                          gridTemplateColumns: (settings.outputsCount || 1) > 1 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
                        }}
                      >
                        {Array.from({ length: settings.outputsCount || 1 }).map((_, idx) => (
                          <div key={idx} className={styles.generationOverlay} style={{ borderRadius: '20px', aspectRatio: '16/9', width: '100%' }}>
                            <div className={styles.spinnerContainer}>
                              <div className={styles.outerRing} />
                              <div className={styles.innerRing} />
                              <Sparkles size={20} style={{ color: '#00f2fe', position: 'relative' }} />
                            </div>
                            <div className={styles.genStatusText}>Rendering Video {settings.outputsCount > 1 ? `#${idx + 1}` : ''}</div>
                            <div className={styles.genModelText}>Using {selectedModel.name}</div>
                            <div className={styles.progressBarTrack}>
                              <div className={styles.progressBarFill} />
                            </div>
                            <div className={styles.genTimer}>Estimated: ~15s</div>
                          </div>
                        ))}
                      </div>
                    ) : activeVideos.length > 0 ? (
                      <div
                        className={styles.videoGrid}
                        style={{
                          gridTemplateColumns: activeVideos.length > 1 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
                        }}
                      >
                        {activeVideos.map((video) => (
                          <GridVideoPlayer key={video.id} video={video} onDelete={deleteVideo} />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyWorkspace}>
                        <Video size={56} />
                        <h3>Create a Video</h3>
                        <p>Describe what you want to generate below</p>
                      </div>
                    )}
                  </div>

                  {/* Hidden Native File Inputs */}
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,video/*" onChange={handleFileSelect} />
                  <input type="file" ref={startFrameInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleStartFrameSelect} />
                  <input type="file" ref={endFrameInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleEndFrameSelect} />

                  {/* Prompt Box wrapper */}
                  <div className={styles.promptBoxWrapper}>
                    <div className={styles.unifiedPromptBar}>

                      {/* Row 1: Media Inputs (top) */}
                      <div className={styles.barMediaContainer}>
                        {inputMode === 'frames' ? (
                          <div className={styles.framesBtnGroup}>
                            {/* Start frame slot */}
                            {startFrameFile ? (
                              <div className={styles.frameSlot}>
                                <img src={startFrameFile.preview} alt="start" className={styles.frameSlotThumb} />
                                {startFrameFile.isUploading && <div className={styles.frameSlotLoading}><Loader2 size={10} className={styles.progressSpinner} /></div>}
                                <button type="button" className={styles.frameSlotRemove} onClick={removeStartFrameFile}><X size={8} /></button>
                              </div>
                            ) : (
                              <button type="button" className={styles.frameSlotBtn} onClick={() => startFrameInputRef.current?.click()} disabled={isGenerating || isFreePlan} title="Upload start frame">
                                Start
                              </button>
                            )}
                            <ArrowLeftRight size={12} className={styles.framesArrow} />
                            {/* End frame slot */}
                            {endFrameFile ? (
                              <div className={styles.frameSlot}>
                                <img src={endFrameFile.preview} alt="end" className={styles.frameSlotThumb} />
                                {endFrameFile.isUploading && <div className={styles.frameSlotLoading}><Loader2 size={10} className={styles.progressSpinner} /></div>}
                                <button type="button" className={styles.frameSlotRemove} onClick={removeEndFrameFile}><X size={8} /></button>
                              </div>
                            ) : (
                              <button type="button" className={styles.frameSlotBtn} onClick={() => endFrameInputRef.current?.click()} disabled={isGenerating || isFreePlan} title="Upload end frame">
                                End
                              </button>
                            )}
                          </div>
                        ) : (
                          /* Ingredients mode: compact media attach icon */
                          uploadedFile ? (
                            <div className={styles.frameSlot}>
                              {uploadedFile.type === 'image' ? (
                                <img src={uploadedFile.preview} alt="ingredient" className={styles.frameSlotThumb} />
                              ) : (
                                <video src={uploadedFile.preview} className={styles.frameSlotThumb} />
                              )}
                              {uploadedFile.isUploading && <div className={styles.frameSlotLoading}><Loader2 size={10} className={styles.progressSpinner} /></div>}
                              <button type="button" className={styles.frameSlotRemove} onClick={removeUploadedFile}><X size={8} /></button>
                            </div>
                          ) : (
                            <button type="button" className={styles.mediaAttachBtn} onClick={() => fileInputRef.current?.click()} disabled={isGenerating || isFreePlan} title="Add media ingredient">
                              <ImagePlus size={16} />
                            </button>
                          )
                        )}
                      </div>

                      {/* Row 2: Bottom row (actions + input) */}
                      <div className={styles.barInputActionsRow}>
                        <div className={styles.barInputLeft}>
                          {!isFreePlan && (
                            <button type="button" className={styles.promptIconBtn} onClick={startDictating} disabled={isGenerating} title="Dictate">
                              <Mic size={17} />
                            </button>
                          )}
                          <textarea
                            value={settings.prompt}
                            onChange={(e) => updateSettings({ prompt: e.target.value })}
                            placeholder={isFreePlan ? "Upgrade to generate videos..." : (inputMode === 'frames' ? "Describe the transition between frames..." : "What do you want to create?")}
                            className={styles.promptTextarea}
                            disabled={isGenerating || isFreePlan}
                            rows={1}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                            onInput={(e) => {
                              const el = e.currentTarget;
                              el.style.height = 'auto';
                              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                            }}
                          />
                        </div>

                        <div className={styles.barActionsRight}>
                          {/* Summary capsule that opens params popup */}
                          <div className={styles.barParamsAnchor}>
                            <button
                              type="button"
                              className={`${styles.summaryCapsuleBtn} ${paramsOpen ? styles.summaryCapsuleBtnActive : ''}`}
                              onClick={() => setParamsOpen(!paramsOpen)}
                              disabled={isGenerating || isFreePlan}
                              title="Parameters"
                            >
                              <span>Video</span>
                              <span className={styles.summaryDot}>·</span>
                              <span>{settings.duration}s</span>
                              <span className={styles.summaryDot}>·</span>
                              <span className={styles.summaryRatioIcon}>{ASPECT_RATIOS[settings.ratioIndex]?.label}</span>
                              <span className={styles.summaryDot}>·</span>
                              <span>x{settings.outputsCount}</span>
                              <Sliders size={12} className={styles.summarySliderIcon} />
                            </button>

                            <AnimatePresence>
                              {paramsOpen && (
                                <>
                                  <div className={styles.paramsBackdrop} onClick={() => setParamsOpen(false)} />
                                  <motion.div
                                    className={styles.barParamsPopup}
                                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 12, scale: 0.96 }}
                                    transition={{ duration: 0.15, ease: 'easeOut' }}
                                  >
                                    {/* Mode: Frames / Ingredients */}
                                    <div className={styles.popupSection}>
                                      <div className={styles.popupGrid}>
                                        <button
                                          type="button"
                                          className={`${styles.popupPill} ${inputMode === 'frames' ? styles.popupPillActive : ''}`}
                                          onClick={() => handleModeChange('frames')}
                                        >
                                          <Maximize2 size={13} /> Frames
                                        </button>
                                        <button
                                          type="button"
                                          className={`${styles.popupPill} ${inputMode === 'ingredients' ? styles.popupPillActive : ''}`}
                                          onClick={() => handleModeChange('ingredients')}
                                        >
                                          <Layers size={13} /> Ingredients
                                        </button>
                                      </div>
                                    </div>

                                    {/* Aspect Ratio */}
                                    <div className={styles.popupSection}>
                                      <span className={styles.popupLabel}>Aspect Ratio</span>
                                      <div className={styles.popupGrid}>
                                        {ASPECT_RATIOS.map((ar, idx) => (
                                          <button
                                            key={ar.label}
                                            type="button"
                                            className={`${styles.popupPill} ${settings.ratioIndex === idx ? styles.popupPillActive : ''}`}
                                            onClick={() => updateSettings({ ratioIndex: idx })}
                                          >
                                            {ar.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Parallel Outputs */}
                                    <div className={styles.popupSection}>
                                      <span className={styles.popupLabel}>Parallel Outputs</span>
                                      <div className={`${styles.popupGrid} ${styles.singleLineRow}`}>
                                        {[1, 2, 3, 4].map((n) => (
                                          <button
                                            key={n}
                                            type="button"
                                            className={`${styles.popupPill} ${settings.outputsCount === n ? styles.popupPillActive : ''}`}
                                            onClick={() => updateSettings({ outputsCount: n })}
                                          >
                                            {n}X
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Model */}
                                    <div className={styles.popupSection}>
                                      <span className={styles.popupLabel}>Model</span>
                                      <div className={styles.modelSelectWrapper}>
                                        <select
                                          className={styles.popupSelect}
                                          value={settings.modelId}
                                          onChange={(e) => updateSettings({ modelId: e.target.value })}
                                        >
                                          {VEO_MODELS.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                          ))}
                                        </select>
                                        <ChevronDown size={14} className={styles.selectArrow} />
                                      </div>
                                    </div>

                                    {/* Duration */}
                                    <div className={styles.popupSection}>
                                      <span className={styles.popupLabel}>Duration</span>
                                      <div className={`${styles.popupGrid} ${styles.singleLineRow}`}>
                                        {[4, 6, 8, 10].map((s) => (
                                          <button
                                            key={s}
                                            type="button"
                                            className={`${styles.popupPill} ${settings.duration === s ? styles.popupPillActive : ''}`}
                                            onClick={() => updateSettings({ duration: s })}
                                          >
                                            {s}s
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Audio Toggle */}
                                    <div className={styles.popupSection} style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                      <div className={styles.audioToggleRow}>
                                        <span className={styles.popupLabel} style={{ marginBottom: 0 }}>Include Audio</span>
                                        <button
                                          type="button"
                                          className={`${styles.audioToggleBtn} ${settings.includeAudio ? styles.audioToggleBtnActive : ''}`}
                                          onClick={() => updateSettings({ includeAudio: !settings.includeAudio })}
                                        >
                                          {settings.includeAudio ? 'Enabled' : 'Disabled'}
                                        </button>
                                      </div>
                                    </div>

                                    {/* Cost calculation */}
                                    <div className={styles.creditCostSection}>
                                      <span className={styles.creditCostLabel}>Cost</span>
                                      <span className={styles.creditCostValue}>
                                        <Zap size={12} fill="currentColor" className={styles.costZapIcon} />
                                        {settings.outputsCount * 1} Credits
                                      </span>
                                    </div>
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Send / Generate */}
                          <button
                            className={`${styles.sendCircleBtn} ${isGenerating ? styles.sendCircleBtnGenerating : ''}`}
                            onClick={handleGenerate}
                            disabled={isGenerating || !settings.prompt.trim()}
                          >
                            {isGenerating ? (
                              <div className={styles.sendStopSquare} />
                            ) : (
                              <ArrowRight size={20} strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Dictation overlay inside unifiedPromptBar */}
                      <AnimatePresence>
                        {isDictating && (
                          <motion.div
                            className={styles.dictateOverlayBar}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className={styles.dictateLeft}>
                              <div className={styles.recordingPulse} />
                              <span>Recording: {dictateTimer}s</span>
                            </div>
                            <div className={styles.waveformCanvasBox}>
                              <VoiceWaveformTrace stream={mediaStream} isPaused={dictateState === 'processing'} />
                            </div>
                            <div className={styles.dictateActions}>
                              <button className={styles.dictateCancelBtn} onClick={cancelDictating}>Cancel</button>
                              <button className={styles.dictateStopBtn} onClick={stopDictating}>Done</button>
                            </div>
                            {dictateState === 'processing' && (
                              <div className={styles.dictateProgress}>
                                <span className={styles.progressiveLoadingText}>
                                  <AudioLines size={16} className={styles.wavePulseIcon} />
                                  {progressiveText}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                    {/* BYOK footer */}
                    <div className={styles.chatFooter}>
                      {hasGoogleKey ? (
                        <div className={styles.byokActiveBadge}>
                          <Check size={12} className={styles.activeCheck} />
                          <span>BYOK active &mdash; <strong>0.2 credits</strong>/video</span>
                        </div>
                      ) : (
                        <div className={styles.byokInactiveBadge}>
                          <Info size={12} className={styles.infoIcon} />
                          <span>1 credit/video. <button type="button" onClick={() => navigate('/settings?tab=keys')} className={styles.byokLink}>Use BYOK for 0.2</button></span>
                        </div>
                      )}
                    </div>
                  </motion.div>
              ) : (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.35 }}
                  style={{ width: '100%' }}
                >
                  {history.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '100px', opacity: 0.3 }}>
                      <Video size={64} style={{ marginBottom: '20px' }} />
                      <h2 style={{ color: 'white', marginBottom: '16px' }}>No video history yet</h2>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Generated videos will appear here</p>
                      <button className="glass" onClick={() => setActiveTab('generate')} style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--primary)', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: 1 }}>
                        <Plus size={18} /> Start Workspace
                      </button>
                    </div>
                  ) : (
                    <div className={styles.galleryGrid}>
                      {history.map((vid) => (
                        <div key={vid.id} className={styles.galleryItem} onClick={() => { setActiveVideo(vid); setActiveTab('generate'); }}>
                          {videoLoadErrors[vid.id] ? (
                            <div className={styles.errorOverlay}>
                              <AlertCircle size={24} style={{ color: '#ef4444', marginBottom: '8px' }} />
                              <p className={styles.errorText} style={{ fontSize: '0.75rem' }}>Failed to load video</p>
                            </div>
                          ) : (
                            <div className={styles.galleryImageWrapper}>
                              <video src={vid.videoUrl || vid.url} muted playsInline loop onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} className={styles.galleryImage} onError={() => setVideoLoadErrors((prev) => ({ ...prev, [vid.id]: true }))} />
                            </div>
                          )}
                          <div className={styles.galleryOverlay}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600 }}>
                                {vid.model?.includes('lite') ? 'VEO 3.1 LITE' : vid.model?.includes('fast') ? 'VEO 3.1 FAST' : vid.model?.includes('omni') ? 'OMNI FLASH' : 'VEO 3.1'}
                              </div>
                              <Eye size={16} color="white" style={{ opacity: 0.7 }} />
                            </div>
                            <p className={styles.galleryPrompt}>{vid.prompt}</p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                              <button onClick={(e) => { e.stopPropagation(); handleDownload(vid); }} className="glass" style={{ flex: 1, padding: '6px', borderRadius: '8px', border: 'none', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}>Save</button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(vid.id); }} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <LimitModal
          isOpen={limitModal.isOpen}
          onClose={() => setLimitModal((prev) => ({ ...prev, isOpen: false }))}
          type={limitModal.type}
          limitInfo={limitModal.limitInfo}
        />

        <ConfirmModal
          isOpen={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          onConfirm={() => deleteConfirmId && deleteVideo(deleteConfirmId)}
          title="Delete Video Generation?"
          description="This will permanently delete this video generation from your history. This action cannot be undone."
          confirmLabel="Delete Video"
        />
      </div>
    </DashboardLayout>
  );
};

export default VideoGenPage;


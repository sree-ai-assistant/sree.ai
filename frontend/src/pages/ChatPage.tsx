import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowLeft, MoreVertical, Lock, Clock, Sparkles, Zap, FileText, Mail, Code, ArrowUpRight, RotateCcw, ArrowDown } from 'lucide-react';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { useUsageStore } from '../store/usage.store';
import { useParams, useNavigate } from 'react-router-dom';
import { getOrCreateAnonymousIdentity, getStoredAnonId, generateFingerprintHash } from '../lib/fingerprint';
import styles from './ChatPage.module.css';
import { VoiceOverlay } from '../components/voice/VoiceOverlay';
import { ChatInput } from '../components/chat/ChatInput';
import { ModelSelector } from '../components/chat/ModelSelector';
import { useModelStore } from '../store/model.store';
import { useLocation } from 'react-router-dom';
import { useUIStore } from '../store/ui.store';
import { CodeBlock } from '../components/chat/CodeBlock';
import { ChatMessage } from '../components/chat/ChatMessage';
import { LimitModal } from '../components/modals/LimitModal';
import { aiService } from '../lib/api';

const cleanTextForTTS = (text: string) => {
  let processed = text.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');
  processed = processed.replace(/<(think|thinking)>[\s\S]*/gi, '');
  processed = processed.replace(/\[SYSTEM INSTRUCTION: [\s\S]*?\]/gi, '');
  
  const noEmojis = processed.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  return noEmojis
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\|[^\n]*\|/g, '')
    .replace(/[-*_]{3,}/g, '')
    .replace(/!?\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/>/g, '')
    .replace(/[()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const splitTextIntoChunks = (text: string) => {
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';
  let sentenceCount = 0;
  const MIN_CHUNK_CHARS = 150;
  const MAX_CHUNK_SENTENCES = 3;

  for (const sentence of sentences) {
    currentChunk += sentence;
    sentenceCount++;
    if (currentChunk.length >= MIN_CHUNK_CHARS || sentenceCount >= MAX_CHUNK_SENTENCES) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      sentenceCount = 0;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const sanitizeErrorMessage = (errorMsg: string): string => {
  if (!errorMsg) return 'Encountered an unexpected service interruption.';

  const lowerMsg = errorMsg.toLowerCase();

  if (lowerMsg.includes('degraded') || lowerMsg.includes('maintenance') || lowerMsg.includes('410')) {
    return 'This model is currently undergoing maintenance or experiencing degraded performance. Please try again in a few minutes or switch to another model.';
  }

  if (lowerMsg.includes('400 status code') || lowerMsg.includes('bad request') || lowerMsg.includes('invalid') || lowerMsg.includes('enginecore') || lowerMsg.includes('400')) {
    return 'The request could not be processed by the model engine. Try switching to a different model or rephrasing your message.';
  }

  if (lowerMsg.includes('api key') || lowerMsg.includes('key rotation') || lowerMsg.includes('unauthorized') || lowerMsg.includes('401')) {
    return 'An authentication or configuration error occurred with the provider keys. The administrator has been notified.';
  }

  if (lowerMsg.includes('rate limit') || lowerMsg.includes('429') || lowerMsg.includes('too many requests')) {
    return 'Rate limit exceeded. Please wait a moment before trying again or upgrading your subscription.';
  }

  if (lowerMsg.includes('504') || lowerMsg.includes('gateway') || lowerMsg.includes('timeout') || lowerMsg.includes('502') || lowerMsg.includes('503')) {
    return 'The server is currently overloaded or taking too long to respond. This can happen with very complex queries or high traffic.';
  }

  return errorMsg;
};

const ChatPage: React.FC = () => {
  const { user, initialized } = useAuthStore();
  const [session, setSession] = useState<any>(null);
  const [lockTimeRemaining, setLockTimeRemaining] = useState<number>(0);
  const { selectedModel } = useModelStore();
  const {
    activeConversation,
    messages,
    addMessage,
    setActiveConversation,
    createConversation,
    setMessages
  } = useChatStore();

  const [limitModal, setLimitModal] = useState<{
    isOpen: boolean;
    type: 'anonymous' | 'rate-limited' | 'tiered' | 'abuse-cooldown' | 'abuse-captcha' | 'abuse-auth' | 'abuse-restricted' | 'anonymous-upload';
    limitInfo?: any;
  }>({ isOpen: false, type: 'anonymous' });

  // TTS Read Aloud state and refs
  const [activeTtsMessageId, setActiveTtsMessageId] = useState<string | null>(null);
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'preparing' | 'playing' | 'paused'>('idle');
  const ttsStatusRef = useRef<'idle' | 'preparing' | 'playing' | 'paused'>('idle');
  const activeTtsMessageIdRef = useRef<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsStartTimeRef = useRef<number>(0);
  const ttsSessionIdRef = useRef<string | null>(null);
  const ttsCallsCountRef = useRef<number>(0);
  const ttsAudioQueueRef = useRef<{ text: string; url: string | null }[]>([]);
  const ttsChunksRef = useRef<string[]>([]);
  const ttsCurrentChunkIndexRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false);
  const playResolveRef = useRef<(() => void) | null>(null);

  // Message-specific cache for generated blob URLs to avoid fresh /tts generation calls on replay
  const ttsMessageCacheRef = useRef<Map<string, { chunks: string[]; queue: { text: string; url: string | null }[] }>>(new Map());

  const isTtsPaused = () => ttsStatusRef.current === 'paused';

  const clearTtsCache = () => {
    ttsMessageCacheRef.current.forEach((cached) => {
      cached.queue.forEach((item) => {
        if (item.url && item.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(item.url);
          } catch (e) {}
        }
      });
    });
    ttsMessageCacheRef.current.clear();
  };

  const fetchChunk = async (index: number, chunks: string[], queue: { text: string; url: string | null }[], sessionId: string) => {
    if (index >= chunks.length || isCancelledRef.current) return;
    if (queue[index].url !== null) return; // Already cached or processing

    try {
      ttsCallsCountRef.current++;
      const blob = await aiService.generateSpeech(chunks[index], undefined, sessionId);
      if (isCancelledRef.current) return;
      const url = URL.createObjectURL(blob);
      queue[index].url = url;
    } catch (err: any) {
      console.error(`[TTS Read] Error generating speech for chunk ${index}:`, err);
      queue[index].url = '';
      const errorMsg = err.message || '';
      if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('too many requests') || errorMsg.includes('limit')) {
        toast.error("Rate limit exceeded for speech generation.");
      } else {
        toast.error("Failed to generate speech for this message.");
      }
    }
  };

  const playQueueFrom = async (startIndex: number, fullText: string) => {
    const messageId = activeTtsMessageIdRef.current;
    const queue = ttsAudioQueueRef.current;
    const chunks = ttsChunksRef.current;
    const sessionId = ttsSessionIdRef.current || '';

    let playbackFailed = false;

    for (let i = startIndex; i < chunks.length; i++) {
      if (activeTtsMessageIdRef.current !== messageId || isCancelledRef.current) break;
      if (isTtsPaused()) break;

      ttsCurrentChunkIndexRef.current = i;

      // Wait for chunk if not ready
      const waitStart = Date.now();
      while (queue[i].url === null) {
        if (activeTtsMessageIdRef.current !== messageId || isCancelledRef.current || isTtsPaused()) break;
        if (Date.now() - waitStart > 15000) {
          console.warn(`[TTS Read] Fetch timeout for chunk ${i}, skipping`);
          queue[i].url = '';
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (activeTtsMessageIdRef.current !== messageId || isCancelledRef.current || isTtsPaused()) break;

      const url = queue[i].url;
      if (!url) {
        if (i + 2 < chunks.length) {
          fetchChunk(i + 2, chunks, queue, sessionId);
        }
        continue;
      }

      let audio = activeAudioRef.current;
      if (!audio) {
        audio = new Audio(url);
        activeAudioRef.current = audio;
      }

      await new Promise<void>((resolvePlay) => {
        playResolveRef.current = resolvePlay;
        audio!.onended = () => {
          playResolveRef.current = null;
          resolvePlay();
        };
        audio!.onerror = () => {
          playbackFailed = true;
          playResolveRef.current = null;
          resolvePlay();
        };
        if (isTtsPaused()) {
          playResolveRef.current = null;
          resolvePlay();
          return;
        }
        audio!.play().catch(err => {
          console.error("[TTS Read] Audio play failed:", err);
          playbackFailed = true;
          playResolveRef.current = null;
          resolvePlay();
        });
      });

      if (playbackFailed) {
        console.warn(`[TTS Read] Cached audio failed to play for chunk ${i}, removing from cache and retrying freshly...`);
        if (messageId) {
          ttsMessageCacheRef.current.delete(messageId);
        }
        if (activeAudioRef.current) {
          try {
            activeAudioRef.current.pause();
            activeAudioRef.current.src = '';
          } catch (e) {}
          activeAudioRef.current = null;
        }
        isCancelledRef.current = true;
        if (playResolveRef.current) {
          playResolveRef.current();
          playResolveRef.current = null;
        }
        if (messageId) {
          generateAndPlayTts(messageId, fullText);
        }
        return;
      }

      if (isTtsPaused()) {
        break;
      }

      activeAudioRef.current = null;

      if (i + 2 < chunks.length) {
        fetchChunk(i + 2, chunks, queue, sessionId);
      }
    }

    if (activeTtsMessageIdRef.current === messageId && !isCancelledRef.current && !isTtsPaused() && ttsCurrentChunkIndexRef.current === chunks.length - 1 && !activeAudioRef.current) {
      await handleStopTts();
    }
  };

  const handleStopTts = async () => {
    if (!activeTtsMessageIdRef.current) return;

    const durationSeconds = ttsStartTimeRef.current > 0 ? (Date.now() - ttsStartTimeRef.current) / 1000 : 0;
    const sessionId = ttsSessionIdRef.current;
    const callsCount = ttsCallsCountRef.current;

    isCancelledRef.current = true;

    if (playResolveRef.current) {
      playResolveRef.current();
      playResolveRef.current = null;
    }

    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
      } catch (e) {}
      activeAudioRef.current = null;
    }

    // Do NOT clear or revoke the queue items here, because we want to preserve the cache for replay.
    // They will be cleaned up when the conversation changes or when the component unmounts.
    activeTtsMessageIdRef.current = null;
    setActiveTtsMessageId(null);
    ttsSessionIdRef.current = null;
    setTtsStatus('idle');
    ttsStatusRef.current = 'idle';

    try {
      const result = await aiService.voiceComplete(durationSeconds, sessionId || undefined, 2 + callsCount);
      const creditsCharged = result.creditsCharged || 1;
      console.log(`[TTS Read] Charged ${creditsCharged} voice credit(s) based on ${callsCount} API calls`);
      useUsageStore.getState().incrementLocalUsage('voice', creditsCharged);
    } catch (chargeErr) {
      console.error('[TTS Read] Failed to charge voice credits:', chargeErr);
      useUsageStore.getState().incrementLocalUsage('voice', 1);
    }
  };

  const generateAndPlayTts = async (messageId: string, fullText: string) => {
    const cleanedText = cleanTextForTTS(fullText);
    if (!cleanedText) {
      toast.error("This message has no speakable text.");
      return;
    }

    const chunks = splitTextIntoChunks(cleanedText);
    if (chunks.length === 0) {
      toast.error("This message has no speakable text.");
      return;
    }

    const sessionId = generateUUID();
    ttsSessionIdRef.current = sessionId;
    ttsStartTimeRef.current = Date.now();
    ttsCallsCountRef.current = 0;
    activeTtsMessageIdRef.current = messageId;
    setActiveTtsMessageId(messageId);
    setTtsStatus('preparing');
    ttsStatusRef.current = 'preparing';

    ttsChunksRef.current = chunks;
    ttsCurrentChunkIndexRef.current = 0;
    isCancelledRef.current = false;

    const queue = chunks.map(c => ({ text: c, url: null }));
    ttsAudioQueueRef.current = queue;

    // Cache the structure immediately
    ttsMessageCacheRef.current.set(messageId, { chunks, queue });

    await fetchChunk(0, chunks, queue, sessionId);
    if (isCancelledRef.current || activeTtsMessageIdRef.current !== messageId) return;

    if (chunks.length > 1) {
      fetchChunk(1, chunks, queue, sessionId);
    }

    setTtsStatus('playing');
    ttsStatusRef.current = 'playing';
    playQueueFrom(0, fullText);
  };

  const handlePlayTts = async (messageId: string, fullText: string) => {
    if (activeTtsMessageIdRef.current === messageId) {
      if (isTtsPaused()) {
        setTtsStatus('playing');
        ttsStatusRef.current = 'playing';
        if (activeAudioRef.current) {
          try {
            activeAudioRef.current.play();
          } catch (e) {
            console.error("Failed to play audio:", e);
          }
          playQueueFrom(ttsCurrentChunkIndexRef.current, fullText);
        } else {
          playQueueFrom(ttsCurrentChunkIndexRef.current, fullText);
        }
      } else if (ttsStatusRef.current === 'playing') {
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
        }
        setTtsStatus('paused');
        ttsStatusRef.current = 'paused';
        if (playResolveRef.current) {
          playResolveRef.current();
          playResolveRef.current = null;
        }
      } else if (ttsStatusRef.current === 'preparing') {
        await handleStopTts();
      }
      return;
    }

    if (activeTtsMessageIdRef.current) {
      await handleStopTts();
    }

    // Check Cache
    const cached = ttsMessageCacheRef.current.get(messageId);
    if (cached) {
      console.log(`[TTS Cache] Reusing cached audio for message: ${messageId}`);
      activeTtsMessageIdRef.current = messageId;
      setActiveTtsMessageId(messageId);
      ttsChunksRef.current = cached.chunks;
      ttsAudioQueueRef.current = cached.queue;
      ttsCurrentChunkIndexRef.current = 0;
      isCancelledRef.current = false;

      ttsSessionIdRef.current = generateUUID();
      ttsStartTimeRef.current = Date.now();
      ttsCallsCountRef.current = 0;

      setTtsStatus('playing');
      ttsStatusRef.current = 'playing';
      playQueueFrom(0, fullText);
      return;
    }

    await generateAndPlayTts(messageId, fullText);
  };

  // Clean up TTS and cache on unmount
  useEffect(() => {
    return () => {
      if (playResolveRef.current) {
        playResolveRef.current();
        playResolveRef.current = null;
      }
      if (activeTtsMessageIdRef.current) {
        if (activeAudioRef.current) {
          try {
            activeAudioRef.current.pause();
            activeAudioRef.current.src = '';
          } catch (e) {}
          activeAudioRef.current = null;
        }
        const durationSeconds = ttsStartTimeRef.current > 0 ? (Date.now() - ttsStartTimeRef.current) / 1000 : 0;
        const sessionId = ttsSessionIdRef.current;
        const callsCount = ttsCallsCountRef.current;
        aiService.voiceComplete(durationSeconds, sessionId || undefined, 2 + callsCount).catch(() => {});
      }
      clearTtsCache();
    };
  }, []);

  // Stop TTS and clear cache when active conversation changes
  useEffect(() => {
    handleStopTts();
    clearTtsCache();
  }, [activeConversation?.id]);

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isVoiceRoute = location.pathname.startsWith('/voice');
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(isVoiceRoute);

  // Initialize from localStorage, but default to true for voice routes
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();

  // Force collapse when switching TO a voice route
  useEffect(() => {
    if (isVoiceRoute) {
      setSidebarCollapsed(true);
    }
  }, [isVoiceRoute, setSidebarCollapsed]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Initialize anonymous identity if not logged in AND auth is fully initialized
    if (initialized && !user?.id && !getStoredAnonId()) {
      getOrCreateAnonymousIdentity();
    }

    return () => subscription.unsubscribe();
  }, [user?.id, initialized]);

  useEffect(() => {
    setShowVoiceOverlay(location.pathname.startsWith('/voice'));
  }, [location.pathname]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  useEffect(() => {
    const checkLock = () => {
      const lockedUntil = localStorage.getItem('chat_lockout');
      if (lockedUntil) {
        const remaining = Math.max(0, Math.ceil((parseInt(lockedUntil) - Date.now()) / 1000));
        setLockTimeRemaining(remaining);
        if (remaining === 0) {
          localStorage.removeItem('chat_lockout');
        }
      } else {
        setLockTimeRemaining(0);
      }
    };

    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleClearLock = () => {
    localStorage.removeItem('chat_lockout');
    localStorage.removeItem('voice_lockout');
    setLockTimeRemaining(0);
    toast.success('Lock cleared successfully');
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [displayedStreamingMessage, setDisplayedStreamingMessage] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [isStreamFinished, setIsStreamFinished] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const typewriterIntervalRef = useRef<number | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingOptimisticIdRef = useRef<string | null>(null);
  const fullContentRef = useRef('');
  const isStreamFinishedRef = useRef(false);
  const displayedMessageLengthRef = useRef(0);
  // Local loading state for conversation messages — isolated from the shared
  // store `loading` which is also set by Sidebar's fetchConversations.
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Performance: Memoize Markdown components to prevent heavy re-renders
  const markdownComponents = useMemo(() => ({
    code({ node, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      return match ? (
        <CodeBlock
          language={match[1]}
          value={String(children).replace(/\n$/, '')}
        />
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    table({ children }: any) {
      return (
        <div className={styles.tableWrapper}>
          <table>{children}</table>
        </div>
      );
    },
  }), []);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const filterThinkingTags = (content: any) => {
    if (!content) return '';
    if (typeof content !== 'string') return String(content);

    // Fast check if there are even any tags to process
    if (!content.includes('<think') && !content.includes('[SYSTEM')) {
      return content.trim();
    }

    let processed = content.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');
    processed = processed.replace(/<(think|thinking)>[\s\S]*/gi, '');
    processed = processed.replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '');
    return processed.trim();
  };

  // Performance: Throttle the heavy thinking-tag filtering
  const filteredStreamingMessage = useMemo(() =>
    filterThinkingTags(displayedStreamingMessage),
    [displayedStreamingMessage]
  );

  const estimateTokens = (messages: any[]) => {
    let totalChars = 0;
    messages.forEach(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      totalChars += (m.role?.length || 0) + content.length + 20;
    });
    return Math.ceil(totalChars / 3.5);
  };

  useEffect(() => {
    const normalizedId = id || null;
    const normalizedStreamingId = streamingIdRef.current || null;

    const shouldClear = (normalizedId && normalizedId !== normalizedStreamingId) ||
      (!normalizedId && !activeConversation?.id && !isGenerating);

    if (shouldClear) {
      setIsGenerating(false);
      setStreamingMessage('');
      setDisplayedStreamingMessage('');
      setStreamingStatus(null);
      setIsStreamFinished(false);
      fullContentRef.current = '';
      streamingIdRef.current = null;
    }

    const loadConversation = async () => {
      if (id && id !== activeConversation?.id) {
        // Skip loading from DB when we're actively streaming or just finished
        // streaming — the optimistic state set by handleSend is already correct.
        if (streamingIdRef.current === id || isGenerating) {
          return;
        }
        setIsLoadingConversation(true);
        const success = await setActiveConversation(id);
        setIsLoadingConversation(false);
        if (!success) {
          navigate('/chat');
        }
      } else if (!id && !isGenerating) {
        setActiveConversation(null);
      }
    };
    loadConversation();
  }, [id, setActiveConversation, navigate, activeConversation?.id, isGenerating]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (autoScrollEnabled && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      if (behavior === 'smooth') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  };

  const onScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

    // Check if user is near bottom (within 150px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isAtBottom);

    if (isGenerating) {
      // If user scrolls up, disable auto-scroll
      if (!isAtBottom && autoScrollEnabled) {
        setAutoScrollEnabled(false);
      }
      // If user scrolls back to bottom, re-enable
      else if (isAtBottom && !autoScrollEnabled) {
        setAutoScrollEnabled(true);
      }
    }
  };

  const forceScrollToBottom = () => {
    setAutoScrollEnabled(true);
    setShowScrollButton(false);
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  // Separate effect for message list updates (new messages)
  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  // High-frequency scroll for streaming (instant to avoid lag)
  useEffect(() => {
    if (isGenerating && autoScrollEnabled) {
      scrollToBottom('auto');
    }
  }, [displayedStreamingMessage, isGenerating, autoScrollEnabled]);

  useEffect(() => {
    setShowScrollButton(false);
  }, [id]);

  useEffect(() => {
    if (!isGenerating) {
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
      setDisplayedStreamingMessage('');
      fullContentRef.current = '';
      displayedMessageLengthRef.current = 0;
      return;
    }

    const typewriterInterval = 16; // ~60fps for maximum smoothness

    typewriterIntervalRef.current = window.setInterval(() => {
      setDisplayedStreamingMessage(prev => {
        if (fullContentRef.current.length > prev.length) {
          const bufferSize = fullContentRef.current.length - prev.length;

          let nextMessage = prev;
          // Adaptive scaling:
          // If stream is finished, dump everything much faster
          if (isStreamFinishedRef.current) {
            if (bufferSize < 400) {
              nextMessage = fullContentRef.current;
            } else {
              nextMessage = fullContentRef.current.slice(0, prev.length + Math.max(200, Math.floor(bufferSize / 1.5)));
            }
          } else {
            // Dynamic increments for "live" feel while handling bursts
            // Increased values for a "snappier" feel
            const increment = bufferSize > 2000 ? 800 :
              bufferSize > 1000 ? 400 :
                bufferSize > 400 ? 150 :
                  bufferSize > 100 ? 60 : 25;

            nextMessage = fullContentRef.current.slice(0, prev.length + increment);
          }
          displayedMessageLengthRef.current = nextMessage.length;
          return nextMessage;
        }
        return prev;
      });
    }, typewriterInterval);

    return () => {
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
    };
  }, [isGenerating]);

  useEffect(() => {
    if (isGenerating) {
      setAutoScrollEnabled(true);
    }
  }, [isGenerating]);

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour >= 5 && hour < 12) {
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      greeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 22) {
      greeting = 'Good evening';
    } else {
      greeting = "It's late night";
    }

    if (user) {
      const name = user.nickname || user.display_name?.split(' ')[0] || user.email?.split('@')[0];
      if (name) {
        return `${greeting}, ${name}`;
      }
    }
    return greeting;
  }, [user]);

  const suggestions = [
    { title: 'Write a technical blog', desc: 'About React 19 features', icon: <FileText size={18} /> },
    { title: 'Explain Quantum computing', desc: 'To a 10 year old kid', icon: <Sparkles size={18} /> },
    { title: 'Write an email', desc: 'To request a budget increase', icon: <Mail size={18} /> },
    { title: 'Debug my code', desc: 'Help find the memory leak', icon: <Code size={18} /> },
  ];

  const handleSend = async (text?: string, isRetry: boolean = false, retryAttachments: any[] = [], autoRetryCount: number = 0) => {
    let hasRetried = false;
    if (lockTimeRemaining > 0) return;

    const currentAttachments = isRetry ? retryAttachments : [...attachments];

    if (currentAttachments.some(a => a.isUploading)) return;

    const messageContent = text || '';
    if (!messageContent.trim() && currentAttachments.length === 0) return;

    let anonId = getStoredAnonId();
    if (!user?.id && !anonId) {
      const identity = await getOrCreateAnonymousIdentity();
      anonId = identity.anonId;
    }

    if ((!isRetry && isGenerating) || (!user?.id && !anonId)) return;

    let currentConvId = activeConversation?.id;
    const assistantOptimisticId = `temp_assistant_${Date.now()}`;

    // Set generating state early to show immediate feedback
    setIsGenerating(true);
    setStreamingMessage('');
    setDisplayedStreamingMessage('');
    fullContentRef.current = '';
    setAutoScrollEnabled(true);
    if (!isRetry) setStreamingStatus(null);
    setAttachments([]); // Clear attachments immediately

    // Initialize streaming refs early to prevent UI reset on navigation
    streamingOptimisticIdRef.current = assistantOptimisticId;

    const isVoice = location.pathname.startsWith('/voice');
    const tempConvId = currentConvId || generateUUID();
    const isNewConversation = !currentConvId;

    if (isNewConversation) {
      currentConvId = tempConvId;
      streamingIdRef.current = tempConvId;

      // 1. Optimistically set activeConversation and messages in store so UI renders immediately
      const tempConv: any = {
        id: tempConvId,
        title: messageContent.slice(0, 40) + '...',
        type: isVoice ? 'voice' : 'chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: user?.id,
        anon_id: anonId || undefined
      };

      const userOptimisticId = `temp_user_${Date.now()}`;
      const tempUserMsg: any = {
        id: userOptimisticId,
        conversation_id: tempConvId,
        role: 'user',
        content: messageContent,
        metadata: {
          mode: 'text',
          optimisticId: userOptimisticId,
          attachments: currentAttachments.map(a => ({ name: a.file?.name || a.name, type: a.type, url: a.url, extractedText: a.extractedText }))
        },
        created_at: new Date().toISOString()
      };

      useChatStore.setState({
        conversations: [tempConv, ...useChatStore.getState().conversations],
        activeConversation: tempConv,
        messages: [tempUserMsg]
      });

      // 2. Navigate immediately
      navigate(isVoice ? `/voice/chat/${tempConvId}` : `/chat/${tempConvId}`, { replace: true });

      // 3. Database inserts in background, but awaited in sequence so backend Chat is correct
      const newConv = await createConversation(user?.id, messageContent.slice(0, 40) + '...', isVoice ? 'voice' : 'chat', anonId || undefined, tempConvId);
      if (!newConv) {
        setIsGenerating(false);
        return;
      }
    } else {
      streamingIdRef.current = currentConvId || null;
    }

    let userMsg: any = null;
    if (!isRetry) {
      // Find the optimistic ID if we already added it in the isNewConversation block,
      // otherwise generate a new one.
      const existingTempMsg = isNewConversation
        ? useChatStore.getState().messages.find(m => m.id.startsWith('temp_user_'))
        : null;
      const userOptimisticId = existingTempMsg?.id || `temp_user_${Date.now()}`;

      userMsg = await addMessage(currentConvId!, 'user', messageContent, {
        optimisticId: userOptimisticId,
        mode: 'text',
        attachments: currentAttachments.map(a => ({ name: a.file?.name || a.name, type: a.type, url: a.url, extractedText: a.extractedText }))
      });
    } else {
      userMsg = useChatStore.getState().messages.filter(m => m.role === 'user').pop();
    }

    if (!userMsg) {
      setIsGenerating(false);
      return;
    }

    setIsProcessingVideo(currentAttachments.some(a => a.type === 'video'));
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreamFinished(false);
    isStreamFinishedRef.current = false;
    displayedMessageLengthRef.current = 0;
    let assistantMessage = '';
    let isStreamFinishedLocal = false;
    let isSaved = false;

    try {
      let currentSession = session;
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: any } }>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        if (data?.session) currentSession = data.session;
      } catch (e) {
        console.warn('Session fetch timeout, using cached session');
      }

      const messageHistory = useChatStore.getState().messages
        .filter(m => !m.metadata?.error && m.id !== userMsg?.id)
        .map(m => ({
          role: m.role,
          content: m.content,
          metadata: {
            ...m.metadata,
            attachments: m.metadata?.attachments || []
          }
        }));

      messageHistory.push({
        role: 'user',
        content: userMsg.content,
        metadata: {
          ...userMsg.metadata,
          attachments: userMsg.metadata?.attachments || []
        }
      });

      const contextWindow = selectedModel?.context_window || 4096;
      const reservedTokens = 1024;
      const safeThreshold = contextWindow - reservedTokens - 50;

      let finalMessagesForRequest = [...messageHistory];
      const requestTokenSize = estimateTokens(finalMessagesForRequest);

      if (requestTokenSize > safeThreshold) {
        while (estimateTokens(finalMessagesForRequest) > safeThreshold && finalMessagesForRequest.length > 2) {
          const indexToRemove = finalMessagesForRequest[0].role === 'system' ? 1 : 0;
          finalMessagesForRequest.splice(indexToRemove, 1);
        }
      }

      const anonId = getStoredAnonId() || '';

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': currentSession?.access_token ? `Bearer ${currentSession.access_token}` : '',
          'X-Anon-Id': anonId,
          'X-Fingerprint': await generateFingerprintHash()
        },
        body: JSON.stringify({
          messages: finalMessagesForRequest,
          model: selectedModel?.model_id,
          attachments: currentAttachments.map(a => ({ name: a.file?.name || a.name, type: a.type, url: a.url, extractedText: a.extractedText })),
          messageId: userMsg?.id,
          conversationId: currentConvId,
          mode: isVoiceRoute ? 'voice' : 'chat'
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Abuse Detection Handling
        if (errorData.code === 'ABUSE_COOLDOWN') {
          const resetsIn = errorData.retryAfter || 30;
          setLimitModal({
            isOpen: true,
            type: 'abuse-cooldown',
            limitInfo: {
              resetsIn,
              message: errorData.message
            }
          });
          throw new Error(errorData.message || 'Temporary cooldown');
        }

        if (errorData.code === 'ABUSE_CAPTCHA_REQUIRED') {
          setLimitModal({
            isOpen: true,
            type: 'abuse-captcha',
            limitInfo: {
              message: errorData.message
            }
          });
          throw new Error('Verification required');
        }

        if (errorData.code === 'ABUSE_AUTH_REQUIRED') {
          setLimitModal({
            isOpen: true,
            type: 'abuse-auth',
            limitInfo: {
              message: errorData.message
            }
          });
          throw new Error('Authentication required');
        }

        if (errorData.code === 'ABUSE_IP_RESTRICTED') {
          setLimitModal({
            isOpen: true,
            type: 'abuse-restricted',
            limitInfo: {
              message: errorData.message
            }
          });
          throw new Error('Access restricted');
        }

        if (response.status === 429) {
          const isMonthlyLimit = errorData.reason === 'monthly';
          const resetsIn = isMonthlyLimit ? 24 * 60 * 60 : (errorData.resetsIn || 60);
          const lockoutTime = Date.now() + (resetsIn * 1000);
          if (errorData.tool === 'voice') {
            localStorage.setItem('voice_lockout', lockoutTime.toString());
          } else {
            localStorage.setItem('chat_lockout', lockoutTime.toString());
          }

          setLimitModal({
            isOpen: true,
            type: user ? 'tiered' : 'anonymous',
            limitInfo: {
              limit: errorData.limit,
              current: errorData.current,
              resetsIn: resetsIn,
              reason: errorData.reason,
              tool: errorData.tool || 'chat',
              message: errorData.message,
              tier: user ? user.plan_type || (user as any).user_metadata?.tier || 'free' : 'Anonymous'
            }
          });

          const limitError = new Error(errorData.message || 'Rate limit exceeded');
          (limitError as any).isRateLimit = true;
          throw limitError;
        }

        if (response.status === 401 && !user) {
          // Anonymous user tried something requiring auth (e.g. upload)
          setLimitModal({ isOpen: true, type: 'anonymous-upload' });
          throw new Error('Authentication required');
        }

        throw new Error(errorData.message || errorData.error || 'API Connection Error');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader!.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine === 'data: [DONE]') {
            isStreamFinishedLocal = true;
            if (streamingIdRef.current === currentConvId) {
              setIsStreamFinished(true);
              isStreamFinishedRef.current = true;
            }
            break;
          }

          if (trimmedLine.startsWith('data: ')) {
            let apiError: Error | null = null;
            try {
              const dataString = trimmedLine.substring(6);
              if (dataString === '[DONE]') {
                isStreamFinishedLocal = true;
                if (streamingIdRef.current === currentConvId) {
                  setIsStreamFinished(true);
                  isStreamFinishedRef.current = true;
                }
                break;
              }

              const data = JSON.parse(dataString);
              if (data.content) {
                assistantMessage += data.content;
                if (streamingIdRef.current === currentConvId) {
                  fullContentRef.current = assistantMessage;
                  setStreamingMessage(assistantMessage);
                }
              } else if (data.status) {
                if (streamingIdRef.current === currentConvId) {
                  setStreamingStatus(data.status);
                }
              } else if (data.error) {
                apiError = new Error(data.error);
              }
            } catch (e) {
              // Ignore standard parsing errors
            }
            if (apiError) {
              throw apiError;
            }
          }
        }

        if (isStreamFinishedLocal) break;
      }

      if (currentConvId && !isSaved) {
        isSaved = true;
        const finalContent = assistantMessage.trim() || "😓🫠";

        // Wait for typewriter to fully catch up before saving to prevent content jump/flash
        // Only wait if we are still looking at the same conversation
        let waitCount = 0;
        while (streamingIdRef.current === currentConvId && fullContentRef.current.length > displayedMessageLengthRef.current && waitCount < 30) {
          await new Promise(r => setTimeout(r, 30));
          waitCount++;
        }

        // Final catch up
        setDisplayedStreamingMessage(finalContent);

        // Clear generating/streaming state BEFORE adding the message to the store
        // to prevent rendering the streaming message as a duplicate during the DB write.
        if (streamingIdRef.current === currentConvId) {
          setIsGenerating(false);
          setIsProcessingVideo(false);
          setStreamingMessage('');
          setDisplayedStreamingMessage('');
          fullContentRef.current = '';
          setStreamingStatus(null);
          streamingIdRef.current = null;
        }

        // Add to store with the same optimistic ID used for streaming
        await addMessage(currentConvId, 'assistant', finalContent, {
          optimisticId: assistantOptimisticId,
          mode: 'text'
        });

        // Update usage indicator — only for chat mode
        // Voice credits are charged by VoiceOverlay via /voice-complete endpoint
        if (!isVoiceRoute) {
          useUsageStore.getState().incrementLocalUsage('chat');
        }

        streamingOptimisticIdRef.current = null;

        // Wait a tiny bit more for store sync before clearing streaming state
        await new Promise(r => setTimeout(r, 100));
      }

    } catch (error: any) {
      if (error?.name === 'AbortError') {
        const hasPartialContent = assistantMessage.trim().length > 0;
        const content = hasPartialContent ? assistantMessage.trim() : 'The request was terminated by the user.';
        const metadata = {
          error: !hasPartialContent,
          aborted: true,
          interrupted: hasPartialContent,
          timestamp: Date.now()
        };

        if (currentConvId) {
          await addMessage(currentConvId, 'assistant', content, metadata);
        }
        return;
      }

      if (autoRetryCount < 1) {
        hasRetried = true;
        setStreamingStatus('Retrying with optimized context...');
        return handleSend(text, true, currentAttachments, autoRetryCount + 1);
      }

      const hasPartialContent = assistantMessage.trim().length > 0;
      if (hasPartialContent && currentConvId) {
        await addMessage(currentConvId, 'assistant', assistantMessage.trim(), {
          interrupted: true,
          timestamp: Date.now()
        });
      }

      let displayError = error.message || 'encountered a service interruption.';
      displayError = sanitizeErrorMessage(displayError);

      if (currentConvId) {
        await addMessage(currentConvId, 'assistant', displayError, {
          error: true,
          originalError: error.message,
          timestamp: Date.now()
        });
      }
    } finally {
      // Only clear local UI state if this was the active request for this conversation
      if (!hasRetried) {
        if (streamingIdRef.current === currentConvId) {
          setIsGenerating(false);
          setIsProcessingVideo(false);
          setStreamingMessage('');
          setDisplayedStreamingMessage('');
          fullContentRef.current = '';
          setStreamingStatus(null);
          streamingIdRef.current = null;
        }
        streamingOptimisticIdRef.current = null;
      }
    }
  };


  return (
    <DashboardLayout
      isCollapsed={sidebarCollapsed}
      setIsCollapsed={setSidebarCollapsed}
    >
      <>
        <div className={styles.container}>
          <div className={styles.header}>
            <ModelSelector />
          </div>

          <div
            className={styles.messagesList}
            ref={scrollContainerRef}
            onScroll={onScroll}
          >
            {(!isGenerating && id && (isLoadingConversation || (activeConversation && activeConversation.id !== id))) ? (
              <div className={styles.loadingState}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`msg-skeleton-${i}`} className={`${styles.messageRow} ${i % 2 === 0 ? '' : styles.user}`}>
                    <div className={`${styles.avatar} skeleton skeleton-circle`} style={{ width: '32px', height: '32px' }}></div>
                    <div className={`${styles.bubble} skeleton`} style={{ width: i % 2 === 0 ? '60%' : '40%', height: '80px', border: 'none' }}></div>
                  </div>
                ))}
              </div>
            ) : !id && messages.length === 0 ? (
              <div className={styles.emptyState}>
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className={styles.emptyGreetingContainer}
                >
                  <div className={styles.logoIconBox}>
                    <img
                      src="/Sree-Ai-icon-only-Sree-AI-brandmark.png"
                      alt="Sree AI brandmark"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        // padding: '14px' 
                      }}
                    />
                  </div>
                  <h1 className={styles.title}>{greetingText}</h1>
                  <p className={styles.subtitle}>How can Sree AI help you today?</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className={styles.suggestionGrid}
                >
                  {suggestions.map((s) => (
                    <button key={s.title} className={styles.suggestionCard} onClick={() => handleSend(s.title)}>
                      <div className={styles.suggestionArrow}>
                        <ArrowUpRight size={16} />
                      </div>
                      <div className={styles.suggestionIcon}>{s.icon}</div>
                      <div className={styles.suggestionContent}>
                        <span className={styles.suggestionTitle}>{s.title}</span>
                        <span className={styles.suggestionDesc}>{s.desc}</span>
                      </div>
                    </button>
                  ))}
                </motion.div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <ChatMessage
                    key={m.metadata?.optimisticId || m.id || `msg-${i}`}
                    message={m}
                    index={i}
                    markdownComponents={markdownComponents}
                    filterThinkingTags={filterThinkingTags}
                    activeTtsMessageId={activeTtsMessageId}
                    ttsStatus={ttsStatus}
                    onPlayTts={handlePlayTts}
                    onStopTts={handleStopTts}
                    onRetry={async (index, _content, _attachments, id) => {
                      if (activeConversation?.id) {
                        const allMessages = useChatStore.getState().messages;

                        // 1. Find the start of the "error chain" (consecutive assistant errors/interruptions)
                        let firstErrorIndex = index;
                        while (firstErrorIndex > 0) {
                          const prevMsg = allMessages[firstErrorIndex - 1];
                          if (prevMsg.role === 'assistant' && (prevMsg.metadata?.error || prevMsg.metadata?.interrupted || prevMsg.metadata?.aborted)) {
                            firstErrorIndex--;
                          } else {
                            break;
                          }
                        }

                        // 2. Find the user message that preceded this error chain
                        let userMsgIndex = -1;
                        for (let j = firstErrorIndex - 1; j >= 0; j--) {
                          if (allMessages[j].role === 'user') {
                            userMsgIndex = j;
                            break;
                          }
                        }

                        if (userMsgIndex !== -1) {
                          const userMsg = allMessages[userMsgIndex];
                          const userContent = userMsg.content;
                          // Ensure we use the full attachments metadata from the message
                          const userAttachments = userMsg.metadata?.attachments || [];

                          // Map back to the format handleSend expects if necessary
                          // handleSend expects an array of attachments with { url, type, name, extractedText }
                          // which matches what's stored in userMsg.metadata.attachments

                          // 3. Truncate from the user message ID onwards
                          // This permanently deletes the user message, the error(s), and everything after
                          await useChatStore.getState().truncateHistory(activeConversation.id, userMsg.id);

                          // 4. Re-send as a fresh turn (isRetry=false to ensure it gets re-added to DB)
                          handleSend(userContent, false, userAttachments, 0);
                        } else {
                          // Fallback: if no user message found, truncate from the clicked error message
                          const targetId = allMessages[firstErrorIndex]?.id || id;
                          if (targetId) {
                            await useChatStore.getState().truncateHistory(activeConversation.id, targetId);
                          }
                        }
                      }
                    }}
                  />
                ))}
                {isGenerating && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant' || messages[messages.length - 1]?.content !== streamingMessage) && (
                  <ChatMessage
                    key={streamingOptimisticIdRef.current || 'streaming-assistant'}
                    isStreaming
                    index={messages.length}
                    message={{
                      role: 'assistant',
                      content: `${filteredStreamingMessage} `,
                      metadata: {
                        mode: 'text',
                        optimisticId: streamingOptimisticIdRef.current
                      }
                    }}
                    streamingStatus={streamingStatus}
                    isProcessingVideo={isProcessingVideo}
                    markdownComponents={markdownComponents}
                    filterThinkingTags={filterThinkingTags}
                    onRetry={() => { }}
                  />
                )}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>

          <AnimatePresence>
            {showScrollButton && (
              <div className={`${styles.scrollButtonWrapper} ${isGenerating ? styles.loadingBtnWrapper : styles.arrowBtnWrapper}`}>
                <motion.button
                  key={isGenerating ? 'loading-btn' : 'arrow-btn'}
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  onClick={forceScrollToBottom}
                  className={`${styles.scrollButton} ${isGenerating ? styles.loadingBtn : styles.arrowBtn}`}
                  title={isGenerating ? "AI is writing... click to scroll to bottom" : "Scroll to bottom"}
                  type="button"
                >
                  {isGenerating ? (
                    <>
                      <span className={styles.dot}></span>
                      <span className={styles.dot}></span>
                      <span className={styles.dot}></span>
                    </>
                  ) : (
                    <ArrowDown size={18} strokeWidth={2.5} />
                  )}
                </motion.button>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {lockTimeRemaining > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={styles.lockBanner}
              >
                <Lock size={14} />
                <span>Account Locked for {formatTime(lockTimeRemaining * 1000)}</span>
                <Clock size={14} style={{ marginLeft: '4px', opacity: 0.7 }} />
                <button
                  type="button"
                  className={styles.unlockRetryBtn}
                  onClick={handleClearLock}
                  title="Clear lockout limit"
                >
                  <RotateCcw size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <ChatInput
            onSend={(text) => handleSend(text, false)}
            onStop={handleStop}
            isGenerating={isGenerating}
            hasMessages={messages.length > 0}
            onVoiceLaunch={() => navigate(id ? `/voice/chat/${id}` : '/voice')}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            disabled={lockTimeRemaining > 0}
            placeholderText={lockTimeRemaining > 0 ? `Try After ${formatTime(lockTimeRemaining * 1000)}...` : undefined}
            onAuthRequired={() => setLimitModal({ isOpen: true, type: 'anonymous-upload' })}
          />

        </div>

        <AnimatePresence>
          {showVoiceOverlay && (
            <VoiceOverlay
              initialConversationId={id}
              onClose={() => navigate(id ? `/chat/${id}` : '/chat')}
            />
          )}
        </AnimatePresence>

        <LimitModal
          isOpen={limitModal.isOpen}
          onClose={() => setLimitModal(prev => ({ ...prev, isOpen: false }))}
          type={limitModal.type}
          limitInfo={limitModal.limitInfo}
        />
      </>
    </DashboardLayout>
  );
};

export default ChatPage;

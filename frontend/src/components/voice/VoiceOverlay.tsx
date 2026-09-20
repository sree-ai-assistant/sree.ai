import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Clock, ArrowRight, Sparkles, Zap, RotateCcw, Volume2, Hourglass, Eye, EyeOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../store/chat.store';
import { useAuthStore } from '../../store/auth.store';
import { useUsageStore } from '../../store/usage.store';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { VoiceVisualizer } from './VoiceVisualizer';
import { aiService } from '../../lib/api';
import { LiveAudioManager } from '../../lib/liveAudio';
import { CodeBlock } from '../chat/CodeBlock';
import styles from './VoiceOverlay.module.css';
import { getStoredAnonId, generateFingerprintHash } from '../../lib/fingerprint';

interface VoiceOverlayProps {
  onClose: () => void;
  initialConversationId?: string | null;
}

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ onClose, initialConversationId }) => {
  const { user } = useAuthStore();
  const { messages, createConversation, addMessage } = useChatStore();
  const navigate = useNavigate();

  // Memoized markdown components for the voice response display
  const voiceMarkdownComponents = useMemo(() => ({
    h1: ({ children }: any) => <h3 className={styles.voiceMdH1}>{children}</h3>,
    h2: ({ children }: any) => <h4 className={styles.voiceMdH2}>{children}</h4>,
    h3: ({ children }: any) => <h5 className={styles.voiceMdH3}>{children}</h5>,
    h4: ({ children }: any) => <h6 className={styles.voiceMdH4}>{children}</h6>,
    h5: ({ children }: any) => <span className={styles.voiceMdH5}>{children}</span>,
    h6: ({ children }: any) => <span className={styles.voiceMdH6}>{children}</span>,
    p: ({ children }: any) => <p className={styles.voiceMdP}>{children}</p>,
    strong: ({ children }: any) => <strong className={styles.voiceMdStrong}>{children}</strong>,
    em: ({ children }: any) => <em className={styles.voiceMdEm}>{children}</em>,
    ul: ({ children }: any) => <ul className={styles.voiceMdUl}>{children}</ul>,
    ol: ({ children }: any) => <ol className={styles.voiceMdOl}>{children}</ol>,
    li: ({ children }: any) => <li className={styles.voiceMdLi}>{children}</li>,
    blockquote: ({ children }: any) => <blockquote className={styles.voiceMdBlockquote}>{children}</blockquote>,
    hr: () => <hr className={styles.voiceMdHr} />,
    table: ({ children }: any) => (
      <div className={styles.voiceMdTableWrap}>
        <table className={styles.voiceMdTable}>{children}</table>
      </div>
    ),
    th: ({ children }: any) => <th className={styles.voiceMdTh}>{children}</th>,
    td: ({ children }: any) => <td className={styles.voiceMdTd}>{children}</td>,
    pre: ({ children }: any) => <>{children}</>,
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-([a-zA-Z0-9_+#.-]+)/.exec(className || '');
      const rawCode = String(children).replace(/\n$/, '');

      if (match) {
        return <CodeBlock language={match[1]} value={rawCode} />;
      }

      if (!inline && rawCode.includes('\n')) {
        return <CodeBlock language="text" value={rawCode} />;
      }

      return (
        <code className={styles.voiceMdInlineCode} {...props}>
          {children}
        </code>
      );
    },
    a: ({ href, children }: any) => (
      <a href={href} className={styles.voiceMdLink} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
  }), []);

// Helper to clean transcript stream and protect against accidental code block formatting issues
const cleanMarkdownTranscript = (text: string): string => {
  if (!text) return '';

  let cleaned = text;

  // 1. Ensure opening fence attached to prior text gets its own preceding blank lines:
  // e.g. "some text```html" -> "some text\n\n```html"
  cleaned = cleaned.replace(/([^\n])\s*(```[a-zA-Z0-9_+#.-]*)/g, '$1\n\n$2');

  // 2. Handle lines starting with ``` and any trailing spaces / attached conversational text:
  // e.g. "```   To keep going..." -> "```\n\nTo keep going..."
  // e.g. "```   \n" -> "```\n"
  // e.g. "```   python" -> "```python"
  cleaned = cleaned.replace(/(^|\n)[ \t]*(```)[ \t]*(.*)/g, (match, prefix, fence, rest) => {
    const trimmedRest = rest.trim();
    if (!trimmedRest) {
      return `${prefix}\`\`\``;
    }
    // If it's a single valid language identifier (no spaces), preserve as opening fence
    if (/^[a-zA-Z0-9_+#.-]+$/.test(trimmedRest)) {
      return `${prefix}\`\`\`${trimmedRest}`;
    }
    // Otherwise it is conversational speech / prose attached after closing backticks
    return `${prefix}\`\`\`\n\n${trimmedRest}`;
  });

  // 3. Ensure closing code fence gets its own newline if glued directly to code:
  // e.g. "</svg>```" -> "</svg>\n```"
  cleaned = cleaned.replace(/([^\n])\s*(```)\s*$/g, '$1\n$2');

  // 4. Auto-close dangling unclosed code fences BEFORE splitting into parts
  // This prevents unclosed blocks from swallowing all subsequent speech
  const fenceCount = (cleaned.match(/(?:^|\n)[ \t]*```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    cleaned = cleaned.trimEnd() + '\n```\n';
  }

  // 5. Protect regular prose from becoming indented code blocks (4+ spaces):
  // Split by fenced code blocks so we ONLY strip false indentation OUTSIDE code fences
  const parts = cleaned.split(/(```[\s\S]*?```)/g);
  const processed = parts.map((part, index) => {
    // Even indices are regular conversational text outside of code fences
    if (index % 2 === 0) {
      return part.replace(/^[ \t]{2,}/gm, '');
    }
    // Odd indices are inside code blocks: preserve code formatting and indentation
    return part;
  });

  return processed.join('');
};

  // Session State
  const [isSessionActive, setIsSessionActive] = useState(() => {
    const lockedUntil = localStorage.getItem('voice_lockout');
    if (lockedUntil) {
      const remaining = Math.max(0, Math.ceil((parseInt(lockedUntil) - Date.now()) / 1000));
      if (remaining > 0) {
        return false;
      }
    }
    return true;
  });
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
  const conversationIdRef = useRef<string | null>(initialConversationId || null);

  // Update ref whenever state changes
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Rate Limit State
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    message: string;
    resetsIn: number;
    upgradeUrl: string;
  } | null>(() => {
    const lockedUntil = localStorage.getItem('voice_lockout');
    if (lockedUntil) {
      const remaining = Math.max(0, Math.ceil((parseInt(lockedUntil) - Date.now()) / 1000));
      if (remaining > 0) {
        return {
          message: 'Account temporarily locked due to limit exceeded.',
          resetsIn: remaining,
          upgradeUrl: '/pricing'
        };
      }
    }
    return null;
  });
  const [countdown, setCountdown] = useState<number>(() => {
    const lockedUntil = localStorage.getItem('voice_lockout');
    if (lockedUntil) {
      const remaining = Math.max(0, Math.ceil((parseInt(lockedUntil) - Date.now()) / 1000));
      if (remaining > 0) {
        return remaining;
      }
    }
    return 0;
  });

  // Sync state with props (important for "New Chat" navigation)
  const initialConversationIdRef = useRef(initialConversationId);
  useEffect(() => {
    initialConversationIdRef.current = initialConversationId;
    setConversationId(initialConversationId || null);
  }, [initialConversationId]);

  // Store refs to avoid stale closures in VAD/Recorder logic
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Audio State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'>('idle');

  // ─── Live Mode State ───────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<'connecting' | 'live' | 'legacy'>('connecting');
  const [liveModel, setLiveModel] = useState<string>('');
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveAudioRef = useRef<LiveAudioManager | null>(null);
  const liveSessionIdRef = useRef<string | null>(null);
  const liveStartTimeRef = useRef<number>(0);
  const liveTranscriptRef = useRef<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const currentTurnUserTextRef = useRef<string>('');
  const currentTurnAiTextRef = useRef<string>('');
  const isSavingTurnRef = useRef<boolean>(false);

  // Continuous Session Duration Limit State
  const [sessionLimitInfo, setSessionLimitInfo] = useState<{
    tier: string;
    maxMinutes: number;
    message?: string;
  } | null>(null);
  const sessionLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // High Traffic / Latency Notice State (when falling back to standard voice mode)
  const [showLatencyNotice, setShowLatencyNotice] = useState<boolean>(false);
  const latencyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerLatencyNotice = useCallback(() => {
    setShowLatencyNotice(true);
    if (latencyNoticeTimerRef.current) {
      clearTimeout(latencyNoticeTimerRef.current);
    }
    latencyNoticeTimerRef.current = setTimeout(() => {
      setShowLatencyNotice(false);
      latencyNoticeTimerRef.current = null;
    }, 18000);
  }, []);

  // Content State
  const [transcript, setTranscript] = useState('');
  const [displayedAiResponse, setDisplayedAiResponse] = useState('');
  const [showAiResponses, setShowAiResponses] = useState<boolean>(true);
  const [showFlyingTranscript, setShowFlyingTranscript] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Refs for VAD and Audio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aiResponseScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll voice response area as new content arrives
  useEffect(() => {
    if (displayedAiResponse && aiResponseScrollRef.current) {
      const el = aiResponseScrollRef.current;
      // Only auto-scroll if user is near the bottom (within 80px)
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [displayedAiResponse]);

  const SILENCE_THRESHOLD = 20; // Increased from 5 to ignore more background noise
  const SILENCE_DURATION = 3000; // 3 seconds as requested

  const recordingStartTimeRef = useRef<number>(0);
  const shouldProcessRef = useRef<boolean>(true);
  const isUnmountedRef = useRef<boolean>(false);

  const filterThinkingTags = (content: string) => {
    if (!content) return '';
    // Remove closed tags
    let processed = content.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');
    // Remove open tags and everything after them (for streaming)
    processed = processed.replace(/<(think|thinking)>[\s\S]*/gi, '');
    // Remove system instructions
    processed = processed.replace(/\[SYSTEM INSTRUCTION: [\s\S]*?\]/gi, '');
    // Trim leading whitespace (e.g. from stripped thinking blocks), but preserve intentional trailing spaces
    return processed.replace(/^\s+/, '');
  };

  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds >= 86400) {
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      return { val: `${days}d ${hours}h`, unit: 'Remaining' };
    }
    if (totalSeconds >= 3600) {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return { val: `${hours}h ${minutes}m`, unit: 'Remaining' };
    }
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return { val: `${minutes}m ${seconds}s`, unit: 'Remaining' };
    }
    return { val: `${totalSeconds}`, unit: 'Secs' };
  };

  const typewriter = (text: string, callback: (t: string) => void, speed = 5) => {
    return new Promise<void>((resolve) => {
      let i = 0;
      const interval = setInterval(() => {
        callback(text.slice(0, i + 1));
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          resolve();
        }
      }, speed);
    });
  };

  const loadingSequence = useRef<any>(null);
  const startLoadingMessages = () => {
    const messages = ["Received your Request", "Ai is processing", "It's Ready"];
    let index = 0;
    setLoadingMessage(messages[0]);
    loadingSequence.current = setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingMessage(messages[index]);
    }, 4000);
  };

  const stopLoadingMessages = () => {
    if (loadingSequence.current) {
      clearInterval(loadingSequence.current);
      loadingSequence.current = null;
    }
    setLoadingMessage('');
  };

  // ─── Save Completed Live Turn ────────────────────────────────────
  const saveCompletedTurn = useCallback(async (forcedUserText?: string, forcedAiText?: string) => {
    if (isSavingTurnRef.current) return;

    const userText = (forcedUserText !== undefined ? forcedUserText : currentTurnUserTextRef.current).trim();
    const aiText = (forcedAiText !== undefined ? forcedAiText : currentTurnAiTextRef.current).trim();

    // Reset turn buffers immediately to avoid double saving
    if (forcedUserText === undefined) currentTurnUserTextRef.current = '';
    if (forcedAiText === undefined) currentTurnAiTextRef.current = '';

    // If there is no AI response and no user text, nothing to save
    if (!aiText && !userText) return;

    isSavingTurnRef.current = true;

    try {
      let currentConvId = conversationIdRef.current;
      const anonId = localStorage.getItem('sreeai_anon_id') || undefined;

      if (!currentConvId) {
        const title = (userText || aiText).slice(0, 30);
        const conv = await createConversation(user?.id, title, 'voice', anonId);
        if (conv) {
          currentConvId = conv.id;
          setConversationId(conv.id);
          conversationIdRef.current = conv.id;
          if (!initialConversationIdRef.current) {
            navigate(`/voice/chat/${conv.id}`, { replace: true });
          }
        }
      }

      if (currentConvId) {
        // Fallback for user text if Gemini didn't transcribe speech but generated a reply
        const finalUserText = userText || '🎙️ (Voice prompt)';

        // 1. Save user prompt first
        await addMessage(currentConvId, 'user', finalUserText, { mode: 'voice-live' });

        // 2. Save assistant response second
        if (aiText) {
          await addMessage(currentConvId, 'assistant', aiText, { mode: 'voice-live' });
        }
      }
    } catch (err) {
      console.error('[Voice Live] Failed to save completed turn:', err);
    } finally {
      isSavingTurnRef.current = false;
    }
  }, [user, createConversation, addMessage, navigate]);

  // ─── Live Mode: WebSocket Connection ─────────────────────────────
  const tryConnectLive = useCallback(async () => {
    if (!isSessionActive) {
      setVoiceMode('legacy');
      return;
    }

    // Do not reconnect if already open or connecting
    if (liveWsRef.current && (liveWsRef.current.readyState === WebSocket.OPEN || liveWsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('[Voice Live] WebSocket is already active, skipping duplicate connect');
      return;
    }

    setVoiceMode('connecting');
    setStatus('idle');

    try {
      // Get auth token for WebSocket
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const anonId = !token ? (localStorage.getItem('sreeai_anon_id') || '') : '';
      const selectedVoice = user?.live_voice || localStorage.getItem('sreeai_live_voice') || 'Zephyr';

      // Build WebSocket URL
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api$/, '');
      const wsUrl = `${wsBase}/api/live/voice?token=${encodeURIComponent(token)}&anonId=${encodeURIComponent(anonId)}&voice=${encodeURIComponent(selectedVoice)}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      // Connection timeout
      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('[Voice Live] Connection timeout, falling back to legacy');
          ws.close();
          setVoiceMode('legacy');
          setTimeout(startRecording, 500);
        }
      }, 8000);

      ws.onopen = () => {
        console.log('[Voice Live] WebSocket connected, waiting for session setup...');
      };

      ws.onmessage = async (event) => {
        // Handle binary audio data from Gemini (via backend proxy)
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          if (liveAudioRef.current) {
            liveAudioRef.current.enqueuePcm(arrayBuffer);
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          if (liveAudioRef.current) {
            liveAudioRef.current.enqueuePcm(event.data);
          }
          return;
        }

        // Handle JSON control messages
        try {
          const msg = JSON.parse(event.data as string);

          switch (msg.type) {
            case 'session-start': {
              clearTimeout(connectTimeout);
              setVoiceMode('live');
              setLiveModel(msg.model || '');
              liveSessionIdRef.current = msg.sessionId;
              liveStartTimeRef.current = Date.now();
              currentTurnUserTextRef.current = '';
              currentTurnAiTextRef.current = '';
              console.log(`[Voice Live] ✅ Session started: model=${msg.model}`);

              // Tier-based continuous session duration limit tracking
              const userTier = msg.tier || (user ? 'free' : 'anonymous');
              const maxMinutes = msg.maxDurationMinutes || (userTier === 'anonymous' ? 3 : userTier === 'free' ? 5 : userTier === 'starter' ? 10 : 20);
              const maxSeconds = msg.maxDurationSeconds || (maxMinutes * 60);

              if (sessionLimitTimerRef.current) {
                clearTimeout(sessionLimitTimerRef.current);
              }

              sessionLimitTimerRef.current = setTimeout(() => {
                console.log(`[Voice Live] Continuous session limit reached (${maxMinutes}m for ${userTier})`);
                saveCompletedTurn();
                cleanupLive();
                setStatus('idle');
                setSessionLimitInfo({
                  tier: userTier,
                  maxMinutes,
                  message: `For ${userTier} plan, the continuous live session limit is ${maxMinutes} minutes.`,
                });
              }, maxSeconds * 1000);

              // Seed prior conversation context into the Live session if entering from a chat
              if (messagesRef.current && messagesRef.current.length > 0) {
                const priorMessages = messagesRef.current
                  .slice(-50)
                  .map(m => ({ role: m.role, content: m.content }));

                if (priorMessages.length > 0 && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'init-context',
                    messages: priorMessages,
                  }));
                  console.log(`[Voice Live] Sent ${priorMessages.length} prior conversation messages for context (limit: 50)`);
                }
              }

              // Initialize audio capture and playback
              try {
                const audioManager = new LiveAudioManager({
                  onPcmData: (pcmBuffer) => {
                    // Send PCM audio to backend via WebSocket
                    if (liveWsRef.current?.readyState === WebSocket.OPEN) {
                      liveWsRef.current.send(pcmBuffer);
                    }
                  },
                  onAmplitude: () => {
                    // Amplitude data for visualizer (handled by VoiceVisualizer via stream)
                  },
                  onPlaybackEnded: () => {
                    setStatus('listening');
                  },
                });

                await audioManager.initialize();
                const micStream = await audioManager.startCapture();
                audioManager.startPlayback();

                liveAudioRef.current = audioManager;
                setStream(micStream);
                setStatus('listening');
              } catch (audioErr) {
                console.error('[Voice Live] Audio setup failed:', audioErr);
                cleanupLive();
                setVoiceMode('legacy');
                triggerLatencyNotice();
                setTimeout(startRecording, 500);
              }
              break;
            }

            case 'fallback': {
              clearTimeout(connectTimeout);
              console.log(`[Voice Live] Fallback to legacy: ${msg.reason}`);
              cleanupLive();
              setVoiceMode('legacy');
              triggerLatencyNotice();
              setTimeout(startRecording, 500);
              break;
            }

            case 'transcript':
            case 'input-transcript': {
              if (msg.role === 'user' || msg.type === 'input-transcript') {
                // If assistant was speaking from an earlier turn that hasn't saved yet, flush it
                if (currentTurnAiTextRef.current.trim()) {
                  saveCompletedTurn();
                }
                currentTurnUserTextRef.current += msg.text;
                // User requested NOT to show user transcript on overlay.
                // It is kept in currentTurnUserTextRef for saving to chat store & DB.
              } else if (msg.role === 'assistant') {
                currentTurnAiTextRef.current += msg.text;
                setDisplayedAiResponse((prev) => {
                  if (!prev) return msg.text;

                  const trimmedPrev = prev.trimEnd();

                  // 1. If incoming text starts a block element (code fence, table, heading, horizontal rule)
                  if (
                    msg.text.startsWith('```') ||
                    msg.text.startsWith('|') ||
                    msg.text.startsWith('#') ||
                    msg.text.startsWith('---')
                  ) {
                    return trimmedPrev + '\n\n' + msg.text;
                  }

                  // 2. If prev ends with a closing code fence line (e.g. ``` or ```   ), incoming text MUST be separated!
                  if (/(^|\n)[ \t]*```[a-zA-Z0-9_+#.-]*[ \t]*$/.test(prev)) {
                    return trimmedPrev + '\n\n' + msg.text.trimStart();
                  }

                  // 3. If prev ends with a table row or heading, separate with blank line
                  if (/(^|\n)\|[^\n]+\|[ \t]*$/.test(prev) || /(^|\n)#{1,6}[ \t]+[^\n]*$/.test(prev)) {
                    return trimmedPrev + '\n\n' + msg.text.trimStart();
                  }

                  // 4. Normal conversational word-spacing
                  if (!prev.endsWith(' ') && !prev.endsWith('\n') && !msg.text.startsWith(' ') && !msg.text.startsWith('\n')) {
                    return prev + ' ' + msg.text;
                  }

                  return prev + msg.text;
                });
                setStatus('speaking');
              }
              break;
            }

            case 'turn-complete': {
              // Gemini finished speaking this turn — save user query + AI response to chat store & DB
              saveCompletedTurn();
              setStatus('listening');
              // Ensure code fences are balanced and clean line breaks at end of turn without trailing space leakage
              setDisplayedAiResponse((prev) => {
                if (!prev) return '';
                let cleaned = prev.trimEnd();
                const fenceCount = (cleaned.match(/(?:^|\n)[ \t]*```/g) || []).length;
                if (fenceCount % 2 !== 0) {
                  cleaned += '\n```';
                }
                return cleaned + '\n\n';
              });
              break;
            }

            case 'interrupted': {
              // User barged in — clear playback
              if (liveAudioRef.current) {
                liveAudioRef.current.clearPlayback();
              }
              // Save partial AI turn generated so far
              if (currentTurnAiTextRef.current.trim()) {
                saveCompletedTurn();
              }
              setStatus('listening');
              // Ensure code fences are balanced and clean line breaks after interruption
              setDisplayedAiResponse((prev) => {
                if (!prev) return '';
                let cleaned = prev.trimEnd();
                const fenceCount = (cleaned.match(/(?:^|\n)[ \t]*```/g) || []).length;
                if (fenceCount % 2 !== 0) {
                  cleaned += '\n```';
                }
                return cleaned + '\n\n';
              });
              break;
            }

            case 'error': {
              clearTimeout(connectTimeout);
              if (msg.code === 'RATE_LIMIT_EXCEEDED') {
                const resetsIn = msg.resetsIn || 30;
                const lockoutTime = Date.now() + (resetsIn * 1000);
                localStorage.setItem('voice_lockout', lockoutTime.toString());

                setIsSessionActive(false);
                cleanupLive();
                setRateLimitInfo({
                  message: msg.message || 'Voice limit reached.',
                  resetsIn,
                  upgradeUrl: msg.upgradeUrl || '/pricing',
                });
                setCountdown(resetsIn);
                setStatus('idle');
              } else {
                console.error('[Voice Live] Error:', msg.message);
                cleanupLive();
                setVoiceMode('legacy');
                triggerLatencyNotice();
                setTimeout(startRecording, 500);
              }
              break;
            }

            case 'session-end': {
              console.log('[Voice Live] Session ended by server:', msg);
              if (sessionLimitTimerRef.current) {
                clearTimeout(sessionLimitTimerRef.current);
                sessionLimitTimerRef.current = null;
              }
              if (msg.reason === 'duration_limit_reached') {
                saveCompletedTurn();
                cleanupLive();
                setStatus('idle');
                setSessionLimitInfo({
                  tier: msg.tier || (user ? 'free' : 'anonymous'),
                  maxMinutes: msg.maxMinutes || (msg.tier === 'anonymous' ? 3 : 5),
                  message: msg.message,
                });
              } else {
                cleanupLive();
                setStatus('idle');
              }
              break;
            }
          }
        } catch (e) {
          // Non-JSON message — might be binary that came as string
        }
      };

      ws.onerror = (err) => {
        clearTimeout(connectTimeout);
        console.error('[Voice Live] WebSocket error:', err);
        cleanupLive();
        setVoiceMode('legacy');
        triggerLatencyNotice();
        setTimeout(startRecording, 500);
      };

      ws.onclose = (event) => {
        clearTimeout(connectTimeout);
        console.log(`[Voice Live] WebSocket closed: ${event.code}`);

        // Save any pending turn if not yet saved
        if (currentTurnAiTextRef.current.trim() || currentTurnUserTextRef.current.trim()) {
          saveCompletedTurn();
        }

        // Clean up audio resources
        if (liveAudioRef.current) {
          liveAudioRef.current.destroy();
          liveAudioRef.current = null;
        }
        setStream(null);
        liveWsRef.current = null;
      };

    } catch (err) {
      console.error('[Voice Live] Connection setup failed:', err);
      cleanupLive();
      setVoiceMode('legacy');
      triggerLatencyNotice();
      setTimeout(startRecording, 500);
    }
  }, [isSessionActive, saveCompletedTurn, triggerLatencyNotice]);

  const cleanupLive = useCallback(() => {
    if (sessionLimitTimerRef.current) {
      clearTimeout(sessionLimitTimerRef.current);
      sessionLimitTimerRef.current = null;
    }

    if (liveWsRef.current) {
      if (liveWsRef.current.readyState === WebSocket.OPEN ||
        liveWsRef.current.readyState === WebSocket.CONNECTING) {
        liveWsRef.current.close(1000, 'User closed session');
      }
      liveWsRef.current = null;
    }

    if (liveAudioRef.current) {
      liveAudioRef.current.destroy();
      liveAudioRef.current = null;
    }
    setStream(null);
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSessionActive) return;
    shouldProcessRef.current = true;
    isUnmountedRef.current = false;

    try {
      setTranscript('');
      setDisplayedAiResponse('');

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setStream(audioStream);
      streamRef.current = audioStream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(audioStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512; // Higher resolution
      analyser.smoothingTimeConstant = 0.4; // Smoother data
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(audioStream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (isUnmountedRef.current || !shouldProcessRef.current) {
          console.log('[Voice] shouldProcess is false or component unmounted, discarding chunk.');
          return;
        }
        processVoice();
      };

      recorder.start();
      recordingStartTimeRef.current = Date.now();
      recordingStartTimeRef.current = Date.now();
      setStatus('listening');

      // VAD Implementation with Frequency Filtering
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastSpeakTime = Date.now();
      let hasSpoken = false;

      const checkSilence = () => {
        if (!analyserRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;

        analyserRef.current.getByteFrequencyData(dataArray);


        // Human speech is typically between 85Hz and 3000Hz
        // With 512 FFT and 44.1kHz, each bin is ~86Hz. 
        // We check bins 1 to 35 (approx 85Hz to 3000Hz)
        let speechEnergy = 0;
        let count = 0;
        for (let i = 1; i < 35; i++) {
          speechEnergy += dataArray[i];
          count++;
        }
        const avgSpeechEnergy = speechEnergy / count;

        if (avgSpeechEnergy > SILENCE_THRESHOLD + 80) {
          lastSpeakTime = Date.now();
          hasSpoken = true;
          // console.log(avgSpeechEnergy)

        } else {
          // Only stop if we've actually detected some speech first, 
          // or if it's been silent for a long time at the start.
          const silenceThreshold = hasSpoken ? SILENCE_DURATION : SILENCE_DURATION * 3;
          if (Date.now() - lastSpeakTime > silenceThreshold) {
            stopRecording();
            // console.log("stop recording")
            return;
          }
        }
        animationFrameRef.current = requestAnimationFrame(checkSilence);
        // console.log(avgSpeechEnergy)
      };

      checkSilence();
    } catch (err) {
      console.error('Microphone Access Error:', err);
      setStatus('idle');
    }
  }, [isSessionActive]);

  const stopRecording = (shouldProcess = true) => {
    shouldProcessRef.current = shouldProcess;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[Voice] Stopped track:', track.label);
      });
      streamRef.current = null;
    }
    setStream(null);
  };

  // Countdown timer logic
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          localStorage.removeItem('voice_lockout');
          setRateLimitInfo(null);
          setIsSessionActive(true);
          // Resume voice loop seamlessly once time is up
          setTimeout(startRecording, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown, startRecording]);

  const processVoice = async () => {
    const recordingDuration = Date.now() - recordingStartTimeRef.current;

    if (chunksRef.current.length === 0) {
      setStatus('idle');
      return;
    }

    // Discard if less than 4 seconds
    if (recordingDuration <= 4000) {
      console.log('Audio chunk too short (<= 4s), discarding...');
      setStatus('idle');
      setTimeout(startRecording, 500);
      return;
    }

    // Track the start time of the entire voice flow (STT → Chat → TTS)
    const voiceFlowStartTime = Date.now();

    try {
      setStatus('transcribing');
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.webm');

      const data = await aiService.transcribeAudio(formData);

      if (data.success) {
        const userText = data.data.text?.trim() || '';
        const voiceSessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        let ttsCallsCount = 0;

        if (!userText) {
          const fallbackText = "Can You Say it Again? If You Are Asking Me Anything, Because, I Can't Hear Anything !!!";
          setStatus('speaking');

          const audioPath = '/cant-hear-anything.wav';

          if (audioRef.current) {
            const audio = audioRef.current;
            audio.src = audioPath;
            audio.load();

            const cleanup = () => {
              audio.onended = null;
              audio.onerror = null;
              setStatus('listening');
              setDisplayedAiResponse('');
              setTimeout(startRecording, 500);
            };

            audio.onended = cleanup;
            audio.onerror = cleanup;

            try {
              await audio.play();
              // Animate text as audio speaks (audio duration is ~5.2s, 88 chars @ 45ms = ~4.0s)
              typewriter(fallbackText, setDisplayedAiResponse, 45);
            } catch (playErr) {
              console.warn('[Voice] Fallback audio playback failed:', playErr);
              setDisplayedAiResponse(fallbackText);
              setTimeout(cleanup, 4000);
            }
          } else {
            setDisplayedAiResponse(fallbackText);
            setTimeout(() => {
              setStatus('listening');
              setDisplayedAiResponse('');
              setTimeout(startRecording, 500);
            }, 4000);
          }
          return;
        }

        // 1. Start AI Request in parallel
        const chatRequestPromise = (async () => {
          const { data: { session } } = await Promise.race([
            supabase.auth.getSession(),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Session fetch timeout')), 3000))
          ]);
          return fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
              'X-Anon-Id': !session?.access_token ? (getStoredAnonId() || '') : '',
              'X-Fingerprint': !session?.access_token ? (await generateFingerprintHash()) : '',
            },
            body: JSON.stringify({
              messages: [...messagesRef.current.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userText }],
              model: 'gemini-flash-lite-latest',   //---->voice model change here
              mode: 'voice',
            }),
          });
        })();

        // 2. Stream User Text UI in parallel
        setTranscript('');
        setStatus('thinking');
        startLoadingMessages();

        await typewriter(userText, setTranscript, 30);

        // Keep the fully typed text visible for 2 seconds so the user can read it
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Trigger "sent to AI" animation
        setShowFlyingTranscript(true);

        // Wait for the flying animation to complete before clearing transcript and displaying AI response
        await new Promise((resolve) => setTimeout(resolve, 1200));

        setShowFlyingTranscript(false);
        setTranscript('');

        const chatResponse = await chatRequestPromise;

        if (!chatResponse.ok) {
          try {
            const errorText = await chatResponse.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              errorData = { message: errorText };
            }
            if (chatResponse.status === 429 || errorData?.code === 'RATE_LIMIT_EXCEEDED') {
              const isMonthlyLimit = errorData?.reason === 'monthly';
              const resetsIn = isMonthlyLimit ? 24 * 60 * 60 : (errorData?.resetsIn || 30);
              const message = errorData?.message || 'Usage rate limit reached. Please try again later.';
              const upgradeUrl = errorData?.upgradeUrl || '/pricing';

              const lockoutTime = Date.now() + (resetsIn * 1000);
              localStorage.setItem('voice_lockout', lockoutTime.toString());

              setIsSessionActive(false);
              stopRecording();
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
              }
              stopLoadingMessages();

              setRateLimitInfo({
                message,
                resetsIn,
                upgradeUrl
              });
              setCountdown(resetsIn);
              setStatus('idle');
              return;
            }
          } catch (e) { }
          throw new Error(`Chat request failed with status ${chatResponse.status}`);
        }

        const reader = chatResponse.body?.getReader();
        const decoder = new TextDecoder();
        let fullAiText = '';
        let readerDone = false;

        const audioQueue: { text: string; url: string | null; blob: Blob | null }[] = [];
        let isProcessingQueue = false;
        let playbackResolve: (() => void) | null = null;
        const playbackDone = new Promise<void>((resolve) => { playbackResolve = resolve; });

        const processPlaybackQueue = async () => {
          // Strict single-entry lock: if already running, just return.
          // The running instance will pick up new items on its own.
          if (isProcessingQueue) return;
          isProcessingQueue = true;
          stopLoadingMessages();
          setStatus('speaking');

          let playedIndex = 0;
          let cumulativeText = '';
          while (true) {
            if (playedIndex < audioQueue.length) {
              const item = audioQueue[playedIndex];

              // If url is empty string, TTS failed or text was empty — show text but skip audio
              if (item.url === '') {
                const needsSpace = cumulativeText && !cumulativeText.endsWith(' ') && !cumulativeText.endsWith('\n');
                const prefix = cumulativeText ? (needsSpace ? cumulativeText + ' ' : cumulativeText) : '';
                const chunkText = filterThinkingTags(item.text).trim();
                if (chunkText) {
                  cumulativeText = prefix + chunkText;
                  setDisplayedAiResponse(cumulativeText + ' ');
                }
                playedIndex++;
                continue;
              }

              // If audio is not ready yet (url is null), wait for it with a timeout
              if (item.url === null) {
                const waitStart = Date.now();
                while (audioQueue[playedIndex].url === null) {
                  if (Date.now() - waitStart > 15000) {
                    // 15s timeout — TTS fetch is stuck, skip this chunk
                    console.warn(`[Voice] TTS fetch timeout for chunk ${playedIndex}, skipping`);
                    audioQueue[playedIndex] = { ...audioQueue[playedIndex], url: '' };
                    break;
                  }
                  await new Promise(r => setTimeout(r, 100));
                }
                continue; // Re-check the item (might be '' now or a valid url)
              }

              // Play audio and show text simultaneously
              if (audioRef.current) {
                const audio = audioRef.current;

                // Set the source and load it explicitly to reset the media pipeline
                audio.src = item.url;
                audio.load();

                // Wait for the browser to register the source and be ready to play
                await new Promise<void>((resolveReady) => {
                  let resolved = false;
                  const onCanPlay = () => {
                    if (!resolved) {
                      resolved = true;
                      audio.removeEventListener('canplaythrough', onCanPlay);
                      audio.removeEventListener('loadeddata', onCanPlay);
                      resolveReady();
                    }
                  };
                  audio.addEventListener('canplaythrough', onCanPlay);
                  audio.addEventListener('loadeddata', onCanPlay);
                  // Safety timeout in case events don't fire
                  setTimeout(() => {
                    if (!resolved) {
                      resolved = true;
                      audio.removeEventListener('canplaythrough', onCanPlay);
                      audio.removeEventListener('loadeddata', onCanPlay);
                      resolveReady();
                    }
                  }, 2000);
                });

                // Create promise that resolves when this audio chunk finishes playing
                const audioPromise = new Promise<void>((resolveAudio) => {
                  let doneCalled = false;
                  const done = () => {
                    if (!doneCalled) {
                      doneCalled = true;
                      resolveAudio();
                    }
                  };
                  audio.onended = done;
                  audio.onerror = (e) => {
                    console.warn(`[Voice] Audio playback error on chunk ${playedIndex}, skipping`, e);
                    done();
                  };
                  // Safety timeout: if onended doesn't fire within 15s, continue anyway
                  setTimeout(done, 15000);
                });

                try {
                  await audio.play();
                } catch (playErr) {
                  console.warn('[Voice] Audio play() rejected, skipping segment:', playErr);
                  const needsSpace = cumulativeText && !cumulativeText.endsWith(' ') && !cumulativeText.endsWith('\n');
                  const prefix = cumulativeText ? (needsSpace ? cumulativeText + ' ' : cumulativeText) : '';
                  const chunkText = filterThinkingTags(item.text).trim();
                  if (chunkText) {
                    cumulativeText = prefix + chunkText;
                    setDisplayedAiResponse(cumulativeText + ' ');
                  }
                  playedIndex++;
                  continue;
                }

                // Typewrite this chunk while audio plays
                const needsSpace = cumulativeText && !cumulativeText.endsWith(' ') && !cumulativeText.endsWith('\n');
                const prefix = cumulativeText ? (needsSpace ? cumulativeText + ' ' : cumulativeText) : '';
                const chunkText = filterThinkingTags(item.text).trim();

                if (chunkText) {
                  // Display prefix with space at the end of prior sentence before typing begins
                  setDisplayedAiResponse(prefix);
                  await typewriter(chunkText, (val) => setDisplayedAiResponse(prefix + val), 20);
                  cumulativeText = prefix + chunkText;
                  // Ensure extra space at the end of the sentence for the next sentence
                  setDisplayedAiResponse(cumulativeText + ' ');
                }

                // Wait for audio to finish before moving to the next chunk (sequential)
                await audioPromise;

                // Clean up audio handlers
                audio.onended = null;
                audio.onerror = null;

                // Revoke the object URL to free memory
                if (item.url && item.url.startsWith('blob:')) {
                  URL.revokeObjectURL(item.url);
                }
              } else {
                const needsSpace = cumulativeText && !cumulativeText.endsWith(' ') && !cumulativeText.endsWith('\n');
                const prefix = cumulativeText ? (needsSpace ? cumulativeText + ' ' : cumulativeText) : '';
                const chunkText = filterThinkingTags(item.text).trim();
                if (chunkText) {
                  cumulativeText = prefix + chunkText;
                  setDisplayedAiResponse(cumulativeText + ' ');
                }
              }

              playedIndex++;
            } else {
              if (readerDone && playedIndex >= audioQueue.length) break;
              await new Promise(r => setTimeout(r, 150));
            }
          }

          // Ensure full response is displayed cleanly without trailing whitespace
          const finalClean = filterThinkingTags(cumulativeText || fullAiText).trim();
          setDisplayedAiResponse(finalClean);
          isProcessingQueue = false;
          if (playbackResolve) playbackResolve();
        };

        const cleanTextForTTS = (text: string) => {
          const filtered = filterThinkingTags(text);
          const noEmojis = filtered.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
          // Strip markdown formatting characters but keep readable text
          return noEmojis
            .replace(/```[\s\S]*?```/g, '')       // Remove code blocks entirely (not speakable)
            .replace(/`([^`]+)`/g, '$1')            // Inline code → just the text
            .replace(/#{1,6}\s*/g, '')              // Remove heading markers
            .replace(/\|[^\n]*\|/g, '')             // Remove table rows
            .replace(/[-*_]{3,}/g, '')              // Remove horizontal rules
            .replace(/!?\[([^\]]*)]\([^)]*\)/g, '$1') // Links/images → just alt text
            .replace(/[*_~]/g, '')                  // Remove bold/italic/strikethrough markers
            .replace(/>/g, '')                      // Remove blockquote markers
            .replace(/[()\[\]{}]/g, '')             // Remove brackets
            .replace(/\s+/g, ' ')
            .trim();
        };

        // Strict sequential queue to prevent out-of-order execution or starvation
        const ttsTasks: (() => Promise<void>)[] = [];
        let isProcessingTasks = false;

        const runNextTtsTask = async () => {
          if (isProcessingTasks) return;
          isProcessingTasks = true;
          while (ttsTasks.length > 0) {
            const task = ttsTasks.shift();
            if (task) {
              await task();
            }
          }
          isProcessingTasks = false;
        };

        const fetchChunkAudio = (text: string, index: number) => {
          ttsTasks.push(async () => {
            try {
              const cleaned = cleanTextForTTS(text);
              if (!cleaned) {
                audioQueue[index] = { text, url: '', blob: null };
                return;
              }
              ttsCallsCount++;
              const blob = await aiService.generateSpeech(cleaned, undefined, voiceSessionId);
              const url = URL.createObjectURL(blob);
              audioQueue[index] = { text, url, blob };
            } catch (err) {
              console.error(`[Voice] TTS fetch error for chunk ${index}:`, err);
              // Mark as failed — playback loop will skip audio but still show text
              audioQueue[index] = { text, url: '', blob: null };
            }
          });
          runNextTtsTask();
        };

        // ── Robust Streaming Sentence Partitioner for TTS ──
        // Ensures chunks are ONLY split at true sentence boundaries,
        // never mid-word and never mid-sentence.
        const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'eg', 'ie', 'al']);

        const findSentenceBoundary = (text: string): number => {
          const regex = /([.!?]+[\"')\]]*|\n+)(\s+|$)/g;
          let match: RegExpExecArray | null;

          while ((match = regex.exec(text)) !== null) {
            const punct = match[1];

            // Newline break (paragraph or list item) is always a natural pause
            if (punct.includes('\n')) {
              return match.index + match[0].length;
            }

            // Skip numeric decimals: e.g. '3.14', 'v1.0'
            const charBefore = text[match.index - 1];
            const charAfter = text[match.index + punct.length];
            if (punct.startsWith('.') && charBefore >= '0' && charBefore <= '9' && charAfter >= '0' && charAfter <= '9') {
              continue;
            }

            // Skip common abbreviations (e.g., 'Mr.', 'Dr.', 'vs.')
            const precedingText = text.substring(0, match.index);
            const lastWordMatch = precedingText.match(/([a-zA-Z]+)$/);
            if (lastWordMatch && punct.startsWith('.')) {
              const lastWord = lastWordMatch[1].toLowerCase();
              if (ABBREVIATIONS.has(lastWord)) {
                continue;
              }
            }

            // Valid terminal punctuation found
            return match.index + match[0].length;
          }
          return -1;
        };

        // Fallback for unusually long run-on sentences (>220 chars) without terminal punctuation
        const findClauseBoundary = (text: string, maxChars: number = 220): number => {
          if (text.length < maxChars) return -1;
          const slice = text.substring(0, maxChars);
          const clauseRegex = /([,;:\-–—])\s+/g;
          let match: RegExpExecArray | null;
          let lastClauseIdx = -1;
          while ((match = clauseRegex.exec(slice)) !== null) {
            lastClauseIdx = match.index + match[0].length;
          }
          if (lastClauseIdx > 50) return lastClauseIdx;

          const lastSpaceIdx = slice.lastIndexOf(' ');
          if (lastSpaceIdx > 50) return lastSpaceIdx + 1;

          return -1;
        };

        let streamBuffer = '';
        let pendingSentences: string[] = [];
        let isFirstTtsChunk = true;

        const emitChunk = (text: string) => {
          const s = text.trim();
          if (!s) return;
          const chunkIdx = audioQueue.length;
          audioQueue.push({ text: s, url: null, blob: null });
          fetchChunkAudio(s, chunkIdx);
          if (!isProcessingQueue) processPlaybackQueue();
          isFirstTtsChunk = false;
        };

        const tryFlushSentences = (forceAll: boolean = false) => {
          if (forceAll) {
            if (streamBuffer.trim()) {
              pendingSentences.push(streamBuffer.trim());
              streamBuffer = '';
            }
            if (pendingSentences.length > 0) {
              emitChunk(pendingSentences.join(' '));
              pendingSentences = [];
            }
            return;
          }

          if (pendingSentences.length === 0) return;

          const totalChars = pendingSentences.join(' ').length;
          // For the 1st chunk, wait for at least ~70 chars OR 2 sentences so short replies stay in a single chunk.
          // Subsequent chunks target ~140 chars or 2-3 sentences.
          const minRequired = isFirstTtsChunk ? 70 : 140;
          if (totalChars >= minRequired || pendingSentences.length >= 3) {
            emitChunk(pendingSentences.join(' '));
            pendingSentences = [];
          }
        };

        let buffer = '';
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader!.read();

              if (value) {
                buffer += decoder.decode(value, { stream: true });
              }

              if (done) {
                buffer += decoder.decode(new Uint8Array(), { stream: false });
              }

              const lines = buffer.split('\n');
              if (!done) {
                buffer = lines.pop() || '';
              }

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                if (trimmedLine.startsWith('data:')) {
                  const dataStr = trimmedLine.replace(/^data:\s*/, '').trim();
                  if (dataStr === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.content) {
                      const content = parsed.content;
                      fullAiText += content;
                      streamBuffer += content;

                      // Extract any completed sentences from streamBuffer
                      while (true) {
                        const boundaryIdx = findSentenceBoundary(streamBuffer);
                        if (boundaryIdx !== -1) {
                          const sentence = streamBuffer.substring(0, boundaryIdx).trim();
                          streamBuffer = streamBuffer.substring(boundaryIdx);
                          if (sentence) {
                            pendingSentences.push(sentence);
                          }
                          continue;
                        }

                        // Check clause fallback if buffer is huge (>240 chars without sentence end)
                        const clauseIdx = findClauseBoundary(streamBuffer, 220);
                        if (clauseIdx !== -1) {
                          const clause = streamBuffer.substring(0, clauseIdx).trim();
                          streamBuffer = streamBuffer.substring(clauseIdx);
                          if (clause) {
                            pendingSentences.push(clause);
                          }
                          continue;
                        }

                        break;
                      }

                      tryFlushSentences(false);
                    }
                  } catch (e) { }
                }
              }

              if (done) {
                // Flush remaining text as the final chunk BEFORE setting readerDone
                tryFlushSentences(true);
                readerDone = true;
                break;
              }
            }
          } catch (err) {
            console.error('Stream read error:', err);
            tryFlushSentences(true);
            readerDone = true;
          }
        };

        // === STEP 1: Stream the full chat response ===
        await processStream();

        // === STEP 2: Save to chat store FIRST (before TTS finishes) ===
        // Handles both logged-in users and anonymous sessions
        {
          const anonId = !user?.id ? (localStorage.getItem('sreeai_anon_id') || undefined) : undefined;
          if (user?.id || anonId) {
            let currentConvId = conversationIdRef.current;
            if (!currentConvId) {
              const conv = await createConversation(user?.id, userText.slice(0, 30), 'voice', anonId);
              if (conv) {
                currentConvId = conv.id;
                setConversationId(conv.id);
                conversationIdRef.current = conv.id;
              }
            }

            if (currentConvId) {
              await addMessage(currentConvId, 'user', userText, { mode: 'voice' });
              await addMessage(currentConvId, 'assistant', fullAiText, { mode: 'voice' });

              if (!initialConversationId && currentConvId) {
                navigate(`/voice/chat/${currentConvId}`, { replace: true });
              }
            }
          }
        }

        // === STEP 3: Wait for TTS playback to complete ===
        await playbackDone;

        // === STEP 4: Charge voice credits ===
        const voiceFlowDurationSeconds = (Date.now() - voiceFlowStartTime) / 1000;
        const apiCallsCount = 2 + ttsCallsCount;
        try {
          const result = await aiService.voiceComplete(voiceFlowDurationSeconds, voiceSessionId, apiCallsCount);
          const creditsCharged = result.creditsCharged || 1;
          console.log(`[Voice] Charged ${creditsCharged} voice credit(s) based on ${apiCallsCount} API calls`);
          useUsageStore.getState().incrementLocalUsage('voice', creditsCharged);
        } catch (chargeErr) {
          console.error('[Voice] Failed to charge voice credits:', chargeErr);
          useUsageStore.getState().incrementLocalUsage('voice', 1);
        }

        // Resume listening
        setStatus('listening');
        setTimeout(startRecording, 500);
      }
    } catch (err: any) {
      console.error('Voice Processing Error:', err);

      let errorData = err.response?.data;
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          errorData = JSON.parse(text);
        } catch (e) { }
      }

      if (err.response?.status === 429 || errorData?.code === 'RATE_LIMIT_EXCEEDED') {
        const isMonthlyLimit = errorData?.reason === 'monthly';
        const resetsIn = isMonthlyLimit ? 24 * 60 * 60 : (errorData?.resetsIn || 30);
        const message = errorData?.message || 'Usage rate limit reached. Please try again later.';
        const upgradeUrl = errorData?.upgradeUrl || '/pricing';

        const lockoutTime = Date.now() + (resetsIn * 1000);
        localStorage.setItem('voice_lockout', lockoutTime.toString());

        setIsSessionActive(false);
        stopRecording(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
        }

        setRateLimitInfo({
          message,
          resetsIn,
          upgradeUrl
        });
        setCountdown(resetsIn);
        setStatus('idle');
        return;
      }

      setStatus('idle');
      setTimeout(startRecording, 2000);
    }
  };

  const handleManualClose = () => {
    setIsSessionActive(false);

    // Save any pending unsaved turn before closing
    if (voiceMode === 'live' && (currentTurnAiTextRef.current.trim() || currentTurnUserTextRef.current.trim())) {
      saveCompletedTurn();
    }

    // Clean up Live Mode if active
    if (voiceMode === 'live') {
      cleanupLive();
    }

    // Clean up Legacy Mode
    stopRecording(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    onClose();
  };

  const handleContinueWithLatency = () => {
    setSessionLimitInfo(null);
    setVoiceMode('legacy');
    triggerLatencyNotice();
    setTimeout(() => {
      startRecording();
    }, 300);
  };

  const handleRestartLive = () => {
    setSessionLimitInfo(null);
    setVoiceMode('connecting');
    setTimeout(() => {
      tryConnectLive();
    }, 200);
  };

  const handleUpgradeFromLimit = () => {
    handleManualClose();
    navigate('/pricing');
  };

  // On mount: Try Live Mode first, falls back to Legacy if unavailable.
  // Intentionally empty deps — this must fire exactly once on mount.
  // tryConnectLive is a useCallback whose ref changes with its closure deps;
  // using it here would cause a second connect attempt after URL navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => {
      tryConnectLive();
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      shouldProcessRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      if (sessionLimitTimerRef.current) {
        clearTimeout(sessionLimitTimerRef.current);
        sessionLimitTimerRef.current = null;
      }

      if (latencyNoticeTimerRef.current) {
        clearTimeout(latencyNoticeTimerRef.current);
        latencyNoticeTimerRef.current = null;
      }

      // Flush any pending turn before unmounting
      if (voiceMode === 'live' && (currentTurnAiTextRef.current.trim() || currentTurnUserTextRef.current.trim())) {
        saveCompletedTurn();
      }

      // Clean up Live Mode resources
      if (liveWsRef.current) {
        liveWsRef.current.close(1000, 'Component unmounted');
        liveWsRef.current = null;
      }
      if (liveAudioRef.current) {
        liveAudioRef.current.destroy();
        liveAudioRef.current = null;
      }

      // Forcefully release the mic when component unmounts or changes pages (Legacy Mode)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('[Voice] Stopped track on unmount:', track.label);
        });
        streamRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) { }
      }
    };
  }, []);
  const repeat = () => {
    if (audioRef.current) {

      audioRef.current.play();
    }
  }
  return (
    <div className={styles.overlayContainer}>
      {/* Unified Top Header Bar: All controls & banner aligned on the exact same axis */}
      <div className={styles.topHeaderBar}>
        {/* Left Slot: Toggle Responses (Eye/EyeOff) */}
        <div className={styles.topBarLeft}>
          <button
            onClick={() => setShowAiResponses((prev) => !prev)}
            className={`${styles.toggleResponseBtn} ${!showAiResponses ? styles.toggleResponseBtnHidden : ''}`}
            title={showAiResponses ? 'Hide responses' : 'Show responses'}
            aria-label={showAiResponses ? 'Hide responses' : 'Show responses'}
          >
            {showAiResponses ? <EyeOff size={18} /> : <Eye size={18} />}
            <span className={styles.toggleResponseText}>
              {showAiResponses ? 'Hide Text' : 'Show Text'}
            </span>
          </button>
        </div>

        {/* Center Slot: High Traffic Latency Notice */}
        <div className={styles.topBarCenter}>
          <AnimatePresence>
            {showLatencyNotice && (
              <motion.div
                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={styles.latencyNoticeBanner}
              >
                <div className={styles.latencyNoticeIcon}>
                  <Hourglass size={18} />
                </div>
                <div className={styles.latencyNoticeContent}>
                  <div className={styles.latencyNoticeTitle}>
                    Switched to <span className={styles.noticeHighlight}>Standard Voice</span> due to high demand.
                  </div>
                  <div className={styles.latencyNoticeSubtext}>
                    You may experience a 2~3 second response latency. Thank you for your patience.
                  </div>
                </div>
                <button
                  onClick={() => setShowLatencyNotice(false)}
                  className={styles.latencyNoticeDismiss}
                  title="Dismiss"
                  aria-label="Dismiss notice"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Slot: Close Button */}
        <div className={styles.topBarRight}>
          <button onClick={handleManualClose} className={styles.closeButton} title="Close voice overlay" aria-label="Close voice overlay">
            <X size={22} />
          </button>
        </div>
      </div>

      {sessionLimitInfo ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          className={styles.limitModalCard}
        >
          <div className={styles.limitModalHeader}>
            <div className={styles.limitIconBadge}>
              <Clock size={28} />
            </div>
            <h2 className={styles.limitModalTitle}>Live Session Limit Reached</h2>
            <p className={styles.limitModalSubtitle}>
              Continuous live voice sessions are capped at <strong className={styles.highlightLimit}>{sessionLimitInfo.maxMinutes} minutes</strong> on the <span className={styles.highlightTier}>{sessionLimitInfo.tier.toUpperCase()}</span> plan.
            </p>
          </div>

          <div className={styles.tierLimitsSection}>
            <div className={styles.tierLimitsTitle}>Continuous Session Duration Limits</div>
            <div className={styles.tierGrid}>
              {[
                { name: 'Anonymous', limit: '3 min', tierKey: 'anonymous', price: 'Free', isUpgrade: false },
                { name: 'Free', limit: '5 min', tierKey: 'free', price: 'Logged in', isUpgrade: sessionLimitInfo.tier.toLowerCase() === 'anonymous' },
                { name: 'Starter', limit: '10 min', tierKey: 'starter', price: '$8/mo', isUpgrade: true },
                { name: 'Pro', limit: '20 min', tierKey: 'pro', price: '$29/mo', isUpgrade: true },
              ].map((t) => {
                const isCurrent = sessionLimitInfo.tier.toLowerCase() === t.tierKey;
                const canUpgrade = t.isUpgrade && !isCurrent;
                return (
                  <div
                    key={t.tierKey}
                    role={canUpgrade ? "button" : undefined}
                    tabIndex={canUpgrade ? 0 : undefined}
                    onClick={canUpgrade ? handleUpgradeFromLimit : undefined}
                    title={canUpgrade ? `Click to upgrade to ${t.name} on Pricing page` : undefined}
                    className={`${styles.tierCard} ${isCurrent ? styles.tierCardActive : ''} ${canUpgrade ? styles.tierCardUpgrade : ''}`}
                  >
                    <div className={styles.tierCardTop}>
                      <span className={styles.tierCardName}>{t.name}</span>
                      {isCurrent ? (
                        <span className={styles.tierCurrentBadge}>Current</span>
                      ) : canUpgrade ? (
                        <span className={styles.tierUpgradeBadge}>Upgrade ↗</span>
                      ) : null}
                    </div>
                    <div className={styles.tierCardLimit}>{t.limit}</div>
                    <div className={styles.tierCardPrice}>{t.price}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className={styles.limitNotice}>
            You can continue this session with latency without losing conversation context, restart a fresh live session, or upgrade your plan to increase limits.
          </p>

          <div className={styles.limitActions}>
            <button
              onClick={handleContinueWithLatency}
              className={`${styles.limitBtn} ${styles.limitContinueBtn}`}
            >
              <Volume2 size={16} />
              <span>Continue with Latency</span>
              <span className={styles.contextBadge}>Preserves Context</span>
            </button>

            <button
              onClick={handleRestartLive}
              className={`${styles.limitBtn} ${styles.limitRestartBtn}`}
            >
              <RotateCcw size={16} />
              <span>Restart Live Session</span>
            </button>

            <button
              onClick={handleUpgradeFromLimit}
              className={`${styles.limitBtn} ${styles.limitUpgradeBtn}`}
            >
              <Sparkles size={16} />
              <span>Upgrade Plan</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      ) : rateLimitInfo ? (
        <div className={styles.rateLimitCard}>
          <div className={styles.rateLimitIcon}>
            <AlertTriangle size={36} />
          </div>
          <h2 className={styles.rateLimitTitle}>Rate Limit Reached</h2>
          <p className={styles.rateLimitMessage}>{rateLimitInfo.message}</p>

          <div className={styles.timerCircle}>
            <svg className={styles.timerProgressSvg} viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="44"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="44"
                stroke="#f59e0b"
                strokeWidth="6"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - countdown / (rateLimitInfo.resetsIn || 30))}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className={styles.timerNumber}>
              <span className={styles.timerVal} style={{ fontSize: formatCountdown(countdown).val.length > 3 ? '1.5rem' : '2.5rem' }}>
                {formatCountdown(countdown).val}
              </span>
              <span className={styles.timerUnit}>{formatCountdown(countdown).unit}</span>
            </div>
          </div>

          <div className={styles.rateLimitActions}>
            <button
              onClick={() => {
                localStorage.removeItem('voice_lockout');
                setIsSessionActive(true);
                setRateLimitInfo(null);
                startRecording();
              }}
              className={`${styles.rateLimitBtn} ${styles.rateLimitSecondaryBtn}`}
            >
              <Clock size={16} />
              Try Now
            </button>
            <button
              onClick={() => {
                handleManualClose();
                navigate(rateLimitInfo.upgradeUrl);
              }}
              className={`${styles.rateLimitBtn} ${styles.rateLimitPrimaryBtn}`}
            >
              <Sparkles size={16} />
              Upgrade Plan
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`${styles.visualizerWrapper} ${(status === 'idle' && voiceMode === 'legacy') ? styles.clickable : ''}`}
            onClick={(status === 'idle' && voiceMode === 'legacy') ? startRecording : undefined}
          >
            <VoiceVisualizer
              stream={stream}
              audioElement={voiceMode === 'legacy' ? audioRef.current : null}
              isActive={true}
              isGray={status === 'idle' || status === 'transcribing' || status === 'thinking' || voiceMode === 'connecting'}
            />
          </div>

          <div onClick={repeat} className={styles.statusIndicator}>
            {voiceMode === 'live' && (
              <div className={styles.liveBadge}>
                <Zap size={10} />
                <span>Live</span>
              </div>
            )}
            <div className={`${styles.statusDot} ${styles[status]}`} />
            <span>
              {voiceMode === 'connecting' ? 'Connecting...' :
                status === 'listening' ? 'AI is Listening' :
                  status === 'speaking' ? 'AI is Speaking' :
                    status === 'thinking' ? 'AI is Thinking' : 'Ready'}
            </span>
          </div>

          <div className={styles.contentOverlay}>
            <AnimatePresence>
              {transcript && voiceMode === 'legacy' && (
                <motion.div
                  initial={{ opacity: 0, y: 180, scale: 0.95, filter: 'blur(4px)' }}
                  animate={showFlyingTranscript ? {
                    opacity: 0,
                    y: 0,
                    scale: 0.05,
                    filter: 'blur(10px)',
                  } : {
                    opacity: 1,
                    y: 140,
                    scale: 1,
                    filter: 'blur(0px)',
                  }}
                  exit={{ opacity: 0, y: 0, scale: 0.05, filter: 'blur(10px)' }}
                  transition={{
                    duration: showFlyingTranscript ? 1.2 : 0.4,
                    ease: showFlyingTranscript ? [0.4, 0, 0.2, 1] : "easeOut"
                  }}
                  className={styles.transcriptArea}
                >
                  <p className={styles.userText}>{transcript}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {loadingMessage && (
                <motion.div
                  key={loadingMessage}
                  initial={{ opacity: 0, y: 40, rotateX: 90 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={{ opacity: 0, y: -40, rotateX: -90 }}
                  transition={{ duration: 1, ease: 'easeInOut' }}
                  className={styles.loadingArea}
                  style={{ perspective: '1000px' }}
                >
                  <div className={styles.loadingText}>
                    {loadingMessage}
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className={styles.dots}
                    >
                      ...
                    </motion.span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {displayedAiResponse && showAiResponses && (
                <motion.div
                  initial={{
                    opacity: 0,
                    scaleY: 0,
                    scaleX: 0.96,
                    clipPath: 'inset(50% 0% 50% 0% round 24px)',
                  }}
                  animate={{
                    opacity: 1,
                    scaleY: 1,
                    scaleX: 1,
                    clipPath: 'inset(0% 0% 0% 0% round 24px)',
                  }}
                  exit={{
                    opacity: 0,
                    scaleY: 0,
                    scaleX: 0.96,
                    clipPath: 'inset(50% 0% 50% 0% round 24px)',
                  }}
                  transition={{
                    duration: 0.38,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{ transformOrigin: 'center center' }}
                  className={styles.aiResponseArea}
                >
                  <div ref={aiResponseScrollRef} className={styles.aiResponseScroll}>
                    <div className={styles.aiText}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={voiceMarkdownComponents}
                      >
                        {cleanMarkdownTranscript(displayedAiResponse)}
                      </ReactMarkdown>
                      {status === 'thinking' && !loadingMessage && <span className={styles.streamingCursor}>|</span>}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
};

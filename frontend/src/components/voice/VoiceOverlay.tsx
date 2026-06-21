import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { useChatStore } from '../../store/chat.store';
import { useAuthStore } from '../../store/auth.store';
import { useUsageStore } from '../../store/usage.store';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { VoiceVisualizer } from './VoiceVisualizer';
import { aiService } from '../../lib/api';
import styles from './VoiceOverlay.module.css';

interface VoiceOverlayProps {
  onClose: () => void;
  initialConversationId?: string | null;
}

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ onClose, initialConversationId }) => {
  const { user } = useAuthStore();
  const { messages, createConversation, addMessage } = useChatStore();
  const navigate = useNavigate();

  // Session State
  const [isSessionActive, setIsSessionActive] = useState(() => {
    const lockedUntil = localStorage.getItem('chat_lockout');
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
    const lockedUntil = localStorage.getItem('chat_lockout');
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
    const lockedUntil = localStorage.getItem('chat_lockout');
    if (lockedUntil) {
      const remaining = Math.max(0, Math.ceil((parseInt(lockedUntil) - Date.now()) / 1000));
      if (remaining > 0) {
        return remaining;
      }
    }
    return 0;
  });

  // Sync state with props (important for "New Chat" navigation)
  useEffect(() => {
    setConversationId(initialConversationId || null);
  }, [initialConversationId]);

  // Store refs to avoid stale closures in VAD/Recorder logic
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Audio State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'>('idle');

  // Content State
  const [transcript, setTranscript] = useState('');
  const [displayedAiResponse, setDisplayedAiResponse] = useState('');
  const [showFlyingTranscript, setShowFlyingTranscript] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Refs for VAD and Audio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    return processed.trim();
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
          localStorage.removeItem('chat_lockout');
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
          setDisplayedAiResponse(fallbackText);
          setStatus('speaking');

          const audioBlob = await aiService.generateSpeech(fallbackText);
          const url = URL.createObjectURL(audioBlob);

          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.onended = () => {
              setStatus('listening');
              setDisplayedAiResponse('');
              setTimeout(startRecording, 500);
            };
            audioRef.current.play();
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
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              messages: [...messagesRef.current.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userText }],
              model: 'mistralai/mistral-small-4-119b-2603',   //---->voice model change here
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
              localStorage.setItem('chat_lockout', lockoutTime.toString());

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

        const processPlaybackQueue = async () => {
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
                cumulativeText += item.text;
                setDisplayedAiResponse(filterThinkingTags(cumulativeText));
                playedIndex++;
                continue;
              }

              // If audio is not ready yet (url is null), wait for it with a timeout
              if (item.url === null) {
                const waitStart = Date.now();
                while (audioQueue[playedIndex].url === null) {
                  if (Date.now() - waitStart > 10000) {
                    // 10s timeout — TTS fetch is stuck, skip this chunk
                    console.warn(`[Voice] TTS fetch timeout for chunk ${playedIndex}, skipping`);
                    audioQueue[playedIndex] = { ...audioQueue[playedIndex], url: '' };
                    break;
                  }
                  await new Promise(r => setTimeout(r, 100));
                }
                continue; // Re-check the item (might be '' now or a valid url)
              }

              // Play audio and typewrite text
              if (audioRef.current) {
                const audio = audioRef.current;
                audio.src = item.url;

                const audioPromise = new Promise<void>((resolve) => {
                  let resolved = false;
                  const done = () => { if (!resolved) { resolved = true; resolve(); } };
                  audio.onended = done;
                  audio.onerror = () => {
                    console.warn('[Voice] Audio playback error, skipping segment');
                    done();
                  };
                  // Safety timeout: 20s max per audio segment
                  setTimeout(done, 20000);
                });

                try {
                  await audio.play();
                } catch (playErr) {
                  console.warn('[Voice] Audio play() rejected, skipping segment:', playErr);
                  cumulativeText += item.text;
                  setDisplayedAiResponse(filterThinkingTags(cumulativeText));
                  playedIndex++;
                  continue;
                }

                // Typewrite this chunk while audio plays
                setDisplayedAiResponse(filterThinkingTags(cumulativeText));
                await typewriter(filterThinkingTags(item.text), (val) => setDisplayedAiResponse(filterThinkingTags(cumulativeText) + val), 20);
                cumulativeText += item.text;

                await audioPromise;

                // Clean up audio handlers
                audio.onended = null;
                audio.onerror = null;
              } else {
                cumulativeText += item.text;
                setDisplayedAiResponse(filterThinkingTags(cumulativeText));
              }

              playedIndex++;
            } else {
              if (readerDone && playedIndex >= audioQueue.length) break;
              await new Promise(r => setTimeout(r, 150));
            }
          }

          // Ensure full response is displayed
          setDisplayedAiResponse(filterThinkingTags(fullAiText));
          isProcessingQueue = false;
          setStatus('listening');
          setTimeout(startRecording, 500);
        };

        const cleanTextForTTS = (text: string) => {
          const filtered = filterThinkingTags(text);
          const noEmojis = filtered.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
          return noEmojis.replace(/[*\/()]/g, '').replace(/\s+/g, ' ').trim();
        };

        // Limit concurrent TTS fetches
        let activeTTSFetches = 0;
        const MAX_CONCURRENT_TTS = 3;

        const fetchChunkAudio = async (text: string, index: number) => {
          // Wait if too many concurrent fetches
          while (activeTTSFetches >= MAX_CONCURRENT_TTS) {
            await new Promise(r => setTimeout(r, 50));
          }
          activeTTSFetches++;
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
            console.error('[Voice] TTS fetch error:', err);
            audioQueue[index] = { text, url: '', blob: null };
          } finally {
            activeTTSFetches--;
          }
        };

        // Batching: accumulate text into chunks of ~200 chars or 3+ sentence boundaries
        let currentChunk = '';
        let sentenceCount = 0;
        const MIN_CHUNK_CHARS = 150;
        const MAX_CHUNK_SENTENCES = 3;

        const flushChunk = () => {
          const s = currentChunk.trim();
          if (!s) return;
          const chunkIdx = audioQueue.length;
          audioQueue.push({ text: s, url: null, blob: null });
          fetchChunkAudio(s, chunkIdx);
          if (!isProcessingQueue) processPlaybackQueue();
          currentChunk = '';
          sentenceCount = 0;
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
                      currentChunk += content;

                      // Detect sentence boundaries
                      if (/[.!?\n]/.test(content)) {
                        sentenceCount++;
                        // Flush when chunk is large enough OR has enough sentences
                        if (currentChunk.length >= MIN_CHUNK_CHARS || sentenceCount >= MAX_CHUNK_SENTENCES) {
                          flushChunk();
                        }
                      }
                    }
                  } catch (e) { }
                }
              }

              if (done) {
                // Flush remaining text as the final chunk BEFORE setting readerDone
                flushChunk();
                readerDone = true;
                break;
              }
            }
          } catch (err) {
            console.error('Stream read error:', err);
            flushChunk();
            readerDone = true;
          }
        };

        // Start everything in parallel
        await processStream();

        // Wait for final playback to finish
        while (isProcessingQueue) {
          await new Promise(r => setTimeout(r, 100));
        }

        // Calculate total voice flow duration in seconds
        const voiceFlowDurationSeconds = (Date.now() - voiceFlowStartTime) / 1000;

        // Charge voice credits based on total API calls [voice + chat + TTS] count
        // This runs regardless of conversation creation success
        const apiCallsCount = 2 + ttsCallsCount;
        try {
          const result = await aiService.voiceComplete(voiceFlowDurationSeconds, voiceSessionId, apiCallsCount);
          const creditsCharged = result.creditsCharged || 1;
          console.log(`[Voice] Charged ${creditsCharged} voice credit(s) based on ${apiCallsCount} API calls`);
          useUsageStore.getState().incrementLocalUsage('voice', creditsCharged);
        } catch (chargeErr) {
          console.error('[Voice] Failed to charge voice credits:', chargeErr);
          // Fallback: increment by 1 locally
          useUsageStore.getState().incrementLocalUsage('voice', 1);
        }

        if (user?.id) {
          let currentConvId = conversationIdRef.current;
          if (!currentConvId) {
            const conv = await createConversation(user.id, userText.slice(0, 30), 'voice');
            if (conv) {
              currentConvId = conv.id;
              setConversationId(conv.id);
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
        localStorage.setItem('chat_lockout', lockoutTime.toString());

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
    stopRecording(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    onClose();
  };

  useEffect(() => {
    const timer = setTimeout(startRecording, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [startRecording]);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      shouldProcessRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      // Forcefully release the mic when component unmounts or changes pages
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
      <div className={styles.topBar}>
        <button onClick={handleManualClose} className={styles.closeButton}>
          <X size={24} />
        </button>
      </div>

      {rateLimitInfo ? (
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
            className={`${styles.visualizerWrapper} ${status === 'idle' ? styles.clickable : ''}`}
            onClick={status === 'idle' ? startRecording : undefined}
          >
            <VoiceVisualizer
              stream={stream}
              audioElement={audioRef.current}
              isActive={true}
              isGray={status === 'idle' || status === 'transcribing' || status === 'thinking'}
            />
          </div>

          <div onClick={repeat} className={styles.statusIndicator}>
            <div className={`${styles.statusDot} ${styles[status]}`} />
            <span>
              {status === 'listening' ? 'AI is Listening' :
                status === 'speaking' ? 'AI is Speaking' :
                  status === 'thinking' ? 'AI is Thinking' : 'Ready'}
            </span>
          </div>

          <div className={styles.contentOverlay}>
            <AnimatePresence>
              {transcript && (
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
              {displayedAiResponse && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={styles.aiResponseArea}
                >
                  <div className={styles.aiText}>
                    {displayedAiResponse.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                      part.startsWith('**') && part.endsWith('**') ?
                        <strong key={i} style={{ color: 'white', fontWeight: 700 }}>{part.slice(2, -2)}</strong> :
                        part
                    )}
                    {status === 'thinking' && !loadingMessage && <span className={styles.streamingCursor}>|</span>}
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

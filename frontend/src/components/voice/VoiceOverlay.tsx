import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useChatStore } from '../../store/chat.store';
import { useAuthStore } from '../../store/auth.store';
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
  const [isSessionActive, setIsSessionActive] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
  const conversationIdRef = useRef<string | null>(initialConversationId || null);

  // Update ref whenever state changes
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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

  const SILENCE_THRESHOLD = 20; // Increased from 5 to ignore more background noise
  const SILENCE_DURATION = 3000; // 3 seconds as requested

  const recordingStartTimeRef = useRef<number>(0);

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

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      stream?.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

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

    try {
      setStatus('transcribing');
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.webm');

      const data = await aiService.transcribeAudio(formData);

      if (data.success) {
        const userText = data.data.text?.trim() || '';

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
              model: 'meta/llama-3.1-70b-instruct',
            }),
          });
        })();

        // 2. Stream User Text UI in parallel
        setTranscript('');
        setStatus('thinking');
        startLoadingMessages();

        await typewriter(userText, setTranscript, 20);

        // Trigger "sent to AI" animation
        setShowFlyingTranscript(true);
        setTimeout(() => {
          setShowFlyingTranscript(false);
          setTranscript('');
        }, 2000);

        const chatResponse = await chatRequestPromise;

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
          while (true) {
            if (playedIndex < audioQueue.length) {
              const item = audioQueue[playedIndex];

              // If audio is not ready yet, wait
              if (!item.url) {
                await new Promise(r => setTimeout(r, 100));
                continue;
              }

              // Sync: Play audio and start typewriter for this sentence
              if (audioRef.current) {
                audioRef.current.src = item.url;
                const audioPromise = new Promise(resolve => {
                  audioRef.current!.onended = resolve;
                });
                audioRef.current.play();

                // Type this specific sentence
                const prevText = fullAiText.slice(0, fullAiText.indexOf(item.text));

                // Update displayed response up to previous sentences if needed
                setDisplayedAiResponse(filterThinkingTags(prevText));
                await typewriter(filterThinkingTags(item.text), (val) => setDisplayedAiResponse(filterThinkingTags(prevText) + val), 20);

                await audioPromise;
              }

              playedIndex++;
            } else {
              if (readerDone && playedIndex >= audioQueue.length) break;
              await new Promise(r => setTimeout(r, 100));
            }
          }

          isProcessingQueue = false;
          setStatus('listening');
          setTimeout(startRecording, 500);
        };

        const cleanTextForTTS = (text: string) => {
          const filtered = filterThinkingTags(text);
          return filtered.replace(/[*\/()]/g, '').trim();
        };

        const fetchSentenceAudio = async (text: string, index: number) => {
          try {
            const cleaned = cleanTextForTTS(text);
            if (!cleaned) {
              audioQueue[index] = { text, url: '', blob: null };
              return;
            }
            const blob = await aiService.generateSpeech(cleaned);
            const url = URL.createObjectURL(blob);
            audioQueue[index] = { text, url, blob };
          } catch (err) {
            console.error('Sentence TTS error:', err);
            // On error, mark as "ready" with no URL to skip
            audioQueue[index] = { text, url: '', blob: null };
          }
        };

        let currentSentence = '';
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
                      currentSentence += content;

                      // Sentence detection: ., !, ?, or \n
                      if (/[.!?\n]/.test(content)) {
                        const s = currentSentence.trim();
                        if (s) {
                          const sentenceIdx = audioQueue.length;
                          audioQueue.push({ text: s, url: null, blob: null });
                          fetchSentenceAudio(s, sentenceIdx);
                          if (!isProcessingQueue) processPlaybackQueue();
                        }
                        currentSentence = '';
                      }
                    }
                  } catch (e) { }
                }
              }

              if (done) {
                readerDone = true;
                // Process final sentence if any
                if (currentSentence.trim()) {
                  const s = currentSentence.trim();
                  audioQueue.push({ text: s, url: null, blob: null });
                  fetchSentenceAudio(s, audioQueue.length - 1);
                }
                break;
              }
            }
          } catch (err) {
            console.error('Stream read error:', err);
            readerDone = true;
          }
        };

        // Start everything in parallel
        await processStream();

        // Wait for final playback to finish
        while (isProcessingQueue) {
          await new Promise(r => setTimeout(r, 100));
        }

        // setAiResponse(fullAiText);

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
      setStatus('idle');
      setTimeout(startRecording, 2000);
    }
  };

  const handleManualClose = () => {
    setIsSessionActive(false);
    stopRecording();
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
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [startRecording]);
  const repeat = () => {
    if (audioRef.current) {

      audioRef.current.play();
    }
  }
  return (
    <div className={styles.overlayContainer}>
      <div className={styles.visualizerWrapper}>
        <VoiceVisualizer
          stream={stream}
          audioElement={audioRef.current}
          isActive={true}
          isGray={status === 'idle' || status === 'transcribing' || status === 'thinking'}
        />
      </div>

      <div className={styles.topBar}>
        <button onClick={handleManualClose} className={styles.closeButton}>
          <X size={24} />
        </button>
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
          {transcript && !showFlyingTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={styles.transcriptArea}
            >
              <p className={styles.userText}>{transcript}</p>
            </motion.div>
          )}

          {showFlyingTranscript && (
            <motion.div
              initial={{ opacity: 1, x: '-50%', y: '100px', scale: 1 }}
              animate={{ opacity: 0, x: '-50%', y: '-200px', scale: 0.5 }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
              className={styles.animatedTranscript}
              style={{ left: '50%' }}
            >
              {transcript}
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

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
};

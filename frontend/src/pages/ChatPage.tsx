import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowLeft, MoreVertical, Lock, Clock, Sparkles } from 'lucide-react';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
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

const ChatPage: React.FC = () => {
  const { user } = useAuthStore();
  const [session, setSession] = useState<any>(null);
  const [lockTimeRemaining, setLockTimeRemaining] = useState<number>(0);
  const { selectedModel } = useModelStore();
  const {
    activeConversation,
    messages,
    addMessage,
    loading: chatLoading,
    setActiveConversation,
    createConversation,
    setMessages
  } = useChatStore();

  const [limitModal, setLimitModal] = useState<{
    isOpen: boolean;
    type: 'anonymous' | 'rate-limited' | 'tiered' | 'abuse-cooldown' | 'abuse-captcha' | 'abuse-auth' | 'abuse-restricted';
    limitInfo?: any;
  }>({ isOpen: false, type: 'anonymous' });

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

    // Initialize anonymous identity if not logged in
    if (!user?.id && !getStoredAnonId()) {
      getOrCreateAnonymousIdentity();
    }

    return () => subscription.unsubscribe();
  }, [user?.id]);

  useEffect(() => {
    setShowVoiceOverlay(location.pathname.startsWith('/voice'));
  }, [location.pathname]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [displayedStreamingMessage, setDisplayedStreamingMessage] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [isStreamFinished, setIsStreamFinished] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const typewriterIntervalRef = useRef<number | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingOptimisticIdRef = useRef<string | null>(null);
  const fullContentRef = useRef('');
  const isStreamFinishedRef = useRef(false);
  const displayedMessageLengthRef = useRef(0);

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
    // If ID changes, clear the UI streaming state for the NEW conversation
    // but don't abort the background request so it can finish in its own chat
    if (id !== streamingIdRef.current) {
      setIsGenerating(false);
      setStreamingMessage('');
      setDisplayedStreamingMessage('');
      setStreamingStatus(null);
      setIsStreamFinished(false);
      fullContentRef.current = '';
      streamingIdRef.current = null;
    }

    if (id && id !== activeConversation?.id) {
      setActiveConversation(id);
    } else if (!id) {
      setActiveConversation(null);
    }
    
    return () => {
      // Clean up on unmount
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
    };
  }, [id, setActiveConversation]);

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

    // Check if user is near bottom (within 100px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;

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

  const suggestions = [
    { title: 'Write a technical blog', desc: 'About React 19 features' },
    { title: 'Explain Quantum computing', desc: 'To a 10 year old kid' },
    { title: 'Write an email', desc: 'To request a budget increase' },
    { title: 'Debug my code', desc: 'Help find the memory leak' },
  ];

  const handleSend = async (text?: string, isRetry: boolean = false, retryAttachments: any[] = [], autoRetryCount: number = 0) => {
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
    
    if (isGenerating || (!user?.id && !anonId)) return;

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
    if (currentConvId) {
      streamingIdRef.current = currentConvId;
    }

    if (!currentConvId) {
      const isVoice = location.pathname.startsWith('/voice');
      const newConv = await createConversation(user?.id, messageContent.slice(0, 40) + '...', isVoice ? 'voice' : 'chat', anonId || undefined);
      if (!newConv) {
        setIsGenerating(false);
        return;
      }
      currentConvId = newConv.id;
      streamingIdRef.current = currentConvId;
      navigate(isVoice ? `/voice/chat/${newConv.id}` : `/chat/${newConv.id}`, { replace: true });
    }

    let userMsg: any = null;
    if (!isRetry) {
      // addMessage is now optimistic, so it will update the UI immediately
      const userOptimisticId = `temp_user_${Date.now()}`;
      userMsg = await addMessage(currentConvId, 'user', messageContent, {
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
          new Promise<{data: {session: any}}>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
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
          const resetsIn = errorData.resetsIn || 60;
          const lockoutTime = Date.now() + (resetsIn * 1000);
          localStorage.setItem('chat_lockout', lockoutTime.toString());
          
          setLimitModal({
            isOpen: true,
            type: user ? 'tiered' : 'anonymous',
            limitInfo: {
              limit: errorData.limit,
              current: errorData.current,
              resetsIn: errorData.resetsIn,
              tier: user ? (user as any).user_metadata?.tier || 'Free' : 'Anonymous'
            }
          });

          const limitError = new Error(errorData.message || 'Rate limit exceeded');
          (limitError as any).isRateLimit = true;
          throw limitError;
        }

        if (response.status === 401 && !user) {
          // Anonymous user tried something requiring auth (e.g. upload)
          setLimitModal({ isOpen: true, type: 'anonymous' });
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
                throw new Error(data.error);
              }
            } catch (e) { }
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
        
        // Add to store with the same optimistic ID used for streaming
        await addMessage(currentConvId, 'assistant', finalContent, { 
          optimisticId: assistantOptimisticId,
          mode: 'text' 
        });
        
        // Update usage indicator
        useUsageStore.getState().incrementLocalUsage();
        useUsageStore.getState().fetchStatus().catch(err => console.error('Failed to sync usage store:', err));
        
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
      if (displayError.includes('504') || displayError.toLowerCase().includes('gateway') || displayError.toLowerCase().includes('timeout')) {
        displayError = 'The server is currently overloaded or taking too long to respond. This can happen with very complex queries or high traffic.';
      }

      const errorId = `error-${Date.now()}`;
      const errorMessage = {
        id: errorId,
        conversation_id: currentConvId!,
        role: 'assistant' as const,
        content: displayError,
        metadata: {
          error: true,
          originalError: error.message,
          timestamp: Date.now()
        },
        created_at: new Date().toISOString()
      };

      setMessages([...useChatStore.getState().messages, errorMessage]);
    } finally {
      // Only clear local UI state if this was the active request for this conversation
      if (streamingIdRef.current === currentConvId) {
        setIsGenerating(false);
        setIsProcessingVideo(false);
        setStreamingMessage('');
        setDisplayedStreamingMessage('');
        fullContentRef.current = '';
        setStreamingStatus(null);
        streamingIdRef.current = null;
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
            {(chatLoading || (id && activeConversation?.id !== id)) ? (
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
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={styles.emptyIconBox}>
                  <Sparkles size={40} />
                </motion.div>
                <h1 className={styles.title}>How can Sree AI help?</h1>
                <div className={styles.suggestionGrid}>
                  {suggestions.map((s) => (
                    <button key={s.title} className={styles.suggestionCard} onClick={() => handleSend(s.title)}>
                      <span className={styles.suggestionTitle}>{s.title}</span>
                      <span className={styles.suggestionDesc}>{s.desc}</span>
                    </button>
                  ))}
                </div>
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
                      content: filteredStreamingMessage,
                      metadata: { 
                        mode: 'text',
                        optimisticId: streamingOptimisticIdRef.current 
                      }
                    }}
                    streamingStatus={streamingStatus}
                    isProcessingVideo={isProcessingVideo}
                    markdownComponents={markdownComponents}
                    filterThinkingTags={filterThinkingTags}
                    onRetry={() => {}}
                  />
                )}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>

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
            onAuthRequired={() => setLimitModal({ isOpen: true, type: 'anonymous' })}
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

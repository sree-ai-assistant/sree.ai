import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './ChatPage.module.css';
import { VoiceOverlay } from '../components/voice/VoiceOverlay';
import { ChatInput } from '../components/chat/ChatInput';
import { ThinkingAnimation } from '../components/chat/ThinkingAnimation';
import { MessageAttachment } from '../components/chat/MessageAttachment';
import { ModelSelector } from '../components/chat/ModelSelector';
import { useModelStore } from '../store/model.store';
import { useLocation } from 'react-router-dom';
import { CodeBlock } from '../components/chat/CodeBlock';
import { ChatMessage } from '../components/chat/ChatMessage';

const ChatPage: React.FC = () => {
  const { user } = useAuthStore();
  const [session, setSession] = useState<any>(null);
  const [lockTimeRemaining, setLockTimeRemaining] = useState<number>(0);
  const { selectedModel } = useModelStore();
  const {
    activeConversation,
    messages,
    addMessage,
    updateMessage,
    removeMessage,
    loading: chatLoading,
    setActiveConversation,
    createConversation,
    setMessages
  } = useChatStore();

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isVoiceRoute = location.pathname.startsWith('/voice');
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(isVoiceRoute);
  const { removeLastMessage } = useChatStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
  const typewriterRafRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const typewriterIntervalRef = useRef<number | null>(null);
  const fullContentRef = useRef('');

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

  // Performance: Use deferred value for the heavy Markdown rendering
  // This lets React prioritize scrolling and user input over text updates
  const deferredStreamingMessage = useDeferredValue(filteredStreamingMessage);

  const estimateTokens = (messages: any[]) => {
    let totalChars = 0;
    messages.forEach(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      totalChars += (m.role?.length || 0) + content.length + 20;
    });
    return Math.ceil(totalChars / 3.5);
  };

  useEffect(() => {
    if (id && id !== activeConversation?.id) {
      setActiveConversation(id);
    } else if (!id) {
      setActiveConversation(null);
    }
  }, [id, setActiveConversation]);

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
      return;
    }

    const typewriterInterval = 25; // 40fps - sweet spot for performance vs smoothness
    
    typewriterIntervalRef.current = window.setInterval(() => {
      setDisplayedStreamingMessage(prev => {
        if (fullContentRef.current.length > prev.length) {
          const bufferSize = fullContentRef.current.length - prev.length;
          
          // Adaptive scaling:
          // If stream is finished, dump everything faster but still in chunks to avoid UI lockup
          if (isStreamFinished) {
            if (bufferSize < 200) return fullContentRef.current;
            return fullContentRef.current.slice(0, prev.length + Math.max(100, Math.floor(bufferSize / 2)));
          }

          // Dynamic increments for "live" feel while handling bursts
          const increment = bufferSize > 2000 ? 500 :
                            bufferSize > 1000 ? 200 : 
                            bufferSize > 400 ? 80 : 
                            bufferSize > 100 ? 30 : 10;
          
          return fullContentRef.current.slice(0, prev.length + increment);
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
    if (isGenerating || !user?.id) return;

    let currentConvId = activeConversation?.id;

    if (!currentConvId) {
      const isVoice = location.pathname.startsWith('/voice');
      const newConv = await createConversation(user.id, messageContent.slice(0, 40) + '...', isVoice ? 'voice' : 'chat');
      if (!newConv) return;
      currentConvId = newConv.id;
      navigate(isVoice ? `/voice/chat/${newConv.id}` : `/chat/${newConv.id}`, { replace: true });
    }

    let userMsg: any = null;
    if (!isRetry) {
      userMsg = await addMessage(currentConvId, 'user', messageContent, {
        mode: 'text',
        attachments: currentAttachments.map(a => ({ name: a.file?.name || a.name, type: a.type, url: a.url, extractedText: a.extractedText }))
      });
      setAttachments([]);
    } else {
      userMsg = useChatStore.getState().messages.filter(m => m.role === 'user').pop();
    }

    setIsGenerating(true);
    setIsProcessingVideo(currentAttachments.some(a => a.type === 'video'));
    setStreamingMessage('');
    setDisplayedStreamingMessage('');
    fullContentRef.current = '';
    setAutoScrollEnabled(true);
    if (!isRetry) setStreamingStatus(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreamFinished(false);
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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession?.access_token}`,
        },
        body: JSON.stringify({
          messages: finalMessagesForRequest,
          model: selectedModel?.model_id,
          attachments: currentAttachments.map(a => ({ name: a.file?.name || a.name, type: a.type, url: a.url, extractedText: a.extractedText })),
          messageId: userMsg?.id,
          conversationId: currentConvId
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
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
            setIsStreamFinished(true);
            break;
          }

          if (trimmedLine.startsWith('data: ')) {
            try {
              const dataString = trimmedLine.substring(6);
              if (dataString === '[DONE]') {
                isStreamFinishedLocal = true;
                setIsStreamFinished(true);
                break;
              }

              const data = JSON.parse(dataString);
              if (data.content) {
                assistantMessage += data.content;
                fullContentRef.current = assistantMessage;
                setStreamingMessage(assistantMessage);
              } else if (data.status) {
                setStreamingStatus(data.status);
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
        let waitCount = 0;
        while (fullContentRef.current.length > displayedStreamingMessage.length && waitCount < 50) {
          await new Promise(r => setTimeout(r, 50));
          waitCount++;
        }
        
        // Final catch up
        setDisplayedStreamingMessage(finalContent);
        
        // Add to store
        await addMessage(currentConvId, 'assistant', finalContent, { mode: 'text' });
        
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
      setIsGenerating(false);
      setIsProcessingVideo(false);
      setStreamingMessage('');
      setDisplayedStreamingMessage('');
      fullContentRef.current = '';
      setStreamingStatus(null);
    }
  };


  return (
    <DashboardLayout>
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
            {chatLoading && messages.length === 0 ? (
              <div className={styles.loadingState}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`msg-skeleton-${i}`} className={`${styles.messageRow} ${i % 2 === 0 ? '' : styles.user}`}>
                    <div className={`${styles.avatar} skeleton skeleton-circle`} style={{ width: '32px', height: '32px' }}></div>
                    <div className={`${styles.bubble} skeleton`} style={{ width: i % 2 === 0 ? '60%' : '40%', height: '80px', border: 'none' }}></div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 && !chatLoading ? (
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
                    key={m.id || i}
                    message={m}
                    index={i}
                    markdownComponents={markdownComponents}
                    filterThinkingTags={filterThinkingTags}
                    onRetry={async (index, content, attachments, id) => {
                      if (activeConversation?.id && id) {
                        const allMessages = useChatStore.getState().messages;
                        const lastUserMsg = [...allMessages.slice(0, index + 1)].reverse().find(msg => msg.role === 'user');

                        if (lastUserMsg) {
                          await useChatStore.getState().truncateHistory(activeConversation.id, id);
                          handleSend(lastUserMsg.content, true, lastUserMsg.metadata?.attachments || [], 0);
                        }
                      }
                    }}
                  />
                ))}
                {isGenerating && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant' || messages[messages.length - 1]?.content !== streamingMessage) && (
                  <ChatMessage
                    isStreaming
                    index={messages.length}
                    message={{ 
                      role: 'assistant', 
                      content: deferredStreamingMessage,
                      metadata: { mode: 'text' }
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
      </>
    </DashboardLayout>
  );
};

export default ChatPage;

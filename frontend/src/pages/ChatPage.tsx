import React, { useState, useRef, useEffect } from 'react';
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

  const [attachments, setAttachments] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [isStreamFinished, setIsStreamFinished] = useState(false);
  const assistantMessageRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const filterThinkingTags = (content: any) => {
    if (!content) return '';
    
    let textContent = content;
    
    if (typeof content === 'string' && content.trim().startsWith('[') && content.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          const textObj = parsed.find(item => item.type === 'text');
          if (textObj) {
            textContent = textObj.text;
          }
        }
      } catch (e) {}
    } else if (Array.isArray(content)) {
      const textObj = content.find(item => item.type === 'text');
      if (textObj) {
        textContent = textObj.text;
      }
    }
    
    if (typeof textContent !== 'string') {
      textContent = String(textContent);
    }

    let processed = textContent.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');
    processed = processed.replace(/<(think|thinking)>[\s\S]*/gi, '');
    processed = processed.replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '');
    return processed.trim();
  };

  const estimateTokens = (messages: any[]) => {
    // Standard heuristic: 1 token approx 3.5-4 chars for English
    // We use 3.5 for a safer (more conservative) estimate
    let totalChars = 0;
    messages.forEach(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      totalChars += (m.role?.length || 0) + content.length + 20; // 20 chars for JSON formatting overhead
    });
    return Math.ceil(totalChars / 3.5);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (id && id !== activeConversation?.id) {
      setActiveConversation(id);
    } else if (!id) {
      setActiveConversation(null);
    }
  }, [id, setActiveConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, streamingMessage]);

  const suggestions = [
    { title: 'Write a technical blog', desc: 'About React 19 features' },
    { title: 'Explain Quantum computing', desc: 'To a 10 year old kid' },
    { title: 'Write an email', desc: 'To request a budget increase' },
    { title: 'Debug my code', desc: 'Help find the memory leak' },
  ];

  const handleSend = async (text?: string, isRetry: boolean = false, retryAttachments: any[] = [], autoRetryCount: number = 0) => {
    if (lockTimeRemaining > 0) return;

    const currentAttachments = isRetry ? retryAttachments : [...attachments];
    
    // Prevent sending if any file is still uploading
    if (currentAttachments.some(a => a.isUploading)) {
      return;
    }

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
    if (!isRetry) setStreamingStatus(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setIsStreamFinished(false);
    let assistantMessage = '';
    let isStreamFinishedLocal = false;
    let isSaved = false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Strict Context Cleanup: Filter out error messages and aborted messages
      // We also filter out any message that is the currently "active" user message if it's already in the store (to avoid duplicates)
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

      // Add the current user message to the history
      messageHistory.push({
        role: 'user',
        content: userMsg.content,
        metadata: {
          ...userMsg.metadata,
          attachments: userMsg.metadata?.attachments || []
        }
      });

      // Token Logic: Calculate and compare with model limits
      const contextWindow = selectedModel?.context_window || 4096;
      const reservedTokens = 1024; // Space for the AI response
      const safeThreshold = contextWindow - reservedTokens - 50; // Tighter threshold
      
      let finalMessagesForRequest = [...messageHistory];
      const requestTokenSize = estimateTokens(finalMessagesForRequest);
      
      console.log(`[Token Logic] Request Size: ${requestTokenSize} tokens | Limit: ${safeThreshold} tokens (Reserved: ${reservedTokens})`);
      
      if (requestTokenSize > safeThreshold) {
        console.warn(`[Token Logic] Request exceeds threshold. Reducing context size...`);
        // Remove oldest messages (skipping system) until within threshold
        while (estimateTokens(finalMessagesForRequest) > safeThreshold && finalMessagesForRequest.length > 2) {
          const indexToRemove = finalMessagesForRequest[0].role === 'system' ? 1 : 0;
          finalMessagesForRequest.splice(indexToRemove, 1);
        }
        console.log(`[Token Logic] Reduced Request Size: ${estimateTokens(finalMessagesForRequest)} tokens`);
      }

      console.log(`[Chat] Sending request to AI with model: ${selectedModel?.model_id}`);

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
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

      console.log('[Streaming] Stream started...');

      while (true) {
        const { done, value } = await reader!.read();
        
        // Console log comparison for stopping
        console.log(`[Streaming] Chunk read. done=${done}`);
        
        if (done) {
          console.log('[Streaming] Reader returned done=true. Stopping stream.');
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine === 'data: [DONE]') {
            console.log('[Streaming] STOP SIGNAL detected: data: [DONE]. Terminating loop.');
            isStreamFinishedLocal = true;
            setIsStreamFinished(true);
            break;
          }

          if (trimmedLine.startsWith('data: ')) {
            try {
              const dataString = trimmedLine.substring(6);
              if (dataString === '[DONE]') {
                console.log('[Streaming] JSON Stop signal detected. Terminating.');
                isStreamFinishedLocal = true;
                setIsStreamFinished(true);
                break;
              }
              
              const data = JSON.parse(dataString);
              if (data.content) {
                assistantMessage += data.content;
                setStreamingMessage(assistantMessage);
              } else if (data.status) {
                setStreamingStatus(data.status);
              } else if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              console.warn('[Streaming] Parse warning:', trimmedLine);
            }
          }
        }
        
        if (isStreamFinishedLocal) break;
      }

      if (currentConvId && !isSaved) {
        isSaved = true;
        // Ensure no assistant response is blank
        const finalContent = assistantMessage.trim() || "😓🫠";
        await addMessage(currentConvId, 'assistant', finalContent, { mode: 'text' });
      }

    } catch (error: any) {
      console.error('[ChatPage] Error in handleSend:', error);
      
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

      // Automatic Retry Logic
      if (autoRetryCount < 1) {
        console.warn(`[ChatPage] Error occurred. Initiating automatic retry 1/1...`);
        setStreamingStatus('Retrying with optimized context...');
        return handleSend(text, true, currentAttachments, autoRetryCount + 1);
      }

      // If we have partial content, save it as a message before showing the error card
      const hasPartialContent = assistantMessage.trim().length > 0;
      if (hasPartialContent && currentConvId) {
        await addMessage(currentConvId, 'assistant', assistantMessage.trim(), { 
          interrupted: true,
          timestamp: Date.now()
        });
      }

      // If we reach here, retries failed or it's the second error
      let displayError = error.message || 'encountered a service interruption.';
      if (displayError.includes('504') || displayError.toLowerCase().includes('gateway') || displayError.toLowerCase().includes('timeout')) {
        displayError = 'The server is currently overloaded or taking too long to respond. This can happen with very complex queries or high traffic.';
      }
      
      // Instead of persisting the error to Supabase, we only add it to the local state
      // This ensures that error cards don't reappear upon page refresh.
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

        <div className={styles.messagesList}>
          {messages.length === 0 && !chatLoading ? (
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
                <React.Fragment key={m.id || i}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`${styles.messageRow} ${m.role === 'user' ? styles.user : ''}`}
                  >
                    <div className={`${styles.avatar} ${m.role === 'assistant' ? styles.ai : ''}`}>
                      {m.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                    </div>
                    <div className={`${styles.bubble} ${m.role === 'assistant' ? styles.ai : styles.user} ${m.metadata?.error ? styles.error : ''}`}>
                      <div
                        className={styles.markdown}
                        style={m.metadata?.mode === 'voice' ? { fontStyle: 'italic' } : {}}
                      >
                        {m.metadata?.attachments && (
                          <MessageAttachment attachments={m.metadata.attachments} />
                        )}
                        {m.role === 'assistant' && m.metadata?.error ? (
                          <div className={styles.errorBubbleContent}>
                            <div className={styles.errorHeader}>
                              <AlertCircle size={16} />
                              <span>Request Failed</span>
                            </div>
                            <p className={styles.errorText}>{m.content}</p>
                            <div className={styles.errorContainer}>
                              <button
                                className={styles.retryButton}
                                onClick={async () => {
                                  // Find the last user message to retry
                                  const allMessages = useChatStore.getState().messages;
                                  const lastUserMsg = [...allMessages.slice(0, i + 1)].reverse().find(msg => msg.role === 'user');
                                  
                                  if (lastUserMsg && activeConversation?.id) {
                                    // 1. Truncate history starting from this error message (deletes from DB and UI)
                                    await useChatStore.getState().truncateHistory(activeConversation.id, m.id);
                                    
                                    // 2. Trigger send with the last user message's content
                                    handleSend(lastUserMsg.content, true, lastUserMsg.metadata?.attachments || [], 0);
                                  }
                                }}
                              >
                                <RefreshCw size={14} />
                                Retry Message
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
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
                                table({ children }) {
                                  return (
                                    <div className={styles.tableWrapper}>
                                      <table>{children}</table>
                                    </div>
                                  );
                                },
                              }}
                            >
                              {filterThinkingTags(m.content)}
                            </ReactMarkdown>
                            {m.metadata?.interrupted && (
                              <div className={styles.interruptedTag}>
                                <AlertCircle size={12} />
                                <span>Interrupted</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  {/* Fallback for consecutive user messages */}
                  {m.role === 'user' && 
                   i < messages.length - 1 && 
                   messages[i+1].role === 'user' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={styles.messageRow}
                    >
                      <div className={`${styles.avatar} ${styles.ai}`}>
                        <Bot size={20} />
                      </div>
                      <div className={`${styles.bubble} ${styles.ai}`}>
                        <div className={styles.markdown}>
                          😓🫠
                        </div>
                      </div>
                    </motion.div>
                  )}
                </React.Fragment>
              ))}
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={styles.messageRow}
                >
                  <div className={`${styles.avatar} ${styles.ai}`}>
                    <Bot size={20} />
                  </div>
                  <div className={`${styles.bubble} ${styles.ai} ${isGenerating ? styles.streaming : ''}`}>
                    <div className={styles.markdown}>
                      {(!streamingMessage || !filterThinkingTags(streamingMessage)) ? (
                        <ThinkingAnimation status={streamingStatus} isVideo={isProcessingVideo} />
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
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
                            table({ children }) {
                              return (
                                <div className={styles.tableWrapper}>
                                  <table>{children}</table>
                                </div>
                              );
                            },
                          }}
                        >
                          {filterThinkingTags(streamingMessage)}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                </motion.div>
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

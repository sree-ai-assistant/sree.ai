import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Sparkles, RefreshCw } from 'lucide-react';
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
  const { selectedModel } = useModelStore();
  const {
    activeConversation,
    messages,
    addMessage,
    updateMessage,
    loading: chatLoading,
    setActiveConversation,
    createConversation
  } = useChatStore();

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isVoiceRoute = location.pathname.startsWith('/voice');
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(isVoiceRoute);

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

  const [attachments, setAttachments] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
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
    
    // Check if it's a stringified JSON array (e.g. from backend frame injection)
    if (typeof content === 'string' && content.trim().startsWith('[') && content.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          const textObj = parsed.find(item => item.type === 'text');
          if (textObj) {
            textContent = textObj.text;
          }
        }
      } catch (e) {
        // Not valid JSON, continue with original string
      }
    } else if (Array.isArray(content)) {
      const textObj = content.find(item => item.type === 'text');
      if (textObj) {
        textContent = textObj.text;
      }
    }
    
    if (typeof textContent !== 'string') {
      textContent = String(textContent);
    }

    // Remove closed tags
    let processed = textContent.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');
    // Remove open tags and everything after them (for streaming)
    processed = processed.replace(/<(think|thinking)>[\s\S]*/gi, '');
    return processed;
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

  // Handle page reload/close during generation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isGenerating && assistantMessageRef.current && activeConversation?.id) {
        const currentConvId = activeConversation.id;
        const finalContent = assistantMessageRef.current;

        // Use a background fetch with keepalive to save progress even if page closes
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseKey && session?.access_token) {
          fetch(`${supabaseUrl}/rest/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              conversation_id: currentConvId,
              role: 'assistant',
              content: finalContent,
              metadata: { mode: 'text', interrupted: true }
            }),
            keepalive: true
          }).catch(console.error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isGenerating, activeConversation, session]);

  const handleSend = async (text?: string) => {
    const messageContent = text || '';
    const hasAttachments = attachments.length > 0;

    if (!messageContent.trim() && !hasAttachments) return;
    if (isGenerating || !user?.id) return;

    let currentConvId = activeConversation?.id;

    // 1. Create conversation if none active
    if (!currentConvId) {
      const isVoice = location.pathname.startsWith('/voice');
      const newConv = await createConversation(
        user.id,
        messageContent.slice(0, 40) + '...',
        isVoice ? 'voice' : 'chat'
      );
      if (!newConv) return;
      currentConvId = newConv.id;
      // Redirect to the new conversation URL
      navigate(isVoice ? `/voice/chat/${newConv.id}` : `/chat/${newConv.id}`, { replace: true });
    }

    // 2. Add user message locally and to DB
    const userMsg = await addMessage(currentConvId, 'user', messageContent, {
      mode: 'text',
      attachments: attachments.map(a => ({
        name: a.file.name,
        type: a.type,
        url: a.url
      }))
    });

    const currentAttachments = [...attachments];
    setAttachments([]);
    useModelStore.getState().setVisionRequired(false); // Reset vision requirement after send

    setIsGenerating(true);
    setStreamingMessage('');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let assistantMessage = '';
    let inactivityTimeout: any = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
        metadata: m.metadata
      }));

      // Construct current message payload
      let currentMessageContent: any = messageContent;
      const imageUrls = currentAttachments
        .filter(a => a.type === 'image' && a.url)
        .map(a => ({ type: 'image_url', image_url: { url: a.url } }));

      if (imageUrls.length > 0) {
        currentMessageContent = [
          { type: 'text', text: messageContent || "What is in this image?" },
          ...imageUrls
        ];
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          messages: [...apiMessages, { role: 'user', content: currentMessageContent }],
          model: selectedModel?.model_id || 'meta/llama-3.1-405b-instruct',
          attachments: currentAttachments.map(a => ({
            name: a.file.name,
            type: a.type,
            url: a.url,
            extractedText: a.extractedText
          })),
          messageId: userMsg?.id
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to connect to AI engine');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let hasStartedStreaming = false;

      let isStreamFinished = false;
      
      const resetInactivityTimeout = () => {
        if (inactivityTimeout) clearTimeout(inactivityTimeout);
        if (hasStartedStreaming) {
          inactivityTimeout = setTimeout(() => {
            console.warn('Stream inactivity timeout reached, aborting stream to save partial data.');
            controller.abort('timeout');
          }, 45000); // 45 seconds timeout
        }
      };

      // Global fallback timeout (5 minutes) in case the connection hangs completely
      // before streaming starts or if the stream dies without closing.
      const globalTimeout = setTimeout(() => {
        console.warn('Global request timeout reached, aborting.');
        controller.abort('timeout');
      }, 5 * 60 * 1000);

      while (!isStreamFinished) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.replace(/^data:\s*/, '').trim();
            if (dataStr === '[DONE]') {
              isStreamFinished = true;
              break;
            }

            try {
              const { content, status, error, extractedContext } = JSON.parse(dataStr);
              
              if (extractedContext && userMsg) {
                updateMessage(userMsg.id, userMsg.content, {
                  ...userMsg.metadata,
                  hasContext: true,
                  extractedContext: extractedContext
                });
                continue;
              }

              if (status) {
                setStreamingStatus(status);
                continue;
              }
              if (error) throw new Error(error);
              if (content) {
                setStreamingStatus(null);
                assistantMessage += content;
                assistantMessageRef.current = assistantMessage;

                if (!hasStartedStreaming) {
                  hasStartedStreaming = true;
                  await new Promise(resolve => setTimeout(resolve, 100));
                }

                setStreamingMessage(assistantMessage);
              }
            } catch (e) {
              console.error('Error parsing stream chunk:', e);
            }
          }
        }
        
        // Reset the inactivity timeout after processing the chunk, 
        // so it covers the wait time for the next reader.read()
        resetInactivityTimeout();
      }

      clearTimeout(globalTimeout);

      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      setStreamingStatus(null);

      const finalAssistantContent = assistantMessage;
      assistantMessageRef.current = ''; // Prevent double save on reload

      // 3. Save assistant message to DB
      await addMessage(currentConvId, 'assistant', finalAssistantContent, { mode: 'text' });

      // ONLY THEN reset loading to ensure no layout jump or button lag
      setIsGenerating(false);
      setStreamingMessage('');
      abortControllerRef.current = null;

    } catch (error: any) {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      
      if (error === 'timeout' || error?.name === 'AbortError') {
        console.log('Stream aborted or timed out');
        if (assistantMessage && currentConvId) {
          assistantMessageRef.current = ''; // Prevent double save
          await addMessage(currentConvId, 'assistant', assistantMessage, { mode: 'text' });
        }
        setStreamingMessage('');
        setIsGenerating(false);
        return;
      }
      console.error('Chat Error:', error);
      setIsGenerating(false);

      const isTimeout = error === 'timeout' || error?.message?.includes('timeout') || error?.name === 'TimeoutError' || error?.message?.includes('timed out');
      const errorMessage = isTimeout
        ? "💀 Something Went Wrong !!!\nPlease try again"
        : `⚠️ Error: ${error?.message || error}. Please check your NVIDIA API key in settings.`;

      await addMessage(currentConvId, 'assistant', errorMessage, {
        mode: 'text',
        error: isTimeout ? 'timeout' : 'general'
      });
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <DashboardLayout>
      <div className={styles.container}>
        <div className={styles.header}>
          <ModelSelector />
        </div>

        <div className={styles.messagesList}>
          {messages.length === 0 && !chatLoading ? (
            <div className={styles.emptyState}>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={styles.emptyIconBox}
              >
                <Sparkles size={40} />
              </motion.div>
              <h1 className={styles.title}>How can Sree AI help?</h1>
              <p className={styles.subtitle}>Our most powerful model is ready to assist you with writing, debugging, and brainstorming.</p>

              <div className={styles.suggestionGrid}>
                {suggestions.map((s) => (
                  <button
                    key={s.title}
                    className={styles.suggestionCard}
                    onClick={() => handleSend(s.title)}
                  >
                    <span className={styles.suggestionTitle}>{s.title}</span>
                    <span className={styles.suggestionDesc}>{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={m.id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${styles.messageRow} ${m.role === 'user' ? styles.user : ''}`}
                >
                  <div className={`${styles.avatar} ${m.role === 'assistant' ? styles.ai : ''}`}>
                    {m.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                  </div>
                  <div className={`${styles.bubble} ${m.role === 'assistant' ? styles.ai : styles.user}`}>
                    <div
                      className={styles.markdown}
                      style={m.metadata?.mode === 'voice' ? { fontStyle: 'italic' } : {}}
                    >
                      {m.metadata?.attachments && (
                        <MessageAttachment attachments={m.metadata.attachments} />
                      )}
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
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
                        }}
                      >
                        {filterThinkingTags(m.content)}
                      </ReactMarkdown>

                      {m.role === 'assistant' && m.metadata?.error === 'timeout' && (
                        <button
                          className={styles.retryButton}
                          onClick={() => {
                            // Find the last user message to retry
                            const lastUserMsg = [...messages.slice(0, i)].reverse().find(msg => msg.role === 'user');
                            if (lastUserMsg) {
                              handleSend(lastUserMsg.content);
                            }
                          }}
                        >
                          <RefreshCw size={14} />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
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
                        <ThinkingAnimation status={streamingStatus} />
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
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
          onSend={handleSend}
          onStop={handleStop}
          isGenerating={isGenerating}
          hasMessages={messages.length > 0}
          onVoiceLaunch={() => navigate(id ? `/voice/chat/${id}` : '/voice')}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
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
    </DashboardLayout>
  );
};

export default ChatPage;

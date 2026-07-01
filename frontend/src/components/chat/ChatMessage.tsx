import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, AlertCircle, RefreshCw, Copy, Check, Volume2, VolumeX, Play, Pause, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../../pages/ChatPage.module.css';
import { MessageAttachment } from './MessageAttachment';
import { ThinkingAnimation } from './ThinkingAnimation';

interface ChatMessageProps {
  message: any;
  index: number;
  markdownComponents: any;
  filterThinkingTags: (content: string) => string;
  onRetry: (index: number, content: string, attachments: any[], id?: string) => void;
  isStreaming?: boolean;
  streamingStatus?: string | null;
  isProcessingVideo?: boolean;
  activeTtsMessageId?: string | null;
  ttsStatus?: 'idle' | 'preparing' | 'playing' | 'paused';
  onPlayTts?: (messageId: string, text: string) => void;
  onStopTts?: () => void;
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message: m,
  index: i,
  markdownComponents,
  filterThinkingTags,
  onRetry,
  isStreaming,
  streamingStatus,
  isProcessingVideo,
  activeTtsMessageId,
  ttsStatus,
  onPlayTts,
  onStopTts
}) => {
  const [copied, setCopied] = useState(false);
  const messageId = m.id || `msg_${i}`;
  const isPlayingThisTts = activeTtsMessageId === messageId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`${styles.messageRow} ${m.role === 'user' ? styles.user : ''} ${isStreaming ? styles.streamingRow : ''}`}
    >
      <div className={`${styles.avatar} ${m.role === 'assistant' ? styles.ai : ''}`}>
        {m.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
      </div>
      <div className={`${styles.bubble} ${m.role === 'assistant' ? styles.ai : styles.user} ${m.metadata?.error ? styles.error : ''} ${isStreaming ? styles.streaming : ''}`}>
        <div
          className={styles.markdown}
          style={m.metadata?.mode === 'voice' ? { fontStyle: 'italic' } : {}}
        >
          {isStreaming && (!m.content || !m.content.trim()) ? (
            <ThinkingAnimation status={streamingStatus} isVideo={isProcessingVideo} />
          ) : (
            <>
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
                      onClick={() => onRetry(i, m.content, m.metadata?.attachments || [], m.id)}
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
                    components={markdownComponents}
                  >
                    {filterThinkingTags(m.content)}
                  </ReactMarkdown>

                  {m.metadata?.interrupted && (
                    <div className={styles.interruptedTag}>
                      <AlertCircle size={12} />
                      <span>Interrupted</span>
                    </div>
                  )}

                  {m.role === 'assistant' && !isStreaming && onPlayTts && (
                    <div className={styles.responseActions}>
                      <button
                        className={`${styles.actionBtn} ${isPlayingThisTts ? styles.playing : ''}`}
                        onClick={() => onPlayTts?.(messageId, m.content)}
                      >
                        {isPlayingThisTts ? (
                          <>
                            {ttsStatus === 'preparing' && <Loader2 size={15} className={styles.spinner} />}
                            {ttsStatus === 'playing' && <Pause size={15} />}
                            {ttsStatus === 'paused' && <Play size={15} />}
                            {(!ttsStatus || ttsStatus === 'idle') && <Volume2 size={15} />}
                          </>
                        ) : (
                          <Volume2 size={15} />
                        )}
                        <span>
                          {isPlayingThisTts ? (
                            <>
                              {ttsStatus === 'preparing' && 'Preparing'}
                              {ttsStatus === 'playing' && 'Pause'}
                              {ttsStatus === 'paused' && 'Play'}
                              {(!ttsStatus || ttsStatus === 'idle') && 'Read'}
                            </>
                          ) : (
                            'Read'
                          )}
                        </span>
                      </button>
                      <button className={styles.actionBtn} onClick={handleCopy}>
                        {copied ? <Check size={15} /> : <Copy size={15} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {m.role === 'user' && !isStreaming && (
        <button
          className={styles.userCopyButton}
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy prompt"}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </motion.div>
  );
};

export const ChatMessage = React.memo(ChatMessageComponent, (prevProps, nextProps) => {
  return (
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.role === nextProps.message.role &&
    JSON.stringify(prevProps.message.metadata) === JSON.stringify(nextProps.message.metadata) &&
    prevProps.index === nextProps.index &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.streamingStatus === nextProps.streamingStatus &&
    prevProps.isProcessingVideo === nextProps.isProcessingVideo &&
    prevProps.activeTtsMessageId === nextProps.activeTtsMessageId &&
    prevProps.ttsStatus === nextProps.ttsStatus
  );
});

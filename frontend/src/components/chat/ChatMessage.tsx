import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User, AlertCircle, RefreshCw } from 'lucide-react';
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
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message: m,
  index: i,
  markdownComponents,
  filterThinkingTags,
  onRetry,
  isStreaming,
  streamingStatus,
  isProcessingVideo
}) => {
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
          {isStreaming && !m.content ? (
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
                </>
              )}
            </>
          )}
        </div>
      </div>
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
    prevProps.isProcessingVideo === nextProps.isProcessingVideo
  );
});

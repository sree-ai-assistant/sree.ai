import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, User, AlertCircle, RefreshCw, Copy, Check, Volume2, VolumeX, Play, Pause, Loader2, Bug } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../../pages/ChatPage.module.css';
import { MessageAttachment } from './MessageAttachment';
import { ThinkingAnimation } from './ThinkingAnimation';
import { useChatStore } from '../../store/chat.store';

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
  const navigate = useNavigate();
  const { messages, activeConversation } = useChatStore();
  const [copied, setCopied] = useState(false);
  const messageId = m.id || `msg_${i}`;
  const isPlayingThisTts = activeTtsMessageId === messageId;

  const handleReportBug = () => {
    const errorText = m.content || m.metadata?.originalError || 'Chat request failed';
    const usedModel = m.metadata?.model || (activeConversation as any)?.model || 'AI Model';
    const errorCode = m.metadata?.code;
    const rawTitle = `[Chat] ${usedModel}: ${errorText}${errorCode ? ` (${errorCode})` : ''}`;
    const bugTitle = rawTitle.length > 80 ? rawTitle.substring(0, 77) + '...' : rawTitle;

    const prevUserMsg = messages.slice(0, i).reverse().find((msg: any) => msg.role === 'user');
    const userPrompt = prevUserMsg?.content || '';

    const errorDetails = [
      `### Chat Error Report`,
      `- **Model**: ${usedModel}`,
      `- **Error Message**: ${errorText}`,
      m.metadata?.originalError && m.metadata.originalError !== errorText ? `- **Original Error**: ${m.metadata.originalError}` : null,
      errorCode ? `- **Error Code**: ${errorCode}` : null,
      `- **Timestamp**: ${new Date(m.metadata?.timestamp || Date.now()).toISOString()}`,
      userPrompt ? `- **User Prompt**: "${userPrompt.slice(0, 300)}"` : null,
      `- **Browser / Client**: ${navigator.userAgent.slice(0, 140)}`,
    ].filter(Boolean).join('\n');

    const reproductionSteps = [
      `1. Open Chat interface`,
      `2. Selected Model: ${usedModel}`,
      userPrompt ? `3. Sent prompt: "${userPrompt.slice(0, 150)}"` : `3. Sent message in conversation`,
      `4. Request failed with error: "${errorText}"${errorCode ? ` [Code: ${errorCode}]` : ''}`,
    ].join('\n');

    navigate('/feature-request?category=bug_report', {
      state: {
        category: 'bug_report',
        title: bugTitle,
        description: errorDetails,
        stepsToReproduce: reproductionSteps,
        priority: 'high_impact',
      },
    });
  };

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
    <div
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
                    <button
                      type="button"
                      className={styles.reportBugButton}
                      onClick={handleReportBug}
                      title="Report this error to help improve Sree Ai"
                    >
                      <Bug size={14} />
                      Report This Bug/Error
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
    </div>
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

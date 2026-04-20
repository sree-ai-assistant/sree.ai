import React from 'react';
import { Paperclip, Mic, Image as ImageIcon, Send, Loader2 } from 'lucide-react';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text?: string) => void;
  isGenerating?: boolean;
  hasMessages: boolean;
  onVoiceLaunch?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  isGenerating = false,
  hasMessages,
  onVoiceLaunch
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={styles.inputWrapper}>
      {!hasMessages && <div className={styles.outerAura} />}
      <div className={styles.inputContainer}>
        {!hasMessages && <div className={styles.neonBorder} />}
        
        <button className={styles.iconBtn}>
          <Paperclip size={20} />
        </button>
        
        <input
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          disabled={isGenerating}
        />
        
        <div className={styles.inputActions}>
          <button 
            className={styles.iconBtn}
            title="Launch Voice Mode"
            onClick={onVoiceLaunch}
          >
            <Mic size={20} />
          </button>
          <button className={styles.iconBtn}>
            <ImageIcon size={20} />
          </button>
          <button 
            className={styles.sendBtn}
            onClick={() => onSend()}
            disabled={isGenerating || !value.trim()}
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

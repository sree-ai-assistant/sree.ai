import React, { useRef } from 'react';
import { Plus, Mic, Image as ImageIcon, ArrowUp, Loader2, X, FileText, Maximize2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ChatInput.module.css';
import { useModelStore } from '../../store/model.store';
import { uploadFile } from '../../api/storage';

export interface Attachment {
  file: File;
  preview: string;
  url?: string;
  type: 'image' | 'document';
  isUploading?: boolean;
}

interface ChatInputProps {
  onSend: (text: string) => void;
  isGenerating?: boolean;
  hasMessages: boolean;
  onVoiceLaunch?: () => void;
  onStop?: () => void;
  attachments: Attachment[];
  onAttachmentsChange: React.Dispatch<React.SetStateAction<Attachment[]>>;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  isGenerating = false,
  hasMessages,
  onVoiceLaunch,
  attachments,
  onAttachmentsChange
}) => {
  const [internalValue, setInternalValue] = React.useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const { setVisionRequired } = useModelStore();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isGenerating) {
        onStop?.();
      } else {
        handleAction();
      }
    }
  };

  const handleAction = () => {
    if (isGenerating) {
      onStop?.();
    } else {
      if (internalValue.trim() || attachments.length > 0) {
        onSend(internalValue);
        setInternalValue(''); // Clear local state after sending
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const validFiles = files.filter(file => file.size <= MAX_SIZE);
    
    if (validFiles.length < files.length) {
      toast.error("File Size Limit Exceded upload file less them 10MB !!!", {
        style: {
          background: '#ff4757',
          color: '#fff',
          fontWeight: 'bold',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#ff4757',
        },
      });
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const newAttachments: Attachment[] = validFiles.map(file => {
      const isImage = file.type.startsWith('image/');
      return {
        file,
        preview: URL.createObjectURL(file),
        type: isImage ? 'image' : 'document',
        isUploading: true
      };
    });

    const updated = [...attachments, ...newAttachments];
    onAttachmentsChange(updated);
    setVisionRequired(updated.length > 0);

    // Perform actual uploads
    newAttachments.forEach(async (atl, idx) => {
      const globalIdx = attachments.length + idx;
      
      const result = await uploadFile(atl.file);
      
      onAttachmentsChange(prev => {
        const next = [...prev];
        if (next[globalIdx]) {
          next[globalIdx] = { 
            ...next[globalIdx], 
            isUploading: false,
            url: result.success ? result.url : undefined
          };
        }
        return next;
      });
    });

    // Reset inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(updated);
    setVisionRequired(updated.length > 0);
  };

  return (
    <div className={styles.inputWrapper}>
      {!hasMessages && <div className={styles.outerAura} />}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange}
        multiple
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        style={{ display: 'none' }} 
        accept="image/*"
        onChange={handleFileChange}
        multiple
      />

      <div className={styles.inputContainer}>
        {!hasMessages && <div className={styles.neonBorder} />}
        
        {attachments.length > 0 && (
          <div className={styles.attachmentsList}>
            {attachments.map((atl, idx) => (
              atl.type === 'document' ? (
                <div key={idx} className={styles.attachmentCard}>
                  <div className={`${styles.cardIcon} ${atl.isUploading ? styles.uploading : ''}`}>
                    {atl.isUploading ? (
                      <div className={styles.progressRing}>
                        <svg viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="40" />
                        </svg>
                      </div>
                    ) : (
                      <FileText size={18} />
                    )}
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardFileName}>{atl.file.name}</span>
                    <span className={styles.cardFileType}>
                      {atl.file.name.split('.').pop()?.toUpperCase() || 'File'}
                    </span>
                  </div>
                  <button className={styles.cardRemoveBtn} onClick={() => removeAttachment(idx)}>
                    <div className={styles.xCircle}><X size={12} /></div>
                  </button>
                </div>
              ) : (
                <div key={idx} className={styles.imageThumbContainer}>
                  <img 
                    src={atl.preview} 
                    alt="thumb" 
                    className={styles.imageThumb} 
                    onClick={() => setPreviewImage(atl.preview)}
                  />
                  <button className={styles.imageRemoveBtn} onClick={() => removeAttachment(idx)}>
                    <div className={styles.xCircle}><X size={12} /></div>
                  </button>
                </div>
              )
            ))}
          </div>
        )}

        <div className={styles.inputInner}>
          <button className={styles.iconBtn} onClick={() => fileInputRef.current?.click()}>
            <Plus size={22} />
          </button>
          
          <input
            className={styles.input}
            value={internalValue}
            onChange={(e) => setInternalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
          />
          
          <div className={styles.inputActions}>
            <button 
              className={styles.iconBtn}
              title="Launch Voice Mode"
              onClick={onVoiceLaunch}
            >
              <Mic size={20} />
            </button>
            <button 
              className={`${styles.sendBtn} ${isGenerating ? styles.stopBtn : ''}`}
              onClick={handleAction}
              disabled={attachments.some(a => a.isUploading) || (!isGenerating && !internalValue.trim() && attachments.length === 0)}
              style={attachments.some(a => a.isUploading) ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="stop"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                  >
                    <div className={styles.square} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="send"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                  >
                    <ArrowUp size={20} strokeWidth={3} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.lightbox}
            onClick={() => setPreviewImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={styles.lightboxContent}
              onClick={e => e.stopPropagation()}
            >
              <img src={previewImage} alt="Full preview" />
              <button className={styles.closeLightbox} onClick={() => setPreviewImage(null)}>
                <X size={24} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


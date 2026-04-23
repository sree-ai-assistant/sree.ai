import React, { useRef } from 'react';
import { Plus, Mic, ArrowUp, X, FileText, Table, Music, Video } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ChatInput.module.css';
import { useModelStore } from '../../store/model.store';
import { uploadFile } from '../../api/storage';

export interface Attachment {
  file: File;
  preview: string;
  url?: string;
  type: 'image' | 'document' | 'audio' | 'video';
  isUploading?: boolean;
  extractedText?: string;
}

interface ChatInputProps {
  onSend: (text: string) => void;
  isGenerating?: boolean;
  hasMessages: boolean;
  onVoiceLaunch?: () => void;
  onStop?: () => void;
  attachments: Attachment[];
  onAttachmentsChange: React.Dispatch<React.SetStateAction<Attachment[]>>;
  disabled?: boolean;
  placeholderText?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  isGenerating = false,
  hasMessages,
  onVoiceLaunch,
  attachments,
  onAttachmentsChange,
  disabled = false,
  placeholderText
}) => {
  const [internalValue, setInternalValue] = React.useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const { setVisionRequired } = useModelStore();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
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
    if (disabled) return;
    if (isGenerating) {
      onStop?.();
    } else {
      if (internalValue.trim() || attachments.length > 0) {
        onSend(internalValue);
        setInternalValue(''); // Clear local state after sending
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const newAttachments: Attachment[] = await Promise.all(validFiles.map(async file => {
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/');
      let extractedText = '';
      
      if (!isImage && !isAudio && !isVideo) {
        try {
          const textFiles = ['txt', 'md', 'js', 'ts', 'tsx', 'json', 'css', 'html', 'py', 'c', 'cpp', 'rs', 'go', 'sh', 'yaml', 'yml', 'sql', 'xml', 'log'];
          const extension = file.name.split('.').pop()?.toLowerCase();
          
          if (textFiles.includes(extension || '')) {
            extractedText = await file.text();
          } else if (extension === 'ipynb') {
            const content = await file.text();
            const data = JSON.parse(content);
            if (data.cells) {
              extractedText = data.cells
                .filter((c: any) => c.cell_type === 'markdown' || c.cell_type === 'code')
                .map((c: any) => `\n--- ${c.cell_type} ---\n${Array.isArray(c.source) ? c.source.join('') : c.source}`)
                .join('\n');
            }
          } else if (extension === 'pdf') {
            try {
              const pdfjs = await import('pdfjs-dist');
              pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
              
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
              let fullText = '';
              
              for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n';
              }
              extractedText = fullText;
            } catch (pdfError) {
              console.error('PDF extraction failed:', pdfError);
            }
          } else if (['docx', 'doc', 'odt', 'rtf'].includes(extension || '')) {
            try {
              const mammoth = await import('mammoth');
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer });
              extractedText = result.value;
            } catch (err) {
              console.error('Doc extraction failed:', err);
            }
          } else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'tab', 'prn'].includes(extension || '')) {
            try {
              const XLSX = await import('xlsx');
              const arrayBuffer = await file.arrayBuffer();
              const workbook = XLSX.read(arrayBuffer, { 
                type: 'array',
                cellDates: true,
                cellText: true 
              });
              let excelText = '';
              workbook.SheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName];
                if (worksheet) {
                  const sheetCsv = XLSX.utils.sheet_to_csv(worksheet, { 
                    skipHidden: true,
                    blankrows: false 
                  });
                  if (sheetCsv.trim()) {
                    const isMultiSheet = workbook.SheetNames.length > 1 || !['Sheet1', 'sheet1', file.name].includes(sheetName);
                    if (isMultiSheet) {
                      excelText += `\n--- SHEET ${index + 1}: ${sheetName} ---\n`;
                    }
                    excelText += sheetCsv;
                    if (isMultiSheet) {
                      excelText += `\n--- END OF SHEET ${index + 1} ---\n`;
                    }
                  }
                }
              });
              extractedText = excelText;
            } catch (err) {
              console.error('Spreadsheet extraction failed:', err);
            }
          }
          
          if (extractedText.length > 50000) {
            extractedText = extractedText.slice(0, 50000) + '... [TRUNCATED]';
          }
        } catch (e) {
          console.error('Frontend extraction error:', e);
        }
      }

      let type: 'image' | 'document' | 'audio' | 'video' = 'document';
      if (isImage) type = 'image';
      else if (isAudio) type = 'audio';
      else if (isVideo) type = 'video';

      return {
        file,
        preview: isImage ? URL.createObjectURL(file) : '',
        type,
        isUploading: true,
        extractedText: extractedText || undefined
      };
    }));

    const updated = [...attachments, ...newAttachments];
    onAttachmentsChange(updated);
    setVisionRequired(updated.some(a => a.type === 'image' || a.type === 'video'));

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

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(updated);
    setVisionRequired(updated.some(a => a.type === 'image' || a.type === 'video'));
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
        disabled={disabled}
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        style={{ display: 'none' }} 
        accept="image/*"
        onChange={handleFileChange}
        multiple
        disabled={disabled}
      />

      <div className={styles.inputContainer}>
        {!hasMessages && <div className={styles.neonBorder} />}
        
        {attachments.length > 0 && (
          <div className={styles.attachmentsList}>
            {attachments.map((atl, idx) => (
              <div key={idx} className={styles.attachmentCard}>
                <div className={`${styles.cardIcon} ${atl.isUploading ? styles.uploading : ''}`}>
                  {atl.isUploading ? (
                    <div className={styles.progressRing}>
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="40" />
                      </svg>
                    </div>
                  ) : atl.type === 'image' ? (
                    <img 
                      src={atl.preview} 
                      alt="thumb" 
                      className={styles.imageThumb} 
                      onClick={() => setPreviewImage(atl.preview)}
                    />
                  ) : atl.type === 'audio' ? (
                    <Music size={18} />
                  ) : atl.type === 'video' ? (
                    <Video size={18} />
                  ) : ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'tab', 'prn'].includes(atl.file.name.split('.').pop()?.toLowerCase() || '') ? (
                    <Table size={18} />
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
            ))}
          </div>
        )}

        <div className={styles.inputInner}>
          <button className={styles.iconBtn} onClick={() => !disabled && fileInputRef.current?.click()} disabled={disabled} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
            <Plus size={22} />
          </button>
          
          <input
            className={styles.input}
            value={internalValue}
            onChange={(e) => setInternalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText || "Ask anything"}
            disabled={disabled}
          />
          
          <div className={styles.inputActions}>
            <button 
              className={styles.iconBtn}
              title="Launch Voice Mode"
              onClick={disabled ? undefined : onVoiceLaunch}
              disabled={disabled}
              style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <Mic size={20} />
            </button>
            <button 
              className={`${styles.sendBtn} ${isGenerating ? styles.stopBtn : ''}`}
              onClick={handleAction}
              disabled={disabled || attachments.some(a => a.isUploading) || (!isGenerating && !internalValue.trim() && attachments.length === 0)}
              style={disabled || attachments.some(a => a.isUploading) ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
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


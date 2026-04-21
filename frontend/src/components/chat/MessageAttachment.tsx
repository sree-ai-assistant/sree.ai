import React from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import styles from './MessageAttachment.module.css';

interface MessageAttachmentProps {
  attachments: {
    name: string;
    type: 'image' | 'document';
    url?: string;
  }[];
}

const getFileColor = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return '#ff4757';
    case 'doc':
    case 'docx': return '#2e86de';
    case 'xls':
    case 'xlsx': return '#27ae60';
    case 'ppt':
    case 'pptx': return '#e67e22';
    case 'txt': return '#95a5a6';
    default: return '#3b82f6';
  }
};

export const MessageAttachment: React.FC<MessageAttachmentProps> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className={styles.attachmentWrapper}>
      {attachments.map((atl, idx) => {
        const fileColor = atl.type === 'document' ? getFileColor(atl.name) : 'transparent';
        
        return atl.type === 'document' ? (
          <div key={idx} className={styles.attachmentCard}>
            <div className={styles.cardIcon} style={{ backgroundColor: `${fileColor}20`, color: fileColor }}>
              <FileText size={18} />
            </div>
            <div className={styles.cardInfo}>
              <span className={styles.cardFileName}>{atl.name}</span>
              <span className={styles.cardFileType} style={{ color: fileColor }}>
                {atl.name.split('.').pop()?.toUpperCase() || 'FILE'}
              </span>
            </div>
          </div>
        ) : (
          <div key={idx} className={styles.imageCard}>
            <img src={atl.url} alt={atl.name} className={styles.imageContent} />
          </div>
        );
      })}
    </div>
  );
};

import React from 'react';
import { FileText, Image as ImageIcon, Music, Video } from 'lucide-react';
import styles from './MessageAttachment.module.css';

interface MessageAttachmentProps {
  attachments: {
    name: string;
    type: 'image' | 'document' | 'audio' | 'video';
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
        const fileColor = atl.type === 'document' ? getFileColor(atl.name) : 
                          atl.type === 'audio' ? '#a855f7' :
                          atl.type === 'video' ? '#ec4899' : 'transparent';
        const extension = atl.name.split('.').pop()?.toUpperCase() || 'FILE';
        
        if (atl.type === 'image') {
          return (
            <div key={idx} className={styles.imageCard}>
              <img src={atl.url} alt={atl.name} className={styles.imageContent} />
              <div className={styles.imageOverlay}>
                <ImageIcon size={14} />
                <span>IMAGE</span>
              </div>
            </div>
          );
        }

        if (atl.type === 'audio' && atl.url) {
          return (
            <div key={idx} className={styles.mediaCard}>
              <div className={styles.mediaHeader}>
                <div className={styles.cardIcon} style={{ backgroundColor: '#a855f715', color: '#a855f7' }}>
                  <Music size={18} />
                </div>
                <span className={styles.mediaTitle}>{atl.name}</span>
              </div>
              <audio controls src={atl.url} className={styles.audioPlayer} />
            </div>
          );
        }

        if (atl.type === 'video' && atl.url) {
          return (
            <div key={idx} className={styles.mediaCard}>
              <div className={styles.mediaHeader}>
                <div className={styles.cardIcon} style={{ backgroundColor: '#ec489915', color: '#ec4899' }}>
                  <Video size={18} />
                </div>
                <span className={styles.mediaTitle}>{atl.name}</span>
              </div>
              <video controls src={atl.url} className={styles.videoPlayer} />
            </div>
          );
        }

        const Icon = FileText;

        return (
          <div key={idx} className={styles.attachmentCard}>
            <div className={styles.cardIcon} style={{ backgroundColor: `${fileColor}15`, color: fileColor }}>
              <Icon size={20} strokeWidth={2.5} />
            </div>
            <div className={styles.cardInfo}>
              <span className={styles.cardFileName} title={atl.name}>{atl.name}</span>
              <span className={styles.cardFileType} style={{ color: fileColor }}>
                {extension}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

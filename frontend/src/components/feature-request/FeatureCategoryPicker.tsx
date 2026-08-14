import React from 'react';
import {
  Sparkles,
  ImageIcon,
  Mic,
  Zap,
  Layers,
  Palette,
  Bug,
  Lightbulb,
  Check
} from 'lucide-react';
import styles from './FeatureCategoryPicker.module.css';

export interface CategoryOption {
  id: string;
  label: string;
  shortDesc: string;
  icon: React.ReactNode;
  badge?: string;
  accentColor: string;
}

export const FEATURE_CATEGORIES: CategoryOption[] = [
  {
    id: 'ai_models',
    label: 'AI Models & LLMs',
    shortDesc: 'New reasoning models, DeepSeek R1, Claude, GPT updates',
    icon: <Sparkles size={18} />,
    badge: 'Popular',
    accentColor: '#3B82F6', // Blue
  },
  {
    id: 'image_video',
    label: 'Image & Video Gen',
    shortDesc: 'Ultra-HD rendering, video control, aspect ratios, upscaling',
    icon: <ImageIcon size={18} />,
    accentColor: '#8B5CF6', // Purple
  },
  {
    id: 'voice_audio',
    label: 'Voice & Realtime',
    shortDesc: 'Ultra-low latency STT, custom voice cloning, audio export',
    icon: <Mic size={18} />,
    accentColor: '#F59E0B', // Amber
  },
  {
    id: 'speed_perf',
    label: 'Speed & Latency',
    shortDesc: 'Faster inference, streaming improvements, local caching',
    icon: <Zap size={18} />,
    accentColor: '#10B981', // Emerald
  },
  {
    id: 'integrations',
    label: 'Integrations & API',
    shortDesc: 'Browser extension, IDE extensions, API keys & Webhooks',
    icon: <Layers size={18} />,
    accentColor: '#06B6D4', // Cyan
  },
  {
    id: 'ui_ux',
    label: 'UI & Workspace',
    shortDesc: 'Theme customization, split-view panels, canvas layouts',
    icon: <Palette size={18} />,
    accentColor: '#EC4899', // Pink
  },
  {
    id: 'bug_report',
    label: 'Bug / Glitch',
    shortDesc: 'Unexpected error, layout anomaly, or broken feature',
    icon: <Bug size={18} />,
    badge: 'Fast-Track',
    accentColor: '#EF4444', // Red
  },
  {
    id: 'general_idea',
    label: 'Other Vision',
    shortDesc: 'Novel ideas, workflow automation, or custom request',
    icon: <Lightbulb size={18} />,
    accentColor: '#EAB308', // Yellow
  },
];

interface FeatureCategoryPickerProps {
  selectedId: string;
  onSelect: (category: CategoryOption) => void;
}

export const FeatureCategoryPicker: React.FC<FeatureCategoryPickerProps> = ({
  selectedId,
  onSelect,
}) => {
  return (
    <div className={styles.container}>
      <label className={styles.sectionLabel}>
        Choose Category <span className={styles.required}>*</span>
      </label>
      <div className={styles.grid}>
        {FEATURE_CATEGORIES.map((cat) => {
          const isSelected = selectedId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={`${styles.categoryCard} ${isSelected ? styles.selected : ''}`}
              onClick={() => onSelect(cat)}
              style={{
                '--cat-accent': cat.accentColor,
              } as React.CSSProperties}
            >
              <div className={styles.cardHeader}>
                <div
                  className={styles.iconBox}
                  style={{
                    color: cat.accentColor,
                    backgroundColor: `${cat.accentColor}18`,
                  }}
                >
                  {cat.icon}
                </div>
                {cat.badge && (
                  <span
                    className={styles.badge}
                    style={{
                      borderColor: `${cat.accentColor}40`,
                      color: cat.accentColor,
                    }}
                  >
                    {cat.badge}
                  </span>
                )}
                {isSelected && (
                  <div className={styles.checkIndicator}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className={styles.cardBody}>
                <h4 className={styles.cardTitle}>{cat.label}</h4>
                <p className={styles.cardDesc}>{cat.shortDesc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';

interface WaveformVoiceIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 5-bar vertical rounded audio waveform icon matching modern voice mode UI
 */
export const WaveformVoiceIcon: React.FC<WaveformVoiceIconProps> = ({
  size = 20,
  className,
  style,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={{ display: 'block', ...style }}
    >
      <rect x="2.5" y="8" width="2.5" height="8" rx="1.25" />
      <rect x="7" y="4.5" width="2.5" height="15" rx="1.25" />
      <rect x="11.5" y="2" width="2.5" height="20" rx="1.25" />
      <rect x="16" y="4.5" width="2.5" height="15" rx="1.25" />
      <rect x="20.5" y="8" width="2.5" height="8" rx="1.25" />
    </svg>
  );
};

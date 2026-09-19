import React from 'react';

interface VoiceIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Speech / Voice profile icon with sound waves
 * Matching the exact Google AI Studio voice glyph
 */
export const VoiceIcon: React.FC<VoiceIconProps> = ({
  size = 18,
  className,
  style,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {/* Face profile: forehead, nose, lips, mouth, chin, neck */}
      <path d="M8.5 4.5 L12 10 L10 11 L10.8 12.2 L9 13.6 L10 16 L8 19.5" />
      {/* Inner sound wave arc */}
      <path d="M14.5 10.5 A 3.2 3.2 0 0 1 14.5 15.5" />
      {/* Outer sound wave arc */}
      <path d="M18 8 A 6.8 6.8 0 0 1 18 18" />
    </svg>
  );
};

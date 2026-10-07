import React from 'react';

// Google official 4-color vector logo
export const GoogleLogo: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 24,
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'block', flexShrink: 0, ...style }}
    role="img"
    aria-label="Google"
  >
    <path
      d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z"
      fill="#4285F4"
    />
    <path
      d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z"
      fill="#FBBC05"
    />
    <path
      d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z"
      fill="#EA4335"
    />
  </svg>
);

// Nvidia official vector logo
export const NvidiaLogo: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 24,
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'block', flexShrink: 0, ...style }}
    role="img"
    aria-label="Nvidia"
  >
    <path
      d="M10.212 8.976V7.62c.127-.01.256-.017.388-.021 3.596-.117 5.957 3.184 5.957 3.184s-2.548 3.647-5.282 3.647a3.227 3.227 0 01-1.063-.175v-4.109c1.4.174 1.681.812 2.523 2.258l1.873-1.627a4.905 4.905 0 00-3.67-1.846 6.594 6.594 0 00-.729.044m0-4.476v2.025c.13-.01.259-.019.388-.024 5.002-.174 8.261 4.226 8.261 4.226s-3.743 4.69-7.643 4.69c-.338 0-.675-.031-1.007-.092v1.25c.278.038.558.057.838.057 3.629 0 6.253-1.91 8.794-4.169.421.347 2.146 1.193 2.501 1.564-2.416 2.083-8.048 3.763-11.24 3.763-.308 0-.603-.02-.894-.048V19.5H24v-15H10.21zm0 9.756v1.068c-3.356-.616-4.287-4.21-4.287-4.21a7.173 7.173 0 014.287-2.138v1.172h-.005a3.182 3.182 0 00-2.502 1.178s.615 2.276 2.507 2.931m-5.961-3.3c1.436-1.935 3.604-3.148 5.961-3.336V6.523C5.81 6.887 2 10.723 2 10.723s2.158 6.427 8.21 7.015v-1.166C5.77 16 4.25 10.958 4.25 10.958h-.002z"
      fill="#76B900"
      fillRule="nonzero"
    />
  </svg>
);

// Deepgram official vector logo (sourced from thesvg.org / Deepgram brand specs)
export const DeepgramLogo: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 24,
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'block', flexShrink: 0, ...style }}
    role="img"
    aria-label="Deepgram"
  >
    <path
      d="M11.203 24H1.517a.364.364 0 0 1-.258-.62l6.239-6.275a.366.366 0 0 1 .259-.108h3.52c2.723 0 5.025-2.127 5.107-4.845a5.004 5.004 0 0 0-4.999-5.148H7.613v4.646c0 .2-.164.364-.365.364H.968a.365.365 0 0 1-.363-.364V.364C.605.164.768 0 .969 0h10.416c6.684 0 12.111 5.485 12.01 12.187C23.293 18.77 17.794 24 11.202 24z"
      fill="#13EF93"
    />
  </svg>
);

// Groq official vector logo badge (sourced from thesvg.org / Groq brand specs)
export const GroqLogo: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 24,
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 201 201"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'block', flexShrink: 0, ...style }}
    role="img"
    aria-label="Groq"
  >
    <rect width="201" height="201" rx="44" fill="#F54F35" />
    <path
      fill="#FFFFFF"
      d="m128 49 1.895 1.52C136.336 56.288 140.602 64.49 142 73c.097 1.823.148 3.648.161 5.474l.03 3.247.012 3.482.017 3.613c.01 2.522.016 5.044.02 7.565.01 3.84.041 7.68.072 11.521.007 2.455.012 4.91.016 7.364l.038 3.457c-.033 11.717-3.373 21.83-11.475 30.547-4.552 4.23-9.148 7.372-14.891 9.73l-2.387 1.055c-9.275 3.355-20.3 2.397-29.379-1.13-5.016-2.38-9.156-5.17-13.234-8.925 3.678-4.526 7.41-8.394 12-12l3.063 2.375c5.572 3.958 11.135 5.211 17.937 4.625 6.96-1.384 12.455-4.502 17-10 4.174-6.784 4.59-12.222 4.531-20.094l.012-3.473c.003-2.414-.005-4.827-.022-7.241-.02-3.68 0-7.36.026-11.04-.003-2.353-.008-4.705-.016-7.058l.025-3.312c-.098-7.996-1.732-13.21-6.681-19.47-6.786-5.458-13.105-8.211-21.914-7.792-7.327 1.188-13.278 4.7-17.777 10.601C75.472 72.012 73.86 78.07 75 85c2.191 7.547 5.019 13.948 12 18 5.848 3.061 10.892 3.523 17.438 3.688l2.794.103c2.256.082 4.512.147 6.768.209v16c-16.682.673-29.615.654-42.852-10.848-8.28-8.296-13.338-19.55-13.71-31.277.394-9.87 3.93-17.894 9.562-25.875l1.688-2.563C84.698 35.563 110.05 34.436 128 49Z"
    />
  </svg>
);

// Map provider string to component
export const PROVIDER_LOGOS: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  google: GoogleLogo,
  nvidia: NvidiaLogo,
  deepgram: DeepgramLogo,
  groq: GroqLogo,
};

export const PROVIDER_COLORS: Record<string, string> = {
  google: '#4285F4',
  nvidia: '#76B900',
  deepgram: '#13EF93',
  groq: '#F55036',
};

export const getProviderLogo = (provider: string, size?: number) => {
  const Logo = PROVIDER_LOGOS[provider.toLowerCase()];
  if (Logo) return <Logo size={size} />;
  return null;
};

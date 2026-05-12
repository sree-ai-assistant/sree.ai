import React from 'react';
import { Google, Nvidia, Groq } from '@lobehub/icons';

// DeepGram logo 
export const DeepgramLogo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <img
    src="https://scyrcfgfrxeqfeqvpjnj.supabase.co/storage/v1/object/public/assets/deepgram-favicon.ico"
    alt="Deepgram"
    width={size}
    height={size}
    style={{ objectFit: 'contain', display: 'block' }}
  />
);

// Map provider string to component
export const PROVIDER_LOGOS: Record<string, React.FC<{ size?: number }>> = {
  google: Google.Color as unknown as React.FC<{ size?: number }>,
  nvidia: Nvidia.Color as unknown as React.FC<{ size?: number }>,
  deepgram: DeepgramLogo,
  groq: Groq as unknown as React.FC<{ size?: number }>,
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

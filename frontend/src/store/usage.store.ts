import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { create } from 'zustand';
import { usageService } from '../lib/api';

export interface ToolUsage {
  used: number;
  limit: number | null;
}

export interface UsageStatus {
  tier: string;
  planName: string;
  features: any;
  usage: Record<string, {
    minute: ToolUsage;
    daily: ToolUsage;
    monthly: ToolUsage;
    total: ToolUsage;
    isByok: boolean;
  }>;
  remaining_today?: number;
  daily_limit?: number;
  daily_count?: number;
  resets_in_seconds?: number;
  profileUsage?: {
    chat: { daily: ToolUsage; monthly: ToolUsage };
    voice: { daily: ToolUsage; monthly: ToolUsage };
    image: { daily: ToolUsage; monthly: ToolUsage };
  };
}

const RateLimitToast = ({ resetsAt, toastId, visible }: { resetsAt: number; toastId: string; visible: boolean }) => {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.ceil((resetsAt - Date.now()) / 1000)));

  useEffect(() => {
    const styleId = 'sree-rate-limit-toast-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes sreeSlideIn {
          from {
            transform: translateX(120%) scale(0.9);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes sreeSlideOut {
          from {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          to {
            transform: translateX(120%) scale(0.85);
            opacity: 0;
          }
        }
        .sree-toast-enter {
          animation: sreeSlideIn 0.35s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
        }
        .sree-toast-exit {
          animation: sreeSlideOut 0.4s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resetsAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        toast.dismiss(toastId);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [resetsAt, toastId]);

  return React.createElement(
    'div',
    {
      className: visible ? 'sree-toast-enter' : 'sree-toast-exit',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'rgba(15, 15, 20, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        padding: '12px 18px',
        borderRadius: '16px',
        color: '#fff',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.1)',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '360px',
      }
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
          borderRadius: '12px',
          width: '36px',
          height: '36px',
          flexShrink: 0,
        }
      },
      React.createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: '20',
          height: '20',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        },
        React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
        React.createElement('line', { x1: '12', y1: '8', x2: '12', y2: '12' }),
        React.createElement('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' })
      )
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
      React.createElement(
        'span',
        { style: { fontWeight: 600, fontSize: '0.9rem', color: '#f3f4f6' } },
        'Rate Limit Exceeded'
      ),
      React.createElement(
        'span',
        { style: { fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.4' } },
        'Please wait ',
        React.createElement(
          'strong',
          { style: { color: '#ef4444', fontVariantNumeric: 'tabular-nums' } },
          `${timeLeft}s`
        ),
        ' before checking usage limits again.'
      )
    ),
    React.createElement(
      'button',
      {
        onClick: () => toast.dismiss(toastId),
        style: {
          background: 'none',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          padding: '4px',
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      },
      React.createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: '16',
          height: '16',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        },
        React.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
        React.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
      )
    )
  );
};

interface UsageState {
  status: UsageStatus | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<void>;
  incrementLocalUsage: (tool?: 'chat' | 'voice' | 'image') => void;
  clearStore: () => void;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  status: null,
  loading: false,
  error: null,

  fetchStatus: async () => {
    const now = Date.now();
    let timestamps: number[] = [];
    try {
      const stored = localStorage.getItem('usage_fetch_timestamps');
      if (stored) {
        timestamps = JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }

    // Keep only timestamps within the last 60 seconds
    timestamps = timestamps.filter(t => now - t < 60000);

    if (timestamps.length >= 5) {
      const oldest = timestamps[0];
      const resetsAt = oldest + 60000;

      // Dismiss existing toast to refresh the countdown view
      toast.dismiss('usage-rate-limit-toast');

      toast.custom(
        (t) => React.createElement(RateLimitToast, { resetsAt, toastId: t.id, visible: t.visible }),
        { id: 'usage-rate-limit-toast', duration: 10000 }
      );
      return;
    }

    timestamps.push(now);
    try {
      localStorage.setItem('usage_fetch_timestamps', JSON.stringify(timestamps));
    } catch (e) {
      console.error(e);
    }

    set({ loading: true, error: null });
    try {
      const response = await usageService.getStatus();
      if (response.success) {
        set({ status: response.status, loading: false });
      } else {
        set({ error: response.message || 'Failed to fetch usage', loading: false });
      }
    } catch (err: any) {
      set({ error: err.message || 'An error occurred', loading: false });
    }
  },

  incrementLocalUsage: (tool: 'chat' | 'voice' | 'image' = 'chat') => {
    const { status } = get();
    if (status) {
      const updatedStatus = { ...status };

      if (status.usage && status.usage[tool]) {
        const toolUsage = status.usage[tool];
        updatedStatus.usage = {
          ...status.usage,
          [tool]: {
            ...toolUsage,
            minute: { ...toolUsage.minute, used: toolUsage.minute.used + 1 },
            daily: { ...toolUsage.daily, used: toolUsage.daily.used + 1 },
            monthly: { ...toolUsage.monthly, used: toolUsage.monthly.used + 1 },
            total: { ...toolUsage.total, used: (toolUsage.total?.used || 0) + 1 },
          }
        };
      }

      if (status.profileUsage && status.profileUsage[tool]) {
        const toolProfileUsage = status.profileUsage[tool];
        updatedStatus.profileUsage = {
          ...status.profileUsage,
          [tool]: {
            ...toolProfileUsage,
            daily: { ...toolProfileUsage.daily, used: toolProfileUsage.daily.used + 1 },
            monthly: { ...toolProfileUsage.monthly, used: toolProfileUsage.monthly.used + 1 }
          }
        };
      }

      set({ status: updatedStatus });
    }
  },

  clearStore: () => {
    set({ status: null, loading: false, error: null });
  }

}));

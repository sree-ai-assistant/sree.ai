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


interface UsageState {
  status: UsageStatus | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<void>;
  incrementLocalUsage: () => void;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  status: null,
  loading: false,
  error: null,

  fetchStatus: async () => {
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

  incrementLocalUsage: () => {
    const { status } = get();
    if (status && status.usage && status.usage.chat) {
      const chatUsage = status.usage.chat;
      set({
        status: {
          ...status,
          usage: {
            ...status.usage,
            chat: {
              ...chatUsage,
              minute: { ...chatUsage.minute, used: chatUsage.minute.used + 1 },
              daily: { ...chatUsage.daily, used: chatUsage.daily.used + 1 },
              monthly: { ...chatUsage.monthly, used: chatUsage.monthly.used + 1 },
              total: { ...chatUsage.total, used: chatUsage.total.used + 1 },
            }
          }
        }
      });
    }
  }

}));

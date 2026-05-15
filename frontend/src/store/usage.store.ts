import { create } from 'zustand';
import { usageService } from '../lib/api';

interface UsageStatus {
  tier: string;
  daily_limit: number;
  daily_count: number;
  monthly_limit: number | null;
  monthly_count: number | null;
  remaining_today: number;
  resets_in_seconds: number;
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
        set({ status: response.data, loading: false });
      } else {
        set({ error: response.message || 'Failed to fetch usage', loading: false });
      }
    } catch (err: any) {
      set({ error: err.message || 'An error occurred', loading: false });
    }
  },

  incrementLocalUsage: () => {
    const { status } = get();
    if (status) {
      set({
        status: {
          ...status,
          daily_count: status.daily_count + 1,
          remaining_today: Math.max(0, status.remaining_today - 1),
        }
      });
    }
  }
}));

import { create } from 'zustand';

export interface DownloadLimitInfo {
  tier?: string;
  reason?: 'minute' | 'daily' | 'monthly' | string;
  limit?: number;
  current?: number;
  resetsIn?: number;
  message?: string;
}

interface UIState {
  upgradeModalOpen: boolean;
  limitModalOpen: boolean;
  downloadLimitModalOpen: boolean;
  downloadLimitInfo: DownloadLimitInfo | null;
  targetTier: 'starter' | 'pro' | null;
  limitReached: boolean;
  remainingRequests: number | null;
  sidebarCollapsed: boolean;
  legalMenuOpen: boolean;
  
  // Actions
  openUpgradeModal: (tier?: 'starter' | 'pro') => void;
  closeUpgradeModal: () => void;
  openLimitModal: () => void;
  closeLimitModal: () => void;
  openDownloadLimitModal: (info?: DownloadLimitInfo) => void;
  closeDownloadLimitModal: () => void;
  setLimitReached: (reached: boolean) => void;
  setRemainingRequests: (count: number | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  toggleLegalMenu: () => void;
  setLegalMenuOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  upgradeModalOpen: false,
  limitModalOpen: false,
  downloadLimitModalOpen: false,
  downloadLimitInfo: null,
  targetTier: null,
  limitReached: false,
  remainingRequests: null,
  sidebarCollapsed: localStorage.getItem('sidebar-collapsed') === null ? true : localStorage.getItem('sidebar-collapsed') === 'true',
  legalMenuOpen: false,

  openUpgradeModal: (tier) => set({ upgradeModalOpen: true, targetTier: tier || null }),
  closeUpgradeModal: () => set({ upgradeModalOpen: false, targetTier: null }),
  openLimitModal: () => set({ limitModalOpen: true }),
  closeLimitModal: () => set({ limitModalOpen: false }),
  openDownloadLimitModal: (info) => set({ downloadLimitModalOpen: true, downloadLimitInfo: info || null }),
  closeDownloadLimitModal: () => set({ downloadLimitModalOpen: false, downloadLimitInfo: null }),
  setLimitReached: (reached) => set({ limitReached: reached }),
  setRemainingRequests: (count) => set({ remainingRequests: count }),
  setSidebarCollapsed: (collapsed) => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },
  toggleSidebar: () => set((state) => {
    const newState = !state.sidebarCollapsed;
    localStorage.setItem('sidebar-collapsed', String(newState));
    return { sidebarCollapsed: newState };
  }),
  toggleLegalMenu: () => set((state) => ({ legalMenuOpen: !state.legalMenuOpen })),
  setLegalMenuOpen: (open) => set({ legalMenuOpen: open }),
}));

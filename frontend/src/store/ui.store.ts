import { create } from 'zustand';

interface UIState {
  upgradeModalOpen: boolean;
  limitModalOpen: boolean;
  targetTier: 'starter' | 'pro' | null;
  limitReached: boolean;
  remainingRequests: number | null;
  sidebarCollapsed: boolean;
  
  // Actions
  openUpgradeModal: (tier?: 'starter' | 'pro') => void;
  closeUpgradeModal: () => void;
  openLimitModal: () => void;
  closeLimitModal: () => void;
  setLimitReached: (reached: boolean) => void;
  setRemainingRequests: (count: number | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  upgradeModalOpen: false,
  limitModalOpen: false,
  targetTier: null,
  limitReached: false,
  remainingRequests: null,
  sidebarCollapsed: localStorage.getItem('sidebar-collapsed') === null ? true : localStorage.getItem('sidebar-collapsed') === 'true',

  openUpgradeModal: (tier) => set({ upgradeModalOpen: true, targetTier: tier || null }),
  closeUpgradeModal: () => set({ upgradeModalOpen: false, targetTier: null }),
  openLimitModal: () => set({ limitModalOpen: true }),
  closeLimitModal: () => set({ limitModalOpen: false }),
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
}));

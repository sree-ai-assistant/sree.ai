import { create } from 'zustand';

interface UIState {
  upgradeModalOpen: boolean;
  targetTier: 'basic' | 'pro' | null;
  
  // Actions
  openUpgradeModal: (tier?: 'basic' | 'pro') => void;
  closeUpgradeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  upgradeModalOpen: false,
  targetTier: null,

  openUpgradeModal: (tier) => set({ upgradeModalOpen: true, targetTier: tier || null }),
  closeUpgradeModal: () => set({ upgradeModalOpen: false, targetTier: null }),
}));

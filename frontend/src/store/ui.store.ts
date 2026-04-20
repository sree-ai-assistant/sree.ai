import { create } from 'zustand';

interface UIState {
  upgradeModalOpen: boolean;
  targetTier: 'premium' | 'pro' | null;
  
  // Actions
  openUpgradeModal: (tier?: 'premium' | 'pro') => void;
  closeUpgradeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  upgradeModalOpen: false,
  targetTier: null,

  openUpgradeModal: (tier) => set({ upgradeModalOpen: true, targetTier: tier || null }),
  closeUpgradeModal: () => set({ upgradeModalOpen: false, targetTier: null }),
}));

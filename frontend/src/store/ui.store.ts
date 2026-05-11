import { create } from 'zustand';

interface UIState {
  upgradeModalOpen: boolean;
  targetTier: 'starter' | 'pro' | null;
  
  // Actions
  openUpgradeModal: (tier?: 'starter' | 'pro') => void;
  closeUpgradeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  upgradeModalOpen: false,
  targetTier: null,

  openUpgradeModal: (tier) => set({ upgradeModalOpen: true, targetTier: tier || null }),
  closeUpgradeModal: () => set({ upgradeModalOpen: false, targetTier: null }),
}));

import React, { useState, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock, Cpu, Eye, Crown, Search, Sparkles } from 'lucide-react';
import { useModelStore } from '../../store/model.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import styles from './ModelSelector.module.css';
import toast from 'react-hot-toast';

export const ModelSelector: React.FC = () => {
  const { models, selectedModel, fetchModels, setSelectedModel, loading, visionRequired } = useModelStore();
  const { user } = useAuthStore();
  const { openUpgradeModal } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const canAccess = (tier: string) => {
    const userTier = (user?.plan_type || 'free').toLowerCase();
    const modelTier = tier.toLowerCase();
    const ranks = { 'free': 0, 'starter': 1, 'pro': 2 };
    return ranks[userTier as keyof typeof ranks] >= ranks[modelTier as keyof typeof ranks];
  };

  if (loading && !selectedModel) {
    return (
      <div className={`${styles.selectorButton} skeleton`} style={{ width: '160px', height: '38px', border: 'none' }}>
      </div>
    );
  }

  const filteredModels = models.filter(model =>
    !model.is_image && (
      (model.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (model.description?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    )
  );

  const sortedModels = [...filteredModels].sort((a, b) => {
    if (a.in_maintenance && !b.in_maintenance) return 1;
    if (!a.in_maintenance && b.in_maintenance) return -1;
    
    // Accessible models always go above locked models
    const accA = canAccess(a.tier_required);
    const accB = canAccess(b.tier_required);
    if (accA && !accB) return -1;
    if (!accA && accB) return 1;

    if (visionRequired) {
      if (a.is_vision && !b.is_vision) return -1;
      if (!a.is_vision && b.is_vision) return 1;
    }
    if (a.is_new && !b.is_new) return -1;
    if (!a.is_new && b.is_new) return 1;
    const ranks = { 'free': 0, 'starter': 1, 'pro': 2 };
    const rankA = ranks[(a.tier_required?.toLowerCase() || 'free') as keyof typeof ranks] ?? 0;
    const rankB = ranks[(b.tier_required?.toLowerCase() || 'free') as keyof typeof ranks] ?? 0;
    return rankA - rankB;
  });

  return (
    <div className={styles.container}>
      <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            className={styles.selectorButton}
            aria-label="Select Model"
          >
            <div className={styles.icon}>
              {selectedModel?.is_vision ? <Eye size={18} /> : <Cpu size={18} />}
            </div>
            <span title='Fast Model'>{selectedModel?.name || 'Select Model'}{selectedModel?.is_fast && ' ⚡'}</span>
            <ChevronDown
              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
              size={16}
            />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={styles.dropdown}
            sideOffset={8}
            align="start"
          >
            <div className={styles.searchContainer}>
              <Search size={14} className={styles.searchIcon} />
              <input
                autoFocus
                type="text"
                className={styles.searchInput}
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className={styles.scrollArea}>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`skeleton-${i}`} className={styles.modelItem} style={{ border: 'none' }}>
                    <div className={styles.modelHeader}>
                      <div className="skeleton" style={{ width: '120px', height: '18px', borderRadius: '4px' }}></div>
                      <div className="skeleton" style={{ width: '50px', height: '18px', borderRadius: '4px' }}></div>
                    </div>
                    <div className="skeleton" style={{ width: '100%', height: '14px', marginTop: '8px', borderRadius: '4px' }}></div>
                  </div>
                ))
              ) : (
                sortedModels.length > 0 ? (
                  sortedModels.map((model) => {
                    const accessible = canAccess(model.tier_required);
                    const isSelected = selectedModel?.model_id === model.model_id;
                    const isFaded = (visionRequired && !model.is_vision) || model.in_maintenance;
                    const inMaintenance = model.in_maintenance;

                    return (
                      <DropdownMenu.Item
                        key={model.model_id}
                        className={`${styles.modelItem} ${isSelected ? styles.selected : ''} ${!accessible ? styles.locked : ''} ${isFaded ? styles.faded : ''} ${inMaintenance ? styles.maintenance : ''}`}
                        onSelect={(e) => {
                          e.preventDefault(); // Handle selection manually to manage maintenance/locks

                          if (inMaintenance) {
                            toast.error('This model is currently in maintenance.', {
                              icon: '⚠️',
                              style: {
                                background: '#1a1a1a',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                              }
                            });
                            return;
                          }

                          if (!accessible) {
                            toast.error('Upgrade your plan to Access Premium Models', {
                              icon: '🔒',
                              style: {
                                background: '#1a1a1a',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                              }
                            });
                            openUpgradeModal(model.tier_required as 'starter' | 'pro');
                            return;
                          }

                          if (visionRequired && !model.is_vision) {
                            toast.error('This model does not support file attachments. Please select a Vision model.', {
                              icon: '🎬',
                              style: {
                                background: '#1a1a1a',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                              }
                            });
                            return;
                          }

                          setSelectedModel(model.model_id);
                          setIsOpen(false);
                        }}
                      >
                        <div className={styles.modelHeader}>
                          <div className={styles.modelName}>
                            {model.is_vision && <span className={styles.visionBadge}>Vision</span>}
                            {inMaintenance && <span className={styles.maintenanceBadge} title="In Maintenance">⚠️</span>}
                            {model.name} <span title='Faster Model'> {model.is_fast && ' ⚡'}</span>
                            {model.is_new && <span className={styles.newBadge}>NEW</span>}
                          </div>
                          {inMaintenance ? (
                            <span className={styles.maintenanceText}>Maintenance</span>
                          ) : !accessible ? (
                            <span title='Upgrade to Unlock'><Lock size={14} className={styles.lockIcon} /></span>
                          ) : model.tier_required.toLowerCase() === 'starter' ? (
                            <div className={styles.premiumIcon} title="Premium">
                              <Crown size={16} fill="#FFD700" color="#B8860B" />
                            </div>
                          ) : (
                            <span className={`${styles.tierBadge} ${styles[`tier-${model.tier_required.toLowerCase()}`]}`}>
                              {model.tier_required}
                            </span>
                          )}
                        </div>
                        <div className={styles.modelDesc}>
                          {inMaintenance ? 'Currently undergoing maintenance. Please check back later.' : model.description}
                        </div>
                      </DropdownMenu.Item>
                    );
                  })
                ) : (
                  <div className={styles.noResults}>
                    No models found matching "{searchQuery}"
                  </div>
                )
              )}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
};



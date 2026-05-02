import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock, Cpu, Eye, Zap, Crown, Search } from 'lucide-react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canAccess = (tier: string) => {
    const userTier = (user?.plan_type || 'free').toLowerCase();
    const modelTier = tier.toLowerCase();
    const ranks = { 'free': 0, 'premium': 1, 'pro': 2 };
    return ranks[userTier as keyof typeof ranks] >= ranks[modelTier as keyof typeof ranks];
  };

  if (loading && !selectedModel) {
    return (
      <div className={`${styles.selectorButton} skeleton`} style={{ width: '160px', height: '38px', border: 'none' }}>
      </div>
    );
  }

  // Search and Sorting logic: 
  const filteredModels = models.filter(model => 
    (model.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (model.description?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const sortedModels = [...filteredModels].sort((a, b) => {
    // Maintenance models last
    if (a.in_maintenance && !b.in_maintenance) return 1;
    if (!a.in_maintenance && b.in_maintenance) return -1;

    if (visionRequired) {
      if (a.is_vision && !b.is_vision) return -1;
      if (!a.is_vision && b.is_vision) return 1;
    }
    
    if (a.is_new && !b.is_new) return -1;
    if (!a.is_new && b.is_new) return 1;
    
    const ranks = { 'free': 0, 'premium': 1, 'pro': 2 };
    const rankA = ranks[(a.tier_required?.toLowerCase() || 'free') as keyof typeof ranks] ?? 0;
    const rankB = ranks[(b.tier_required?.toLowerCase() || 'free') as keyof typeof ranks] ?? 0;
    return rankA - rankB;
  });

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={styles.selectorButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
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

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={styles.dropdown}
          >
            <div className={styles.searchContainer}>
              <Search size={14} className={styles.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {loading ? (
              // Skeleton loading for models list
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
                    <div
                      key={model.model_id}
                      className={`${styles.modelItem} ${isSelected ? styles.selected : ''} ${!accessible ? styles.locked : ''} ${isFaded ? styles.faded : ''} ${inMaintenance ? styles.maintenance : ''}`}
                      onClick={() => {
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
                          openUpgradeModal(model.tier_required as 'premium' | 'pro');
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
                          <Lock size={14} className={styles.lockIcon} />
                        ) : model.tier_required.toLowerCase() === 'premium' ? (
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
                    </div>
                  );
                })
              ) : (
                <div className={styles.noResults}>
                  No models found matching "{searchQuery}"
                </div>
              )
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


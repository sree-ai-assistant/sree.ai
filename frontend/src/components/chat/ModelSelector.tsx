import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock, Cpu, Eye, Zap, Crown } from 'lucide-react';
import { useModelStore } from '../../store/model.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import styles from './ModelSelector.module.css';

export const ModelSelector: React.FC = () => {
  const { models, selectedModel, fetchModels, setSelectedModel, loading } = useModelStore();
  const { user } = useAuthStore();
  const { openUpgradeModal } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      <div className={styles.selectorButton}>
        <Zap className={styles.icon} size={18} />
        <span>Loading Models...</span>
      </div>
    );
  }

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
        <span>{selectedModel?.name || 'Select Model'}</span>
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
            {[...models].sort((a, b) => {
              const ranks = { 'free': 0, 'premium': 1, 'pro': 2 };
              const rankA = ranks[a.tier_required.toLowerCase() as keyof typeof ranks] ?? 0;
              const rankB = ranks[b.tier_required.toLowerCase() as keyof typeof ranks] ?? 0;
              return rankA - rankB;
            }).map((model) => {
              const accessible = canAccess(model.tier_required);
              const isSelected = selectedModel?.model_id === model.model_id;

              return (
                <div 
                  key={model.model_id}
                  className={`${styles.modelItem} ${isSelected ? styles.selected : ''} ${!accessible ? styles.locked : ''}`}
                  onClick={() => {
                    if (accessible) {
                      setSelectedModel(model.model_id);
                      setIsOpen(false);
                    } else {
                      openUpgradeModal(model.tier_required as 'premium' | 'pro');
                    }
                  }}
                >
                  <div className={styles.modelHeader}>
                    <div className={styles.modelName}>
                      {model.is_vision && <span className={styles.visionBadge}>Vision</span>}
                      {model.name}
                    </div>
                    {!accessible ? (
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
                    {model.description}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Lock, Cpu, Eye, Crown, Search, Zap } from 'lucide-react';
import { useModelStore } from '../../store/model.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useNavigate } from 'react-router-dom';
import { getProviderLogo } from '../icons/ProviderLogos';
import styles from './ModelSelector.module.css';
import toast from 'react-hot-toast';

type ProviderTab = 'all' | 'nvidia' | 'google' | 'groq';

const PROVIDER_TABS: { id: ProviderTab; label: string; provider: string }[] = [
  { id: 'nvidia', label: 'Nvidia', provider: 'nvidia' },
  { id: 'google', label: 'Google', provider: 'google' },
  { id: 'groq', label: 'Groq', provider: 'groq' },
];

export const ModelSelector: React.FC = () => {
  const navigate = useNavigate();
  const { models, selectedModel, fetchModels, setSelectedModel, loading, visionRequired } = useModelStore();
  const { user } = useAuthStore();
  const { openUpgradeModal } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ProviderTab>('all');

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Auto-detect active provider tab from selected model only when dropdown opens
  const prevIsOpen = React.useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current && selectedModel) {
      const provider = selectedModel.provider?.toLowerCase();
      const match = PROVIDER_TABS.find(t => t.provider === provider);
      if (match) {
        setActiveTab(match.id);
      }
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, selectedModel]);

  const canAccess = (tier: string) => {
    const userTier = (user?.plan_type || 'free').toLowerCase();
    const modelTier = tier.toLowerCase();
    const ranks = { 'free': 0, 'starter': 1, 'pro': 2 };
    return ranks[userTier as keyof typeof ranks] >= ranks[modelTier as keyof typeof ranks];
  };

  // Compute which providers actually have chat models
  const availableProviders = useMemo(() => {
    const chatModels = models.filter(m => !m.is_image && !m.is_video);
    const providerSet = new Set(chatModels.map(m => m.provider?.toLowerCase()));
    return PROVIDER_TABS.filter(t => providerSet.has(t.provider));
  }, [models]);

  if (loading && !selectedModel) {
    return (
      <div className={`${styles.selectorButton} skeleton`} style={{ width: '160px', height: '38px', border: 'none' }}>
      </div>
    );
  }

  const filteredModels = models.filter(model => {
    if (model.is_image) return false;
    if (model.is_video) return false;

    // Provider filter
    if (activeTab !== 'all') {
      const modelProvider = model.provider?.toLowerCase();
      if (modelProvider !== activeTab) return false;
    }

    // Search filter
    if (searchQuery) {
      return (
        (model.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (model.description?.toLowerCase() || '').includes(searchQuery.toLowerCase())
      );
    }

    return true;
  });

  const sortedModels = [...filteredModels].sort((a, b) => {
    if (a.in_maintenance && !b.in_maintenance) return 1;
    if (!a.in_maintenance && b.in_maintenance) return -1;
    
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
      <DropdownMenu.Root open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchQuery('');
        }
      }}>
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
            align="center"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {/* Provider Tabs */}
            <div className={styles.providerTabs}>
              {availableProviders.map((tab) => (
                <button
                  key={tab.id}
                  className={`${styles.providerTab} ${activeTab === tab.id ? styles.providerTabActive : ''}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }}
                  type="button"
                >
                  <span className={styles.providerTabLogo}>
                    {getProviderLogo(tab.provider, 18)}
                  </span>
                  <span className={styles.providerTabLabel}>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className={styles.searchContainer}>
              <Search size={14} className={styles.searchIcon} />
              <input
                autoFocus
                type="text"
                className={styles.searchInput}
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') {
                    e.stopPropagation();
                  }
                }}
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
                          e.preventDefault();

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
                            toast.error(
                              (t) => (
                                <span>
                                  Upgrade your plan to Access Premium Models{' '}
                                  <button
                                    onClick={() => {
                                      toast.dismiss(t.id);
                                      navigate('/settings?tab=billing');
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#3b82f6',
                                      textDecoration: 'underline',
                                      padding: 0,
                                      font: 'inherit',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                      marginLeft: '4px'
                                    }}
                                  >
                                    Upgrade
                                  </button>
                                </span>
                              ),
                              {
                                icon: '🔒',
                                style: {
                                  background: '#1a1a1a',
                                  color: '#fff',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  borderRadius: '10px',
                                  padding: '12px 16px'
                                }
                              }
                            );
                            openUpgradeModal(model.tier_required as 'starter' | 'pro');
                            setIsOpen(false);
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
                            {model.name} {model.is_fast && <Zap size={14} className={styles.fastIcon} />}
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
                    No models found{searchQuery ? ` matching "${searchQuery}"` : ` for this provider`}
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



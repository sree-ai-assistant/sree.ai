import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon, Wand2, Trash2, Loader2, Sparkles,
  Download, Settings2, ChevronDown, Zap, X, RotateCcw, RefreshCcw, Copy, LayoutGrid, Plus,
  Maximize2, History, Layers, Sliders, Palette, Eye, Settings, HelpCircle, LogOut,
  Check, AlertCircle, Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useAuthStore } from '../store/auth.store';
import { useModelStore } from '../store/model.store';
import { useImageStore } from '../store/image.store';
import api from '../lib/api';
import { useUIStore } from '../store/ui.store';
import { useUsageStore } from '../store/usage.store';
import styles from './ImageGenPage.module.css';
import { ImageSidebar } from '../components/images/ImageSidebar';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import { ImageLightbox } from '../components/images/ImageLightbox';
import { LimitModal } from '../components/modals/LimitModal';

// Aspect ratio presets
const ASPECT_RATIOS = [
  { label: '1:1', w: 1024, h: 1024, iconSize: { w: 24, h: 24 } },
  { label: '16:9', w: 1344, h: 768, iconSize: { w: 32, h: 18 } },
  { label: '9:16', w: 768, h: 1360, iconSize: { w: 18, h: 32 } },
  { label: '4:3', w: 1152, h: 896, iconSize: { w: 28, h: 21 } },
  { label: '3:4', w: 896, h: 1152, iconSize: { w: 21, h: 28 } },
  { label: '3:2', w: 1216, h: 832, iconSize: { w: 30, h: 20 } },
];

const PROMPT_STYLERS = [
  { label: 'Cinematic', suffix: ', cinematic shot, highly detailed, 8k, masterwork', icon: '🎬' },
  { label: 'Anime', suffix: ', anime style, vibrant colors, expressive lighting', icon: '🎨' },
  { label: '3D Render', suffix: ', 3d render, octane render, unreal engine 5, volumetric lighting', icon: '🧊' },
  { label: 'Digital Art', suffix: ', digital art, sharp lines, clean composition, trending on artstation', icon: '✨' },
  { label: 'Cyberpunk', suffix: ', cyberpunk aesthetic, neon lights, futuristic city, dark moody atmosphere', icon: '🌃' },
  { label: 'Portrait', suffix: ', professional portrait photography, sharp focus, bokeh background', icon: '👤' },
  { label: 'Minimalist', suffix: ', minimalist style, clean background, sharp focus, elegant', icon: '⚪' },
  { label: 'Fantasy', suffix: ', epic fantasy, ethereal lighting, magical atmosphere', icon: '🧙' },
];

interface ImagePageUsage {
  // Image generation
  imageUsedDaily: number;
  imageLimitDaily: number;
  imageUsedMonthly: number;
  imageLimitMonthly: number | null;
  // Downloads
  downloadUsedDaily: number;
  downloadLimitDaily: number;
  downloadUsedMonthly: number;
  downloadLimitMonthly: number | null;
  // Tier info
  tier: string;
}

const UsageCountdown: React.FC<{ resetsAt: string }> = ({ resetsAt }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(resetsAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetsAt]);

  return <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{timeLeft}</span>;
};

const ImageGenPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { models, fetchModels } = useModelStore();
  const {
    settings,
    updateSettings,
    isGenerating,
    generateImage,
    activeImage,
    setActiveImage,
    history,
    deleteImage,
    resetGenerationState,
    focusedGenerationId
  } = useImageStore();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const { status: usageStatus, fetchStatus: fetchUsageStatus } = useUsageStore();

  const [usageMinimized, setUsageMinimized] = useState(() => window.innerWidth <= 768 ? false : true);
  const { openUpgradeModal } = useUIStore();
  const [limitModal, setLimitModal] = useState<{
    isOpen: boolean;
    type: 'anonymous' | 'rate-limited' | 'tiered' | 'abuse-cooldown' | 'abuse-captcha' | 'abuse-auth' | 'abuse-restricted' | 'anonymous-upload';
    limitInfo?: any;
  }>({ isOpen: false, type: 'anonymous' });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);

  const canAccess = useCallback((tier: string) => {
    const userTier = (user?.plan_type || 'free').toLowerCase();
    const modelTier = tier.toLowerCase();
    const ranks = { 'free': 0, 'starter': 1, 'pro': 2 };
    return ranks[userTier as keyof typeof ranks] >= ranks[modelTier as keyof typeof ranks];
  }, [user]);

  // Get image-capable models sorted by accessibility first, then standard ranks/parameters
  const imageModels = useMemo(() => {
    return models
      .filter(m => m.is_image && !m.in_maintenance)
      .sort((a, b) => {
        // Accessible models always go above locked models
        const accA = canAccess(a.tier_required);
        const accB = canAccess(b.tier_required);
        if (accA && !accB) return -1;
        if (!accA && accB) return 1;

        // Otherwise sort by rank/tier requirement
        const ranks = { 'free': 0, 'starter': 1, 'pro': 2 };
        const rankA = ranks[(a.tier_required?.toLowerCase() || 'free') as keyof typeof ranks] ?? 0;
        const rankB = ranks[(b.tier_required?.toLowerCase() || 'free') as keyof typeof ranks] ?? 0;
        if (rankA !== rankB) return rankA - rankB;

        // Prefer fast models
        if (a.is_fast && !b.is_fast) return -1;
        if (!a.is_fast && b.is_fast) return 1;

        return 0;
      });
  }, [models, canAccess]);

  const usage = useMemo<ImagePageUsage | null>(() => {
    if (!usageStatus) return null;
    const imageData = usageStatus.profileUsage?.image || null;
    const imageSummary = usageStatus.usage?.image || null;
    const downloadSummary = usageStatus.usage?.download || null;

    return {
      imageUsedDaily: imageData?.daily?.used ?? imageSummary?.daily?.used ?? 0,
      imageLimitDaily: imageData?.daily?.limit ?? imageSummary?.daily?.limit ?? 0,
      imageUsedMonthly: imageData?.monthly?.used ?? imageSummary?.monthly?.used ?? 0,
      imageLimitMonthly: imageData?.monthly?.limit ?? imageSummary?.monthly?.limit ?? null,
      downloadUsedDaily: downloadSummary?.daily?.used ?? 0,
      downloadLimitDaily: downloadSummary?.daily?.limit ?? 0,
      downloadUsedMonthly: downloadSummary?.monthly?.used ?? 0,
      downloadLimitMonthly: downloadSummary?.monthly?.limit ?? null,
      tier: usageStatus.tier ?? 'free',
    };
  }, [usageStatus]);

  const fetchUsage = useCallback(async (isManualRefresh: boolean = false) => {
    try {
      await fetchUsageStatus(isManualRefresh);
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    }
  }, [fetchUsageStatus]);

  useEffect(() => {
    fetchModels();
    fetchUsage(false);
  }, [fetchModels, fetchUsage]);

  // Auto-expand usage card if any limit is hit
  useEffect(() => {
    if (usage && (
      (usage.imageLimitDaily > 0 && usage.imageUsedDaily >= usage.imageLimitDaily) ||
      (usage.downloadLimitDaily > 0 && usage.downloadUsedDaily >= usage.downloadLimitDaily)
    )) {
      setUsageMinimized(false);
    }
  }, [usage]);

  // Auto-select first image model (preferring accessible models)
  useEffect(() => {
    if (imageModels.length > 0 && !settings.modelId) {
      const accessibleModels = imageModels.filter(m => canAccess(m.tier_required));
      const candidates = accessibleModels.length > 0 ? accessibleModels : imageModels;
      const fast = candidates.find(m => m.is_fast) || candidates[0];
      updateSettings({ modelId: fast.model_id });
    }
  }, [imageModels, settings.modelId, updateSettings, canAccess]);

  const selectedModel = imageModels.find(m => m.model_id === settings.modelId);
  const isFlux = settings.modelId.toLowerCase().includes('flux');
  const isFluxDev = isFlux && (settings.modelId.toLowerCase().includes('dev') || settings.modelId.toLowerCase().includes('kontext'));
  const isGoogleImage = settings.modelId.startsWith('gemini-') && settings.modelId.includes('-image');
  const ratio = ASPECT_RATIOS[settings.ratioIndex];

  const handleGenerate = async () => {
    if (!settings.prompt.trim() || isGenerating) return;
    setActiveTab('generate');

    try {
      await generateImage({
        prompt: settings.prompt,
        model: settings.modelId,
        negative_prompt: (isFlux || isGoogleImage) ? undefined : settings.negativePrompt || undefined,
        seed: settings.seed || 0,
        steps: isGoogleImage ? undefined : settings.steps,
        width: ratio.w,
        height: ratio.h,
        cfg_scale: isGoogleImage ? undefined : ((isFlux && !isFluxDev) ? undefined : settings.cfgScale),
        image_size: isGoogleImage ? settings.imageSize : undefined,
      });
    } catch (error: any) {
      if (error.response?.status === 429) {
        const errorData = error.response.data;
        const code = errorData?.code;

        if (code === 'ABUSE_COOLDOWN' || code === 'ABUSE_CAPTCHA' || code === 'ABUSE_AUTH' || code === 'ABUSE_RESTRICTED') {
          setLimitModal({
            isOpen: true,
            type: code.toLowerCase().replace('_', '-') as any,
            limitInfo: {
              resetsIn: errorData.info?.resets_in_seconds,
              limit: errorData.info?.daily_limit,
              current: errorData.info?.daily_count,
              message: errorData.message
            }
          });
        } else {
          // Handle standard quota and rate limits
          const resetsIn = errorData.resetsIn || 60;
          setLimitModal({
            isOpen: true,
            type: user ? 'tiered' : 'anonymous',
            limitInfo: {
              limit: errorData.limit,
              current: errorData.current,
              resetsIn: resetsIn,
              reason: errorData.reason || 'daily',
              tool: errorData.tool || 'image',
              message: errorData.message,
              tier: user ? user.plan_type || 'free' : 'Anonymous'
            }
          });
        }
      }
    }
  };

  const handleDownload = async (image: any) => {
    setDownloadStatus('loading');
    try {
      const response = await api.get(`/ai/download?url=${encodeURIComponent(image.url)}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `sree-ai-${image.id}.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus('idle'), 3000);

      // Refresh usage after successful download
      fetchUsage();
    } catch (error: any) {
      console.error('Download error:', error);
      setDownloadStatus('error');
      setTimeout(() => setDownloadStatus('idle'), 5000);

      if (error.response?.status === 429) {
        // The sidebar usage card will reflect the limit, but we can also alert
        alert(error.response.data?.message || 'Download limit reached');
      } else {
        alert('Failed to download image. Please try again.');
      }
      throw error;
    }
  };

  const applyStyler = (suffix: string) => {
    const currentPrompt = settings.prompt.trim();
    if (currentPrompt.endsWith(suffix)) return;
    updateSettings({ prompt: currentPrompt + suffix });
    promptRef.current?.focus();
  };

  const handleNewImage = () => {
    resetGenerationState();
    updateSettings({
      prompt: '',
      negativePrompt: '',
      seed: 0
    });
    setActiveTab('generate');
  };

  return (
    <DashboardLayout
      defaultCollapsed={true}
      sidebar={(props) => (
        <ImageSidebar
          {...props}
          onNewImage={handleNewImage}
          onDeleteClick={(id) => setDeleteConfirmId(id)}
          onSelectImage={() => setActiveTab('generate')}
        />
      )}
    >
      <div className={styles.container}>
        <AnimatePresence mode="popLayout">
          {activeTab === 'generate' && (
            <motion.aside
              className={`${styles.sidebar} ${isSettingsOpen ? styles.sidebarOpen : ''}`}
              initial={{ opacity: 0, width: 0, x: -20 }}
              animate={{ opacity: 1, width: 320, x: 0 }}
              exit={{ opacity: 0, width: 0, x: -20 }}
              transition={{
                type: 'spring',
                damping: 25,
                stiffness: 200,
                opacity: { duration: 0.2 }
              }}
            >
              <div className={styles.sidebarContent}>
                <div className={styles.sidebarHeader}>
                  <span className={styles.sidebarTitle}>Parameters</span>
                  <button className={styles.closeSidebarBtn} onClick={() => setIsSettingsOpen(false)}>
                    <X size={18} />
                  </button>
                </div>

                <div className={styles.section}>
                  <span className={styles.sectionLabel}>Model Selection</span>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className={styles.dropdownTrigger}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {selectedModel?.name || 'Select Model'}
                            {selectedModel && !canAccess(selectedModel.tier_required) && <Lock size={12} />}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {selectedModel?.provider?.toLowerCase() === 'google' ? 'Google' : 'NVIDIA'} · {selectedModel?.is_fast ? 'Ultra Fast' : 'High Quality'}
                          </span>
                        </div>
                        <ChevronDown size={18} style={{ opacity: 0.5 }} />
                      </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className={styles.dropdownMenu} sideOffset={8} align="start" asChild>
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                        >
                          {imageModels.map(m => {
                            const accessible = canAccess(m.tier_required);
                            const isSelected = settings.modelId === m.model_id;

                            return (
                              <DropdownMenu.Item
                                key={m.model_id}
                                className={`${styles.dropdownItem} ${isSelected ? styles.dropdownItemActive : ''} ${!accessible ? styles.lockedItem : ''}`}
                                onSelect={(e) => {
                                  if (!accessible) {
                                    e.preventDefault(); // Keep dropdown open
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
                                    openUpgradeModal(m.tier_required as 'starter' | 'pro');
                                    return;
                                  }
                                  updateSettings({ modelId: m.model_id });
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', opacity: !accessible ? 0.55 : 1 }}>
                                  <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {m.name}
                                    {!accessible && <Lock size={12} style={{ opacity: 0.8 }} />}
                                  </span>
                                  {m.is_fast && <Zap size={12} className="text-success" />}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: !accessible ? 0.55 : 1 }}>
                                  {m.provider?.toLowerCase() === 'google' ? 'Google' : 'NVIDIA'} · {m.is_fast ? 'Ultra Fast' : 'High Quality'} {!accessible && `(Requires ${m.tier_required})`}
                                </span>
                              </DropdownMenu.Item>
                            );
                          })}
                        </motion.div>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                <div className={styles.section}>
                  <span className={styles.sectionLabel}>Aspect Ratio</span>
                  <div className={styles.ratioGrid}>
                    {ASPECT_RATIOS.map((r, i) => (
                      <button
                        key={r.label}
                        className={`${styles.ratioButton} ${settings.ratioIndex === i ? styles.ratioButtonActive : ''}`}
                        onClick={() => updateSettings({ ratioIndex: i })}
                      >
                        <div
                          className={styles.ratioBox}
                          style={{
                            width: `${r.iconSize.w}px`,
                            height: `${r.iconSize.h}px`,
                            borderColor: settings.ratioIndex === i ? 'white' : 'currentColor'
                          }}
                        />
                        <span style={{ fontSize: '0.7rem' }}>{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.section}>
                  <span className={styles.sectionLabel}>Parameters</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {!isGoogleImage && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Steps</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{settings.steps}</span>
                        </div>
                        <input
                          type="range" min={10} max={50} value={settings.steps}
                          onChange={e => updateSettings({ steps: +e.target.value })}
                          className={styles.rangeInput}
                        />
                      </div>
                    )}

                    {!isGoogleImage && (!isFlux || isFluxDev) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>CFG Scale</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{settings.cfgScale}</span>
                        </div>
                        <input
                          type="range" min={1} max={isFluxDev ? 9 : 20} value={settings.cfgScale}
                          onChange={e => updateSettings({ cfgScale: +e.target.value })}
                          className={styles.rangeInput}
                        />
                      </div>
                    )}

                    {isGoogleImage && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image Size (Resolution)</span>
                        <select
                          value={settings.imageSize}
                          onChange={e => updateSettings({ imageSize: e.target.value })}
                          style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                            borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '0.85rem',
                            outline: 'none', cursor: 'pointer'
                          }}
                        >
                          <option value="1k" style={{ background: '#1c1c1e', color: 'white' }}>1K Resolution (Default)</option>
                          <option value="2k" style={{ background: '#1c1c1e', color: 'white' }}>2K Resolution</option>
                          <option value="4k" style={{ background: '#1c1c1e', color: 'white' }}>4K Resolution</option>
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seed</span>
                      <input
                        type="number" value={settings.seed}
                        onChange={e => updateSettings({ seed: +e.target.value })}
                        placeholder="Random"
                        style={{
                          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                          borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Footer */}
              <div className={styles.sidebarFooter}>
                {usage && (
                  <div className={`${styles.usageCard} ${styles.usageCardSmall} ${usageMinimized ? styles.usageCardMinimized : ''}`}>
                    <div className={styles.creditsHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={13} style={{ opacity: 0.7 }} />
                        <span className={styles.creditsLabel}>Usage Limits</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => fetchUsage(true)} className={styles.refreshUsageBtn} title="Refresh limits">
                          <RefreshCcw size={14} />
                        </button>
                        <button
                          onClick={() => setUsageMinimized(!usageMinimized)}
                          className={styles.minimizeBtn}
                          title={usageMinimized ? "Expand" : "Minimize"}
                        >
                          <ChevronDown size={14} style={{ transform: usageMinimized ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }} />
                        </button>
                      </div>
                    </div>

                    {!usageMinimized ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={styles.usageInfo}
                      >
                        {/* Image Generation Usage */}
                        {usage.imageLimitDaily > 0 && (
                          <>
                            <div className={styles.usageItem}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Wand2 size={11} style={{ opacity: 0.6 }} /> Generations Today
                              </span>
                              <span className={usage.imageUsedDaily >= usage.imageLimitDaily ? styles.usageLimitReached : ''}>
                                {usage.imageUsedDaily} / {usage.imageLimitDaily}
                              </span>
                            </div>
                            <div className={styles.usageProgressBar}>
                              <div
                                className={styles.usageProgressFill}
                                style={{
                                  width: `${Math.min(100, (usage.imageUsedDaily / usage.imageLimitDaily) * 100)}%`,
                                  background: usage.imageUsedDaily >= usage.imageLimitDaily ? '#ef4444' : 'var(--primary)'
                                }}
                              />
                            </div>
                          </>
                        )}

                        {/* Monthly image usage */}
                        {usage.imageLimitMonthly !== null && usage.imageLimitMonthly > 0 && (
                          <>
                            <div className={styles.usageItem} style={{ marginTop: '6px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Layers size={11} style={{ opacity: 0.6 }} />Generations Monthly
                              </span>
                              <span className={usage.imageUsedMonthly >= (usage.imageLimitMonthly ?? Infinity) ? styles.usageLimitReached : ''}>
                                {usage.imageUsedMonthly} / {usage.imageLimitMonthly}
                              </span>
                            </div>
                            <div className={styles.usageProgressBar}>
                              <div
                                className={styles.usageProgressFill}
                                style={{
                                  width: `${Math.min(100, (usage.imageUsedMonthly / (usage.imageLimitMonthly ?? 1)) * 100)}%`,
                                  background: 'var(--accent-color, #8b5cf6)'
                                }}
                              />
                            </div>
                          </>
                        )}

                        {/* Download Usage */}
                        {usage.downloadLimitDaily > 0 && (
                          <>
                            <div className={styles.usageItem} style={{ marginTop: '8px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Download size={11} style={{ opacity: 0.6 }} /> Downloads Today
                              </span>
                              <span className={usage.downloadUsedDaily >= usage.downloadLimitDaily ? styles.usageLimitReached : ''}>
                                {usage.downloadUsedDaily} / {usage.downloadLimitDaily}
                              </span>
                            </div>
                            <div className={styles.usageProgressBar}>
                              <div
                                className={styles.usageProgressFill}
                                style={{
                                  width: `${Math.min(100, (usage.downloadUsedDaily / usage.downloadLimitDaily) * 100)}%`,
                                  background: usage.downloadUsedDaily >= usage.downloadLimitDaily ? '#ef4444' : '#10b981'
                                }}
                              />
                            </div>
                          </>
                        )}

                        <button className={styles.upgradeButtonSmall} onClick={() => openUpgradeModal('pro')} style={{ marginTop: '8px' }}>
                          <Zap size={14} /> Upgrade
                        </button>
                      </motion.div>
                    ) : (
                      <div className={styles.minimizedUsageContent}>
                        <div className={styles.miniProgressGrid}>
                          {usage.imageLimitDaily > 0 && (
                            <div className={styles.usageProgressBar} title={`Generations: ${usage.imageUsedDaily}/${usage.imageLimitDaily}`}>
                              <div
                                className={styles.usageProgressFill}
                                style={{
                                  width: `${Math.min(100, (usage.imageUsedDaily / usage.imageLimitDaily) * 100)}%`,
                                  background: 'var(--primary)'
                                }}
                              />
                            </div>
                          )}
                          {usage.downloadLimitDaily > 0 && (
                            <div className={styles.usageProgressBar} title={`Downloads: ${usage.downloadUsedDaily}/${usage.downloadLimitDaily}`}>
                              <div
                                className={styles.usageProgressFill}
                                style={{
                                  width: `${Math.min(100, (usage.downloadUsedDaily / usage.downloadLimitDaily) * 100)}%`,
                                  background: '#10b981'
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Generations Remaining Card — real data from API */}
                <div className={styles.creditsCard}>
                  <div className={styles.creditsHeader}>
                    <span className={styles.creditsLabel}>Generations Remaining</span>
                    <Sparkles size={16} className={styles.sparkleIcon} />
                  </div>
                  <div className={styles.creditsCount}>
                    {usage && usage.imageLimitDaily > 0 ? (
                      <>
                        <span className={styles.creditsValue}>
                          {Math.max(0, usage.imageLimitDaily - usage.imageUsedDaily)}
                        </span>
                        <span className={styles.creditsTotal}>/ {usage.imageLimitDaily} today</span>
                      </>
                    ) : (
                      <>
                        <span className={styles.creditsValue}>—</span>
                        <span className={styles.creditsTotal}>No limit data</span>
                      </>
                    )}
                  </div>
                  <button className={styles.upgradeButton} onClick={() => openUpgradeModal('pro')}>
                    <Maximize2 size={16} />
                    Upgrade for More
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {isSettingsOpen && (
          <div
            className={styles.sidebarBackdrop}
            onClick={() => setIsSettingsOpen(false)}
          />
        )}

        <motion.main layout className={styles.main}>
          <div className={styles.headerContainer}>
            <div className={styles.tabHeader} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <button
                  className={`${styles.tabButton} ${activeTab === 'generate' ? styles.tabButtonActive : ''}`}
                  onClick={() => setActiveTab('generate')}
                >
                  Create
                </button>
                <button
                  className={`${styles.tabButton} ${activeTab === 'gallery' ? styles.tabButtonActive : ''}`}
                  onClick={() => setActiveTab('gallery')}
                >
                  Collection
                </button>
              </div>

              {activeTab === 'generate' && (
                <button
                  className={styles.settingsToggleBtn}
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  title="Generation Settings"
                >
                  <Sliders size={16} />
                  <span>Parameters</span>
                </button>
              )}
            </div>
          </div>

          <div className={styles.viewport}>
            <AnimatePresence mode="wait">
              {activeTab === 'generate' ? (
                <motion.div
                  key="generate"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '40px',
                    paddingBottom: '240px' // Offset for the fixed prompt section
                  }}
                >
                  <div
                    className={styles.resultContainer}
                    style={{
                      aspectRatio: `${ratio.w}/${ratio.h}`,
                      maxHeight: 'calc(100vh - 380px)',
                      maxWidth: `calc((100vh - 380px) * ${ratio.w / ratio.h})`,
                      width: '100%'
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {focusedGenerationId ? (
                        <motion.div
                          key="generating"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className={styles.generationOverlay}
                        >
                          <div className="relative">
                            <motion.div
                              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                              style={{ width: '80px', height: '80px', border: '2px solid var(--primary)', borderRadius: '50%', borderTopColor: 'transparent' }}
                            />
                            <Wand2 size={32} className="absolute inset-0 m-auto text-primary animate-pulse" />
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{isGoogleImage ? 'Generating...' : 'Diffusing...'}</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Crafting your masterpiece with {selectedModel?.name}</p>
                          </div>
                        </motion.div>
                      ) : activeImage ? (
                        <motion.div
                          key="preview"
                          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                          style={{ width: '100%', height: '100%', position: 'relative' }}
                        >
                          {imageLoadErrors[activeImage.id] ? (
                            <div className={styles.errorOverlay}>
                              <AlertCircle size={48} className={styles.errorIcon} style={{ color: '#ef4444', marginBottom: '16px' }} />
                              <p className={styles.errorText}>Failed to load image !</p>
                              <p className={styles.errorSubtext}>You can recreate the image with the same Prompt</p>
                            </div>
                          ) : (
                            <img
                              src={activeImage.url}
                              alt="Generated result"
                              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 'inherit' }}
                              onClick={() => {
                                const idx = history.findIndex(img => img.url === activeImage.url);
                                setLightboxIndex(idx !== -1 ? idx : 0);
                              }}
                              onError={() => {
                                setImageLoadErrors(prev => ({ ...prev, [activeImage.id]: true }));
                              }}
                            />
                          )}
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, padding: '20px',
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            zIndex: 10
                          }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                onClick={() => handleDownload(activeImage)}
                                className={`${styles.iconActionButton} ${downloadStatus === 'success' ? styles.btnSuccess : ''} ${downloadStatus === 'error' ? styles.btnError : ''}`}
                                disabled={downloadStatus === 'loading'}
                                title="Save Image"
                              >
                                {downloadStatus === 'loading' ? <Loader2 size={18} className="animate-spin" /> :
                                  downloadStatus === 'success' ? <Check size={18} /> :
                                    downloadStatus === 'error' ? <AlertCircle size={18} /> :
                                      <Download size={18} />}
                              </button>
                              <button
                                onClick={() => handleGenerate()}
                                className={styles.iconActionButton}
                                title="Re-roll"
                              >
                                <RotateCcw size={18} />
                              </button>
                            </div>
                            <button
                              onClick={() => setActiveImage(null)}
                              style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backdropFilter: 'blur(10px)'
                              }}
                            >
                              <X size={20} />
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.3 }}
                        >
                          <ImageIcon size={64} />
                          <p style={{ marginTop: '16px', fontWeight: 500 }}>Your masterpiece will appear here</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className={styles.promptSection}>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }} className="no-scrollbar">
                      {PROMPT_STYLERS.map(s => (
                        <button key={s.label} className={styles.stylerButton} onClick={() => applyStyler(s.suffix)}>
                          <span>{s.icon}</span> {s.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <textarea
                          ref={promptRef}
                          className={`${styles.promptTextarea} chat-input`}
                          placeholder="A cosmic landscape with purple nebulas and floating islands..."
                          value={settings.prompt}
                          onChange={e => updateSettings({ prompt: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                        />
                      </div>
                      <button
                        className="send-btn"
                        onClick={handleGenerate}
                        disabled={isGenerating || !settings.prompt.trim()}
                        style={{
                          height: '60px', width: '60px', borderRadius: '16px',
                          background: 'var(--primary)', boxShadow: '0 0 20px var(--primary-glow)'
                        }}
                      >
                        {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <Wand2 size={24} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  style={{ width: '100%' }}
                >
                  {history.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '100px', opacity: 0.3 }}>
                      <History size={64} style={{ marginBottom: '20px' }} />
                      <h2 style={{ color: 'white', marginBottom: '16px' }}>No history yet</h2>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Generated images will appear here</p>
                      <button
                        className="glass"
                        onClick={() => setActiveTab('generate')}
                        style={{
                          padding: '12px 24px',
                          borderRadius: '12px',
                          border: '1px solid var(--primary)',
                          color: 'white',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: 1
                        }}
                      >
                        <Plus size={18} /> Start Creating
                      </button>
                    </div>
                  ) : (
                    <div className={styles.galleryGrid}>
                      {history.map(img => (
                        <motion.div
                          key={img.id}
                          layout
                          className={styles.galleryItem}
                          onClick={() => {
                            const idx = history.findIndex(i => i.id === img.id);
                            setLightboxIndex(idx);
                          }}
                        >
                          {imageLoadErrors[img.id] ? (
                            <div className={styles.errorOverlay}>
                              <AlertCircle size={24} style={{ color: '#ef4444', marginBottom: '8px' }} />
                              <p className={styles.errorText} style={{ fontSize: '0.75rem' }}>Failed to load image !</p>
                              <p className={styles.errorSubtext} style={{ fontSize: '0.65rem' }}>You can recreate the with the same prompt</p>
                            </div>
                          ) : (
                            <div className={styles.galleryImageWrapper}>
                              <div
                                className={styles.galleryImageBlur}
                                style={{ backgroundImage: `url(${img.url})` }}
                              />
                              <img
                                src={img.url}
                                alt={img.prompt}
                                className={styles.galleryImage}
                                onError={() => {
                                  setImageLoadErrors(prev => ({ ...prev, [img.id]: true }));
                                }}
                              />
                            </div>
                          )}
                          <div className={styles.galleryOverlay}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600 }}>
                                {img.model.includes('flux') ? 'FLUX' : 'SDXL'}
                              </div>
                              <Eye size={16} color="white" style={{ opacity: 0.7 }} />
                            </div>
                            <p className={styles.galleryPrompt}>{img.prompt}</p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                              <button onClick={e => { e.stopPropagation(); handleDownload(img); }} className="glass" style={{ flex: 1, padding: '6px', borderRadius: '8px', border: 'none', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}>
                                Save
                              </button>
                              <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(img.id); }} style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.main>

        <ImageLightbox
          isOpen={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          images={history}
          initialIndex={lightboxIndex || 0}
          onDownload={handleDownload}
        />

        <LimitModal
          isOpen={limitModal.isOpen}
          onClose={() => setLimitModal(prev => ({ ...prev, isOpen: false }))}
          type={limitModal.type}
          limitInfo={limitModal.limitInfo}
        />

        <ConfirmModal
          isOpen={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          onConfirm={() => deleteConfirmId && deleteImage(deleteConfirmId)}
          title="Delete Generation?"
          description="This will permanently remove this image from your collection. This action cannot be undone."
          confirmLabel="Delete Image"
        />
      </div>
    </DashboardLayout>
  );
};

export default ImageGenPage;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon, Wand2, Trash2, Loader2, Sparkles,
  Download, Settings2, ChevronDown, Zap, X, RotateCcw, Copy, LayoutGrid, Plus,
  Maximize2, History, Layers, Sliders, Palette, Eye, Settings, HelpCircle, LogOut,
  Check, AlertCircle
} from 'lucide-react';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useAuthStore } from '../store/auth.store';
import { useModelStore } from '../store/model.store';
import { useImageStore } from '../store/image.store';
import api from '../lib/api';
import { useUIStore } from '../store/ui.store';
import toast from 'react-hot-toast';
import styles from './ImageGenPage.module.css';
import { ImageSidebar } from '../components/images/ImageSidebar';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import { ImageLightbox } from '../components/images/ImageLightbox';

// Aspect ratio presets
const ASPECT_RATIOS = [
  { label: '1:1', w: 1024, h: 1024, iconSize: { w: 24, h: 24 } },
  { label: '16:9', w: 1344, h: 768, iconSize: { w: 32, h: 18 } },
  { label: '9:16', w: 768, h: 1344, iconSize: { w: 18, h: 32 } },
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

const ImageGenPage: React.FC = () => {
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
    deleteImage
  } = useImageStore();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const { openUpgradeModal } = useUIStore();
  
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Get image-capable models
  const imageModels = models.filter(m => m.is_image && !m.in_maintenance);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Auto-select first image model
  useEffect(() => {
    if (imageModels.length > 0 && !settings.modelId) {
      const fast = imageModels.find(m => m.is_fast) || imageModels[0];
      updateSettings({ modelId: fast.model_id });
    }
  }, [imageModels, settings.modelId, updateSettings]);

  const selectedModel = imageModels.find(m => m.model_id === settings.modelId);
  const isFlux = settings.modelId.includes('flux');
  const ratio = ASPECT_RATIOS[settings.ratioIndex];

  const handleGenerate = async () => {
    if (!settings.prompt.trim() || isGenerating || !user?.id) return;
    setActiveTab('generate');
    
    await generateImage({
      prompt: settings.prompt,
      model: settings.modelId,
      negative_prompt: isFlux ? undefined : settings.negativePrompt || undefined,
      seed: settings.seed || 0,
      steps: settings.steps,
      width: ratio.w,
      height: ratio.h,
      cfg_scale: isFlux ? undefined : settings.cfgScale,
    });
  };

  const handleDownload = async (url: string, name?: string) => {
    if (downloadStatus === 'loading') return;
    setDownloadStatus('loading');
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name || `sree-ai-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setDownloadStatus('success');
      toast.success('Downloaded successfully!');
      setTimeout(() => setDownloadStatus('idle'), 2000);
    } catch { 
      setDownloadStatus('error');
      toast.error('Download failed');
      setTimeout(() => setDownloadStatus('idle'), 2000);
    }
  };

  const applyStyler = (suffix: string) => {
    const currentPrompt = settings.prompt.trim();
    if (currentPrompt.endsWith(suffix)) return;
    updateSettings({ prompt: currentPrompt + suffix });
    promptRef.current?.focus();
  };

  const handleNewImage = () => {
    setActiveImage(null);
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
              className={styles.sidebar}
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
                <div className={styles.section}>
                  <span className={styles.sectionLabel}>Model Selection</span>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className={styles.dropdownTrigger}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedModel?.name || 'Select Model'}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {selectedModel?.is_fast ? 'Ultra Fast' : 'High Quality'}
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
                          {imageModels.map(m => (
                            <DropdownMenu.Item 
                              key={m.model_id}
                              className={`${styles.dropdownItem} ${settings.modelId === m.model_id ? styles.dropdownItemActive : ''}`}
                              onSelect={() => updateSettings({ modelId: m.model_id })}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span style={{ fontWeight: 600 }}>{m.name}</span>
                                {m.is_fast && <Zap size={12} className="text-success" />}
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {m.is_fast ? 'Ultra Fast' : 'High Quality'}
                              </span>
                            </DropdownMenu.Item>
                          ))}
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

                    {!isFlux && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>CFG Scale</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{settings.cfgScale}</span>
                        </div>
                        <input 
                          type="range" min={1} max={20} value={settings.cfgScale} 
                          onChange={e => updateSettings({ cfgScale: +e.target.value })} 
                          className={styles.rangeInput}
                        />
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
                <div className={styles.creditsCard}>
                  <div className={styles.creditsHeader}>
                    <span className={styles.creditsLabel}>Credits Remaining</span>
                    <Sparkles size={14} className="text-primary" />
                  </div>
                  <div className={styles.creditsCount}>
                    <span className={styles.creditsValue}>{user?.requests_remaining ?? 0}</span>
                    <span className={styles.creditsTotal}>/ {user?.plan_type === 'pro' ? '500' : '50'}</span>
                  </div>
                  <button 
                    className={styles.upgradeButton}
                    onClick={() => openUpgradeModal('pro')}
                  >
                    <Zap size={16} fill="currentColor" />
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <motion.main layout className={styles.main}>
          <div style={{ padding: '24px 40px 0' }}>
            <div className={styles.tabHeader}>
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
                  style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px' }}
                >
                  <div className={styles.resultContainer} style={{ aspectRatio: `${ratio.w}/${ratio.h}`, maxHeight: '60vh' }}>
                    <AnimatePresence mode="wait">
                      {isGenerating ? (
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
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Diffusing...</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Crafting your masterpiece with {selectedModel?.name}</p>
                          </div>
                        </motion.div>
                      ) : activeImage ? (
                        <motion.div 
                          key="preview"
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          style={{ width: '100%', height: '100%', position: 'relative' }}
                        >
                          <img 
                            src={activeImage.url} 
                            alt="Generated result" 
                            style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }}
                            onClick={() => {
                              const idx = history.findIndex(img => img.url === activeImage.url);
                              setLightboxIndex(idx !== -1 ? idx : 0);
                            }}
                          />
                          <div style={{ 
                            position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                               <button 
                                 onClick={() => handleDownload(activeImage.url)} 
                                 className={`${styles.actionButton} ${downloadStatus === 'success' ? styles.btnSuccess : ''} ${downloadStatus === 'error' ? styles.btnError : ''}`}
                                 disabled={downloadStatus === 'loading'}
                               >
                                 {downloadStatus === 'loading' ? <Loader2 size={18} className="animate-spin" /> : 
                                  downloadStatus === 'success' ? <Check size={18} /> :
                                  downloadStatus === 'error' ? <AlertCircle size={18} /> :
                                  <Download size={18} />}
                                 {downloadStatus === 'loading' ? 'Saving...' : 
                                  downloadStatus === 'success' ? 'Saved' :
                                  downloadStatus === 'error' ? 'Failed' :
                                  'Save'}
                               </button>
                               <button onClick={() => handleGenerate()} className={styles.actionButton}>
                                 <RotateCcw size={18} /> Re-roll
                               </button>
                            </div>
                            <button onClick={() => setActiveImage(null)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.6 }}>
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
                          className="chat-input"
                          placeholder="A cosmic landscape with purple nebulas and floating islands..."
                          value={settings.prompt}
                          onChange={e => updateSettings({ prompt: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                          style={{ 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px', padding: '16px', minHeight: '60px',
                            fontSize: '1rem', width: '100%', resize: 'none'
                          }}
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
                          <img src={img.url} alt={img.prompt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div className={styles.galleryOverlay}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600 }}>
                                {img.model.includes('flux') ? 'FLUX' : 'SDXL'}
                              </div>
                              <Eye size={16} color="white" style={{ opacity: 0.7 }} />
                            </div>
                            <p className={styles.galleryPrompt}>{img.prompt}</p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                              <button onClick={e => { e.stopPropagation(); handleDownload(img.url); }} className="glass" style={{ flex: 1, padding: '6px', borderRadius: '8px', border: 'none', color: 'white', fontSize: '0.7rem', cursor: 'pointer' }}>
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
          images={history}
          currentIndex={lightboxIndex ?? 0}
          isOpen={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(idx) => setLightboxIndex(idx)}
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

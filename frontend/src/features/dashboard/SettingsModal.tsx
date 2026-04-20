import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Zap, Shield, RefreshCw, CheckCircle2, AlertCircle, Trash2, Save } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import api from '../../lib/api';
import styles from './SettingsModal.module.css';

interface ApiKeyInfo {
  provider: string;
  updated_at: string;
  last_used_at: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile } = useAuthStore();
  const [apiKeys, setApiKeys] = useState({
    nvidia: '',
    deepgram: ''
  });
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [savedKeys, setSavedKeys] = useState<ApiKeyInfo[]>([]);

  const fetchKeys = async () => {
    try {
      const response = await api.get('/user/settings/keys');
      setSavedKeys(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch keys:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchKeys();
    }
  }, [isOpen]);

  const handleUpgrade = async () => {
    if (!user) return;
    try {
      await updateProfile({ plan_type: 'pro' });
      alert('Successfully upgraded to Pro! You now have unlimited neural processing.');
    } catch (error) {
      alert('Failed to upgrade. Please check your connection.');
    }
  };

  const handleSaveKey = async (provider: 'nvidia' | 'deepgram') => {
    const key = apiKeys[provider];
    if (!key.trim()) return;
    setIsSaving(provider);
    try {
      await api.post('/user/settings/keys', { provider, key });
      alert(`${provider.toUpperCase()} API Key saved successfully and encrypted.`);
      setApiKeys(prev => ({ ...prev, [provider]: '' }));
      fetchKeys();
    } catch (error) {
      alert('Error saving API key. Please try again.');
    } finally {
      setIsSaving(null);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    if (!confirm(`Are you sure you want to delete your ${provider} API key?`)) return;
    try {
      await api.delete(`/user/settings/keys/${provider}`);
      fetchKeys();
    } catch (error) {
      alert('Failed to delete key.');
    }
  };

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const res = await api.get('/health');
      if (res.data.success) setHealthStatus('ok');
      else setHealthStatus('error');
    } catch {
      setHealthStatus('error');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.overlay} onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>System Settings</h2>
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.content}>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Profile Intelligence</div>
                <div className={styles.row}>
                  <div className={styles.info}>
                    <span className={styles.label}>Identity</span>
                    <span className={styles.value}>{user?.email}</span>
                  </div>
                  <User size={20} className="text-muted" />
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Computational Plan</div>
                <div className={styles.row}>
                  <div className={styles.info}>
                    <span className={styles.label}>{user?.plan_type === 'pro' ? 'Pro Membership' : 'Standard Node'}</span>
                    <span className={styles.value}>
                      {user?.plan_type === 'pro' ? 'Unlimited High-Priority Access' : 'Standard performance tier'}
                    </span>
                  </div>
                  {user?.plan_type !== 'pro' ? (
                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleUpgrade}>
                      <Zap size={14} style={{ marginRight: '6px' }} />
                      Upgrade
                    </button>
                  ) : (
                    <Zap size={20} style={{ color: 'var(--accent)' }} />
                  )}
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>NVIDIA NIM (Chat & Vision)</div>
                <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input 
                      type="password" 
                      placeholder="nvapi-..." 
                      className={styles.apiKeyInput}
                      value={apiKeys.nvidia}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, nvidia: e.target.value }))}
                    />
                    <button 
                      className={`${styles.btn} ${styles.btnPrimary}`} 
                      onClick={() => handleSaveKey('nvidia')}
                      disabled={isSaving !== null}
                    >
                      {isSaving === 'nvidia' ? '...' : <Save size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Deepgram (Voice & Audio)</div>
                <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input 
                      type="password" 
                      placeholder="Deepgram Key..." 
                      className={styles.apiKeyInput}
                      value={apiKeys.deepgram}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, deepgram: e.target.value }))}
                    />
                    <button 
                      className={`${styles.btn} ${styles.btnPrimary}`} 
                      onClick={() => handleSaveKey('deepgram')}
                      disabled={isSaving !== null}
                    >
                      {isSaving === 'deepgram' ? '...' : <Save size={16} />}
                    </button>
                  </div>

                  {savedKeys.length > 0 && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '12px', 
                      borderRadius: '12px', 
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Active Keys</div>
                      {savedKeys.map(key => (
                        <div key={key.provider} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                            <span style={{ fontSize: '0.85rem' }}>{key.provider.toUpperCase()} Key Active</span>
                          </div>
                          <button 
                            onClick={() => handleDeleteKey(key.provider)}
                            style={{ background: 'none', border: 'none', color: 'rgba(239, 68, 68, 0.6)', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Security</div>
                <div className={styles.row}>
                  <div className={styles.info}>
                    <span className={styles.label}>Neural Encryption</span>
                    <span className={styles.value}>AES-256 Verified</span>
                  </div>
                  <Shield size={20} style={{ color: 'var(--success)' }} />
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Infrastructure Health</div>
                <div className={styles.row}>
                  <div className={styles.info}>
                    <span className={styles.label}>Backend Core</span>
                    <span className={styles.value}>
                      {healthStatus === 'ok' ? 'System Optimized' : healthStatus === 'error' ? 'Connection Critical' : 'Verify neural link'}
                    </span>
                  </div>
                  <button 
                    className={`${styles.healthBtn} ${healthStatus === 'checking' ? styles.spinning : ''}`} 
                    onClick={checkHealth}
                    disabled={healthStatus === 'checking'}
                  >
                    {healthStatus === 'checking' ? <RefreshCw size={18} /> : 
                     healthStatus === 'ok' ? <CheckCircle2 size={18} color="var(--success)" /> : 
                     healthStatus === 'error' ? <AlertCircle size={18} color="var(--error)" /> : 
                     <RefreshCw size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.footer}>
              <button className={styles.btn} onClick={onClose} style={{ background: 'var(--bg-hover)', border: 'none', color: 'var(--text)' }}>
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

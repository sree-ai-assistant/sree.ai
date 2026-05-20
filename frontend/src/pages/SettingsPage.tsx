import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Save, 
  ShieldCheck, 
  Trash2, 
  RefreshCw, 
  Zap,
  Mail,
  Smartphone,
  Plus,
  HelpCircle,
  LogOut,
  Camera,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  Monitor,
  Laptop,
  Lock
} from 'lucide-react';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { SettingsSidebar } from '../components/layout/SettingsSidebar';
import api, { sessionService, apiKeyService } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useUsageStore } from '../store/usage.store';
import ApiKeyModal from '../components/shared/ApiKeyModal';
import { getProviderLogo, PROVIDER_COLORS } from '../components/icons/ProviderLogos';
import styles from './SettingsPage.module.css';
import { useUIStore } from '../store/ui.store';

interface SavedApiKey {
  id: string;
  provider: string;
  name: string | null;
  in_use: boolean;
  updated_at: string;
  last_used_at: string;
  created_at: string;
}

const PROVIDERS = [
  { id: 'google', name: 'Google', description: 'Gemini models' },
  { id: 'nvidia', name: 'Nvidia', description: 'NIM inference' },
  { id: 'deepgram', name: 'DeepGram', description: 'Speech-to-text' },
  { id: 'groq', name: 'Groq', description: 'Ultra-fast inference' },
];

interface UserSession {
  id: string;
  device_id: string | null;
  os: string;
  browser: string;
  location: string;
  ip_address: string;
  is_current: boolean;
  last_active: string;
  created_at: string;
}

const PLAN_CONFIG: Record<string, { label: string; price: string; period: string; color: string; requests: number; storage: string }> = {
  free: { label: 'Free', price: '$0', period: '/month', color: '#6B7280', requests: 5000, storage: '1 GB' },
  starter: { label: 'Starter', price: '$9.00', period: '/month', color: '#3B82F6', requests: 25000, storage: '5 GB' },
  pro: { label: 'Pro', price: '$29.00', period: '/month', color: '#8B5CF6', requests: 50000, storage: '10 GB' },
};

const SettingsPage: React.FC = () => {
  const { user, updateProfile } = useAuthStore();
  const { status: usageStatus, fetchStatus: fetchUsageStatus } = useUsageStore();
  const [searchParams] = useSearchParams();
  const VALID_TABS = ['profile', 'keys', 'billing', 'security', 'notifications'];
  const rawTab = searchParams.get('tab');
  const initialTab = rawTab === 'devices' ? 'security' : (VALID_TABS.includes(rawTab || '') ? rawTab! : 'profile');
  const [activeSection, setActiveSection] = useState(initialTab);
  const { sidebarCollapsed: isSidebarCollapsed, setSidebarCollapsed: setIsSidebarCollapsed } = useUIStore();

  // Sync activeSection when URL ?tab= changes (e.g. from Navbar dropdown)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && VALID_TABS.includes(tab)) {
      setActiveSection(tab);
    }
  }, [searchParams]);

  // Fetch live usage data for billing section
  useEffect(() => { fetchUsageStatus(); }, [fetchUsageStatus]);
  const [profileData, setProfileData] = useState({
    display_name: user?.display_name || '',
    avatar_url: user?.avatar_url || ''
  });
  const [savedKeys, setSavedKeys] = useState<SavedApiKey[]>([]);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyModalProvider, setKeyModalProvider] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    const initSettings = async () => {
      const details = await getDeviceDetails();
      
      // Sync current session with persistent device ID
      try {
        await sessionService.syncSession(details);
      } catch (e) {
        console.warn('Failed to sync session', e);
      }

      // Fetch settings and sessions
      fetchSettings();
      fetchSessions();
    };

    initSettings();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await sessionService.getSessions();
      if (response.success) {
        // Group by device_id to avoid "fake" duplicate sessions
        const sessionData: UserSession[] = response.data;
        const deviceMap = new Map<string, UserSession>();
        
        // Priority: current session > most recent active
        const sortedSessions = [...sessionData].sort((a, b) => {
          if (a.is_current) return -1;
          if (b.is_current) return 1;
          return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
        });

        sortedSessions.forEach(session => {
          const key = session.device_id || `legacy_${session.os}_${session.browser}_${session.ip_address}`;
          if (!deviceMap.has(key)) {
            deviceMap.set(key, session);
          } else {
            // If we found another session for same device, ensure we keep the current one or most recent
            const existing = deviceMap.get(key)!;
            if (session.is_current) deviceMap.set(key, session);
            else if (!existing.is_current && new Date(session.last_active) > new Date(existing.last_active)) {
              deviceMap.set(key, session);
            }
          }
        });

        setSessions(Array.from(deviceMap.values()));
      }
    } catch (error) {
      console.error('Failed to fetch sessions', error);
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    try {
      const response = await sessionService.deleteSession(sessionId);
      if (response.success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (error) {
      console.error('Failed to logout session', error);
    }
  };

  const getDeviceDetails = async () => {
    const ua = navigator.userAgent;
    let os = 'Unknown OS';
    let browser = 'Unknown Browser';
    let version = '';

    // @ts-ignore
    const uaData = navigator.userAgentData;
    
    if (uaData) {
      os = uaData.platform || os;
      const brands = uaData.brands;
      const mainBrand = brands.find((b: any) => b.brand !== 'Chromium' && b.brand !== 'Not A;Brand');
      if (mainBrand) {
        browser = mainBrand.brand;
        version = mainBrand.version;
      }
    }

    if (os === 'Unknown OS' || os === '') {
      if (ua.indexOf('Win') !== -1) os = 'Windows';
      else if (ua.indexOf('Mac') !== -1) os = 'macOS';
      else if (ua.indexOf('Linux') !== -1) os = 'Linux';
      else if (ua.indexOf('Android') !== -1) os = 'Android';
      else if (ua.indexOf('like Mac') !== -1) os = 'iOS';
    }

    // More specific device detection
    if (/iPhone/.test(ua)) os = 'iPhone';
    else if (/iPad/.test(ua)) os = 'iPad';
    else if (/Macintosh/.test(ua)) {
      if (navigator.maxTouchPoints > 0) os = 'iPad Pro';
      else os = 'MacBook / iMac';
    } else if (/Windows/.test(ua)) {
      if (/Windows NT 10.0/.test(ua)) os = 'Windows 10/11';
      else if (/Windows NT 6.3/.test(ua)) os = 'Windows 8.1';
      else os = 'Windows PC';
    }

    if (browser === 'Unknown Browser') {
      if (ua.indexOf('Edg') !== -1) browser = 'Microsoft Edge';
      else if (ua.indexOf('Chrome') !== -1) browser = 'Google Chrome';
      else if (ua.indexOf('Firefox') !== -1) browser = 'Mozilla Firefox';
      else if (ua.indexOf('Safari') !== -1 && ua.indexOf('Chrome') === -1) browser = 'Safari';
      else if (ua.indexOf('Opera') !== -1 || ua.indexOf('OPR') !== -1) browser = 'Opera';
    }

    if (!version) {
      const match = ua.match(/(?:Edg|Chrome|Firefox|Safari|OPR)\/([\d.]+)/);
      version = match ? match[1].split('.')[0] : '';
    }

    let location = 'Local';
    let ip_address = '';
    try {
      // Use a more reliable free service or fallback to TZ
      const ipRes = await fetch('https://api.db-ip.com/v2/free/self').catch(() => null);
      if (ipRes && ipRes.ok) {
        const data = await ipRes.json();
        location = `${data.city || 'Unknown City'}, ${data.countryName || 'Unknown Country'}`;
        ip_address = data.ipAddress || '';
      } else {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        location = tz.split('/').pop()?.replace('_', ' ') || 'Local';
      }
    } catch (e) {
      console.warn('Location detection failed', e);
    }

    const details = { os, browser, location, ip_address, browserVersion: version, device_id: getPersistentDeviceId() };
    return details;
  };

  const getPersistentDeviceId = () => {
    let deviceId = localStorage.getItem('ai_sass_device_id');
    if (!deviceId) {
      deviceId = 'dv_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('ai_sass_device_id', deviceId);
    }
    return deviceId;
  };

  useEffect(() => {
    // fetchSettings(); // Now handled in initSettings
  }, []);

  const fetchSettings = async () => {
    try {
      setStatus('loading');
      await fetchSavedKeys();
      setStatus('idle');
    } catch (error) {
      console.error('Error fetching settings:', error);
      setStatus('error');
    }
  };

  const fetchSavedKeys = async () => {
    try {
      const response = await apiKeyService.listKeys();
      if (response.success && response.data) {
        setSavedKeys(response.data);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  };

  const handleSaveApiKey = async (data: { name: string; provider: string; key: string }) => {
    await apiKeyService.saveKey(data);
    await fetchSavedKeys();
  };

  const handleToggleKey = async (keyId: string, currentValue: boolean) => {
    // Optimistic update
    setSavedKeys(prev => prev.map(k => k.id === keyId ? { ...k, in_use: !currentValue } : k));
    try {
      await apiKeyService.toggleKey(keyId, !currentValue);
    } catch (error) {
      // Revert on failure
      setSavedKeys(prev => prev.map(k => k.id === keyId ? { ...k, in_use: currentValue } : k));
      console.error('Failed to toggle key:', error);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await apiKeyService.deleteKey(keyId);
      setSavedKeys(prev => prev.filter(k => k.id !== keyId));
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  const openKeyModal = (providerId: string) => {
    setKeyModalProvider(providerId);
    setKeyModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    try {
      setStatus('saving');
      setLastSaved('profile');
      const formData = new FormData();
      formData.append('avatar', file);
      
      const response = await api.post('/user/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data.avatar_url) {
        setProfileData(prev => ({ ...prev, avatar_url: response.data.avatar_url }));
        await updateProfile({ avatar_url: response.data.avatar_url });
        setStatus('success');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setStatus('error');
    }
  };

  const handleUpdateProfile = async () => {
    try {
      setStatus('saving');
      setLastSaved('profile');
      await api.patch('/user/profile', {
        display_name: profileData.display_name
      });
      await updateProfile({ display_name: profileData.display_name });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setStatus('error');
    }
  };

  const renderProfileSection = () => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={styles.sectionContent}
    >
      <div className={styles.settingsGrid}>
        <div className={styles.settingsCard}>
          <div className={styles.profileHero}>
            <div className={styles.avatarSection}>
              <div className={styles.avatarContainer}>
                {profileData.avatar_url ? (
                  <img src={profileData.avatar_url} alt="Profile Icon" className={styles.mainAvatar} />
                ) : (
                  <div className={styles.avatarPlaceholderLarge}>
                    {(profileData.display_name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <button 
                  className={styles.iconUploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload New Icon"
                  disabled={status === 'saving'}
                >
                  {status === 'saving' && lastSaved === 'profile' ? (
                    <RefreshCw size={16} className={styles.spinning} />
                  ) : (
                    <Camera size={16} />
                  )}
                </button>
              </div>
              <div className={styles.avatarInfo}>
                <h4 className={styles.avatarTitle}>Profile Icon</h4>
                <p className={styles.avatarDesc}>Update your account icon. Square images work best.</p>
                <div className={styles.avatarActions}>
                  <button 
                    className={styles.textActionBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={status === 'saving'}
                  >
                    {status === 'saving' && lastSaved === 'profile' ? 'Uploading...' : 'Upload Image'}
                  </button>
                  {profileData.avatar_url && (
                    <button className={styles.textActionBtnDanger}>Remove</button>
                  )}
                </div>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              className={styles.hiddenInput}
              accept="image/png,image/jpeg,image/webp"
            />
            <div className={styles.profileIdentity}>
              <h2 className={styles.userNameHeader}>{profileData.display_name || user?.email?.split('@')[0] || 'User'}</h2>
              <p className={styles.userEmailHeader}>{user?.email}</p>
              <div className={styles.badgeRow}>
                <span className={styles.premiumBadge} style={{
                  background: `${(PLAN_CONFIG[user?.plan_type || 'free']?.color || '#6B7280')}22`,
                  color: PLAN_CONFIG[user?.plan_type || 'free']?.color || '#6B7280',
                  borderColor: `${(PLAN_CONFIG[user?.plan_type || 'free']?.color || '#6B7280')}44`
                }}>
                  <Zap size={11} fill="currentColor" /> {PLAN_CONFIG[user?.plan_type || 'free']?.label || 'Free'}
                </span>
                <span className={styles.verifiedBadge}>
                  <CheckCircle2 size={11} /> Verified
                </span>
              </div>
            </div>
          </div>

          <div className={styles.cardBody}>
            <div className={styles.formRow}>
              <div className={styles.fieldGroup}>
                <label>Display Name</label>
                <input 
                  type="text" 
                  value={profileData.display_name}
                  onChange={(e) => setProfileData(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="E.g. John Doe"
                />
                <span className={styles.fieldHint}>This is how you'll appear to others.</span>
              </div>
              <div className={styles.fieldGroup}>
                <label>Email Address</label>
                <div className={styles.readOnlyField}>
                  <Mail size={16} />
                  <span>{user?.email}</span>
                </div>
                <span className={styles.fieldHint}>Email cannot be changed manually.</span>
              </div>
            </div>
          </div>

          <div className={styles.cardFooter}>
            <button 
              className={styles.actionButton}
              onClick={handleUpdateProfile}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? (
                <RefreshCw className={styles.spinning} size={16} />
              ) : (
                <Save size={16} />
              )}
              {status === 'saving' ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        <div className={styles.settingsCard}>
          <div className={styles.cardHeaderSmall}>
            <h3 className={styles.cardTitle}>Account Security</h3>
            <p className={styles.cardSubtitle}>Manage your login methods and security settings.</p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.securityItem}>
              <div className={styles.securityInfo}>
                <Lock size={20} className={styles.securityIcon} />
                <div>
                  <h4>Password</h4>
                  <p>Last changed 3 months ago</p>
                </div>
              </div>
              <button className={styles.secondaryButton}>Change</button>
            </div>
            <div className={styles.securityItem}>
              <div className={styles.securityInfo}>
                <Fingerprint size={20} className={styles.securityIcon} />
                <div>
                  <h4>Two-Factor Authentication</h4>
                  <p>Add an extra layer of security</p>
                </div>
              </div>
              <button className={styles.secondaryButton}>Enable</button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderKeysSection = () => {
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}-${mm}-${yy}`;
    };

    const getKeyCountForProvider = (providerId: string) => 
      savedKeys.filter(k => k.provider === providerId).length;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={styles.sectionContent}
      >
        <div className={styles.settingsCard}>
          <div className={styles.cardHeaderSmall}>
            <h3 className={styles.cardTitle}>API Providers</h3>
            <p className={styles.cardSubtitle}>Connect your AI provider API keys to power your applications.</p>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.apiKeyList}>
              {PROVIDERS.map(provider => {
                const keyCount = getKeyCountForProvider(provider.id);
                const providerColor = PROVIDER_COLORS[provider.id] || '#6366f1';
                return (
                  <div key={provider.id} className={styles.providerItem}>
                    <div className={styles.providerInfo}>
                      <div 
                        className={styles.providerLogo}
                        style={{ background: `${providerColor}12`, borderColor: `${providerColor}25` }}
                      >
                        {getProviderLogo(provider.id, 22)}
                      </div>
                      <div>
                        <h4 className={styles.providerName}>{provider.name}</h4>
                        {keyCount > 0 ? (
                          <p className={styles.providerStatus}>
                            <CheckCircle2 size={12} color="#10B981" /> {keyCount} key{keyCount > 1 ? 's' : ''} connected
                          </p>
                        ) : (
                          <p className={styles.providerStatusMuted}>{provider.description}</p>
                        )}
                      </div>
                    </div>
                    <button 
                      className={styles.providerButton}
                      onClick={() => openKeyModal(provider.id)}
                    >
                      <Plus size={14} style={{ marginRight: 4 }} />
                      Connect
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Saved API Keys */}
          <div className={styles.savedKeysSection}>
            <div className={styles.savedKeysHeader}>
              <h4 className={styles.savedKeysTitle}>Saved API Keys</h4>
              {savedKeys.length > 0 && (
                <span className={styles.savedKeysCount}>{savedKeys.length} key{savedKeys.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className={styles.savedKeysList}>
              {savedKeys.length > 0 ? (
                savedKeys.map(key => {
                  const providerColor = PROVIDER_COLORS[key.provider] || '#6366f1';
                  return (
                    <div 
                      key={key.id} 
                      className={`${styles.savedKeyItem} ${!key.in_use ? styles.savedKeyItemDisabled : ''}`}
                    >
                      <div 
                        className={styles.savedKeyProviderIcon}
                        style={{ background: `${providerColor}12`, border: `1px solid ${providerColor}25` }}
                      >
                        {getProviderLogo(key.provider, 20)}
                      </div>
                      <div className={styles.savedKeyInfo}>
                        <h5 className={styles.savedKeyName}>
                          {key.name || `${key.provider}_key`}
                        </h5>
                        <div className={styles.savedKeyMeta}>
                          <span className={styles.savedKeyProviderBadge} style={{ color: providerColor }}>
                            {key.provider.charAt(0).toUpperCase() + key.provider.slice(1)}
                          </span>
                          <span className={styles.savedKeyDate}>
                            Added {formatDate(key.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.savedKeyActions}>
                        <div className={styles.savedKeyToggle}>
                          <input 
                            type="checkbox" 
                            id={`toggle-${key.id}`} 
                            checked={key.in_use}
                            onChange={() => handleToggleKey(key.id, key.in_use)}
                          />
                          <label htmlFor={`toggle-${key.id}`}></label>
                        </div>
                        <button 
                          className={styles.savedKeyDeleteBtn}
                          onClick={() => handleDeleteKey(key.id)}
                          title="Delete this API key"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyKeysMessage}>
                  No API keys saved yet. Connect a provider above to get started.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* API Key Modal */}
        <ApiKeyModal
          isOpen={keyModalOpen}
          onClose={() => setKeyModalOpen(false)}
          onSave={handleSaveApiKey}
          provider={keyModalProvider}
        />
      </motion.div>
    );
  };

  const renderBillingSection = () => {
    const plan = PLAN_CONFIG[user?.plan_type || 'free'];
    const isAnon = usageStatus?.tier?.toLowerCase() === 'anonymous';

    const buildServiceCard = (
      label: string,
      data: any,
      barColor: string,
      icon: string
    ) => {
      if (!data?.daily) return null;
      const { used, limit } = data.daily;
      const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      const remaining = Math.max(0, (limit ?? 0) - used);
      const isWarning = pct > 80;
      return (
        <div className={styles.usageCard} key={label}>
          <div className={styles.usageHeader}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{icon}</span>{label}
            </span>
            <span style={{ color: isWarning ? '#f59e0b' : undefined }}>{pct}%</span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${pct}%`, background: isWarning ? '#f59e0b' : barColor, transition: 'width 0.5s ease' }}
            />
          </div>
          <p className={styles.usageStats}>
            {used.toLocaleString()} used · {parseFloat(remaining.toFixed(1))} remaining / {(limit ?? 0).toLocaleString()} daily
          </p>
        </div>
      );
    };

    const displayUsage = usageStatus?.profileUsage || {
      chat: usageStatus?.usage?.chat,
      voice: usageStatus?.usage?.voice,
      image: usageStatus?.usage?.image,
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={styles.sectionContent}
      >
        <div className={styles.billingOverview}>
          {/* Plan card */}
          <div className={styles.planCard}>
            <div className={styles.planInfo}>
              <span className={styles.currentPlanLabel}>Current Plan</span>
              <h2 className={styles.planName}>{plan.label} Monthly</h2>
              <p className={styles.planPrice}>{plan.price}<span>{plan.period}</span></p>
            </div>
            <div className={styles.planActions}>
              <button className={styles.upgradeBtn}>
                {user?.plan_type === 'pro' ? 'Manage Subscription' : 'Upgrade Plan'}
              </button>
            </div>
          </div>

          {/* Service usage cards */}
          <div className={styles.usageGrid}>
            {buildServiceCard('Chat', displayUsage?.chat, 'linear-gradient(90deg,#6366f1,#a855f7)', '💬')}
            {buildServiceCard('Voice', displayUsage?.voice, 'linear-gradient(90deg,#10b981,#3b82f6)', '🎙️')}
            {!isAnon && buildServiceCard('Image', displayUsage?.image, 'linear-gradient(90deg,#f43f5e,#fb923c)', '🖼️')}
          </div>

          {/* Reset info */}
          {usageStatus?.resets_in_seconds !== undefined && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
              Daily limits reset in {(() => {
                const s = Number(usageStatus.resets_in_seconds);
                if (isNaN(s) || s <= 0) return 'tomorrow';
                if (s < 60) return `${s}s`;
                const m = Math.ceil(s / 60);
                if (m < 60) return `${m}m`;
                return `${Math.ceil(m / 60)}h`;
              })()}
            </p>
          )}
        </div>
      </motion.div>
    );
  };

  const renderSecuritySection = () => {
    const formatLastActive = (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInMins = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      if (diffInMins < 1) return 'Just now';
      if (diffInMins < 60) return `${diffInMins}m ago`;
      if (diffInHours < 24) return `${diffInHours}h ago`;
      if (diffInDays < 7) return `${diffInDays}d ago`;
      return date.toLocaleDateString();
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={styles.sectionContent}
      >
        <div className={styles.settingsGrid}>
          {/* Security Card */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeaderSmall}>
              <h3 className={styles.cardTitle}>Security Overview</h3>
              <p className={styles.cardSubtitle}>Manage your account security and login methods.</p>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.securityItem}>
                <div className={styles.securityInfo}>
                  <div className={styles.securityIconBox}>
                    <Lock size={20} />
                  </div>
                  <div>
                    <h4 className={styles.securityName}>Password</h4>
                    <p className={styles.securityDesc}>Last updated 3 months ago</p>
                  </div>
                </div>
                <button className={styles.secondaryButton}>Change Password</button>
              </div>
              
              <div className={styles.securityItem}>
                <div className={styles.securityInfo}>
                  <div className={styles.securityIconBox} style={{ color: '#10B981' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4 className={styles.securityName}>Two-Factor Authentication</h4>
                    <p className={styles.securityDesc}>Add an extra layer of security to your account.</p>
                  </div>
                </div>
                <button className={styles.secondaryButton}>Configure</button>
              </div>
            </div>
          </div>

          {/* Active Sessions Card inside Security */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeaderSmall}>
              <div className={styles.headerWithIcon}>
                <div className={styles.iconBoxPrimary}>
                  <Smartphone size={20} />
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Active Sessions</h3>
                  <p className={styles.cardSubtitle}>Devices currently logged into your account.</p>
                </div>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.deviceList}>
                {sessions.length > 0 ? (
                  sessions.map((session) => (
                    <div key={session.id} className={`${styles.deviceItem} ${!session.is_current ? styles.deviceItemDisabled : ''}`}>
                      <div className={styles.deviceIcon}>
                        {session.os.toLowerCase().includes('windows') ? (
                          <Monitor size={22} />
                        ) : session.os.toLowerCase().includes('mac') ? (
                          <Laptop size={22} />
                        ) : session.os.toLowerCase().includes('iphone') || session.os.toLowerCase().includes('android') ? (
                          <Smartphone size={22} />
                        ) : (
                          <Monitor size={22} />
                        )}
                      </div>
                      <div className={styles.deviceInfo}>
                        <div className={styles.deviceMainInfo}>
                          <span className={styles.deviceName}>{session.os}</span>
                          {session.is_current && <span className={styles.currentBadge}>Current Session</span>}
                        </div>
                        <span className={styles.deviceStatus}>
                          {session.browser} • {session.location} • {session.is_current ? 'Active Now' : formatLastActive(session.last_active)}
                        </span>
                        {session.device_id && (
                          <span className={styles.deviceIdTag}>Device ID: {session.device_id.substring(0, 12)}...</span>
                        )}
                      </div>
                      {session.is_current ? (
                        <div className={styles.activeIndicator}>
                          <div className={styles.pulseDot} />
                          <span className={styles.activeTag}>Active</span>
                        </div>
                      ) : (
                        <button 
                          className={styles.logoutDeviceBtn}
                          onClick={() => handleLogoutSession(session.id)}
                          title="Revoke access for this device"
                        >
                          <LogOut size={16} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptySessions}>
                    <RefreshCw size={24} className={styles.spin} />
                    <p>Loading active sessions...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderNotificationsSection = () => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={styles.sectionContent}
    >
      <div className={styles.settingsCard}>
        <div className={styles.cardHeaderSmall}>
          <h3 className={styles.cardTitle}>Notification Preferences</h3>
          <p className={styles.cardSubtitle}>Choose how you want to be notified about updates.</p>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.notificationGroup}>
            {[
              { id: 'email_updates', label: 'Email Updates', desc: 'Get news about product updates and features.' },
              { id: 'security_alerts', label: 'Security Alerts', desc: 'Receive alerts about login attempts and security.' },
              { id: 'usage_alerts', label: 'Usage Alerts', desc: 'Notifications when you reach 80% of your limit.' },
              { id: 'marketing', label: 'Marketing Emails', desc: 'Special offers and industry insights.' }
            ].map(pref => (
              <div key={pref.id} className={styles.notificationItem}>
                <div className={styles.notifInfo}>
                  <h4 className={styles.notifLabel}>{pref.label}</h4>
                  <p className={styles.notifDesc}>{pref.desc}</p>
                </div>
                <div className={styles.toggleSwitch}>
                  <input type="checkbox" id={pref.id} defaultChecked />
                  <label htmlFor={pref.id}></label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'profile': return renderProfileSection();
      case 'keys': return renderKeysSection();
      case 'billing': return renderBillingSection();
      case 'security': return renderSecuritySection();
      case 'notifications': return renderNotificationsSection();
      default: return renderProfileSection();
    }
  };

  return (
    <DashboardLayout 
      isCollapsed={isSidebarCollapsed}
      setIsCollapsed={setIsSidebarCollapsed}
      sidebar={
        <SettingsSidebar 
          isCollapsed={isSidebarCollapsed} 
          setIsCollapsed={setIsSidebarCollapsed}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onAvatarUpload={async (file) => {
            // Re-use handleFileChange logic but for a single file
            const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
            await handleFileChange(event);
          }}
          isUploadingAvatar={status === 'saving' && lastSaved === 'profile'}
        />
      }
    >
      <div className={styles.pageContainer}>
        <div className={styles.pageContent}>
          <header className={styles.settingsHeader}>
            <div className={styles.headerTitleGroup}>
              <h1 className={styles.pageTitle}>{activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}</h1>
              <div className={styles.breadcrumb}>
                <span className={styles.breadcrumbLink}>Settings</span>
                <ChevronRight size={14} className={styles.breadcrumbDivider} />
                <span className={styles.activeBreadcrumb}>{activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}</span>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.helpBtn}>
                <HelpCircle size={18} />
                <span>Documentation</span>
              </button>
            </div>
          </header>

          <div className={styles.layoutMain}>
            {renderSection()}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;

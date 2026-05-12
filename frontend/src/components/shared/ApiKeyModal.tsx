import React, { useState, useEffect, useRef } from 'react';
import { X, Save, RefreshCw, Key } from 'lucide-react';
import { getProviderLogo, PROVIDER_COLORS } from '../icons/ProviderLogos';
import styles from './ApiKeyModal.module.css';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; provider: string; key: string }) => Promise<void>;
  provider: string;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, provider }) => {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Generate default name when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yy = String(now.getFullYear()).slice(-2);
      setName(`${provider.toLowerCase()}_key-${dd}-${mm}-${yy}`);
      setApiKey('');
      setError('');
      setSaving(false);
      // Focus key input after animation
      setTimeout(() => keyInputRef.current?.focus(), 350);
    }
  }, [isOpen, provider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const finalName = name.trim() || `${provider.toLowerCase()}_key-${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`;
      await onSave({ name: finalName, provider: provider.toLowerCase(), key: apiKey.trim() });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const providerColor = PROVIDER_COLORS[provider.toLowerCase()] || '#6366f1';
  const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div 
              className={styles.providerIcon}
              style={{ background: `${providerColor}18`, border: `1px solid ${providerColor}33` }}
            >
              {getProviderLogo(provider, 26)}
            </div>
            <div>
              <h3 className={styles.headerTitle}>Connect {displayName}</h3>
              <p className={styles.headerSubtitle}>Add your API key for {displayName}</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {error && <div className={styles.errorMsg}>{error}</div>}

          {/* Provider (read-only) */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Provider</label>
            <div className={styles.providerBadge}>
              <div 
                className={styles.providerBadgeIcon}
                style={{ background: `${providerColor}18` }}
              >
                {getProviderLogo(provider, 20)}
              </div>
              {displayName}
            </div>
          </div>

          {/* Key Name */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Key Name</label>
            <input 
              type="text"
              className={styles.fieldInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${provider.toLowerCase()}_key-01-06-26`}
            />
            <span className={styles.fieldHint}>A friendly name to identify this key. Leave blank for auto-generated name.</span>
          </div>

          {/* API Key */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>API Key</label>
            <input 
              ref={keyInputRef}
              type="password"
              className={styles.fieldInputKey}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <span className={styles.fieldHint}>Your key is encrypted and stored securely.</span>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button 
            type="submit" 
            className={styles.saveBtn}
            disabled={saving || !apiKey.trim()}
          >
            {saving ? (
              <RefreshCw size={16} className={styles.spinning} />
            ) : (
              <Key size={16} />
            )}
            {saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApiKeyModal;

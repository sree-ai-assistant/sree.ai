import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User as LucideUser,
  Key,
  CreditCard,
  Shield,
  ChevronLeft,
  LogOut,
  HelpCircle,
  Bell,
  Settings as SettingsIcon,
  Zap,
  ArrowLeft,
  ChevronRight,
  Camera,
  RefreshCw,
  Crown,
  Sparkles,
  Smartphone
} from 'lucide-react';
import { useAuthStore, type User } from '../../store/auth.store';
import styles from './SettingsSidebar.module.css';

interface SettingsSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onAvatarUpload?: (file: File) => Promise<void>;
  isUploadingAvatar?: boolean;
}

const PLAN_DISPLAY: Record<string, { label: string; icon: React.ElementType; color: string; gradient: string }> = {
  free: { label: 'Free', icon: Zap, color: '#6B7280', gradient: 'linear-gradient(135deg, #374151, #4B5563)' },
  starter: { label: 'Starter', icon: Sparkles, color: '#3B82F6', gradient: 'linear-gradient(135deg, #1D4ED8, #3B82F6)' },
  pro: { label: 'Pro', icon: Crown, color: '#8B5CF6', gradient: 'linear-gradient(135deg, #6D28D9, #A78BFA)' },
};

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  activeSection,
  onSectionChange,
  onAvatarUpload,
  isUploadingAvatar
}) => {
  const { user, signOut } = useAuthStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const planKey = user?.plan_type || 'free';
  const planInfo = PLAN_DISPLAY[planKey] || PLAN_DISPLAY.free;
  const PlanIcon = planInfo.icon;

  const menuItems = [
    { id: 'profile', label: 'Profile', icon: LucideUser, color: '#3B82F6' },
    { id: 'keys', label: 'API Keys', icon: Key, color: '#8B5CF6' },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard, color: '#10B981' },
    { id: 'security', label: 'Security', icon: Shield, color: '#F59E0B' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: '#EC4899' },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <Link
          to="/dashboard"
          className={styles.backLink}
          onClick={() => {
            if (window.innerWidth <= 768) {
              setIsCollapsed(true);
            }
          }}
        >
          <div className={styles.backIcon}>
            <ArrowLeft size={16} />
          </div>
          {!isCollapsed && (
            <div className={styles.backText}>
              <span className={styles.backLabel}>Back to</span>
              <span className={styles.backTarget}>Dashboard</span>
            </div>
          )}
        </Link>
      </div>

      <div className={styles.sidebarContent}>
        <div className={styles.navGroup}>
          {!isCollapsed && <div className={styles.groupLabel}>Account Settings</div>}
          <nav className={styles.nav}>
            {menuItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                  onClick={() => {
                    onSectionChange(item.id);
                    if (window.innerWidth <= 768) {
                      setIsCollapsed(true);
                    }
                  }}
                >
                  <div className={styles.iconContainer} style={{
                    color: isActive ? 'white' : item.color,
                    background: isActive ? item.color : `${item.color}15`
                  }}>
                    <item.icon size={18} />
                  </div>
                  {!isCollapsed && (
                    <div className={styles.itemContent}>
                      <span className={styles.itemLabel}>{item.label}</span>
                      <ChevronRight size={14} className={styles.activeArrow} />
                    </div>
                  )}
                  {isActive && !isCollapsed && (
                    <motion.div
                      layoutId="activeGlow"
                      className={styles.activeGlow}
                      style={{ background: item.color }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className={styles.navGroup} style={{ marginTop: 'auto' }}>
          {!isCollapsed && <div className={styles.groupLabel}>Support</div>}
          <nav className={styles.nav}>
            <button
              className={styles.navItem}
              onClick={() => {
                window.open('/help', '_blank');
                if (window.innerWidth <= 768) {
                  setIsCollapsed(true);
                }
              }}
            >
              <div className={styles.iconContainer} style={{ color: '#6366F1', background: '#6366F115' }}>
                <HelpCircle size={18} />
              </div>
              {!isCollapsed && <span className={styles.itemLabel}>Help Center</span>}
            </button>

            <button
              className={styles.navItem}
              onClick={() => {
                window.open('https://github.com/your-repo/issues', '_blank');
                if (window.innerWidth <= 768) {
                  setIsCollapsed(true);
                }
              }}
            >
              <div className={styles.iconContainer} style={{ color: '#10B981', background: '#10B98115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>💡</span>
              </div>
              {!isCollapsed && (
                <div className={styles.itemContent}>
                  <span className={styles.itemLabel}>Feature Request</span>
                  <ChevronRight size={14} className={styles.activeArrow} />
                </div>
              )}
            </button>

            <button
              className={styles.navItem}
              onClick={() => {
                handleSignOut();
                if (window.innerWidth <= 768) {
                  setIsCollapsed(true);
                }
              }}
            >
              <div className={styles.iconContainer} style={{ color: '#EF4444', background: '#EF444415' }}>
                <LogOut size={18} />
              </div>
              {!isCollapsed && <span className={styles.itemLabel}>Sign Out</span>}
            </button>
          </nav>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.userSection}>
          <div className={styles.avatarWrapper}>
            <div className={styles.avatarContainer} onClick={() => !isUploadingAvatar && fileInputRef.current?.click()}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="Profile" className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {(user?.display_name || user?.email || 'U')[0].toUpperCase()}
                </div>
              )}
              {isUploadingAvatar ? (
                <div className={styles.avatarLoadingOverlay}>
                  <RefreshCw size={14} className={styles.spinning} />
                </div>
              ) : (
                <div className={styles.avatarUploadOverlay}>
                  <Camera size={12} />
                </div>
              )}
              <div className={styles.statusDot} />
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className={styles.hiddenInput}
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onAvatarUpload) {
                  onAvatarUpload(file);
                }
              }}
            />
          </div>
          {!isCollapsed && (
            <div className={styles.userMeta}>
              <span className={styles.displayName}>
                {user?.display_name || user?.email?.split('@')[0] || 'User'}
              </span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
          )}
          {!isCollapsed && (
            <div
              className={styles.planBadge}
              style={{ background: planInfo.gradient }}
            >
              <PlanIcon size={11} />
              <span>{planInfo.label}</span>
            </div>
          )}
        </div>
      </div>

      <button
        className={styles.collapseButton}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ChevronLeft size={14} className={styles.collapseIcon} />
      </button>
    </aside>
  );
};

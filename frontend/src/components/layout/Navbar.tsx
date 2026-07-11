import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Mic,
  ImageIcon,
  Video,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Zap,
  ChevronRight,
  ShieldCheck,
  FileText,
  ImagePlus,
  Eraser,
  Sparkles,
  LogIn,
  UserPlus,
  Box,
  Lock
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { useUsageStore } from '../../store/usage.store';
import { useUIStore } from '../../store/ui.store';
import toast from 'react-hot-toast';
import { OAuthBadge } from './OAuthBadge';
import styles from './Navbar.module.css';

export const Navbar: React.FC = () => {
  const { user, signOut, loading: authLoading } = useAuthStore();
  const { status, fetchStatus, loading: usageLoading } = useUsageStore();
  const { toggleSidebar } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);
  const toolsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isChatPage = location.pathname.startsWith('/chat') || location.pathname === '/';
  const isImagesPage = location.pathname.startsWith('/images');
  const isVideoPage = location.pathname.startsWith('/video');
  const isSettingsPage = location.pathname.startsWith('/settings');
  const isPricingPage = location.pathname.startsWith('/pricing');

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const navLinks = [
    { to: '/chat', icon: <MessageSquare size={18} />, label: 'Chat' },
    { to: '/voice', icon: <Mic size={18} />, label: 'Voice' },
    { to: '/images', icon: <ImageIcon size={18} />, label: 'Image' },
    { to: '/video', icon: <Video size={18} />, label: 'Video' },
  ];

  const tools = [
    { label: 'AI Humanizer', icon: <User size={16} />, to: '/tools/humanizer', premium: false },
    { label: 'Prompt Enhancer', icon: <Zap size={16} />, to: '/tools/enhancer', premium: false },
    { label: 'Doc Analyzer', icon: <FileText size={16} />, to: '/tools/analyzer', premium: true },
    { label: 'Image to PDF', icon: <ImagePlus size={16} />, to: '/tools/image-to-pdf', premium: true },
    { label: 'BG Remover', icon: <Eraser size={16} />, to: '/tools/bg-remover', premium: true },
    { label: '2D to 3D Convertor', icon: <Box size={16} />, to: '/tools/3d-converter', premium: true },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    };

    if (isUserMenuOpen || isToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isUserMenuOpen, isToolsOpen]);

  // Close menus on navigation
  useEffect(() => {
    setIsUserMenuOpen(false);
    setIsToolsOpen(false);
  }, [location.pathname]);

  // Compute usage pills — chat page: chat only | voice page: voice only | image page: image only | elsewhere: nothing
  const usagePills = () => {
    const isVoicePage = location.pathname.startsWith('/voice');

    if (usageLoading || !status) {
      if (isChatPage || isVoicePage || isImagesPage || isVideoPage) {
        return (
          <div className={styles.usagePills} onClick={() => { navigate('/settings?tab=billing'); setIsUserMenuOpen(false); }}>
            <div className={styles.usageSkeletonPill}>
              <div className={styles.usageSkeletonHeader}>
                <div className="skeleton" style={{ width: '40px', height: '10px', borderRadius: '3px' }} />
                <div className="skeleton" style={{ width: '30px', height: '10px', borderRadius: '3px' }} />
              </div>
              <div className="skeleton" style={{ width: '100%', height: '6px', borderRadius: '3px', marginTop: '6px' }} />
            </div>
          </div>
        );
      }
      return null;
    }

    if (!status?.usage) return null;

    const buildPill = (tool: string, data: any, colorClass: string) => {
      if (!data?.daily) return null;
      const { used, limit } = data.daily;
      const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      const isWarning = pct > 80;
      return (
        <div key={tool} className={`${styles.usagePill} ${isWarning ? styles.pillWarning : ''}`}>
          <div className={styles.usagePillHeader}>
            <span className={styles.pillLabel}>{tool}</span>
            <span className={styles.pillCount}>{used}/{limit ?? '∞'}</span>
          </div>
          <div className={styles.pillBar}>
            <div className={`${styles.pillFill} ${colorClass}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    };

    if (isChatPage) {
      const chatData = status.profileUsage?.chat || status.usage?.chat;
      return (
        <div className={styles.usagePills} onClick={() => { if (user) { navigate('/settings?tab=billing'); setIsUserMenuOpen(false); } }}>
          {buildPill('Chat', chatData, styles.chatFill)}
        </div>
      );
    }

    if (isVoicePage) {
      const voiceData = status.profileUsage?.voice || status.usage?.voice;
      return (
        <div className={styles.usagePills} onClick={() => { if (user) { navigate('/settings?tab=billing'); setIsUserMenuOpen(false); } }}>
          {buildPill('Voice', voiceData, styles.voiceFill)}
        </div>
      );
    }

    if (isImagesPage) {
      const imageData = status.profileUsage?.image || status.usage?.image;
      return (
        <div className={`${styles.usagePills} ${styles.imagePagePills}`} onClick={() => { if (user) { navigate('/settings?tab=billing'); setIsUserMenuOpen(false); } }}>
          {buildPill('Image', imageData, styles.imageFill)}
        </div>
      );
    }

    if (isVideoPage) {
      const videoData = (status.profileUsage as any)?.video || (status.usage as any)?.video;
      return (
        <div className={`${styles.usagePills} ${styles.videoPagePills}`} onClick={() => { if (user) { navigate('/settings?tab=billing'); setIsUserMenuOpen(false); } }}>
          {buildPill('Video', videoData, styles.videoFill)}
        </div>
      );
    }

    // All other pages — no pills
    return null;
  };

  // Usage summary for dropdown
  const renderDropdownUsage = () => {
    if (!status?.usage) return null;
    const displayUsage: any = status.profileUsage || {
      chat: status.usage?.chat,
      voice: status.usage?.voice,
      image: status.usage?.image,
      video: (status.usage as any)?.video,
    };

    const renderRow = (tool: string, data: any, colorClass: string) => {
      if (!data?.daily) return null;
      const { used, limit } = data.daily;
      const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      const remaining = Math.max(0, (limit ?? 0) - used);
      return (
        <div key={tool} className={styles.dropUsageRow}>
          <span className={styles.dropUsageLabel}>{tool}</span>
          <div className={styles.dropUsageBar}>
            <div className={`${styles.dropUsageFill} ${colorClass}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.dropUsageCount}>{parseFloat(remaining.toFixed(1))} left</span>
        </div>
      );
    };

    return (
      <div className={styles.dropUsageBlock}>
        <div className={styles.dropUsageHeader}>
          <span>Usage</span>
          <span className={styles.tierPill}>{status.tier?.toUpperCase() || 'FREE'}</span>
        </div>
        {renderRow('Chat', displayUsage.chat, styles.chatFill)}
        {renderRow('Voice', displayUsage.voice, styles.voiceFill)}
        {status.tier?.toLowerCase() !== 'anonymous' && renderRow('Image', displayUsage.image, styles.imageFill)}
        {status.tier?.toLowerCase() !== 'anonymous' && renderRow('Video', displayUsage.video || (status.usage as any)?.video, styles.videoFill)}
        {status.resets_in_seconds !== undefined && (
          <p className={styles.dropReset}>
            Resets in {(() => {
              const s = Number(status.resets_in_seconds);
              if (isNaN(s) || s <= 0) return 'tomorrow';
              if (s < 60) return `${s}s`;
              const m = Math.ceil(s / 60);
              if (m < 60) return `${m}m`;
              return `${Math.ceil(m / 60)}h`;
            })()}
          </p>
        )}
      </div>
    );
  };

  // Profile display name & plan
  const displayName = user
    ? (user.display_name || user.email?.split('@')[0] || 'User')
    : null;
  const planLabel = user
    ? (user.plan_type === 'pro' ? 'Pro' : user.plan_type === 'starter' ? 'Starter' : 'Free')
    : null;
  const initials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : null;

  return (
    <nav className={styles.navbar}>
      {/* Left: Logo */}
      <Link to="/" className={styles.logoGroup} onClick={(e) => {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          toggleSidebar();
        }
      }}>
        <img
          src="/Sree-ai-Primary-logo.png"
          alt="Sree AI"
          className={styles.primaryLogo}
        />
        <img
          src="/Sree-Ai-icon-only-Sree-AI-brandmark.png"
          alt="Sree AI logo"
          className={styles.mobileLogo}
        />
      </Link>

      {/* Center: Nav Links */}
      <div className={styles.navGroup}>
        {navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`${styles.navLink} ${location.pathname === link.to || (link.to === '/chat' && location.pathname === '/') ? styles.active : ''}`}
            title={link.label}
          >
            {link.icon}
            <span>{link.label}</span>
          </Link>
        ))}

        <div
          className={styles.dropdownContainer}
          ref={toolsRef}
        >
          <button
            className={styles.navLink}
            onClick={() => setIsToolsOpen(!isToolsOpen)}
          >
            <Sparkles size={18} />
            <span>Tools</span>
            <motion.div
              animate={{ rotate: isToolsOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', alignItems: 'center' }}
              className={styles.navLinkChevron}
            >
              <ChevronDown size={14} />
            </motion.div>
          </button>

          <AnimatePresence>
            {isToolsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={styles.dropdownMenu}
              >
                {tools.map((tool) => {
                  const isLocked = tool.premium && (!user || (user.plan_type !== 'starter' && user.plan_type !== 'pro'));
                  return (
                    <Link
                      key={tool.label}
                      to={isLocked ? '/pricing' : tool.to}
                      className={`${styles.dropdownItem} ${isLocked ? styles.lockedItem : ''}`}
                      onClick={(e) => {
                        if (isLocked) {
                          e.preventDefault();
                          toast.error(`${tool.label} requires a Starter or Pro plan. Redirecting to upgrade...`, { id: 'tool-lock-toast' });
                          navigate('/pricing');
                        }
                      }}
                    >
                      <div className={styles.itemContent}>
                        <div className={styles.itemIcon}>{tool.icon}</div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {tool.label}
                          {isLocked && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                fontWeight: 600
                              }}
                            >
                              PRO
                            </span>
                          )}
                        </span>
                      </div>
                      {isLocked ? (
                        <Lock size={12} className={styles.lockIcon} />
                      ) : (
                        <ChevronRight size={14} className={styles.itemArrow} />
                      )}
                    </Link>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right: Usage Pills + User Section */}
      <div className={styles.rightSection}>
        {/* Usage pills */}
        {usagePills()}

        {/* User menu or Login/Signup */}
        {authLoading ? (
          <div className={`${styles.userSkeletonButton} ${isImagesPage ? styles.showOnImagePage : ''} ${isVideoPage ? styles.showOnImagePage : ''} ${isSettingsPage ? styles.showOnSettingsPage : ''} ${isPricingPage ? styles.showOnPricingPage : ''}`}>
            <div className={`${styles.userSkeletonInfo} ${isSettingsPage ? styles.showSkeletonInfo : ''}`}>
              <div className="skeleton" style={{ width: '60px', height: '10px', borderRadius: '3px' }} />
              <div className="skeleton" style={{ width: '45px', height: '8px', borderRadius: '3px', marginTop: '4px' }} />
            </div>
            <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }} />
          </div>
        ) : user ? (
          <div className={`${styles.userSection} ${isImagesPage ? styles.showOnImagePage : ''} ${isVideoPage ? styles.showOnImagePage : ''} ${isSettingsPage ? styles.showOnSettingsPage : ''} ${isPricingPage ? styles.showOnPricingPage : ''}`} ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={styles.userButton}
            >
              <div className={`${styles.userInfo} ${isSettingsPage ? styles.showUserInfo : ''}`}>
                <span className={styles.userName}>{displayName}</span>
                <span className={`${styles.userPlan} ${styles[(user.plan_type || 'free').toLowerCase()]}`}>
                  {planLabel} Plan
                </span>
              </div>
              <div className={`${styles.userAvatar} ${(!user.avatar_url || avatarError) ? styles.avatarPlaceholder : ''}`}>
                {(user.avatar_url && !avatarError) ? (
                  <img src={user.avatar_url} alt={displayName || 'User'} className={styles.avatarImg} onError={() => setAvatarError(true)} />
                ) : (
                  <User size={16} className={styles.avatarUserIcon} />
                )}
                <OAuthBadge provider={user.provider} size={10} />
              </div>
            </button>
 
            <AnimatePresence>
              {isUserMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className={`${styles.dropdownMenu} ${styles.right}`}
                >
                  {/* User identity */}
                  <div className={styles.menuHeader}>
                    <div className={styles.menuAvatarRow}>
                      <div className={`${styles.menuAvatar} ${(!user.avatar_url || avatarError) ? styles.avatarPlaceholder : ''}`}>
                        {(user.avatar_url && !avatarError) ? (
                           <img src={user.avatar_url} alt={displayName || 'User'} className={styles.avatarImg} onError={() => setAvatarError(true)} />
                        ) : (
                          <User size={20} className={styles.avatarUserIcon} />
                        )}
                        <OAuthBadge provider={user.provider} size={11} />
                      </div>
                      <div>
                        <p className={styles.userEmail}>{user.email}</p>
                        <p className={`${styles.userRole} ${styles[`${(user.plan_type || 'free').toLowerCase()}Role`]}`}>
                          {planLabel} Plan
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Usage in dropdown */}
                  {renderDropdownUsage()}

                  <div className={styles.menuDivider} />

                  <button
                    className={styles.dropdownItem}
                    onClick={() => { navigate('/settings?tab=billing'); setIsUserMenuOpen(false); }}
                  >
                    <div className={styles.itemContent}>
                      <ShieldCheck size={18} />
                      <span>Subscription</span>
                    </div>
                    <ChevronRight size={14} className={styles.itemArrow} />
                  </button>

                  <button
                    className={styles.dropdownItem}
                    onClick={() => { navigate('/settings'); setIsUserMenuOpen(false); }}
                  >
                    <div className={styles.itemContent}>
                      <Settings size={18} />
                      <span>Settings</span>
                    </div>
                    <ChevronRight size={14} className={styles.itemArrow} />
                  </button>

                  <div className={styles.menuDivider} />

                  <button
                    onClick={() => signOut()}
                    className={`${styles.dropdownItem} ${styles.danger}`}
                  >
                    <div className={styles.itemContent}>
                      <LogOut size={18} />
                      <span>Logout</span>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* Not logged in: show Sign Up button only */
          <div className={`${styles.authButtons} ${isImagesPage ? styles.showOnImagePage : ''} ${isVideoPage ? styles.showOnImagePage : ''}`}>
            <Link to="/signup" className={styles.signupBtn}>
              <UserPlus size={16} />
              <span>Sign Up</span>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

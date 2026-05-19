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
  UserPlus
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { useUsageStore } from '../../store/usage.store';
import styles from './Navbar.module.css';

export const Navbar: React.FC = () => {
  const { user, signOut } = useAuthStore();
  const { status, fetchStatus } = useUsageStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isChatPage = location.pathname.startsWith('/chat') || location.pathname === '/';

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
    { label: 'AI Humanizer', icon: <User size={16} />, to: '/tools/humanizer' },
    { label: 'Prompt Enhancer', icon: <Zap size={16} />, to: '/tools/enhancer' },
    { label: 'Doc Analyzer', icon: <FileText size={16} />, to: '/tools/analyzer' },
    { label: 'Image to PDF', icon: <ImagePlus size={16} />, to: '/tools/image-to-pdf' },
    { label: 'BG Remover', icon: <Eraser size={16} />, to: '/tools/bg-remover' },
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

  // Compute usage pills — chat page: chat only | voice page: voice only | elsewhere: nothing
  const usagePills = () => {
    if (!status?.usage) return null;

    const buildPill = (tool: string, data: any, colorClass: string) => {
      if (!data?.daily) return null;
      const { used, limit } = data.daily;
      const remaining = Math.max(0, (limit ?? 0) - used);
      const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      const isWarning = pct > 80;
      return (
        <div key={tool} className={`${styles.usagePill} ${isWarning ? styles.pillWarning : ''}`}>
          <span className={styles.pillLabel}>{tool}</span>
          <div className={styles.pillBar}>
            <div className={`${styles.pillFill} ${colorClass}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.pillCount}>{parseFloat(remaining.toFixed(1))}</span>
        </div>
      );
    };

    const isVoicePage = location.pathname.startsWith('/voice');

    if (isChatPage) {
      const chatData = status.profileUsage?.chat || status.usage?.chat;
      return (
        <div className={styles.usagePills}>
          {buildPill('Chat', chatData, styles.chatFill)}
        </div>
      );
    }

    if (isVoicePage) {
      const voiceData = status.profileUsage?.voice || status.usage?.voice;
      return (
        <div className={styles.usagePills}>
          {buildPill('Voice', voiceData, styles.voiceFill)}
        </div>
      );
    }

    // All other pages — no pills
    return null;
  };

  // Usage summary for dropdown
  const renderDropdownUsage = () => {
    if (!status?.usage) return null;
    const displayUsage = status.profileUsage || {
      chat: status.usage.chat,
      voice: status.usage.voice,
      image: status.usage.image,
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
      <Link to="/" className={styles.logoGroup}>
        <div className={styles.logoBox}>
          <Zap size={20} fill="currentColor" />
        </div>
        <span className={styles.logoText}>Sree AI</span>
      </Link>

      {/* Center: Nav Links */}
      <div className={styles.navGroup}>
        {navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`${styles.navLink} ${location.pathname === link.to || (link.to === '/chat' && location.pathname === '/') ? styles.active : ''}`}
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
            <span>Tools</span>
            <motion.div
              animate={{ rotate: isToolsOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', alignItems: 'center' }}
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
                {tools.map((tool) => (
                  <Link key={tool.label} to={tool.to} className={styles.dropdownItem}>
                    <div className={styles.itemContent}>
                      <div className={styles.itemIcon}>{tool.icon}</div>
                      <span>{tool.label}</span>
                    </div>
                    <ChevronRight size={14} className={styles.itemArrow} />
                  </Link>
                ))}
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
        {user ? (
          <div className={styles.userSection} ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={styles.userButton}
            >
              <div className={styles.userInfo}>
                <span className={styles.userName}>{displayName}</span>
                <span className={styles.userPlan}>{planLabel} Plan</span>
              </div>
              <div className={styles.userAvatar}>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={displayName || 'User'} className={styles.avatarImg} />
                ) : (
                  <span className={styles.avatarInitials}>{initials}</span>
                )}
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
                      <div className={styles.menuAvatar}>
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={displayName || 'User'} className={styles.avatarImg} />
                        ) : (
                          <span className={styles.avatarInitials}>{initials}</span>
                        )}
                      </div>
                      <div>
                        <p className={styles.userEmail}>{user.email}</p>
                        <p className={styles.userRole}>{planLabel} Plan</p>
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
          /* Not logged in: show Login + Signup buttons */
          <div className={styles.authButtons}>
            <Link to="/login" className={styles.loginBtn}>
              <LogIn size={16} />
              <span>Login</span>
            </Link>
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

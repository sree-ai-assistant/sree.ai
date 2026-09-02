import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FileText,
  ShieldCheck,
  Lock,
  Receipt,
  AlertTriangle,
  Cookie,
  Menu,
  X,
  ArrowUp,
  Scale
} from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import styles from './LegalLayout.module.css';

interface LegalLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  lastUpdated?: string;
}

const legalNavLinks = [
  { to: '/terms', label: 'Terms of Service', icon: <FileText size={18} /> },
  { to: '/privacy', label: 'Privacy Policy', icon: <ShieldCheck size={18} /> },
  { to: '/security', label: 'Security & BYOK Policy', icon: <Lock size={18} /> },
  { to: '/refund-policy', label: 'Refund & Cancellation', icon: <Receipt size={18} /> },
  { to: '/acceptable-use', label: 'Acceptable Use Policy', icon: <AlertTriangle size={18} /> },
  { to: '/cookies', label: 'Cookie Policy', icon: <Cookie size={18} /> },
];

export const LegalLayout: React.FC<LegalLayoutProps> = ({
  children,
  title,
  subtitle,
  badge = 'Official Policy',
  lastUpdated = 'August 20, 2026',
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Scroll to top on navigation & close mobile drawer
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileOpen(false);
  }, [location.pathname]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={styles.legalContainer}>
      {/* Top Application Navbar */}
      <Navbar />

      <main className={styles.legalBody}>
        {/* Mobile Navigation Toggle Bar */}
        <div className={styles.mobileBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={18} color="#818cf8" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Legal & Compliance</span>
          </div>
          <button
            className={styles.mobileMenuBtn}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle legal navigation"
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            <span>{mobileOpen ? 'Close Menu' : 'Browse Policies'}</span>
          </button>
        </div>

        {/* Left Documentation Sidebar */}
        <aside className={`${styles.sidebarWrapper} ${mobileOpen ? styles.mobileOpen : ''}`}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <Scale size={18} color="#818cf8" />
              <span className={styles.sidebarTitle}>Legal Center</span>
              <span className={styles.sidebarBadge}>v1.0</span>
            </div>

            {legalNavLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ''}`
                }
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
                {location.pathname === item.to && <span className={styles.activeIndicator} />}
              </NavLink>
            ))}

            <div className={styles.sidebarFooter}>
              <span>Sree AI Technologies</span>
              <span>DPDP Act 2023 & GDPR Compliant</span>
            </div>
          </div>
        </aside>

        {/* Right Content Reader Area */}
        <article className={styles.contentArea}>
          <header className={styles.docHeader}>
            <div className={styles.docMetaRow}>
              <span className={styles.docBadge}>{badge}</span>
              <span className={styles.docTimestamp}>Last Updated: {lastUpdated}</span>
            </div>
            <h1 className={styles.docTitle}>{title}</h1>
            {subtitle && <p className={styles.docSubtitle}>{subtitle}</p>}
          </header>

          <div className={styles.markdownContent}>{children}</div>

          <footer className={styles.contentFooter}>
            <p className={styles.supportNote}>
              Need clarification? Contact our legal team at{' '}
              <a href="mailto:legal@sreeai.qzz.io">legal@sreeai.qzz.io</a>.
            </p>
            <button className={styles.backToTopBtn} onClick={scrollToTop}>
              <ArrowUp size={14} />
              <span>Back to Top</span>
            </button>
          </footer>
        </article>
      </main>
    </div>
  );
};

import React, { useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  ShieldCheck,
  Lock,
  Receipt,
  AlertTriangle,
  Cookie,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  Scale,
  X,
  Sparkles,
  Menu
} from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { useUIStore } from '../store/ui.store';
import styles from './LegalLayout.module.css';

interface LegalLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  lastUpdated?: string;
}

const legalSections = [
  {
    group: 'Core Policies',
    items: [
      { to: '/terms', label: 'Terms of Service', icon: <FileText size={16} />, desc: 'User agreements, quotas, BYOK & liability limits' },
      { to: '/privacy', label: 'Privacy Policy', icon: <ShieldCheck size={16} />, desc: 'DPDP Act 2023, sub-processors & telemetry privacy' },
    ],
  },
  {
    group: 'Security & Billing',
    items: [
      { to: '/security', label: 'Security & BYOK', icon: <Lock size={16} />, desc: 'AES-256-GCM encryption, RLS & cloud risk matrix' },
      { to: '/refund-policy', label: 'Refund & Cancellation', icon: <Receipt size={16} />, desc: 'Subscription cycles, Razorpay refunds & cancellations' },
    ],
  },
  {
    group: 'Compliance & Usage',
    items: [
      { to: '/acceptable-use', label: 'Acceptable Use Policy', icon: <AlertTriangle size={16} />, desc: 'Zero tolerance for CSAM, malware & abuse' },
      { to: '/cookies', label: 'Cookie Policy', icon: <Cookie size={16} />, desc: 'Strictly necessary storage & PostHog telemetry' },
    ],
  },
];

const allPages = [
  { to: '/terms', label: 'Terms of Service', icon: <FileText size={16} />, desc: 'User agreements, quotas & liability limits' },
  { to: '/privacy', label: 'Privacy Policy', icon: <ShieldCheck size={16} />, desc: 'DPDP Act 2023, sub-processors & privacy' },
  { to: '/security', label: 'Security & BYOK', icon: <Lock size={16} />, desc: 'AES-256-GCM encryption & RLS' },
  { to: '/refund-policy', label: 'Refund & Cancellation', icon: <Receipt size={16} />, desc: 'Razorpay refunds & cancellations' },
  { to: '/acceptable-use', label: 'Acceptable Use Policy', icon: <AlertTriangle size={16} />, desc: 'Prohibited behavior & safety' },
  { to: '/cookies', label: 'Cookie Policy', icon: <Cookie size={16} />, desc: 'Essential storage & PostHog tokens' },
];

export const LegalLayout: React.FC<LegalLayoutProps> = ({
  children,
  title,
  subtitle,
  badge = 'Official Policy',
  lastUpdated = 'August 20, 2026',
}) => {
  const location = useLocation();
  const { legalMenuOpen, setLegalMenuOpen, toggleLegalMenu } = useUIStore();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setLegalMenuOpen(false);
  }, [location.pathname, setLegalMenuOpen]);

  // Handle escape key to close top drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && legalMenuOpen) {
        setLegalMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [legalMenuOpen, setLegalMenuOpen]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Compute Next and Prev pages
  const currentIndex = allPages.findIndex((p) => p.to === location.pathname);
  const prevPage = currentIndex > 0 ? allPages[currentIndex - 1] : null;
  const nextPage = currentIndex >= 0 && currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null;

  return (
    <div className={styles.container}>
      {/* Background Decorative Glow */}
      <div className={styles.gridBackground} />

      {/* Top Application Navbar */}
      <Navbar />

      {/* Top Animated Legal Drawer (Triggered by Logo Click or Menu Button) */}
      <AnimatePresence>
        {legalMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.topDrawerOverlay}
            onClick={() => setLegalMenuOpen(false)}
          >
            <motion.div
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className={styles.topDrawer}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.topDrawerHeader}>
                <div className={styles.topDrawerTitleGroup}>
                  <Scale size={20} color="#818cf8" />
                  <div>
                    <h3 className={styles.topDrawerTitle}>Sree AI Legal & Compliance Center</h3>
                    <p className={styles.topDrawerSubtitle}>Select a policy document to navigate</p>
                  </div>
                </div>
                <button
                  className={styles.closeDrawerBtn}
                  onClick={() => setLegalMenuOpen(false)}
                  aria-label="Close legal menu"
                >
                  <X size={16} />
                  <span>Close</span>
                </button>
              </div>

              <div className={styles.drawerGrid}>
                {allPages.map((page) => {
                  const isActive = location.pathname === page.to;
                  return (
                    <Link
                      key={page.to}
                      to={page.to}
                      className={`${styles.drawerCard} ${isActive ? styles.drawerCardActive : ''}`}
                      onClick={() => setLegalMenuOpen(false)}
                    >
                      <div className={styles.drawerCardIcon}>{page.icon}</div>
                      <div className={styles.drawerCardInfo}>
                        <span className={styles.drawerCardTitle}>{page.label}</span>
                        <span className={styles.drawerCardDesc}>{page.desc}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Quick-Navigation Pills (Sticky below Navbar) */}
      <div className={styles.mobileSubnav}>
        <div className={styles.mobileTopRow}>
          <div className={styles.mobileBreadcrumb}>
            <span>Legal</span>
            <ChevronRight size={12} />
            <span className={styles.mobileBreadcrumbCurrent}>{title}</span>
          </div>
          <button
            className={styles.mobileMenuTrigger}
            onClick={toggleLegalMenu}
            aria-label="Toggle legal menu"
          >
            <Menu size={14} />
            <span>All Policies</span>
          </button>
        </div>

        <div className={styles.mobileScrollPills}>
          {allPages.map((page) => (
            <Link
              key={page.to}
              to={page.to}
              className={`${styles.mobilePill} ${location.pathname === page.to ? styles.mobilePillActive : ''}`}
            >
              <span>{page.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Documentation Grid */}
      <div className={styles.layoutWrapper}>
        {/* Left Documentation Sidebar */}
        <aside className={styles.sidebarContainer}>
          <div className={styles.stickySidebar}>
            <div className={styles.sidebarHeader}>
              <Scale size={16} color="#818cf8" />
              <span className={styles.sidebarTitle}>Legal & Compliance</span>
              <span className={styles.badge}>Official</span>
            </div>

            {legalSections.map((sec) => (
              <div key={sec.group} className={styles.navGroup}>
                <span className={styles.navGroupLabel}>{sec.group}</span>
                {sec.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `${styles.navItem} ${isActive ? styles.active : ''}`
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}

            <div className={styles.sidebarFooter}>
              <span>Sree AI Cloud Platform</span>
              <span>DPDP Act 2023 & GDPR Compliant</span>
            </div>
          </div>
        </aside>

        {/* Right Main Content Area */}
        <main className={styles.contentContainer}>
          {/* Breadcrumb */}
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <ChevronRight size={14} />
            <span>Legal Center</span>
            <ChevronRight size={14} />
            <span className={styles.breadcrumbCurrent}>{title}</span>
          </nav>

          {/* Doc Header */}
          <header className={styles.docHeader}>
            <div className={styles.headerMeta}>
              <span className={styles.categoryBadge}>{badge}</span>
              <span className={styles.lastUpdated}>Last Updated: {lastUpdated}</span>
            </div>
            <h1 className={styles.docTitle}>{title}</h1>
            {subtitle && <p className={styles.docSubtitle}>{subtitle}</p>}
          </header>

          {/* Content Body */}
          <article className={styles.prose}>
            {children}
          </article>

          {/* Previous / Next Document Navigation Cards */}
          <div className={styles.bottomNav}>
            {prevPage ? (
              <Link to={prevPage.to} className={styles.navCard}>
                <span className={styles.navCardLabel}>Previous Policy</span>
                <span className={styles.navCardTitle}>
                  <ChevronLeft size={16} />
                  {prevPage.label}
                </span>
              </Link>
            ) : <div />}

            {nextPage && (
              <Link to={nextPage.to} className={`${styles.navCard} ${styles.navCardNext}`}>
                <span className={styles.navCardLabel}>Next Policy</span>
                <span className={styles.navCardTitle}>
                  {nextPage.label}
                  <ChevronRight size={16} />
                </span>
              </Link>
            )}
          </div>

          {/* Footer Note */}
          <footer className={styles.footerNote}>
            <span>
              Have legal questions? Contact our compliance desk at{' '}
              <a href="mailto:legal@sreeai.qzz.io">legal@sreeai.qzz.io</a>
            </span>
            <button className={styles.backToTop} onClick={scrollToTop}>
              <ArrowUp size={13} />
              <span>Back to Top</span>
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
};

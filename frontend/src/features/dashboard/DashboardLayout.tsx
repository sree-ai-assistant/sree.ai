import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import styles from './DashboardLayout.module.css';

import { SettingsModal } from './SettingsModal';
import { UpgradeModal } from '../../components/shared/UpgradeModal';

export const DashboardLayout: React.FC<{ 
  children: React.ReactNode; 
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  setIsCollapsed?: (v: boolean) => void;
  sidebar?: React.ReactNode | ((props: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void; onOpenSettings: () => void }) => React.ReactNode)
}> = ({ children, sidebar, defaultCollapsed = false, isCollapsed: controlledIsCollapsed, setIsCollapsed: controlledSetIsCollapsed }) => {
  const [internalIsCollapsed, setInternalIsCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved !== null ? JSON.parse(saved) : defaultCollapsed;
  });

  React.useEffect(() => {
    if (controlledIsCollapsed === undefined) {
      localStorage.setItem('sidebar_collapsed', JSON.stringify(internalIsCollapsed));
    }
  }, [internalIsCollapsed, controlledIsCollapsed]);

  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalIsCollapsed;
  const setIsCollapsed = controlledSetIsCollapsed !== undefined ? controlledSetIsCollapsed : setInternalIsCollapsed;
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const renderSidebar = () => {
    if (typeof sidebar === 'function') {
      return sidebar({ isCollapsed, setIsCollapsed, onOpenSettings: () => setIsSettingsOpen(true) });
    }
    if (sidebar) return sidebar;
    
    return (
      <Sidebar 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
    );
  };

  return (
    <div className={styles.container}>
      <div className="aurora-bg" />
      
      <Navbar />
      
      <div className={styles.layoutBody}>
        {renderSidebar()}
        
        <main className={`${styles.mainContent} ${isCollapsed ? styles.collapsed : ''}`}>
          {children}
        </main>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <UpgradeModal />
    </div>
  );
};


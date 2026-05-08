import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import styles from './DashboardLayout.module.css';

import { SettingsModal } from './SettingsModal';
import { UpgradeModal } from '../../components/shared/UpgradeModal';

export const DashboardLayout: React.FC<{ 
  children: React.ReactNode; 
  sidebar?: (props: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void; onOpenSettings: () => void }) => React.ReactNode 
}> = ({ children, sidebar }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  return (
    <div className={styles.container}>
      <div className="aurora-bg" />
      
      <Navbar />
      
      <div className={styles.layoutBody}>
        {sidebar ? sidebar({ isCollapsed, setIsCollapsed, onOpenSettings: () => setIsSettingsOpen(true) }) : (
          <Sidebar 
            isCollapsed={isCollapsed} 
            setIsCollapsed={setIsCollapsed} 
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
        
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


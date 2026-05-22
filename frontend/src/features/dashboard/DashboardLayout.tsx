import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import styles from './DashboardLayout.module.css';
import { useUIStore } from '../../store/ui.store';

export const DashboardLayout: React.FC<{ 
  children: React.ReactNode; 
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  setIsCollapsed?: (v: boolean) => void;
  sidebar?: React.ReactNode | ((props: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }) => React.ReactNode)
}> = ({ children, sidebar, defaultCollapsed, isCollapsed, setIsCollapsed }) => {
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  
  // Use prop if provided, otherwise use global store state
  const collapsed = isCollapsed !== undefined ? isCollapsed : sidebarCollapsed;
  
  React.useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setSidebarCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed, setSidebarCollapsed]);

  const onToggle = (val: boolean) => {
    if (setIsCollapsed) {
      setIsCollapsed(val);
    } else {
      setSidebarCollapsed(val);
    }
  };

  const renderSidebar = () => {
    if (typeof sidebar === 'function') {
      return sidebar({ isCollapsed: collapsed, setIsCollapsed: onToggle });
    }
    if (sidebar) return sidebar;
    
    return (
      <Sidebar 
        isCollapsed={collapsed} 
        setIsCollapsed={onToggle} 
      />
    );
  };

  return (
    <div className={styles.container}>
      <div className="aurora-bg" />
      
      <Navbar />
      
      <div className={styles.layoutBody}>
        {renderSidebar()}
        
        {!collapsed && (
          <div 
            className={styles.mobileBackdrop} 
            onClick={() => onToggle(true)}
          />
        )}
        
        <main className={`${styles.mainContent} ${collapsed ? styles.collapsed : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

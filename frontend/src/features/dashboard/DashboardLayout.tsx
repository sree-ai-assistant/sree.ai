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
  sidebar?: React.ReactNode | ((props: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }) => React.ReactNode);
  noSidebar?: boolean;
}> = ({ children, sidebar, defaultCollapsed, isCollapsed, setIsCollapsed, noSidebar }) => {
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  
  // Use prop if provided, otherwise use global store state
  const collapsed = isCollapsed !== undefined ? isCollapsed : sidebarCollapsed;
  
  const onToggle = React.useCallback((val: boolean) => {
    if (setIsCollapsed) {
      setIsCollapsed(val);
    } else {
      setSidebarCollapsed(val);
    }
  }, [setIsCollapsed, setSidebarCollapsed]);

  React.useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setSidebarCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed, setSidebarCollapsed]);

  // Swipe gesture detection to slide open and close the sidebar
  React.useEffect(() => {
    if (noSidebar) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoveX = 0;
    let touchMoveY = 0;
    let isGestureActive = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoveX = touchStartX;
      touchMoveY = touchStartY;
      isGestureActive = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isGestureActive) return;
      touchMoveX = e.touches[0].clientX;
      touchMoveY = e.touches[0].clientY;
    };

    const handleTouchEnd = () => {
      if (!isGestureActive) return;
      isGestureActive = false;

      const diffX = touchMoveX - touchStartX;
      const diffY = touchMoveY - touchStartY;

      // Swipe threshold: at least 80px horizontal movement, under 50px vertical drift
      if (Math.abs(diffX) > 80 && Math.abs(diffY) < 50) {
        if (diffX > 0) {
          // Swipe Right: open sidebar if touch started near the left edge (within 60px)
          if (collapsed && touchStartX < 60) {
            onToggle(false);
          }
        } else {
          // Swipe Left: close sidebar if it is currently open
          if (!collapsed) {
            onToggle(true);
          }
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [collapsed, onToggle, noSidebar]);

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
        {!noSidebar && renderSidebar()}
        
        {!noSidebar && !collapsed && (
          <div 
            className={styles.mobileBackdrop} 
            onClick={() => onToggle(true)}
          />
        )}
        
        <main className={`${styles.mainContent} ${noSidebar ? styles.noSidebar : collapsed ? styles.collapsed : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

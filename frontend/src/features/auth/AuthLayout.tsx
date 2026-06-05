import React from 'react';
import { motion } from 'framer-motion';
import './Auth.css';

export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="auth-container">
      <div className="aura-top" />
      <div className="aura-bottom" />
      <div className="auth-grid" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="auth-card"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '36px' }}>
          <div className="auth-logo">S</div>
          <h1 className="auth-title">Sree AI</h1>
          <p className="auth-subtitle">
            The Pulse of Artificial Intelligence
          </p>
        </div>
        
        {children}
      </motion.div>
      
      <div style={{ position: 'absolute', bottom: '24px', textAlign: 'center', color: '#4b5563', fontSize: '0.75rem', letterSpacing: '0.05em', fontWeight: 500 }}>
        &copy; 2026 Sree AI. Production Grade SaaS.
      </div>
    </div>
  );
};

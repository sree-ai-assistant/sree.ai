import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  MessageSquare,
  ImageIcon,
  Mic,
  Activity,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Cpu,
  Globe,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useAuthStore } from '../store/auth.store.ts';
import { useChatStore } from '../store/chat.store';
import { getOrCreateAnonymousIdentity } from '../lib/fingerprint';
import styles from './Dashboard.module.css';

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactElement;
  trend: string;
  color: string;
}> = ({ title, value, icon, trend, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={styles.statCard}
  >
    <div className={styles.statIcon} style={{ color }}>
      {React.cloneElement(icon as React.ReactElement<{ size: number }>, { size: 48 })}
    </div>
    <div className={styles.statLabel}>{title}</div>
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statTrend}>
      <TrendingUp size={14} /> {trend}
    </div>
  </motion.div>
);

const Dashboard: React.FC = () => {
  const { user, initialized } = useAuthStore();
  const { conversations, fetchConversations, loading } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialized) return;

    const init = async () => {
      if (user?.id) {
        fetchConversations(user.id);
      } else {
        const { anonId } = await getOrCreateAnonymousIdentity();
        fetchConversations(undefined, anonId);
      }
    };
    init();
  }, [user?.id, initialized, fetchConversations]);

  const recentActivities = conversations.slice(0, 4).map(c => ({
    title: c.title,
    time: formatDate(c.updated_at || c.created_at),
    icon: c.type === 'voice' ? <Mic size={18} /> : 
          c.type === 'image' ? <ImageIcon size={18} /> : 
          <MessageSquare size={18} />,
    id: c.id,
    type: c.type
  }));

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  return (
    <DashboardLayout>
      <div className={styles.container}>
        <section className={styles.welcomeSection}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className={styles.title}>
              Welcome, <span className={styles.titleHighlight}>{user ? (user.display_name || user.email?.split('@')[0]) : 'Guest'}</span>
            </h1>
            <p className={styles.subtitle}>
              {user ? 'Your AI infrastructure is operating at peak efficiency.' : 'Experience the next generation of AI infrastructure.'}
            </p>
          </motion.div>
        </section>

        <section className={styles.statsGrid}>
          <StatCard
            title="Processing Power"
            value="2.4 TFLOPS"
            icon={<Zap />}
            trend="+14% vs last week"
            color="var(--primary)"
          />
          <StatCard
            title="Inference Speed"
            value="42ms"
            icon={<Cpu />}
            trend="Ultra-low latency"
            color="var(--success)"
          />
          <StatCard
            title="Global Reach"
            value="18 Nodes"
            icon={<Globe />}
            trend="Active in 6 regions"
            color="var(--accent)"
          />
        </section>

        <div className={styles.mainGrid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Quick Access</h3>
              <Sparkles className="text-primary" size={20} />
            </div>
            <div className={styles.actionGrid}>
              {[
                { title: 'AI Chat', icon: <MessageSquare />, path: '/chat', color: '#3B82F6' },
                { title: 'Image Gen', icon: <ImageIcon />, path: '/images', color: '#8B5CF6' },
                { title: 'Voice AI', icon: <Mic />, path: '/voice', color: '#F59E0B' },
              ].map((action) => (
                <button 
                   key={action.path}
                   className={styles.actionCard}
                   onClick={() => navigate(action.path)}
                >
                  <div className={styles.actionIcon} style={{ background: `${action.color}15`, color: action.color }}>
                    {React.cloneElement(action.icon as React.ReactElement<{ size: number }>, { size: 24 })}
                  </div>
                  <div className={styles.actionTitle}>{action.title}</div>
                  <ArrowRight size={16} className="text-muted" />
                </button>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Recent Activity</h3>
              <Activity className="text-muted" size={20} />
            </div>
            <div className={styles.activityList}>
              {loading && conversations.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Analyzing neural pathways...
                </div>
              ) : recentActivities.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No recent activity found.
                </div>
              ) : recentActivities.map((item) => (
                <div key={item.id} className={styles.activityItem} style={{ cursor: 'pointer' }} onClick={() => {
                  if (item.type === 'voice') {
                    navigate(`/voice/chat/${item.id}`);
                  } else {
                    const route = item.type === 'image' ? 'images' : (item.type || 'chat');
                    navigate(`/${route}/${item.id}`);
                  }
                }}>
                  <div className={styles.activityIcon}>{item.icon}</div>
                  <div className={styles.activityContent}>
                    <div className={styles.activityTitle}>{item.title}</div>
                    <div className={styles.activityTime}>{item.time}</div>
                  </div>
                  <Clock size={12} className="text-muted" style={{ marginLeft: 'auto', opacity: 0.5 }} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

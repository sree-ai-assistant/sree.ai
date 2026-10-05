import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  ImageIcon,
  Mic,
  Video,
  Sparkles,
  Zap,
  Cpu,
  Clock,
  ArrowRight,
  ArrowUpRight,
  Search,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Wand2,
  FileSearch,
  Box,
  TrendingUp,
  Layers,
  ChevronRight,
  User,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useAuthStore } from '../store/auth.store';
import { useChatStore } from '../store/chat.store';
import { useUsageStore, type UsageStatus } from '../store/usage.store';
import { useModelStore } from '../store/model.store';
import { useUIStore } from '../store/ui.store';
import { useImageStore } from '../store/image.store';
import { useVideoStore } from '../store/video.store';
import { getOrCreateAnonymousIdentity } from '../lib/fingerprint';

// shadcn/ui primitives
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Skeleton } from '../components/ui/skeleton';
import { getAnonymousAvatarUrl, getLoggedInDefaultAvatarUrl } from '../utils/avatar';

import styles from './Dashboard.module.css';

// Helper to calculate countdown to UTC Midnight
function getUtcMidnightCountdown(resetsInSeconds?: number): string {
  if (resetsInSeconds && resetsInSeconds > 0) {
    const h = Math.floor(resetsInSeconds / 3600);
    const m = Math.floor((resetsInSeconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const now = new Date();
  const nextUtcMidnight = new Date();
  nextUtcMidnight.setUTCHours(24, 0, 0, 0);
  const diffMs = nextUtcMidnight.getTime() - now.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return `${h}h ${m}m`;
}

// Relative time formatter
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Just now';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recent';
  }
}

// Clean leading commas and punctuation from prompts
function cleanPromptTitle(prompt?: string): string {
  if (!prompt) return '';
  return prompt.replace(/^[,.\-;:_\s]+/, '').trim();
}

// Helper to safely extract tool quota metrics
function getToolQuota(
  status: UsageStatus | null,
  tool: 'chat' | 'voice' | 'image' | 'video',
  defaultDailyLimit: number
) {
  const profile = status?.profileUsage?.[tool];
  const direct = status?.usage?.[tool];

  const used = profile?.daily?.used ?? direct?.daily?.used ?? 0;
  let limit: number | null = profile?.daily?.limit ?? direct?.daily?.limit ?? null;

  if (limit === null && tool === 'chat' && typeof status?.daily_limit === 'number') {
    limit = status.daily_limit;
  }
  if (limit === null && status?.tier === 'free') {
    limit = defaultDailyLimit;
  }

  const isUnlimited = limit === null || limit <= 0;
  const remaining = isUnlimited || limit === null ? null : Math.max(0, limit - used);
  const percentage = isUnlimited || limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return { used, limit, isUnlimited, remaining, percentage };
}

interface UnifiedActivity {
  id: string;
  title: string;
  type: 'chat' | 'voice' | 'image' | 'video';
  created_at: string;
  url?: string;
  model?: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, initialized } = useAuthStore();
  const { conversations, fetchConversations, loading: conversationsLoading } = useChatStore();
  const { status: usageStatus, fetchStatus, loading: usageLoading } = useUsageStore();
  const { selectedModel, fetchModels } = useModelStore();
  const { openUpgradeModal } = useUIStore();
  const { history: imageHistory, fetchHistory: fetchImageHistory, isFetchingHistory: imageLoading } = useImageStore();
  const { history: videoHistory, fetchHistory: fetchVideoHistory, isFetchingHistory: videoLoading } = useVideoStore();

  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [countdown, setCountdown] = useState<string>(() =>
    getUtcMidnightCountdown(usageStatus?.resets_in_seconds)
  );

  // Initialize all data stores
  useEffect(() => {
    if (!initialized) return;

    const initData = async () => {
      fetchStatus(false);
      fetchModels();
      fetchImageHistory();
      fetchVideoHistory();
      if (user?.id) {
        fetchConversations(user.id);
      } else {
        const { anonId } = await getOrCreateAnonymousIdentity();
        fetchConversations(undefined, anonId);
      }
    };

    initData();
  }, [user?.id, initialized, fetchConversations, fetchStatus, fetchModels, fetchImageHistory, fetchVideoHistory]);

  // Real-time reset countdown timer (ticks every minute)
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getUtcMidnightCountdown(usageStatus?.resets_in_seconds));
    }, 60000);
    return () => clearInterval(timer);
  }, [usageStatus?.resets_in_seconds]);

  // Greeting logic
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const [avatarError, setAvatarError] = useState(false);
  const [anonId, setAnonId] = useState<string | null>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);

  useEffect(() => {
    if (!user?.id) {
      getOrCreateAnonymousIdentity().then(id => {
        if (id?.anonId) setAnonId(id.anonId);
      });
    }
  }, [user?.id]);

  const isGuest = !user || !user.email;
  const userName = user
    ? user.display_name || user.email?.split('@')[0] || 'Member'
    : 'Guest';

  const userTier = (user?.plan_type || usageStatus?.tier || 'free').toUpperCase();
  const isPro = userTier === 'PRO';

  // Today's date string
  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // Live Quota Metrics
  const chatQuota = getToolQuota(usageStatus, 'chat', 20);
  const voiceQuota = getToolQuota(usageStatus, 'voice', 5);
  const imageQuota = getToolQuota(usageStatus, 'image', 10);
  const videoQuota = getToolQuota(usageStatus, 'video', 3);

  // Unified Activities across Chat, Voice, Image, and Video
  const allActivities: UnifiedActivity[] = useMemo(() => {
    const chatItems: UnifiedActivity[] = (conversations || []).map((c) => {
      const rawType = (c.type as string) || 'chat';
      const hasVideos = (c.videos_in_conversation?.length ?? 0) > 0;
      return {
        id: c.id,
        title: cleanPromptTitle(c.title) || 'Untitled Session',
        type: hasVideos ? 'video' : rawType === 'voice' ? 'voice' : 'chat',
        created_at: c.updated_at || c.created_at,
      };
    });

    const imageItems: UnifiedActivity[] = (imageHistory || []).map((img) => ({
      id: img.id,
      title: cleanPromptTitle(img.prompt) || 'Generated Image',
      type: 'image',
      created_at: img.created_at,
      url: img.url,
      model: img.model,
    }));

    const videoItems: UnifiedActivity[] = (videoHistory || []).map((vid) => ({
      id: vid.id,
      title: cleanPromptTitle(vid.prompt) || 'Generated Video',
      type: 'video',
      created_at: vid.created_at,
      url: vid.url || vid.videoUrl,
      model: vid.model,
    }));

    return [...chatItems, ...imageItems, ...videoItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [conversations, imageHistory, videoHistory]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return allActivities
      .filter((item) => {
        const matchesTab = activeTab === 'all' || item.type === activeTab;
        const matchesSearch =
          !searchQuery.trim() ||
          item.title.toLowerCase().includes(searchQuery.toLowerCase().trim());
        return matchesTab && matchesSearch;
      })
      .slice(0, 8);
  }, [allActivities, activeTab, searchQuery]);

  // Recent Visual Media Showcase (Images & Videos)
  const recentVisualMedia = useMemo(() => {
    const images = (imageHistory || []).map((img) => ({
      id: img.id,
      type: 'image' as const,
      url: img.url,
      prompt: cleanPromptTitle(img.prompt) || 'Generated Image',
      model: img.model,
      created_at: img.created_at,
    }));

    const videos = (videoHistory || []).map((vid) => ({
      id: vid.id,
      type: 'video' as const,
      url: vid.url || vid.videoUrl,
      prompt: cleanPromptTitle(vid.prompt) || 'Generated Video Clip',
      model: vid.model,
      created_at: vid.created_at,
    }));

    return [...images, ...videos]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);
  }, [imageHistory, videoHistory]);

  // Navigation handlers
  const handleResumeActivity = (item: { id: string; type?: string }) => {
    const type = item.type || 'chat';
    if (type === 'voice') {
      navigate(`/voice/chat/${item.id}`);
    } else if (type === 'image') {
      navigate('/image');
    } else if (type === 'video') {
      navigate('/video');
    } else {
      navigate(`/chat/${item.id}`);
    }
  };

  return (
    <DashboardLayout defaultCollapsed={true}>
      <div className={styles.container}>
        {/* ============================================================
            1. HERO COMMAND HEADER & QUICK ACTIONS
           ============================================================ */}
        <section className={styles.heroCard}>
          <div className={styles.heroGlow} />

          <div className={styles.heroTopRow}>
            <div className={styles.heroStatusPills}>
              <span className={styles.systemStatus}>
                <span className={styles.statusDot} />
                <span className={styles.statusTextFull}>All Systems Operational</span>
                <span className={styles.statusTextShort}>Operational</span>
              </span>
              <Badge
                variant={
                  isPro
                    ? 'purple'
                    : isGuest
                    ? 'secondary'
                    : 'amber'
                }
                className={styles.heroTierBadge}
              >
                {userTier} PLAN
              </Badge>
            </div>

            <div className={styles.dateDisplay}>
              <Clock size={13} />
              <span>{formattedDate}</span>
            </div>
          </div>

          <div className={styles.heroMain}>
            <div className={styles.heroUserArea}>
              {isGuest ? (
                <div className={styles.guestAvatar}>
                  <img
                    src={getAnonymousAvatarUrl(anonId)}
                    alt="Guest Avatar"
                    className={styles.avatarImg}
                  />
                </div>
              ) : (user?.avatar_url && !avatarError) ? (
                <div className={styles.userAvatar}>
                  <img
                    src={user.avatar_url}
                    alt={userName}
                    className={styles.avatarImg}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                  />
                </div>
              ) : (
                <div className={styles.userAvatar}>
                  <img
                    src={getLoggedInDefaultAvatarUrl(user?.id)}
                    alt={userName}
                    className={styles.avatarImg}
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              <div className={styles.greetingContainer}>
                <h1 className={styles.greetingTitle}>
                  {greeting},{' '}
                  <span className={styles.nameGradient}>{userName}</span>
                </h1>
                <p className={styles.greetingSub}>
                  {user
                    ? `Workspace primed • Active engine: ${
                        selectedModel?.name || 'Groq Compound Mini'
                      }`
                    : 'Ready to create • Multi-modal workspace primed'}
                </p>
              </div>
            </div>

            <div className={styles.quickActionsBar}>
              <Button
                variant="glow"
                size="default"
                onClick={() => navigate('/chat')}
                className="gap-2"
              >
                <MessageSquare size={16} />
                <span>New Chat</span>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => navigate('/image')}
                className="gap-2"
              >
                <ImageIcon size={16} />
                <span>Image Studio</span>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => navigate('/video')}
                className="gap-2"
              >
                <Video size={16} />
                <span>Create Video</span>
              </Button>
            </div>
          </div>
        </section>

        {/* ============================================================
            2. LIVE RESOURCE TELEMETRY & QUOTAS
           ============================================================ */}
        <section>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleGroup}>
              <h2 className={styles.sectionTitle}>Resource Telemetry & Quotas</h2>
              <Badge variant="secondary" className={styles.sectionBadge}>
                LIVE USAGE
              </Badge>
            </div>

            <div className={styles.resetCountdown}>
              <RefreshCw size={13} className="text-neutral-400" />
              <span>
                Daily quotas reset in{' '}
                <span className={styles.countdownValue}>{countdown}</span> (00:00 UTC)
              </span>
            </div>
          </div>

          <div className={styles.quotaGrid}>
            {/* Chat Dialogues Quota */}
            <div className={styles.quotaCard}>
              <div className={styles.quotaTop}>
                <div
                  className={styles.quotaIconBox}
                  style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' }}
                >
                  <MessageSquare size={20} />
                </div>
                <Badge variant={chatQuota.percentage >= 90 ? 'destructive' : 'default'}>
                  {chatQuota.isUnlimited ? 'UNLIMITED' : `${chatQuota.percentage}%`}
                </Badge>
              </div>

              <div className={styles.quotaValueArea}>
                <span className={styles.quotaTitle}>Chat Dialogues</span>
                <div className={styles.quotaNumbers}>
                  <span className={styles.quotaUsed}>{chatQuota.used}</span>
                  <span className={styles.quotaLimit}>
                    {chatQuota.isUnlimited ? '/ ∞ daily' : `/ ${chatQuota.limit} daily`}
                  </span>
                </div>
              </div>

              <div className={styles.quotaFooter}>
                <Progress
                  value={chatQuota.percentage}
                  indicatorClassName={
                    chatQuota.percentage >= 90
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }
                />
                <div className={styles.quotaMeta}>
                  <span>
                    {chatQuota.isUnlimited
                      ? 'Unlimited priority inference'
                      : `${chatQuota.remaining} requests remaining today`}
                  </span>
                </div>
              </div>
            </div>

            {/* Voice AI Quota */}
            <div className={styles.quotaCard}>
              <div className={styles.quotaTop}>
                <div
                  className={styles.quotaIconBox}
                  style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}
                >
                  <Mic size={20} />
                </div>
                <Badge variant={voiceQuota.percentage >= 90 ? 'destructive' : 'amber'}>
                  {voiceQuota.isUnlimited ? 'UNLIMITED' : `${voiceQuota.percentage}%`}
                </Badge>
              </div>

              <div className={styles.quotaValueArea}>
                <span className={styles.quotaTitle}>Voice AI Sessions</span>
                <div className={styles.quotaNumbers}>
                  <span className={styles.quotaUsed}>{voiceQuota.used}</span>
                  <span className={styles.quotaLimit}>
                    {voiceQuota.isUnlimited ? '/ ∞ daily' : `/ ${voiceQuota.limit} daily`}
                  </span>
                </div>
              </div>

              <div className={styles.quotaFooter}>
                <Progress
                  value={voiceQuota.percentage}
                  indicatorClassName={
                    voiceQuota.percentage >= 90
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                  }
                />
                <div className={styles.quotaMeta}>
                  <span>
                    {voiceQuota.isUnlimited
                      ? 'Continuous low-latency voice'
                      : `${voiceQuota.remaining} sessions remaining today`}
                  </span>
                </div>
              </div>
            </div>

            {/* Image Studio Quota */}
            <div className={styles.quotaCard}>
              <div className={styles.quotaTop}>
                <div
                  className={styles.quotaIconBox}
                  style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' }}
                >
                  <ImageIcon size={20} />
                </div>
                <Badge variant={imageQuota.percentage >= 90 ? 'destructive' : 'purple'}>
                  {imageQuota.isUnlimited ? 'UNLIMITED' : `${imageQuota.percentage}%`}
                </Badge>
              </div>

              <div className={styles.quotaValueArea}>
                <span className={styles.quotaTitle}>Image Syntheses</span>
                <div className={styles.quotaNumbers}>
                  <span className={styles.quotaUsed}>{imageQuota.used}</span>
                  <span className={styles.quotaLimit}>
                    {imageQuota.isUnlimited ? '/ ∞ daily' : `/ ${imageQuota.limit} daily`}
                  </span>
                </div>
              </div>

              <div className={styles.quotaFooter}>
                <Progress
                  value={imageQuota.percentage}
                  indicatorClassName={
                    imageQuota.percentage >= 90
                      ? 'bg-red-500'
                      : 'bg-purple-500'
                  }
                />
                <div className={styles.quotaMeta}>
                  <span>
                    {imageQuota.isUnlimited
                      ? 'High-priority 4K generations'
                      : `${imageQuota.remaining} renders remaining today`}
                  </span>
                </div>
              </div>
            </div>

            {/* Video Generations Quota */}
            <div className={styles.quotaCard}>
              <div className={styles.quotaTop}>
                <div
                  className={styles.quotaIconBox}
                  style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#22d3ee' }}
                >
                  <Video size={20} />
                </div>
                <Badge variant={videoQuota.percentage >= 90 ? 'destructive' : 'default'}>
                  {videoQuota.isUnlimited ? 'UNLIMITED' : `${videoQuota.percentage}%`}
                </Badge>
              </div>

              <div className={styles.quotaValueArea}>
                <span className={styles.quotaTitle}>Video Generations</span>
                <div className={styles.quotaNumbers}>
                  <span className={styles.quotaUsed}>{videoQuota.used}</span>
                  <span className={styles.quotaLimit}>
                    {videoQuota.isUnlimited ? '/ ∞ daily' : `/ ${videoQuota.limit} daily`}
                  </span>
                </div>
              </div>

              <div className={styles.quotaFooter}>
                <Progress
                  value={videoQuota.percentage}
                  indicatorClassName={
                    videoQuota.percentage >= 90
                      ? 'bg-red-500'
                      : 'bg-cyan-500'
                  }
                />
                <div className={styles.quotaMeta}>
                  <span>
                    {videoQuota.isUnlimited
                      ? 'Cinematic motion generation'
                      : `${videoQuota.remaining} videos remaining today`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Upgrade Banner for Non-Pro Users with fixed top margin and obsidian styling */}
          {!isPro && (
            <div className={styles.upgradeBanner}>
              <div className={styles.upgradeBannerText}>
                <div className={styles.upgradeBannerIcon}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h4 className={styles.upgradeBannerTitle}>
                    Elevate your capacity with Sree AI Pro
                  </h4>
                  <p className={styles.upgradeBannerDesc}>
                    Unlock frontier models, priority GPU video rendering, 4K image upscaling,
                    and elevated daily limits.
                  </p>
                </div>
              </div>
              <Button
                variant="glow"
                size="sm"
                onClick={() => openUpgradeModal('pro')}
                className="shrink-0"
              >
                Upgrade to Pro
              </Button>
            </div>
          )}
        </section>

        {/* ============================================================
            3. ACTIVE AI FOUNDATION ENGINE STATUS
           ============================================================ */}
        <section className={styles.engineCard}>
          <div className={styles.engineLeft}>
            <div className={styles.engineIconWrapper}>
              <Cpu size={24} />
            </div>

            <div className={styles.engineDetails}>
              <div className={styles.engineTitleRow}>
                <span className={styles.engineName}>
                  {selectedModel?.name || 'Groq Compound Mini'}
                </span>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30">
                  ACTIVE ENGINE
                </Badge>
                {selectedModel?.is_vision && (
                  <Badge variant="success">Vision Enabled</Badge>
                )}
              </div>

              <div className={styles.engineSub}>
                <span className={styles.engineSpecItem}>
                  <Layers size={13} className="text-neutral-400" />
                  <span>Provider: {selectedModel?.provider || 'Groq'}</span>
                </span>
                <span>•</span>
                <span className={styles.engineSpecItem}>
                  <Zap size={13} className="text-neutral-400" />
                  <span>
                    {selectedModel?.is_fast
                      ? 'Ultra-low Latency (<100ms)'
                      : 'Deep Reasoning Engine'}
                  </span>
                </span>
                <span>•</span>
                <span className={styles.engineSpecItem}>
                  <Box size={13} className="text-neutral-400" />
                  <span>
                    {selectedModel?.context_window
                      ? `${Math.round(selectedModel.context_window / 1024)}k Context`
                      : '128k Context'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.engineRight}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/settings')}
              className="gap-2"
            >
              <SlidersHorizontal size={14} />
              <span>Switch Model</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/chat')}
              className="gap-2"
            >
              <span>Launch Studio</span>
              <ArrowRight size={14} />
            </Button>
          </div>
        </section>

        {/* ============================================================
            4. TWO-COLUMN SPLIT: CREATIVE STUDIOS & ACTIVITY HUB
           ============================================================ */}
        <div className={styles.splitGrid}>
          {/* Left Column: Creative Studios & Micro-Tools */}
          <div className={styles.leftColumn}>
            {/* Multi-Modal Studios Grid */}
            <div className={styles.studiosSection}>
              <div className={styles.studiosHeader}>
                <div className={styles.sectionTitleGroup}>
                  <h3 className={styles.sectionTitle}>Multi-Modal Studios</h3>
                  <Badge variant="secondary">CORE SUITE</Badge>
                </div>
              </div>

              <div className={styles.studiosGrid}>
                {/* 1. Chat Studio */}
                <div
                  className={styles.studioCard}
                  onClick={() => navigate('/chat')}
                >
                  <div className={styles.studioTop}>
                    <div
                      className={styles.studioIconBox}
                      style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' }}
                    >
                      <MessageSquare size={18} />
                    </div>
                    <div className={styles.studioArrow}>
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                  <div className={styles.studioBody}>
                    <h4 className={styles.studioTitle}>AI Dialogue & Code</h4>
                    <p className={styles.studioDesc}>
                      Frontier reasoning, syntax-highlighted code execution, and live web research synthesis.
                    </p>
                  </div>
                </div>

                {/* 2. Voice Studio */}
                <div
                  className={styles.studioCard}
                  onClick={() => navigate('/voice')}
                >
                  <div className={styles.studioTop}>
                    <div
                      className={styles.studioIconBox}
                      style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}
                    >
                      <Mic size={18} />
                    </div>
                    <div className={styles.studioArrow}>
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                  <div className={styles.studioBody}>
                    <h4 className={styles.studioTitle}>Realtime Voice Agent</h4>
                    <p className={styles.studioDesc}>
                      Bidirectional spoken conversation with natural inflections and sub-second streaming audio.
                    </p>
                  </div>
                </div>

                {/* 3. Image Studio */}
                <div
                  className={styles.studioCard}
                  onClick={() => navigate('/image')}
                >
                  <div className={styles.studioTop}>
                    <div
                      className={styles.studioIconBox}
                      style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' }}
                    >
                      <ImageIcon size={18} />
                    </div>
                    <div className={styles.studioArrow}>
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                  <div className={styles.studioBody}>
                    <h4 className={styles.studioTitle}>Image Studio</h4>
                    <p className={styles.studioDesc}>
                      Photorealistic visual generation, artistic style presets, 4K rendering, and aspect ratio controls.
                    </p>
                  </div>
                </div>

                {/* 4. Video Studio */}
                <div
                  className={styles.studioCard}
                  onClick={() => navigate('/video')}
                >
                  <div className={styles.studioTop}>
                    <div
                      className={styles.studioIconBox}
                      style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#22d3ee' }}
                    >
                      <Video size={18} />
                    </div>
                    <div className={styles.studioArrow}>
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                  <div className={styles.studioBody}>
                    <h4 className={styles.studioTitle}>Video Studio</h4>
                    <p className={styles.studioDesc}>
                      Cinematic text-to-video and image animation synthesis with dynamic camera control.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Creative Micro-Tools Section */}
            <div className={styles.microToolsSection}>
              <div className={styles.studiosHeader}>
                <div className={styles.sectionTitleGroup}>
                  <h3 className={styles.sectionTitle}>Creative Micro-Tools</h3>
                  <Badge variant="outline">SPECIALIZED</Badge>
                </div>
              </div>

              <div className={styles.microToolsGrid}>
                <div
                  className={styles.microToolCard}
                  onClick={() => navigate('/chat?tool=enhancer')}
                >
                  <div
                    className={styles.microToolIcon}
                    style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
                  >
                    <Wand2 size={16} />
                  </div>
                  <div className={styles.microToolInfo}>
                    <div className={styles.microToolHeader}>
                      <span className={styles.microToolTitle}>Prompt Enhancer</span>
                      <Badge variant="purple" className={styles.microToolBadge}>
                        POPULAR
                      </Badge>
                    </div>
                    <span className={styles.microToolDesc}>
                      Refine prompts for maximum accuracy
                    </span>
                  </div>
                </div>

                <div
                  className={styles.microToolCard}
                  onClick={() => navigate('/chat?tool=humanizer')}
                >
                  <div
                    className={styles.microToolIcon}
                    style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}
                  >
                    <Sparkles size={16} />
                  </div>
                  <div className={styles.microToolInfo}>
                    <div className={styles.microToolHeader}>
                      <span className={styles.microToolTitle}>AI Humanizer</span>
                      <Badge variant="success" className={styles.microToolBadge}>
                        STARTER
                      </Badge>
                    </div>
                    <span className={styles.microToolDesc}>
                      Convert synthetic text to natural prose
                    </span>
                  </div>
                </div>

                <div
                  className={styles.microToolCard}
                  onClick={() => navigate('/chat?tool=analyzer')}
                >
                  <div
                    className={styles.microToolIcon}
                    style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}
                  >
                    <FileSearch size={16} />
                  </div>
                  <div className={styles.microToolInfo}>
                    <div className={styles.microToolHeader}>
                      <span className={styles.microToolTitle}>Doc Analyzer</span>
                      <Badge variant="default" className={styles.microToolBadge}>
                        NEW
                      </Badge>
                    </div>
                    <span className={styles.microToolDesc}>
                      Extract data & citations from files
                    </span>
                  </div>
                </div>

                <div
                  className={styles.microToolCard}
                  onClick={() => navigate('/image?tab=3d')}
                >
                  <div
                    className={styles.microToolIcon}
                    style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}
                  >
                    <Box size={16} />
                  </div>
                  <div className={styles.microToolInfo}>
                    <div className={styles.microToolHeader}>
                      <span className={styles.microToolTitle}>2D to 3D Concept</span>
                      <Badge variant="purple" className={styles.microToolBadge}>
                        PRO
                      </Badge>
                    </div>
                    <span className={styles.microToolDesc}>
                      Turn flat sketches into spatial concepts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Recent Activity Hub */}
          <div className={styles.rightColumn}>
            <div className={styles.studiosHeader}>
              <div className={styles.sectionTitleGroup}>
                <h3 className={styles.sectionTitle}>Recent Activity</h3>
                <Badge variant="secondary">{allActivities.length}</Badge>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/chat')}
                className="gap-1.5 text-xs"
              >
                <span>View All</span>
                <ChevronRight size={14} />
              </Button>
            </div>

            <div className={styles.activityPanel}>
              {/* Title Search Input */}
              <div className={styles.activitySearchBox}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search recent activity by title or prompt..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              {/* Filter Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.activityTabs}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="voice">Voice</TabsTrigger>
                  <TabsTrigger value="image">Image</TabsTrigger>
                  <TabsTrigger value="video">Video</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className={styles.activityTabsContent}>
                <div className={styles.activityList}>
                  {conversationsLoading && allActivities.length === 0 ? (
                    <div className="space-y-2 p-2">
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </div>
                  ) : filteredActivities.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateIcon}>
                        <MessageSquare size={22} />
                      </div>
                      <span className={styles.emptyStateTitle}>
                        {searchQuery ? 'No matching activity' : 'No activity yet'}
                      </span>
                      <p className={styles.emptyStateSub}>
                        {searchQuery
                          ? `No sessions matched "${searchQuery}". Try a different keyword.`
                          : activeTab === 'image'
                          ? 'No image generations yet. Synthesize visuals in Image Studio.'
                          : activeTab === 'video'
                          ? 'No video generations yet. Create animations in Video Studio.'
                          : 'Launch a chat session or generate visuals to start building your activity trail.'}
                      </p>
                      {searchQuery ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSearchQuery('')}
                          className="mt-2 text-xs"
                        >
                          Clear Search
                        </Button>
                      ) : activeTab === 'image' ? (
                        <Button
                          variant="glow"
                          size="sm"
                          onClick={() => navigate('/image')}
                          className="mt-2 text-xs"
                        >
                          Open Image Studio
                        </Button>
                      ) : activeTab === 'video' ? (
                        <Button
                          variant="glow"
                          size="sm"
                          onClick={() => navigate('/video')}
                          className="mt-2 text-xs"
                        >
                          Open Video Studio
                        </Button>
                      ) : (
                        <Button
                          variant="glow"
                          size="sm"
                          onClick={() => navigate('/chat')}
                          className="mt-2 text-xs"
                        >
                          Start New Chat
                        </Button>
                      )}
                    </div>
                  ) : (
                    filteredActivities.map((c) => {
                      const isVoice = c.type === 'voice';
                      const isImage = c.type === 'image';
                      const isVideo = c.type === 'video';

                      const icon = isVoice ? (
                        <Mic size={16} />
                      ) : isImage ? (
                        <ImageIcon size={16} />
                      ) : isVideo ? (
                        <Video size={16} />
                      ) : (
                        <MessageSquare size={16} />
                      );

                      const iconBg = isVoice
                        ? 'rgba(245, 158, 11, 0.15)'
                        : isImage
                        ? 'rgba(168, 85, 247, 0.15)'
                        : isVideo
                        ? 'rgba(6, 182, 212, 0.15)'
                        : 'rgba(59, 130, 246, 0.15)';

                      const iconColor = isVoice
                        ? '#fbbf24'
                        : isImage
                        ? '#c084fc'
                        : isVideo
                        ? '#22d3ee'
                        : '#60a5fa';

                      return (
                        <div
                          key={`${c.type}-${c.id}`}
                          className={styles.activityItem}
                          onClick={() => handleResumeActivity(c)}
                          title={c.title}
                        >
                          {c.url && isImage ? (
                            <img
                              src={c.url}
                              alt=""
                              className={styles.activityThumbnail}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={styles.activityIconBox}
                              style={{ background: iconBg, color: iconColor }}
                            >
                              {icon}
                            </div>
                          )}

                          <div className={styles.activityContent}>
                            <div className={styles.activityTitleRow}>
                              <span className={styles.activityTitle} title={c.title}>
                                {c.title || 'Untitled Session'}
                              </span>
                            </div>
                            <div className={styles.activityMetaRow}>
                              <span className="capitalize">{c.type}</span>
                              <span>•</span>
                              <span>
                                {formatRelativeTime(c.created_at)}
                              </span>
                              {c.model && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{c.model.split('/').pop()?.split('-')[0]}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <ArrowRight size={14} className={styles.activityArrow} />
                        </div>
                      );
                    })
                  )}
                </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        {/* ============================================================
            5. RECENT VISUAL GENERATIONS SHOWCASE (IMAGES & VIDEOS)
           ============================================================ */}
        <section className={styles.gallerySection}>
          <div className={styles.galleryHeader}>
            <div className={styles.galleryHeaderLeft}>
              <div className={styles.sectionTitleGroup}>
                <h3 className={styles.sectionTitle}>Recent Visual Creations</h3>
                <Badge variant="purple">STUDIO MEDIA</Badge>
              </div>
              <p className={styles.galleryPrompt} style={{ color: '#737373', fontSize: '0.8125rem', WebkitLineClamp: 1 }}>
                Your latest synthesized images & cinematic video generations
              </p>
            </div>

            <div className={styles.galleryHeaderRight}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/image')}
                className="gap-2 text-xs"
              >
                <ImageIcon size={14} />
                <span>Image Studio</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/video')}
                className="gap-2 text-xs"
              >
                <Video size={14} />
                <span>Video Studio</span>
              </Button>
            </div>
          </div>

          {recentVisualMedia.length === 0 ? (
            <div className={styles.galleryEmpty}>
              <div className={styles.emptyStateIcon}>
                <ImageIcon size={22} />
              </div>
              <span className={styles.emptyStateTitle}>No visual media generated yet</span>
              <p className={styles.emptyStateSub}>
                Launch the Image or Video Studio to synthesize photorealistic visuals, 4K concepts, and cinematic animations.
              </p>
              <div className={styles.galleryEmptyActions}>
                <Button
                  variant="glow"
                  size="sm"
                  onClick={() => navigate('/image')}
                >
                  <ImageIcon size={14} />
                  <span>Generate Image</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/video')}
                >
                  <Video size={14} />
                  <span>Create Video</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.galleryGrid}>
              {recentVisualMedia.map((media) => (
                <div
                  key={`${media.type}-${media.id}`}
                  className={styles.galleryCard}
                  onClick={() => navigate(media.type === 'video' ? '/video' : '/image')}
                  title={media.prompt}
                >
                  {media.type === 'image' ? (
                    <img
                      src={media.url}
                      alt={media.prompt}
                      className={styles.galleryMedia}
                      loading="lazy"
                    />
                  ) : (
                    <>
                      <video
                        src={media.url}
                        className={styles.galleryMedia}
                        preload="metadata"
                        muted
                      />
                      <div className={styles.galleryCardVideoIcon}>
                        <Play size={18} fill="currentColor" />
                      </div>
                    </>
                  )}

                  <div className={styles.galleryOverlay}>
                    <div className="flex items-center justify-between w-full">
                      <span className={styles.galleryCardBadge}>
                        {media.type === 'video' ? 'VIDEO' : 'IMAGE'}
                      </span>
                      {media.model && (
                        <span className={styles.galleryCardBadge} style={{ opacity: 0.85 }}>
                          {media.model.split('/').pop()?.split('-')[0]}
                        </span>
                      )}
                    </div>
                    <p className={styles.galleryPrompt}>{media.prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

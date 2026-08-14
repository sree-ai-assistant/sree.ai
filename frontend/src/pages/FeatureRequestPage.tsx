import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Loader2,
  User,
  Mail,
  Link as LinkIcon,
  HelpCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Zap,
  Flame,
  MessageSquarePlus,
  Compass,
  ListTodo,
  Layers,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../features/dashboard/DashboardLayout';
import { useAuthStore } from '../store/auth.store';
import {
  FeatureCategoryPicker,
  FEATURE_CATEGORIES,
  type CategoryOption
} from '../components/feature-request/FeatureCategoryPicker';
import { FeatureRequestSuccess } from '../components/feature-request/FeatureRequestSuccess';
import { MyFeatureRequests } from '../components/feature-request/MyFeatureRequests';
import {
  submitFeatureRequest,
  getUserFeatureRequests,
  getPublicFeatureRequests,
  getFeatureRequestRateLimitStatus,
  type WebhookSubmissionResult,
  type RateLimitStatus,
  type FeatureRequestItem
} from '../services/featureRequest.service';
import styles from './FeatureRequestPage.module.css';

type PriorityType = 'nice_to_have' | 'helpful' | 'high_impact' | 'critical';
type ActiveTabType = 'submit' | 'my_requests' | 'public_roadmap';

const PRIORITIES: { id: PriorityType; label: string; color: string; desc: string }[] = [
  { id: 'nice_to_have', label: 'Nice to have', color: '#10B981', desc: 'Minor quality of life improvement' },
  { id: 'helpful', label: 'Helpful', color: '#3B82F6', desc: 'Saves time or improves workflow' },
  { id: 'high_impact', label: 'High Impact', color: '#F59E0B', desc: 'Unlocks key new capability' },
  { id: 'critical', label: 'Critical / Blocker', color: '#EF4444', desc: 'Severe blocker or critical need' },
];

export const FeatureRequestPage: React.FC = () => {
  const { user } = useAuthStore();

  // Navigation Tab
  const [activeTab, setActiveTab] = useState<ActiveTabType>('submit');

  // Form State
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>(FEATURE_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PriorityType>('helpful');
  const [description, setDescription] = useState('');
  const [useCase, setUseCase] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');

  // Guest State
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [notifyOnUpdate, setNotifyOnUpdate] = useState(true);

  // Status & Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<WebhookSubmissionResult | null>(null);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus>(getFeatureRequestRateLimitStatus());

  // Requests Data
  const [myRequests, setMyRequests] = useState<FeatureRequestItem[]>([]);
  const [publicRequests, setPublicRequests] = useState<FeatureRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Fetch user requests
  const fetchMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const data = await getUserFeatureRequests();
      setMyRequests(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // Fetch public requests
  const fetchPublicRoadmap = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const data = await getPublicFeatureRequests();
      setPublicRequests(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests, user?.id]);

  useEffect(() => {
    if (activeTab === 'public_roadmap') {
      fetchPublicRoadmap();
    } else if (activeTab === 'my_requests') {
      fetchMyRequests();
    }
  }, [activeTab, fetchMyRequests, fetchPublicRoadmap]);

  // Check rate limit state every second
  useEffect(() => {
    const updateRateLimit = () => {
      setRateLimitStatus(getFeatureRequestRateLimitStatus());
    };
    updateRateLimit();
    const interval = setInterval(updateRateLimit, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync default user data when logged in
  useEffect(() => {
    if (user?.email) {
      setGuestEmail(user.email);
      setGuestName(user.display_name || user.email.split('@')[0] || '');
    }
  }, [user]);

  const handleCategorySelect = (cat: CategoryOption) => {
    setSelectedCategory(cat);
  };

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setUseCase('');
    setReferenceUrl('');
    setPriority('helpful');
    setSelectedCategory(FEATURE_CATEGORIES[0]);
    setSubmissionResult(null);
    setRateLimitStatus(getFeatureRequestRateLimitStatus());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || title.trim().length < 4) {
      toast.error('Please enter a descriptive feature title (min 4 characters)');
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      toast.error('Please provide a detailed description (min 10 characters)');
      return;
    }

    const emailToUse = user ? user.email : guestEmail.trim();
    if (!user && (!emailToUse || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse))) {
      toast.error('Please provide a valid email so we can update you');
      return;
    }

    if (referenceUrl.trim()) {
      try {
        new URL(referenceUrl.trim().startsWith('http') ? referenceUrl.trim() : `https://${referenceUrl.trim()}`);
      } catch {
        toast.error('Please enter a valid reference URL or leave it empty');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const result = await submitFeatureRequest({
        title: title.trim(),
        category: selectedCategory.id,
        categoryLabel: selectedCategory.label,
        priority,
        description: description.trim(),
        useCase: useCase.trim() || undefined,
        referenceUrl: referenceUrl.trim() || undefined,
        user: {
          id: user?.id,
          email: emailToUse || undefined,
          name: user ? (user.display_name || user.email?.split('@')[0]) : (guestName.trim() || 'Anonymous Explorer'),
          plan: user?.plan_type || 'free',
          isAuthenticated: !!user,
          notifyOnUpdate,
        },
      });

      setSubmissionResult(result);
      if (result.request) {
        setMyRequests((prev) => [result.request!, ...prev]);
      }
      toast.success('Feature request raised and logged to roadmap!');
    } catch (error: any) {
      console.error('Failed to submit feature request:', error);
      toast.error(error.message || 'Failed to submit feature request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Selected priority item
  const activePriorityObj = PRIORITIES.find((p) => p.id === priority) || PRIORITIES[1];

  return (
    <DashboardLayout>
      <div className={styles.pageContainer}>
        {/* Header */}
        <section className={styles.heroHeader}>
          <div className={styles.heroBadge}>
            <Sparkles size={14} className={styles.sparkleIcon} />
            <span>Community Driven Roadmap</span>
          </div>

          <h1 className={styles.title}>
            Shape the Future of <span className={styles.gradientText}>Sree AI</span>
          </h1>

          <p className={styles.subtitle}>
            Have an idea for a new AI model, a workflow tool, or a speed improvement? Every submission is logged, tracked, and prioritized with live status updates.
          </p>

          {/* Navigation Tabs Bar */}
          <div className={styles.tabsNavContainer}>
            <div className={styles.tabsNav}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'submit' ? styles.tabActive : ''}`}
                onClick={() => {
                  setActiveTab('submit');
                  setSubmissionResult(null);
                }}
              >
                <Sparkles size={16} />
                <span>Submit Idea</span>
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'my_requests' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('my_requests')}
              >
                <ListTodo size={16} />
                <span>My Requests</span>
                {myRequests.length > 0 && (
                  <span className={styles.tabBadge}>{myRequests.length}</span>
                )}
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'public_roadmap' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('public_roadmap')}
              >
                <Layers size={16} />
                <span>Public Roadmap</span>
              </button>
            </div>
          </div>
        </section>

        {/* Tab Views */}
        <AnimatePresence mode="wait">
          {activeTab === 'my_requests' ? (
            <motion.div
              key="my_requests_view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <MyFeatureRequests
                requests={myRequests}
                loading={loadingRequests}
                onRefresh={fetchMyRequests}
                onNewRequestClick={() => setActiveTab('submit')}
              />
            </motion.div>
          ) : activeTab === 'public_roadmap' ? (
            <motion.div
              key="public_roadmap_view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <MyFeatureRequests
                requests={publicRequests}
                loading={loadingRequests}
                onRefresh={fetchPublicRoadmap}
                onNewRequestClick={() => setActiveTab('submit')}
              />
            </motion.div>
          ) : submissionResult ? (
            <FeatureRequestSuccess
              key="success"
              ticketId={submissionResult.ticketId}
              title={title}
              categoryLabel={selectedCategory.label}
              priority={priority}
              userEmail={user?.email || guestEmail}
              onReset={handleReset}
            />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className={styles.layoutGrid}
            >
              {/* Main Form */}
              <form className={styles.formCard} onSubmit={handleSubmit}>
                {/* Category Picker */}
                <FeatureCategoryPicker
                  selectedId={selectedCategory.id}
                  onSelect={handleCategorySelect}
                />

                {/* Feature Title */}
                <div className={styles.fieldGroup}>
                  <div className={styles.labelRow}>
                    <label htmlFor="feature-title" className={styles.fieldLabel}>
                      Feature Title <span className={styles.required}>*</span>
                    </label>
                    <span className={`${styles.charCount} ${title.length > 70 ? styles.limitNear : ''}`}>
                      {title.length}/80
                    </span>
                  </div>
                  <div className={styles.inputWrapper}>
                    <input
                      id="feature-title"
                      type="text"
                      maxLength={80}
                      className={styles.textInput}
                      placeholder="e.g., DeepSeek R1 live reasoning step visualization"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>
                  <p className={styles.fieldHint}>
                    A short, catchy summary of the tool, model, or enhancement you want.
                  </p>
                </div>

                {/* Priority / Impact Selection */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Priority & Impact <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.priorityGrid}>
                    {PRIORITIES.map((p) => {
                      const isActive = priority === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.priorityChip} ${isActive ? styles.active : ''}`}
                          onClick={() => setPriority(p.id)}
                          style={{
                            '--p-color': p.color,
                          } as React.CSSProperties}
                          title={p.desc}
                        >
                          <span
                            className={styles.priorityDot}
                            style={{
                              backgroundColor: p.color,
                              boxShadow: isActive ? `0 0 10px ${p.color}` : 'none',
                            }}
                          />
                          <span className={styles.priorityText}>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Detailed Description */}
                <div className={styles.fieldGroup}>
                  <div className={styles.labelRow}>
                    <label htmlFor="feature-desc" className={styles.fieldLabel}>
                      Description & Expected Behavior <span className={styles.required}>*</span>
                    </label>
                    <span className={styles.charCount}>{description.length} chars</span>
                  </div>
                  <textarea
                    id="feature-desc"
                    className={styles.textarea}
                    placeholder="Describe how this feature should work, why it is useful, and how it solves your problem..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    required
                  />
                  <p className={styles.fieldHint}>
                    Include specific workflows, parameter options, or model expectations.
                  </p>
                </div>

                {/* Use Case (Optional) */}
                <div className={styles.fieldGroup}>
                  <div className={styles.labelRow}>
                    <label htmlFor="feature-usecase" className={styles.fieldLabel}>
                      Real-World Use Case (Optional)
                    </label>
                  </div>
                  <textarea
                    id="feature-usecase"
                    className={styles.textarea}
                    placeholder="e.g. As a developer writing Python scripts, I need to copy code blocks with single-click diff comparison..."
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Reference Link (Optional) */}
                <div className={styles.fieldGroup}>
                  <div className={styles.labelRow}>
                    <label htmlFor="feature-ref" className={styles.fieldLabel}>
                      Reference Link / Figma / Doc (Optional)
                    </label>
                  </div>
                  <div className={styles.inputWrapper}>
                    <LinkIcon size={16} className={styles.inputIcon} />
                    <input
                      id="feature-ref"
                      type="url"
                      className={`${styles.textInput} ${styles.hasIcon}`}
                      placeholder="https://github.com/..., https://figma.com/..., etc."
                      value={referenceUrl}
                      onChange={(e) => setReferenceUrl(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submitter Info Card */}
                <div className={styles.userSection}>
                  {user ? (
                    <div className={styles.userCardLogged}>
                      <div className={styles.userInfoGroup}>
                        <div className={styles.userAvatar}>
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="User" />
                          ) : (
                            <User size={20} />
                          )}
                        </div>
                        <div className={styles.userDetails}>
                          <span className={styles.userName}>
                            {user.display_name || user.email?.split('@')[0]}
                          </span>
                          <span className={styles.userEmail}>{user.email}</span>
                        </div>
                      </div>
                      <span className={`${styles.planBadge} ${styles[user.plan_type || 'free']}`}>
                        {user.plan_type?.toUpperCase() || 'FREE'}
                      </span>
                    </div>
                  ) : (
                    <div className={styles.guestInputsGrid}>
                      <div className={styles.fieldGroup}>
                        <label htmlFor="guest-name" className={styles.fieldLabel}>
                          Your Name
                        </label>
                        <input
                          id="guest-name"
                          type="text"
                          className={styles.textInput}
                          placeholder="Your name or alias"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label htmlFor="guest-email" className={styles.fieldLabel}>
                          Email for Updates <span className={styles.required}>*</span>
                        </label>
                        <input
                          id="guest-email"
                          type="email"
                          className={styles.textInput}
                          placeholder="you@domain.com"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <label className={styles.notifyToggle}>
                    <input
                      type="checkbox"
                      checked={notifyOnUpdate}
                      onChange={(e) => setNotifyOnUpdate(e.target.checked)}
                    />
                    <span>Notify me via email when engineering reviews or ships this feature</span>
                  </label>
                </div>

                {/* Submit Button & Rate Limit Status */}
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !rateLimitStatus.isAllowed ||
                    !title.trim() ||
                    !description.trim()
                  }
                  className={`${styles.submitBtn} ${!rateLimitStatus.isAllowed ? styles.submitBtnCooldown : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className={styles.spinner} />
                      <span>Transmitting to Pipeline...</span>
                    </>
                  ) : !rateLimitStatus.isAllowed ? (
                    <>
                      <Clock size={18} />
                      <span>
                        {rateLimitStatus.reason === 'cooldown'
                          ? `Please wait ${rateLimitStatus.remainingCooldownSeconds}s cooldown...`
                          : `Hourly limit reached (Wait ${Math.ceil(rateLimitStatus.remainingCooldownSeconds / 60)}m)`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      <span>Submit Feature Request</span>
                    </>
                  )}
                </button>

                <div className={styles.submitFooterRow}>
                  <p className={styles.submitHint}>
                    Protected by backend rate limiter & webhook secret.
                  </p>
                  <span className={styles.quotaPill}>
                    {rateLimitStatus.remainingHourlyQuota}/{rateLimitStatus.maxHourlyQuota} requests left this hour
                  </span>
                </div>
              </form>

              {/* Right Sidebar: Live Preview & Benefits */}
              <aside className={styles.previewSidebar}>
                {/* Live Card Preview */}
                <div className={styles.previewCard}>
                  <div className={styles.previewCardHeader}>
                    <span className={styles.previewBadge}>
                      <Compass size={14} />
                      <span>Live Roadmap Preview</span>
                    </span>
                    <span className={styles.previewStatus}>Raised</span>
                  </div>

                  <div className={styles.previewMockCard}>
                    <div className={styles.mockTop}>
                      <span
                        className={styles.mockCatBadge}
                        style={{
                          color: selectedCategory.accentColor,
                          borderColor: `${selectedCategory.accentColor}40`,
                          backgroundColor: `${selectedCategory.accentColor}12`,
                        }}
                      >
                        {selectedCategory.icon}
                        <span>{selectedCategory.label}</span>
                      </span>

                      <span
                        className={styles.mockPriorityBadge}
                        style={{
                          color: activePriorityObj.color,
                          backgroundColor: `${activePriorityObj.color}15`,
                        }}
                      >
                        {activePriorityObj.label}
                      </span>
                    </div>

                    <h3 className={styles.mockTitle}>
                      {title.trim() || 'Your feature title will appear here...'}
                    </h3>

                    <p className={styles.mockDesc}>
                      {description.trim() ||
                        'Detailed description and technical rationale will be reviewed by the product squad and community voters.'}
                    </p>

                    <div className={styles.mockFooter}>
                      <div className={styles.mockUser}>
                        <span className={styles.mockUserDot} />
                        <span>
                          {user ? (user.display_name || user.email?.split('@')[0]) : (guestName || 'Community Member')}
                        </span>
                      </div>
                      <span>Just now</span>
                    </div>
                  </div>
                </div>

                {/* Status Lifecyle Box */}
                <div className={styles.infoBox}>
                  <h4 className={styles.infoTitle}>
                    <ShieldCheck size={18} color="#3B82F6" />
                    <span>Feature Request Lifecycle</span>
                  </h4>
                  <ul className={styles.infoList}>
                    <li className={styles.infoItem}>
                      <span className={styles.statusDotBlue} />
                      <span>
                        <strong>Raised:</strong> Initial submission received, categorized, and assigned tracking ID.
                      </span>
                    </li>
                    <li className={styles.infoItem}>
                      <span className={styles.statusDotAmber} />
                      <span>
                        <strong>In Progress:</strong> Selected by our core team and currently being engineered.
                      </span>
                    </li>
                    <li className={styles.infoItem}>
                      <span className={styles.statusDotGreen} />
                      <span>
                        <strong>Resolved:</strong> Shipped live to production and available in Sree AI.
                      </span>
                    </li>
                    <li className={styles.infoItem}>
                      <span className={styles.statusDotRed} />
                      <span>
                        <strong>Rejected:</strong> Out of scope or unfeasible with explanatory feedback provided.
                      </span>
                    </li>
                  </ul>
                </div>
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

export default FeatureRequestPage;

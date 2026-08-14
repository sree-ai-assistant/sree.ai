import api from '../lib/api';

// Rate limiting constants (Client-side anti-spam UX feedback only — real enforcement is on the backend)
export const RATE_LIMIT_COOLDOWN_SECONDS = 30;
export const RATE_LIMIT_MAX_PER_HOUR = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const STORAGE_KEY_TIMESTAMPS = 'sree_feature_req_timestamps';
const STORAGE_KEY_LAST_SUBMIT = 'sree_feature_req_last_submit';

export type FeatureStatus = 'Raised' | 'In Progress' | 'Resolved' | 'Rejected';

export interface RateLimitStatus {
  isAllowed: boolean;
  remainingCooldownSeconds: number;
  remainingHourlyQuota: number;
  maxHourlyQuota: number;
  reason?: 'cooldown' | 'hourly_limit';
}

export interface FeatureRequestPayload {
  title: string;
  category: string;
  categoryLabel: string;
  priority: 'nice_to_have' | 'helpful' | 'high_impact' | 'critical';
  description: string;
  useCase?: string;
  referenceUrl?: string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    plan?: string;
    isAuthenticated: boolean;
    notifyOnUpdate?: boolean;
  };
}

export interface FeatureRequestItem {
  id: string;
  ticket_id: string;
  user_id?: string | null;
  anon_id?: string | null;
  title: string;
  category: string;
  category_label?: string | null;
  priority: string;
  description: string;
  use_case?: string | null;
  reference_url?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  user_plan?: string;
  status: FeatureStatus;
  admin_notes?: string | null;
  notify_on_update?: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookSubmissionResult {
  success: boolean;
  ticketId: string;
  timestamp: string;
  request?: FeatureRequestItem;
  message?: string;
}

/**
 * Client-side rate limit check (UX feedback only — backend enforces the real limit)
 */
export function getFeatureRequestRateLimitStatus(): RateLimitStatus {
  if (typeof window === 'undefined') {
    return {
      isAllowed: true,
      remainingCooldownSeconds: 0,
      remainingHourlyQuota: RATE_LIMIT_MAX_PER_HOUR,
      maxHourlyQuota: RATE_LIMIT_MAX_PER_HOUR,
    };
  }

  const now = Date.now();

  // 1. Check cooldown (min 30s)
  const lastSubmitStr = localStorage.getItem(STORAGE_KEY_LAST_SUBMIT);
  if (lastSubmitStr) {
    const lastSubmitTime = parseInt(lastSubmitStr, 10);
    const elapsedSeconds = Math.floor((now - lastSubmitTime) / 1000);
    if (elapsedSeconds < RATE_LIMIT_COOLDOWN_SECONDS) {
      const remaining = RATE_LIMIT_COOLDOWN_SECONDS - elapsedSeconds;
      return {
        isAllowed: false,
        remainingCooldownSeconds: remaining,
        remainingHourlyQuota: 0,
        maxHourlyQuota: RATE_LIMIT_MAX_PER_HOUR,
        reason: 'cooldown',
      };
    }
  }

  // 2. Check 1-hour sliding window quota
  let timestamps: number[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIMESTAMPS);
    if (raw) {
      timestamps = JSON.parse(raw).filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    }
  } catch {
    timestamps = [];
  }

  const remainingQuota = Math.max(0, RATE_LIMIT_MAX_PER_HOUR - timestamps.length);

  if (timestamps.length >= RATE_LIMIT_MAX_PER_HOUR) {
    const oldest = timestamps[0];
    const resetSeconds = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return {
      isAllowed: false,
      remainingCooldownSeconds: resetSeconds,
      remainingHourlyQuota: 0,
      maxHourlyQuota: RATE_LIMIT_MAX_PER_HOUR,
      reason: 'hourly_limit',
    };
  }

  return {
    isAllowed: true,
    remainingCooldownSeconds: 0,
    remainingHourlyQuota: remainingQuota,
    maxHourlyQuota: RATE_LIMIT_MAX_PER_HOUR,
  };
}

/**
 * Records a successful submission timestamp for client-side rate limit UX
 */
function recordFeatureRequestSubmission(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  localStorage.setItem(STORAGE_KEY_LAST_SUBMIT, now.toString());

  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIMESTAMPS);
    let timestamps: number[] = raw ? JSON.parse(raw) : [];
    timestamps = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    timestamps.push(now);
    localStorage.setItem(STORAGE_KEY_TIMESTAMPS, JSON.stringify(timestamps));
  } catch {
    localStorage.setItem(STORAGE_KEY_TIMESTAMPS, JSON.stringify([now]));
  }
}

/**
 * Gathers client device / runtime context for triage
 */
function getClientMetadata() {
  if (typeof window === 'undefined') return {};

  return {
    userAgent: navigator.userAgent,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    submittedFromUrl: window.location.href,
    referrer: document.referrer || 'direct',
  };
}

/**
 * Submits the feature request through the backend API.
 * Backend handles: database persistence, rate limiting enforcement, and n8n webhook delivery.
 */
export async function submitFeatureRequest(
  data: FeatureRequestPayload
): Promise<WebhookSubmissionResult> {
  // Client-side rate limit check (UX feedback — backend enforces the real limit)
  const rateLimit = getFeatureRequestRateLimitStatus();
  if (!rateLimit.isAllowed) {
    if (rateLimit.reason === 'cooldown') {
      throw new Error(
        `Rate limit active: Please wait ${rateLimit.remainingCooldownSeconds}s before submitting another feature request.`
      );
    } else {
      const minutes = Math.ceil(rateLimit.remainingCooldownSeconds / 60);
      throw new Error(
        `Hourly limit reached (${RATE_LIMIT_MAX_PER_HOUR} requests/hour). Please try again in ~${minutes} minute(s).`
      );
    }
  }

  try {
    const response = await api.post('/feature-requests', {
      title: data.title.trim(),
      category: data.category,
      categoryLabel: data.categoryLabel,
      priority: data.priority,
      description: data.description.trim(),
      useCase: data.useCase?.trim() || null,
      referenceUrl: data.referenceUrl?.trim() || null,
      userName: data.user?.name,
      userEmail: data.user?.email,
      notifyOnUpdate: data.user?.notifyOnUpdate ?? true,
      clientMetadata: getClientMetadata(),
    });

    recordFeatureRequestSubmission();

    return {
      success: true,
      ticketId: response.data.ticketId,
      timestamp: new Date().toISOString(),
      request: response.data.request,
      message: response.data.message || 'Feature request successfully raised',
    };
  } catch (error: any) {
    // If rate limited by backend, propagate the message directly
    if (error.response?.status === 429) {
      throw new Error(error.response?.data?.message || 'Rate limit exceeded on server.');
    }

    const errorMessage =
      error.response?.data?.message ||
      error.message ||
      'Failed to submit feature request. Please try again.';
    throw new Error(errorMessage);
  }
}

/**
 * Fetches feature requests submitted by the current authenticated user or anonymous session
 */
export async function getUserFeatureRequests(): Promise<FeatureRequestItem[]> {
  try {
    const response = await api.get('/feature-requests/my');
    return response.data?.requests || [];
  } catch (error: any) {
    console.error('[FeatureRequest] Error fetching user requests:', error);
    return [];
  }
}

/**
 * Fetches public community roadmap items
 */
export async function getPublicFeatureRequests(): Promise<FeatureRequestItem[]> {
  try {
    const response = await api.get('/feature-requests/public');
    return response.data?.requests || [];
  } catch (error: any) {
    console.error('[FeatureRequest] Error fetching public roadmap:', error);
    return [];
  }
}

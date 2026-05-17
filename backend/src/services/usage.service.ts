import { supabaseAdmin } from '../lib/supabase';
import { PLAN_CONFIGS as PLANS, BYOK_QUOTA_MULTIPLIER, type PlanTier, type ToolType } from '../config/plans';

/**
 * Identity for rate limiting - can be authenticated user or anonymous ID
 */
export interface RateLimitIdentity {
  type: 'authenticated' | 'anonymous';
  userId?: string;
  anonId?: string;
  tier: PlanTier;
}

/**
 * Result of a rate limit check
 */
export interface RateLimitStatus {
  allowed: boolean;
  reason?: 'minute' | 'daily' | 'monthly' | 'tier' | undefined;
  limit?: number | undefined;
  used?: number | undefined;
  message?: string | undefined;
  resetsIn?: number | undefined; // seconds
}

/**
 * Atomic check and increment for a single tool
 */
export async function checkAndIncrementUsage(
  identity: RateLimitIdentity,
  toolType: ToolType,
  isByok: boolean = false
): Promise<RateLimitStatus> {
  return checkAndIncrementMultiUsage(identity, [{ tool: toolType, amount: 1, isByok }]);
}

/**
 * Atomic check and increment for multiple tools at once.
 * All must be within limits for any to be incremented.
 */
export async function checkAndIncrementMultiUsage(
  identity: RateLimitIdentity,
  requests: { tool: ToolType; amount: number; isByok?: boolean }[]
): Promise<RateLimitStatus> {
  const plan = PLANS[identity.tier] || PLANS.free;
  
  const rpcRequests = requests.map(req => {
    const limits = plan.limits[req.tool];
    const adjustedAmount = req.isByok ? req.amount * BYOK_QUOTA_MULTIPLIER : req.amount;
    return {
      tool_type: req.tool,
      amount: adjustedAmount,
      minute_limit: limits?.perMinute || 0,
      daily_limit: limits?.daily || 0,
      monthly_limit: limits?.monthly || 0,
      is_byok: !!req.isByok
    };
  });

  const { data, error } = await supabaseAdmin.rpc('increment_multi_usage', {
    p_user_id: identity.type === 'authenticated' ? identity.userId : null,
    p_anon_id: identity.type === 'anonymous' ? identity.anonId : null,
    p_requests: rpcRequests
  });

  if (error) {
    console.error('[UsageService] RPC Error:', error);
    return { allowed: true }; // Fail open for reliability
  }

  const results = data as { 
    allowed: boolean; 
    reason?: 'minute' | 'daily' | 'monthly'; 
    limit?: number; 
    used?: number;
    last_reset?: string;
    is_byok?: boolean;
    message?: string;
  }[];

  const result = results[0]; // For single requests, use the first result

  // If any result is not allowed, the whole operation is considered failed for reporting
  const failure = results.find(r => !r.allowed);
  
  if (failure) {
    const reasonMsg = failure.reason 
      ? `(${failure.reason} limit reached: ${failure.limit})`
      : '';
    
    // Calculate resetsIn based on last_reset
    let resetsIn: number | undefined;
    if (failure.last_reset && failure.reason) {
      const lastReset = new Date(failure.last_reset).getTime();
      const now = Date.now();
      const intervals = {
        minute: 60 * 1000,
        daily: 24 * 60 * 60 * 1000,
        monthly: 30 * 24 * 60 * 60 * 1000
      };
      const interval = intervals[failure.reason as 'minute' | 'daily' | 'monthly'];
      resetsIn = Math.max(0, Math.ceil((lastReset + interval - now) / 1000));
    }
    
    return {
      allowed: false,
      reason: failure.reason || 'daily',
      limit: failure.limit,
      used: failure.used,
      resetsIn,
      message: failure.message || `Usage limit reached for one or more requested tools. ${reasonMsg} Please upgrade your plan for more access.`
    };
  }

  return { allowed: true };
}

/**
 * Checks if a user/identity is within their rate limits for a specific tool.
 * (Backward compatibility - now uses checkAndIncrementUsage with 0 amount if needed, 
 * but for now we'll just keep it as a read-only check using the standard select)
 */
export async function checkRateLimit(
  identity: RateLimitIdentity,
  toolType: ToolType,
): Promise<RateLimitStatus> {
  const plan = PLANS[identity.tier] || PLANS.free;
  const limits = plan.limits[toolType];

  if (!limits) return { allowed: true };

  const { data: usage, error } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .eq('tool_type', toolType)
    .or(
      identity.type === 'authenticated'
        ? `user_id.eq.${identity.userId}`
        : `anon_id.eq.${identity.anonId}`
    )
    .maybeSingle();

  if (error || !usage) return { allowed: true };

  const now = new Date();
  const lastMinuteReset = new Date(usage.last_minute_reset);
  const lastDailyReset = new Date(usage.last_daily_reset);
  const lastMonthlyReset = new Date(usage.last_monthly_reset);

  let { minute_count, daily_count, monthly_count } = usage;

  if (now.getTime() - lastMinuteReset.getTime() >= 60000) minute_count = 0;
  if (now.getTime() - lastDailyReset.getTime() >= 86400000) daily_count = 0;
  if (now.getTime() - lastMonthlyReset.getTime() >= 2592000000) monthly_count = 0;

  if (limits.perMinute && minute_count >= limits.perMinute) {
    const resetsIn = Math.max(0, Math.ceil((lastMinuteReset.getTime() + 60 * 1000 - now.getTime()) / 1000));
    return { allowed: false, reason: 'minute', limit: limits.perMinute, used: minute_count, resetsIn };
  }
  if (limits.daily && daily_count >= limits.daily) {
    const resetsIn = Math.max(0, Math.ceil((lastDailyReset.getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 1000));
    return { allowed: false, reason: 'daily', limit: limits.daily, used: daily_count, resetsIn };
  }
  if (limits.monthly && monthly_count >= limits.monthly) {
    const resetsIn = Math.max(0, Math.ceil((lastMonthlyReset.getTime() + 30 * 24 * 60 * 60 * 1000 - now.getTime()) / 1000));
    return { allowed: false, reason: 'monthly', limit: limits.monthly, used: monthly_count, resetsIn };
  }

  return { allowed: true };
}

/**
 * Increments usage for a user/identity.
 * (Backward compatibility - now uses the atomic RPC)
 */
export async function incrementUsage(
  identity: RateLimitIdentity,
  toolType: ToolType,
  isByok: boolean = false
): Promise<void> {
  await checkAndIncrementUsage(identity, toolType, isByok);
}

/**
 * Gets a summary of usage for all tools for an identity.
 */
export async function getUsageStatus(identity: RateLimitIdentity) {
  const plan = PLANS[identity.tier] || PLANS.free;
  
  const { data: usageRecords } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .or(
      identity.type === 'authenticated'
        ? `user_id.eq.${identity.userId}`
        : `anon_id.eq.${identity.anonId}`
    );

  let profileUsage: any = null;
  if (identity.type === 'authenticated') {
    // We don't fetch from profiles since aggregate columns were dropped.
    // Instead we use usageRecords which come from usage_tracking table
    const chatUsage = usageRecords?.find(r => r.tool_type === 'chat');
    const voiceUsage = usageRecords?.find(r => r.tool_type === 'voice');
    const imageUsage = usageRecords?.find(r => r.tool_type === 'image');

    const checkReset = (record: any) => {
      if (!record) return { isDailyReset: true, isMonthlyReset: true };
      const now = new Date();
      return {
        isDailyReset: now.getTime() - new Date(record.last_daily_reset).getTime() >= 86400000,
        isMonthlyReset: now.getTime() - new Date(record.last_monthly_reset).getTime() >= 2592000000
      };
    };

    const chatR = checkReset(chatUsage);
    const voiceR = checkReset(voiceUsage);
    const imageR = checkReset(imageUsage);

    profileUsage = {
      chat: {
        daily: { used: chatR.isDailyReset ? 0 : chatUsage?.daily_count || 0, limit: plan.limits.chat.daily },
        monthly: { used: chatR.isMonthlyReset ? 0 : chatUsage?.monthly_count || 0, limit: plan.limits.chat.monthly }
      },
      voice: {
        daily: { used: voiceR.isDailyReset ? 0 : voiceUsage?.daily_count || 0, limit: plan.limits.voice.daily },
        monthly: { used: voiceR.isMonthlyReset ? 0 : voiceUsage?.monthly_count || 0, limit: plan.limits.voice.monthly }
      },
      image: {
        daily: { used: imageR.isDailyReset ? 0 : imageUsage?.daily_count || 0, limit: plan.limits.image.daily },
        monthly: { used: imageR.isMonthlyReset ? 0 : imageUsage?.monthly_count || 0, limit: plan.limits.image.monthly }
      }
    };
  }

  const summaries: any = {};
  const now = new Date();
  
  for (const [tool, limits] of Object.entries(plan.limits)) {
    const record = usageRecords?.find(r => r.tool_type === tool);
    
    let minuteUsed = record?.minute_count || 0;
    let dailyUsed = record?.daily_count || 0;
    let monthlyUsed = record?.monthly_count || 0;

    if (record) {
      const lastMin = new Date(record.last_minute_reset);
      const lastDay = new Date(record.last_daily_reset);
      const lastMon = new Date(record.last_monthly_reset);

      if (now.getTime() - lastMin.getTime() >= 60000) minuteUsed = 0;
      if (now.getTime() - lastDay.getTime() >= 86400000) dailyUsed = 0;
      if (now.getTime() - lastMon.getTime() >= 2592000000) monthlyUsed = 0;
    }

    summaries[tool] = {
      minute: { used: Number(minuteUsed), limit: (limits as any).perMinute },
      daily: { used: Number(dailyUsed), limit: (limits as any).daily },
      monthly: { used: Number(monthlyUsed), limit: (limits as any).monthly },
      total: { used: record?.total_count || 0, limit: null },
      isByok: !!record?.is_byok
    };
  }

  return {
    tier: identity.tier,
    planName: plan.displayName,
    features: plan.features,
    usage: summaries,
    profileUsage
  };
}

/**
 * Estimate token usage for a given text or array of messages.
 * This is a simple approximation (characters / 4).
 */
export function estimateTokens(input: string | any[]): number {
  if (Array.isArray(input)) {
    // Estimate for messages array
    return input.reduce((acc, msg) => {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : JSON.stringify(msg.content);
      return acc + Math.ceil(content.length / 4) + 4; // Add 4 tokens overhead per message
    }, 0);
  }
  
  return Math.ceil((input || '').length / 4);
}


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
  
  let userLimits: any = null;
  if (identity.type === 'authenticated' && identity.userId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('chat_limit_daily, chat_limit_monthly, voice_limit_daily, voice_limit_monthly, image_limit_daily, image_limit_monthly')
      .eq('id', identity.userId)
      .single();
    if (profile) {
      userLimits = profile;
    }
  }

  const rpcRequests = requests.map(req => {
    const limits = plan.limits[req.tool];
    const adjustedAmount = req.isByok ? req.amount * BYOK_QUOTA_MULTIPLIER : req.amount;
    
    let dailyLimit = limits?.daily || 0;
    let monthlyLimit = limits?.monthly || 0;
    
    if (userLimits) {
      if (req.tool === 'chat') {
        dailyLimit = userLimits.chat_limit_daily ?? dailyLimit;
        monthlyLimit = userLimits.chat_limit_monthly ?? monthlyLimit;
      } else if (req.tool === 'voice') {
        dailyLimit = userLimits.voice_limit_daily ?? dailyLimit;
        monthlyLimit = userLimits.voice_limit_monthly ?? monthlyLimit;
      } else if (req.tool === 'image') {
        dailyLimit = userLimits.image_limit_daily ?? dailyLimit;
        monthlyLimit = userLimits.image_limit_monthly ?? monthlyLimit;
      }
    }

    return {
      tool_type: req.tool,
      amount: adjustedAmount,
      minute_limit: limits?.perMinute || 0,
      daily_limit: dailyLimit,
      monthly_limit: monthlyLimit,
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

  // On success, sync plan limits into profiles so the frontend can read them
  if (identity.type === 'authenticated' && identity.userId) {
    syncProfileLimits(identity.userId, plan).catch(err =>
      console.error('[UsageService] Profile limit sync failed:', err)
    );
  }

  return { allowed: true };
}

/**
 * Fire-and-forget sync of plan limits into profiles table.
 * The RPC already syncs the counts; this ensures the limit columns stay current.
 */
async function syncProfileLimits(userId: string, plan: import('../config/plans').PlanConfig) {
  // To avoid overwriting custom/purchased limits, fetch current profile first
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('chat_limit_daily, chat_limit_monthly, voice_limit_daily, voice_limit_monthly, image_limit_daily, image_limit_monthly')
    .eq('id', userId)
    .single();

  if (!profile) return;

  const updates: any = {};
  
  // Only upgrade limits if profile value is lower than plan default (e.g. on subscription upgrade)
  if ((profile.chat_limit_daily ?? 0) < (plan.limits.chat.daily ?? 0)) updates.chat_limit_daily = plan.limits.chat.daily;
  if ((profile.chat_limit_monthly ?? 0) < (plan.limits.chat.monthly ?? 0)) updates.chat_limit_monthly = plan.limits.chat.monthly;
  if ((profile.voice_limit_daily ?? 0) < (plan.limits.voice.daily ?? 0)) updates.voice_limit_daily = plan.limits.voice.daily;
  if ((profile.voice_limit_monthly ?? 0) < (plan.limits.voice.monthly ?? 0)) updates.voice_limit_monthly = plan.limits.voice.monthly;
  if ((profile.image_limit_daily ?? 0) < (plan.limits.image.daily ?? 0)) updates.image_limit_daily = plan.limits.image.daily;
  if ((profile.image_limit_monthly ?? 0) < (plan.limits.image.monthly ?? 0)) updates.image_limit_monthly = plan.limits.image.monthly;

  // Fetch current usage records to sync counts
  const { data: usageRecords } = await supabaseAdmin
    .from('usage_tracking')
    .select('tool_type, daily_count, monthly_count')
    .eq('user_id', userId);

  const usage = {
    chat: { daily: 0, monthly: 0 },
    voice: { daily: 0, monthly: 0 },
    image: { daily: 0, monthly: 0 }
  };

  if (usageRecords) {
    for (const record of usageRecords) {
      if (usage[record.tool_type as keyof typeof usage]) {
        usage[record.tool_type as keyof typeof usage] = {
          daily: record.daily_count || 0,
          monthly: record.monthly_count || 0
        };
      }
    }
  }

  updates.chat_count_daily = usage.chat.daily;
  updates.chat_count_monthly = usage.chat.monthly;
  updates.voice_count_daily = usage.voice.daily;
  updates.voice_count_monthly = usage.voice.monthly;
  updates.image_count_daily = usage.image.daily;
  updates.image_count_monthly = usage.image.monthly;

  await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);
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

  let dailyLimit = limits.daily || 0;
  let monthlyLimit = limits.monthly || 0;

  if (identity.type === 'authenticated' && identity.userId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('chat_limit_daily, chat_limit_monthly, voice_limit_daily, voice_limit_monthly, image_limit_daily, image_limit_monthly')
      .eq('id', identity.userId)
      .single();
    if (profile) {
      if (toolType === 'chat') {
        dailyLimit = profile.chat_limit_daily ?? dailyLimit;
        monthlyLimit = profile.chat_limit_monthly ?? monthlyLimit;
      } else if (toolType === 'voice') {
        dailyLimit = profile.voice_limit_daily ?? dailyLimit;
        monthlyLimit = profile.voice_limit_monthly ?? monthlyLimit;
      } else if (toolType === 'image') {
        dailyLimit = profile.image_limit_daily ?? dailyLimit;
        monthlyLimit = profile.image_limit_monthly ?? monthlyLimit;
      }
    }
  }

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
  if (dailyLimit && daily_count >= dailyLimit) {
    const resetsIn = Math.max(0, Math.ceil((lastDailyReset.getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 1000));
    return { allowed: false, reason: 'daily', limit: dailyLimit, used: daily_count, resetsIn };
  }
  if (monthlyLimit && monthly_count >= monthlyLimit) {
    const resetsIn = Math.max(0, Math.ceil((lastMonthlyReset.getTime() + 30 * 24 * 60 * 60 * 1000 - now.getTime()) / 1000));
    return { allowed: false, reason: 'monthly', limit: monthlyLimit, used: monthly_count, resetsIn };
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

  let userLimits: any = null;
  if (identity.type === 'authenticated' && identity.userId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('chat_limit_daily, chat_limit_monthly, voice_limit_daily, voice_limit_monthly, image_limit_daily, image_limit_monthly')
      .eq('id', identity.userId)
      .single();
    if (profile) {
      userLimits = profile;
    }
  }

  let profileUsage: any = null;
  if (identity.type === 'authenticated') {
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

    const chatDailyLimit = userLimits?.chat_limit_daily ?? plan.limits.chat.daily;
    const chatMonthlyLimit = userLimits?.chat_limit_monthly ?? plan.limits.chat.monthly;
    const voiceDailyLimit = userLimits?.voice_limit_daily ?? plan.limits.voice.daily;
    const voiceMonthlyLimit = userLimits?.voice_limit_monthly ?? plan.limits.voice.monthly;
    const imageDailyLimit = userLimits?.image_limit_daily ?? plan.limits.image.daily;
    const imageMonthlyLimit = userLimits?.image_limit_monthly ?? plan.limits.image.monthly;

    profileUsage = {
      chat: {
        daily: { used: chatR.isDailyReset ? 0 : chatUsage?.daily_count || 0, limit: chatDailyLimit },
        monthly: { used: chatR.isMonthlyReset ? 0 : chatUsage?.monthly_count || 0, limit: chatMonthlyLimit }
      },
      voice: {
        daily: { used: voiceR.isDailyReset ? 0 : voiceUsage?.daily_count || 0, limit: voiceDailyLimit },
        monthly: { used: voiceR.isMonthlyReset ? 0 : voiceUsage?.monthly_count || 0, limit: voiceMonthlyLimit }
      },
      image: {
        daily: { used: imageR.isDailyReset ? 0 : imageUsage?.daily_count || 0, limit: imageDailyLimit },
        monthly: { used: imageR.isMonthlyReset ? 0 : imageUsage?.monthly_count || 0, limit: imageMonthlyLimit }
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

    let dailyLimit = (limits as any).daily;
    let monthlyLimit = (limits as any).monthly;
    if (userLimits) {
      if (tool === 'chat') {
        dailyLimit = userLimits.chat_limit_daily ?? dailyLimit;
        monthlyLimit = userLimits.chat_limit_monthly ?? monthlyLimit;
      } else if (tool === 'voice') {
        dailyLimit = userLimits.voice_limit_daily ?? dailyLimit;
        monthlyLimit = userLimits.voice_limit_monthly ?? monthlyLimit;
      } else if (tool === 'image') {
        dailyLimit = userLimits.image_limit_daily ?? dailyLimit;
        monthlyLimit = userLimits.image_limit_monthly ?? monthlyLimit;
      }
    }

    summaries[tool] = {
      minute: { used: Number(minuteUsed), limit: (limits as any).perMinute },
      daily: { used: Number(dailyUsed), limit: dailyLimit },
      monthly: { used: Number(monthlyUsed), limit: monthlyLimit },
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


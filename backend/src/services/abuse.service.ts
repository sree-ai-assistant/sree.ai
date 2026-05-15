/**
 * Abuse Detection Service
 * 
 * Core detection logic for identifying abusive patterns:
 * - Rapid request spam (sliding window)
 * - Excessive account creation from same IP/fingerprint
 * - Cookie reset abuse (identity churn)
 * - VPN/datacenter IP flagging
 * 
 * Uses in-memory sliding windows for fast detection and
 * Supabase for persistent flag storage.
 * 
 * References: ABUSE-01 through ABUSE-06
 * Phase 11
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';
import { matchDatacenterIp } from '../config/datacenter-cidrs';

// ─── Types ──────────────────────────────────────────────────────

export type FlagType =
  | 'rapid_requests'
  | 'excessive_accounts'
  | 'cookie_reset'
  | 'vpn_datacenter'
  | 'prompt_spam';

export type EnforcementAction =
  | 'none'
  | 'warning'
  | 'cooldown'
  | 'strict_limits'
  | 'captcha'
  | 'auth_required'
  | 'ip_restricted';

/** Escalation levels map to severity integers in the DB */
const ENFORCEMENT_MAP: Record<number, EnforcementAction> = {
  0: 'none',
  1: 'warning',
  2: 'cooldown',
  3: 'strict_limits',
  4: 'captcha',
  5: 'auth_required',
  6: 'ip_restricted',
};

export interface AbuseFlag {
  id: string;
  anon_id: string | null;
  user_id: string | null;
  fingerprint_hash: string | null;
  ip_hash: string | null;
  flag_type: FlagType;
  severity: number;
  evidence: Record<string, any>;
  created_at: string;
  expires_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  escalation_count: number;
}

export interface AbuseCheckResult {
  flagged: boolean;
  action: EnforcementAction;
  severity: number;
  flags: AbuseFlag[];
  cooldownSeconds?: number;
  message?: string;
}

export interface IdentitySignals {
  anonId?: string | undefined;
  userId?: string | undefined;
  fingerprintHash?: string | undefined;
  ipHash?: string | undefined;
  rawIp?: string | undefined;
  userAgent?: string | undefined;
}

// ─── Configuration ──────────────────────────────────────────────

const CONFIG = {
  /** Max requests per minute before flagging */
  RAPID_REQUEST_THRESHOLD: 30,
  /** Sliding window size in ms (1 minute) */
  RAPID_WINDOW_MS: 60_000,

  /** Max anonymous accounts from same IP in 24h */
  MAX_ACCOUNTS_PER_IP_24H: 5,
  /** Max anonymous accounts from same fingerprint in 24h */
  MAX_ACCOUNTS_PER_FP_24H: 3,

  /** Max cookie resets from same fingerprint in 1h */
  MAX_COOKIE_RESETS_1H: 5,
  /** Cookie reset window in ms (1 hour) */
  COOKIE_RESET_WINDOW_MS: 3_600_000,

  /** Cooldown durations by severity (seconds) */
  COOLDOWN_DURATIONS: {
    1: 0,       // warning — no delay
    2: 30,      // cooldown — 30s
    3: 120,     // strict — 2m
    4: 300,     // captcha — 5m
    5: 600,     // auth required — 10m
    6: 3600,    // ip restricted — 1h
  } as Record<number, number>,

  /** Auto-expire flags after this many hours */
  FLAG_EXPIRY_HOURS: 24,

  /** In-memory window cleanup interval (5 minutes) */
  CLEANUP_INTERVAL_MS: 300_000,
};

// ─── In-Memory Sliding Windows ──────────────────────────────────

/** Map<identityKey, timestamp[]> for rapid request detection */
const requestWindows = new Map<string, number[]>();

/** Map<fingerprintHash, {anonId, timestamp}[]> for cookie reset detection */
const cookieResetWindows = new Map<string, { anonId: string; ts: number }[]>();

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now();
  
  for (const [key, timestamps] of requestWindows) {
    const filtered = timestamps.filter(ts => now - ts < CONFIG.RAPID_WINDOW_MS);
    if (filtered.length === 0) {
      requestWindows.delete(key);
    } else {
      requestWindows.set(key, filtered);
    }
  }

  for (const [key, entries] of cookieResetWindows) {
    const filtered = entries.filter(e => now - e.ts < CONFIG.COOKIE_RESET_WINDOW_MS);
    if (filtered.length === 0) {
      cookieResetWindows.delete(key);
    } else {
      cookieResetWindows.set(key, filtered);
    }
  }
}, CONFIG.CLEANUP_INTERVAL_MS);

// ─── Hash Helper ────────────────────────────────────────────────

export function hashIp(rawIp: string): string {
  return crypto.createHash('sha256').update(rawIp.trim()).digest('hex');
}

// ─── Detection Methods ─────────────────────────────────────────

/**
 * Detect rapid request spam using in-memory sliding window.
 * Returns true if the identity is sending requests too fast.
 */
function detectRapidRequests(identityKey: string): { flagged: boolean; count: number } {
  const now = Date.now();
  const window = requestWindows.get(identityKey) || [];
  
  // Add current request timestamp
  window.push(now);
  
  // Remove timestamps outside the window
  const filtered = window.filter(ts => now - ts < CONFIG.RAPID_WINDOW_MS);
  requestWindows.set(identityKey, filtered);

  return {
    flagged: filtered.length > CONFIG.RAPID_REQUEST_THRESHOLD,
    count: filtered.length,
  };
}

/**
 * Detect excessive anonymous account creation from the same IP/fingerprint.
 * Queries the anonymous_users table.
 */
async function detectExcessiveAccounts(
  ipHash?: string,
  fingerprintHash?: string
): Promise<{ flagged: boolean; ipCount: number; fpCount: number }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let ipCount = 0;
  let fpCount = 0;

  if (ipHash) {
    const { count } = await supabaseAdmin
      .from('anonymous_users')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', twentyFourHoursAgo);

    ipCount = count || 0;
  }

  if (fingerprintHash) {
    const { count } = await supabaseAdmin
      .from('anonymous_users')
      .select('*', { count: 'exact', head: true })
      .eq('fingerprint_hash', fingerprintHash)
      .gte('created_at', twentyFourHoursAgo);

    fpCount = count || 0;
  }

  return {
    flagged: ipCount > CONFIG.MAX_ACCOUNTS_PER_IP_24H || fpCount > CONFIG.MAX_ACCOUNTS_PER_FP_24H,
    ipCount,
    fpCount,
  };
}

/**
 * Detect cookie reset abuse — same fingerprint appearing with multiple
 * different anon_ids in a short window.
 */
function detectCookieReset(
  fingerprintHash: string,
  currentAnonId: string
): { flagged: boolean; uniqueIds: number } {
  const now = Date.now();
  const entries = cookieResetWindows.get(fingerprintHash) || [];

  // Add current identity
  entries.push({ anonId: currentAnonId, ts: now });

  // Remove entries outside the window
  const filtered = entries.filter(e => now - e.ts < CONFIG.COOKIE_RESET_WINDOW_MS);
  cookieResetWindows.set(fingerprintHash, filtered);

  // Count unique anon_ids in the window
  const uniqueIds = new Set(filtered.map(e => e.anonId)).size;

  return {
    flagged: uniqueIds > CONFIG.MAX_COOKIE_RESETS_1H,
    uniqueIds,
  };
}

/**
 * Check if a raw IP belongs to a known datacenter/VPN range.
 */
function detectDatacenterIp(rawIp: string): { flagged: boolean; provider?: string | undefined } {
  const match = matchDatacenterIp(rawIp);
  return {
    flagged: !!match,
    provider: match?.provider,
  };
}

// ─── Flag Management ────────────────────────────────────────────

/**
 * Get all active (unresolved, non-expired) flags for an identity.
 */
async function getActiveFlags(signals: IdentitySignals): Promise<AbuseFlag[]> {
  const now = new Date().toISOString();

  // Build OR conditions for all available identity signals
  let query = supabaseAdmin
    .from('abuse_flags')
    .select('*')
    .is('resolved_at', null);

  // We need to check multiple identity columns — use OR via filter
  const conditions: string[] = [];
  if (signals.anonId) conditions.push(`anon_id.eq.${signals.anonId}`);
  if (signals.userId) conditions.push(`user_id.eq.${signals.userId}`);
  if (signals.fingerprintHash) conditions.push(`fingerprint_hash.eq.${signals.fingerprintHash}`);
  if (signals.ipHash) conditions.push(`ip_hash.eq.${signals.ipHash}`);

  if (conditions.length === 0) return [];

  query = query.or(conditions.join(','));

  // Exclude expired flags
  query = query.or(`expires_at.is.null,expires_at.gt.${now}`);

  const { data, error } = await query.order('severity', { ascending: false });

  if (error) {
    console.error('[AbuseService] Error fetching active flags:', error.message);
    return [];
  }

  return (data as AbuseFlag[]) || [];
}

/**
 * Create or escalate an abuse flag.
 */
async function upsertFlag(
  signals: IdentitySignals,
  flagType: FlagType,
  evidence: Record<string, any>
): Promise<AbuseFlag> {
  // Check for existing active flag of same type
  const existingFlags = await getActiveFlags(signals);
  const existing = existingFlags.find(f => f.flag_type === flagType);

  if (existing) {
    // Escalate severity (max 6)
    const newSeverity = Math.min(existing.severity + 1, 6);
    const expiresAt = new Date(
      Date.now() + CONFIG.FLAG_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin
      .from('abuse_flags')
      .update({
        severity: newSeverity,
        escalation_count: existing.escalation_count + 1,
        evidence: { ...existing.evidence, ...evidence, escalated_at: new Date().toISOString() },
        expires_at: expiresAt,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      console.error('[AbuseService] Error escalating flag:', error.message);
      return existing;
    }

    console.log(`[AbuseService] Escalated ${flagType} flag to severity ${newSeverity} for identity`);
    return data as AbuseFlag;
  }

  // Create new flag at severity 1
  const expiresAt = new Date(
    Date.now() + CONFIG.FLAG_EXPIRY_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from('abuse_flags')
    .insert({
      anon_id: signals.anonId || null,
      user_id: signals.userId || null,
      fingerprint_hash: signals.fingerprintHash || null,
      ip_hash: signals.ipHash || null,
      flag_type: flagType,
      severity: 1,
      evidence,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[AbuseService] Error creating flag:', error.message);
    // Return a synthetic flag to still apply enforcement
    return {
      id: 'synthetic',
      anon_id: signals.anonId || null,
      user_id: signals.userId || null,
      fingerprint_hash: signals.fingerprintHash || null,
      ip_hash: signals.ipHash || null,
      flag_type: flagType,
      severity: 1,
      evidence,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      resolved_at: null,
      resolved_by: null,
      escalation_count: 0,
    };
  }

  console.log(`[AbuseService] Created new ${flagType} flag for identity`);
  return data as AbuseFlag;
}

// ─── Main Detection Pipeline ────────────────────────────────────

/**
 * Run all abuse detection checks for an incoming request.
 * 
 * This is the main entry point called by the abuseDetection middleware.
 * It runs all detectors and returns the highest-severity result.
 */
export async function checkForAbuse(signals: IdentitySignals): Promise<AbuseCheckResult> {
  try {
    const ipHash = signals.rawIp ? hashIp(signals.rawIp) : (signals.ipHash || undefined);
    const fullSignals: IdentitySignals = { ...signals, ipHash };

    // 1. Check existing active flags first (fast path)
    const activeFlags = await getActiveFlags(fullSignals);
    
    // 2. Run in-memory detectors
    const identityKey = signals.fingerprintHash || signals.anonId || ipHash || 'unknown';
    
    const rapidCheck = detectRapidRequests(identityKey);
    if (rapidCheck.flagged) {
      const flag = await upsertFlag(fullSignals, 'rapid_requests', {
        requests_per_minute: rapidCheck.count,
        threshold: CONFIG.RAPID_REQUEST_THRESHOLD,
      });
      activeFlags.push(flag);
    }

    // 3. Cookie reset detection (only if fingerprint + anonId available)
    if (signals.fingerprintHash && signals.anonId) {
      const cookieCheck = detectCookieReset(signals.fingerprintHash, signals.anonId);
      if (cookieCheck.flagged) {
        const flag = await upsertFlag(fullSignals, 'cookie_reset', {
          unique_identities: cookieCheck.uniqueIds,
          threshold: CONFIG.MAX_COOKIE_RESETS_1H,
        });
        activeFlags.push(flag);
      }
    }

    // 4. VPN/datacenter detection (only flag, lower severity)
    if (signals.rawIp) {
      const dcCheck = detectDatacenterIp(signals.rawIp);
      if (dcCheck.flagged) {
        // Only create flag if not already flagged for this
        const existingDcFlag = activeFlags.find(f => f.flag_type === 'vpn_datacenter');
        if (!existingDcFlag) {
          const flag = await upsertFlag(fullSignals, 'vpn_datacenter', {
            provider: dcCheck.provider,
            ip_hash: ipHash,
          });
          activeFlags.push(flag);
        }
      }
    }

    // Note: excessive_accounts detection runs asynchronously in background
    // to avoid adding latency to every request. It's triggered separately
    // during identity resolution in anonymousIdentity middleware.
    
    // 5. Determine highest severity enforcement
    if (activeFlags.length === 0) {
      return { flagged: false, action: 'none', severity: 0, flags: [] };
    }

    const maxSeverity = Math.max(...activeFlags.map(f => f.severity));
    const action = ENFORCEMENT_MAP[maxSeverity] || 'warning';
    const cooldownSeconds = CONFIG.COOLDOWN_DURATIONS[maxSeverity] || 0;

    return {
      flagged: true,
      action,
      severity: maxSeverity,
      flags: activeFlags,
      cooldownSeconds,
      message: getEnforcementMessage(action, cooldownSeconds),
    };
  } catch (error) {
    // Abuse detection must never crash the request pipeline
    console.error('[AbuseService] Unexpected error in checkForAbuse:', error);
    return { flagged: false, action: 'none', severity: 0, flags: [] };
  }
}

/**
 * Check for excessive account creation (called during identity resolution).
 * Separated from main pipeline to avoid adding latency to every request.
 */
export async function checkExcessiveAccounts(signals: IdentitySignals): Promise<void> {
  try {
    const ipHash = signals.rawIp ? hashIp(signals.rawIp) : (signals.ipHash || undefined);
    const result = await detectExcessiveAccounts(ipHash, signals.fingerprintHash);

    if (result.flagged) {
      await upsertFlag(
        { ...signals, ipHash },
        'excessive_accounts',
        {
          accounts_from_ip_24h: result.ipCount,
          accounts_from_fp_24h: result.fpCount,
          ip_threshold: CONFIG.MAX_ACCOUNTS_PER_IP_24H,
          fp_threshold: CONFIG.MAX_ACCOUNTS_PER_FP_24H,
        }
      );
    }
  } catch (error) {
    console.error('[AbuseService] Error checking excessive accounts:', error);
  }
}

/**
 * Resolve (clear) abuse flags for an identity, e.g. when user upgrades to paid plan.
 */
export async function resolveFlags(
  signals: IdentitySignals,
  resolvedBy: 'auto_expire' | 'admin' | 'user_upgrade'
): Promise<number> {
  const conditions: string[] = [];
  if (signals.anonId) conditions.push(`anon_id.eq.${signals.anonId}`);
  if (signals.userId) conditions.push(`user_id.eq.${signals.userId}`);

  if (conditions.length === 0) return 0;

  const { data, error } = await supabaseAdmin
    .from('abuse_flags')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .is('resolved_at', null)
    .or(conditions.join(','))
    .select('id');

  if (error) {
    console.error('[AbuseService] Error resolving flags:', error.message);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[AbuseService] Resolved ${count} flags (${resolvedBy})`);
  }
  return count;
}

// ─── Helpers ────────────────────────────────────────────────────

function getEnforcementMessage(action: EnforcementAction, cooldownSeconds: number): string {
  switch (action) {
    case 'warning':
      return 'Unusual activity detected. Continued abuse may result in temporary restrictions.';
    case 'cooldown':
      return `Too many requests. Please wait ${cooldownSeconds} seconds before trying again.`;
    case 'strict_limits':
      return 'Your access has been temporarily restricted due to unusual activity patterns.';
    case 'captcha':
      return 'Please verify you are human to continue.';
    case 'auth_required':
      return 'Anonymous access has been suspended. Please sign in to continue.';
    case 'ip_restricted':
      return 'Access from this network has been temporarily restricted.';
    default:
      return '';
  }
}

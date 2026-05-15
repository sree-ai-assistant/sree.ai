/**
 * Anonymous Identity Service
 * 
 * Manages the lifecycle of anonymous users:
 * - Create new anonymous identity with fingerprint and IP hashing
 * - Look up existing identity by anon_id
 * - Restore identity when cookie is lost but fingerprint + IP match
 * - Update last_seen_at on every request
 * 
 * References: ANON-01, ANON-04, ANON-05, ANON-06
 * Depends on: anonymous_users table (Phase 6 migration)
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────

export interface AnonymousUser {
  id: string;
  anon_id: string;
  fingerprint_hash: string;
  ip_hash: string;
  user_agent: string | null;
  country: string | null;
  created_at: string;
  last_seen_at: string;
  daily_chat_count: number;
  daily_voice_count: number;
  request_minute_count: number;
  last_request_at: string | null;
  last_daily_reset: string;
  migrated_to_user_id: string | null;
  migrated_at: string | null;
}

export interface CreateAnonymousInput {
  anonId: string;
  fingerprintHash: string;
  rawIp: string;
  userAgent?: string | undefined;
  country?: string | undefined;
}

export interface RestoreIdentityInput {
  fingerprintHash: string;
  rawIp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Hash an IP address with SHA-256.
 * Raw IPs are NEVER stored — only their hashes (ANON-04).
 */
export function hashIp(rawIp: string): string {
  return crypto.createHash('sha256').update(rawIp.trim()).digest('hex');
}

/**
 * Generate a new anonymous UUID (v4).
 * Called by the frontend on first visit, but the backend can also generate one
 * as a fallback if the client didn't send one.
 */
export function generateAnonId(): string {
  return crypto.randomUUID();
}

// ─── Service ─────────────────────────────────────────────────────

/**
 * Look up an anonymous user by their anon_id.
 * Returns null if not found or already migrated.
 */
export async function getByAnonId(anonId: string): Promise<AnonymousUser | null> {
  const { data, error } = await supabaseAdmin
    .from('anonymous_users')
    .select('*')
    .eq('anon_id', anonId)
    .is('migrated_to_user_id', null)
    .single();

  if (error || !data) return null;
  return data as AnonymousUser;
}

/**
 * Create a new anonymous user record (ANON-01).
 * IP is hashed before storage (ANON-04).
 */
export async function createAnonymousUser(input: CreateAnonymousInput): Promise<AnonymousUser> {
  const ipHash = hashIp(input.rawIp);

  const { data, error } = await supabaseAdmin
    .from('anonymous_users')
    .insert({
      anon_id: input.anonId,
      fingerprint_hash: input.fingerprintHash,
      ip_hash: ipHash,
      user_agent: input.userAgent || null,
      country: input.country || null,
    })
    .select('*')
    .single();

  if (error) {
    // If duplicate anon_id, fetch the existing one
    if (error.code === '23505') {
      const existing = await getByAnonId(input.anonId);
      if (existing) return existing;
    }
    throw new Error(`Failed to create anonymous user: ${error.message}`);
  }

  return data as AnonymousUser;
}

/**
 * Restore a previous anonymous identity (ANON-05).
 * 
 * When a user loses their cookie but keeps the same browser (fingerprint)
 * and same IP, we can restore their previous identity with high confidence.
 * 
 * Match criteria: fingerprint_hash + ip_hash + not migrated
 * Returns the most recently seen match, or null.
 */
export async function restoreIdentity(input: RestoreIdentityInput): Promise<AnonymousUser | null> {
  const ipHash = hashIp(input.rawIp);

  const { data, error } = await supabaseAdmin
    .from('anonymous_users')
    .select('*')
    .eq('fingerprint_hash', input.fingerprintHash)
    .eq('ip_hash', ipHash)
    .is('migrated_to_user_id', null)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as AnonymousUser;
}

/**
 * Update last_seen_at timestamp on every anonymous request (ANON-06).
 */
export async function touchLastSeen(anonId: string): Promise<void> {
  await supabaseAdmin
    .from('anonymous_users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('anon_id', anonId);
}

/**
 * Resolve an anonymous identity from a request.
 * 
 * Priority:
 * 1. Look up by anon_id (from cookie/header)
 * 2. If not found, try to restore by fingerprint + IP
 * 3. If still not found, create a new identity
 * 
 * Returns the resolved anonymous user and whether a new ID was generated.
 */
export async function resolveAnonymousIdentity(params: {
  anonId?: string | undefined;
  fingerprintHash: string;
  rawIp: string;
  userAgent?: string | undefined;
  country?: string | undefined;
}): Promise<{ user: AnonymousUser; isNew: boolean; restoredId?: string }> {
  // 1. Try lookup by provided anon_id
  if (params.anonId) {
    const existing = await getByAnonId(params.anonId);
    if (existing) {
      await touchLastSeen(existing.anon_id);
      return { user: existing, isNew: false };
    }
  }

  // 2. Try to restore by fingerprint + IP (ANON-05)
  const restored = await restoreIdentity({
    fingerprintHash: params.fingerprintHash,
    rawIp: params.rawIp,
  });

  if (restored) {
    await touchLastSeen(restored.anon_id);
    return { user: restored, isNew: false, restoredId: restored.anon_id };
  }

  // 3. Create new identity
  const newAnonId = params.anonId || generateAnonId();
  const newUser = await createAnonymousUser({
    anonId: newAnonId,
    fingerprintHash: params.fingerprintHash,
    rawIp: params.rawIp,
    userAgent: params.userAgent,
    country: params.country,
  });

  return { user: newUser, isNew: true };
}

/**
 * Migrate anonymous data to a permanent user account (MIG-01).
 * Calls the PostgreSQL RPC function migrate_anonymous_data.
 * 
 * This links conversations and merges usage records from the anonymous ID
 * to the permanent user ID.
 */
export async function migrateDataToUser(anonId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('migrate_anonymous_data', {
    p_anon_id: anonId,
    p_user_id: userId,
  });

  if (error) {
    console.error('[AnonymousService] Migration Error:', error);
    throw new Error(`Failed to migrate anonymous data: ${error.message}`);
  }
}


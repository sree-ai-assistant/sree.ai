import { supabaseAdmin } from '../lib/supabase';
import { encrypt, decrypt, hashApiKey } from '../lib/encryption';

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  iv: string;
  name: string | null;
  key_hash?: string | null;
  in_use: boolean;
  created_at: string;
  updated_at: string | null;
  last_used_at: string | null;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingKey?: {
    id: string;
    provider: string;
    name: string | null;
  };
}

export interface SaveApiKeyResult {
  success: boolean;
  duplicate?: boolean;
  message?: string;
}

export class ApiKeyService {
  /**
   * Checks if a raw API key already exists for the given user.
   * Hybrid approach:
   * 1. Computes deterministic HMAC-SHA256 blind index hash.
   * 2. Checks by key_hash (fast O(1) indexed lookup).
   * 3. Fallback for legacy records (where key_hash is null) via in-memory AES decryption.
   * 4. Opportunistically backfills key_hash on legacy records when matched.
   */
  static async checkDuplicateKey(userId: string, rawKey: string): Promise<DuplicateCheckResult> {
    if (!userId || typeof rawKey !== 'string') {
      return { isDuplicate: false };
    }

    const trimmedKey = rawKey.trim();
    if (!trimmedKey) {
      return { isDuplicate: false };
    }

    let targetHash: string;
    try {
      targetHash = hashApiKey(trimmedKey);
    } catch (err) {
      console.warn('[ApiKeyService] Unable to compute key hash for duplicate check:', err);
      return { isDuplicate: false };
    }

    // Fetch existing keys for this user (with fallback if key_hash column not yet migrated)
    let { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, user_id, provider, encrypted_key, iv, name, key_hash')
      .eq('user_id', userId);

    if (error && (error.message?.includes('key_hash') || (error as any).code === '42703' || (error as any).code === 'PGRST100')) {
      const fallback = await supabaseAdmin
        .from('api_keys')
        .select('id, user_id, provider, encrypted_key, iv, name')
        .eq('user_id', userId);
      data = fallback.data as any;
      error = fallback.error;
    }

    if (error) {
      console.error('Error fetching user keys for duplicate check:', error);
      return { isDuplicate: false };
    }

    if (!data || data.length === 0) {
      return { isDuplicate: false };
    }

    // Step 1: Fast path — check indexed key_hash
    for (const record of data) {
      if (record.key_hash && record.key_hash === targetHash) {
        return {
          isDuplicate: true,
          existingKey: {
            id: record.id,
            provider: record.provider,
            name: record.name,
          },
        };
      }
    }

    // Step 2: Fallback path — check legacy rows (where key_hash is null) via in-memory decrypt
    for (const record of data) {
      if (!record.key_hash && record.encrypted_key && record.iv) {
        try {
          const decrypted = decrypt(record.encrypted_key, record.iv);
          if (decrypted.trim() === trimmedKey) {
            // Opportunistically backfill key_hash for this legacy record
            Promise.resolve(
              supabaseAdmin
                .from('api_keys')
                .update({ key_hash: targetHash })
                .eq('id', record.id)
            )
              .then(({ error }: any) => {
                if (error) {
                  console.warn('[ApiKeyService] Failed opportunistic backfill:', error.message);
                }
              })
              .catch((err: any) => console.warn('[ApiKeyService] Failed opportunistic backfill:', err));

            return {
              isDuplicate: true,
              existingKey: {
                id: record.id,
                provider: record.provider,
                name: record.name,
              },
            };
          }
        } catch (decryptErr) {
          console.warn(`[ApiKeyService] Could not decrypt key ${record.id} during duplicate check:`, decryptErr);
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Backfills key_hash for any legacy rows that have key_hash IS NULL
   */
  static async backfillLegacyKeyHashes(): Promise<number> {
    try {
      if (!process.env.ENCRYPTION_KEY) {
        console.warn('[ApiKeyService] ENCRYPTION_KEY not set; skipping legacy key_hash backfill.');
        return 0;
      }

      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('id, encrypted_key, iv, key_hash')
        .is('key_hash', null);

      if (error || !data || data.length === 0) {
        return 0;
      }

      let count = 0;
      for (const record of data) {
        if (!record.encrypted_key || !record.iv) continue;
        try {
          const decrypted = decrypt(record.encrypted_key, record.iv);
          const hash = hashApiKey(decrypted);
          const { error: updateError } = await supabaseAdmin
            .from('api_keys')
            .update({ key_hash: hash })
            .eq('id', record.id);
          if (!updateError) {
            count++;
          }
        } catch (err) {
          console.warn(`[ApiKeyService] Could not decrypt/hash key ${record.id}:`, err);
        }
      }
      if (count > 0) {
        console.log(`[ApiKeyService] Backfilled key_hash for ${count} legacy API key(s)`);
      }
      return count;
    } catch (err) {
      console.warn('[ApiKeyService] Legacy key_hash backfill error:', err);
      return 0;
    }
  }

  /**
   * Fetches and decrypts an API key for a specific user and provider.
   * Only returns keys that are in_use. Falls back to environment variables.
   */
  static async getUserApiKey(userId: string | null | undefined, provider: string): Promise<{ key: string | null, source: 'user' | 'env' }> {
    if (!provider) return { key: null, source: 'env' };
    const normProvider = provider.toLowerCase();

    if (userId) {
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', normProvider)
        .eq('in_use', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const record = data as ApiKeyRecord;
        try {
          const decrypted = decrypt(record.encrypted_key, record.iv);
          return { key: decrypted, source: 'user' };
        } catch (e) {
          console.error(`Failed to decrypt key for user ${userId}, provider ${normProvider}:`, e);
        }
      }
    }

    // Fallback to system key if allowed
    const envKeyName = `${normProvider.toUpperCase()}_API_KEY`;
    const envKey = process.env[envKeyName] || null;
    return { key: envKey, source: 'env' };
  }

  /**
   * Encrypts and saves an API key for a user with duplicate detection and HMAC blind index
   */
  static async saveUserApiKey(
    userId: string,
    provider: string,
    rawKey: string,
    name?: string
  ): Promise<SaveApiKeyResult> {
    if (!userId) {
      return { success: false, message: 'User ID is required' };
    }
    if (!provider) {
      return { success: false, message: 'Provider is required' };
    }
    if (typeof rawKey !== 'string' || !rawKey.trim()) {
      return { success: false, message: 'API key cannot be empty' };
    }

    const trimmedKey = rawKey.trim();
    const normalizedProvider = provider.toLowerCase();

    // 1. Prevent duplicate keys for the same account
    const dupCheck = await this.checkDuplicateKey(userId, trimmedKey);
    if (dupCheck.isDuplicate) {
      const existingName = dupCheck.existingKey?.name || `${dupCheck.existingKey?.provider} key`;
      return {
        success: false,
        duplicate: true,
        message: `This API key has already been added to your account (saved as "${existingName}").`,
      };
    }

    const { encryptedData, iv } = encrypt(trimmedKey);
    const keyHash = hashApiKey(trimmedKey);
    const now = new Date().toISOString();

    const insertPayload: any = {
      user_id: userId,
      provider: normalizedProvider,
      encrypted_key: encryptedData,
      iv: iv,
      name: name?.trim() || null,
      key_hash: keyHash,
      in_use: true,
      created_at: now,
      updated_at: now,
      last_used_at: now,
    };

    let { error } = await supabaseAdmin
      .from('api_keys')
      .insert(insertPayload);

    // Graceful fallback if database column key_hash is missing
    if (error && (error.message?.includes('key_hash') || error.code === '42703')) {
      console.warn('api_keys table missing key_hash column, retrying insert without key_hash:', error.message);
      delete insertPayload.key_hash;
      const retry = await supabaseAdmin
        .from('api_keys')
        .insert(insertPayload);
      error = retry.error;
    }

    if (error) {
      console.error('Error saving API key:', error);
      return { success: false, message: 'Failed to save API key to database' };
    }

    return { success: true, message: `${provider} API key saved successfully` };
  }

  /**
   * Lists all API key metadata for a user (without decrypted keys)
   */
  static async listUserApiKeys(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, provider, name, in_use, updated_at, last_used_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing API keys:', error);
      return [];
    }

    return data;
  }

  /**
   * Toggles the in_use status of a specific API key
   */
  static async toggleApiKey(userId: string, keyId: string, inUse: boolean): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .update({ in_use: inUse, updated_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error toggling API key:', error);
      return false;
    }

    return true;
  }

  /**
   * Deletes an API key by ID for a user
   */
  static async deleteApiKeyById(userId: string, keyId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting API key:', error);
      return false;
    }

    return true;
  }

  /**
   * Deletes an API key for a user and provider (legacy)
   */
  static async deleteUserApiKey(userId: string, provider: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('api_keys')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      console.error('Error deleting API key:', error);
      return false;
    }

    return true;
  }
}

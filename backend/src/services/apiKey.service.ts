import { supabaseAdmin } from '../lib/supabase';
import { encrypt, decrypt } from '../lib/encryption';

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  iv: string;
  name: string | null;
  in_use: boolean;
  created_at: string;
  updated_at: string | null;
  last_used_at: string | null;
}

export class ApiKeyService {
  /**
   * Fetches and decrypts an API key for a specific user and provider.
   * Only returns keys that are in_use. Falls back to environment variables.
   */
  static async getUserApiKey(userId: string, provider: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('in_use', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const record = data as ApiKeyRecord;
      try {
        return decrypt(record.encrypted_key, record.iv);
      } catch (e) {
        console.error(`Failed to decrypt key for user ${userId}, provider ${provider}:`, e);
      }
    }

    // Fallback to system key if allowed
    const envKeyName = `${provider.toUpperCase()}_API_KEY`;
    return process.env[envKeyName] || null;
  }

  /**
   * Encrypts and saves an API key for a user (now supports name)
   */
  static async saveUserApiKey(
    userId: string,
    provider: string,
    rawKey: string,
    name?: string
  ): Promise<boolean> {
    const { encryptedData, iv } = encrypt(rawKey);

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        user_id: userId,
        provider,
        encrypted_key: encryptedData,
        iv: iv,
        name: name || null,
        in_use: true,
        created_at: now,
        updated_at: now,
        last_used_at: now
      });

    if (error) {
      console.error('Error saving API key:', error);
      return false;
    }

    return true;
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

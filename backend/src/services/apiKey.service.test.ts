import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashApiKey, encrypt } from '../lib/encryption';
import { ApiKeyService } from './apiKey.service';

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '../lib/supabase';

describe('ApiKeyService - Hybrid Duplicate Prevention & Blind Index', () => {
  const mockUserId = 'user-12345';
  const testKey1 = 'gsk_test_key_abc_123';
  const testKey2 = 'gsk_test_key_xyz_999';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  describe('hashApiKey', () => {
    it('produces deterministic 64-char hex HMAC-SHA256 hash', () => {
      const hashA = hashApiKey(testKey1);
      const hashB = hashApiKey(testKey1);
      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hashA)).toBe(true);
    });

    it('ignores leading/trailing whitespace when computing hash', () => {
      const hashClean = hashApiKey(testKey1);
      const hashSpaced = hashApiKey(`  ${testKey1}  \n`);
      expect(hashClean).toBe(hashSpaced);
    });

    it('produces distinct hashes for distinct keys', () => {
      const hashA = hashApiKey(testKey1);
      const hashB = hashApiKey(testKey2);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('checkDuplicateKey', () => {
    it('returns isDuplicate: false when user has no saved keys', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const result = await ApiKeyService.checkDuplicateKey(mockUserId, testKey1);
      expect(result.isDuplicate).toBe(false);
    });

    it('detects duplicate via fast-path key_hash', async () => {
      const keyHash = hashApiKey(testKey1);
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'key-id-1',
                provider: 'groq',
                name: 'Primary Groq',
                key_hash: keyHash,
              },
            ],
            error: null,
          }),
        }),
      });

      const result = await ApiKeyService.checkDuplicateKey(mockUserId, testKey1);
      expect(result.isDuplicate).toBe(true);
      expect(result.existingKey?.name).toBe('Primary Groq');
      expect(result.existingKey?.provider).toBe('groq');
    });

    it('detects duplicate via fallback decrypt for legacy rows where key_hash is null', async () => {
      const { encryptedData, iv } = encrypt(testKey1);
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'legacy-key-id',
                provider: 'groq',
                name: 'Old Groq Key',
                encrypted_key: encryptedData,
                iv: iv,
                key_hash: null, // Legacy record without key_hash
              },
            ],
            error: null,
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const result = await ApiKeyService.checkDuplicateKey(mockUserId, testKey1);
      expect(result.isDuplicate).toBe(true);
      expect(result.existingKey?.name).toBe('Old Groq Key');
    });

    it('returns isDuplicate: false when user has keys but none match', async () => {
      const keyHash2 = hashApiKey(testKey2);
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'key-id-2',
                provider: 'groq',
                name: 'Different Key',
                key_hash: keyHash2,
              },
            ],
            error: null,
          }),
        }),
      });

      const result = await ApiKeyService.checkDuplicateKey(mockUserId, testKey1);
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe('saveUserApiKey', () => {
    it('blocks duplicate key and returns clear duplicate rejection message', async () => {
      const keyHash = hashApiKey(testKey1);
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'existing-id',
                provider: 'groq',
                name: 'My Existing Groq Key',
                key_hash: keyHash,
              },
            ],
            error: null,
          }),
        }),
      });

      const result = await ApiKeyService.saveUserApiKey(mockUserId, 'groq', testKey1, 'Duplicate Attempt');
      expect(result.success).toBe(false);
      expect(result.duplicate).toBe(true);
      expect(result.message).toContain('My Existing Groq Key');
    });

    it('saves successfully when key is unique and includes key_hash in insert payload', async () => {
      const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'api_keys') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            insert: insertMock,
          };
        }
        return {};
      });

      const result = await ApiKeyService.saveUserApiKey(mockUserId, 'groq', testKey1, 'Brand New Key');
      expect(result.success).toBe(true);
      expect(insertMock).toHaveBeenCalled();
      const insertPayload = insertMock.mock.calls[0]![0];
      expect(insertPayload.user_id).toBe(mockUserId);
      expect(insertPayload.provider).toBe('groq');
      expect(insertPayload.name).toBe('Brand New Key');
      expect(insertPayload.key_hash).toBe(hashApiKey(testKey1));
    });

    it('rejects empty or whitespace-only keys', async () => {
      const res1 = await ApiKeyService.saveUserApiKey(mockUserId, 'groq', '   ');
      expect(res1.success).toBe(false);
      expect(res1.message).toContain('API key cannot be empty');

      const res2 = await ApiKeyService.saveUserApiKey(mockUserId, 'groq', undefined as any);
      expect(res2.success).toBe(false);
      expect(res2.message).toContain('API key cannot be empty');
    });

    it('gracefully handles missing key_hash column on insert retry', async () => {
      const insertMock = vi.fn()
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'column "key_hash" of relation "api_keys" does not exist', code: '42703' },
        })
        .mockResolvedValueOnce({
          data: null,
          error: null,
        });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'api_keys') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            insert: insertMock,
          };
        }
        return {};
      });

      const result = await ApiKeyService.saveUserApiKey(mockUserId, 'groq', testKey1, 'Fallback Test');
      expect(result.success).toBe(true);
      expect(insertMock).toHaveBeenCalledTimes(2);
      // The second call (retry) should have deleted key_hash from payload
      expect(insertMock.mock.calls[1]![0].key_hash).toBeUndefined();
    });
  });

  describe('backfillLegacyKeyHashes', () => {
    it('backfills legacy rows that lack key_hash', async () => {
      const { encryptedData, iv } = encrypt(testKey1);
      const updateMock = vi.fn().mockResolvedValue({ error: null });

      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'legacy-row-1',
                encrypted_key: encryptedData,
                iv: iv,
                key_hash: null,
              },
            ],
            error: null,
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: updateMock,
        }),
      });

      const count = await ApiKeyService.backfillLegacyKeyHashes();
      expect(count).toBe(1);
      expect(updateMock).toHaveBeenCalledWith('id', 'legacy-row-1');
    });

    it('returns 0 safely when no legacy rows need backfill', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const count = await ApiKeyService.backfillLegacyKeyHashes();
      expect(count).toBe(0);
    });
  });
});


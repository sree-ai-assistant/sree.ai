-- Migration: Add key_hash column to api_keys for blind index duplicate detection
-- Description: Stores HMAC-SHA256 blind index hash for O(1) indexed duplicate checks without decrypting.

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT;

-- Index for fast user_id + key_hash lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_key_hash ON public.api_keys(user_id, key_hash);

COMMENT ON COLUMN public.api_keys.key_hash IS 'HMAC-SHA256 blind index hash of the raw API key for duplicate detection';

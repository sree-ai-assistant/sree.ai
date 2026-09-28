-- ===========================================================================
-- Migration: Create file_uploads table for R2 content-hash deduplication
-- ===========================================================================
-- 
-- This table tracks every unique file uploaded to R2 by content hash.
-- When a duplicate file is uploaded (same SHA-256 hash + same bucket),
-- the system returns the existing URL instead of re-uploading.
--
-- ref_count tracks how many times a given file has been referenced.
-- Files with ref_count = 0 and old last_used_at can be garbage-collected.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS file_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_hash VARCHAR(64) NOT NULL,              -- SHA-256 hex digest of file content
  r2_key VARCHAR(512) NOT NULL,                    -- R2 object key (filename in bucket)
  r2_url TEXT NOT NULL,                            -- Full public URL
  bucket VARCHAR(128) NOT NULL DEFAULT 'chat-files',
  original_name TEXT,                              -- Original filename (for audit/reference)
  mime_type VARCHAR(128),
  file_size_bytes BIGINT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ref_count INTEGER NOT NULL DEFAULT 1,            -- How many times this hash is referenced
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),

  -- Same content hash in the same bucket = same file (global dedup)
  CONSTRAINT uq_file_uploads_hash_bucket UNIQUE (content_hash, bucket)
);

-- Fast hash lookups for dedup checks
CREATE INDEX IF NOT EXISTS idx_file_uploads_hash ON file_uploads(content_hash);

-- User-scoped queries (e.g. "show my uploads")
CREATE INDEX IF NOT EXISTS idx_file_uploads_user ON file_uploads(user_id);

-- Garbage collection: find orphans with ref_count <= 0 and old last_used_at
CREATE INDEX IF NOT EXISTS idx_file_uploads_gc ON file_uploads(ref_count, last_used_at);

-- RLS: Only service_role should interact with this table (backend only)
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

-- No public access — all operations go through supabaseAdmin (service_role)
-- Service role bypasses RLS automatically, so no policies needed.

COMMENT ON TABLE file_uploads IS 'Tracks unique files in R2 by content hash for deduplication. Managed by backend service_role only.';
COMMENT ON COLUMN file_uploads.content_hash IS 'SHA-256 hex digest of the file content';
COMMENT ON COLUMN file_uploads.ref_count IS 'Number of active references. 0 = eligible for garbage collection after cooldown.';
COMMENT ON COLUMN file_uploads.last_used_at IS 'Updated on every re-upload of the same content. Used for GC eligibility.';

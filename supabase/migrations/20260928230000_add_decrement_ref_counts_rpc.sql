-- ===========================================================================
-- Migration: Add RPC function and triggers for atomic ref_count decrement
-- ===========================================================================
--
-- Automatically decrements file_uploads.ref_count whenever:
-- 1. A message containing attachments is deleted directly (DELETE ON messages)
-- 2. A conversation containing attachments is deleted (CASCADE DELETE ON messages)
-- 3. A user account is deleted (CASCADE DELETE ON messages)
-- 4. A message is edited to remove an attachment (UPDATE OF metadata ON messages)
--
-- Also provides the decrement_file_ref_counts() RPC for manual/batch invocations.
-- All decrements use GREATEST(0, ref_count - 1) to prevent negative counts.
-- ===========================================================================

-- 1. RPC function for batch ref_count decrement
CREATE OR REPLACE FUNCTION decrement_file_ref_counts(p_urls TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INTEGER;
BEGIN
  IF p_urls IS NULL OR array_length(p_urls, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE file_uploads
  SET
    ref_count = GREATEST(0, ref_count - 1),
    last_used_at = NOW()
  WHERE r2_url = ANY(p_urls)
     OR r2_key = ANY(SELECT split_part(split_part(u, '?', 1), '/', -1) FROM unnest(p_urls) AS u);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION decrement_file_ref_counts IS 'Atomically decrements ref_count for a batch of R2 URLs or keys. Uses GREATEST(0, ref_count - 1).';

-- 2. Trigger function for messages DELETE
CREATE OR REPLACE FUNCTION handle_message_attachment_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  att JSONB;
  att_url TEXT;
  file_key TEXT;
BEGIN
  IF OLD.metadata IS NOT NULL AND OLD.metadata ? 'attachments' THEN
    IF jsonb_typeof(OLD.metadata->'attachments') = 'array' THEN
      FOR att IN SELECT * FROM jsonb_array_elements(OLD.metadata->'attachments')
      LOOP
        att_url := att->>'url';
        IF att_url IS NOT NULL AND att_url != '' THEN
          file_key := split_part(split_part(att_url, '?', 1), '/', -1);
          UPDATE file_uploads
          SET
            ref_count = GREATEST(0, ref_count - 1),
            last_used_at = NOW()
          WHERE r2_url = att_url OR r2_key = file_key;
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_attachment_deletion ON messages;
CREATE TRIGGER trg_message_attachment_deletion
AFTER DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION handle_message_attachment_deletion();

-- 3. Trigger function for messages UPDATE (if attachments are removed)
CREATE OR REPLACE FUNCTION handle_message_attachment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_att JSONB;
  new_att JSONB;
  att_url TEXT;
  file_key TEXT;
  new_urls TEXT[];
BEGIN
  IF OLD.metadata IS NULL OR NOT (OLD.metadata ? 'attachments') THEN
    RETURN NEW;
  END IF;

  new_urls := ARRAY[]::TEXT[];
  IF NEW.metadata IS NOT NULL AND NEW.metadata ? 'attachments' AND jsonb_typeof(NEW.metadata->'attachments') = 'array' THEN
    FOR new_att IN SELECT * FROM jsonb_array_elements(NEW.metadata->'attachments')
    LOOP
      IF new_att->>'url' IS NOT NULL THEN
        new_urls := array_append(new_urls, new_att->>'url');
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(OLD.metadata->'attachments') = 'array' THEN
    FOR old_att IN SELECT * FROM jsonb_array_elements(OLD.metadata->'attachments')
    LOOP
      att_url := old_att->>'url';
      IF att_url IS NOT NULL AND att_url != '' AND NOT (att_url = ANY(new_urls)) THEN
        file_key := split_part(split_part(att_url, '?', 1), '/', -1);
        UPDATE file_uploads
        SET
          ref_count = GREATEST(0, ref_count - 1),
          last_used_at = NOW()
        WHERE r2_url = att_url OR r2_key = file_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_attachment_update ON messages;
CREATE TRIGGER trg_message_attachment_update
AFTER UPDATE OF metadata ON messages
FOR EACH ROW
EXECUTE FUNCTION handle_message_attachment_update();

-- 4. Indexes for fast URL and key lookups during trigger execution
CREATE INDEX IF NOT EXISTS idx_file_uploads_r2_url ON file_uploads(r2_url);
CREATE INDEX IF NOT EXISTS idx_file_uploads_r2_key ON file_uploads(r2_key);


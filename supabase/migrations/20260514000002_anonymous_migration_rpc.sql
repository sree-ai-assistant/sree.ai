-- ============================================================
-- Migration: Anonymous Migration Support
-- Phase 10: Anonymous Chat Persistence
-- ============================================================

-- 1. CREATE MIGRATION FUNCTION
CREATE OR REPLACE FUNCTION public.migrate_anonymous_data(p_anon_id TEXT, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_usage RECORD;
BEGIN
  -- 1. Update conversations
  UPDATE public.conversations
  SET user_id = p_user_id,
      anon_id = NULL
  WHERE anon_id = p_anon_id;

  -- 2. Migrate Usage Tracking (Merge or Update)
  -- Loop through each tool tracked for the anonymous ID
  FOR v_usage IN 
    SELECT * FROM public.usage_tracking WHERE anon_id = p_anon_id
  LOOP
    -- Check if the user already has a record for this tool
    IF EXISTS (SELECT 1 FROM public.usage_tracking WHERE user_id = p_user_id AND tool_type = v_usage.tool_type) THEN
      -- MERGE: Add counts to existing user record
      UPDATE public.usage_tracking
      SET 
        minute_count = minute_count + v_usage.minute_count,
        daily_count = daily_count + v_usage.daily_count,
        monthly_count = monthly_count + v_usage.monthly_count,
        updated_at = now()
      WHERE user_id = p_user_id AND tool_type = v_usage.tool_type;
      
      -- Delete the anonymous record as it's merged
      DELETE FROM public.usage_tracking WHERE id = v_usage.id;
    ELSE
      -- TRANSFER: Link the anonymous record to the user
      UPDATE public.usage_tracking
      SET user_id = p_user_id,
          anon_id = NULL,
          updated_at = now()
      WHERE id = v_usage.id;
    END IF;
  END LOOP;

  -- 3. Migrate Abuse Flags
  UPDATE public.abuse_flags
  SET user_id = p_user_id,
      anon_id = NULL
  WHERE anon_id = p_anon_id;

  -- 4. Mark anonymous user as migrated
  UPDATE public.anonymous_users
  SET migrated_to_user_id = p_user_id,
      migrated_at = now()
  WHERE anon_id = p_anon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. GRANT ACCESS
GRANT EXECUTE ON FUNCTION public.migrate_anonymous_data(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_anonymous_data(TEXT, UUID) TO service_role;

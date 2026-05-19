-- ============================================================
-- Migration: Sync Profile Usage Counts
-- Description: Rewrites increment_multi_usage to update per-tool 
--   count/limit columns on profiles (chat_count_daily, voice_count_daily, 
--   image_count_daily, etc.) whenever usage is tracked.
--   Drops the broken 6-parameter overload that referenced removed columns.
-- ============================================================

-- 1. Drop the broken 6-param overload that references removed columns
DROP FUNCTION IF EXISTS public.increment_multi_usage(UUID, TEXT, JSONB, INTEGER, INTEGER, BOOLEAN);

-- 2. Recreate the canonical 3-param function with profile sync
CREATE OR REPLACE FUNCTION public.increment_multi_usage(
  p_user_id UUID,
  p_anon_id TEXT,
  p_requests JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_all_allowed BOOLEAN := TRUE;
  v_reason TEXT := NULL;
  v_limit INTEGER := NULL;
  v_used INTEGER := NULL;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_record public.usage_tracking%ROWTYPE;
  v_message TEXT := NULL;
  -- Per-tool profile counters (accumulated during the loop)
  v_chat_daily NUMERIC := 0;
  v_chat_monthly NUMERIC := 0;
  v_voice_daily NUMERIC := 0;
  v_voice_monthly NUMERIC := 0;
  v_image_daily NUMERIC := 0;
  v_image_monthly NUMERIC := 0;
BEGIN
  -- 1. Identity Validation
  IF p_user_id IS NULL AND p_anon_id IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object('allowed', false, 'reason', 'invalid_identity'));
  END IF;

  -- 2. Tool-specific Limits Check (usage_tracking table)
  FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(
    tool_type TEXT, 
    amount NUMERIC, 
    minute_limit INTEGER, 
    daily_limit INTEGER, 
    monthly_limit INTEGER
  )
  LOOP
    -- Lookup or create tracking record
    IF p_user_id IS NOT NULL THEN
      SELECT * INTO v_record FROM public.usage_tracking 
      WHERE user_id = p_user_id AND tool_type = v_request.tool_type
      FOR UPDATE;
    ELSE
      SELECT * INTO v_record FROM public.usage_tracking 
      WHERE anon_id = p_anon_id AND tool_type = v_request.tool_type
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      INSERT INTO public.usage_tracking (user_id, anon_id, tool_type)
      VALUES (p_user_id, p_anon_id, v_request.tool_type)
      RETURNING * INTO v_record;
    END IF;

    -- Reset counters if window passed
    IF v_now - v_record.last_minute_reset >= INTERVAL '1 minute' THEN
      v_record.minute_count := 0;
    END IF;
    IF v_now - v_record.last_daily_reset >= INTERVAL '1 day' THEN
      v_record.daily_count := 0;
    END IF;
    IF v_now - v_record.last_monthly_reset >= INTERVAL '30 days' THEN
      v_record.monthly_count := 0;
    END IF;

    -- Check limits
    IF v_request.minute_limit > 0 AND (v_record.minute_count + v_request.amount) > v_request.minute_limit THEN
      v_all_allowed := FALSE; v_reason := 'minute'; v_limit := v_request.minute_limit; v_used := v_record.minute_count; 
      v_message := 'Rate limit exceeded: ' || v_request.tool_type || ' (' || v_request.minute_limit || '/min)';
      EXIT;
    END IF;
    IF v_request.daily_limit > 0 AND (v_record.daily_count + v_request.amount) > v_request.daily_limit THEN
      v_all_allowed := FALSE; v_reason := 'daily'; v_limit := v_request.daily_limit; v_used := v_record.daily_count; 
      v_message := 'Daily limit reached: ' || v_request.tool_type || ' (' || v_request.daily_limit || '/day)';
      EXIT;
    END IF;
    IF v_request.monthly_limit > 0 AND (v_record.monthly_count + v_request.amount) > v_request.monthly_limit THEN
      v_all_allowed := FALSE; v_reason := 'monthly'; v_limit := v_request.monthly_limit; v_used := v_record.monthly_count; 
      v_message := 'Monthly limit reached: ' || v_request.tool_type || ' (' || v_request.monthly_limit || '/month)';
      EXIT;
    END IF;
  END LOOP;

  -- 3. Commit Increments (only if all allowed)
  IF v_all_allowed THEN
    -- Update Anonymous User last_seen
    IF p_anon_id IS NOT NULL AND p_user_id IS NULL THEN
      UPDATE public.anonymous_users
      SET last_seen_at = v_now
      WHERE anon_id = p_anon_id;
    END IF;

    -- Update Usage Tracking rows + collect per-tool counts for profile sync
    FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(tool_type TEXT, amount NUMERIC, is_byok BOOLEAN)
    LOOP
      IF p_user_id IS NOT NULL THEN
        UPDATE public.usage_tracking
        SET 
          minute_count = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_request.amount ELSE minute_count + v_request.amount END,
          last_minute_reset = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_now ELSE last_minute_reset END,
          daily_count = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_request.amount ELSE daily_count + v_request.amount END,
          last_daily_reset = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_now ELSE last_daily_reset END,
          monthly_count = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_request.amount ELSE monthly_count + v_request.amount END,
          last_monthly_reset = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_now ELSE last_monthly_reset END,
          total_count = COALESCE(total_count, 0) + v_request.amount,
          is_byok = COALESCE(v_request.is_byok, is_byok),
          updated_at = v_now
        WHERE user_id = p_user_id AND tool_type = v_request.tool_type
        RETURNING * INTO v_record;
      ELSE
        UPDATE public.usage_tracking
        SET 
          minute_count = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_request.amount ELSE minute_count + v_request.amount END,
          last_minute_reset = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_now ELSE last_minute_reset END,
          daily_count = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_request.amount ELSE daily_count + v_request.amount END,
          last_daily_reset = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_now ELSE last_daily_reset END,
          monthly_count = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_request.amount ELSE monthly_count + v_request.amount END,
          last_monthly_reset = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_now ELSE last_monthly_reset END,
          total_count = COALESCE(total_count, 0) + v_request.amount,
          is_byok = COALESCE(v_request.is_byok, is_byok),
          updated_at = v_now
        WHERE anon_id = p_anon_id AND tool_type = v_request.tool_type
        RETURNING * INTO v_record;
      END IF;

      -- Accumulate per-tool counts for profile sync
      IF v_request.tool_type = 'chat' THEN
        v_chat_daily := v_record.daily_count;
        v_chat_monthly := v_record.monthly_count;
      ELSIF v_request.tool_type = 'voice' THEN
        v_voice_daily := v_record.daily_count;
        v_voice_monthly := v_record.monthly_count;
      ELSIF v_request.tool_type = 'image' THEN
        v_image_daily := v_record.daily_count;
        v_image_monthly := v_record.monthly_count;
      END IF;
    END LOOP;

    -- 4. Sync per-tool counts to profiles table (authenticated users only)
    IF p_user_id IS NOT NULL THEN
      -- Read ALL current usage_tracking rows for this user to get accurate totals
      -- (the request may only contain one tool, but we need the others too)
      SELECT 
        COALESCE(MAX(CASE WHEN ut.tool_type = 'chat'  THEN 
          CASE WHEN v_now - ut.last_daily_reset >= INTERVAL '1 day' THEN 0 ELSE ut.daily_count END 
        END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'chat'  THEN 
          CASE WHEN v_now - ut.last_monthly_reset >= INTERVAL '30 days' THEN 0 ELSE ut.monthly_count END 
        END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'voice' THEN 
          CASE WHEN v_now - ut.last_daily_reset >= INTERVAL '1 day' THEN 0 ELSE ut.daily_count END 
        END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'voice' THEN 
          CASE WHEN v_now - ut.last_monthly_reset >= INTERVAL '30 days' THEN 0 ELSE ut.monthly_count END 
        END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'image' THEN 
          CASE WHEN v_now - ut.last_daily_reset >= INTERVAL '1 day' THEN 0 ELSE ut.daily_count END 
        END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'image' THEN 
          CASE WHEN v_now - ut.last_monthly_reset >= INTERVAL '30 days' THEN 0 ELSE ut.monthly_count END 
        END), 0)
      INTO v_chat_daily, v_chat_monthly, v_voice_daily, v_voice_monthly, v_image_daily, v_image_monthly
      FROM public.usage_tracking ut
      WHERE ut.user_id = p_user_id
        AND ut.tool_type IN ('chat', 'voice', 'image');

      UPDATE public.profiles
      SET 
        chat_count_daily   = v_chat_daily,
        chat_count_monthly = v_chat_monthly,
        voice_count_daily  = v_voice_daily,
        voice_count_monthly = v_voice_monthly,
        image_count_daily  = v_image_daily,
        image_count_monthly = v_image_monthly,
        updated_at = v_now
      WHERE id = p_user_id;
    END IF;
  END IF;

  -- 5. Return result with usage details
  IF v_all_allowed THEN
    SELECT 
      COALESCE(x.daily_limit, 0),
      COALESCE(u.daily_count, 0)
    INTO v_limit, v_used
    FROM jsonb_to_recordset(p_requests) AS x(tool_type TEXT, amount NUMERIC, daily_limit INTEGER)
    LEFT JOIN public.usage_tracking u ON 
      (p_user_id IS NOT NULL AND u.user_id = p_user_id AND u.tool_type = x.tool_type) OR
      (p_anon_id IS NOT NULL AND u.anon_id = p_anon_id AND u.tool_type = x.tool_type)
    LIMIT 1;
  END IF;

  RETURN jsonb_build_array(jsonb_build_object(
    'allowed', v_all_allowed,
    'reason', v_reason,
    'limit', v_limit,
    'used', v_used,
    'message', v_message
  ));
END;
$$;

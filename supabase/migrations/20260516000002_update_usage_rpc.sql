-- ============================================================
-- Migration: Enhanced Usage Tracking RPC
-- Description: Updates increment_multi_usage to support profile-level limits
--              and keeps profiles/anonymous_users tables in sync.
-- ============================================================

-- 1. Ensure profiles table has all necessary columns (checked, they exist)
-- 2. Update the RPC function

CREATE OR REPLACE FUNCTION public.increment_multi_usage(
  p_user_id UUID,
  p_anon_id TEXT,
  p_requests JSONB,
  p_profile_daily_limit INTEGER DEFAULT 0,
  p_profile_monthly_limit INTEGER DEFAULT 0
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
  v_record RECORD;
  v_profile RECORD;
  v_anon RECORD;
  v_total_amount NUMERIC := 0;
  v_profile_daily_count NUMERIC := 0;
  v_profile_monthly_count NUMERIC := 0;
  v_message TEXT := NULL;
BEGIN
  -- 1. Identity Validation
  IF p_user_id IS NULL AND p_anon_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_identity');
  END IF;

  -- Calculate total amount for profile-level check
  FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(amount NUMERIC)
  LOOP
    v_total_amount := v_total_amount + COALESCE(v_request.amount, 0);
  END LOOP;

  -- 2. Profile/Identity Global Limits Check
  IF p_user_id IS NOT NULL THEN
    -- AUTHENTICATED USER
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    
    IF v_profile IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'profile_not_found');
    END IF;

    -- Reset profile counters if needed
    v_profile_daily_count := COALESCE(v_profile.daily_usage_count, 0);
    v_profile_monthly_count := COALESCE(v_profile.monthly_usage_count, 0);

    IF v_now - COALESCE(v_profile.last_usage_reset_daily, v_now - INTERVAL '2 days') >= INTERVAL '1 day' THEN
      v_profile_daily_count := 0;
    END IF;
    IF v_now - COALESCE(v_profile.last_usage_reset_monthly, v_now - INTERVAL '31 days') >= INTERVAL '30 days' THEN
      v_profile_monthly_count := 0;
    END IF;

    -- Check Profile Daily Limit
    IF p_profile_daily_limit > 0 AND (v_profile_daily_count + v_total_amount) > p_profile_daily_limit THEN
      RETURN jsonb_build_object(
        'allowed', false, 
        'reason', 'daily', 
        'limit', p_profile_daily_limit, 
        'used', v_profile_daily_count,
        'message', 'You have reached your daily total request limit. Upgrade for more.'
      );
    END IF;

    -- Check Profile Monthly Limit
    IF p_profile_monthly_limit > 0 AND (v_profile_monthly_count + v_total_amount) > p_profile_monthly_limit THEN
      RETURN jsonb_build_object(
        'allowed', false, 
        'reason', 'monthly', 
        'limit', p_profile_monthly_limit, 
        'used', v_profile_monthly_count,
        'message', 'You have reached your monthly total request limit. Upgrade for more.'
      );
    END IF;

  ELSIF p_anon_id IS NOT NULL THEN
    -- ANONYMOUS USER
    SELECT * INTO v_anon FROM public.anonymous_users WHERE anon_id = p_anon_id FOR UPDATE;
    
    IF v_anon IS NOT NULL THEN
      v_profile_daily_count := COALESCE(v_anon.daily_usage_count, 0);
      v_profile_monthly_count := COALESCE(v_anon.monthly_usage_count, 0);

      IF v_now - COALESCE(v_anon.last_daily_reset, v_now - INTERVAL '2 days') >= INTERVAL '1 day' THEN
        v_profile_daily_count := 0;
      END IF;
      IF v_now - COALESCE(v_anon.last_usage_reset_monthly, v_now - INTERVAL '31 days') >= INTERVAL '30 days' THEN
        v_profile_monthly_count := 0;
      END IF;

      -- Check Anon Daily Limit
      IF p_profile_daily_limit > 0 AND (v_profile_daily_count + v_total_amount) > p_profile_daily_limit THEN
        RETURN jsonb_build_object(
          'allowed', false, 
          'reason', 'daily', 
          'limit', p_profile_daily_limit, 
          'used', v_profile_daily_count,
          'message', 'Anonymous daily limit reached. Please sign in to continue.'
        );
      END IF;
    END IF;
  END IF;

  -- 3. Tool-specific Limits Check (usage_tracking table)
  FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(
    tool_type TEXT, 
    amount NUMERIC, 
    minute_limit INTEGER, 
    daily_limit INTEGER, 
    monthly_limit INTEGER
  )
  LOOP
    -- Lookup or create tracking record
    SELECT * INTO v_record FROM public.usage_tracking 
    WHERE (p_user_id IS NOT NULL AND user_id = p_user_id AND tool_type = v_request.tool_type)
       OR (p_anon_id IS NOT NULL AND anon_id = p_anon_id AND tool_type = v_request.tool_type)
    FOR UPDATE;

    IF v_record IS NULL THEN
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

  -- 4. Commit Increments
  IF v_all_allowed THEN
    -- Update Profile (if authenticated)
    IF p_user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET 
        daily_usage_count = v_profile_daily_count + v_total_amount,
        monthly_usage_count = v_profile_monthly_count + v_total_amount,
        daily_usage_limit = p_profile_daily_limit,
        monthly_usage_limit = p_profile_monthly_limit,
        last_usage_reset_daily = CASE WHEN v_now - COALESCE(last_usage_reset_daily, v_now - INTERVAL '2 days') >= INTERVAL '1 day' THEN v_now ELSE last_usage_reset_daily END,
        last_usage_reset_monthly = CASE WHEN v_now - COALESCE(last_usage_reset_monthly, v_now - INTERVAL '31 days') >= INTERVAL '30 days' THEN v_now ELSE last_usage_reset_monthly END,
        updated_at = v_now
      WHERE id = p_user_id;
    ELSIF p_anon_id IS NOT NULL AND v_anon IS NOT NULL THEN
      -- Update Anonymous User
      UPDATE public.anonymous_users
      SET 
        daily_usage_count = v_profile_daily_count + v_total_amount,
        monthly_usage_count = v_profile_monthly_count + v_total_amount,
        last_daily_reset = CASE WHEN v_now - COALESCE(last_daily_reset, v_now - INTERVAL '2 days') >= INTERVAL '1 day' THEN v_now ELSE last_daily_reset END,
        last_usage_reset_monthly = CASE WHEN v_now - COALESCE(last_usage_reset_monthly, v_now - INTERVAL '31 days') >= INTERVAL '30 days' THEN v_now ELSE last_usage_reset_monthly END,
        last_seen_at = v_now
      WHERE anon_id = p_anon_id;
    END IF;

    -- Update Usage Tracking
    FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(tool_type TEXT, amount NUMERIC, is_byok BOOLEAN)
    LOOP
      UPDATE public.usage_tracking
      SET 
        minute_count = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_request.amount ELSE minute_count + v_request.amount END,
        last_minute_reset = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_now ELSE last_minute_reset END,
        daily_count = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_request.amount ELSE daily_count + v_request.amount END,
        last_daily_reset = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_now ELSE last_daily_reset END,
        monthly_count = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_request.amount ELSE monthly_count + v_request.amount END,
        last_monthly_reset = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_now ELSE last_monthly_reset END,
        is_byok = COALESCE(v_request.is_byok, is_byok),
        updated_at = v_now
      WHERE (p_user_id IS NOT NULL AND user_id = p_user_id AND tool_type = v_request.tool_type)
         OR (p_anon_id IS NOT NULL AND anon_id = p_anon_id AND tool_type = v_request.tool_type);
    END LOOP;
  END IF;

  -- Return results as an array for backward compatibility with service expectations if needed,
  -- but the service seems to expect a single object or array of one object.
  -- The service uses: const results = data as { allowed: boolean; ... }[];
  -- So we return an array of one object.
  RETURN jsonb_build_array(jsonb_build_object(
    'allowed', v_all_allowed,
    'reason', v_reason,
    'limit', v_limit,
    'used', v_used,
    'message', v_message
  ));
END;
$$;

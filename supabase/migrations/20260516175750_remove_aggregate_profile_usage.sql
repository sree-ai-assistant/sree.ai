-- Migration: Remove Aggregate Profile Usage
-- Description: Removes daily_usage_count, monthly_usage_count, last_usage_reset_daily, last_usage_reset_monthly 
--              from profiles and anonymous_users. Updates increment_multi_usage RPC to stop using them.

-- 1. Drop columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS daily_usage_count,
  DROP COLUMN IF EXISTS monthly_usage_count,
  DROP COLUMN IF EXISTS daily_usage_limit,
  DROP COLUMN IF EXISTS monthly_usage_limit,
  DROP COLUMN IF EXISTS last_usage_reset_daily,
  DROP COLUMN IF EXISTS last_usage_reset_monthly;

-- 2. Drop columns from anonymous_users
ALTER TABLE public.anonymous_users
  DROP COLUMN IF EXISTS daily_usage_count,
  DROP COLUMN IF EXISTS monthly_usage_count,
  DROP COLUMN IF EXISTS last_daily_reset,
  DROP COLUMN IF EXISTS last_usage_reset_monthly;

-- 3. Update the RPC function to remove profile limits
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
  v_record RECORD;
  v_message TEXT := NULL;
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

  -- 3. Commit Increments
  IF v_all_allowed THEN
    -- Update Anonymous User last_seen
    IF p_anon_id IS NOT NULL AND p_user_id IS NULL THEN
      UPDATE public.anonymous_users
      SET last_seen_at = v_now
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

  RETURN jsonb_build_array(jsonb_build_object(
    'allowed', v_all_allowed,
    'reason', v_reason,
    'limit', v_limit,
    'used', v_used,
    'message', v_message
  ));
END;
$$;

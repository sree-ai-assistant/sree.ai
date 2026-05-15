-- ============================================================
-- Migration: AI Models & Multi-Tool Usage RPC
-- Phase 8: Rate Limiting Engine
-- ============================================================

-- 1. AI MODELS TABLE
CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  tier_required TEXT NOT NULL CHECK (tier_required IN ('free', 'starter', 'pro')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.ai_models IS 'Registry of supported AI models and their plan requirements';

-- 2. INSERT DEFAULT MODELS
INSERT INTO public.ai_models (model_id, name, provider, tier_required)
VALUES 
  ('meta-llama/llama-3-8b-instruct', 'Llama 3 8B', 'nvidia', 'free'),
  ('meta-llama/llama-3-70b-instruct', 'Llama 3 70B', 'nvidia', 'starter'),
  ('nvidia/nemotron-4-340b-instruct', 'Nemotron 4 340B', 'nvidia', 'pro'),
  ('stabilityai/stable-diffusion-xl', 'SDXL', 'replicate', 'free'),
  ('deepgram/voice', 'Deepgram Voice', 'deepgram', 'free')
ON CONFLICT (model_id) DO NOTHING;

-- 3. ATOMIC MULTI-TOOL USAGE RPC
-- This function checks and increments usage for multiple tools in a single transaction.
-- It enforces per-minute, daily, and monthly limits.
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
BEGIN
  -- Validate input: must have either user_id or anon_id
  IF p_user_id IS NULL AND p_anon_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_identity');
  END IF;

  -- First pass: Check if all requested tool increments are within limits
  FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(
    tool_type TEXT, 
    amount INTEGER, 
    minute_limit INTEGER, 
    daily_limit INTEGER, 
    monthly_limit INTEGER
  )
  LOOP
    -- Lookup or create tracking record for this identity + tool
    SELECT * INTO v_record FROM public.usage_tracking 
    WHERE (p_user_id IS NOT NULL AND user_id = p_user_id AND tool_type = v_request.tool_type)
       OR (p_anon_id IS NOT NULL AND anon_id = p_anon_id AND tool_type = v_request.tool_type);

    IF v_record IS NULL THEN
      INSERT INTO public.usage_tracking (user_id, anon_id, tool_type)
      VALUES (p_user_id, p_anon_id, v_request.tool_type)
      RETURNING * INTO v_record;
    END IF;

    -- Reset counters if the window has passed
    IF v_now - v_record.last_minute_reset >= INTERVAL '1 minute' THEN
      v_record.minute_count := 0;
      v_record.last_minute_reset := v_now;
    END IF;
    IF v_now - v_record.last_daily_reset >= INTERVAL '1 day' THEN
      v_record.daily_count := 0;
      v_record.last_daily_reset := v_now;
    END IF;
    IF v_now - v_record.last_monthly_reset >= INTERVAL '30 days' THEN
      v_record.monthly_count := 0;
      v_record.last_monthly_reset := v_now;
    END IF;

    -- Check Minute Limit
    IF v_request.minute_limit > 0 AND (v_record.minute_count + v_request.amount) > v_request.minute_limit THEN
      v_all_allowed := FALSE;
      v_reason := 'minute';
      v_limit := v_request.minute_limit;
      v_used := v_record.minute_count;
      EXIT;
    END IF;

    -- Check Daily Limit
    IF v_request.daily_limit > 0 AND (v_record.daily_count + v_request.amount) > v_request.daily_limit THEN
      v_all_allowed := FALSE;
      v_reason := 'daily';
      v_limit := v_request.daily_limit;
      v_used := v_record.daily_count;
      EXIT;
    END IF;

    -- Check Monthly Limit
    IF v_request.monthly_limit > 0 AND (v_record.monthly_count + v_request.amount) > v_request.monthly_limit THEN
      v_all_allowed := FALSE;
      v_reason := 'monthly';
      v_limit := v_request.monthly_limit;
      v_used := v_record.monthly_count;
      EXIT;
    END IF;
  END LOOP;

  -- Second pass: If all allowed, commit the increments
  IF v_all_allowed THEN
    FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(
      tool_type TEXT, 
      amount INTEGER
    )
    LOOP
      UPDATE public.usage_tracking
      SET 
        minute_count = CASE 
          WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN amount 
          ELSE minute_count + amount 
        END,
        last_minute_reset = CASE 
          WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_now 
          ELSE last_minute_reset 
        END,
        daily_count = CASE 
          WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN amount 
          ELSE daily_count + amount 
        END,
        last_daily_reset = CASE 
          WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_now 
          ELSE last_daily_reset 
        END,
        monthly_count = CASE 
          WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN amount 
          ELSE monthly_count + amount 
        END,
        last_monthly_reset = CASE 
          WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_now 
          ELSE last_monthly_reset 
        END,
        updated_at = v_now
      WHERE (p_user_id IS NOT NULL AND user_id = p_user_id AND tool_type = v_request.tool_type)
         OR (p_anon_id IS NOT NULL AND anon_id = p_anon_id AND tool_type = v_request.tool_type);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_all_allowed,
    'reason', v_reason,
    'limit', v_limit,
    'used', v_used
  );
END;
$$;

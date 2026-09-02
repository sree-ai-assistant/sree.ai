-- ============================================================
-- Sree AI — Complete Database Schema (Production Replica)
-- Generated: 2026-09-02 from live Supabase instance
-- ============================================================
-- USAGE: Run this entire file in Supabase SQL Editor or via CLI:
--   supabase db query -f full-schema.sql
-- ============================================================

-- =============================================
-- 0. EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- =============================================
-- 1. PROFILES
-- Auto-created via trigger when a user signs up
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  occupation TEXT,
  description TEXT,
  date_of_birth DATE,
  custom_instructions TEXT,
  more_about_you TEXT,
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'pro', 'elite', 'business')),
  requests_remaining INTEGER DEFAULT 10,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  -- Usage limits per tier (0 = managed by backend logic)
  chat_limit_daily INTEGER DEFAULT 0,
  chat_limit_monthly INTEGER DEFAULT 0,
  voice_limit_daily INTEGER DEFAULT 0,
  voice_limit_monthly INTEGER DEFAULT 0,
  image_limit_daily INTEGER DEFAULT 0,
  image_limit_monthly INTEGER DEFAULT 0,
  upload_limit_mb INTEGER DEFAULT 10,
  download_limit_hourly INTEGER DEFAULT 10,
  download_limit_daily INTEGER DEFAULT 50,
  -- Usage counters (synced by increment_multi_usage RPC)
  chat_count_daily NUMERIC DEFAULT 0,
  chat_count_monthly NUMERIC DEFAULT 0,
  voice_count_daily NUMERIC DEFAULT 0,
  voice_count_monthly NUMERIC DEFAULT 0,
  image_count_daily NUMERIC DEFAULT 0,
  image_count_monthly NUMERIC DEFAULT 0,
  download_count_hourly INTEGER DEFAULT 0,
  download_count_daily INTEGER DEFAULT 0,
  last_download_at TIMESTAMPTZ DEFAULT NOW(),
  -- Legal & agreements
  file_upload_agreed BOOLEAN NOT NULL DEFAULT FALSE,
  file_upload_agreed_at TIMESTAMPTZ DEFAULT NULL,
  cookie_consent BOOLEAN NOT NULL DEFAULT FALSE,
  cookie_consent_at TIMESTAMPTZ,
  tos_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  tos_accepted_at TIMESTAMPTZ,
  privacy_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_accepted_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles — auto-created via trigger on auth.users insert';
COMMENT ON COLUMN public.profiles.plan_type IS 'Current plan: free | starter | pro | elite | business';
COMMENT ON COLUMN public.profiles.upload_limit_mb IS 'Max file upload size in MB per plan: Free=10, Starter=50, Pro=250';

-- =============================================
-- 2. SUBSCRIPTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT,
  razorpay_subscription_id TEXT,
  razorpay_plan_id TEXT,
  razorpay_payment_id TEXT,
  status TEXT,
  tier TEXT DEFAULT 'free',
  billing_period TEXT DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'annually')),
  billing_cycle_start TIMESTAMPTZ,
  billing_cycle_end TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  amount_paid INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  cancel_at_cycle_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  upcoming_tier TEXT CHECK (upcoming_tier IS NULL OR upcoming_tier IN ('free', 'starter', 'pro')),
  upcoming_period TEXT CHECK (upcoming_period IS NULL OR upcoming_period IN ('monthly', 'annually')),
  upcoming_razorpay_sub_id TEXT,
  upcoming_start_date TIMESTAMPTZ,
  pending_activation_sub_id TEXT,
  previous_tier TEXT CHECK (previous_tier IS NULL OR previous_tier IN ('free', 'starter', 'pro')),
  previous_period TEXT CHECK (previous_period IS NULL OR previous_period IN ('monthly', 'annually')),
  previous_razorpay_sub_id TEXT,
  payment_failure_count INTEGER DEFAULT 0,
  last_payment_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS 'Razorpay subscription records — one per user';

-- =============================================
-- 3. PAYMENT HISTORY
-- =============================================
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  razorpay_subscription_id TEXT,
  amount INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
  method TEXT,
  tier TEXT,
  billing_period TEXT,
  notes JSONB DEFAULT '{}'::jsonb,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.payment_history IS 'Payment transaction history';

CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON public.payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_razorpay_payment_id ON public.payment_history(razorpay_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_history_unique_payment_id ON public.payment_history(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- =============================================
-- 4. CONVERSATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id TEXT,
  title TEXT DEFAULT 'New Chat',
  type TEXT DEFAULT 'chat' CHECK (type IN ('chat', 'voice')),
  videos_in_conversation JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.conversations IS 'Chat conversations — supports both authenticated and anonymous users';
CREATE INDEX IF NOT EXISTS idx_conversations_anon ON public.conversations(anon_id);

-- =============================================
-- 5. MESSAGES
-- =============================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.messages IS 'Chat messages — role is user | assistant | system';

-- =============================================
-- 6. ANONYMOUS USERS
-- =============================================
CREATE TABLE IF NOT EXISTS public.anonymous_users (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  anon_id TEXT UNIQUE NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  daily_chat_count INTEGER DEFAULT 0,
  daily_voice_count INTEGER DEFAULT 0,
  request_minute_count INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  migrated_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  migrated_at TIMESTAMPTZ,
  cookie_consent BOOLEAN NOT NULL DEFAULT FALSE,
  cookie_consent_at TIMESTAMPTZ
);

COMMENT ON TABLE public.anonymous_users IS 'Tracks anonymous visitors for rate limiting without requiring authentication';

CREATE INDEX IF NOT EXISTS idx_anon_users_anon_id ON public.anonymous_users(anon_id);
CREATE INDEX IF NOT EXISTS idx_anon_users_fingerprint ON public.anonymous_users(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_anon_users_ip_hash ON public.anonymous_users(ip_hash);
CREATE INDEX IF NOT EXISTS idx_anon_users_fingerprint_ip ON public.anonymous_users(fingerprint_hash, ip_hash);

-- =============================================
-- 7. USAGE TRACKING
-- =============================================
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id TEXT,
  tool_type TEXT NOT NULL CHECK (tool_type IN ('chat', 'voice', 'image', 'file_upload', 'download', 'tts', 'stt', 'video')),
  minute_count NUMERIC DEFAULT 0,
  last_minute_reset TIMESTAMPTZ DEFAULT NOW(),
  daily_count NUMERIC DEFAULT 0,
  last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
  monthly_count NUMERIC DEFAULT 0,
  last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),
  total_count INTEGER DEFAULT 0,
  is_byok BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT usage_tracking_user_or_anon CHECK (
    (user_id IS NOT NULL AND anon_id IS NULL) OR
    (user_id IS NULL AND anon_id IS NOT NULL)
  ),
  CONSTRAINT usage_tracking_unique_user_tool UNIQUE (user_id, tool_type),
  CONSTRAINT usage_tracking_unique_anon_tool UNIQUE (anon_id, tool_type)
);

COMMENT ON TABLE public.usage_tracking IS 'Unified usage tracking for rate limiting';

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user ON public.usage_tracking(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_tracking_anon ON public.usage_tracking(anon_id) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_tracking_tool ON public.usage_tracking(tool_type);

-- =============================================
-- 8. API KEYS (BYOK)
-- =============================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT,
  name TEXT,
  in_use BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.api_keys IS 'User-provided API keys (BYOK) — encrypted with AES-256';

-- =============================================
-- 9. AI MODELS REGISTRY
-- =============================================
CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT DEFAULT 'nvidia',
  tier_required TEXT DEFAULT 'free' CHECK (tier_required IN ('free', 'starter', 'pro', 'elite')),
  description TEXT,
  max_tokens INTEGER DEFAULT 4096,
  context_window INTEGER,
  is_vision BOOLEAN DEFAULT FALSE,
  is_image BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  is_fast BOOLEAN DEFAULT FALSE,
  is_new BOOLEAN DEFAULT FALSE,
  in_maintenance BOOLEAN DEFAULT FALSE,
  img_no_can_process INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ai_models IS 'Registry of supported AI models and their plan requirements';

-- =============================================
-- 10. USER IMAGES (Gallery)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_images (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  seed BIGINT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_images IS 'Generated image gallery for users';

-- =============================================
-- 11. USER VIDEOS (Gallery)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_videos (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  duration NUMERIC,
  aspect_ratio TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_videos IS 'Generated video gallery for users';

-- =============================================
-- 12. USER SESSIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT,
  os TEXT,
  browser TEXT,
  location TEXT,
  ip_address TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_sessions IS 'Active user sessions per device';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_user_device ON public.user_sessions(user_id, device_id);
CREATE INDEX IF NOT EXISTS user_sessions_device_id_idx ON public.user_sessions(device_id);

-- =============================================
-- 13. TRUSTED DEVICES
-- =============================================
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  name TEXT,
  os TEXT,
  browser TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

COMMENT ON TABLE public.trusted_devices IS 'Known devices that have been seen before';

-- =============================================
-- 14. ABUSE FLAGS
-- =============================================
CREATE TABLE IF NOT EXISTS public.abuse_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  fingerprint_hash TEXT,
  ip_hash TEXT,
  flag_type TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  escalation_count INTEGER DEFAULT 0
);

COMMENT ON TABLE public.abuse_flags IS 'Tracks abuse flags for identity-based abuse detection';

CREATE INDEX IF NOT EXISTS idx_abuse_flags_anon_id ON public.abuse_flags(anon_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abuse_flags_fingerprint ON public.abuse_flags(fingerprint_hash) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abuse_flags_ip_hash ON public.abuse_flags(ip_hash) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abuse_flags_user_id ON public.abuse_flags(user_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abuse_flags_user_email ON public.abuse_flags(user_email) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abuse_flags_expires ON public.abuse_flags(expires_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abuse_flags_type ON public.abuse_flags(flag_type) WHERE resolved_at IS NULL;

-- =============================================
-- 15. FEATURE REQUESTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  category_label TEXT,
  priority TEXT NOT NULL DEFAULT 'helpful',
  description TEXT NOT NULL,
  use_case TEXT,
  steps_to_reproduce TEXT,
  screenshot_url TEXT,
  reference_url TEXT,
  user_name TEXT,
  user_email TEXT,
  user_plan TEXT DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'Raised' CHECK (status IN ('Raised', 'In Progress', 'Resolved', 'Rejected')),
  admin_notes TEXT,
  notify_on_update BOOLEAN DEFAULT TRUE,
  client_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.feature_requests IS 'User-submitted feature requests with ticket system';

CREATE INDEX IF NOT EXISTS idx_feature_requests_user_id ON public.feature_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_anon_id ON public.feature_requests(anon_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_ticket_id ON public.feature_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON public.feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON public.feature_requests(created_at DESC);

-- =============================================
-- 16. APP CONFIG (Key-Value Store)
-- =============================================
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

COMMENT ON TABLE public.app_config IS 'Runtime application configuration key-value store';

INSERT INTO public.app_config (key, value) VALUES
  ('cleanup_secret', 'your_cleanup_secret_here'),
  ('razorpay_offer_id_pro', ''),
  ('razorpay_offer_id_starter', ''),
  ('razorpay_plan_pro_monthly', ''),
  ('razorpay_plan_starter_monthly', ''),
  ('supabase_url', 'https://your-project.supabase.co'),
  ('video_byok_only_banner', 'true')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- 17. CLEANUP LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS public.cleanup_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id UUID DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL,
  item_id UUID,
  plan_type TEXT,
  age_days INTEGER,
  title TEXT,
  r2_urls TEXT[],
  metadata JSONB,
  user_email TEXT,
  user_or_anon_id TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.cleanup_logs IS 'Audit log for automated cleanup operations';

CREATE INDEX IF NOT EXISTS idx_cleanup_logs_run_id ON public.cleanup_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_logs_deleted_at ON public.cleanup_logs(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleanup_logs_user_email ON public.cleanup_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_cleanup_logs_user_or_anon_id ON public.cleanup_logs(user_or_anon_id);


-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES: PROFILES
-- =============================================
CREATE POLICY "Users can view their own profile." ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- RLS POLICIES: SUBSCRIPTIONS
-- =============================================
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscriptions." ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: PAYMENT HISTORY
-- =============================================
CREATE POLICY "Users can read own payment history" ON public.payment_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages payment history" ON public.payment_history
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: CONVERSATIONS
-- =============================================
CREATE POLICY "Users can view own conversations" ON public.conversations
  FOR SELECT USING (
    (auth.uid() = user_id) OR
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Users can create own conversations" ON public.conversations
  FOR INSERT WITH CHECK (
    (auth.uid() = user_id) OR
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Users can update own conversations" ON public.conversations
  FOR UPDATE USING (
    (auth.uid() = user_id) OR
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Users can delete own conversations" ON public.conversations
  FOR DELETE USING (
    (auth.uid() = user_id) OR
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Service role full access to conversations" ON public.conversations
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- RLS POLICIES: MESSAGES
-- =============================================
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (
        (conversations.user_id = auth.uid()) OR
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

CREATE POLICY "Users can insert messages into their conversations" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (
        (conversations.user_id = auth.uid()) OR
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

CREATE POLICY "Users can update messages in their conversations" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (
        (conversations.user_id = auth.uid()) OR
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (
        (conversations.user_id = auth.uid()) OR
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

CREATE POLICY "Users can delete messages in their conversations" ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND (
        (conversations.user_id = auth.uid()) OR
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

CREATE POLICY "Service role full access to messages" ON public.messages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- RLS POLICIES: ANONYMOUS USERS
-- =============================================
CREATE POLICY "Service role full access on anonymous_users" ON public.anonymous_users
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- RLS POLICIES: USAGE TRACKING
-- =============================================
CREATE POLICY "Service role full access on usage_tracking" ON public.usage_tracking
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can read own usage" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: API KEYS
-- =============================================
CREATE POLICY "Users can manage their own API keys." ON public.api_keys
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: AI MODELS
-- =============================================
CREATE POLICY "Allow read for all authenticated users" ON public.ai_models
  FOR SELECT TO authenticated USING (true);

-- =============================================
-- RLS POLICIES: USER IMAGES
-- =============================================
CREATE POLICY "Users can view their own images" ON public.user_images
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own images" ON public.user_images
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images" ON public.user_images
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: USER VIDEOS
-- =============================================
CREATE POLICY "Users can view their own videos" ON public.user_videos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own videos" ON public.user_videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own videos" ON public.user_videos
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: USER SESSIONS
-- =============================================
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON public.user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: TRUSTED DEVICES
-- =============================================
CREATE POLICY "Users can view their own trusted devices" ON public.trusted_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trusted devices" ON public.trusted_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trusted devices" ON public.trusted_devices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trusted devices" ON public.trusted_devices
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES: ABUSE FLAGS (Service-only)
-- =============================================
CREATE POLICY "service_role_only" ON public.abuse_flags
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- RLS POLICIES: FEATURE REQUESTS
-- =============================================
CREATE POLICY "Users can view own feature requests" ON public.feature_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert feature requests" ON public.feature_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role full access on feature_requests" ON public.feature_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================
-- RPC FUNCTIONS
-- =============================================

-- -----------------------------------------------
-- decrement_requests: Legacy credit decrement
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.decrement_requests(user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET credits = GREATEST(0, credits - 1)
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- increment_usage: Single-tool usage tracking
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_anon_id TEXT,
  p_tool_type TEXT,
  p_amount NUMERIC,
  p_minute_limit NUMERIC,
  p_daily_limit NUMERIC,
  p_monthly_limit NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_usage RECORD;
  v_allowed BOOLEAN := TRUE;
  v_minute_count NUMERIC;
  v_daily_count NUMERIC;
  v_monthly_count NUMERIC;
  v_last_minute_reset TIMESTAMPTZ;
  v_last_daily_reset TIMESTAMPTZ;
  v_last_monthly_reset TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_usage FROM public.usage_tracking
    WHERE user_id = p_user_id AND tool_type = p_tool_type FOR UPDATE;
  ELSE
    SELECT * INTO v_usage FROM public.usage_tracking
    WHERE anon_id = p_anon_id AND tool_type = p_tool_type FOR UPDATE;
  END IF;

  IF v_usage IS NULL THEN
    v_minute_count := 0; v_daily_count := 0; v_monthly_count := 0;
    v_last_minute_reset := v_now; v_last_daily_reset := v_now; v_last_monthly_reset := v_now;
  ELSE
    IF v_now - v_usage.last_minute_reset >= INTERVAL '1 minute' THEN
      v_minute_count := 0; v_last_minute_reset := v_now;
    ELSE
      v_minute_count := v_usage.minute_count; v_last_minute_reset := v_usage.last_minute_reset;
    END IF;
    IF v_now - v_usage.last_daily_reset >= INTERVAL '1 day' THEN
      v_daily_count := 0; v_last_daily_reset := v_now;
    ELSE
      v_daily_count := v_usage.daily_count; v_last_daily_reset := v_usage.last_daily_reset;
    END IF;
    IF v_now - v_usage.last_monthly_reset >= INTERVAL '30 days' THEN
      v_monthly_count := 0; v_last_monthly_reset := v_now;
    ELSE
      v_monthly_count := v_usage.monthly_count; v_last_monthly_reset := v_usage.last_monthly_reset;
    END IF;
  END IF;

  IF (p_minute_limit > 0 AND v_minute_count + p_amount > p_minute_limit) OR
     (p_daily_limit > 0 AND v_daily_count + p_amount > p_daily_limit) OR
     (p_monthly_limit > 0 AND v_monthly_count + p_amount > p_monthly_limit) THEN
    v_allowed := FALSE;
  END IF;

  IF v_allowed THEN
    IF v_usage IS NULL THEN
      INSERT INTO public.usage_tracking (
        user_id, anon_id, tool_type,
        minute_count, daily_count, monthly_count,
        last_minute_reset, last_daily_reset, last_monthly_reset
      ) VALUES (
        p_user_id, p_anon_id, p_tool_type,
        p_amount, p_amount, p_amount,
        v_now, v_now, v_now
      );
    ELSE
      UPDATE public.usage_tracking SET
        minute_count = v_minute_count + p_amount,
        daily_count = v_daily_count + p_amount,
        monthly_count = v_monthly_count + p_amount,
        last_minute_reset = v_last_minute_reset,
        last_daily_reset = v_last_daily_reset,
        last_monthly_reset = v_last_monthly_reset,
        updated_at = v_now
      WHERE id = v_usage.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_minute', CASE WHEN v_allowed THEN v_minute_count + p_amount ELSE v_minute_count END,
    'current_daily', CASE WHEN v_allowed THEN v_daily_count + p_amount ELSE v_daily_count END,
    'current_monthly', CASE WHEN v_allowed THEN v_monthly_count + p_amount ELSE v_monthly_count END,
    'limit_minute', p_minute_limit,
    'limit_daily', p_daily_limit,
    'limit_monthly', p_monthly_limit
  );
END;
$$;

-- -----------------------------------------------
-- increment_multi_usage: Atomic multi-tool usage
-- tracking with auto-reset and profile sync
-- -----------------------------------------------
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
  v_chat_daily NUMERIC := 0;
  v_chat_monthly NUMERIC := 0;
  v_voice_daily NUMERIC := 0;
  v_voice_monthly NUMERIC := 0;
  v_image_daily NUMERIC := 0;
  v_image_monthly NUMERIC := 0;
BEGIN
  IF p_user_id IS NULL AND p_anon_id IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object('allowed', false, 'reason', 'invalid_identity'));
  END IF;

  FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(
    tool_type TEXT, amount NUMERIC, minute_limit INTEGER, daily_limit INTEGER, monthly_limit INTEGER
  )
  LOOP
    IF p_user_id IS NOT NULL THEN
      SELECT * INTO v_record FROM public.usage_tracking
      WHERE user_id = p_user_id AND tool_type = v_request.tool_type FOR UPDATE;
    ELSE
      SELECT * INTO v_record FROM public.usage_tracking
      WHERE anon_id = p_anon_id AND tool_type = v_request.tool_type FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      INSERT INTO public.usage_tracking (user_id, anon_id, tool_type)
      VALUES (p_user_id, p_anon_id, v_request.tool_type) RETURNING * INTO v_record;
    END IF;

    IF v_now - v_record.last_minute_reset >= INTERVAL '1 minute' THEN v_record.minute_count := 0; END IF;
    IF v_now - v_record.last_daily_reset >= INTERVAL '1 day' THEN v_record.daily_count := 0; END IF;
    IF v_now - v_record.last_monthly_reset >= INTERVAL '30 days' THEN v_record.monthly_count := 0; END IF;

    IF v_request.minute_limit > 0 AND (v_record.minute_count + v_request.amount) > v_request.minute_limit THEN
      v_all_allowed := FALSE; v_reason := 'minute'; v_limit := v_request.minute_limit; v_used := v_record.minute_count;
      v_message := 'Rate limit exceeded: ' || v_request.tool_type || ' (' || v_request.minute_limit || '/min)'; EXIT;
    END IF;
    IF v_request.daily_limit > 0 AND (v_record.daily_count + v_request.amount) > v_request.daily_limit THEN
      v_all_allowed := FALSE; v_reason := 'daily'; v_limit := v_request.daily_limit; v_used := v_record.daily_count;
      v_message := 'Daily limit reached: ' || v_request.tool_type || ' (' || v_request.daily_limit || '/day)'; EXIT;
    END IF;
    IF v_request.monthly_limit > 0 AND (v_record.monthly_count + v_request.amount) > v_request.monthly_limit THEN
      v_all_allowed := FALSE; v_reason := 'monthly'; v_limit := v_request.monthly_limit; v_used := v_record.monthly_count;
      v_message := 'Monthly limit reached: ' || v_request.tool_type || ' (' || v_request.monthly_limit || '/month)'; EXIT;
    END IF;
  END LOOP;

  IF v_all_allowed THEN
    IF p_anon_id IS NOT NULL AND p_user_id IS NULL THEN
      UPDATE public.anonymous_users SET last_seen_at = v_now WHERE anon_id = p_anon_id;
    END IF;

    FOR v_request IN SELECT * FROM jsonb_to_recordset(p_requests) AS x(tool_type TEXT, amount NUMERIC, is_byok BOOLEAN)
    LOOP
      IF p_user_id IS NOT NULL THEN
        UPDATE public.usage_tracking SET
          minute_count = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_request.amount ELSE minute_count + v_request.amount END,
          last_minute_reset = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_now ELSE last_minute_reset END,
          daily_count = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_request.amount ELSE daily_count + v_request.amount END,
          last_daily_reset = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_now ELSE last_daily_reset END,
          monthly_count = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_request.amount ELSE monthly_count + v_request.amount END,
          last_monthly_reset = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_now ELSE last_monthly_reset END,
          total_count = COALESCE(total_count, 0) + v_request.amount,
          is_byok = COALESCE(v_request.is_byok, is_byok),
          updated_at = v_now
        WHERE user_id = p_user_id AND tool_type = v_request.tool_type RETURNING * INTO v_record;
      ELSE
        UPDATE public.usage_tracking SET
          minute_count = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_request.amount ELSE minute_count + v_request.amount END,
          last_minute_reset = CASE WHEN v_now - last_minute_reset >= INTERVAL '1 minute' THEN v_now ELSE last_minute_reset END,
          daily_count = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_request.amount ELSE daily_count + v_request.amount END,
          last_daily_reset = CASE WHEN v_now - last_daily_reset >= INTERVAL '1 day' THEN v_now ELSE last_daily_reset END,
          monthly_count = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_request.amount ELSE monthly_count + v_request.amount END,
          last_monthly_reset = CASE WHEN v_now - last_monthly_reset >= INTERVAL '30 days' THEN v_now ELSE last_monthly_reset END,
          total_count = COALESCE(total_count, 0) + v_request.amount,
          is_byok = COALESCE(v_request.is_byok, is_byok),
          updated_at = v_now
        WHERE anon_id = p_anon_id AND tool_type = v_request.tool_type RETURNING * INTO v_record;
      END IF;

      IF v_request.tool_type = 'chat' THEN
        v_chat_daily := v_record.daily_count; v_chat_monthly := v_record.monthly_count;
      ELSIF v_request.tool_type = 'voice' THEN
        v_voice_daily := v_record.daily_count; v_voice_monthly := v_record.monthly_count;
      ELSIF v_request.tool_type = 'image' THEN
        v_image_daily := v_record.daily_count; v_image_monthly := v_record.monthly_count;
      END IF;
    END LOOP;

    IF p_user_id IS NOT NULL THEN
      SELECT
        COALESCE(MAX(CASE WHEN ut.tool_type = 'chat' THEN
          CASE WHEN v_now - ut.last_daily_reset >= INTERVAL '1 day' THEN 0 ELSE ut.daily_count END END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'chat' THEN
          CASE WHEN v_now - ut.last_monthly_reset >= INTERVAL '30 days' THEN 0 ELSE ut.monthly_count END END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'voice' THEN
          CASE WHEN v_now - ut.last_daily_reset >= INTERVAL '1 day' THEN 0 ELSE ut.daily_count END END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'voice' THEN
          CASE WHEN v_now - ut.last_monthly_reset >= INTERVAL '30 days' THEN 0 ELSE ut.monthly_count END END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'image' THEN
          CASE WHEN v_now - ut.last_daily_reset >= INTERVAL '1 day' THEN 0 ELSE ut.daily_count END END), 0),
        COALESCE(MAX(CASE WHEN ut.tool_type = 'image' THEN
          CASE WHEN v_now - ut.last_monthly_reset >= INTERVAL '30 days' THEN 0 ELSE ut.monthly_count END END), 0)
      INTO v_chat_daily, v_chat_monthly, v_voice_daily, v_voice_monthly, v_image_daily, v_image_monthly
      FROM public.usage_tracking ut
      WHERE ut.user_id = p_user_id AND ut.tool_type IN ('chat', 'voice', 'image');

      UPDATE public.profiles SET
        chat_count_daily = v_chat_daily, chat_count_monthly = v_chat_monthly,
        voice_count_daily = v_voice_daily, voice_count_monthly = v_voice_monthly,
        image_count_daily = v_image_daily, image_count_monthly = v_image_monthly,
        updated_at = v_now
      WHERE id = p_user_id;
    END IF;
  END IF;

  IF v_all_allowed THEN
    SELECT COALESCE(x.daily_limit, 0), COALESCE(u.daily_count, 0)
    INTO v_limit, v_used
    FROM jsonb_to_recordset(p_requests) AS x(tool_type TEXT, amount NUMERIC, daily_limit INTEGER)
    LEFT JOIN public.usage_tracking u ON
      (p_user_id IS NOT NULL AND u.user_id = p_user_id AND u.tool_type = x.tool_type) OR
      (p_anon_id IS NOT NULL AND u.anon_id = p_anon_id AND u.tool_type = x.tool_type)
    LIMIT 1;
  END IF;

  RETURN jsonb_build_array(jsonb_build_object(
    'allowed', v_all_allowed, 'reason', v_reason,
    'limit', v_limit, 'used', v_used, 'message', v_message
  ));
END;
$$;

-- -----------------------------------------------
-- migrate_anonymous_data: Migrate anonymous user
-- data to authenticated account on signup
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_anonymous_data(p_anon_id TEXT, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_usage RECORD;
BEGIN
  UPDATE public.conversations SET user_id = p_user_id, anon_id = NULL WHERE anon_id = p_anon_id;

  FOR v_usage IN SELECT * FROM public.usage_tracking WHERE anon_id = p_anon_id
  LOOP
    IF EXISTS (SELECT 1 FROM public.usage_tracking WHERE user_id = p_user_id AND tool_type = v_usage.tool_type) THEN
      UPDATE public.usage_tracking SET
        minute_count = minute_count + v_usage.minute_count,
        daily_count = daily_count + v_usage.daily_count,
        monthly_count = monthly_count + v_usage.monthly_count,
        updated_at = now()
      WHERE user_id = p_user_id AND tool_type = v_usage.tool_type;
      DELETE FROM public.usage_tracking WHERE id = v_usage.id;
    ELSE
      UPDATE public.usage_tracking SET user_id = p_user_id, anon_id = NULL, updated_at = now() WHERE id = v_usage.id;
    END IF;
  END LOOP;

  UPDATE public.abuse_flags SET user_id = p_user_id, anon_id = NULL WHERE anon_id = p_anon_id;
  UPDATE public.anonymous_users SET migrated_to_user_id = p_user_id, migrated_at = now() WHERE anon_id = p_anon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- cleanup_expired_data: Automated data cleanup
-- with R2 object deletion via Edge Function
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'cron'
AS $$
DECLARE
  v_supabase_url  text;
  v_secret        text;
  v_run_id        uuid := gen_random_uuid();
  v_conv_ids      uuid[];
  v_img_ids       uuid[];
  v_chat_items    jsonb := '[]'::jsonb;
  v_image_items   jsonb := '[]'::jsonb;
  v_conv_count    int := 0;
  v_msg_count     int := 0;
  v_img_count     int := 0;
  v_rec           record;
  v_msg_r2        text[];
  v_vid_urls      text[];
  v_all_urls      text[];
  v_item          text;
  v_key           text;
  v_owner_id      text;
BEGIN
  SELECT value INTO v_supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value INTO v_secret        FROM app_config WHERE key = 'cleanup_secret';

  IF v_supabase_url IS NULL OR v_secret IS NULL THEN
    RETURN jsonb_build_object('error', 'missing config');
  END IF;

  FOR v_rec IN
    SELECT c.id, c.title, c.updated_at, c.videos_in_conversation, c.user_id, c.anon_id, p.email AS user_email,
      CASE WHEN c.user_id IS NULL THEN 'anonymous' ELSE COALESCE(p.plan_type, 'free') END AS plan,
      EXTRACT(DAY FROM now() - c.updated_at)::int AS age_days,
      (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count
    FROM conversations c LEFT JOIN profiles p ON c.user_id = p.id
    WHERE CASE
      WHEN c.user_id IS NULL THEN c.updated_at < now() - interval '1 day'
      WHEN COALESCE(p.plan_type,'free') = 'free' THEN c.updated_at < now() - interval '30 days'
      WHEN p.plan_type = 'starter' THEN c.updated_at < now() - interval '90 days'
      WHEN p.plan_type = 'pro' THEN false
      ELSE c.updated_at < now() - interval '30 days'
    END
  LOOP
    v_owner_id := COALESCE(v_rec.user_id::text, v_rec.anon_id);

    SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::text[]) INTO v_msg_r2
    FROM messages m,
    LATERAL regexp_matches(m.content, '(https://pub-[a-f0-9]+\.r2\.dev/[a-zA-Z0-9._-]+)', 'g') AS urls(u_arr),
    LATERAL (SELECT u_arr[1] AS u) sub
    WHERE m.conversation_id = v_rec.id AND m.content LIKE '%r2.dev%';

    v_vid_urls := ARRAY[]::text[];
    IF v_rec.videos_in_conversation IS NOT NULL AND v_rec.videos_in_conversation != '[]'::jsonb THEN
      SELECT COALESCE(array_agg(u), ARRAY[]::text[]) INTO v_vid_urls
      FROM (
        SELECT jsonb_array_elements(v_rec.videos_in_conversation) ->> 'url' AS u
        UNION ALL
        SELECT jsonb_array_elements_text(jsonb_array_elements(v_rec.videos_in_conversation) -> 'frameUrls') AS u
      ) urls WHERE u LIKE '%r2.dev%';
    END IF;

    v_all_urls := v_msg_r2 || v_vid_urls;

    IF array_length(v_all_urls, 1) > 0 THEN
      FOREACH v_item IN ARRAY v_all_urls LOOP
        v_key := regexp_replace(v_item, '^.+/', '');
        v_chat_items := v_chat_items || jsonb_build_object('key', v_key, 'email', v_rec.user_email, 'owner_id', v_owner_id);
      END LOOP;
    END IF;

    INSERT INTO cleanup_logs (run_id, item_type, item_id, plan_type, age_days, title, r2_urls, metadata, user_email, user_or_anon_id)
    VALUES (v_run_id, 'conversation', v_rec.id, v_rec.plan, v_rec.age_days, v_rec.title,
      CASE WHEN array_length(v_all_urls, 1) > 0 THEN v_all_urls ELSE NULL END,
      jsonb_build_object('messages_deleted', v_rec.msg_count, 'last_activity', v_rec.updated_at),
      v_rec.user_email, v_owner_id);

    v_conv_ids := COALESCE(v_conv_ids, ARRAY[]::uuid[]) || v_rec.id;
  END LOOP;

  FOR v_rec IN
    SELECT ui.id, ui.url, ui.prompt, ui.model, ui.created_at, ui.user_id, p.email AS user_email,
      CASE WHEN ui.user_id IS NULL THEN 'anonymous' ELSE COALESCE(p.plan_type, 'free') END AS plan,
      EXTRACT(DAY FROM now() - ui.created_at)::int AS age_days
    FROM user_images ui LEFT JOIN profiles p ON ui.user_id = p.id
    WHERE CASE
      WHEN ui.user_id IS NULL THEN ui.created_at < now() - interval '1 day'
      WHEN COALESCE(p.plan_type,'free') = 'free' THEN ui.created_at < now() - interval '30 days'
      WHEN p.plan_type = 'starter' THEN ui.created_at < now() - interval '90 days'
      WHEN p.plan_type = 'pro' THEN false
      ELSE ui.created_at < now() - interval '30 days'
    END
  LOOP
    v_owner_id := v_rec.user_id::text;
    IF v_rec.url LIKE '%r2.dev%' THEN
      v_key := regexp_replace(v_rec.url, '^.+/', '');
      v_image_items := v_image_items || jsonb_build_object('key', v_key, 'email', v_rec.user_email, 'owner_id', v_owner_id);
    END IF;

    INSERT INTO cleanup_logs (run_id, item_type, item_id, plan_type, age_days, title, r2_urls, metadata, user_email, user_or_anon_id)
    VALUES (v_run_id, 'image', v_rec.id, v_rec.plan, v_rec.age_days, LEFT(v_rec.prompt, 200),
      CASE WHEN v_rec.url LIKE '%r2.dev%' THEN ARRAY[v_rec.url] ELSE NULL END,
      jsonb_build_object('model', v_rec.model, 'full_url', v_rec.url, 'created_at', v_rec.created_at),
      v_rec.user_email, v_owner_id);

    v_img_ids := COALESCE(v_img_ids, ARRAY[]::uuid[]) || v_rec.id;
  END LOOP;

  IF jsonb_array_length(v_chat_items) > 0 OR jsonb_array_length(v_image_items) > 0 THEN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/cleanup-r2-objects',
      headers := jsonb_build_object('Content-Type','application/json','x-cleanup-secret', v_secret),
      body    := jsonb_build_object('chats', v_chat_items, 'images', v_image_items)
    );
  END IF;

  IF v_conv_ids IS NOT NULL AND array_length(v_conv_ids, 1) > 0 THEN
    DELETE FROM messages WHERE conversation_id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_msg_count = ROW_COUNT;
    DELETE FROM conversations WHERE id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_conv_count = ROW_COUNT;
  END IF;

  IF v_img_ids IS NOT NULL AND array_length(v_img_ids, 1) > 0 THEN
    DELETE FROM user_images WHERE id = ANY(v_img_ids);
    GET DIAGNOSTICS v_img_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'conversations_deleted', v_conv_count,
    'messages_deleted', v_msg_count, 'images_deleted', v_img_count,
    'r2_chats_queued', jsonb_array_length(v_chat_items),
    'r2_images_queued', jsonb_array_length(v_image_items),
    'executed_at', now()
  );
END;
$$;


-- =============================================
-- GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION public.migrate_anonymous_data(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_anonymous_data(TEXT, UUID) TO service_role;

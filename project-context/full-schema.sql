-- ============================================================
-- Sree AI — Complete Database Schema
-- Ready-to-run SQL for a fresh Supabase PostgreSQL database
-- ============================================================
-- USAGE: Run this entire file in Supabase SQL Editor or via CLI:
--   supabase db query -f full-schema.sql
-- ============================================================

-- =============================================
-- 0. EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- 1. PROFILES
-- Auto-created via trigger when a user signs up
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  occupation TEXT,
  description TEXT,
  date_of_birth DATE,
  custom_instructions TEXT,
  more_about_you TEXT,
  plan_type TEXT DEFAULT 'free',
  requests_remaining INTEGER DEFAULT 0,
  has_completed_onboarding BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,
  -- Usage limits per tier
  chat_limit_daily INTEGER DEFAULT 25,
  chat_limit_monthly INTEGER DEFAULT 750,
  voice_limit_daily INTEGER DEFAULT 5,
  voice_limit_monthly INTEGER DEFAULT 150,
  image_limit_daily INTEGER DEFAULT 3,
  image_limit_monthly INTEGER DEFAULT 90,
  upload_limit_mb INTEGER DEFAULT 10,
  download_limit_hourly INTEGER DEFAULT 10,
  download_limit_daily INTEGER DEFAULT 30,
  -- Usage counters (synced by increment_multi_usage RPC)
  chat_count_daily NUMERIC DEFAULT 0,
  chat_count_monthly NUMERIC DEFAULT 0,
  voice_count_daily NUMERIC DEFAULT 0,
  voice_count_monthly NUMERIC DEFAULT 0,
  image_count_daily NUMERIC DEFAULT 0,
  image_count_monthly NUMERIC DEFAULT 0,
  download_count_hourly INTEGER DEFAULT 0,
  download_count_daily INTEGER DEFAULT 0,
  last_download_at TIMESTAMPTZ,
  -- Legal & agreements
  file_upload_agreed BOOLEAN NOT NULL DEFAULT FALSE,
  file_upload_agreed_at TIMESTAMPTZ DEFAULT NULL,
  cookie_consent BOOLEAN,
  cookie_consent_at TIMESTAMPTZ,
  tos_accepted BOOLEAN,
  tos_accepted_at TIMESTAMPTZ,
  privacy_accepted BOOLEAN,
  privacy_accepted_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles — auto-created via trigger on auth.users insert';
COMMENT ON COLUMN public.profiles.plan_type IS 'Current plan: free | starter | pro';
COMMENT ON COLUMN public.profiles.upload_limit_mb IS 'Max file upload size in MB per plan: Free=10, Starter=50, Pro=250';
COMMENT ON COLUMN public.profiles.file_upload_agreed IS 'Whether the user agreed to the file upload popup policy';

-- =============================================
-- 2. SUBSCRIPTIONS
-- One subscription per user (UNIQUE on user_id)
-- =============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT,
  razorpay_subscription_id TEXT,
  razorpay_plan_id TEXT,
  razorpay_payment_id TEXT,
  status TEXT,
  tier TEXT DEFAULT 'free',
  billing_period TEXT,
  billing_cycle_start TIMESTAMPTZ,
  billing_cycle_end TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  amount_paid INTEGER,
  currency TEXT DEFAULT 'INR',
  -- Cancellation
  cancel_at_cycle_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  -- Upcoming plan change (deferred)
  upcoming_tier TEXT,
  upcoming_period TEXT,
  upcoming_razorpay_sub_id TEXT,
  upcoming_start_date TIMESTAMPTZ,
  -- Activate-now pending
  pending_activation_sub_id TEXT,
  -- Rollback info (for failed deferred switches)
  previous_tier TEXT,
  previous_period TEXT,
  previous_razorpay_sub_id TEXT,
  -- Payment failure tracking
  payment_failure_count INTEGER DEFAULT 0,
  last_payment_failure_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS 'Razorpay subscription records — one per user';
COMMENT ON COLUMN public.subscriptions.tier IS 'Canonical tier name: free | starter | pro';
COMMENT ON COLUMN public.subscriptions.billing_cycle_start IS 'Start of current billing period';
COMMENT ON COLUMN public.subscriptions.billing_cycle_end IS 'End of current billing period';

-- =============================================
-- 3. PAYMENT HISTORY
-- =============================================
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_order_id TEXT,
  razorpay_subscription_id TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'INR',
  status TEXT,
  method TEXT,
  tier TEXT,
  billing_period TEXT,
  notes JSONB,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.payment_history IS 'Payment transaction history — razorpay_payment_id is UNIQUE';

-- =============================================
-- 4. CONVERSATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id TEXT,
  title TEXT DEFAULT 'New Chat',
  type TEXT DEFAULT 'chat',
  videos_in_conversation JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.conversations IS 'Chat conversations — supports both authenticated and anonymous users';

CREATE INDEX IF NOT EXISTS idx_conversations_anon ON public.conversations(anon_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id);

-- =============================================
-- 5. MESSAGES
-- =============================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.messages IS 'Chat messages — role is user | assistant | system';

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);

-- =============================================
-- 6. ANONYMOUS USERS
-- =============================================
CREATE TABLE IF NOT EXISTS public.anonymous_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  anon_id TEXT UNIQUE NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  -- Legacy counters
  daily_chat_count INTEGER DEFAULT 0,
  daily_voice_count INTEGER DEFAULT 0,
  request_minute_count INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  -- Migration tracking
  migrated_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  migrated_at TIMESTAMPTZ,
  -- Consent
  cookie_consent BOOLEAN,
  cookie_consent_at TIMESTAMPTZ
);

COMMENT ON TABLE public.anonymous_users IS 'Tracks anonymous visitors for rate limiting without requiring authentication';
COMMENT ON COLUMN public.anonymous_users.anon_id IS 'Client-generated UUID stored in cookie/localStorage';

CREATE INDEX IF NOT EXISTS idx_anon_users_anon_id ON public.anonymous_users(anon_id);
CREATE INDEX IF NOT EXISTS idx_anon_users_fingerprint ON public.anonymous_users(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_anon_users_ip_hash ON public.anonymous_users(ip_hash);
CREATE INDEX IF NOT EXISTS idx_anon_users_fingerprint_ip ON public.anonymous_users(fingerprint_hash, ip_hash);

-- =============================================
-- 7. USAGE TRACKING
-- Unified rate limiting for all tools
-- =============================================
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_id TEXT,
  tool_type TEXT NOT NULL CHECK (tool_type IN ('chat', 'voice', 'image', 'file_upload', 'download', 'tts', 'stt', 'video')),
  -- Per-minute tracking
  minute_count INTEGER DEFAULT 0,
  last_minute_reset TIMESTAMPTZ DEFAULT NOW(),
  -- Daily tracking
  daily_count INTEGER DEFAULT 0,
  last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
  -- Monthly tracking
  monthly_count INTEGER DEFAULT 0,
  last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),
  -- Total (all-time)
  total_count INTEGER DEFAULT 0,
  -- BYOK tracking
  is_byok BOOLEAN DEFAULT FALSE,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Constraints
  CONSTRAINT usage_tracking_user_or_anon CHECK (
    (user_id IS NOT NULL AND anon_id IS NULL) OR
    (user_id IS NULL AND anon_id IS NOT NULL)
  ),
  CONSTRAINT usage_tracking_unique_user_tool UNIQUE (user_id, tool_type),
  CONSTRAINT usage_tracking_unique_anon_tool UNIQUE (anon_id, tool_type)
);

COMMENT ON TABLE public.usage_tracking IS 'Unified usage tracking for rate limiting — supports both authenticated and anonymous users';
COMMENT ON COLUMN public.usage_tracking.is_byok IS 'Whether the last request used a user-provided API key (0.2x quota)';

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user ON public.usage_tracking(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_tracking_anon ON public.usage_tracking(anon_id) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_tracking_tool ON public.usage_tracking(tool_type);

-- =============================================
-- 8. API KEYS (BYOK — Bring Your Own Key)
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
  last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE public.api_keys IS 'User-provided API keys (BYOK) — encrypted with AES-256';

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);

-- =============================================
-- 9. AI MODELS REGISTRY
-- =============================================
CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  tier_required TEXT NOT NULL CHECK (tier_required IN ('free', 'starter', 'pro')),
  description TEXT,
  max_tokens INTEGER,
  context_window INTEGER,
  is_vision BOOLEAN DEFAULT FALSE,
  is_image BOOLEAN DEFAULT FALSE,
  is_video BOOLEAN DEFAULT FALSE,
  is_fast BOOLEAN DEFAULT FALSE,
  is_new BOOLEAN DEFAULT FALSE,
  in_maintenance BOOLEAN DEFAULT FALSE,
  img_no_can_process INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ai_models IS 'Registry of supported AI models and their plan requirements';

-- =============================================
-- 10. USER IMAGES (Gallery)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  seed INTEGER,
  width INTEGER DEFAULT 1024,
  height INTEGER DEFAULT 1024,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_images IS 'Generated image gallery for users';

CREATE INDEX IF NOT EXISTS idx_user_images_user ON public.user_images(user_id);

-- =============================================
-- 11. USER VIDEOS (Gallery)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  prompt TEXT,
  model TEXT,
  duration INTEGER DEFAULT 5,
  aspect_ratio TEXT DEFAULT '16:9',
  resolution TEXT DEFAULT '720p',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_videos IS 'Generated video gallery for users';

CREATE INDEX IF NOT EXISTS idx_user_videos_user ON public.user_videos(user_id);

-- =============================================
-- 12. USER SESSIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  os TEXT,
  browser TEXT,
  location TEXT,
  ip_address TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_sessions IS 'Active user sessions per device';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_unique ON public.user_sessions(user_id, device_id);

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.trusted_devices IS 'Known devices that have been seen before';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_unique ON public.trusted_devices(user_id, device_id);

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
  evidence JSONB DEFAULT '{}',
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

-- Pre-populate defaults
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT,
  item_type TEXT,
  item_id TEXT,
  plan_type TEXT,
  age_days INTEGER,
  title TEXT,
  r2_urls JSONB,
  metadata JSONB,
  user_email TEXT,
  user_or_anon_id TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.cleanup_logs IS 'Audit log for automated cleanup operations';


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
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access to profiles" ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: SUBSCRIPTIONS
-- =============================================
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to subscriptions" ON public.subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: PAYMENT HISTORY
-- =============================================
CREATE POLICY "Users can view own payment history" ON public.payment_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to payment_history" ON public.payment_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: CONVERSATIONS (Auth + Anonymous)
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
CREATE POLICY "Service role full access to anonymous_users" ON public.anonymous_users
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Anonymous users can read own record" ON public.anonymous_users
  FOR SELECT USING (
    anon_id = current_setting('request.headers', true)::json->>'x-anon-id'
  );

-- =============================================
-- RLS POLICIES: USAGE TRACKING
-- =============================================
CREATE POLICY "Service role full access to usage_tracking" ON public.usage_tracking
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read own usage" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anonymous users can read own usage" ON public.usage_tracking
  FOR SELECT USING (
    anon_id = current_setting('request.headers', true)::json->>'x-anon-id'
    AND user_id IS NULL
  );

-- =============================================
-- RLS POLICIES: API KEYS
-- =============================================
CREATE POLICY "Users can access own api keys" ON public.api_keys
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to api_keys" ON public.api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: AI MODELS (Public read)
-- =============================================
CREATE POLICY "Anyone can view models" ON public.ai_models
  FOR SELECT USING (true);

CREATE POLICY "Service role full access to ai_models" ON public.ai_models
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: USER IMAGES
-- =============================================
CREATE POLICY "Users can view own images" ON public.user_images
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_images" ON public.user_images
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: USER VIDEOS
-- =============================================
CREATE POLICY "Users can view own videos" ON public.user_videos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_videos" ON public.user_videos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: USER SESSIONS
-- =============================================
CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_sessions" ON public.user_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: TRUSTED DEVICES
-- =============================================
CREATE POLICY "Users can view own devices" ON public.trusted_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to trusted_devices" ON public.trusted_devices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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
-- RLS POLICIES: APP CONFIG (Public read, service write)
-- =============================================
CREATE POLICY "Anyone can read app_config" ON public.app_config
  FOR SELECT USING (true);

CREATE POLICY "Service role full access to app_config" ON public.app_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- RLS POLICIES: CLEANUP LOGS (Service-only)
-- =============================================
CREATE POLICY "Service role full access to cleanup_logs" ON public.cleanup_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.raw_user_meta_data->>'email');
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


-- -----------------------------------------------
-- migrate_anonymous_data: Migrate anonymous user
-- data to authenticated account on signup
-- -----------------------------------------------
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
  FOR v_usage IN
    SELECT * FROM public.usage_tracking WHERE anon_id = p_anon_id
  LOOP
    IF EXISTS (SELECT 1 FROM public.usage_tracking WHERE user_id = p_user_id AND tool_type = v_usage.tool_type) THEN
      -- MERGE: Add counts to existing user record
      UPDATE public.usage_tracking
      SET
        minute_count = minute_count + v_usage.minute_count,
        daily_count = daily_count + v_usage.daily_count,
        monthly_count = monthly_count + v_usage.monthly_count,
        updated_at = now()
      WHERE user_id = p_user_id AND tool_type = v_usage.tool_type;

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

GRANT EXECUTE ON FUNCTION public.migrate_anonymous_data(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_anonymous_data(TEXT, UUID) TO service_role;

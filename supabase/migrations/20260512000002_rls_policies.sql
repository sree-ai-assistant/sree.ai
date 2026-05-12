-- ============================================================
-- Migration: RLS Policies for Subscription & Rate Limiting
-- Phase 6: Database Schema & Plan Configuration
-- ============================================================

-- 1. ENABLE RLS ON NEW TABLES
ALTER TABLE public.anonymous_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- 2. ANONYMOUS USERS POLICIES
-- Anonymous users identify via anon_id passed in request header
-- Service role (backend) can perform all operations

CREATE POLICY "Service role full access to anonymous_users"
  ON public.anonymous_users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Anonymous users can read own record"
  ON public.anonymous_users
  FOR SELECT
  USING (
    anon_id = current_setting('request.headers', true)::json->>'x-anon-id'
  );

-- 3. USAGE TRACKING POLICIES
-- Authenticated users: access own records via auth.uid()
-- Anonymous users: access own records via anon_id header
-- Service role: full access for backend operations

CREATE POLICY "Service role full access to usage_tracking"
  ON public.usage_tracking
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read own usage"
  ON public.usage_tracking
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anonymous users can read own usage"
  ON public.usage_tracking
  FOR SELECT
  USING (
    anon_id = current_setting('request.headers', true)::json->>'x-anon-id'
    AND user_id IS NULL
  );

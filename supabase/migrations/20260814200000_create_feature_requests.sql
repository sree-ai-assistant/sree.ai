-- Migration: Create feature_requests table with statuses [Raised, In Progress, Resolved, Rejected]
CREATE TABLE IF NOT EXISTS feature_requests (
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
  notify_on_update BOOLEAN DEFAULT true,
  client_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_feature_requests_user_id ON feature_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_anon_id ON feature_requests(anon_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_ticket_id ON feature_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON feature_requests(created_at DESC);

-- Enable Row Level Security
ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view their own requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_requests' AND policyname = 'Users can view own feature requests'
  ) THEN
    CREATE POLICY "Users can view own feature requests"
    ON feature_requests FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Policy: Anyone can insert requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_requests' AND policyname = 'Anyone can insert feature requests'
  ) THEN
    CREATE POLICY "Anyone can insert feature requests"
    ON feature_requests FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- Policy: Service role has full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_requests' AND policyname = 'Service role full access on feature_requests'
  ) THEN
    CREATE POLICY "Service role full access on feature_requests"
    ON feature_requests FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

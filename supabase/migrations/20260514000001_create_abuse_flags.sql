CREATE TABLE abuse_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity columns (at least one must be set)
  anon_id TEXT,
  user_id UUID REFERENCES auth.users(id),
  fingerprint_hash TEXT,
  ip_hash TEXT,
  -- Flag details
  flag_type TEXT NOT NULL,  -- 'rapid_requests' | 'excessive_accounts' | 'prompt_spam' | 'cookie_reset' | 'vpn_datacenter'
  severity INTEGER NOT NULL DEFAULT 1, -- 1=warning, 2=cooldown, 3=strict, 4=captcha, 5=auth_required, 6=ip_restricted
  evidence JSONB DEFAULT '{}',
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,           -- NULL = permanent until resolved
  resolved_at TIMESTAMPTZ,          -- When the flag was cleared
  resolved_by TEXT,                  -- 'auto_expire' | 'admin' | 'user_upgrade'
  -- Metadata
  escalation_count INTEGER DEFAULT 0
);

-- Indexes for fast lookups
CREATE INDEX idx_abuse_flags_anon_id ON abuse_flags(anon_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_fingerprint ON abuse_flags(fingerprint_hash) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_ip_hash ON abuse_flags(ip_hash) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_user_id ON abuse_flags(user_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_expires ON abuse_flags(expires_at) WHERE resolved_at IS NULL;

-- RLS policy
ALTER TABLE abuse_flags ENABLE ROW LEVEL SECURITY;
-- Service-only table: no direct client access
CREATE POLICY "service_role_only" ON abuse_flags FOR ALL USING (auth.role() = 'service_role');

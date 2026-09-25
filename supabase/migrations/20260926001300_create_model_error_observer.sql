-- Migration: Create model_error_counters table and RPC functions
-- Description: Adds infrastructure for the AI Model Error Observer system.
-- The observer auto-flags models as in_maintenance after repeated upstream API errors.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Table: model_error_counters
-- Tracks API error counts per model per HTTP status code.
-- One row per (model_id, status_code) pair, upserted on each error report.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.model_error_counters (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         text        NOT NULL,
  status_code      int4        NOT NULL,
  error_count      int4        NOT NULL DEFAULT 0,
  last_error_at    timestamptz NOT NULL DEFAULT now(),
  last_error_message text      NULL,
  first_error_at   timestamptz NOT NULL DEFAULT now(),
  flagged_at       timestamptz NULL,
  window_reset_at  timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_model_status UNIQUE (model_id, status_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_counters_model
  ON public.model_error_counters (model_id);

CREATE INDEX IF NOT EXISTS idx_error_counters_flagged
  ON public.model_error_counters (flagged_at)
  WHERE flagged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_counters_last_error
  ON public.model_error_counters (last_error_at);

-- RLS (backend-only table)
ALTER TABLE public.model_error_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.model_error_counters
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.model_error_counters IS
  'Tracks upstream API error counts per model per HTTP status code. Used by the model error observer to auto-flag models as in_maintenance after repeated failures.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. RPC: report_model_error
-- Atomically increments the error counter for a model+status_code pair.
-- Returns the new error_count so the backend can check against threshold.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.report_model_error(
  p_model_id text,
  p_status_code int,
  p_error_message text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO public.model_error_counters (model_id, status_code, error_count, last_error_at, last_error_message, first_error_at)
  VALUES (p_model_id, p_status_code, 1, now(), LEFT(p_error_message, 300), now())
  ON CONFLICT (model_id, status_code)
  DO UPDATE SET
    error_count = model_error_counters.error_count + 1,
    last_error_at = now(),
    last_error_message = COALESCE(LEFT(EXCLUDED.last_error_message, 300), model_error_counters.last_error_message)
  RETURNING error_count INTO v_count;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.report_model_error IS
  'Atomically increments the error counter for a model+status_code pair and returns the new count. Used by the model error observer service.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RPC: reset_stale_error_counters
-- Resets error counters that haven't seen an error in the given hours.
-- Only resets counters that haven't triggered a flag (flagged_at IS NULL).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reset_stale_error_counters(
  p_hours int DEFAULT 12
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset_count int;
BEGIN
  UPDATE public.model_error_counters
  SET
    error_count = 0,
    window_reset_at = now(),
    first_error_at = now()
  WHERE
    last_error_at < now() - (p_hours || ' hours')::interval
    AND flagged_at IS NULL
    AND error_count > 0;

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$;

COMMENT ON FUNCTION public.reset_stale_error_counters IS
  'Resets error counters older than p_hours that have not triggered a maintenance flag. Called periodically by the model observer service.';

/**
 * ModelObserver — Hybrid error tracking for automatic model maintenance flagging.
 *
 * Architecture:
 * - In-memory Map for instant, zero-latency error counting (hot path)
 * - Supabase `model_error_counters` table for persistence and admin visibility (async, non-blocking)
 * - When a model accumulates ≥ ERROR_THRESHOLD errors of the same HTTP status code,
 *   it is auto-flagged as `in_maintenance = true` in the `ai_models` table.
 *
 * Only model-down status codes are tracked (404, 410, 500, 502, 503).
 * Key-level errors (401, 403, 429) and client errors (400, 413) are ignored —
 * those are already handled by apiKeyPool.service.ts.
 *
 * Counter lifecycle:
 * - Counters auto-reset every COUNTER_RESET_HOURS (12h) for un-flagged models.
 * - Flagged models stay flagged until manually cleared via admin/dashboard.
 * - Server restart naturally clears in-memory counters (fresh start).
 */

import { supabaseAdmin } from '../lib/supabase';

// ─── Configuration ───────────────────────────────────────────────────

/** Number of errors of the same status code required to auto-flag a model */
const ERROR_THRESHOLD = 5;

/** How often to reset stale, un-flagged counters (in hours) */
const COUNTER_RESET_HOURS = 12;

/** Interval for the periodic counter reset (in ms) */
const COUNTER_RESET_INTERVAL_MS = COUNTER_RESET_HOURS * 60 * 60 * 1000;

/** Status codes that indicate a model is down/broken (not key-level or client issues) */
const FLAGGABLE_STATUS_CODES = new Set([404, 410, 500, 502, 503]);

// ─── In-Memory State ─────────────────────────────────────────────────

/**
 * In-memory error counter.
 * Key: model_id → Map<statusCode, count>
 */
const modelErrorCounters = new Map<string, Map<number, number>>();

/**
 * Set of models already flagged in this process lifetime.
 * Prevents redundant DB writes for the same model.
 */
const alreadyFlagged = new Set<string>();

/** Handle for the periodic reset interval (for graceful shutdown) */
let resetIntervalHandle: ReturnType<typeof setInterval> | null = null;

// ─── Core API ────────────────────────────────────────────────────────

/**
 * Report a model error from an upstream API call.
 *
 * This is the main entry point — called from route error handlers.
 * It is fully non-blocking: in-memory counting is synchronous,
 * and the Supabase write is fire-and-forget.
 *
 * @param modelId    - The model_id that returned an error (e.g. 'meta/llama-3.1-70b-instruct')
 * @param statusCode - The HTTP status code from the upstream provider
 * @param errorMessage - Optional truncated error message for diagnostics
 */
export function reportModelError(
  modelId: string,
  statusCode: number,
  errorMessage?: string,
): void {
  // Guard: only track model-down status codes
  if (!modelId || !FLAGGABLE_STATUS_CODES.has(statusCode)) {
    return;
  }

  // Guard: don't count errors for already-flagged models (avoid noise)
  if (alreadyFlagged.has(modelId)) {
    return;
  }

  // ── In-memory counting (synchronous, zero-latency) ──
  if (!modelErrorCounters.has(modelId)) {
    modelErrorCounters.set(modelId, new Map());
  }
  const statusMap = modelErrorCounters.get(modelId)!;
  const currentCount = (statusMap.get(statusCode) || 0) + 1;
  statusMap.set(statusCode, currentCount);

  console.log(
    `[ModelObserver] 📊 ${modelId} | ${statusCode} | count: ${currentCount}/${ERROR_THRESHOLD}`
  );

  // ── Threshold check: auto-flag if reached ──
  if (currentCount >= ERROR_THRESHOLD) {
    console.warn(
      `[ModelObserver] 🚨 THRESHOLD REACHED: ${modelId} has ${currentCount} × ${statusCode} errors — flagging as in_maintenance`
    );
    alreadyFlagged.add(modelId);
    flagModelMaintenance(modelId, statusCode, currentCount, errorMessage);
  }

  // ── Async Supabase persistence (fire-and-forget) ──
  persistErrorToSupabase(modelId, statusCode, errorMessage).catch((err) => {
    // Never let persistence failure affect the main flow
    console.error(`[ModelObserver] Supabase persistence failed (non-fatal):`, err.message);
  });
}

// ─── Internal: Flag Model ────────────────────────────────────────────

/**
 * Flag a model as in_maintenance in the ai_models table.
 * Also updates the model_error_counters row with a flagged_at timestamp.
 * Logs prominently and captures a PostHog event.
 */
async function flagModelMaintenance(
  modelId: string,
  statusCode: number,
  errorCount: number,
  errorMessage?: string,
): Promise<void> {
  try {
    // 1. Set in_maintenance = true on the ai_models table
    const { error: updateError } = await supabaseAdmin
      .from('ai_models')
      .update({ in_maintenance: true })
      .eq('model_id', modelId);

    if (updateError) {
      console.error(`[ModelObserver] ❌ Failed to flag ${modelId}:`, updateError.message);
      // Remove from alreadyFlagged so we retry on next error
      alreadyFlagged.delete(modelId);
      return;
    }

    console.warn(
      `[ModelObserver] 🚨 AUTO-FLAGGED: ${modelId} → in_maintenance = true ` +
      `(${statusCode} × ${errorCount} | msg: ${(errorMessage || '').substring(0, 100)})`
    );

    // 2. Record flagged_at timestamp in the counters table
    try {
      await supabaseAdmin
        .from('model_error_counters')
        .update({ flagged_at: new Date().toISOString() })
        .eq('model_id', modelId)
        .eq('status_code', statusCode);
    } catch (_) { /* non-critical */ }

    // 3. PostHog event for visibility (non-blocking)
    try {
      const { posthog } = await import('./posthog.service');
      if (posthog) {
        posthog.capture({
          distinctId: 'system-model-observer',
          event: 'model_auto_flagged_maintenance',
          properties: {
            model_id: modelId,
            status_code: statusCode,
            error_count: errorCount,
            error_message: (errorMessage || '').substring(0, 200),
            threshold: ERROR_THRESHOLD,
          },
        });
      }
    } catch (_) { /* PostHog is optional — never break the flow */ }

  } catch (err: any) {
    console.error(`[ModelObserver] ❌ Unexpected error flagging ${modelId}:`, err.message);
    alreadyFlagged.delete(modelId);
  }
}

// ─── Internal: Supabase Persistence ──────────────────────────────────

/**
 * Persist error report to Supabase via the `report_model_error` RPC.
 * This is async and fire-and-forget — failures are logged but never throw.
 */
async function persistErrorToSupabase(
  modelId: string,
  statusCode: number,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('report_model_error', {
    p_model_id: modelId,
    p_status_code: statusCode,
    p_error_message: errorMessage ? errorMessage.substring(0, 300) : null,
  });

  if (error) {
    console.error(`[ModelObserver] RPC report_model_error failed:`, error.message);
  }
}

// ─── Periodic Counter Reset ──────────────────────────────────────────

/**
 * Start the periodic counter reset cron.
 * Clears in-memory counters and resets stale DB counters every COUNTER_RESET_HOURS.
 * Should be called once at server startup.
 */
export function startObserverResetCron(): void {
  if (resetIntervalHandle) {
    console.warn('[ModelObserver] Reset cron already running — skipping duplicate start');
    return;
  }

  console.log(
    `[ModelObserver] ✅ Started | threshold: ${ERROR_THRESHOLD} errors | ` +
    `reset: every ${COUNTER_RESET_HOURS}h | tracking: [${[...FLAGGABLE_STATUS_CODES].join(', ')}]`
  );

  resetIntervalHandle = setInterval(async () => {
    try {
      // 1. Clear in-memory counters (but NOT alreadyFlagged — those stay until restart)
      const modelCount = modelErrorCounters.size;
      modelErrorCounters.clear();

      // 2. Reset stale DB counters via RPC
      const { data: resetCount, error } = await supabaseAdmin.rpc('reset_stale_error_counters', {
        p_hours: COUNTER_RESET_HOURS,
      });

      if (error) {
        console.error('[ModelObserver] Counter reset RPC failed:', error.message);
      } else {
        console.log(
          `[ModelObserver] 🔄 Counter reset complete | ` +
          `in-memory: ${modelCount} models cleared | ` +
          `db: ${resetCount || 0} stale rows reset`
        );
      }
    } catch (err: any) {
      console.error('[ModelObserver] Counter reset failed:', err.message);
    }
  }, COUNTER_RESET_INTERVAL_MS);
}

/**
 * Stop the periodic reset cron. Called during graceful shutdown.
 */
export function stopObserverResetCron(): void {
  if (resetIntervalHandle) {
    clearInterval(resetIntervalHandle);
    resetIntervalHandle = null;
    console.log('[ModelObserver] Reset cron stopped');
  }
}

// ─── Diagnostics ─────────────────────────────────────────────────────

/**
 * Get current in-memory observer status for diagnostics.
 * Returns all models with active error counters.
 */
export function getObserverStatus(): {
  models: { modelId: string; counters: Record<number, number>; flagged: boolean }[];
  config: { threshold: number; resetHours: number; trackedCodes: number[] };
} {
  const models: { modelId: string; counters: Record<number, number>; flagged: boolean }[] = [];

  for (const [modelId, statusMap] of modelErrorCounters) {
    const counters: Record<number, number> = {};
    for (const [code, count] of statusMap) {
      counters[code] = count;
    }
    models.push({
      modelId,
      counters,
      flagged: alreadyFlagged.has(modelId),
    });
  }

  return {
    models,
    config: {
      threshold: ERROR_THRESHOLD,
      resetHours: COUNTER_RESET_HOURS,
      trackedCodes: [...FLAGGABLE_STATUS_CODES],
    },
  };
}

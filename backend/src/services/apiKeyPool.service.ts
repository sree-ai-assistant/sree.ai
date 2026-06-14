/**
 * ApiKeyPool — Multi-key rotation with health tracking.
 *
 * Manages pools of API keys per provider. Features:
 * - Round-robin key selection (no global mutable index — per-request)
 * - Health states: healthy | cooldown | dead
 * - Error-based rotation: 401/403 → dead, 429 → 60s cooldown, 5xx → 10s cooldown
 * - Retry count = pool size (try every key before failing)
 * - Structured logging with masked keys
 */

// ─── Types ───────────────────────────────────────────────────────────

type KeyStatus = 'healthy' | 'cooldown' | 'dead';
type ErrorType = 'auth' | 'rate_limit' | 'server' | 'other';

interface KeyState {
  key: string;
  masked: string;            // e.g. "nvapi-9E...fPU6"
  status: KeyStatus;
  cooldownUntil: number;     // epoch ms — 0 when healthy
  errorCount: number;
  lastError?: string;
  lastErrorTime?: number;
}

// ─── Error Classifier ────────────────────────────────────────────────

export function classifyApiError(error: any): ErrorType {
  const status = error.status || error.response?.status || error.statusCode;
  const msg = (error.message || '').toLowerCase();
  const detail = JSON.stringify(error.response?.data || error.data || '').toLowerCase();

  // Auth failures — key is invalid/expired
  if (
    status === 401 || status === 403 ||
    msg.includes('invalid') && msg.includes('key') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('authentication')
  ) {
    return 'auth';
  }

  // Rate limits — key needs cooldown
  if (
    status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    detail.includes('rate') && detail.includes('limit')
  ) {
    return 'rate_limit';
  }

  // Server errors — transient, short cooldown
  if (
    status === 500 || status === 502 || status === 503 || status === 504 ||
    msg.includes('timeout') ||
    msg.includes('gateway') ||
    msg.includes('service unavailable')
  ) {
    return 'server';
  }

  return 'other';
}

// ─── Mask helper ─────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (key.length <= 12) return '***';
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
}

// ─── Pool Class ──────────────────────────────────────────────────────

class ApiKeyPool {
  private pools = new Map<string, KeyState[]>();
  private roundRobinIndex = new Map<string, number>();

  /**
   * Initialize pools from environment variables.
   * Supports both plural (NVIDIA_API_KEYS=k1,k2) and singular (NVIDIA_API_KEY=k1) formats.
   * Plural takes priority; singular is used as fallback.
   */
  initialize(): void {
    const providers = ['nvidia', 'google', 'groq', 'deepgram'];

    for (const provider of providers) {
      const upper = provider.toUpperCase();
      const pluralEnv = process.env[`${upper}_API_KEYS`];
      const singularEnv = process.env[`${upper}_API_KEY`];

      const rawKeys = pluralEnv || singularEnv || '';
      const keys = rawKeys
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);

      if (keys.length > 0) {
        this.pools.set(provider, keys.map(k => ({
          key: k,
          masked: maskKey(k),
          status: 'healthy' as KeyStatus,
          cooldownUntil: 0,
          errorCount: 0,
        })));
        this.roundRobinIndex.set(provider, 0);
        console.log(`[ApiKeyPool] ✅ ${provider}: ${keys.length} key(s) loaded`);
      } else {
        console.log(`[ApiKeyPool] ⚠️  ${provider}: no keys configured`);
      }
    }
  }

  /**
   * Get the next healthy key from the pool using round-robin.
   * Skips dead keys. Promotes expired-cooldown keys back to healthy.
   * If all keys are in cooldown, returns the one with the shortest remaining wait.
   */
  getNextHealthyKey(provider: string): { key: string; index: number } | null {
    const pool = this.pools.get(provider);
    if (!pool || pool.length === 0) return null;

    const now = Date.now();
    const startIndex = this.roundRobinIndex.get(provider) || 0;

    // Pass 1: Find a healthy key
    for (let i = 0; i < pool.length; i++) {
      const idx = (startIndex + i) % pool.length;
      const state = pool[idx]!;

      if (state.status === 'dead') continue;

      // Promote expired cooldowns
      if (state.status === 'cooldown' && now >= state.cooldownUntil) {
        state.status = 'healthy';
        state.errorCount = 0;
        console.log(`[ApiKeyPool] 🔄 ${provider} key ${state.masked} cooldown expired — back to healthy`);
      }

      if (state.status === 'healthy') {
        this.roundRobinIndex.set(provider, (idx + 1) % pool.length);
        return { key: state.key, index: idx };
      }
    }

    // Pass 2: All keys are cooldown/dead — use the cooldown key closest to expiry
    const cooldownKeys = pool
      .map((s, i) => ({ state: s, index: i }))
      .filter(({ state }) => state.status === 'cooldown')
      .sort((a, b) => a.state.cooldownUntil - b.state.cooldownUntil);

    if (cooldownKeys.length > 0) {
      const best = cooldownKeys[0]!;
      console.warn(`[ApiKeyPool] ⏳ ${provider}: all keys in cooldown. Using ${best.state.masked} (expires in ${Math.ceil((best.state.cooldownUntil - now) / 1000)}s)`);
      return { key: best.state.key, index: best.index };
    }

    // All keys dead
    console.error(`[ApiKeyPool] 💀 ${provider}: ALL keys are dead. No keys available.`);
    return null;
  }

  /**
   * Report an error for a specific key. Updates health state accordingly.
   */
  reportKeyError(provider: string, keyIndex: number, errorType: ErrorType, errorMessage: string): void {
    const pool = this.pools.get(provider);
    if (!pool || !pool[keyIndex]) return;

    const state = pool[keyIndex];
    state.errorCount++;
    state.lastError = errorMessage.substring(0, 200);
    state.lastErrorTime = Date.now();

    switch (errorType) {
      case 'auth':
        state.status = 'dead';
        console.error(`[ApiKeyPool] 🔴 DEAD | ${provider} key ${state.masked} | Auth failure: ${errorMessage.substring(0, 100)}`);
        break;

      case 'rate_limit':
        state.status = 'cooldown';
        state.cooldownUntil = Date.now() + 60_000; // 60s cooldown
        console.warn(`[ApiKeyPool] 🟡 COOLDOWN 60s | ${provider} key ${state.masked} | Rate limited: ${errorMessage.substring(0, 100)}`);
        break;

      case 'server':
        state.status = 'cooldown';
        state.cooldownUntil = Date.now() + 10_000; // 10s cooldown
        console.warn(`[ApiKeyPool] 🟠 COOLDOWN 10s | ${provider} key ${state.masked} | Server error: ${errorMessage.substring(0, 100)}`);
        break;

      default:
        // Don't change status for unknown errors — just log
        console.warn(`[ApiKeyPool] ⚪ LOGGED | ${provider} key ${state.masked} | Error: ${errorMessage.substring(0, 100)}`);
    }
  }

  /** Number of total keys for a provider */
  getPoolSize(provider: string): number {
    return this.pools.get(provider)?.length || 0;
  }

  /** Number of keys currently usable (healthy or expired cooldown) */
  getHealthyKeyCount(provider: string): number {
    const pool = this.pools.get(provider);
    if (!pool) return 0;
    const now = Date.now();
    return pool.filter(s =>
      s.status === 'healthy' ||
      (s.status === 'cooldown' && now >= s.cooldownUntil)
    ).length;
  }

  /** Diagnostic: pool status for a provider */
  getPoolStatus(provider: string): { index: number; masked: string; status: KeyStatus; errorCount: number; lastError?: string | undefined }[] | null {
    const pool = this.pools.get(provider);
    if (!pool) return null;
    return pool.map((s, i) => ({
      index: i,
      masked: s.masked,
      status: s.status,
      errorCount: s.errorCount,
      lastError: s.lastError,
    }));
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

export const apiKeyPool = new ApiKeyPool();

// ─── Rotation Executor ──────────────────────────────────────────────

/**
 * Execute a function with automatic API key rotation on failure.
 *
 * - If the user has BYOK, runs once with their key (no rotation).
 * - If using system pool keys, retries up to pool.length times, rotating
 *   to the next healthy key on auth/rate-limit errors.
 *
 * @param provider   - The provider name (e.g. 'nvidia', 'google', 'groq', 'deepgram')
 * @param isByok     - Whether the user is using their own key
 * @param byokKey    - The user's BYOK key (if applicable)
 * @param executor   - The async function to execute with the resolved API key
 * @returns The result of the executor
 */
export async function executeWithKeyRotation<T>(
  provider: string,
  isByok: boolean,
  byokKey: string | null,
  executor: (apiKey: string) => Promise<T>,
): Promise<T> {
  // ── BYOK: single attempt, no rotation ──
  if (isByok && byokKey) {
    return executor(byokKey);
  }

  // ── System pool: retry with rotation ──
  const poolSize = apiKeyPool.getPoolSize(provider);
  const maxAttempts = Math.max(poolSize, 1);

  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const acquired = apiKeyPool.getNextHealthyKey(provider);

    if (!acquired) {
      throw new Error(`[ApiKeyPool] No API keys available for provider "${provider}". All keys may be dead or missing.`);
    }

    try {
      return await executor(acquired.key);
    } catch (error: any) {
      lastError = error;
      const errorType = classifyApiError(error);

      // Report the error to the pool (updates health state)
      apiKeyPool.reportKeyError(provider, acquired.index, errorType, error.message || 'Unknown error');

      // Only rotate on key-specific errors
      if (errorType === 'auth' || errorType === 'rate_limit') {
        const remaining = maxAttempts - attempt - 1;
        console.warn(`[ApiKeyPool] 🔄 Rotating key for ${provider} | Attempt ${attempt + 1}/${maxAttempts} | ${remaining} keys remaining`);
        continue;
      }

      // Server errors: retry once more with a different key
      if (errorType === 'server' && attempt < 1) {
        console.warn(`[ApiKeyPool] 🔄 Server error for ${provider}, retrying once with different key...`);
        continue;
      }

      // Other errors (token limits, content errors, etc.) — don't rotate, just throw
      throw error;
    }
  }

  // All keys exhausted
  console.error(`[ApiKeyPool] ❌ All ${maxAttempts} key(s) exhausted for provider "${provider}"`);
  throw lastError || new Error(`All API keys exhausted for provider "${provider}"`);
}

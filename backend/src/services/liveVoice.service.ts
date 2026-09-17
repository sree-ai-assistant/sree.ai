/**
 * liveVoice.service.ts — Gemini Live API session manager
 *
 * Handles:
 *  - Upstream WebSocket connections to Gemini Live API
 *  - Model fallback cascade with smart key-vs-model retry
 *  - Session setup with BidiGenerateContentSetup
 *  - Duration-based credit calculation
 */

import WebSocket from 'ws';
import { apiKeyPool, classifyApiError } from './apiKeyPool.service';
import { ApiKeyService } from './apiKey.service';

// ─── Types ───────────────────────────────────────────────────────────

export interface LiveSessionConfig {
  systemInstruction?: string;
  voiceName?: string;
}

export interface GeminiLiveSession {
  ws: WebSocket;
  model: string;
  keyIndex: number;
  provider: string;
  startTime: number;
  turnCount: number;
  isByok: boolean;
}

export interface LiveCreditResult {
  creditsToCharge: number;
  durationSeconds: number;
  turnCount: number;
}

// ─── Connection Error Classification ─────────────────────────────────

type LiveConnectionErrorType = 'key_error' | 'model_error' | 'timeout' | 'unknown';

/**
 * Typed error for Live API connection failures.
 * Allows createLiveSession to decide: retry same model with next key (key_error)
 * or skip to next model in cascade (model_error/timeout/unknown).
 */
class LiveConnectionError extends Error {
  readonly errorType: LiveConnectionErrorType;
  readonly wsCloseCode?: number;

  constructor(message: string, errorType: LiveConnectionErrorType, wsCloseCode?: number) {
    super(message);
    this.name = 'LiveConnectionError';
    this.errorType = errorType;
    if (wsCloseCode !== undefined) {
      this.wsCloseCode = wsCloseCode;
    }
  }
}

/**
 * Classify a WebSocket close code + reason into a connection error type.
 *
 * key_error:   API key issue (auth, quota, rate limit) → retry same model with different key
 * model_error: Model/config incompatibility (unsupported params, model not found) → skip to next model
 * timeout:     Connection or setup timeout → skip to next model
 * unknown:     Unclassifiable → skip to next model (conservative)
 */
export function classifyWsClose(code: number, reason: string): LiveConnectionErrorType {
  const r = reason.toLowerCase();

  // ── 1. Reason-string keywords have highest priority ──
  // Google's Live WebSocket gateway reuses close codes across domains:
  // - 1007 is used for bad payloads, but ALSO for "API key not valid. Please pass a valid API key."
  // - 1008 is used for auth/quota, but ALSO for "models/... is not found"
  // Therefore, inspect the reason text FIRST before falling back to close codes.

  // Key / auth / credential / quota errors (rotate key, retry same model)
  if (
    r.includes('api key') ||
    r.includes('api_key') ||
    (r.includes('not valid') && r.includes('key')) ||
    r.includes('authentication') ||
    r.includes('credential') ||
    r.includes('oauth') ||
    r.includes('unauthorized') ||
    r.includes('forbidden') ||
    r.includes('permission_denied') ||
    r.includes('permission denied') ||
    r.includes('quota') ||
    r.includes('rate limit') ||
    r.includes('rate_limit') ||
    r.includes('resource_exhausted') ||
    r.includes('resource exhausted') ||
    r.includes('too many requests') ||
    r.includes('consumer blocked') ||
    r.includes('billing')
  ) {
    return 'key_error';
  }

  // Model / config / payload incompatibility errors (skip to next model)
  if (
    r.includes('not found') ||
    r.includes('not supported') ||
    r.includes('invalid value') ||
    r.includes('invalid model') ||
    r.includes('unknown model') ||
    r.includes('call modelservice') ||
    r.includes('modalities') ||
    r.includes('unsupported')
  ) {
    return 'model_error';
  }

  // ── 2. Fallback to numeric close code when reason string is uninformative ──

  // 1008 = Policy Violation without specific keywords (typically quota / auth)
  if (code === 1008) return 'key_error';

  // 1007 = Invalid Frame Payload without key keywords (unsupported config/modality)
  if (code === 1007) return 'model_error';

  // 1011 = Internal Server Error — Google backend issue handling this model
  if (code === 1011) return 'model_error';

  return 'unknown';
}

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_LIVE_WSS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/**
 * Model fallback cascade — comma-separated list of models tried in order.
 *
 * env: GEMINI_LIVE_MODELS=gemini-3.8-live,gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-preview-12-2025
 *
 * Smart retry logic per model attempt:
 *   1. Get API key (BYOK user key first, then pool round-robin)
 *   2. Open WebSocket to wss://generativelanguage.googleapis.com/.../BidiGenerateContent?key=<key>
 *   3. Send BidiGenerateContentSetup JSON (model, voice, VAD config)
 *   4. Wait for { setupComplete: {...} } response within 10s timeout
 *   5. On key errors (401, 403, 429, close 1008) → report to pool, retry SAME model with next key
 *   6. On model errors (close 1007, unsupported config) → skip to NEXT model in cascade
 *   7. If ALL models × ALL keys fail → return null → frontend uses legacy STT→Chat→TTS
 */
function getModelCascade(): string[] {
  const modelsEnv = process.env.GEMINI_LIVE_MODELS;
  if (modelsEnv) {
    return modelsEnv.split(',').map(m => m.trim()).filter(Boolean);
  }

  // Default 3-model cascade if GEMINI_LIVE_MODELS is not set
  return [
    'gemini-3.8-live',
    'gemini-3.1-flash-live-preview',
    'gemini-2.5-flash-native-audio-preview-12-2025',
  ];
}

const DEFAULT_VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede';

// ─── Session Creator ─────────────────────────────────────────────────

/**
 * Create a Gemini Live API WebSocket session with model fallback cascade.
 *
 * Tries each model in GEMINI_LIVE_MODELS order with smart retry:
 *   - key_error  → retry SAME model with next API key from pool
 *   - model_error → skip to NEXT model in cascade
 *   - timeout/unknown → skip to NEXT model in cascade
 *
 * Returns null if all models fail — caller should fall back to legacy pipeline.
 */
export async function createLiveSession(
  userId: string | null,
  config: LiveSessionConfig = {}
): Promise<GeminiLiveSession | null> {
  const models = getModelCascade();

  console.log(`[LiveVoice] Model cascade: ${models.join(' → ')}`);

  // Check if user has their own Google API key (BYOK)
  let userApiKey: string | null = null;
  let isByok = false;
  if (userId) {
    const result = await ApiKeyService.getUserApiKey(userId, 'google');
    if (result.source === 'user') {
      userApiKey = result.key;
      isByok = true;
    }
  }

  // For pool keys, allow retrying the same model with different keys
  const poolSize = isByok ? 1 : apiKeyPool.getPoolSize('google');

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const maxKeyAttempts = Math.max(1, poolSize);
    let keyAttempt = 0;

    while (keyAttempt < maxKeyAttempts) {
      keyAttempt++;
      try {
        console.log(`[LiveVoice] Trying model ${i + 1}/${models.length}: ${model} (key attempt ${keyAttempt}/${maxKeyAttempts})`);
        const session = await tryConnectModel(model, userApiKey, isByok, config);
        if (session) {
          console.log(`[LiveVoice] ✅ Connected to ${model}`);
          return session;
        }
      } catch (err: any) {
        const isLiveErr = err instanceof LiveConnectionError;
        const errorType = isLiveErr ? err.errorType : 'unknown';

        console.warn(
          `[LiveVoice] ⚠️ Failed to connect to ${model} ` +
          `(key ${keyAttempt}/${maxKeyAttempts}, type: ${errorType}): ${err.message}`
        );

        if (errorType === 'key_error' && !isByok && keyAttempt < maxKeyAttempts) {
          // Key-specific error with more pool keys available → retry same model
          console.log(`[LiveVoice] 🔄 Retrying ${model} with next API key...`);
          continue;
        }

        // Model error, timeout, unknown, or all keys exhausted → skip to next model
        break;
      }
    }
  }

  console.error('[LiveVoice] ❌ All models failed. Falling back to legacy pipeline.');
  return null;
}

/**
 * Try to connect to a specific Gemini Live model.
 */
async function tryConnectModel(
  model: string,
  userApiKey: string | null,
  isByok: boolean,
  config: LiveSessionConfig
): Promise<GeminiLiveSession | null> {
  // Get API key — user's key (BYOK) or pool key
  let apiKey: string;
  let keyIndex = -1;
  const provider = 'google';

  if (userApiKey) {
    apiKey = userApiKey;
  } else {
    const poolKey = apiKeyPool.getNextHealthyKey(provider);
    if (!poolKey) {
      throw new LiveConnectionError('No Google API keys available in pool', 'key_error');
    }
    apiKey = poolKey.key;
    keyIndex = poolKey.index;
  }

  const wsUrl = `${GEMINI_LIVE_WSS_BASE}?key=${apiKey}`;

  return new Promise<GeminiLiveSession | null>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let setupComplete = false;

    // Connection timeout
    const connectTimeout = setTimeout(() => {
      if (!setupComplete) {
        ws.close();
        reject(new LiveConnectionError(`Connection timeout for ${model}`, 'timeout'));
      }
    }, 10000);

    ws.on('open', () => {
      // Send BidiGenerateContentSetup
      const systemText = config.systemInstruction ||
        'You are Sree AI, a helpful, concise, and friendly voice assistant. Keep responses brief and conversational. Do not use markdown formatting in your responses since they will be spoken aloud.';

      const setupMessage = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: config.voiceName || DEFAULT_VOICE,
                },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: systemText }],
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              prefixPaddingMs: 200,
              silenceDurationMs: 1000,
            },
          },
        },
      };

      ws.send(JSON.stringify(setupMessage));
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());

        // The setup response confirms the session is ready
        if (msg.setupComplete) {
          setupComplete = true;
          clearTimeout(connectTimeout);

          resolve({
            ws,
            model,
            keyIndex,
            provider,
            startTime: Date.now(),
            turnCount: 0,
            isByok,
          });
        }
      } catch (e) {
        // Binary data or unparseable — ignore during setup
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(connectTimeout);

      // Classify error for the API key pool health tracking
      const poolErrorType = classifyApiError(err);
      if (!isByok && keyIndex >= 0) {
        apiKeyPool.reportKeyError(provider, keyIndex, poolErrorType, err.message);
      }

      // Map pool error type → connection error type for smart retry
      const connErrorType: LiveConnectionErrorType =
        (poolErrorType === 'auth' || poolErrorType === 'rate_limit')
          ? 'key_error'
          : poolErrorType === 'server'
            ? 'model_error'
            : 'unknown';

      reject(new LiveConnectionError(err.message, connErrorType));
    });

    ws.on('close', (code: number, reason: Buffer) => {
      clearTimeout(connectTimeout);
      if (!setupComplete) {
        const reasonStr = reason?.toString() || '';
        const connErrorType = classifyWsClose(code, reasonStr);

        // Report key errors to the pool so the key gets rotated on next attempt
        if (connErrorType === 'key_error' && !isByok && keyIndex >= 0) {
          const poolErrorType = classifyApiError(new Error(reasonStr));
          const reportedType = (poolErrorType === 'auth' || poolErrorType === 'rate_limit')
            ? poolErrorType
            : 'auth';
          apiKeyPool.reportKeyError(provider, keyIndex, reportedType, `WS close ${code}: ${reasonStr}`);
        }

        reject(new LiveConnectionError(
          `WebSocket closed before setup: ${code} ${reasonStr}`,
          connErrorType,
          code
        ));
      }
    });
  });
}

// ─── Credit Calculation ──────────────────────────────────────────────

/**
 * Calculate voice credits based on session duration.
 * 
 * Duration tiers:
 *   ≤ 30s     → 1 credit
 *   31s - 2m  → 2 credits
 *   2m - 5m   → 4 credits
 *   5m - 10m  → 7 credits
 *   10m - 15m → 10 credits
 */
export function calculateLiveCredits(
  durationSeconds: number,
  turnCount: number,
  isByok: boolean
): LiveCreditResult {
  let creditsToCharge: number;

  if (durationSeconds <= 30) {
    creditsToCharge = 1;
  } else if (durationSeconds <= 120) {
    creditsToCharge = 2;
  } else if (durationSeconds <= 300) {
    creditsToCharge = 4;
  } else if (durationSeconds <= 600) {
    creditsToCharge = 7;
  } else {
    creditsToCharge = 10;
  }

  return {
    creditsToCharge,
    durationSeconds,
    turnCount,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Send a realtimeInput audio chunk to the Gemini Live session.
 * PCM data must be 16kHz 16-bit mono little-endian.
 */
export function sendAudioChunk(session: GeminiLiveSession, pcmBase64: string): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;

  const message = {
    realtimeInput: {
      audio: {
        data: pcmBase64,
        mimeType: 'audio/pcm;rate=16000',
      },
    },
  };

  session.ws.send(JSON.stringify(message));
}

/**
 * Send end-of-turn signal to Gemini.
 */
export function sendEndOfTurn(session: GeminiLiveSession): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;

  session.ws.send(JSON.stringify({
    clientContent: {
      turnComplete: true,
    },
  }));
}

/**
 * Close the upstream Gemini session gracefully.
 */
export function closeSession(session: GeminiLiveSession): void {
  if (session.ws.readyState === WebSocket.OPEN || session.ws.readyState === WebSocket.CONNECTING) {
    session.ws.close(1000, 'Session ended');
  }
}

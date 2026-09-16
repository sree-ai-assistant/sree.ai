/**
 * liveVoice.service.ts — Gemini Live API session manager
 *
 * Handles:
 *  - Upstream WebSocket connections to Gemini Live API
 *  - Model fallback cascade (primary → fallback)
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

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_LIVE_WSS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const PRIMARY_MODEL = process.env.GEMINI_LIVE_PRIMARY_MODEL || 'gemini-3.8-live';
const FALLBACK_MODEL = process.env.GEMINI_LIVE_FALLBACK_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede';

// ─── Session Creator ─────────────────────────────────────────────────

/**
 * Create a Gemini Live API WebSocket session with model fallback.
 * 
 * Tries primary model first, then fallback model.
 * Returns null if both models fail to connect.
 */
export async function createLiveSession(
  userId: string | null,
  config: LiveSessionConfig = {}
): Promise<GeminiLiveSession | null> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];

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

  for (const model of models) {
    try {
      const session = await tryConnectModel(model, userApiKey, isByok, config);
      if (session) {
        console.log(`[LiveVoice] ✅ Connected to ${model}`);
        return session;
      }
    } catch (err: any) {
      console.warn(`[LiveVoice] ⚠️ Failed to connect to ${model}:`, err.message);
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
      throw new Error('No Google API keys available in pool');
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
        reject(new Error(`Connection timeout for ${model}`));
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
      if (!isByok && keyIndex >= 0) {
        const errorType = classifyApiError(err);
        apiKeyPool.reportKeyError(provider, keyIndex, errorType, err.message);
      }
      reject(err);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      clearTimeout(connectTimeout);
      if (!setupComplete) {
        reject(new Error(`WebSocket closed before setup: ${code} ${reason?.toString()}`));
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

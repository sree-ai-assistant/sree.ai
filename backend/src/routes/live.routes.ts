/**
 * live.routes.ts — WebSocket handler for Gemini Live API voice sessions
 *
 * Accepts WebSocket connections at /api/live/voice
 * Proxies bidirectional audio between the frontend and Gemini Live API.
 *
 * Flow:
 *  1. Client upgrades to WebSocket with auth token
 *  2. Server validates auth, checks rate limits
 *  3. Server opens upstream WSS to Gemini Live API (with fallback cascade)
 *  4. Bidirectional proxy: client PCM ↔ Gemini Live API
 *  5. On close: calculate duration, charge voice credits
 */

import { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { supabaseAdmin } from '../lib/supabase';
import { checkRateLimit, checkAndIncrementMultiUsage, type RateLimitIdentity } from '../services/usage.service';
import { createLiveSession, calculateLiveCredits, closeSession, type GeminiLiveSession } from '../services/liveVoice.service';
import { voiceSessionCache } from '../middleware/rateLimit';

// ─── Types ───────────────────────────────────────────────────────────

interface ControlMessage {
  type: string;
  [key: string]: any;
}

// ─── Auth Helper ─────────────────────────────────────────────────────

async function authenticateWs(req: IncomingMessage): Promise<{
  userId: string | null;
  tier: string;
  anonId: string | null;
}> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) {
        // Get user tier
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('plan_type')
          .eq('id', user.id)
          .single();

        return {
          userId: user.id,
          tier: (profile?.plan_type || 'free').toLowerCase(),
          anonId: null,
        };
      }
    } catch (e) {
      console.warn('[LiveVoice] Auth token validation failed:', e);
    }
  }

  // Anonymous user — extract anon ID from query
  const anonId = url.searchParams.get('anonId') || null;
  return { userId: null, tier: 'anonymous', anonId };
}

// ─── WebSocket Connection Handler ────────────────────────────────────

export async function handleLiveVoiceConnection(
  clientWs: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const sessionId = `live_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[LiveVoice] New connection: ${sessionId}`);

  // 1. Authenticate
  const { userId, tier, anonId } = await authenticateWs(req);
  console.log(`[LiveVoice] Auth: userId=${userId || 'anon'}, tier=${tier}`);

  const identity: RateLimitIdentity = userId
    ? { type: 'authenticated', userId, tier: tier as any }
    : { type: 'anonymous', anonId: anonId || 'unknown', tier: 'anonymous' };

  // 2. Check voice rate limits (read-only check)
  try {
    const limitCheck = await checkRateLimit(identity, 'voice');
    if (!limitCheck.allowed) {
      const limitName = limitCheck.reason === 'minute' ? 'per minute' : limitCheck.reason === 'daily' ? 'daily' : 'monthly';
      sendControl(clientWs, {
        type: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        reason: limitCheck.reason || 'daily',
        message: `Voice ${limitName} limit reached (${limitCheck.used}/${limitCheck.limit}). Please upgrade or try again later.`,
        resetsIn: limitCheck.resetsIn,
        upgradeUrl: '/pricing',
      });
      clientWs.close(4029, 'Rate limit exceeded');
      return;
    }
  } catch (err) {
    console.error('[LiveVoice] Rate limit check failed:', err);
    // Fail open — allow the connection
  }

  // 3. Attempt to connect to Gemini Live API (with fallback cascade)
  let geminiSession: GeminiLiveSession | null = null;

  try {
    // Parse system instruction from query param if provided
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const systemInstruction = url.searchParams.get('systemInstruction') || undefined;

    geminiSession = await createLiveSession(userId, systemInstruction ? { systemInstruction } : {});
  } catch (err: any) {
    console.error('[LiveVoice] Failed to create Gemini session:', err.message);
  }

  if (!geminiSession) {
    // All models failed — tell client to use legacy pipeline
    sendControl(clientWs, {
      type: 'fallback',
      mode: 'legacy',
      reason: 'Gemini Live API unavailable. Using standard voice pipeline.',
    });
    clientWs.close(4503, 'Live API unavailable');
    return;
  }

  // 4. Session started — inform client
  sendControl(clientWs, {
    type: 'session-start',
    mode: 'live',
    model: geminiSession.model,
    sessionId,
  });

  // 5. Proxy: Gemini → Client
  geminiSession.ws.on('message', (data: Buffer | string) => {
    if (clientWs.readyState !== WebSocket.OPEN) return;

    try {
      const msg = JSON.parse(data.toString());

      // Handle server content with audio parts
      if (msg.serverContent) {
        const parts = msg.serverContent.modelTurn?.parts || [];

        for (const part of parts) {
          if (part.inlineData) {
            // Audio data — extract and forward as binary
            const audioBase64 = part.inlineData.data;
            const audioBuffer = Buffer.from(audioBase64, 'base64');

            // Send as binary frame to client
            clientWs.send(audioBuffer, { binary: true });
          }

          if (part.text) {
            sendControl(clientWs, {
              type: 'transcript',
              role: 'assistant',
              text: part.text,
            });
          }
        }

        // Forward output transcription (Gemini's text version of its spoken response)
        if (msg.serverContent.outputTranscription?.text) {
          sendControl(clientWs, {
            type: 'transcript',
            role: 'assistant',
            text: msg.serverContent.outputTranscription.text,
          });
        }

        // Forward input transcription (Gemini's transcription of user's speech)
        if (msg.serverContent.inputTranscription?.text) {
          sendControl(clientWs, {
            type: 'input-transcript',
            text: msg.serverContent.inputTranscription.text,
          });
        }

        // Handle interruption (barge-in)
        if (msg.serverContent.interrupted) {
          sendControl(clientWs, { type: 'interrupted' });
        }

        // Track turn completion
        if (msg.serverContent.turnComplete) {
          geminiSession!.turnCount++;
          sendControl(clientWs, { type: 'turn-complete' });
        }
      }

    } catch (e) {
      // Forward raw binary data (some responses may come as raw bytes)
      if (Buffer.isBuffer(data) && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: true });
      }
    }
  });

  // 6. Proxy: Client → Gemini
  clientWs.on('message', (data: Buffer | ArrayBuffer | string) => {
    if (!geminiSession || geminiSession.ws.readyState !== WebSocket.OPEN) return;

    if (typeof data === 'string') {
      // JSON control messages from client
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'audio') {
          // Client sends base64 PCM audio
          const audioMessage = {
            realtimeInput: {
              audio: {
                data: msg.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            },
          };
          geminiSession.ws.send(JSON.stringify(audioMessage));
        } else if (msg.type === 'text') {
          // Client sends text message
          const textMessage = {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: msg.text }],
              }],
              turnComplete: true,
            },
          };
          geminiSession.ws.send(JSON.stringify(textMessage));
          geminiSession.turnCount++;
        }
      } catch (e) {
        console.warn('[LiveVoice] Failed to parse client message:', e);
      }
    } else {
      // Binary PCM audio from client — wrap in realtimeInput
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const base64Audio = buffer.toString('base64');

      const audioMessage = {
        realtimeInput: {
          audio: {
            data: base64Audio,
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      };

      geminiSession.ws.send(JSON.stringify(audioMessage));
    }
  });

  // 7. Handle upstream Gemini close
  geminiSession.ws.on('close', (code: number, reason: Buffer) => {
    console.log(`[LiveVoice] Gemini upstream closed: ${code} ${reason?.toString()}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      sendControl(clientWs, {
        type: 'session-end',
        reason: 'upstream_closed',
        code,
      });
      clientWs.close(1000, 'Upstream session ended');
    }
  });

  geminiSession.ws.on('error', (err: Error) => {
    console.error('[LiveVoice] Gemini upstream error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      sendControl(clientWs, {
        type: 'error',
        code: 'UPSTREAM_ERROR',
        message: 'Voice session error. Please try again.',
      });
    }
  });

  // 8. Handle client disconnect — charge credits and cleanup
  clientWs.on('close', async (code: number) => {
    console.log(`[LiveVoice] Client disconnected: ${sessionId} (code: ${code})`);

    // Close upstream Gemini connection
    if (geminiSession) {
      const durationSeconds = (Date.now() - geminiSession.startTime) / 1000;

      // Close the upstream WebSocket
      closeSession(geminiSession);

      // Charge credits (only if session lasted > 3 seconds — prevents accidental charges)
      if (durationSeconds > 3) {
        try {
          // Prevent duplicate charges
          const chargeKey = `live_${sessionId}`;
          if (voiceSessionCache.has(chargeKey)) {
            console.log(`[LiveVoice] Session ${sessionId} already charged, skipping`);
            return;
          }
          voiceSessionCache.add(chargeKey);

          const { creditsToCharge } = calculateLiveCredits(
            durationSeconds,
            geminiSession.turnCount,
            geminiSession.isByok
          );

          const result = await checkAndIncrementMultiUsage(identity, [{
            tool: 'voice',
            amount: creditsToCharge,
            isByok: geminiSession.isByok,
            bypassLimits: true, // Don't block on close — session already happened
          }]);

          if (result.allowed) {
            console.log(`[LiveVoice] ✅ Charged ${creditsToCharge} voice credit(s) for ${Math.round(durationSeconds)}s session (${geminiSession.turnCount} turns) — user: ${userId || anonId}`);
          } else {
            console.warn(`[LiveVoice] ⚠️ Credit charge reported as not allowed: ${result.reason}`);
          }
        } catch (err) {
          console.error('[LiveVoice] Failed to charge credits:', err);
        }
      } else {
        console.log(`[LiveVoice] Session too short (${Math.round(durationSeconds)}s), no credits charged`);
      }
    }
  });

  clientWs.on('error', (err: Error) => {
    console.error(`[LiveVoice] Client WebSocket error: ${err.message}`);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sendControl(ws: WebSocket, message: ControlMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

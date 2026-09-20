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
import { LIVE_VOICE_SESSION_LIMITS_MINUTES, type PlanTier } from '../config/plans';

// ─── Types ───────────────────────────────────────────────────────────

interface ControlMessage {
  type: string;
  [key: string]: any;
}

// ─── Auth Helper ─────────────────────────────────────────────────────

interface UserPersonalizationProfile {
  nickname?: string | null;
  occupation?: string | null;
  custom_instructions?: string | null;
  more_about_you?: string | null;
}

export function buildLiveSystemPrompt(
  profile?: UserPersonalizationProfile | null,
  clientOverride?: string
): string {
  if (clientOverride && clientOverride.trim()) {
    return clientOverride.trim();
  }

  const basePrompt = `You are Sree AI, a sophisticated, helpful, and natural real-time voice and visual assistant developed by NilStudio.
You are interacting with the user in a live, bidirectional conversation where your words are spoken aloud AND your text response is rendered on a live visual screen.

CORE IDENTITY & TONE:
- Professional, warm, engaging, and articulate. Speak with natural conversational pacing and clear inflection.
- Direct & High-Signal: Get straight to the point without conversational filler ("Sure!", "Certainly!", "I can help with that").
- Safe, ethical, and trustworthy at all times.

VISUAL & MARKDOWN CAPABILITIES (CRITICAL):
- The user's screen features a full interactive rich Markdown code viewer with syntax highlighting and a copy-to-clipboard button.
- Full Multi-Language Code Support: You must support all programming languages and text formats:
  • C & C++ (use \`\`\`c or \`\`\`cpp)
  • Python (use \`\`\`python)
  • Java, C#, Go, Rust, Kotlin, Swift
  • JavaScript & TypeScript (use \`\`\`javascript or \`\`\`typescript)
  • Web: HTML, CSS, SQL, JSON, YAML
  • Shell: Bash / Zsh (use \`\`\`bash)
  • Prompts, raw text, and templates (use \`\`\`plaintext or \`\`\`markdown)
- Code Block Formatting Rules (CRITICAL FOR LIVE VISUALIZATION):
  • ALWAYS start every code block on its OWN line preceded by an empty blank line. Never join backticks to the same line as a sentence.
  • ALWAYS specify the language tag immediately after the opening backticks without spaces (e.g., \`\`\`cpp, \`\`\`python, \`\`\`html, \`\`\`java).
  • ALWAYS close code blocks with \`\`\` on its own line with NO trailing spaces. Never output "\`\`\`   ".
  • NEVER attach conversational speech or explanations to the same line as closing backticks. Put all conversational comments and explanations on separate lines outside the code block.
- Tables: Format tables using standard Markdown (| Header 1 | Header 2 |) with separator rows (|---|---|).
- When the user asks for code, data, tables, comparisons, or structured information, ALWAYS provide the complete, properly formatted Markdown so they can view the syntax highlighting and copy it.

SPOKEN CONVERSATIONAL DELIVERY:
- Complement the visual display naturally in your speech:
  • When presenting code, tables, or complex data, explain the core logic, findings, and highlights conversationally (e.g., "I've placed the C++ and Python code on your screen for you..." or "Here is the table on screen comparing...").
  • Do NOT recite table pipes ('|'), dashes, brackets, or boilerplate syntax aloud character-by-character. Speak human-friendly descriptions of what is shown.
  • Keep spoken commentary focused, clear, and easy to follow while the user looks at the visual output.

SAFETY & ACADEMIC INTEGRITY:
- Uphold strict academic honesty. Never solve live exam questions or take tests for the user.
- For learning and study requests, adopt a supportive tutor approach: guide reasoning, explain underlying concepts, and break down steps.
- For legitimate software development, analysis, and professional inquiries, provide complete, production-ready solutions and code without hesitation.

INTERACTION DYNAMICS:
- If a user's speech is unclear or inaudible, politely ask for clarification (e.g., "Sorry, I didn't quite catch that. Could you say that again?").
- Seamlessly adapt to the user's spoken language and conversational tone while maintaining your helpful persona.`;

  if (!profile) {
    return basePrompt;
  }

  const parts: string[] = [];
  if (profile.nickname?.trim()) {
    parts.push(`- Nickname / Preferred Name: "${profile.nickname.trim()}". Address the user by this name when appropriate.`);
  }
  if (profile.occupation?.trim()) {
    parts.push(`- Occupation / Background: "${profile.occupation.trim()}". Tailor domain context and examples to this profession when relevant.`);
  }
  if (profile.more_about_you?.trim()) {
    parts.push(`- About the user: "${profile.more_about_you.trim()}". Keep this background and interests in mind.`);
  }
  if (profile.custom_instructions?.trim()) {
    parts.push(`- Custom behavior, style, and tone instructions: "${profile.custom_instructions.trim()}". You MUST strictly adhere to these instructions.`);
  }

  if (parts.length > 0) {
    return `${basePrompt}\n\n### USER PERSONALIZATION CONTEXT & INSTRUCTIONS\n${parts.join('\n')}`;
  }

  return basePrompt;
}

async function authenticateWs(req: IncomingMessage): Promise<{
  userId: string | null;
  tier: string;
  anonId: string | null;
  userVoice: string | null;
  userProfile?: UserPersonalizationProfile | null;
}> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) {
        // Get user tier, voice preference, and personalization settings
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('plan_type, live_voice, nickname, occupation, custom_instructions, more_about_you')
          .eq('id', user.id)
          .single();

        return {
          userId: user.id,
          tier: (profile?.plan_type || 'free').toLowerCase(),
          anonId: null,
          userVoice: profile?.live_voice || null,
          userProfile: profile ? {
            nickname: profile.nickname,
            occupation: profile.occupation,
            custom_instructions: profile.custom_instructions,
            more_about_you: profile.more_about_you,
          } : null,
        };
      }
    } catch (e) {
      console.warn('[LiveVoice] Auth token validation failed:', e);
    }
  }

  // Anonymous user — extract anon ID from query
  const anonId = url.searchParams.get('anonId') || null;
  return { userId: null, tier: 'anonymous', anonId, userVoice: null, userProfile: null };
}

// ─── WebSocket Connection Handler ────────────────────────────────────

export async function handleLiveVoiceConnection(
  clientWs: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const sessionId = `live_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[LiveVoice] New connection: ${sessionId}`);

  // 1. Authenticate
  const { userId, tier, anonId, userVoice, userProfile } = await authenticateWs(req);
  console.log(`[LiveVoice] Auth: userId=${userId || `[anon] ${anonId}` || 'anon'}, tier=${tier}, voice=${userVoice || 'default'}, customInstructions=${Boolean(userProfile?.custom_instructions)}`);

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
    // Parse client system instruction & voice from query param if provided
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const clientSystemInstruction = url.searchParams.get('systemInstruction') || undefined;
    const requestedVoice = url.searchParams.get('voice') || userVoice || undefined;

    const systemInstruction = buildLiveSystemPrompt(userProfile, clientSystemInstruction);

    geminiSession = await createLiveSession(userId, {
      systemInstruction,
      voiceName: requestedVoice,
    });
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

  // 4. Session started — inform client with tier-based session duration limits
  const maxDurationMinutes = LIVE_VOICE_SESSION_LIMITS_MINUTES[tier as PlanTier] || 5;
  const maxDurationSeconds = maxDurationMinutes * 60;

  sendControl(clientWs, {
    type: 'session-start',
    mode: 'live',
    model: geminiSession.model,
    sessionId,
    tier,
    maxDurationMinutes,
    maxDurationSeconds,
  });

  // Server-side safety timer: cleanly end session if client exceeds continuous limit
  const sessionLimitTimer = setTimeout(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      console.log(`[LiveVoice] Session ${sessionId} reached continuous limit of ${maxDurationMinutes}m for ${tier}`);
      sendControl(clientWs, {
        type: 'session-end',
        reason: 'duration_limit_reached',
        tier,
        maxMinutes: maxDurationMinutes,
        message: `For ${tier} plan, the continuous live session limit is ${maxDurationMinutes} minutes.`,
      });
      clientWs.close(1000, 'Session duration limit reached');
    }
  }, (maxDurationSeconds + 5) * 1000);

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
        }

        // Forward output transcription (Gemini's text version of its spoken response)
        const outputText = msg.serverContent.outputTranscription?.text;
        if (outputText) {
          sendControl(clientWs, {
            type: 'transcript',
            role: 'assistant',
            text: outputText,
          });
        } else {
          // Fallback to text parts if outputTranscription is absent
          for (const part of parts) {
            if (part.text) {
              sendControl(clientWs, {
                type: 'transcript',
                role: 'assistant',
                text: part.text,
              });
            }
          }
        }

        // Forward input transcription (Gemini's transcription of user's speech)
        if (msg.serverContent.inputTranscription?.text) {
          sendControl(clientWs, {
            type: 'transcript',
            role: 'user',
            text: msg.serverContent.inputTranscription.text,
          });
          sendControl(clientWs, {
            type: 'input-transcript',
            role: 'user',
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
  clientWs.on('message', (data: Buffer | ArrayBuffer | string, isBinary: boolean) => {
    if (!geminiSession || geminiSession.ws.readyState !== WebSocket.OPEN) return;

    // Check if message is a JSON control message
    let jsonText: string | null = null;
    if (typeof data === 'string') {
      jsonText = data;
    } else if (!isBinary && Buffer.isBuffer(data)) {
      jsonText = data.toString('utf8');
    } else if (Buffer.isBuffer(data)) {
      // Even if flagged as binary, inspect if it's actually a JSON string
      const str = data.toString('utf8').trim();
      if (str.startsWith('{') && str.endsWith('}')) {
        jsonText = str;
      }
    }

    if (jsonText) {
      // JSON control messages from client
      try {
        const msg = JSON.parse(jsonText);

        if (msg.type === 'init-context' && Array.isArray(msg.messages) && msg.messages.length > 0) {
          // Seed prior conversation context from chat history
          const validTurns = msg.messages
            .slice(-50)
            .filter((m: any) => m && m.content && String(m.content).trim().length > 0 && (m.role === 'user' || m.role === 'assistant' || m.role === 'model'))
            .map((m: any) => ({
              role: (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user',
              parts: [{ text: String(m.content).trim() }],
            }));

          if (validTurns.length > 0) {
            const contextMessage = {
              clientContent: {
                turns: validTurns,
                turnComplete: false, // Seed memory without triggering immediate audio generation
              },
            };
            geminiSession.ws.send(JSON.stringify(contextMessage));
            console.log(`[LiveVoice] 🧠 Seeded ${validTurns.length} conversation messages into Live session context`);
          }
        } else if (msg.type === 'audio') {
          // Client sends base64 PCM audio in JSON
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
        console.warn('[LiveVoice] Failed to parse client JSON message:', e);
      }
    } else {
      // Binary PCM audio from client — wrap in realtimeInput
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
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
    clearTimeout(sessionLimitTimer);
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
    clearTimeout(sessionLimitTimer);
    console.log(`[LiveVoice] Client disconnected: ${sessionId} (code: ${code})`);

    // Close upstream Gemini connection
    if (geminiSession) {
      const durationSeconds = (Date.now() - geminiSession.startTime) / 1000;

      // Close the upstream WebSocket
      closeSession(geminiSession);

      // Charge credits (only if session lasted > 5 seconds — prevents accidental charges)
      if (durationSeconds > 5) {
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

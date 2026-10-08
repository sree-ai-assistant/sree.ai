import { Router } from 'express';
import { authMiddleware, starterPlanMiddleware, videoModelValidationMiddleware } from '../middleware/auth';
import { apiKeySaveRateLimiter } from '../middleware/apiKeyRateLimit';
import { flexAuthMiddleware } from '../middleware/anonymousIdentity';
import { rateLimitMiddleware, featureGateMiddleware } from '../middleware/rateLimit';
import { abuseDetectionMiddleware } from '../middleware/abuseDetection';
import { uploadSizeValidator, queuePriorityMiddleware, uploadAgreementMiddleware } from '../middleware/uploadEnforcement';
import { withPriorityQueue } from '../services/queue.service';
import { PLAN_CONFIGS as PLANS, type PlanTier } from '../config/plans';
import { aiService } from '../services/ai.service';
import { ApiKeyService } from '../services/apiKey.service';
import { executeWithKeyRotation, apiKeyPool } from '../services/apiKeyPool.service';
import { r2Service } from '../services/r2.service';
import { fileService } from '../services/file.service';
import multer from 'multer';
import fs from 'fs';
import { TokenManager } from '../utils/tokenManager';
import { supabaseAdmin } from '../lib/supabase';
import { videoService, VideoService } from '../services/video.service';
import { getUsageStatus, checkAndIncrementUsage, checkAndIncrementMultiUsage, type RateLimitIdentity } from '../services/usage.service';
import path from 'path';
import axios from 'axios';
import { reportModelError } from '../services/modelObserver.service';
import { multimodalService } from '../services/multimodal.service';
import { resolveProvider } from '../utils/providerResolver';

const router = Router();

/**
 * @route   GET /api/ai/download
 * @desc    Download an image and track usage with hourly/daily limits
 * @access  Private
 */
router.get('/download', authMiddleware, rateLimitMiddleware('download'), async (req: any, res: any) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }

  try {
    // 1. Download the image from URL
    const response = await axios.get(url as string, {
      responseType: 'stream',
      timeout: 15000 // 15s timeout
    });

    // 2. Stream back to client
    const fileName = `sree-ai-${Date.now()}.png`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');

    // Add usage info from middleware to headers
    const usage = (req as any).rateLimitInfo;
    if (usage) {
      res.setHeader('X-Usage-Daily', `${usage.used}/${usage.limit}`);
    }

    response.data.pipe(res);

  } catch (error: any) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to download image' });
    }
  }
});

/**
 * @route   POST /api/ai/track-download
 * @desc    Verify and charge 1 download credit for exporting tables/assets
 * @access  Flexible (Authenticated or Anonymous)
 */
router.post('/track-download', flexAuthMiddleware, rateLimitMiddleware('download'), async (req: any, res: any) => {
  try {
    const usage = (req as any).rateLimitInfo;
    return res.json({
      success: true,
      creditsCharged: 1,
      usage,
    });
  } catch (error: any) {
    console.error('Download tracking error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record download credit' });
  }
});

/**
 * @route   GET /api/ai/usage
 * @desc    Get comprehensive usage status for current user (authenticated or anonymous)
 * @access  Flexible
 */
router.get('/usage', flexAuthMiddleware, async (req: any, res: any) => {
  try {
    const user = req.user;
    const anonId = req.anonId;
    const tier = req.userTier || 'anonymous';

    const identity: RateLimitIdentity = user
      ? { type: 'authenticated', userId: user.id, tier }
      : { type: 'anonymous', anonId: anonId || 'unknown', tier: 'anonymous' };

    const status = await getUsageStatus(identity);
    res.json({ success: true, status });
  } catch (error: any) {
    console.error('[AI Routes] Usage Fetch Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch usage status' });
  }
});

const upload = multer({ dest: 'uploads/' });

/**
 * Stores a video reference (name + url) in the conversations.videos_in_conversation column.
 */
async function storeVideoInConversation(conversationId: string, videoName: string, videoUrl: string) {
  try {
    // Fetch current videos array
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('videos_in_conversation')
      .eq('id', conversationId)
      .single();

    const existingVideos: { name: string; url: string }[] = conv?.videos_in_conversation || [];

    // Don't add duplicates
    if (existingVideos.some(v => v.name === videoName)) {
      console.log(`[AI Route] Video "${videoName}" already stored in conversation ${conversationId}`);
      return;
    }

    existingVideos.push({ name: videoName, url: videoUrl });

    await supabaseAdmin
      .from('conversations')
      .update({ videos_in_conversation: existingVideos })
      .eq('id', conversationId);

    console.log(`[AI Route] Stored video "${videoName}" in conversation ${conversationId}. Total videos: ${existingVideos.length}`);
  } catch (err) {
    console.error('[AI Route] Error storing video in conversation:', err);
  }
}

/**
 * Checks if the user's latest message text references any previously uploaded video by filename.
 * Returns matched video references from the conversation.
 */
async function findReferencedVideos(conversationId: string, userMessageText: string): Promise<{ name: string; url: string }[]> {
  try {
    if (!conversationId || !userMessageText) return [];

    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('videos_in_conversation')
      .eq('id', conversationId)
      .single();

    const storedVideos: { name: string; url: string }[] = conv?.videos_in_conversation || [];
    if (storedVideos.length === 0) return [];

    const lowerMessage = userMessageText.toLowerCase();

    // Match if the user's message includes any stored video filename
    const matched = storedVideos.filter(v => {
      const lowerName = v.name.toLowerCase();
      // Check exact name, or name without extension
      const nameWithoutExt = lowerName.replace(/\.[^.]+$/, '');
      return lowerMessage.includes(lowerName) || lowerMessage.includes(nameWithoutExt);
    });

    if (matched.length > 0) {
      console.log(`[AI Route] User message references ${matched.length} previous video(s): ${matched.map(v => v.name).join(', ')}`);
    }

    return matched;
  } catch (err) {
    console.error('[AI Route] Error finding referenced videos:', err);
    return [];
  }
}

async function updateMessageInDb(messageId: string, updates: { content?: any, metadata?: any }) {
  try {
    const { data: currentMsg } = await supabaseAdmin
      .from('messages')
      .select('content, metadata')
      .eq('id', messageId)
      .single();

    if (currentMsg) {
      const payload: any = {};
      if (updates.content) payload.content = updates.content;
      if (updates.metadata) {
        payload.metadata = {
          ...(currentMsg.metadata || {}),
          ...updates.metadata
        };
      }

      await supabaseAdmin
        .from('messages')
        .update(payload)
        .eq('id', messageId);

      console.log(`[AI Route] Message ${messageId} updated in DB`);
    }
  } catch (dbError) {
    console.error('[AI Route] Error updating message in DB:', dbError);
  }
}

// Streaming Chat Completion
router.post('/chat', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('basicChat'), rateLimitMiddleware('chat'), withPriorityQueue(async (req: any, res) => {
  const writeSSE = (data: any) => {
    if (typeof data === 'string') {
      res.write(`data: ${data}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };

  try {
    const { v4: uuidv4 } = await import('uuid');
    const { messages, model, attachments, messageId, conversationId, reasoning_effort } = req.body;
    const validEfforts = ['minimal', 'low', 'medium', 'high', 'default', 'none'] as const;
    const reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'default' | 'none' = (validEfforts as readonly string[]).includes(reasoning_effort)
      ? reasoning_effort
      : 'minimal';
    const userId = req.user?.id; // Optional for anonymous
    const isAuth = !!userId;
    const tier = (req as any).userTier as PlanTier || 'anonymous';
    const planConfig = PLANS[tier];
    const isByok = (req as any).isByok || false;

    // 0. Model Gating: Check if user has access to the requested model
    const { data: modelInfo } = await supabaseAdmin
      .from('ai_models')
      .select('*')
      .eq('model_id', model)
      .single();

    if (modelInfo && modelInfo.tier_required !== 'free' && !planConfig.features.allModels) {
      return res.status(403).json({
        success: false,
        code: 'MODEL_LOCKED',
        message: `The selected model '${model}' requires a Starter or Pro plan.`,
        upgradeUrl: '/pricing'
      });
    }

    // Resolve provider & API key early so multimodal processing knows provider capabilities
    const provider = (req as any).provider || modelInfo?.provider || (await resolveProvider(model)) || 'nvidia';
    let apiKey = req.apiKey;
    if (!apiKey) {
      const keyResult = await ApiKeyService.getUserApiKey(isAuth ? userId : null, provider);
      apiKey = keyResult.key;
    }

    if (!apiKey) {
      const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
      return res.status(400).json({
        success: false,
        message: `${providerName} API Key not found. Please add it in settings.`
      });
    }

    // Set headers for streaming early
    // Set headers for streaming early with buffer disabling
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'none');
    // Add X-Anon-Context-Active header for anonymous users (ANON-06)
    if (tier === 'anonymous') {
      res.setHeader('X-Anon-Context-Active', 'true');
    }
    res.flushHeaders();

    // 1. Process incoming messages to include context from metadata for the AI
    // but keep it hidden from the UI (which uses the clean content)
    // 1. Shallow copy messages to avoid mutating the original array if needed
    let processedMessages = [...messages];

    // Resolve a single valid API key for multimodal direct operations (e.g. Google File API upload)
    const singleApiKey = isByok
      ? (apiKey?.trim() || '')
      : (apiKeyPool.getNextHealthyKey(provider)?.key || (apiKey?.includes(',') ? apiKey.split(',')[0]!.trim() : (apiKey?.trim() || '')));

    // Process attachments via MultimodalService (Native for Google Gemini, fallback for Groq/NVIDIA)
    if (attachments && attachments.length > 0) {
      const processed = await multimodalService.processRequestAttachments({
        attachments,
        model,
        provider,
        modelInfo,
        apiKey: singleApiKey,
        userId,
        conversationId,
        messageId,
        writeSSE,
      });

      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage && lastMessage.role === 'user') {
        if (processed.extractedContext) {
          lastMessage.metadata = {
            ...lastMessage.metadata,
            hasContext: true,
            extractedContext: (lastMessage.metadata?.extractedContext || '') + processed.extractedContext,
          };
        }

        if (processed.parts.length > 0) {
          const originalUserText = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : Array.isArray(lastMessage.content)
              ? (lastMessage.content.find((p: any) => p.type === 'text')?.text || '')
              : '';

          lastMessage.content = [
            { type: 'text', text: originalUserText || '.' },
            ...processed.parts,
          ];
        }
      }
    }

    // 2. Video Context Recall: Check if user references a previously uploaded video
    if (conversationId) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      const userText = typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : Array.isArray(lastMessage?.content)
          ? (lastMessage.content.find((p: any) => p.type === 'text')?.text || '')
          : '';

      const hasNewVideoAttachments = attachments?.some((a: any) => a.type === 'video');
      if (!hasNewVideoAttachments && userText.trim()) {
        const referencedVideos = await findReferencedVideos(conversationId, userText);
        if (referencedVideos.length > 0) {
          console.log(`[AI Route] Re-processing ${referencedVideos.length} previously uploaded video(s) for context`);
          const recallResult = await multimodalService.processVideoRecall({
            referencedVideos,
            model,
            provider,
            modelInfo,
            apiKey: singleApiKey,
            writeSSE,
          });

          if (recallResult.parts.length > 0) {
            const currentParts = Array.isArray(lastMessage.content)
              ? lastMessage.content
              : [{ type: 'text', text: userText || '.' }];

            if (recallResult.contextInstruction) {
              const textPart = currentParts.find((p: any) => p.type === 'text');
              if (textPart) {
                textPart.text += recallResult.contextInstruction;
              }
            }

            lastMessage.content = [...currentParts, ...recallResult.parts];
          }
        }
      }
    }

    // 3. Prepare apiMessages for model inference
    let apiMessages = processedMessages.map((msg: any, index: number) => {
      // If msg.content is already a multimodal array (e.g. prepared from multimodal parts), preserve it
      if (Array.isArray(msg.content)) {
        return { role: msg.role, content: msg.content, metadata: msg.metadata };
      }

      // 1. Get images from message metadata (for conversation history)
      const msgAttachments = msg.metadata?.attachments || [];
      const msgImages = msgAttachments.filter((a: any) => a.type === 'image' || a.type?.startsWith('image/'));

      // 2. For the last message, also include the top-level image attachments if they aren't already there
      if (index === processedMessages.length - 1 && attachments && attachments.length > 0) {
        const topLevelImages = attachments.filter((a: any) => a.type === 'image' || a.type?.startsWith('image/'));
        topLevelImages.forEach((img: any) => {
          if (!msgImages.some((existing: any) => existing.url === img.url)) {
            msgImages.push(img);
          }
        });
      }

      if (msgImages.length > 0 && modelInfo?.is_vision) {
        console.log(`[AI Route] Converting message ${index} to multimodal (${msgImages.length} images)`);
        const textContent = typeof msg.content === 'string' ? msg.content : '';
        return {
          role: msg.role,
          content: [
            { type: 'text', text: textContent || '.' },
            ...msgImages.map((img: any) => ({
              type: 'image_url',
              image_url: { url: img.url },
            })),
          ],
          metadata: msg.metadata,
        };
      }

      return { role: msg.role, content: msg.content, metadata: msg.metadata };
    });

    // Optimize token usage by compressing history
    const optimizedMessages = TokenManager.compressMessages(apiMessages);

    await executeWithKeyRotation(
      provider,
      isByok,
      apiKey,
      async (rotatedKey) => {
        const stream = await aiService.streamChat(rotatedKey, optimizedMessages, model, (status) => {
          writeSSE({ status });
        }, userId, provider, reasoningEffort);

        let contentSent = false;

        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta as any;
            const content = delta?.content || '';

            // Forward native provider reasoning tokens (Groq GPT-OSS delta.reasoning or Google native thought)
            const reasoning = delta?.reasoning || delta?.reasoning_content || delta?.thought || '';
            if (reasoning) {
              writeSSE({ reasoning });
            }

            // Capture standard OpenAI-style tool calls (if streaming functions/tools)
            const toolCalls = delta?.tool_calls;
            if (toolCalls && toolCalls.length > 0) {
              writeSSE({ tool_calls: toolCalls });
            }

            // Forward tool execution annotations from Groq built-in tools
            const xGroq = (chunk as any).x_groq;
            const msg = chunk.choices?.[0]?.message as any;
            const executedTools = delta?.executed_tools || msg?.executed_tools || (chunk as any).message?.executed_tools || xGroq?.executed_tools || (chunk as any).executed_tools;
            if (executedTools) {
              writeSSE({ executed_tools: executedTools });
            }

            if (content) {
              contentSent = true;
              writeSSE({ content });
            }
          }
        } catch (streamError: any) {
          if (contentSent) {
            // Content already partially sent to client — can't retry with a different key.
            // Mark as non-rotatable so executeWithKeyRotation doesn't try another key.
            console.warn(`[AI Route] Stream error after partial content delivery. Cannot rotate key.`);
            const err = new Error(`Stream interrupted: ${streamError.message}`);
            (err as any).skipRotation = true;
            throw err;
          }
          // No content sent yet — safe to retry with next key via rotation
          console.warn(`[AI Route] Stream error before any content. Eligible for key rotation.`);
          throw streamError;
        }
      }
    );

    // Increment usage ONLY upon successful AI stream completion
    // Skip charging for voice-mode requests — voice credits are charged via /voice-complete
    const isVoiceMode = req.body?.mode === 'voice';
    if (!isVoiceMode) {
      try {
        const identity: RateLimitIdentity = req.user
          ? { type: 'authenticated', userId: req.user.id, tier }
          : { type: 'anonymous', anonId: req.anonId || 'unknown', tier: 'anonymous' };

        await checkAndIncrementUsage(identity, 'chat', isByok);
        console.log(`[AI Route] Successfully charged chat credit for user: ${userId || req.anonId}`);
      } catch (chargeErr) {
        console.error('[AI Route] Failed to charge credit post-stream:', chargeErr);
      }
    } else {
      console.log(`[AI Route] Skipping chat credit charge for voice-mode request (user: ${userId || `[anon] ${req.anonId}`})`);
    }

    writeSSE('[DONE]');
    res.end();
  } catch (error: any) {
    console.error('AI Stream Error:', error);

    // ── PostHog: Capture AI errors that would otherwise be invisible ──
    // These errors are caught here (not in errorHandler), so we must
    // explicitly send them to PostHog for Error Tracking visibility.
    try {
      const { posthog: posthogServer } = await import('../services/posthog.service');
      if (posthogServer) {
        const userId = req.user?.id || (req as any).anonId || 'anonymous-server';
        posthogServer.captureException(error, userId, {
          source: 'ai_stream',
          model: req.body?.model,
          endpoint: `${req.method} ${req.originalUrl}`,
          status_code: error.status || 500,
        });
      }
    } catch (_) { /* never let PostHog break the response */ }

    const rawErrorMsg = (error.message || '').toLowerCase();
    const statusMatch = rawErrorMsg.match(/\b([45]\d\d)\b/);
    const resolvedStatusCode = error.status || error.statusCode || (statusMatch ? parseInt(statusMatch[1], 10) : 500);

    const resolveErrorCode = (err: any, statusCode: number, msg: string) => {
      if (err.code && err.code !== 'AI_STREAM_ERROR') return err.code;
      if (statusCode === 404 || msg.includes('not found') || msg.includes('unknown model') || msg.includes('model_not_found')) return 'MODEL_NOT_FOUND';
      if (statusCode === 410 || msg.includes('410') || msg.includes('degraded') || msg.includes('maintenance') || msg.includes('gone')) return 'MODEL_MAINTENANCE_410';
      if (statusCode === 400 || msg.includes('bad request') || msg.includes('invalid') || msg.includes('enginecore')) return 'INVALID_REQUEST_400';
      if (statusCode === 401 || statusCode === 403 || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('forbidden')) return 'AUTH_ERROR_401';
      if (statusCode === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('too many requests')) return 'QUOTA_EXCEEDED_429';
      if (statusCode === 503 || msg.includes('overloaded') || msg.includes('service unavailable')) return 'SERVICE_UNAVAILABLE_503';
      if (statusCode === 504 || statusCode === 408 || msg.includes('timeout') || msg.includes('timed out')) return 'TIMEOUT_504';
      if (statusCode === 502) return 'BAD_GATEWAY_502';
      if (statusCode === 413 || msg.includes('too large')) return 'PAYLOAD_TOO_LARGE_413';
      return statusCode >= 500 ? `SERVER_ERROR_${statusCode}` : (error.code || 'AI_STREAM_ERROR');
    };

    const resolvedCode = resolveErrorCode(error, resolvedStatusCode, rawErrorMsg);

    // Report to model error observer (fire-and-forget, never blocks response)
    try { reportModelError(req.body?.model, resolvedStatusCode, rawErrorMsg); } catch (_) { /* never break response */ }

    if (!res.headersSent) {
      res.status(resolvedStatusCode >= 400 && resolvedStatusCode < 600 ? resolvedStatusCode : 500).json({
        success: false,
        message: error.message || 'AI generation failed',
        code: resolvedCode,
        statusCode: resolvedStatusCode,
      });
    } else {
      writeSSE({
        error: error.message || 'AI generation failed',
        code: resolvedCode,
        statusCode: resolvedStatusCode,
      });
      res.end();
    }
  }
}));

// Image Generation
router.post('/image', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('imageGeneration'), rateLimitMiddleware('image'), withPriorityQueue(async (req: any, res) => {
  try {
    const { v4: uuidv4 } = await import('uuid');
    const { prompt, model, negative_prompt, seed, steps, width, height, cfg_scale, image, mode, image_size } = req.body;
    const userId = req.user?.id;
    const anonId = (req as any).anonId;
    const isAuth = !!userId;

    // For generation, we need either a userId or an anonId for the gallery
    if (!userId && !anonId) {
      return res.status(401).json({ success: false, message: 'Authentication or identity required for image generation' });
    }


    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    const apiKey = req.apiKey;
    const isByok = (req as any).isByok || false;
    const provider = (req as any).provider || 'nvidia';

    if (!apiKey) {
      const providerName = provider === 'google' ? 'Google' : 'NVIDIA';
      return res.status(400).json({
        success: false,
        message: `${providerName} API Key not found. Please add it in settings.`
      });
    }

    // Route to provider-specific image generation
    const isGoogleImageModel = model && (
      model.startsWith('gemini-') && model.includes('-image')
    );

    let result;
    if (isGoogleImageModel) {
      result = await executeWithKeyRotation(
        'google',
        isByok,
        apiKey,
        (rotatedKey) => aiService.generateImageGoogle(rotatedKey, prompt, model, {
          width,
          height,
          negative_prompt,
          seed,
          image_size,
        })
      );
    } else {
      result = await executeWithKeyRotation(
        'nvidia',
        isByok,
        apiKey,
        (rotatedKey) => aiService.generateImage(rotatedKey, prompt, model, {
          negative_prompt,
          seed,
          steps,
          width,
          height,
          cfg_scale,
          image,
          mode,
        })
      );
    }

    // Upload base64 images to R2 for persistent storage
    const images = [];
    for (const artifact of result.artifacts) {
      try {
        // Upload directly from base64
        const url = await r2Service.uploadBase64(artifact.base64, 'image/png', 'image-generation');

        images.push({
          url,
          seed: artifact.seed,
        });

        // Save to database gallery
        const { error: dbError } = await supabaseAdmin
          .from('user_images')
          .insert({
            user_id: userId || null,
            // anon_id: !userId ? anonId : null,
            url: url,
            prompt: prompt,
            model: model,
            seed: artifact.seed,
            width: width || 1024,
            height: height || 1024
          });

        if (dbError) {
          console.error(`[AI Route] Failed to save image to gallery:`, dbError);
        }

      } catch (uploadErr: any) {
        console.error(`[AI Route] Failed to process generated image:`, uploadErr.message);
        // Fallback: return as data URL if R2 upload fails
        images.push({
          url: `data:image/png;base64,${artifact.base64}`,
          seed: artifact.seed,
        });
      }
    }

    // Charge usage credits only upon success: 1 image = 1 credit, BYOK = 0.2 credits
    const tier = (req as any).userTier || 'anonymous';
    const chargeAmount = isByok ? 0.2 : 1;
    const identity: RateLimitIdentity = userId
      ? { type: 'authenticated', userId, tier }
      : { type: 'anonymous', anonId: anonId || 'unknown', tier: 'anonymous' as any };

    try {
      await checkAndIncrementMultiUsage(identity, [
        { tool: 'image', amount: images.length || 1, isByok, bypassLimits: true }
      ]);
      console.log(`[Image Route] Charged ${chargeAmount * (images.length || 1)} image credit(s) for ${images.length} images (model: ${model}, BYOK: ${isByok})`);
    } catch (chargeErr: any) {
      console.error('[Image Route] Failed to charge image credit:', chargeErr);
    }

    res.json({ success: true, data: { images } });
  } catch (error: any) {
    console.error('Image Generation Error:', error.message);

    try {
      const { posthog: posthogServer } = await import('../services/posthog.service');
      if (posthogServer) {
        const userId = req.user?.id || (req as any).anonId || 'anonymous-server';
        posthogServer.captureException(error, userId, {
          source: 'image_generation',
          model: req.body?.model,
          endpoint: `${req.method} ${req.originalUrl}`,
          status_code: error.status || 500,
        });
      }
    } catch (_) { /* never let PostHog break the response */ }

    // Report to model error observer (fire-and-forget)
    try { reportModelError(req.body?.model, error.status || 500, error.message); } catch (_) { /* never break response */ }

    res.status(500).json({ success: false, message: error.message });
  }
}));

// Get User Image History
router.get('/images', flexAuthMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const anonId = (req as any).anonId;

    let query = supabaseAdmin
      .from('user_images')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (anonId) {
      query = query.eq('anon_id', anonId);
    } else {
      return res.status(401).json({ success: false, message: 'Authentication or identity required' });
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Fetch Images Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete User Image
router.delete('/image/:id', flexAuthMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const anonId = (req as any).anonId;
    const { id } = req.params;

    let query = supabaseAdmin
      .from('user_images')
      .delete()
      .eq('id', id);

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (anonId) {
      query = query.eq('anon_id', anonId);
    } else {
      return res.status(401).json({ success: false, message: 'Authentication or identity required' });
    }

    const { error } = await query;

    if (error) throw error;

    res.json({ success: true, message: 'Image deleted' });
  } catch (error: any) {
    console.error('Delete Image Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});



// Video Generation
router.post('/video', authMiddleware, starterPlanMiddleware, videoModelValidationMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('videoGeneration'), rateLimitMiddleware('video'), withPriorityQueue(async (req: any, res) => {
  try {
    const { prompt, model, resolution, aspectRatio, durationSeconds, fileUrl, fileUrls, lastFrameUrl } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required for video generation' });
    }

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    // Tier-based model access: Omni Flash (pro-tier) requires Pro plan OR BYOK Google key for Starter users
    // Veo models are starter-tier and accessible to all starter+ users
    const userTier = (req as any).userTier || 'starter';
    const isPremiumVideoModel = model === 'gemini-omni-flash-preview';
    const isByok = (req as any).isByok || false;

    if (isPremiumVideoModel && userTier === 'starter' && !isByok) {
      return res.status(403).json({
        success: false,
        code: 'PREMIUM_MODEL_RESTRICTED',
        message: 'Omni Flash requires a Pro plan or a configured Google API key (BYOK). Please upgrade your plan or add your Google API key in Settings.'
      });
    }

    const apiKey = req.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Google API Key not found. Please add it in settings.'
      });
    }

    // Determine the list of reference file URLs to process (up to 5)
    const urlsToProcess = (fileUrls && Array.isArray(fileUrls) && fileUrls.length > 0)
      ? fileUrls
      : [fileUrl];

    if (urlsToProcess.length > 5) {
      return res.status(400).json({ success: false, message: 'Maximum of 5 reference files is allowed.' });
    }

    // Generate video buffers in parallel
    const results = await Promise.all(
      urlsToProcess.map(async (itemUrl) => {
        try {
          const result = await executeWithKeyRotation(
            'google',
            isByok,
            apiKey,
            (rotatedKey) => aiService.generateVideoGoogle(rotatedKey, prompt, model, {
              resolution,
              aspectRatio,
              durationSeconds: durationSeconds ? Number(durationSeconds) : 5,
              fileUrl: itemUrl,
              lastFrameUrl
            })
          );

          // Upload video buffer to R2
          const base64Data = result.buffer.toString('base64');
          const url = await r2Service.uploadBase64(base64Data, result.mimeType || 'video/mp4', 'video-generations');

          const duration = durationSeconds ? Number(durationSeconds) : 5;

          // Save to user_videos table
          const { data: dbData, error: dbError } = await supabaseAdmin
            .from('user_videos')
            .insert({
              user_id: userId,
              url: url,
              prompt: prompt,
              model: model,
              duration: duration,
              aspect_ratio: aspectRatio || '16:9',
              resolution: resolution || '720p'
            })
            .select();

          if (dbError) {
            console.error(`[AI Route] Failed to save video to gallery:`, dbError);
          }

          const dbRecord = dbData?.[0];

          return {
            success: true,
            video: {
              id: dbRecord?.id || Math.random().toString(36).substring(7),
              url,
              prompt,
              model,
              duration,
              aspect_ratio: aspectRatio || '16:9',
              resolution: resolution || '720p',
              created_at: dbRecord?.created_at || new Date().toISOString()
            }
          };
        } catch (err: any) {
          console.error('[AI Route] Individual video generation failed:', err.message);

          // ── PostHog: Capture individual video gen failures ──
          try {
            const { posthog: posthogServer } = await import('../services/posthog.service');
            if (posthogServer) {
              posthogServer.captureException(err, userId || 'anonymous-server', {
                source: 'video_generation',
                model: model,
                endpoint: 'POST /api/ai/video',
                status_code: err.status || err.code || 500,
                prompt_length: prompt?.length || 0,
                resolution: resolution || '720p',
                aspect_ratio: aspectRatio || '16:9',
                duration_seconds: durationSeconds || 5,
              });
            }
          } catch (_) { /* never let PostHog break the response */ }

          return {
            success: false,
            error: err.message
          };
        }
      })
    );

    const successfulVideos = results.filter((r) => r.success).map((r) => r.video);
    const failedResults = results.filter((r) => !r.success);

    if (successfulVideos.length === 0) {
      const errorMsg = failedResults[0]?.error || 'Video generation failed';
      return res.status(500).json({ success: false, message: errorMsg });
    }

    // Charge usage credits: 1 video = 1 credit, BYOK = 0.2 credits (charge only for successful videos)
    const baseCharge = 1 * successfulVideos.length;
    const chargeAmount = (isByok ? 0.2 : 1) * successfulVideos.length;

    const identity: RateLimitIdentity = {
      type: 'authenticated',
      userId,
      tier: (req as any).userTier || 'starter'
    };

    try {
      await checkAndIncrementMultiUsage(identity, [
        { tool: 'video', amount: baseCharge, isByok, bypassLimits: true }
      ]);
      console.log(`[Video Route] Charged ${chargeAmount} video credit(s) for ${successfulVideos.length} video(s) (model: ${model}, BYOK: ${isByok})`);
    } catch (chargeErr: any) {
      console.error('[Video Route] Failed to charge video credit:', chargeErr);
    }

    res.json({
      success: true,
      data: {
        video: successfulVideos[0],
        videos: successfulVideos,
        creditsCharged: chargeAmount
      }
    });
  } catch (error: any) {
    console.error('Video Generation Error:', error.message);

    try {
      const { posthog: posthogServer } = await import('../services/posthog.service');
      if (posthogServer) {
        const userId = req.user?.id || 'anonymous-server';
        posthogServer.captureException(error, userId, {
          source: 'video_generation',
          model: req.body?.model,
          endpoint: `${req.method} ${req.originalUrl}`,
          status_code: error.status || 500,
        });
      }
    } catch (_) { /* never let PostHog break the response */ }

    // Report to model error observer (fire-and-forget)
    try { reportModelError(req.body?.model, error.status || 500, error.message); } catch (_) { /* never break response */ }

    res.status(500).json({ success: false, message: error.message });
  }
}));

// Get User Video History
router.get('/videos', flexAuthMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { data, error } = await supabaseAdmin
      .from('user_videos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Fetch Videos Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete User Video
router.delete('/video/:id', flexAuthMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { error } = await supabaseAdmin
      .from('user_videos')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'Video deleted' });
  } catch (error: any) {
    console.error('Delete Video Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Voice Transcription
router.post('/voice', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('voiceToText'), rateLimitMiddleware('voice', 'deepgram'), upload.single('file'), uploadSizeValidator, withPriorityQueue(async (req: any, res) => {
  try {
    const file = req.file;
    const userId = req.user?.id;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Audio file is required' });
    }

    const deepgramApiKey = req.apiKey;
    const isByok = (req as any).isByok || false;

    if (!deepgramApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Deepgram API Key not found. Please add it in settings.'
      });
    }

    console.log(`Processing voice transcription: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const result = await executeWithKeyRotation(
      'deepgram',
      isByok,
      deepgramApiKey,
      (rotatedKey) => aiService.transcribeAudio(rotatedKey, file.path)
    );

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Transcription Route Error:', error.response?.data || error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || 'Internal Server Error';

    res.status(status).json({ success: false, message });
  }
}));

// Speech to Text (Dictate Mode) — Groq Whisper primary, Deepgram fallback
router.post('/stt', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('voiceToText'), rateLimitMiddleware('stt'), upload.single('file'), uploadSizeValidator, withPriorityQueue(async (req: any, res) => {
  try {
    const file = req.file;
    const userId = req.user?.id;
    const anonId = req.anonId;
    const tier = (req as any).userTier || 'anonymous';

    if (!file) {
      return res.status(400).json({ success: false, message: 'Audio file is required' });
    }

    console.log(`[STT Route] Processing speech transcription: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    // Resolve BYOK keys for both providers
    const groqResult = await ApiKeyService.getUserApiKey(userId, 'groq');
    const deepgramResult = await ApiKeyService.getUserApiKey(userId, 'deepgram');

    let transcriptText = '';
    let usedByok = false;
    let providerUsed = '';

    // Resolve original filename for Groq (needs extension for file type detection)
    const originalFilename = file.originalname || 'audio.webm';

    // ── CASCADE 1: Groq BYOK (whisper-large-v3 → whisper-large-v3-turbo) ──
    if (groqResult.source === 'user' && groqResult.key) {
      console.log('[STT Route] Trying Groq BYOK (whisper-large-v3)...');
      try {
        const result = await aiService.transcribeAudioGroq(groqResult.key, file.path, 'whisper-large-v3', originalFilename);
        transcriptText = (result?.text || '').trim();
        usedByok = true;
        providerUsed = 'groq-byok';
      } catch (e1: any) {
        console.warn('[STT Route] Groq BYOK v3 failed:', e1.message);
        // Fallback to whisper-large-v3-turbo with same BYOK key
        try {
          console.log('[STT Route] Trying Groq BYOK (whisper-large-v3-turbo)...');
          const result = await aiService.transcribeAudioGroq(groqResult.key, file.path, 'whisper-large-v3-turbo', originalFilename);
          transcriptText = (result?.text || '').trim();
          usedByok = true;
          providerUsed = 'groq-byok';
        } catch (e2: any) {
          console.warn('[STT Route] Groq BYOK turbo also failed:', e2.message);
        }
      }
    }

    // ── CASCADE 2: Groq App Key (whisper-large-v3 → whisper-large-v3-turbo) ──
    if (!transcriptText) {
      try {
        console.log('[STT Route] Trying Groq app key (whisper-large-v3)...');
        const result = await executeWithKeyRotation(
          'groq',
          false,
          null,
          (rotatedKey) => aiService.transcribeAudioGroq(rotatedKey, file.path, 'whisper-large-v3', originalFilename)
        );
        transcriptText = (typeof result === 'string' ? result : (result?.text || '')).trim();
        usedByok = false;
        providerUsed = 'groq-app';
      } catch (e3: any) {
        console.warn('[STT Route] Groq app v3 failed:', e3.message);
        // Fallback to whisper-large-v3-turbo with app key
        try {
          console.log('[STT Route] Trying Groq app key (whisper-large-v3-turbo)...');
          const result = await executeWithKeyRotation(
            'groq',
            false,
            null,
            (rotatedKey) => aiService.transcribeAudioGroq(rotatedKey, file.path, 'whisper-large-v3-turbo', originalFilename)
          );
          transcriptText = (typeof result === 'string' ? result : (result?.text || '')).trim();
          usedByok = false;
          providerUsed = 'groq-app';
        } catch (e4: any) {
          console.warn('[STT Route] Groq app turbo also failed:', e4.message);
        }
      }
    }

    // ── CASCADE 3: Deepgram BYOK ──
    if (!transcriptText && deepgramResult.source === 'user' && deepgramResult.key) {
      try {
        console.log('[STT Route] Trying Deepgram BYOK...');
        const result = await aiService.transcribeAudio(deepgramResult.key, file.path);
        transcriptText = (typeof result === 'string' ? result : (result?.text || '')).trim();
        usedByok = true;
        providerUsed = 'deepgram-byok';
      } catch (e5: any) {
        console.warn('[STT Route] Deepgram BYOK failed:', e5.message);
      }
    }

    // ── CASCADE 4: Deepgram App Key ──
    if (!transcriptText) {
      try {
        console.log('[STT Route] Trying Deepgram app key...');
        const result = await executeWithKeyRotation(
          'deepgram',
          false,
          null,
          (rotatedKey) => aiService.transcribeAudio(rotatedKey, file.path)
        );
        transcriptText = (typeof result === 'string' ? result : (result?.text || '')).trim();
        usedByok = false;
        providerUsed = 'deepgram-app';
      } catch (e6: any) {
        console.warn('[STT Route] Deepgram app key also failed:', e6.message);
      }
    }

    // Cleanup temp file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    // ── Charge credits: BYOK = 0.2, App key = 1.0 ──
    let creditsCharged = 0;
    if (transcriptText) {
      const chargeAmount = usedByok ? 0.2 : 1;
      const identity: RateLimitIdentity = userId
        ? { type: 'authenticated', userId, tier }
        : { type: 'anonymous', anonId: anonId || 'unknown', tier: 'anonymous' as any };

      try {
        const { checkAndIncrementMultiUsage } = await import('../services/usage.service');
        await checkAndIncrementMultiUsage(identity, [
          { tool: 'stt', amount: chargeAmount, isByok: usedByok, bypassLimits: true }
        ]);
        creditsCharged = chargeAmount;
        console.log(`[STT Route] Charged ${chargeAmount} stt credit(s) via ${providerUsed} [${usedByok ? 'BYOK' : 'APP'}] (user: ${userId || anonId})`);
      } catch (chargeErr) {
        console.error('[STT Route] Failed to charge credit:', chargeErr);
      }
    } else {
      console.log(`[STT Route] Empty transcript or all providers failed. No credits charged.`);
    }

    if (!transcriptText && !providerUsed) {
      return res.status(500).json({
        success: false,
        message: 'All transcription providers failed. Please try again later.'
      });
    }

    res.json({ success: true, text: transcriptText, data: transcriptText, creditsCharged, provider: providerUsed });
  } catch (error: any) {
    console.error('STT Route Error:', error.response?.data || error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || 'Internal Server Error';

    res.status(status).json({ success: false, message });
  }
}));

// File Upload to R2 (with deduplication and cancellation support)
router.post('/upload', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('fileUpload'), rateLimitMiddleware('file_upload'), uploadAgreementMiddleware, upload.single('file'), uploadSizeValidator, withPriorityQueue(async (req: any, res) => {
  // AbortController to cancel the R2 upload if client disconnects
  const uploadAbort = new AbortController();
  let clientDisconnected = false;

  req.on('close', () => {
    if (!res.writableEnded) {
      // Client disconnected before we sent a response
      clientDisconnected = true;
      uploadAbort.abort();
      console.log('[Upload] Client disconnected — aborting R2 upload');
    }
  });

  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const userId = req.user?.id;

    // Use deduped upload — skips R2 entirely if content hash already exists
    const { url, deduplicated } = await r2Service.uploadFileDeduped(
      file.path,
      file.originalname,
      file.mimetype,
      userId,
      undefined,
      uploadAbort.signal
    );

    // Cleanup temporary file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    if (clientDisconnected) return; // Don't try to send response to a closed connection

    res.json({ success: true, url, deduplicated });
  } catch (error: any) {
    // Clean up temp file regardless
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    if (clientDisconnected || error.message === 'Upload aborted') {
      console.log('[Upload] Request aborted — temp file cleaned up');
      return; // Client is gone, no response to send
    }

    console.error('Upload Route Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));


// List API Keys
router.get('/list-api-keys', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const keys = await ApiKeyService.listUserApiKeys(userId);
    res.json({ success: true, keys });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle API Key
router.patch('/toggle-api-key', authMiddleware, async (req: any, res) => {
  try {
    const { id, inUse } = req.body;
    const userId = req.user.id;

    if (!id || typeof inUse !== 'boolean') {
      return res.status(400).json({ success: false, message: 'ID and inUse status are required' });
    }

    const success = await ApiKeyService.toggleApiKey(userId, id, inUse);
    res.json({ success, message: success ? 'Key updated' : 'Failed to update key' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete API Key
router.delete('/delete-api-key/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const success = await ApiKeyService.deleteApiKeyById(userId, id);
    res.json({ success, message: success ? 'Key deleted' : 'Failed to delete key' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save API Key
router.post('/save-api-key', authMiddleware, apiKeySaveRateLimiter, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { provider, key } = req.body;
    if (!provider || !key) {
      return res.status(400).json({ success: false, message: 'Provider and key are required' });
    }

    const result = await ApiKeyService.saveUserApiKey(userId, provider, key);

    if (result.duplicate) {
      return res.status(409).json({ success: false, duplicate: true, message: result.message });
    }

    if (result.success) {
      res.json({ success: true, message: result.message || 'API Key saved successfully' });
    } else {
      res.status(500).json({ success: false, message: result.message || 'Failed to save API key' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Text to Speech
router.post('/tts', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, rateLimitMiddleware('voice', 'deepgram'), withPriorityQueue(async (req: any, res) => {
  try {
    const { text, model } = req.body;
    const userId = req.user?.id;
    const deepgramApiKey = req.apiKey;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    // Filter out emojis from text before TTS processing
    const cleanText = text
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.end();
    }

    if (!deepgramApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Deepgram API Key not found. Please add it in settings.'
      });
    }

    const isByok = (req as any).isByok || false;

    const stream: any = await executeWithKeyRotation(
      'deepgram',
      isByok,
      deepgramApiKey,
      (rotatedKey) => aiService.generateSpeech(rotatedKey, cleanText, model)
    );

    // Set response headers for audio stream
    res.setHeader('Content-Type', 'audio/mpeg');

    // Pipe the stream to the res
    stream.pipe(res);
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

/**
 * @route   POST /api/ai/voice-complete
 * @desc    Charge voice credits after a full voice flow (STT → Chat → TTS) completes.
 *          Credit cost is based on total response duration:
 *          - ≤ 5 seconds  → 1 voice credit
 *          - > 5 and ≤ 10 → 3 voice credits
 *          - > 10 seconds → 5 voice credits
 * @access  Private
 */
router.post('/voice-complete', flexAuthMiddleware, async (req: any, res: any) => {
  try {
    const { durationSeconds, voiceSessionId, apiCallsCount } = req.body;
    const userId = req.user?.id;
    const anonId = req.anonId;
    const tier = (req as any).userTier || 'anonymous';

    if (typeof durationSeconds !== 'number' || durationSeconds < 0) {
      return res.status(400).json({ success: false, message: 'Valid durationSeconds is required' });
    }

    // Prevent duplicate charges for the same voice session
    if (voiceSessionId) {
      const { voiceSessionCache } = await import('../middleware/rateLimit');
      const chargeKey = `complete_${voiceSessionId}`;
      if (voiceSessionCache.has(chargeKey)) {
        console.log(`[AI Route] Voice session ${voiceSessionId} already charged, skipping`);
        return res.json({ success: true, creditsCharged: 0, message: 'Already charged' });
      }
      voiceSessionCache.add(chargeKey);
    }

    // Determine credit cost based on total API calls count [voice + chat + TTS]
    const count = typeof apiCallsCount === 'number' ? apiCallsCount : 3; // fallback to 3 calls
    let creditsToCharge: number;
    if (count < 5) {
      creditsToCharge = 1;
    } else if (count >= 5 && count <= 10) {
      creditsToCharge = 3;
    } else if (count > 10 && count <= 18) {
      creditsToCharge = 5;
    } else {
      creditsToCharge = 10;
    }

    const identity: RateLimitIdentity = userId
      ? { type: 'authenticated', userId, tier }
      : { type: 'anonymous', anonId: anonId || 'unknown', tier: 'anonymous' as any };

    // Check if user has BYOK for deepgram (voice)
    let isByok = false;
    if (userId) {
      const result = await ApiKeyService.getUserApiKey(userId, 'deepgram');
      if (result.source === 'user') isByok = true;
    }

    // Charge the voice credits
    const { checkAndIncrementMultiUsage } = await import('../services/usage.service');
    const result = await checkAndIncrementMultiUsage(identity, [
      { tool: 'voice', amount: creditsToCharge, isByok, bypassLimits: true }
    ]);

    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        reason: result.reason,
        tool: 'voice',
        limit: result.limit,
        current: result.used,
        resetsIn: result.resetsIn,
        message: result.message || 'Voice usage limit exceeded.',
        upgradeUrl: '/pricing'
      });
    }

    console.log(`[AI Route] Charged ${creditsToCharge} voice credit(s) for ${durationSeconds}s response (user: ${userId || anonId})`);

    res.json({
      success: true,
      creditsCharged: creditsToCharge,
      durationSeconds,
    });
  } catch (error: any) {
    console.error('[AI Route] Voice complete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

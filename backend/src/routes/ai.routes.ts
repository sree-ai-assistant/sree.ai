import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { flexAuthMiddleware } from '../middleware/anonymousIdentity';
import { rateLimitMiddleware, featureGateMiddleware } from '../middleware/rateLimit';
import { abuseDetectionMiddleware } from '../middleware/abuseDetection';
import { uploadSizeValidator, queuePriorityMiddleware } from '../middleware/uploadEnforcement';
import { withPriorityQueue } from '../services/queue.service';
import { PLAN_CONFIGS as PLANS, type PlanTier } from '../config/plans';
import { aiService } from '../services/ai.service';
import { ApiKeyService } from '../services/apiKey.service';
import { executeWithKeyRotation } from '../services/apiKeyPool.service';
import { r2Service } from '../services/r2.service';
import { fileService } from '../services/file.service';
import multer from 'multer';
import fs from 'fs';
import { TokenManager } from '../utils/tokenManager';
import { supabaseAdmin } from '../lib/supabase';
import { videoService, VideoService } from '../services/video.service';
import { getUsageStatus, checkAndIncrementUsage, type RateLimitIdentity } from '../services/usage.service';
import path from 'path';
import axios from 'axios';
// Removed static uuid import due to ESM/CJS compatibility issues


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
    const { messages, model, attachments, messageId, conversationId } = req.body;
    const userId = req.user?.id; // Optional for anonymous
    const isAuth = !!userId;
    const tier = (req as any).userTier as PlanTier || 'anonymous';
    const planConfig = PLANS[tier];
    const isByok = (req as any).isByok || false;

    // 0. Model Gating: Check if user has access to the requested model
    const { data: modelInfo } = await supabaseAdmin
      .from('ai_models')
      .select('tier_required')
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

    if (attachments && attachments.length > 0) {
      const docAttachments = attachments.filter((a: any) => a.type === 'document');

      if (docAttachments.length > 0) {
        console.log(`[AI Route] Processing ${docAttachments.length} document attachments`);
        writeSSE({ status: 'Preparing documents...' });
        const startTime = Date.now();

        try {
          const results: { name: string, text: string }[] = [];
          const extractionPromises = docAttachments.map(async (doc: any) => {
            if (doc.extractedText) {
              console.log(`[AI Route] Using pre-extracted text for ${doc.name} (${doc.extractedText.length} chars)`);
              return { name: doc.name, text: doc.extractedText };
            }

            console.log(`[AI Route] Backend extraction starting for ${doc.name}`);
            writeSSE({ status: `Reading ${doc.name}...` });

            try {
              const text = await Promise.race([
                fileService.extractText(doc.url, doc.name),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error(`Timeout after 60s`)), 60000)
                )
              ]);

              const isSpreadsheet = ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv'].some(ext => doc.name.toLowerCase().endsWith(ext));
              const statusText = isSpreadsheet ? `Analyzing Sheets in ${doc.name}...` : `Processing ${doc.name}...`;
              writeSSE({ status: statusText });

              console.log(`[AI Route] Successfully extracted ${text.length} chars from ${doc.name}`);
              return { name: doc.name, text };
            } catch (err: any) {
              console.error(`[AI Route] Failed extracting ${doc.name}:`, err.message);
              return { name: doc.name, text: `[Extraction failed for ${doc.name}: ${err.message}]` };
            }
          });

          console.log(`[AI Route] Waiting for all extractions to complete...`);
          const extractionResults = await Promise.all(extractionPromises);
          results.push(...extractionResults);
          console.log(`[AI Route] Extraction phase complete. Total docs: ${results.length}`);

          writeSSE({ status: 'Optimizing context for AI...' });

          let contextText = "\n\n### CONTEXT FROM ATTACHED DOCUMENTS ###\n";
          contextText += "The user has provided the following documents as reference. Please analyze them and use the information to answer questions or perform requested tasks. If the documents contain data, refer to specific document names if relevant.\n\n";
          for (const result of results) {
            contextText += `#### DOCUMENT: ${result.name}\n`;
            contextText += `${result.text}\n`;
            contextText += `#### END OF ${result.name}\n\n`;
          }

          // Use TokenManager for truncation
          contextText = TokenManager.truncateDocumentText(contextText, 100000);
          contextText += "### END OF DOCUMENT CONTEXT ###\n\n";

          console.log(`[AI Route] Document processing completed in ${Date.now() - startTime}ms`);

          // Persist context to DB if messageId is provided
          if (messageId) {
            console.log(`[AI Route] Persisting extracted context to message ${messageId} metadata`);
            await updateMessageInDb(messageId, {
              metadata: {
                hasContext: true,
                extractedContext: contextText
              }
            });
          }

          // Update processedMessages with metadata so TokenManager/AiService see it
          const lastMessage = processedMessages[processedMessages.length - 1];
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.metadata = {
              ...lastMessage.metadata,
              extractedContext: contextText
            };
          }

          writeSSE({ status: 'Thinking...' });
        } catch (error) {
          console.error('[AI Route] Error during document extraction:', error);
          writeSSE({ error: 'Failed to process some documents. Attempting to continue anyway...' });
        }
      }

      const audioAttachments = attachments.filter((a: any) => a.type === 'audio');
      const videoAttachments = attachments.filter((a: any) => a.type === 'video');

      console.log(`[AI Route] Processing attachments: Total=${attachments.length}, Audio=${audioAttachments.length}, Video=${videoAttachments.length}`);
      if (attachments.length > 0) {
        console.log(`[AI Route] Attachment types: ${attachments.map((a: any) => `${a.name}(${a.type})`).join(', ')}`);
      }

      // Process Audio
      if (audioAttachments.length > 0) {
        const { key: deepgramApiKey } = await ApiKeyService.getUserApiKey(userId, 'deepgram');
        if (deepgramApiKey) {
          for (const audio of audioAttachments) {
            writeSSE({ status: `Transcribing ${audio.name}...` });
            try {
              const tempPath = path.join(process.cwd(), 'uploads', `temp-audio-${uuidv4()}-${audio.name}`);
              await fileService.downloadFile(audio.url, tempPath);
              const transcript = await aiService.transcribeAudio(deepgramApiKey, tempPath);
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

              const lastMessage = processedMessages[processedMessages.length - 1];
              if (lastMessage && lastMessage.role === 'user') {
                const audioContext = `\n\n### TRANSCRIPT FOR AUDIO: ${audio.name} ###\n${transcript}\n### END OF TRANSCRIPT ###\n`;
                lastMessage.metadata = {
                  ...lastMessage.metadata,
                  extractedContext: (lastMessage.metadata?.extractedContext || '') + audioContext
                };

                // Persist audio transcript to DB
                if (messageId) {
                  await updateMessageInDb(messageId, {
                    metadata: {
                      extractedContext: lastMessage.metadata.extractedContext
                    }
                  });
                }
              }
            } catch (err) {
              console.error(`[AI Route] Audio transcription failed for ${audio.name}:`, err);
            }
          }
        }
      }

      // Process Video
      if (videoAttachments.length > 0) {
        console.log(`[AI Route] Found ${videoAttachments.length} video attachments`);
        for (const video of videoAttachments) {
          const videoName = video.name || 'video.mp4';
          console.log(`[AI Route] Processing video: ${videoName}`);
          writeSSE({ status: `Downloading ${videoName}...` });
          const sanitizedName = videoName.replace(/[^a-z0-9.]/gi, '_');
          const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-video-${uuidv4()}-${sanitizedName}`);

          try {
            await fileService.downloadFile(video.url, tempVideoPath);
            console.log(`[AI Route] Downloaded ${video.name} to ${tempVideoPath}`);

            writeSSE({ status: `Analyzing ${video.name} duration...` });

            // Determine optimal frame count based on video duration
            let frameCount = 5;
            try {
              const duration = await videoService.getDuration(tempVideoPath);
              frameCount = VideoService.optimalFrameCount(duration);
              console.log(`[AI Route] Video duration: ${duration}s → extracting ${frameCount} frames`);
            } catch (durationErr: any) {
              console.warn(`[AI Route] Could not read duration, defaulting to ${frameCount} frames:`, durationErr.message);
            }

            writeSSE({ status: `Extracting ${frameCount} key frames from ${video.name}...` });
            const framePaths = await videoService.extractFrames(tempVideoPath, frameCount);
            console.log(`[AI Route] Extracted ${framePaths.length} frames from ${video.name}`);

            if (framePaths.length === 0) {
              console.warn(`[AI Route] No frames were extracted from ${video.name}`);
              writeSSE({ status: `Warning: No frames could be extracted from ${video.name}. This might be due to video format or length.` });
            } else {
              writeSSE({ status: `Uploading ${framePaths.length} visual frames...` });
              // Upload frames to R2 and inject into message content
              const lastMessage = processedMessages[processedMessages.length - 1];
              if (lastMessage && lastMessage.role === 'user') {
                if (typeof lastMessage.content === 'string') {
                  lastMessage.content = [{ type: 'text', text: lastMessage.content }];
                }

                const videoInstruction = "\n\n[SYSTEM INSTRUCTION: You are being provided with extracted frames from a video (never mention this in the chat). Please pretend and act as if you are watching the actual video. Do NOT mention that you were provided with separate images. Refer to them collectively as 'the video'. Use the frames to understand the context, movement, and visual details of the video.]";
                const textPart = lastMessage.content.find((p: any) => p.type === 'text');
                if (textPart) {
                  textPart.text += videoInstruction;
                } else {
                  lastMessage.content.unshift({ type: 'text', text: videoInstruction });
                }

                for (let i = 0; i < framePaths.length; i++) {
                  const framePath = framePaths[i];
                  if (!framePath) continue;

                  console.log(`[AI Route] Uploading frame ${i + 1}/${framePaths.length}: ${framePath}`);
                  try {
                    const frameUrl = await r2Service.uploadFile(framePath, path.basename(framePath), 'image/png');
                    (lastMessage.content as any[]).push({
                      type: 'image_url',
                      image_url: { url: frameUrl }
                    });
                  } catch (uploadErr) {
                    console.error(`[AI Route] Failed to upload frame ${i + 1}:`, uploadErr);
                  }
                }

                // Persist injected frames to DB
                if (messageId) {
                  console.log(`[AI Route] Persisting injected frames to message ${messageId}`);
                  await updateMessageInDb(messageId, {
                    content: lastMessage.content
                  });
                }
              }
              writeSSE({ status: `Frames extracted and uploaded for ${video.name}` });

              // Store video reference in conversation for future context
              if (conversationId) {
                await storeVideoInConversation(conversationId, video.name, video.url);
              }
            }

            // Cleanup frames immediately after processing
            console.log(`[AI Route] Cleaning up ${framePaths.length} temp frames`);
            videoService.cleanup(framePaths);
          } catch (err: any) {
            console.error(`[AI Route] Video processing failed for ${video.name}:`, err);
            writeSSE({ status: `Error processing ${video.name}: ${err.message || 'Unknown error'}` });
          } finally {
            // Always cleanup the temp video file
            if (fs.existsSync(tempVideoPath)) {
              console.log(`[AI Route] Final cleanup of temp video: ${tempVideoPath}`);
              try {
                fs.unlinkSync(tempVideoPath);
              } catch (unlinkErr) {
                console.error(`[AI Route] Failed to delete temp video ${tempVideoPath}:`, unlinkErr);
              }
            }
          }

        }
      }
    }


    // --- VIDEO CONTEXT RECALL: Check if user references a previously uploaded video ---
    if (conversationId) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      const userText = typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : Array.isArray(lastMessage?.content)
          ? (lastMessage.content.find((p: any) => p.type === 'text')?.text || '')
          : '';

      // Only check for video references if we did NOT just upload new videos in this request
      const hasNewVideoAttachments = attachments?.some((a: any) => a.type === 'video');
      if (!hasNewVideoAttachments && userText.trim()) {
        const referencedVideos = await findReferencedVideos(conversationId, userText);

        if (referencedVideos.length > 0) {
          console.log(`[AI Route] Re-processing ${referencedVideos.length} previously uploaded video(s) for context`);
          writeSSE({ status: `Recalling ${referencedVideos.length} previous video(s)...` });

          for (const refVideo of referencedVideos) {
            const sanitizedName = refVideo.name.replace(/[^a-z0-9.]/gi, '_');
            const { v4: uuidv4Recall } = await import('uuid');
            const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-recall-${uuidv4Recall()}-${sanitizedName}`);

            try {
              writeSSE({ status: `Downloading ${refVideo.name} from history...` });
              await fileService.downloadFile(refVideo.url, tempVideoPath);

              writeSSE({ status: `Extracting frames from ${refVideo.name}...` });
              const framePaths = await videoService.extractFrames(tempVideoPath, 5);

              if (framePaths.length > 0) {
                if (lastMessage && lastMessage.role === 'user') {
                  if (typeof lastMessage.content === 'string') {
                    lastMessage.content = [{ type: 'text', text: lastMessage.content }];
                  }

                  const recallInstruction = `\n\n[SYSTEM INSTRUCTION: The user is referencing a previously uploaded video named "${refVideo.name}". You are being provided with extracted frames from this video (never mention this in the chat). Please pretend and act as if you are watching the actual video. Do NOT mention that you were provided with separate images. Refer to them collectively as 'the video'. Use the frames to understand the context, movement, and visual details of the video.]`;
                  const textPart = lastMessage.content.find((p: any) => p.type === 'text');
                  if (textPart) {
                    textPart.text += recallInstruction;
                  } else {
                    lastMessage.content.unshift({ type: 'text', text: recallInstruction });
                  }

                  writeSSE({ status: `Uploading recalled frames for ${refVideo.name}...` });
                  for (let i = 0; i < framePaths.length; i++) {
                    const framePath = framePaths[i];
                    if (!framePath) continue;
                    try {
                      const frameUrl = await r2Service.uploadFile(framePath, path.basename(framePath), 'image/png');
                      (lastMessage.content as any[]).push({
                        type: 'image_url',
                        image_url: { url: frameUrl }
                      });
                    } catch (uploadErr) {
                      console.error(`[AI Route] Failed to upload recalled frame ${i + 1}:`, uploadErr);
                    }
                  }

                  if (messageId) {
                    await updateMessageInDb(messageId, { content: lastMessage.content });
                  }
                }

                writeSSE({ status: `Video "${refVideo.name}" recalled successfully` });
              }

              videoService.cleanup(framePaths);
            } catch (err: any) {
              console.error(`[AI Route] Failed to recall video ${refVideo.name}:`, err);
              writeSSE({ status: `Could not recall ${refVideo.name}: ${err.message}` });
            } finally {
              if (fs.existsSync(tempVideoPath)) {
                try { fs.unlinkSync(tempVideoPath); } catch (_) { }
              }
            }
          }
        }
      }
    }


    // --- IMAGE ATTACHMENTS: Process all messages for multimodal content ---
    // We create a specific copy for the API call to avoid corrupting the DB version with JSON arrays
    let apiMessages = processedMessages.map((msg: any, index: number) => {
      // 1. Get images from message metadata (for history)
      const msgAttachments = msg.metadata?.attachments || [];
      const msgImages = msgAttachments.filter((a: any) => a.type === 'image' || a.type?.startsWith('image/'));

      // 2. For the last message, also include the top-level attachments if they aren't already there
      if (index === processedMessages.length - 1 && attachments && attachments.length > 0) {
        const topLevelImages = attachments.filter((a: any) => a.type === 'image' || a.type?.startsWith('image/'));
        topLevelImages.forEach((img: any) => {
          if (!msgImages.some((existing: any) => existing.url === img.url)) {
            msgImages.push(img);
          }
        });
      }

      if (msgImages.length > 0) {
        console.log(`[AI Route] Converting message ${index} to multimodal (${msgImages.length} images)`);
        const textContent = typeof msg.content === 'string' ? msg.content : '';
        return {
          role: msg.role,
          content: [
            { type: 'text', text: textContent },
            ...msgImages.map((img: any) => ({
              type: 'image_url',
              image_url: { url: img.url }
            }))
          ],
          metadata: msg.metadata
        };
      }

      return { role: msg.role, content: msg.content, metadata: msg.metadata };
    });


    // Get API key from middleware (which handles user overrides)
    const apiKey = req.apiKey;
    const provider = (req as any).provider || 'nvidia';

    if (!apiKey) {
      const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
      if (!res.headersSent) {
        return res.status(400).json({
          success: false,
          message: `${providerName} API Key not found. Please add it in settings.`
        });
      } else {
        writeSSE({ error: `${providerName} API Key not found` });
        res.end();
        return;
      }
    }

    // Optimize token usage by compressing history
    const optimizedMessages = TokenManager.compressMessages(apiMessages);

    await executeWithKeyRotation(
      provider,
      isByok,
      apiKey,
      async (rotatedKey) => {
        const stream = await aiService.streamChat(rotatedKey, optimizedMessages, model, (status) => {
          writeSSE({ status });
        }, userId, provider);

        let contentSent = false;
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
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
      console.log(`[AI Route] Skipping chat credit charge for voice-mode request (user: ${userId || req.anonId})`);
    }

    writeSSE('[DONE]');
    res.end();
  } catch (error: any) {
    console.error('AI Stream Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    } else {
      writeSSE({ error: error.message });
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

    res.json({ success: true, data: { images } });
  } catch (error: any) {
    console.error('Image Generation Error:', error.message);
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

// File Upload to R2
router.post('/upload', flexAuthMiddleware, abuseDetectionMiddleware(), queuePriorityMiddleware, featureGateMiddleware('fileUpload'), rateLimitMiddleware('file_upload'), upload.single('file'), uploadSizeValidator, withPriorityQueue(async (req: any, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const url = await r2Service.uploadFile(file.path, file.originalname, file.mimetype);

    // Cleanup temporary file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    res.json({ success: true, url });
  } catch (error: any) {
    console.error('Upload Route Error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
router.post('/save-api-key', authMiddleware, async (req: any, res) => {
  try {
    const { provider, key } = req.body;
    const userId = req.user.id;

    if (!provider || !key) {
      return res.status(400).json({ success: false, message: 'Provider and key are required' });
    }

    const success = await ApiKeyService.saveUserApiKey(userId, provider, key);

    if (success) {
      res.json({ success: true, message: 'API Key saved successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to save API key' });
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

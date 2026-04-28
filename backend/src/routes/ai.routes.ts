import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { tierCheckMiddleware } from '../middleware/tierCheck';
import { aiService } from '../services/ai.service';
import { ApiKeyService } from '../services/apiKey.service';
import { r2Service } from '../services/r2.service';
import { fileService } from '../services/file.service';
import multer from 'multer';
import fs from 'fs';
import { TokenManager } from '../utils/tokenManager';
import { supabaseAdmin } from '../lib/supabase';
import { videoService, VideoService } from '../services/video.service';
import path from 'path';
// Removed static uuid import due to ESM/CJS compatibility issues


const router = Router();
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
router.post('/chat', authMiddleware, tierCheckMiddleware, async (req: any, res) => {
  try {
    const { v4: uuidv4 } = await import('uuid');
    const { messages, model, attachments, messageId, conversationId } = req.body;
    const userId = req.user.id;

    // Set headers for streaming early
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Process incoming messages to include context from metadata for the AI
    // but keep it hidden from the UI (which uses the clean content)
    // 1. Shallow copy messages to avoid mutating the original array if needed
    let processedMessages = [...messages];

    if (attachments && attachments.length > 0) {
      const docAttachments = attachments.filter((a: any) => a.type === 'document');

      if (docAttachments.length > 0) {
        console.log(`[AI Route] Processing ${docAttachments.length} document attachments`);
        res.write(`data: ${JSON.stringify({ status: 'Preparing documents...' })}\n\n`);
        const startTime = Date.now();

        try {
          const results: { name: string, text: string }[] = [];
          const extractionPromises = docAttachments.map(async (doc: any) => {
            if (doc.extractedText) {
              console.log(`[AI Route] Using pre-extracted text for ${doc.name} (${doc.extractedText.length} chars)`);
              return { name: doc.name, text: doc.extractedText };
            }

            console.log(`[AI Route] Backend extraction starting for ${doc.name}`);
            res.write(`data: ${JSON.stringify({ status: `Reading ${doc.name}...` })}\n\n`);

            try {
              const text = await Promise.race([
                fileService.extractText(doc.url, doc.name),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error(`Timeout after 60s`)), 60000)
                )
              ]);

              const isSpreadsheet = ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv'].some(ext => doc.name.toLowerCase().endsWith(ext));
              const statusText = isSpreadsheet ? `Analyzing Sheets in ${doc.name}...` : `Processing ${doc.name}...`;
              res.write(`data: ${JSON.stringify({ status: statusText })}\n\n`);

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

          res.write(`data: ${JSON.stringify({ status: 'Optimizing context for AI...' })}\n\n`);


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

          res.write(`data: ${JSON.stringify({ extractedContext: contextText })}\n\n`);
          res.write(`data: ${JSON.stringify({ status: 'Thinking...' })}\n\n`);
        } catch (error) {
          console.error('[AI Route] Error during document extraction:', error);
          res.write(`data: ${JSON.stringify({ error: 'Failed to process some documents. Attempting to continue anyway...' })}\n\n`);
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
        const deepgramApiKey = await ApiKeyService.getUserApiKey(userId, 'deepgram');
        if (deepgramApiKey) {
          for (const audio of audioAttachments) {
            res.write(`data: ${JSON.stringify({ status: `Transcribing ${audio.name}...` })}\n\n`);
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
          res.write(`data: ${JSON.stringify({ status: `Downloading ${videoName}...` })}\n\n`);
          const sanitizedName = videoName.replace(/[^a-z0-9.]/gi, '_');
          const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-video-${uuidv4()}-${sanitizedName}`);

          try {
            await fileService.downloadFile(video.url, tempVideoPath);
            console.log(`[AI Route] Downloaded ${video.name} to ${tempVideoPath}`);

            res.write(`data: ${JSON.stringify({ status: `Analyzing ${video.name} duration...` })}\n\n`);

            // Determine optimal frame count based on video duration
            let frameCount = 5;
            try {
              const duration = await videoService.getDuration(tempVideoPath);
              frameCount = VideoService.optimalFrameCount(duration);
              console.log(`[AI Route] Video duration: ${duration}s → extracting ${frameCount} frames`);
            } catch (durationErr: any) {
              console.warn(`[AI Route] Could not read duration, defaulting to ${frameCount} frames:`, durationErr.message);
            }

            res.write(`data: ${JSON.stringify({ status: `Extracting ${frameCount} key frames from ${video.name}...` })}\n\n`);
            const framePaths = await videoService.extractFrames(tempVideoPath, frameCount);
            console.log(`[AI Route] Extracted ${framePaths.length} frames from ${video.name}`);

            if (framePaths.length === 0) {
              console.warn(`[AI Route] No frames were extracted from ${video.name}`);
              res.write(`data: ${JSON.stringify({ status: `Warning: No frames could be extracted from ${video.name}. This might be due to video format or length.` })}\n\n`);
            } else {
              res.write(`data: ${JSON.stringify({ status: `Uploading ${framePaths.length} visual frames...` })}\n\n`);
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
              res.write(`data: ${JSON.stringify({ status: `Frames extracted and uploaded for ${video.name}` })}\n\n`);

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
            res.write(`data: ${JSON.stringify({ status: `Error processing ${video.name}: ${err.message || 'Unknown error'}` })}\n\n`);
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
          res.write(`data: ${JSON.stringify({ status: `Recalling ${referencedVideos.length} previous video(s)...` })}\n\n`);

          for (const refVideo of referencedVideos) {
            const sanitizedName = refVideo.name.replace(/[^a-z0-9.]/gi, '_');
            const { v4: uuidv4Recall } = await import('uuid');
            const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-recall-${uuidv4Recall()}-${sanitizedName}`);

            try {
              res.write(`data: ${JSON.stringify({ status: `Downloading ${refVideo.name} from history...` })}\n\n`);
              await fileService.downloadFile(refVideo.url, tempVideoPath);

              res.write(`data: ${JSON.stringify({ status: `Extracting frames from ${refVideo.name}...` })}\n\n`);
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

                  res.write(`data: ${JSON.stringify({ status: `Uploading recalled frames for ${refVideo.name}...` })}\n\n`);
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

                res.write(`data: ${JSON.stringify({ status: `Video "${refVideo.name}" recalled successfully` })}\n\n`);
              }

              videoService.cleanup(framePaths);
            } catch (err: any) {
              console.error(`[AI Route] Failed to recall video ${refVideo.name}:`, err);
              res.write(`data: ${JSON.stringify({ status: `Could not recall ${refVideo.name}: ${err.message}` })}\n\n`);
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
          ]
        };
      }
      
      return { role: msg.role, content: msg.content };
    });


    // Get API key with user overrides
    const nvidiaApiKey = await ApiKeyService.getUserApiKey(userId, 'nvidia');

    if (!nvidiaApiKey) {
      if (!res.headersSent) {
        return res.status(400).json({
          success: false,
          message: 'NVIDIA API Key not found. Please add it in settings.'
        });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'NVIDIA API Key not found' })}\n\n`);
        res.end();
        return;
      }
    }

    // Optimize token usage by compressing history
    const optimizedMessages = TokenManager.compressMessages(apiMessages);

    const stream = await aiService.streamChat(nvidiaApiKey, optimizedMessages, model, (status) => {
      res.write(`data: ${JSON.stringify({ status })}\n\n`);
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('AI Stream Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Image Generation
router.post('/image', authMiddleware, tierCheckMiddleware, async (req: any, res) => {
  try {
    const { prompt, model } = req.body;
    const userId = req.user.id;

    const nvidiaApiKey = await ApiKeyService.getUserApiKey(userId, 'nvidia');

    if (!nvidiaApiKey) {
      return res.status(400).json({
        success: false,
        message: 'NVIDIA API Key not found. Please add it in settings.'
      });
    }

    const result = await aiService.generateImage(nvidiaApiKey, prompt, model);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Voice Transcription
router.post('/voice', authMiddleware, upload.single('file'), async (req: any, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Audio file is required' });
    }

    const deepgramApiKey = await ApiKeyService.getUserApiKey(userId, 'deepgram');

    if (!deepgramApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Deepgram API Key not found. Please add it in settings.'
      });
    }

    console.log(`Processing voice transcription: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const result = await aiService.transcribeAudio(deepgramApiKey, file.path);

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Transcription Route Error:', error.response?.data || error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || 'Internal Server Error';

    res.status(status).json({ success: false, message });
  }
});

// File Upload to R2
router.post('/upload', authMiddleware, upload.single('file'), async (req: any, res) => {
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
router.post('/tts', authMiddleware, async (req: any, res) => {
  try {
    const { text, model } = req.body;
    const userId = req.user.id;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    const deepgramApiKey = await ApiKeyService.getUserApiKey(userId, 'deepgram');

    if (!deepgramApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Deepgram API Key not found. Please add it in settings.'
      });
    }

    const stream: any = await aiService.generateSpeech(deepgramApiKey, text, model);

    // Set response headers for audio stream
    res.setHeader('Content-Type', 'audio/mpeg');

    // Pipe the stream to the res
    stream.pipe(res);
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileService } from './file.service';
import { videoService, VideoService } from './video.service';
import { r2Service } from './r2.service';
import { aiService } from './ai.service';
import { ApiKeyService } from './apiKey.service';
import { supabaseAdmin } from '../lib/supabase';
import { TokenManager } from '../utils/tokenManager';

export interface AttachmentInput {
  name: string;
  type: string;
  url: string;
  extractedText?: string;
  [key: string]: any;
}

export interface ProcessedMultimodalResult {
  /**
   * Additional multimodal parts (e.g. inlineData, fileData, image_url)
   * to be attached to the active user message's content array.
   */
  parts: any[];

  /**
   * Extracted text context (from documents or audio transcription fallbacks)
   * to be hydrated into the message context.
   */
  extractedContext: string;

  /**
   * Clean attachments to persist in the message's metadata in Supabase.
   * Preserves the user's authentic attachments without polluting with fake frame PNGs.
   */
  cleanAttachments: AttachmentInput[];
}

export function getMimeType(fileName: string, defaultMime = 'application/octet-stream'): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    // Video
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    flv: 'video/x-flv',
    wmv: 'video/x-ms-wmv',
    mpg: 'video/mpeg',
    mpeg: 'video/mpeg',
    '3gp': 'video/3gpp',
    // Audio
    mp3: 'audio/mp3',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    // Documents
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
  };
  return (ext && mimeMap[ext]) || defaultMime;
}

export class MultimodalService {
  // Inline base64 payload thresholds for Google Gemini API
  private readonly GOOGLE_INLINE_MEDIA_MAX_BYTES = 20 * 1024 * 1024; // 20 MB for video/audio
  private readonly GOOGLE_INLINE_PDF_MAX_BYTES = 50 * 1024 * 1024;   // 50 MB for PDFs

  /**
   * Processes request attachments according to the target model provider's capabilities.
   *
   * - Google Gemini: Direct native multimodal delivery (Video, Audio, PDF, Image) via inlineData or File API.
   * - Groq / NVIDIA: Frame extraction fallback for Video, STT fallback for Audio, text extraction for Docs,
   *   and OpenAI `image_url` for Images.
   */
  async processRequestAttachments(options: {
    attachments: AttachmentInput[];
    model: string;
    provider: string;
    modelInfo: any;
    apiKey: string;
    userId?: string;
    conversationId?: string;
    messageId?: string;
    writeSSE: (data: any) => void;
  }): Promise<ProcessedMultimodalResult> {
    const {
      attachments,
      model,
      provider,
      modelInfo,
      apiKey,
      userId,
      conversationId,
      messageId,
      writeSSE,
    } = options;

    const parts: any[] = [];
    let extractedContext = '';
    const cleanAttachments: AttachmentInput[] = [...attachments];

    if (!attachments || attachments.length === 0) {
      return { parts, extractedContext, cleanAttachments };
    }

    const isGoogle = provider === 'google';
    const isGroq = provider === 'groq';
    const isVision = !!modelInfo?.is_vision;
    const imgLimit = modelInfo?.img_no_can_process ?? (isGroq ? 3 : 10);

    const docAttachments = attachments.filter((a) => a.type === 'document');
    const audioAttachments = attachments.filter((a) => a.type === 'audio');
    const videoAttachments = attachments.filter((a) => a.type === 'video');
    const imageAttachments = attachments.filter((a) => a.type === 'image' || a.type?.startsWith('image/'));

    console.log(
      `[MultimodalService] Processing for model=${model} (provider=${provider}, isVision=${isVision}): ` +
      `Docs=${docAttachments.length}, Audio=${audioAttachments.length}, Video=${videoAttachments.length}, Images=${imageAttachments.length}`
    );

    // =========================================================================
    // 1. PROCESS DOCUMENTS (PDF & Text/Spreadsheets)
    // =========================================================================
    if (docAttachments.length > 0) {
      writeSSE({ status: 'Processing documents...' });
      const docResults: { name: string; text: string }[] = [];
      const nativePdfNames: string[] = [];

      for (const doc of docAttachments) {
        const isPdf = doc.name.toLowerCase().endsWith('.pdf');

        if (isGoogle && isPdf) {
          // Google Gemini natively reads PDFs with layout, charts, and diagrams!
          console.log(`[MultimodalService] Native PDF processing for Google Gemini: ${doc.name}`);
          writeSSE({ status: `Preparing PDF ${doc.name} for Gemini...` });

          const tempDocPath = path.join(process.cwd(), 'uploads', `temp-pdf-${uuidv4()}-${doc.name.replace(/[^a-z0-9.]/gi, '_')}`);
          try {
            await fileService.downloadFile(doc.url, tempDocPath);
            const fileSize = fs.statSync(tempDocPath).size;

            if (fileSize <= this.GOOGLE_INLINE_PDF_MAX_BYTES) {
              console.log(`[MultimodalService] PDF ${doc.name} size: ${fileSize} bytes <= 50MB. Using inlineData.`);
              const base64Data = fs.readFileSync(tempDocPath).toString('base64');
              parts.push({
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Data,
                },
              });
              nativePdfNames.push(doc.name);
            } else {
              console.log(`[MultimodalService] PDF ${doc.name} size: ${fileSize} bytes > 50MB. Uploading via Gemini File API.`);
              writeSSE({ status: `Uploading large PDF to Gemini File API...` });
              const uploaded = await aiService.uploadFileGoogle(apiKey, tempDocPath, 'application/pdf', doc.name);
              parts.push({
                fileData: {
                  fileUri: uploaded.fileUri,
                  mimeType: uploaded.mimeType,
                },
              });
              nativePdfNames.push(doc.name);
            }
          } catch (err: any) {
            console.error(`[MultimodalService] Failed native PDF upload for ${doc.name}:`, err.message);
            // Fallback to text extraction if native PDF preparation fails
            const fallbackText = await fileService.extractText(doc.url, doc.name);
            docResults.push({ name: doc.name, text: fallbackText });
          } finally {
            if (fs.existsSync(tempDocPath)) {
              try { fs.unlinkSync(tempDocPath); } catch (_) {}
            }
          }
        } else {
          // Non-PDF documents (.docx, .xlsx, .csv, .txt) or non-Google providers: Extract text!
          if (doc.extractedText) {
            console.log(`[MultimodalService] Using pre-extracted text for document: ${doc.name} (${doc.extractedText.length} chars)`);
            docResults.push({ name: doc.name, text: doc.extractedText });
          } else {
            console.log(`[MultimodalService] Extracting text for document: ${doc.name}`);
            const text = await fileService.extractText(doc.url, doc.name);
            docResults.push({ name: doc.name, text });
          }
        }
      }

      if (nativePdfNames.length > 0) {
        extractedContext += `\n\n[SYSTEM INSTRUCTION: The user has attached ${nativePdfNames.length} PDF document(s): ${nativePdfNames.join(', ')}. Please carefully examine and analyze these attached document(s) in your response.]\n`;
      }

      if (docResults.length > 0) {
        let docContext = "\n\n### CONTEXT FROM ATTACHED DOCUMENTS ###\n";
        docContext += "The user has provided the following documents as reference. Please analyze them and use the information to answer questions or perform requested tasks:\n\n";
        for (const item of docResults) {
          docContext += `#### DOCUMENT: ${item.name}\n${item.text}\n#### END OF ${item.name}\n\n`;
        }
        docContext = TokenManager.truncateDocumentText(docContext, 100000);
        docContext += "### END OF DOCUMENT CONTEXT ###\n\n";
        extractedContext += docContext;
      }
    }

    // =========================================================================
    // 2. PROCESS AUDIO (Native Audio vs STT Transcription)
    // =========================================================================
    if (audioAttachments.length > 0) {
      if (isGoogle) {
        // Google Gemini natively understands audio (tone, background sounds, accents, music)!
        console.log(`[MultimodalService] Native audio processing for Google Gemini (${audioAttachments.length} files)`);
        for (const audio of audioAttachments) {
          writeSSE({ status: `Preparing audio ${audio.name} for Gemini...` });
          const tempAudioPath = path.join(process.cwd(), 'uploads', `temp-audio-${uuidv4()}-${audio.name.replace(/[^a-z0-9.]/gi, '_')}`);
          const mimeType = getMimeType(audio.name, 'audio/mp3');

          try {
            await fileService.downloadFile(audio.url, tempAudioPath);
            const fileSize = fs.statSync(tempAudioPath).size;

            if (fileSize <= this.GOOGLE_INLINE_MEDIA_MAX_BYTES) {
              console.log(`[MultimodalService] Audio ${audio.name} size: ${fileSize} bytes <= 20MB. Using inlineData.`);
              const base64Data = fs.readFileSync(tempAudioPath).toString('base64');
              parts.push({
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              });
            } else {
              console.log(`[MultimodalService] Audio ${audio.name} size: ${fileSize} bytes > 20MB. Uploading via Gemini File API.`);
              writeSSE({ status: `Uploading large audio to Gemini File API...` });
              const uploaded = await aiService.uploadFileGoogle(apiKey, tempAudioPath, mimeType, audio.name);
              parts.push({
                fileData: {
                  fileUri: uploaded.fileUri,
                  mimeType: uploaded.mimeType,
                },
              });
            }
          } catch (err: any) {
            console.error(`[MultimodalService] Failed native audio processing for ${audio.name}:`, err.message);
          } finally {
            if (fs.existsSync(tempAudioPath)) {
              try { fs.unlinkSync(tempAudioPath); } catch (_) {}
            }
          }
        }
      } else {
        // Groq / NVIDIA: Chat completions do not accept audio binaries, run STT fallback!
        console.log(`[MultimodalService] Running STT transcription fallback for ${audioAttachments.length} audio file(s)`);
        const { key: deepgramApiKey } = await ApiKeyService.getUserApiKey(userId, 'deepgram');

        for (const audio of audioAttachments) {
          writeSSE({ status: `Transcribing ${audio.name}...` });
          const tempAudioPath = path.join(process.cwd(), 'uploads', `temp-audio-${uuidv4()}-${audio.name.replace(/[^a-z0-9.]/gi, '_')}`);

          try {
            await fileService.downloadFile(audio.url, tempAudioPath);
            let transcript = '';

            if (deepgramApiKey) {
              const res = await aiService.transcribeAudio(deepgramApiKey, tempAudioPath);
              transcript = res.text;
            } else if (isGroq) {
              // If user has Groq API key and no Deepgram, use Groq Whisper STT
              const res = await aiService.transcribeAudioGroq(apiKey, tempAudioPath, 'whisper-large-v3-turbo', audio.name);
              transcript = res.text;
            }

            if (transcript) {
              const audioContext = `\n\n### TRANSCRIPT FOR AUDIO: ${audio.name} ###\n${transcript}\n### END OF TRANSCRIPT ###\n`;
              extractedContext += audioContext;
            }
          } catch (err: any) {
            console.error(`[MultimodalService] STT transcription failed for ${audio.name}:`, err.message);
          } finally {
            if (fs.existsSync(tempAudioPath)) {
              try { fs.unlinkSync(tempAudioPath); } catch (_) {}
            }
          }
        }
      }
    }

    // =========================================================================
    // 3. PROCESS VIDEO (Native Video vs Frame Extraction Fallback)
    // =========================================================================
    if (videoAttachments.length > 0) {
      if (isGoogle) {
        // Google Gemini natively understands video! Zero frame extraction needed!
        console.log(`[MultimodalService] Native video processing for Google Gemini (${videoAttachments.length} video(s))`);

        for (const video of videoAttachments) {
          writeSSE({ status: `Preparing video ${video.name} for Gemini...` });
          const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-video-${uuidv4()}-${video.name.replace(/[^a-z0-9.]/gi, '_')}`);
          const mimeType = getMimeType(video.name, 'video/mp4');

          try {
            await fileService.downloadFile(video.url, tempVideoPath);
            const fileSize = fs.statSync(tempVideoPath).size;

            if (fileSize <= this.GOOGLE_INLINE_MEDIA_MAX_BYTES) {
              console.log(`[MultimodalService] Video ${video.name} size: ${fileSize} bytes <= 20MB. Sending inlineData directly.`);
              const base64Data = fs.readFileSync(tempVideoPath).toString('base64');
              parts.push({
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              });
            } else {
              console.log(`[MultimodalService] Video ${video.name} size: ${fileSize} bytes > 20MB. Uploading via Gemini File API.`);
              writeSSE({ status: `Uploading ${video.name} to Gemini File API (processing video)...` });
              try {
                const uploaded = await aiService.uploadFileGoogle(apiKey, tempVideoPath, mimeType, video.name);
                parts.push({
                  fileData: {
                    fileUri: uploaded.fileUri,
                    mimeType: uploaded.mimeType,
                  },
                });
              } catch (uploadErr: any) {
                console.warn(`[MultimodalService] Gemini File API upload failed (${uploadErr.message}). Falling back to visual frame extraction...`);
                writeSSE({ status: `Gemini File API unavailable. Extracting visual frames as fallback for ${video.name}...` });

                const framePaths = await videoService.extractFrames(tempVideoPath, 5);
                if (framePaths.length > 0) {
                  for (const fp of framePaths) {
                    try {
                      const frameBase64 = fs.readFileSync(fp).toString('base64');
                      parts.push({
                        inlineData: {
                          mimeType: 'image/png',
                          data: frameBase64,
                        },
                      });
                    } catch (_) {}
                  }
                  videoService.cleanup(framePaths);
                  extractedContext += `\n\n[SYSTEM INSTRUCTION: Video "${video.name}" could not be uploaded natively. Attached above are 5 representative visual frames from the video. Treat them as the visual content of the video to answer the user's query.]\n`;
                } else {
                  throw uploadErr;
                }
              }
            }

            // Store clean reference in conversation for context recall
            if (conversationId) {
              await this.storeVideoInConversation(conversationId, video.name, video.url);
            }
          } catch (err: any) {
            console.error(`[MultimodalService] Native video preparation failed for ${video.name}:`, err.message);
            writeSSE({ status: `Warning: Failed to prepare ${video.name}: ${err.message}` });
          } finally {
            if (fs.existsSync(tempVideoPath)) {
              try { fs.unlinkSync(tempVideoPath); } catch (_) {}
            }
          }
        }
      } else if (isVision) {
        // Groq / NVIDIA Vision models: Frame extraction fallback!
        console.log(`[MultimodalService] Frame extraction fallback for vision model: ${model}`);

        for (const video of videoAttachments) {
          writeSSE({ status: `Downloading ${video.name}...` });
          const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-video-${uuidv4()}-${video.name.replace(/[^a-z0-9.]/gi, '_')}`);

          try {
            await fileService.downloadFile(video.url, tempVideoPath);

            // Determine frame count (capped by model's img_no_can_process, e.g. 3 for Qwen 3.8 27B)
            let frameCount = 5;
            try {
              const duration = await videoService.getDuration(tempVideoPath);
              frameCount = VideoService.optimalFrameCount(duration);
            } catch (_) {}

            if (imgLimit && frameCount > imgLimit) {
              frameCount = Math.max(1, imgLimit);
              console.log(`[MultimodalService] Capping extracted frames to ${frameCount} for ${model}`);
            }

            writeSSE({ status: `Extracting ${frameCount} key frames from ${video.name}...` });
            const framePaths = await videoService.extractFrames(tempVideoPath, frameCount);

            if (framePaths.length > 0) {
              writeSSE({ status: `Uploading ${framePaths.length} visual frames...` });
              const uploadedUrls: string[] = [];

              for (const fp of framePaths) {
                try {
                  const frameUrl = await r2Service.uploadFile(fp, path.basename(fp), 'image/png');
                  uploadedUrls.push(frameUrl);
                } catch (e: any) {
                  console.error(`[MultimodalService] Frame upload failed:`, e.message);
                }
              }

              // Add frame parts as image_url for the model
              for (const url of uploadedUrls) {
                parts.push({
                  type: 'image_url',
                  image_url: { url },
                });
              }

              // Add instructions for model context
              extractedContext += `\n\n[SYSTEM INSTRUCTION: You are being provided with ${uploadedUrls.length} key visual frames from the video "${video.name}". Treat them as the visual content of the video to answer the user's query.]\n`;

              // Store video reference in conversation for future recall
              if (conversationId) {
                await this.storeVideoInConversation(conversationId, video.name, video.url);
              }
            }

            videoService.cleanup(framePaths);
          } catch (err: any) {
            console.error(`[MultimodalService] Video frame extraction failed for ${video.name}:`, err.message);
          } finally {
            if (fs.existsSync(tempVideoPath)) {
              try { fs.unlinkSync(tempVideoPath); } catch (_) {}
            }
          }
        }
      } else {
        console.warn(`[MultimodalService] Model ${model} is not vision-capable. Video attachments skipped.`);
        writeSSE({ status: `Notice: ${model} cannot process video. Skipping video file.` });
      }
    }

    // =========================================================================
    // 4. PROCESS IMAGES
    // =========================================================================
    if (imageAttachments.length > 0) {
      if (isGoogle) {
        // For Google: Convert image to base64 inlineData
        for (const img of imageAttachments) {
          try {
            console.log(`[MultimodalService] Converting image to inlineData for Gemini: ${img.name}`);
            const base64DataUri = await aiService.urlToBase64(img.url);
            const match = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              });
            }
          } catch (err: any) {
            console.warn(`[MultimodalService] Failed to load image for Gemini: ${img.url}`, err.message);
          }
        }
      } else if (isVision) {
        // For Groq / NVIDIA: Pass image_url parts
        // If single image or specific model requires base64, aiService handles data URI conversion
        const allowedImages = imageAttachments.slice(0, imgLimit || 10);
        for (const img of allowedImages) {
          parts.push({
            type: 'image_url',
            image_url: { url: img.url },
          });
        }
      } else {
        console.warn(`[MultimodalService] Model ${model} is not vision-capable. Images stripped.`);
      }
    }

    // Update database message if messageId is supplied
    if (messageId && (extractedContext || cleanAttachments.length > 0)) {
      try {
        const { data: currentMsg } = await supabaseAdmin
          .from('messages')
          .select('metadata')
          .eq('id', messageId)
          .single();

        await supabaseAdmin
          .from('messages')
          .update({
            metadata: {
              ...(currentMsg?.metadata || {}),
              hasContext: !!extractedContext,
              extractedContext: extractedContext || undefined,
              attachments: cleanAttachments,
            },
          })
          .eq('id', messageId);
      } catch (dbErr: any) {
        console.error('[MultimodalService] DB update error:', dbErr.message);
      }
    }

    return { parts, extractedContext, cleanAttachments };
  }

  /**
   * Helper to process video context recall when user references a past video in chat.
   */
  async processVideoRecall(options: {
    referencedVideos: { name: string; url: string }[];
    model: string;
    provider: string;
    modelInfo: any;
    apiKey: string;
    writeSSE: (d: any) => void;
  }): Promise<{ parts: any[]; contextInstruction: string }> {
    const { referencedVideos, model, provider, modelInfo, apiKey, writeSSE } = options;
    const parts: any[] = [];
    let contextInstruction = '';

    const isGoogle = provider === 'google';
    const isVision = !!modelInfo?.is_vision;

    for (const refVideo of referencedVideos) {
      writeSSE({ status: `Recalling previous video "${refVideo.name}"...` });
      const tempVideoPath = path.join(process.cwd(), 'uploads', `temp-recall-${uuidv4()}-${refVideo.name.replace(/[^a-z0-9.]/gi, '_')}`);
      const mimeType = getMimeType(refVideo.name, 'video/mp4');

      try {
        await fileService.downloadFile(refVideo.url, tempVideoPath);

        if (isGoogle) {
          const fileSize = fs.statSync(tempVideoPath).size;
          if (fileSize <= this.GOOGLE_INLINE_MEDIA_MAX_BYTES) {
            const base64Data = fs.readFileSync(tempVideoPath).toString('base64');
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          } else {
            try {
              const uploaded = await aiService.uploadFileGoogle(apiKey, tempVideoPath, mimeType, refVideo.name);
              parts.push({
                fileData: {
                  fileUri: uploaded.fileUri,
                  mimeType: uploaded.mimeType,
                },
              });
            } catch (uploadErr: any) {
              console.warn(`[MultimodalService] Gemini File API upload failed for recall (${uploadErr.message}). Falling back to visual frames...`);
              writeSSE({ status: `Gemini File API unavailable. Extracting visual frames for recall of ${refVideo.name}...` });

              const framePaths = await videoService.extractFrames(tempVideoPath, 5);
              for (const fp of framePaths) {
                try {
                  const frameBase64 = fs.readFileSync(fp).toString('base64');
                  parts.push({
                    inlineData: {
                      mimeType: 'image/png',
                      data: frameBase64,
                    },
                  });
                } catch (_) {}
              }
              videoService.cleanup(framePaths);
              contextInstruction += `\n\n[SYSTEM INSTRUCTION: The user is referencing the previously uploaded video "${refVideo.name}". Visual frames have been attached above for your reference.]\n`;
            }
          }
        } else if (isVision) {
          const framePaths = await videoService.extractFrames(tempVideoPath, isGoogle ? 5 : (modelInfo?.img_no_can_process || 3));
          for (const fp of framePaths) {
            try {
              const frameUrl = await r2Service.uploadFile(fp, path.basename(fp), 'image/png');
              parts.push({
                type: 'image_url',
                image_url: { url: frameUrl },
              });
            } catch (_) {}
          }
          videoService.cleanup(framePaths);
          contextInstruction += `\n\n[SYSTEM INSTRUCTION: The user is referencing the previously uploaded video "${refVideo.name}". Extracted key visual frames have been attached above for your reference.]\n`;
        }
      } catch (err: any) {
        console.error(`[MultimodalService] Failed to recall video ${refVideo.name}:`, err.message);
      } finally {
        if (fs.existsSync(tempVideoPath)) {
          try { fs.unlinkSync(tempVideoPath); } catch (_) {}
        }
      }
    }

    return { parts, contextInstruction };
  }

  private async storeVideoInConversation(conversationId: string, videoName: string, videoUrl: string) {
    try {
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('videos_in_conversation')
        .eq('id', conversationId)
        .single();

      const existingVideos: { name: string; url: string }[] = conv?.videos_in_conversation || [];
      if (!existingVideos.some((v) => v.name === videoName)) {
        existingVideos.push({ name: videoName, url: videoUrl });
        await supabaseAdmin
          .from('conversations')
          .update({ videos_in_conversation: existingVideos })
          .eq('id', conversationId);
      }
    } catch (err: any) {
      console.error('[MultimodalService] Error storing video in conversation:', err.message);
    }
  }
}

export const multimodalService = new MultimodalService();

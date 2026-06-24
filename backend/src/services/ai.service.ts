import OpenAI from 'openai';
import { DeepgramClient } from '@deepgram/sdk';
import fs from 'fs';
import { Readable } from 'stream';
import { TokenManager } from '../utils/tokenManager';
import { supabaseAdmin } from '../lib/supabase';
import axios from 'axios';

class AiService {
  private static readonly FLUX_DEV_DIMENSIONS = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
  private static readonly FLUX_KONTEXT_DIMENSIONS = [1568, 1504, 1456, 1392, 1328, 1248, 1184, 1104, 1024, 944, 880, 832, 800, 752, 720, 688, 672];

  private snapToBestFluxDimensions(targetW: number, targetH: number, supportedDims: number[]): { width: number, height: number } {
    const targetRatio = targetW / targetH;
    const targetArea = targetW * targetH;
    
    let bestW = supportedDims[0] || 1024;
    let bestH = supportedDims[0] || 1024;
    let minRatioDiff = Infinity;
    let minAreaDiff = Infinity;

    for (const w of supportedDims) {
      for (const h of supportedDims) {
        const ratio = w / h;
        const area = w * h;
        const ratioDiff = Math.abs(ratio - targetRatio);
        const areaDiff = Math.abs(area - targetArea);

        // Primary criteria: Closest aspect ratio
        // Secondary criteria: Closest area (to handle scale)
        // We use a small epsilon for ratio difference to allow area to break ties for very similar ratios
        if (ratioDiff < minRatioDiff - 0.001) {
          minRatioDiff = ratioDiff;
          minAreaDiff = areaDiff;
          bestW = w;
          bestH = h;
        } else if (Math.abs(ratioDiff - minRatioDiff) <= 0.001 && areaDiff < minAreaDiff) {
          minAreaDiff = areaDiff;
          bestW = w;
          bestH = h;
        }
      }
    }
    return { width: bestW, height: bestH };
  }

  private readonly DEFAULT_SYSTEM_PROMPT = `
  You are Sree AI, a helpful and sophisticated AI assistant developed by NilStudio. 
  Your purpose is to provide detailed, comprehensive, and high-quality responses to user queries across a wide range of topics.
  
  CORE CHARACTERISTICS:
  - Professional and well-spoken
  - Friendly and engaging tone
  - Detailed and thorough explanations
  - Creative and versatile
  - Safe and ethical
  
  ACADEMIC INTEGRITY (CRITICAL):
  - You MUST NOT generate, provide, or assist with any content that could be considered academic dishonesty, cheating, or plagiarism.
  - This explicitly includes:
    - Writing essays, papers, or reports for the user
    - Completing homework or assignments
    - Providing answers to tests, quizzes, or examinations
    - Generating code intended to be submitted as the user's own work without proper attribution
    - Creating exam keys or solutions
  
  SAFE RESPONSE HANDLING:
  - Always prioritize safety and academic honesty in your responses.
  - If a user's query is ambiguous or could be interpreted as a request for academic dishonesty, default to providing educational support only.
  - Examples of acceptable support:
    - Explaining underlying concepts
    - Teaching study methods and strategies
    - Offering research approaches and resources
    - Guiding through problem-solving processes without giving final answers
    - Providing templates or frameworks for academic work
  
  OUTPUT GUIDELINES:
  - Provide comprehensive and complete responses that fully address the user's query
  - Ensure all code snippets are fully functional, well-explained, and follow best practices
  - When code is requested, include:
    - The complete code block
    - Clear explanations of how it works
    - Usage examples
    - Any necessary setup or dependencies
  - If a user requests content that violates academic integrity, politely decline and explain that you are programmed to uphold academic honesty and provide educational support only.
  - When declining a request, do so politely and offer alternative, academically appropriate assistance.
  
  TONE AND STYLE:
  - Be conversational yet professional
  - Use clear and concise language
  - Structure responses logically with headings and bullet points when appropriate
  - Adapt your tone based on the user's query while maintaining your core characteristics
  
  EXAMPLE RESPONSES:
  - If asked "Write a 500-word essay on climate change": 
    "I can't write the essay for you, but I can help you create a strong outline, find reliable sources, and understand the key concepts of climate change."
  - If asked "Solve this math problem":
    "I can't give you the final answer, but I can walk you through the steps to solve it yourself. Let's start with the first part of the problem..."
  - If asked "Generate Python code for X":
    "Here's a complete, functional Python solution for X with detailed explanations..."
  
  REMEMBER: Your goal is to be a helpful AI assistant while strictly maintaining academic integrity and promoting ethical behavior.
  `


  private getNvidiaClient(apiKey: string) {
    return new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }

  private getGoogleClient(apiKey: string) {
    return new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }

  private getGroqClient(apiKey: string) {
    return new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  /**
   * Returns the appropriate OpenAI-compatible client based on model provider.
   */
  private getClientForModel(apiKey: string, provider: string) {
    switch (provider) {
      case 'google':
        return this.getGoogleClient(apiKey);
      case 'groq':
        return this.getGroqClient(apiKey);
      case 'nvidia':
      default:
        return this.getNvidiaClient(apiKey);
    }
  }

  async streamChat(apiKey: string, messages: any[], model: string = 'meta/llama-3.1-70b-instruct', onStatus?: (status: string) => void, userId?: string, provider: string = 'nvidia'): Promise<any> {
    const openai = this.getClientForModel(apiKey, provider);

    // 1. Fetch model configuration
    const { data: modelInfo } = await supabaseAdmin
      .from('ai_models')
      .select('max_tokens, context_window, is_vision, is_fast, img_no_can_process')
      .eq('model_id', model)
      .single();

    const contextLimit = modelInfo?.context_window || 4096;
    const modelMaxOutputTokens = modelInfo?.max_tokens || 4096;

    // 1. Extract and merge all system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    let systemContent = systemMessages.length > 0
      ? systemMessages.map(m => m.content).join('\n\n')
      : this.DEFAULT_SYSTEM_PROMPT;

    // Fetch and append user personalization settings if authenticated
    if (userId) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('nickname, occupation, custom_instructions, more_about_you')
          .eq('id', userId)
          .single();

        if (profile) {
          const parts: string[] = [];
          if (profile.nickname?.trim()) {
            parts.push(`- Nickname/Preferred Name: "${profile.nickname.trim()}". Address the user by this name when appropriate.`);
          }
          if (profile.occupation?.trim()) {
            parts.push(`- Occupation/Context: "${profile.occupation.trim()}". Tailor professional/industry context to this occupation.`);
          }
          if (profile.more_about_you?.trim()) {
            parts.push(`- About the user (interests, values, background): "${profile.more_about_you.trim()}". Keep this context in mind.`);
          }
          if (profile.custom_instructions?.trim()) {
            parts.push(`- Custom behavior, style, and tone instructions: "${profile.custom_instructions.trim()}". You MUST strictly adhere to these instruction preferences.`);
          }

          if (parts.length > 0) {
            systemContent += `\n\n### USER PERSONALIZATION CONTEXT & INSTRUCTIONS\n${parts.join('\n')}\n`;
          }
        }
      } catch (err: any) {
        console.error(`[AiService] Failed to fetch profile for personalization context:`, err.message);
      }
    }

    // 2. Start with the single merged system message
    const processedMessages: any[] = [{ role: 'system', content: systemContent }];

    // 3. Consolidate consecutive non-system roles
    for (const msg of nonSystemMessages) {
      const last = processedMessages[processedMessages.length - 1];

      // If same role as last message (and not system), merge them
      if (last && last.role === msg.role) {
        if (typeof last.content === 'string' && typeof msg.content === 'string') {
          last.content += '\n\n' + msg.content;
        } else {
          // Handle complex content (arrays of parts)
          const lastParts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
          const msgParts = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
          last.content = [...lastParts, ...msgParts];
        }

        // Merge attachments if present
        if (msg.metadata?.attachments) {
          last.metadata = last.metadata || {};
          last.metadata.attachments = [
            ...(last.metadata.attachments || []),
            ...msg.metadata.attachments
          ];
        }
      } else {
        // Different role, add as new message
        processedMessages.push({ ...msg });
      }
    }

    // 4. Ensure the conversation starts with a user message (after system)
    // Some APIs require the first message after system to be 'user'
    while (processedMessages.length > 1 && processedMessages[1].role === 'assistant') {
      processedMessages.splice(1, 1);
    }

    // 4. Hydrate messages with document context
    const hydrated = processedMessages.map(m => {
      if (m.metadata?.extractedContext) {
        const contextStr = `\n\n### DOCUMENT CONTEXT ###\n${m.metadata.extractedContext}\n### END OF DOCUMENT CONTEXT ###`;

        if (typeof m.content === 'string') {
          return { ...m, content: m.content + contextStr };
        } else if (Array.isArray(m.content)) {
          // Add context to the first text part, or unshift a new text part
          const newContent = [...m.content];
          const textPart = newContent.find((p: any) => p.type === 'text');
          if (textPart) {
            textPart.text += contextStr;
          } else {
            newContent.unshift({ type: 'text', text: contextStr });
          }
          return { ...m, content: newContent };
        }
      }
      return m;
    });

    let retryCount = 0;
    const maxRetries = 2; // Increase to 2 for more resilience against cold starts
    let currentLimit = contextLimit;

    // Use the full model capacity unless we are forced to limit it
    let currentMaxOutputTokens = modelMaxOutputTokens;
    let workingMessages = [...hydrated];

    while (retryCount <= maxRetries) {
      const safePruneThreshold = 100; // Buffer for safety

      try {
        // Step A: Calculate current request token size
        let promptTokens = TokenManager.countMessagesTokens(workingMessages);

        // Step B: Define a safe reservation for generation
        // If it's a retry, we use a fixed 1024 for stability, otherwise use the model's max
        let reservedTokens = retryCount > 0 ? Math.min(1024, currentMaxOutputTokens) : currentMaxOutputTokens;

        // DYNAMIC EXPANSION: If the model is marked as 'fast' and there's plenty of space 
        // in the context window, we expand the output reservation to deliver the best possible output.
        if (retryCount === 0 && modelInfo?.is_fast) {
          const safetyBuffer = 500;
          const absoluteMaxOutput = Math.max(8192, currentMaxOutputTokens); // Allow expansion up to 8k or the model's specific high limit
          const availableForOutput = currentLimit - promptTokens - safetyBuffer;

          if (availableForOutput > reservedTokens) {
            const expandedTokens = Math.min(availableForOutput, absoluteMaxOutput);
            if (expandedTokens > reservedTokens) {
              console.log(`[AiService] Fast model detected. Space available (${availableForOutput} tokens). Expanding output reservation from ${reservedTokens} to ${expandedTokens}.`);
              reservedTokens = expandedTokens;
            }
          }
        }

        // Step C: Dynamic Token Allocation & Pruning
        // We want to balance between keeping conversation history and allowing for full AI responses
        const totalRequested = promptTokens + reservedTokens;
        let finalMessages = [...workingMessages];

        if (totalRequested > currentLimit) {
          // If we have "room" to prune history while keeping at least 1000 tokens of context, 
          // we prioritize the output tokens requested by the user.
          const minHistoryBuffer = 1000;
          if (promptTokens > minHistoryBuffer && (currentLimit - reservedTokens) >= minHistoryBuffer) {
            const targetPromptTokens = currentLimit - reservedTokens - safePruneThreshold;
            console.warn(`[AiService] Context limit reached. Pruning history to ${targetPromptTokens} to preserve ${reservedTokens} output tokens.`);
            finalMessages = TokenManager.pruneMessages(workingMessages, targetPromptTokens);
            promptTokens = TokenManager.countMessagesTokens(finalMessages);
          } else {
            // If history is already thin, we have no choice but to limit the output tokens
            // to fit within the remaining context window.
            reservedTokens = Math.max(1024, currentLimit - promptTokens - safePruneThreshold);
            console.warn(`[AiService] Context limit reached with minimal history. Reducing output tokens to ${reservedTokens}.`);
          }
        }

        const finalVerificationTotal = promptTokens + reservedTokens;
        console.log(`[AiService] Final allocation: Prompt=${promptTokens}, Reserved=${reservedTokens}, Total=${finalVerificationTotal}, Limit=${currentLimit}`);
        
        // Enforce image count limit based on model's img_no_can_process setting
        const imgLimit = modelInfo?.img_no_can_process; // NULL = no limit
        if (imgLimit != null && imgLimit > 0) {
          // Step 1: Collect all image locations across the conversation (in order)
          const imageLocations: { msgIdx: number; partIdx: number }[] = [];
          for (let i = 0; i < finalMessages.length; i++) {
            if (Array.isArray(finalMessages[i].content)) {
              const parts = finalMessages[i].content as any[];
              for (let j = 0; j < parts.length; j++) {
                if (parts[j].type === 'image_url') {
                  imageLocations.push({ msgIdx: i, partIdx: j });
                }
              }
            }
          }

          // Step 2: If we exceed the limit, keep only the latest N images
          if (imageLocations.length > imgLimit) {
            const toRemove = new Set(
              imageLocations.slice(0, imageLocations.length - imgLimit)
                .map(loc => `${loc.msgIdx}-${loc.partIdx}`)
            );
            console.log(`[AiService] Image limit is ${imgLimit} for model ${model}. Found ${imageLocations.length} images, pruning ${toRemove.size}.`);

            for (let i = 0; i < finalMessages.length; i++) {
              if (Array.isArray(finalMessages[i].content)) {
                finalMessages[i].content = (finalMessages[i].content as any[]).filter(
                  (part: any, j: number) => !(part.type === 'image_url' && toRemove.has(`${i}-${j}`))
                );
              }
            }
          }
        }

        console.log(`[AiService] Request for model: ${model} | Found in DB: ${!!modelInfo} | Is Vision: ${modelInfo?.is_vision} | Img limit: ${imgLimit ?? 'none'}`);

        // Convert messages to a format the API expects
        // and sanitize content (ensure no vision parts reach non-vision models)
        const sanitized = await Promise.all(finalMessages.map(async (m) => {
          let content = m.content;

          if (Array.isArray(content)) {
            const imageParts = content.filter((part: any) => part.type === 'image_url');
            const hasImages = imageParts.length > 0;

            if (!modelInfo?.is_vision || !hasImages) {
              if (hasImages) {
                console.warn(`[AiService] Stripping images from message for non-vision model: ${model}`);
              }
              // Always flatten to string for non-vision models or text-only messages
              // This fixes errors where the API expects a string but receives an array of text parts
              content = content
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('\n\n');
            } else {
              // Image delivery strategy based on model capacity:
              // 1. Single-image models (limit === 1): Always send base64 for best compatibility.
              // 2. Multi-image models (limit > 1 or none): Always send URLs to keep payload size low (critical for video frames).
              const imgLimit = modelInfo?.img_no_can_process;
              const forceBase64 = imgLimit === 1;

              content = await Promise.all(content.map(async (part: any) => {
                if (part.type === 'image_url' && part.image_url?.url && part.image_url.url.startsWith('http')) {
                  const url = part.image_url.url;

                  if (forceBase64) {
                    try {
                      console.log(`[AiService] Single-image model detected (${model}). Converting to base64 for compatibility...`);
                      const base64 = await this.urlToBase64(url);
                      return {
                        type: 'image_url',
                        image_url: { url: base64 }
                      };
                    } catch (err: any) {
                      console.error(`[AiService] Failed to convert image to base64: ${err.message}`);
                      return part; // Fallback to original URL
                    }
                  } else {
                    console.log(`[AiService] Multi-image model detected (${model}). Sending URL directly: ${url.substring(0, 60)}...`);
                    return part;
                  }
                }
                return part;
              }));
            }
          }

          // Ensure content is never truly empty as some APIs (like NVIDIA NIM) reject empty strings
          // Use a single space as a safe placeholder
          return { role: m.role, content: content || " " };
        }));

        console.log(`[AiService] Final sanitized messages count: ${sanitized.length}`);
        const lastMsg = sanitized[sanitized.length - 1];
        if (lastMsg) {
          const isMultimodal = Array.isArray(lastMsg.content);
          console.log(`[AiService] Last message role: ${lastMsg.role} | Content type: ${typeof lastMsg.content} | Multimodal: ${isMultimodal}`);
        }
        
        console.log(`[AiService] Sending request to model ${model} with ${sanitized.length} messages. Provider: ${provider}`);
        
        // Build provider-aware request params
        // Google's OpenAI-compatible endpoint requires max_completion_tokens (rejects max_tokens with 400)
        const requestParams: any = {
          model,
          messages: sanitized as any,
          stream: true,
          temperature: 0.7,
        };

        if (provider === 'google') {
          requestParams.max_completion_tokens = reservedTokens;
        } else {
          requestParams.max_tokens = reservedTokens;
        }

        return await openai.chat.completions.create(requestParams);

      } catch (error: any) {
        const errorResponse = error.response?.data || error.error || error.body || error.data || error;
        const errorMsg = (error.message || '').toLowerCase();
        const detailMsg = typeof errorResponse === 'object' ? JSON.stringify(errorResponse) : String(errorResponse);
        
        console.error(`[AiService] AI Provider Error: ${errorMsg} | Status: ${error.status || 'N/A'} | Details: ${detailMsg.substring(0, 500)}`);

        // ── Rate limit detection — throw immediately to key rotation layer ──
        // Rate limit errors are NOT context/token issues — retrying with reduced
        // context on the same key is wasteful. Let executeWithKeyRotation rotate
        // to the next key instead.
        const isRateLimit = error.status === 429 ||
          error.code === 'rate_limit_exceeded' ||
          (errorMsg.includes('rate limit') && !errorMsg.includes('context'));

        if (isRateLimit) {
          console.warn(`[AiService] Rate limit detected (status=${error.status || 'N/A'}, code=${error.code || 'N/A'}). Propagating to key rotation layer...`);
          throw error;
        }

        const isTimeout = error.status === 504 || error.status === 502 || error.status === 408 || errorMsg.includes('timeout') || errorMsg.includes('gateway');
        const isTokenLimit = errorMsg.includes('token') ||
          errorMsg.includes('context limit') ||
          errorMsg.includes('prompt') ||
          errorMsg.includes('supported') ||
          error.status === 400 ||
          (detailMsg.toLowerCase().includes('token') && !detailMsg.toLowerCase().includes('rate limit'));

        if ((isTimeout || isTokenLimit) && retryCount < maxRetries) {
          retryCount++;
          console.warn(`[AiService] Attempt ${retryCount} failed. Retrying with reduced context...`);

          if (onStatus) {
            onStatus(isTimeout ? `Connection slow (Retry ${retryCount}/${maxRetries}). Optimizing...` : 'Optimizing context size...');
          }

          // Extract suggested limit if provided in the error message
          const limitMatch = errorMsg.match(/only (\d+) is supported/);
          if (limitMatch && limitMatch[1]) {
            currentLimit = parseInt(limitMatch[1], 10);
            console.log(`[AiService] Dynamically adjusted limit to ${currentLimit} based on API feedback`);
          } else if (isTimeout) {
            // Drastic reduction for timeouts: keep system + last 2 messages only
            const systemMsg = workingMessages.find(m => m.role === 'system');
            const otherMsgs = workingMessages.filter(m => m.role !== 'system').slice(-2);
            workingMessages = systemMsg ? [systemMsg, ...otherMsgs] : otherMsgs;
            currentLimit = Math.floor(currentLimit * 0.7);
          } else {
            // Token limit hit: reduce limit and try pruning
            currentLimit = Math.floor(currentLimit * 0.8);
          }

          continue;
        }

        console.error(`[AiService] Final failure after ${retryCount + 1} attempts: ${error.message}`);
        throw error;
      }
    }

    throw new Error('Chat completion failed after maximum retries');
  }


  async generateImage(
    apiKey: string, 
    prompt: string, 
    model: string = 'black-forest-labs/flux-1-schnell',
    options: {
      negative_prompt?: string;
      seed?: number;
      steps?: number;
      width?: number;
      height?: number;
      cfg_scale?: number;
      image?: string;
      mode?: string;
    } = {}
  ) {
    const {
      negative_prompt,
      seed = 0,
      steps = 30,
      width = 1024,
      height = 1024,
      cfg_scale = 5,
      image,
      mode,
    } = options;

    // NVIDIA NIM endpoints are model-specific.
    let modelPath = model;
    
    // Mapping for known models that have different internal paths on NVIDIA API
    const modelMapping: Record<string, string> = {
      'stabilityai/stable-diffusion-xl-base-1.0': 'stabilityai/stable-diffusion-xl',
      'stabilityai/stable-diffusion-3-5-large': 'stabilityai/stable-diffusion-3.5-large',
      'black-forest-labs/flux-1-schnell': 'black-forest-labs/flux.1-schnell',
      'black-forest-labs/flux-1-1-schnell': 'black-forest-labs/flux.1.1-schnell',
      'black-forest-labs/flux-1-dev': 'black-forest-labs/flux.1-dev',
      'black-forest-labs/flux-1-dev-canny': 'black-forest-labs/flux.1-dev-canny',
      'black-forest-labs/flux-1-dev-depth': 'black-forest-labs/flux.1-dev-depth',
      'black-forest-labs/flux-2-klein-4b': 'black-forest-labs/flux.2-klein-4b',
      'black-forest-labs/flux-1-kontext-dev': 'black-forest-labs/flux.1-kontext-dev',
    };

    if (modelMapping[model]) {
      modelPath = modelMapping[model];
    }

    const isFlux = modelPath.toLowerCase().includes('flux');

    // Handle specialized FLUX models (editing/control) fallback if no image provided
    let isEditingModel = modelPath.includes('kontext') || modelPath.includes('canny') || modelPath.includes('depth');
    if (isFlux && isEditingModel && !image) {
      console.warn(`[AiService] Model ${modelPath} requires an image context. Falling back to flux.1-dev for text-to-image.`);
      modelPath = 'black-forest-labs/flux.1-dev';
      isEditingModel = false; // Reset editing status after fallback
    }

    // Snap dimensions for FLUX models to supported values to avoid API errors
    // Note: Different FLUX models on NVIDIA NIM have different supported dimension sets.
    let finalWidth = width;
    let finalHeight = height;
    if (isFlux) {
      const supportedDims = isEditingModel ? AiService.FLUX_KONTEXT_DIMENSIONS : AiService.FLUX_DEV_DIMENSIONS;
      const snapped = this.snapToBestFluxDimensions(width, height, supportedDims);
      finalWidth = snapped.width;
      finalHeight = snapped.height;
      console.log(`[AiService] Snapped FLUX dimensions from ${width}x${height} to ${finalWidth}x${finalHeight} using ${isEditingModel ? 'KONTEXT' : 'DEV'} list`);
    }

    const url = `https://ai.api.nvidia.com/v1/genai/${modelPath}`;

    // Build model-specific payload
    let payload: any = {
      seed,
      steps,
      width: finalWidth,
      height: finalHeight,
    };

    // SDXL and some older models require 'text_prompts' instead of 'prompt'
    const isSDXL = modelPath.includes('stable-diffusion-xl');
    const isSD35 = modelPath.includes('stable-diffusion-3.5');
    
    if (isSDXL) {
      payload.width = finalWidth;
      payload.height = finalHeight;
      payload.text_prompts = [{ text: prompt, weight: 1.0 }];
      if (negative_prompt) {
        payload.text_prompts.push({ text: negative_prompt, weight: -1.0 });
      }
      payload.cfg_scale = cfg_scale;
      payload.sampler = 'K_EULER_ANCESTRAL';
    } else {
      payload.prompt = prompt;
      
      if (isFlux) {
        if (modelPath.includes('schnell')) {
          payload.steps = Math.min(steps, 4);
        } else if (modelPath.includes('klein')) {
          payload.steps = Math.min(steps || 4, 4);
        } else {
          // dev and specialized models support cfg_scale
          payload.cfg_scale = cfg_scale;
        }
      } else if (isSD35) {
        if (negative_prompt) payload.negative_prompt = negative_prompt;
        payload.cfg_scale = cfg_scale;
      } else {
        if (negative_prompt) payload.negative_prompt = negative_prompt;
        if (cfg_scale) payload.cfg_scale = cfg_scale;
        payload.sampler = 'DPM++ 2M';
      }
    }

    console.log(`[AiService] Generating image with model: ${modelPath}`);
    console.log(`[AiService] URL: ${url}`);
    console.log(`[AiService] Image params: ${payload.width}x${payload.height}, steps=${payload.steps}, seed=${seed}`);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });

      let artifacts = response.data?.artifacts;
      
      if (!artifacts && response.data?.data) {
        artifacts = response.data.data.map((item: any) => ({
          base64: item.b64_json || item.url,
          seed: seed
        }));
      } else if (!artifacts && response.data?.image) {
        artifacts = [{ base64: response.data.image, seed: seed }];
      }

      if (!artifacts || artifacts.length === 0) {
        console.error(`[AiService] Unexpected response structure:`, JSON.stringify(response.data));
        throw new Error('No image data returned from NVIDIA API');
      }

      return {
        artifacts: artifacts.map((a: any) => ({
          base64: a.base64,
          seed: a.seed || seed,
        })),
      };
    } catch (error: any) {
      let errMsg = error.message;
      const errorData = error.response?.data;
      
      if (errorData) {
        // Handle cases where detail might be an object or array (common in NVIDIA NIM)
        const detail = errorData.detail || errorData.message;
        if (detail) {
          errMsg = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
        }
      }

      console.error(`[AiService] Image generation failed for ${modelPath}: ${errMsg}`);
      if (errorData) {
        console.error(`[AiService] Error body:`, JSON.stringify(errorData));
      }
      throw new Error(`Image generation failed: ${errMsg}`);
    }
  }

  async generateSpeech(apiKey: string, input: string, model: string = 'aura-2-thalia-en') {
    const deepgram = new DeepgramClient({ apiKey });

    try {
      const result = await deepgram.speak.v1.audio.generate({
        text: input,
        model,
      });

      // Use result.stream() and Readable.fromWeb as shown in the user's snippet
      const webStream = (result as any).stream();
      return Readable.fromWeb(webStream);
    } catch (error: any) {
      console.error('Deepgram TTS Detailed Error:', error);
      throw new Error(`TTS generation failed: ${error.message}`);
    }
  }

  async transcribeAudio(apiKey: string, filePath: string, model: string = 'nova-2') {
    const deepgram = new DeepgramClient({ apiKey });

    try {
      const response = await deepgram.listen.v1.media.transcribeFile(
        fs.readFileSync(filePath),
        {
          model,
          smart_format: true,
          paragraphs: true,
          utterances: true,
          punctuate: true,
        }
      );

      // Robust path checking for v3/v5 SDK response structures
      const results = (response as any).results || (response as any).result?.results;
      const transcript = results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      return { text: transcript };
    } catch (error: any) {
      console.error('Deepgram Transcription Error:', error.message);
      throw error;
    }
  }

  // uploadNvidiaAsset removed — NVCF Asset API requires enterprise access.
  // NVIDIA NIM image endpoints accept inline base64 data URIs directly.

  /**
   * Helper to convert a remote image URL to a base64 string
   * This is useful for multimodal models that might have trouble fetching external URLs
   */
  private async urlToBase64(url: string): Promise<string> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary');
      const contentType = response.headers['content-type'] || 'image/jpeg';
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error: any) {
      console.error(`[AiService] Error fetching image for base64 conversion: ${error.message}`);
      throw error;
    }
  }
}

export const aiService = new AiService();

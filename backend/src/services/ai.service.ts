import OpenAI from 'openai';
import { DeepgramClient } from '@deepgram/sdk';
import fs from 'fs';
import { Readable } from 'stream';
import { TokenManager } from '../utils/tokenManager';
import { supabaseAdmin } from '../lib/supabase';

class AiService {
  private readonly DEFAULT_SYSTEM_PROMPT = "You are Sree Ai, a professional AI assistant built by NilStudio. You are helpful, detailed, and friendly. Provide comprehensive and complete responses. Always ensure your code snippets are fully functional and well-explained.";

  private getNvidiaClient(apiKey: string) {
    return new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }

  async streamChat(apiKey: string, messages: any[], model: string = 'meta/llama-3.1-70b-instruct', onStatus?: (status: string) => void) {
    const openai = this.getNvidiaClient(apiKey);

    // 1. Fetch model configuration
    const { data: modelInfo } = await supabaseAdmin
      .from('ai_models')
      .select('max_tokens, context_window, is_vision, is_fast')
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
        let reservedTokens = retryCount > 0 ? 1024 : currentMaxOutputTokens;

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

        // Step D: Final Sanitization for API
        const sanitized = finalMessages.map(m => {
          let content = m.content;
          if (Array.isArray(content)) {
            const hasImages = content.some((p: any) => p.type === 'image_url');
            if (!modelInfo?.is_vision || !hasImages) {
              content = content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
            }
          }
          return { role: m.role, content: content || "" };
        });

        return await openai.chat.completions.create({
          model,
          messages: sanitized as any,
          stream: true,
          max_tokens: reservedTokens,
          temperature: 0.7,
        });

      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        const isTimeout = error.status === 504 || error.status === 502 || error.status === 408 || errorMsg.includes('timeout') || errorMsg.includes('gateway');
        const isTokenLimit = errorMsg.includes('token') ||
          errorMsg.includes('limit') ||
          errorMsg.includes('prompt') ||
          errorMsg.includes('supported') ||
          error.status === 400;

        if ((isTimeout || isTokenLimit) && retryCount < maxRetries) {
          retryCount++;
          console.warn(`[AiService] Attempt ${retryCount} failed (${isTimeout ? 'Timeout' : 'Token Limit'}). Retrying with reduced context...`);

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

            // Reduction limit
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


  async generateImage(apiKey: string, prompt: string, model: string = 'stabilityai/stable-diffusion-xl-base-1.0') {
    const openai = this.getNvidiaClient(apiKey);

    return openai.images.generate({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
    });
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
}

export const aiService = new AiService();

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
      .select('max_tokens, context_window, is_vision')
      .eq('model_id', model)
      .single();

    const contextLimit = modelInfo?.context_window || 4096;
    const modelMaxOutputTokens = modelInfo?.max_tokens || 4096;

    // 2. Prepend system prompt if missing
    let processedMessages = [...messages];
    if (!messages.some(m => m.role === 'system')) {
      processedMessages = [{ role: 'system', content: this.DEFAULT_SYSTEM_PROMPT }, ...messages];
    }

    // 3. Consolidate consecutive roles
    const consolidated: any[] = [];
    for (const msg of processedMessages) {
      const last = consolidated[consolidated.length - 1];
      if (last && last.role === msg.role && msg.role !== 'system') {
        // Merge content properly
        if (typeof last.content === 'string' && typeof msg.content === 'string') {
          last.content += '\n\n' + msg.content;
        } else {
          // Handle mixed content (string and array)
          const lastParts = typeof last.content === 'string' 
            ? [{ type: 'text', text: last.content }] 
            : last.content;
          const msgParts = typeof msg.content === 'string' 
            ? [{ type: 'text', text: msg.content }] 
            : msg.content;
          last.content = [...lastParts, ...msgParts];
        }
      } else {
        consolidated.push({ ...msg });
      }
    }

    // 4. Hydrate messages with document context
    const hydrated = consolidated.map(m => {
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
    // Cap initial reserved tokens to 2048 to prevent gateway timeouts on large reservations
    let currentMaxOutputTokens = Math.min(modelMaxOutputTokens, 2048); 
    let workingMessages = [...hydrated];

    while (retryCount <= maxRetries) {
      const safePruneThreshold = 100; // Buffer for safety
      
      try {
        // Step A: Calculate current request token size
        let promptTokens = TokenManager.countMessagesTokens(workingMessages);
        
        // Step B: Define a safe reservation for generation
        // If it's a retry, we use a fixed 1024 for stability
        const reservedTokens = retryCount > 0 ? 1024 : currentMaxOutputTokens;
        const totalRequested = promptTokens + reservedTokens;

        // Step C: Strict comparison and pruning
        let finalMessages = [...workingMessages];
        if (totalRequested > currentLimit) {
          const targetPromptTokens = currentLimit - reservedTokens - safePruneThreshold;
          console.warn(`[AiService] Token limit exceeded. Pruning context to target: ${targetPromptTokens}`);
          finalMessages = TokenManager.pruneMessages(workingMessages, targetPromptTokens);
          promptTokens = TokenManager.countMessagesTokens(finalMessages);
        }
        
        const finalVerificationTotal = promptTokens + reservedTokens;
        console.log(`[AiService] Final verification: Prompt=${promptTokens}, Reserved=${reservedTokens}, Total=${finalVerificationTotal}, Limit=${currentLimit}`);

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
        const isTokenLimit = errorMsg.includes('token') || errorMsg.includes('limit') || error.status === 400;

        if ((isTimeout || isTokenLimit) && retryCount < maxRetries) {
          retryCount++;
          console.warn(`[AiService] Attempt ${retryCount} failed (${isTimeout ? 'Timeout' : 'Token Limit'}). Retrying with reduced context...`);
          
          if (onStatus) {
            onStatus(isTimeout ? `Connection slow (Retry ${retryCount}/${maxRetries}). Optimizing...` : 'Optimizing context size...');
          }

          if (isTimeout) {
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

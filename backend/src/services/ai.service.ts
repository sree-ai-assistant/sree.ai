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

  async streamChat(apiKey: string, messages: any[], model: string = 'meta/llama-3.1-70b-instruct') {
    const openai = this.getNvidiaClient(apiKey);

    // 1. Fetch model configuration from DB
    const { data: modelInfo } = await supabaseAdmin
      .from('ai_models')
      .select('max_tokens, context_window, is_vision')
      .eq('model_id', model)
      .single();

    // Use DB limits, or fallback to reasonable defaults
    const modelMaxTokens = modelInfo?.max_tokens || (model.includes('qwen') ? 16384 : 4096);
    const contextWindow = modelInfo?.context_window || (model.includes('llama') ? 131072 : 32768);

    // 2. Prepend system prompt if not present
    let finalMessages = [...messages];
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    if (!hasSystemPrompt) {
      finalMessages = [{ role: 'system', content: this.DEFAULT_SYSTEM_PROMPT }, ...messages];
    }

    // 3. Ensure alternating roles (Consolidate consecutive roles)
    // Most APIs require user/assistant/user/assistant...
    const consolidatedMessages: any[] = [];
    for (const msg of finalMessages) {
      const last = consolidatedMessages[consolidatedMessages.length - 1];
      if (last && last.role === msg.role && msg.role !== 'system') {
        if (typeof last.content === 'string' && typeof msg.content === 'string') {
          last.content += '\n\n' + msg.content;
        } else {
          consolidatedMessages[consolidatedMessages.length - 1] = msg;
        }
      } else {
        consolidatedMessages.push({ ...msg });
      }
    }

    // 3. Hydrate messages with document context BEFORE pruning
    // This ensures TokenManager sees the ACTUAL final content
    const hydratedMessages = consolidatedMessages.map(m => {
      let content = m.content;
      
      if (m.metadata?.extractedContext) {
        const contextStr = `\n\n### DOCUMENT CONTEXT ###\n${m.metadata.extractedContext}\n### END OF DOCUMENT CONTEXT ###`;
        
        if (Array.isArray(content)) {
          content = content.map((c: any) => 
            c.type === 'text' ? { ...c, text: (c.text || "") + contextStr } : c
          );
        } else {
          content = (content || "") + contextStr;
        }
      }

      return { ...m, content };
    });

    // 4. Prune messages based on hydrated content
    const pruneThreshold = Math.max(1000, contextWindow - modelMaxTokens - 500);
    const prunedMessages = TokenManager.pruneMessages(hydratedMessages, pruneThreshold);

    // 5. Strictly sanitize for the final API call
    const sanitizedMessages = prunedMessages.map(m => {
      let content = m.content;
      
      // Convert array content to string for non-vision models OR if it's just one text part
      if (Array.isArray(content)) {
        const hasImages = content.some((part: any) => part.type === 'image_url');
        if (!modelInfo?.is_vision || !hasImages) {
          // Flatten to string if model doesn't support vision or if there are no images anyway
          content = content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join('\n');
        }
      }

      // NVIDIA/OpenAI APIs are extremely strict about extra fields like 'metadata'
      const cleanMsg: any = { 
        role: m.role, 
        content: content || "" 
      };

      // Optional: Add 'name' if present (some APIs use it for system/multi-user)
      if (m.name) cleanMsg.name = m.name;

      return cleanMsg;
    });

    console.log(`[AiService] Final sanitized messages for ${model}:`, JSON.stringify(sanitizedMessages.map(m => ({ role: m.role, contentLength: typeof m.content === 'string' ? m.content.length : 'array' }))));

    return openai.chat.completions.create({
      model,
      messages: sanitizedMessages as any,
      stream: true,
      max_tokens: modelMaxTokens,
      temperature: 0.7,
      top_p: 1,
    });
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

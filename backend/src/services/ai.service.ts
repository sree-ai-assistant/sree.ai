import OpenAI from 'openai';
import { DeepgramClient } from '@deepgram/sdk';
import fs from 'fs';
import { Readable } from 'stream';
import { TokenManager } from '../utils/tokenManager';

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

    // Prepend system prompt if not present
    let finalMessages = messages;
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    if (!hasSystemPrompt) {
      finalMessages = [{ role: 'system', content: this.DEFAULT_SYSTEM_PROMPT }, ...messages];
    }

    // Prune messages to optimize context
    finalMessages = TokenManager.pruneMessages(finalMessages);
    
    // Model-specific configurations
    const isVisionModel = model.toLowerCase().includes('vision') || 
                          model.toLowerCase().includes('pixtral') || 
                          model.toLowerCase().includes('qwen-vl');
    
    const isQwen = model.toLowerCase().includes('qwen');
    
    // Use the user-suggested 16384 for Qwen 3.5 or other large models
    const maxTokens = (isQwen || model.includes('3.5')) ? 16384 : 4096;

    // Last step: Hydrate messages with context from metadata for the LLM to see
    const hydratedMessages = finalMessages.map(m => {
      if (!m.metadata?.extractedContext) return m;
      
      let content = m.content;
      if (Array.isArray(content)) {
        const textPart = content.find((c: any) => c.type === 'text');
        if (textPart) {
          content = content.map((c: any) => 
            c.type === 'text' ? { ...c, text: (c.text || "") + "\n\n" + m.metadata.extractedContext } : c
          );
        } else {
          content = [...content, { type: 'text', text: m.metadata.extractedContext }];
        }
      } else {
        content = (content || "") + "\n\n" + m.metadata.extractedContext;
      }
      return { role: m.role, content };
    });

    return openai.chat.completions.create({
      model,
      messages: hydratedMessages,
      stream: true,
      max_tokens: maxTokens,
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

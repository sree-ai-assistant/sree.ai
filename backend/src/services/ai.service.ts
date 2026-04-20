import OpenAI from 'openai';
import { DeepgramClient } from '@deepgram/sdk';
import fs from 'fs';
import { Readable } from 'stream';

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

    // Prepend system prompt if not present and no vision content (system prompts can be tricky with some VLMs)
    const hasSystemPrompt = messages.some(m => m.role === 'system');
    const isVisionModel = model.toLowerCase().includes('vision');

    let finalMessages = messages;
    if (!hasSystemPrompt && !isVisionModel) {
      finalMessages = [{ role: 'system', content: this.DEFAULT_SYSTEM_PROMPT }, ...messages];
    }

    return openai.chat.completions.create({
      model,
      messages: finalMessages,
      stream: true,
      max_tokens: 4096,
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

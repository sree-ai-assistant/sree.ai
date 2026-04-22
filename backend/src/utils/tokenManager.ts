import { get_encoding } from "tiktoken";

const encoding = get_encoding("cl100k_base");

export class TokenManager {
  private static readonly MAX_CONTEXT_TOKENS = 64000; // Large window for documents
  private static readonly TOKEN_PRUNE_THRESHOLD = 0.95; // Prune when 95% full

  static countTokens(content: string | any[], metadata?: any): number {
    let baseTokens = 0;
    if (!content) {
      baseTokens = 0;
    } else if (typeof content === 'string') {
      baseTokens = encoding.encode(content).length;
    } else if (Array.isArray(content)) {
      baseTokens = content.reduce((sum, part) => {
        if (part.type === 'text') {
          return sum + encoding.encode(part.text || '').length;
        }
        if (part.type === 'image_url') {
          return sum + 85; // Standard token cost for vision models (estimated)
        }
        return sum;
      }, 0);
    }

    // Only add extractedContext tokens if it's NOT already in the content
    // This handles both pre-processed and raw messages
    if (metadata?.extractedContext) {
      const contextStr = typeof metadata.extractedContext === 'string' ? metadata.extractedContext : '';
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      
      if (!contentStr.includes(contextStr.substring(0, 100))) { // Quick check
        baseTokens += encoding.encode(contextStr).length;
      }
    }

    return baseTokens;
  }

  static pruneMessages(messages: any[]): any[] {
    let totalTokens = messages.reduce((sum, msg) => sum + this.countTokens(msg.content, msg.metadata), 0);
    
    if (totalTokens < this.MAX_CONTEXT_TOKENS * this.TOKEN_PRUNE_THRESHOLD) {
      return messages;
    }

    console.log(`[TokenManager] Pruning messages. Current tokens: ${totalTokens}`);
    
    // Always keep system message and the last few messages
    const systemMessage = messages.find(m => m.role === 'system');
    const systemTokens = systemMessage ? this.countTokens(systemMessage.content, systemMessage.metadata) : 0;
    
    let currentTokens = systemTokens;
    const result: any[] = [];
    if (systemMessage) result.push(systemMessage);

    // Keep the most recent messages first
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const recentMessages = [...nonSystemMessages].reverse();
    
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      const tokens = this.countTokens(msg.content, msg.metadata);
      
      // Always keep the most recent message
      if (i === 0) {
        result.splice(systemMessage ? 1 : 0, 0, msg);
        currentTokens += tokens;
        continue;
      }

      // If adding this message exceeds the limit, stop
      if (currentTokens + tokens < this.MAX_CONTEXT_TOKENS) {
        result.splice(systemMessage ? 1 : 0, 0, msg);
        currentTokens += tokens;
      } else {
        // Stop adding older messages once we hit the limit
        console.log(`[TokenManager] Limit reached. Skipping ${recentMessages.length - i} older messages.`);
        break;
      }
    }

    console.log(`[TokenManager] Pruned to ${result.length} messages. New tokens: ${currentTokens}`);
    return result;
  }

  static compressContent(content: string | any[], maxTokens: number = 2000): string | any[] {
    const tokens = this.countTokens(content);
    if (tokens <= maxTokens) return content;

    if (typeof content === 'string') {
      // Keep more at the beginning and end
      const start = Math.floor(maxTokens * 0.4);
      const end = Math.floor(maxTokens * 0.4);
      const encoded = encoding.encode(content);
      
      if (encoded.length <= maxTokens) return content;

      const compressed = new Uint32Array(start + end);
      compressed.set(encoded.slice(0, start), 0);
      compressed.set(encoded.slice(-end), start);
      
      return encoding.decode(compressed) + "\n\n... [Content compressed for context efficiency] ...";
    }

    if (Array.isArray(content)) {
      // Compress only text parts in the array
      return content.map(part => {
        if (part.type === 'text') {
          return { ...part, text: this.compressContent(part.text, Math.floor(maxTokens / content.length)) };
        }
        return part;
      });
    }

    return content;
  }

  static truncateDocumentText(text: string, maxChars: number = 150000): string {
    if (text.length <= maxChars) return text;
    
    console.log(`[TokenManager] Truncating document text from ${text.length} to ${maxChars} chars`);
    return text.substring(0, maxChars) + "\n\n... [Document truncated to preserve chat history] ...";
  }

  static compressMessages(messages: any[]): any[] {
    // Only compress messages that are exceptionally large and not the most recent ones
    return messages.map((msg, index) => {
      // Don't compress system or the last 3 messages (to maintain immediate context)
      if (msg.role === 'system' || index >= messages.length - 3) {
        return msg;
      }

      const tokens = this.countTokens(msg.content, msg.metadata);
      
      // If message has extracted context, allow a much higher threshold
      const limit = msg.metadata?.hasContext ? 8000 : 2000;
      
      if (tokens > limit) {
        console.log(`[TokenManager] Compressing large message at index ${index} (${tokens} tokens)`);
        
        // If it's a context message, we want to be less aggressive
        const compressTo = msg.metadata?.hasContext ? 4000 : 1000;
        
        // Note: We are compressing the visible content here. 
        // In the route, extractedContext is appended AFTER this or separately.
        return {
          ...msg,
          content: this.compressContent(msg.content, compressTo)
        };
      }
      return msg;
    });
  }
}


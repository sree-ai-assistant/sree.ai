import { get_encoding } from "tiktoken";

const encoding = get_encoding("cl100k_base");

export class TokenManager {
  private static readonly MAX_CONTEXT_TOKENS = 64000;
  private static readonly TOKEN_PRUNE_THRESHOLD = 0.90; // Prune earlier (90% instead of 95%)
  private static readonly SAFETY_FACTOR = 1.2; // 20% safety margin for different tokenizers

  static countMessagesTokens(messages: any[]): number {
    return messages.reduce((sum, msg) => sum + this.countTokens(msg.content, msg.metadata) + 5, 0);
  }

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
          return sum + 1100; // More realistic token cost for high-res images in many vision models (e.g. OpenAI/NIM)
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

    const result = Math.ceil(baseTokens * this.SAFETY_FACTOR) + 5;
    return result;
  }

  static pruneMessages(messages: any[], maxTokens: number = 64000): any[] {
    // Add 5 tokens overhead per message for framing
    let totalTokens = messages.reduce((sum, msg) => sum + this.countTokens(msg.content, msg.metadata) + 5, 0);
    
    // Prune when near the requested limit
    if (totalTokens < maxTokens) {
      return messages;
    }

    console.log(`[TokenManager] Pruning messages. Current tokens: ${totalTokens}, Target: ${maxTokens}`);
    
    // Always keep system message
    const systemMsg = messages.find(m => m.role === 'system');
    const systemTokens = systemMsg ? TokenManager.countTokens(systemMsg.content, systemMsg.metadata) + 5 : 0;
    
    let currentTokens = systemTokens;
    const result: any[] = [];
    if (systemMsg) result.push(systemMsg);

    // Keep the most recent messages first
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const recentMessages = [...nonSystemMessages].reverse();
    
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = { ...recentMessages[i] };
      let tokens = TokenManager.countTokens(msg.content, msg.metadata) + 5;
      
      // If adding this message exceeds the limit, skip it
      if (currentTokens + tokens < maxTokens) {
        result.splice(systemMsg ? 1 : 0, 0, msg);
        currentTokens += tokens;
      } else if (i === 0) {
        // If the very last message is too big, we MUST truncate it
        const allowed = maxTokens - currentTokens - 10;
        if (allowed > 100) {
           msg.content = TokenManager.compressContent(msg.content, allowed);
           tokens = TokenManager.countTokens(msg.content, msg.metadata) + 5;
           result.splice(systemMsg ? 1 : 0, 0, msg);
           currentTokens += tokens;
        }
        break;
      } else {
        // Stop adding older messages
        break;
      }
    }

    console.log(`[TokenManager] Pruned to ${result.length} messages. New tokens: ${currentTokens}`);
    return result;
  }

  static compressContent(content: string | any[], maxTokens: number = 2000): string | any[] {
    if (!content) return "";
    const tokens = TokenManager.countTokens(content);
    if (tokens <= maxTokens) return content;

    if (typeof content === 'string') {
      const encoded = encoding.encode(content);
      if (encoded.length <= maxTokens) return content;

      // Keep more at the beginning and end
      const start = Math.floor(maxTokens * 0.45);
      const end = Math.floor(maxTokens * 0.45);
      
      const compressed = new Uint32Array(start + end);
      compressed.set(encoded.slice(0, start), 0);
      compressed.set(encoded.slice(-end), start);
      
      return encoding.decode(compressed) + "\n\n... [Content compressed for context efficiency] ...";
    }

    if (Array.isArray(content)) {
      // Compress only text parts in the array
      return content.map(part => {
        if (part.type === 'text') {
          const perPartLimit = Math.floor(maxTokens / content.filter(p => p.type === 'text').length);
          return { ...part, text: TokenManager.compressContent(part.text, perPartLimit) };
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

      const tokens = TokenManager.countTokens(msg.content, msg.metadata);
      
      // If message has extracted context, allow a higher threshold
      const limit = msg.metadata?.hasContext ? 12000 : 4000;
      
      if (tokens > limit) {
        console.log(`[TokenManager] Compressing large message at index ${index} (${tokens} tokens)`);
        
        // If it's a context message, we want to be less aggressive
        const compressTo = msg.metadata?.hasContext ? 8000 : 2000;
        
        const newMsg = { ...msg };
        newMsg.content = TokenManager.compressContent(msg.content, compressTo);
        
        if (msg.metadata?.extractedContext) {
           newMsg.metadata = {
             ...msg.metadata,
              extractedContext: TokenManager.compressContent(msg.metadata.extractedContext, compressTo)
           };
        }
        
        return newMsg;
      }
      return msg;
    });
  }
}


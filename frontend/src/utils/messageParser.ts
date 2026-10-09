export interface InjectedAttachment {
  name: string;
  type: 'image';
  url: string;
}

export interface ParsedMessageContent {
  cleanText: string;
  injectedAttachments: InjectedAttachment[];
}

export interface ParseMessageOptions {
  /**
   * The role of the message ('user' | 'assistant' | 'system').
   * For user messages, user-entered prompt instructions are preserved verbatim.
   */
  role?: string;
  /**
   * Explicitly control whether to strip [SYSTEM INSTRUCTION: ...] blocks.
   * If not provided: false when role === 'user', true for assistant/system or undefined.
   */
  stripSystemInstructions?: boolean;
}

/**
 * Normalizes and extracts clean text and visual attachments from message content.
 * 
 * Handles cases where:
 * 1. content was stored as an OpenAI multimodal JSON array string:
 *    `[{"type":"text","text":"..."},{"type":"image_url","image_url":{"url":"..."}}]`
 * 2. content is an array of content parts.
 * 3. assistant content contains injected `[SYSTEM INSTRUCTION: ...]` text that should be hidden from UI.
 *    (User messages preserve user-typed prompts verbatim).
 */
export function parseMessageContent(rawContent: any, options?: ParseMessageOptions): ParsedMessageContent {
  if (!rawContent) {
    return { cleanText: '', injectedAttachments: [] };
  }

  // Determine whether system instruction blocks should be stripped.
  // User messages represent verbatim user input and must NOT be stripped unless explicitly requested.
  const shouldStrip = options?.stripSystemInstructions !== undefined
    ? options.stripSystemInstructions
    : options?.role !== 'user';

  // If already an array in memory
  if (Array.isArray(rawContent)) {
    return extractFromPartsArray(rawContent, shouldStrip);
  }

  if (typeof rawContent !== 'string') {
    return { cleanText: String(rawContent), injectedAttachments: [] };
  }

  const trimmed = rawContent.trim();

  // Detect serialized JSON array containing multimodal content
  if (
    trimmed.startsWith('[') &&
    trimmed.endsWith(']') &&
    (trimmed.includes('"type"') || trimmed.includes('"image_url"'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return extractFromPartsArray(parsed, shouldStrip);
      }
    } catch (_) {
      // Fall through if not valid JSON
    }
  }

  // Remove any system instruction blocks if stripping is enabled (assistant/system or explicit)
  const clean = shouldStrip
    ? trimmed.replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '').trim()
    : trimmed;

  return {
    cleanText: clean,
    injectedAttachments: []
  };
}

function extractFromPartsArray(parts: any[], shouldStrip = true): ParsedMessageContent {
  let combinedText = '';
  const injectedAttachments: InjectedAttachment[] = [];

  parts.forEach((part, index) => {
    if (!part) return;

    // Handle text part
    if (part.type === 'text' || typeof part.text === 'string') {
      const rawText = part.text || '';
      const text = (shouldStrip
        ? rawText.replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '')
        : rawText
      ).trim();

      if (text) {
        combinedText = combinedText ? `${combinedText}\n\n${text}` : text;
      }
    }
    // Handle image_url part
    else if (part.type === 'image_url' || part.image_url) {
      const url = typeof part.image_url === 'string'
        ? part.image_url
        : part.image_url?.url || part.url;

      if (url && typeof url === 'string') {
        injectedAttachments.push({
          name: `Frame ${index + 1}`,
          type: 'image',
          url
        });
      }
    }
  });

  return {
    cleanText: combinedText,
    injectedAttachments
  };
}

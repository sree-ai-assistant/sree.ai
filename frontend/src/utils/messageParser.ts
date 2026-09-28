export interface InjectedAttachment {
  name: string;
  type: 'image';
  url: string;
}

export interface ParsedMessageContent {
  cleanText: string;
  injectedAttachments: InjectedAttachment[];
}

/**
 * Normalizes and extracts clean text and visual attachments from message content.
 * 
 * Handles cases where:
 * 1. content was stored as an OpenAI multimodal JSON array string:
 *    `[{"type":"text","text":"..."},{"type":"image_url","image_url":{"url":"..."}}]`
 * 2. content contains injected `[SYSTEM INSTRUCTION: ...]` text that should never be shown in UI.
 * 3. content is an array of content parts.
 */
export function parseMessageContent(rawContent: any): ParsedMessageContent {
  if (!rawContent) {
    return { cleanText: '', injectedAttachments: [] };
  }

  // If already an array in memory
  if (Array.isArray(rawContent)) {
    return extractFromPartsArray(rawContent);
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
        return extractFromPartsArray(parsed);
      }
    } catch (_) {
      // Fall through if not valid JSON
    }
  }

  // Remove any system instruction blocks that might have leaked into clean text
  const clean = trimmed
    .replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '')
    .trim();

  return {
    cleanText: clean,
    injectedAttachments: []
  };
}

function extractFromPartsArray(parts: any[]): ParsedMessageContent {
  let combinedText = '';
  const injectedAttachments: InjectedAttachment[] = [];

  parts.forEach((part, index) => {
    if (!part) return;

    // Handle text part
    if (part.type === 'text' || typeof part.text === 'string') {
      const text = (part.text || '')
        .replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '')
        .trim();

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

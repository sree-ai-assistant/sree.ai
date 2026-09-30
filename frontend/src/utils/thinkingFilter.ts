/**
 * Utility for parsing and filtering AI model reasoning/thinking blocks (<think>, <thinking>, <thought>).
 * 
 * Supports:
 * - DeepSeek R1 (<think>...</think>)
 * - Qwen models (<think>...</think>)
 * - Google Gemini (<thinking>...</thinking> / <thought>...</thought>)
 * - Anthropic/system instructions ([SYSTEM INSTRUCTION: ...])
 */

/**
 * Extracts reasoning/thinking content from an assistant message.
 * Only extracts blocks positioned at the start of the message (the model's reasoning preface),
 * preventing false positives on code blocks or text mentions later in the response.
 */
export function extractThinkingContent(content: string): string {
  if (!content || typeof content !== 'string') return '';
  // Match reasoning block at the start of the message (with optional leading whitespace)
  const match = content.match(/^\s*<(think|thinking|thought)(?:>|\s[^>]*>)([\s\S]*?)(?:<\/\1>|$)/i);
  if (match) {
    return match[2].trim();
  }
  return '';
}

/**
 * Filters out reasoning blocks from assistant messages so that only the clean
 * response is displayed in the main chat bubble.
 * 
 * @param content The raw message content
 * @param isStreaming When true, also hides unclosed in-progress reasoning blocks at the start
 * @returns Cleaned content for display
 */
export function filterThinkingTags(content: string, isStreaming = false): string {
  if (!content) return '';
  if (typeof content !== 'string') return String(content);

  // Fast check: return immediately if no candidate tags exist
  if (!content.includes('<think') && !content.includes('<thought') && !content.includes('[SYSTEM')) {
    return content.trim();
  }

  let processed = content;

  // 1. Remove reasoning block ONLY at the start of the message (closed block)
  // This guarantees code blocks or backtick mentions inside the body (e.g. `<thinking>`) are preserved.
  processed = processed.replace(/^\s*<(think|thinking|thought)(?:>|\s[^>]*>)[\s\S]*?<\/\1>\s*/i, '');

  // 2. Only during ACTIVE STREAMING: if the model opened a reasoning block at the start
  // and has not emitted the closing tag yet, hide it so in-progress reasoning doesn't flash
  // into the main chat bubble (it is shown in the reasoning drawer instead).
  if (isStreaming) {
    processed = processed.replace(/^\s*<(think|thinking|thought)(?:>|\s[^>]*>)[\s\S]*$/i, '');
  }

  // 3. Remove any leaked system instruction blocks
  processed = processed.replace(/\[SYSTEM INSTRUCTION[\s\S]*?(?:\]|$)/gi, '');

  return processed.trim();
}

/**
 * Formats message content for display based on the role.
 * User messages are NEVER stripped of thinking tags or XML tags (they are verbatim user input).
 */
export function formatMessageForDisplay(content: string, role: string, isStreaming = false): string {
  if (role === 'user') {
    return (content || '').trim();
  }
  return filterThinkingTags(content, isStreaming);
}

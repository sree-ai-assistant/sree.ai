/**
 * languageFilter.ts — Language consistency & anti-hallucination sanitization
 *
 * Protects real-time voice sessions from Gemini Live / speech model hallucinations where
 * acoustic noise or silence causes spontaneous generation of unprompted Spanish/Portuguese
 * filler phrases (e.g. "¿En qué más te puedo ayudar...", "¿Cómo puedo ayudarte...", "I was asking in Spanish...").
 */

/**
 * Checks if the user has explicitly spoken or requested Spanish or Portuguese in the conversation.
 */
export function hasUserSpokenSpanishOrPortuguese(
  userHistory: Array<{ role?: string; content?: string } | string>,
  currentPrompt?: string
): boolean {
  const allTexts: string[] = [];

  for (const item of userHistory) {
    if (typeof item === 'string') {
      allTexts.push(item);
    } else if (item && typeof item === 'object') {
      if (item.role === 'user' && item.content) {
        allTexts.push(item.content);
      }
    }
  }

  if (currentPrompt) {
    allTexts.push(currentPrompt);
  }

  const combined = allTexts.join(' ').toLowerCase();

  // Distinctive Spanish / Portuguese keywords and phrases
  const spanishOrPortugueseRegex = /\b(hola|por\s+favor|gracias|buenos\s+días|buenas\s+tardes|buenas\s+noches|habla\s+español|en\s+español|español|cómo\s+estás|qué\s+tal|ayuda|obrigado|obrigada|por\s+favor|bom\s+dia|boa\s+tarde|boa\s+noite|fala\s+português|em\s+português|português)\b/i;

  return spanishOrPortugueseRegex.test(combined);
}

/**
 * Sanitizes spurious Spanish or Portuguese hallucination leakage when the conversation is in
 * English, Hindi, Bengali, Gujarati, Punjabi, or other non-Spanish languages.
 */
export function sanitizeSpuriousLanguageLeakage(
  text: string,
  allowSpanishOrPortuguese = false
): string {
  if (!text || allowSpanishOrPortuguese) return text;

  let sanitized = text;

  // 1. Remove spurious Spanish question hallucinations on background audio/silence
  // e.g. "¿En qué más te puedo ayudar con la presentación o con cualquier otro tema?"
  // e.g. "¿En qué te puedo ayudar con la presentación o con cualquier otro tema que necesites?"
  // e.g. "¿Cómo puedo ayudarte hoy?"
  sanitized = sanitized.replace(
    /(?:^|\n)[ \t]*¿[ \t]*(?:En qué|Cómo|Hay algo|De qué|En que|Como)[^\n?]*\?[ \t]*(?=\n|$)/gi,
    ''
  );

  // 2. Remove spurious Portuguese question hallucinations on background audio/silence
  // e.g. "Como posso ajudar?", "Em que posso ajudar?", "Posso ajudar em algo?"
  sanitized = sanitized.replace(
    /(?:^|\n)[ \t]*(?:Como posso ajudar|Em que posso ajudar|Posso ajudar em algo)[^\n?]*\??[ \t]*(?=\n|$)/gi,
    ''
  );

  // 3. Remove model self-translation apologies for unprompted Spanish/Portuguese
  // e.g. "I was asking in Spanish how else I can assist you with the presentation or any other topic you'd like to discuss."
  sanitized = sanitized.replace(
    /(?:^|\n)[ \t]*I was asking in (?:Spanish|Portuguese)[^\n.]*\.[ \t]*(?=\n|$)/gi,
    ''
  );

  // 4. Clean up any trailing or double empty lines created by the removal
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();

  return sanitized;
}

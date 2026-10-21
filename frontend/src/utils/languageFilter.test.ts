import { describe, it, expect } from 'vitest';
import {
  sanitizeSpuriousLanguageLeakage,
  hasUserSpokenSpanishOrPortuguese,
} from './languageFilter';

describe('languageFilter', () => {
  describe('hasUserSpokenSpanishOrPortuguese', () => {
    it('returns false for English conversations', () => {
      const history = [
        { role: 'user', content: 'Create a python presentation roadmap' },
        { role: 'assistant', content: 'Here is your presentation' },
      ];
      expect(hasUserSpokenSpanishOrPortuguese(history, 'Can you make it 10 slides?')).toBe(false);
    });

    it('returns false for Bengali / Hindi conversations', () => {
      const history = [
        { role: 'user', content: 'আমাকে পাইথন শিখতে সাহায্য করুন' },
        { role: 'assistant', content: 'নিশ্চয়ই, পাইথন একটি সহজ ভাষা।' },
      ];
      expect(hasUserSpokenSpanishOrPortuguese(history, 'ধন্যবাদ')).toBe(false);
    });

    it('returns true when user explicitly greets or speaks in Spanish', () => {
      const history = [
        { role: 'user', content: 'Hola, puedes ayudarme con una presentación?' },
      ];
      expect(hasUserSpokenSpanishOrPortuguese(history)).toBe(true);
    });

    it('returns true when user current prompt asks in Portuguese', () => {
      expect(hasUserSpokenSpanishOrPortuguese([], 'Por favor, crie uma apresentação em português')).toBe(true);
    });
  });

  describe('sanitizeSpuriousLanguageLeakage', () => {
    it('sanitizes the exact screenshot hallucination pattern cleanly', () => {
      const input = `I've placed your presentation on screen. You can download the PowerPoint file directly using the Download .pptx button on the presentation card.
¿En qué más te puedo ayudar con la presentación o con cualquier otro tema?
¿En qué te puedo ayudar con la presentación o con cualquier otro tema que necesites?
I was asking in Spanish how else I can assist you with the presentation or any other topic you'd like to discuss.`;

      const expected = `I've placed your presentation on screen. You can download the PowerPoint file directly using the Download .pptx button on the presentation card.`;

      expect(sanitizeSpuriousLanguageLeakage(input, false)).toBe(expected);
    });

    it('preserves Spanish when user explicitly speaks Spanish', () => {
      const spanishText = `¿En qué te puedo ayudar con la presentación o con cualquier otro tema que necesites?`;
      expect(sanitizeSpuriousLanguageLeakage(spanishText, true)).toBe(spanishText);
    });

    it('preserves normal English, code blocks, and markdown without modification', () => {
      const normalText = `Here is the Python script:
\`\`\`python
def hello():
    print("world")
\`\`\`
Let me know if you need any adjustments!`;

      expect(sanitizeSpuriousLanguageLeakage(normalText, false)).toBe(normalText);
    });

    it('preserves Indic languages (Bengali, Hindi, Gujarati, Punjabi) without modification', () => {
      const bengaliText = `আমি প্রেজেন্টেশনটি স্ক্রিনে যুক্ত করেছি। আপনি সরাসরি .pptx ফাইলে ডাউনলোড করতে পারেন।`;
      expect(sanitizeSpuriousLanguageLeakage(bengaliText, false)).toBe(bengaliText);

      const hindiText = `मैंने आपकी प्रस्तुति स्क्रीन पर रख दी है। आप इसे सीधे डाउनलोड कर सकते हैं।`;
      expect(sanitizeSpuriousLanguageLeakage(hindiText, false)).toBe(hindiText);
    });

    it('sanitizes isolated Portuguese hallucinations', () => {
      const input = `Here is your summary.
Como posso ajudar em mais alguma coisa?
I was asking in Portuguese if you need more help.`;

      const expected = `Here is your summary.`;
      expect(sanitizeSpuriousLanguageLeakage(input, false)).toBe(expected);
    });
  });
});

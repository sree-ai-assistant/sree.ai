import { describe, it, expect } from 'vitest';
import { parseMessageContent } from './messageParser';

describe('parseMessageContent', () => {
  it('preserves user input verbatim when role is "user", including [SYSTEM INSTRUCTION: ...]', () => {
    const raw = '[SYSTEM INSTRUCTION: The user has attached document(s). Please review and analyze the attached files in relation to the user\'s prompt.]';
    const result = parseMessageContent(raw, { role: 'user' });

    expect(result.cleanText).toBe(raw);
    expect(result.injectedAttachments).toHaveLength(0);
  });

  it('preserves user input with outer quotes verbatim', () => {
    const raw = '"[SYSTEM INSTRUCTION: The user has attached document(s). Please review and analyze the attached files in relation to the user\'s prompt.]"';
    const result = parseMessageContent(raw, { role: 'user' });

    expect(result.cleanText).toBe(raw);
    expect(result.injectedAttachments).toHaveLength(0);
  });

  it('strips leaked system instructions when role is "assistant"', () => {
    const raw = 'Here is the analysis:\n\n[SYSTEM INSTRUCTION: Internal directive for assistant]\n\nDone.';
    const result = parseMessageContent(raw, { role: 'assistant' });

    expect(result.cleanText).toBe('Here is the analysis:\n\n\n\nDone.');
  });

  it('strips leaked system instructions by default when role is not specified', () => {
    const raw = 'Some text [SYSTEM INSTRUCTION: Leaked prompt]';
    const result = parseMessageContent(raw);

    expect(result.cleanText).toBe('Some text');
  });

  it('honors explicit stripSystemInstructions: true even if role is user', () => {
    const raw = 'User text [SYSTEM INSTRUCTION: should be stripped]';
    const result = parseMessageContent(raw, { role: 'user', stripSystemInstructions: true });

    expect(result.cleanText).toBe('User text');
  });

  it('honors explicit stripSystemInstructions: false even if role is assistant', () => {
    const raw = 'Assistant text [SYSTEM INSTRUCTION: should stay]';
    const result = parseMessageContent(raw, { role: 'assistant', stripSystemInstructions: false });

    expect(result.cleanText).toBe('Assistant text [SYSTEM INSTRUCTION: should stay]');
  });

  it('extracts image attachments from JSON parts array and preserves text for user', () => {
    const jsonParts = JSON.stringify([
      { type: 'text', text: 'Analyze this photo: [SYSTEM INSTRUCTION: custom user prompt]' },
      { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } }
    ]);

    const result = parseMessageContent(jsonParts, { role: 'user' });
    expect(result.cleanText).toBe('Analyze this photo: [SYSTEM INSTRUCTION: custom user prompt]');
    expect(result.injectedAttachments).toHaveLength(1);
    expect(result.injectedAttachments[0].url).toBe('https://example.com/photo.jpg');
  });

  it('handles empty or null inputs gracefully', () => {
    expect(parseMessageContent(null)).toEqual({ cleanText: '', injectedAttachments: [] });
    expect(parseMessageContent('')).toEqual({ cleanText: '', injectedAttachments: [] });
    expect(parseMessageContent(undefined)).toEqual({ cleanText: '', injectedAttachments: [] });
  });
});

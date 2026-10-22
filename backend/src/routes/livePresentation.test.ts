import { describe, it, expect, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { formatPresentationMarkdownFromTool } from './live.routes';

describe('formatPresentationMarkdownFromTool - Gemini Live Tool Calling (Approach A)', () => {
  it('formats a complete structured presentation with title, subtitle, theme, and slides', () => {
    const args = {
      title: 'Elon Musk: Visionary Entrepreneur',
      subtitle: 'Pioneering SpaceX, Tesla, and Beyond',
      theme: 'navyGold',
      slides: [
        {
          title: 'Early Life & Zip2',
          bullets: [
            'Born in Pretoria, South Africa in 1971.',
            'Co-founded Zip2 in 1995, sold to Compaq for $307 million.',
          ],
        },
        {
          title: 'The PayPal Revolution',
          bullets: [
            'Founded X.com in 1999, which merged to create PayPal.',
            'Acquired by eBay for $1.5 billion in 2002.',
          ],
        },
        {
          title: 'SpaceX & Multiplanetary Ambition',
          bullets: [
            'Founded Space Exploration Technologies in 2002.',
            'Developed Falcon 9, Falcon Heavy, and Starship.',
          ],
        },
      ],
    };

    const md = formatPresentationMarkdownFromTool(args);

    expect(md).toContain('<!-- theme: navyGold -->');
    expect(md).toContain('# Elon Musk: Visionary Entrepreneur');
    expect(md).toContain('## Pioneering SpaceX, Tesla, and Beyond');
    expect(md).toContain('---');
    expect(md).toContain('## Early Life & Zip2');
    expect(md).toContain('- Born in Pretoria, South Africa in 1971.');
    expect(md).toContain('## The PayPal Revolution');
    expect(md).toContain('## SpaceX & Multiplanetary Ambition');
  });

  it('sanitizes HTML tags and XSS injection attempts in titles and bullet points', () => {
    const maliciousArgs = {
      title: 'Elon Musk <script>alert("xss")</script>',
      subtitle: 'Leader <img src=x onerror=alert(1)>',
      theme: 'emeraldTech',
      slides: [
        {
          title: 'Key Milestones <style>body{color:red}</style>',
          bullets: [
            'Normal bullet point',
            '<svg onload=alert(1)>Dangerous SVG tag',
          ],
        },
      ],
    };

    const md = formatPresentationMarkdownFromTool(maliciousArgs);

    expect(md).not.toContain('<script>');
    expect(md).not.toContain('<img');
    expect(md).not.toContain('<style>');
    expect(md).not.toContain('<svg');
    expect(md).toContain('# Elon Musk alert("xss")');
    expect(md).toContain('## Leader');
    expect(md).toContain('Dangerous SVG tag');
  });

  it('validates theme against whitelist and falls back to navyGold for invalid themes', () => {
    const invalidThemeArgs = {
      title: 'Tech Trends 2026',
      theme: 'neonRainbowGlitterHackerMode',
      slides: [
        {
          title: 'AI Advances',
          bullets: ['Generative models evolve.'],
        },
      ],
    };

    const md = formatPresentationMarkdownFromTool(invalidThemeArgs);

    expect(md).toContain('<!-- theme: navyGold -->');
    expect(md).not.toContain('neonRainbowGlitterHackerMode');
  });

  it('accepts whitelisted themes properly', () => {
    for (const validTheme of ['modernLight', 'navyGold', 'emeraldTech', 'crimsonNight', 'slateMonochrome', 'executiveDark']) {
      const res = formatPresentationMarkdownFromTool({
        title: 'Theme Test',
        theme: validTheme,
        slides: [{ title: 'Slide', bullets: ['Bullet'] }],
      });
      expect(res).toContain(`<!-- theme: ${validTheme} -->`);
    }
  });

  it('handles stringified JSON input safely without throwing', () => {
    const stringified = JSON.stringify({
      title: 'Parsed from String',
      subtitle: 'Works cleanly',
      slides: [
        { title: 'Slide 1', bullets: ['Point 1'] },
      ],
    });

    const md = formatPresentationMarkdownFromTool(stringified);

    expect(md).toContain('# Parsed from String');
    expect(md).toContain('## Works cleanly');
    expect(md).toContain('## Slide 1');
  });

  it('generates defensive fallback slides if model supplies an empty slide array', () => {
    const emptySlidesArgs = {
      title: 'Autonomous Presentation',
      slides: [],
    };

    const md = formatPresentationMarkdownFromTool(emptySlidesArgs);

    expect(md).toContain('# Autonomous Presentation');
    expect(md).toContain('---');
    expect(md).toContain('## Overview & Background');
    expect(md).toContain('## Key Developments & Innovations');
    expect(md).toContain('## Impact & Future Outlook');
  });

  it('caps slides at a safe limit of 20 to prevent resource exhaustion', () => {
    const massiveSlides = Array.from({ length: 50 }, (_, i) => ({
      title: `Slide ${i + 1}`,
      bullets: [`Point for slide ${i + 1}`],
    }));

    const md = formatPresentationMarkdownFromTool({
      title: 'Massive Deck',
      slides: massiveSlides,
    });

    expect(md).toContain('## Slide 20');
    expect(md).not.toContain('## Slide 21');
  });

  it('handles completely malformed or null inputs without throwing an uncaught exception', () => {
    expect(() => formatPresentationMarkdownFromTool(null)).not.toThrow();
    expect(() => formatPresentationMarkdownFromTool(undefined)).not.toThrow();
    expect(() => formatPresentationMarkdownFromTool(12345)).not.toThrow();
    expect(() => formatPresentationMarkdownFromTool('{ invalid json')).not.toThrow();

    const fallbackMd = formatPresentationMarkdownFromTool(null);
    expect(fallbackMd).toContain('# Presentation');
    expect(fallbackMd).toContain('---');
  });
});

/**
 * presentationThemes.ts
 * Curated executive presentation themes for Sree AI PowerPoint decks & 1:1 preview
 */

export interface PresentationTheme {
  id: string;
  name: string;
  coverBg: string;       // HEX (without # for pptxgenjs, with # for CSS)
  contentBg: string;
  titleColor: string;
  contentTitleColor: string;
  subtitleColor: string;
  bodyColor: string;
  accentColor: string;
  fontFace: string;
  isLight?: boolean;
}

export const PRESENTATION_THEMES: Record<string, PresentationTheme> = {
  executiveDark: {
    id: 'executiveDark',
    name: 'Executive Dark (Default)',
    coverBg: '0B0F17',
    contentBg: '0F172A',
    titleColor: 'FFFFFF',
    contentTitleColor: 'F8FAFC',
    subtitleColor: '94A3B8',
    bodyColor: 'CBD5E1',
    accentColor: '3B82F6',
    fontFace: 'Arial',
    isLight: false,
  },
  modernLight: {
    id: 'modernLight',
    name: 'Modern Minimalist (Light)',
    coverBg: 'FFFFFF',
    contentBg: 'F8FAFC',
    titleColor: '0F172A',
    contentTitleColor: '0F172A',
    subtitleColor: '64748B',
    bodyColor: '334155',
    accentColor: '2563EB',
    fontFace: 'Arial',
    isLight: true,
  },
  navyGold: {
    id: 'navyGold',
    name: 'Royal Navy & Gold',
    coverBg: '060D1A',
    contentBg: '0A1628',
    titleColor: 'F5E6BE',
    contentTitleColor: 'FFFFFF',
    subtitleColor: 'D4AF37',
    bodyColor: 'E2E8F0',
    accentColor: 'D4AF37',
    fontFace: 'Georgia',
    isLight: false,
  },
  emeraldTech: {
    id: 'emeraldTech',
    name: 'Emerald Obsidian',
    coverBg: '06130D',
    contentBg: '0A1E14',
    titleColor: 'ECFDF5',
    contentTitleColor: 'FFFFFF',
    subtitleColor: '6EE7B7',
    bodyColor: 'D1FAE5',
    accentColor: '10B981',
    fontFace: 'Arial',
    isLight: false,
  },
  crimsonNight: {
    id: 'crimsonNight',
    name: 'Crimson Night',
    coverBg: '15080C',
    contentBg: '210B13',
    titleColor: 'FFF1F2',
    contentTitleColor: 'FFFFFF',
    subtitleColor: 'FDA4AF',
    bodyColor: 'FFE4E6',
    accentColor: 'F43F5E',
    fontFace: 'Arial',
    isLight: false,
  },
  slateMonochrome: {
    id: 'slateMonochrome',
    name: 'Slate Monochrome',
    coverBg: '18181B',
    contentBg: '27272A',
    titleColor: 'FFFFFF',
    contentTitleColor: 'FAFAFA',
    subtitleColor: 'A1A1AA',
    bodyColor: 'E4E4E7',
    accentColor: '94A3B8',
    fontFace: 'Arial',
    isLight: false,
  },
};

export const DEFAULT_THEME = PRESENTATION_THEMES.executiveDark;

/**
 * Extracts theme preference from markdown comments or natural text
 * e.g., <!-- theme: modernLight --> or <!-- theme: navyGold -->
 */
export function detectThemeFromMarkdown(markdown: string): PresentationTheme {
  if (!markdown) return DEFAULT_THEME;

  // 1. Explicit theme comment: <!-- theme: navyGold -->
  const themeMatch = markdown.match(/<!--\s*theme:\s*([a-zA-Z0-9_-]+)\s*-->/i);
  if (themeMatch) {
    const key = themeMatch[1].toLowerCase().replace(/[-_]/g, '');
    for (const [id, theme] of Object.entries(PRESENTATION_THEMES)) {
      if (id.toLowerCase() === key) return theme;
    }
  }

  // 2. Natural language detection from headers or intro
  const lowerIntro = markdown.slice(0, 400).toLowerCase();
  if (lowerIntro.includes('light theme') || lowerIntro.includes('white background') || lowerIntro.includes('minimalist light')) {
    return PRESENTATION_THEMES.modernLight;
  }
  if (lowerIntro.includes('navy') && (lowerIntro.includes('gold') || lowerIntro.includes('yellow'))) {
    return PRESENTATION_THEMES.navyGold;
  }
  if (lowerIntro.includes('emerald') || lowerIntro.includes('green') || lowerIntro.includes('nature theme')) {
    return PRESENTATION_THEMES.emeraldTech;
  }
  if (lowerIntro.includes('crimson') || lowerIntro.includes('red') || lowerIntro.includes('rose theme')) {
    return PRESENTATION_THEMES.crimsonNight;
  }
  if (lowerIntro.includes('monochrome') || lowerIntro.includes('grayscale') || lowerIntro.includes('slate theme')) {
    return PRESENTATION_THEMES.slateMonochrome;
  }

  return DEFAULT_THEME;
}

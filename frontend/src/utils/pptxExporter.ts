import PptxGenJS from 'pptxgenjs';
import {
  type PresentationTheme,
  PRESENTATION_THEMES,
  detectThemeFromMarkdown,
  DEFAULT_THEME,
} from './presentationThemes';

export interface PptxExportOptions {
  title?: string;
  author?: string;
  includeMetadata?: boolean;
  theme?: PresentationTheme | string;
  showWatermark?: boolean;
  fallbackLogoUrl?: string;
  hasTitleLogo?: boolean;
  titleLogoText?: string;
}


export interface SlideCodeSnippet {
  language: string;
  code: string;
}

export interface ParsedSlideData {
  title: string;
  bullets: string[];
  paragraphs: string[];
  tableLines: string[];
  codeSnippet?: SlideCodeSnippet;
  hasLogoPlaceholder?: boolean;
  logoPlaceholderText?: string;
  logoUrl?: string;
}

/**
 * Strips markdown markup (bold, italic, code, links) and cleans math/LaTeX expressions
 */
function stripMarkdownFormatting(str: string): string {
  return str
    // LaTeX temperature and degree symbols ($1.5^\circ\text{C}$ -> 1.5°C)
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*\^\\circ\\text\{C\}\s*\$/g, '$1°C')
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*\^\{\\circ\}\\text\{C\}\s*\$/g, '$1°C')
    .replace(/\^\\circ\\text\{C\}/g, '°C')
    .replace(/\^\{\\circ\}\\text\{C\}/g, '°C')
    .replace(/\^\\circ/g, '°')
    .replace(/\^\{\\circ\}/g, '°')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\approx/g, '≈')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\times/g, '×')
    .replace(/\\pm/g, '±')
    .replace(/\$([^$]+)\$/g, '$1')
    // Remove blockquote markers (e.g. "> *Text*", "> ", ">")
    .replace(/^>\s*/gm, '')
    // Markdown formatting
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/___(.*?)___/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    // Clean any leading/trailing unclosed formatting marks (*, _)
    .replace(/^[*_]+|[*_]+$/g, '')
    .trim();
}

/**
 * Cleans a slide title string by removing prefixes like "Slide 1: ", "# ", "04 | ", markdown asterisks
 */
export function cleanSlideTitle(rawTitle: string): string {
  const stripped = rawTitle
    .replace(/^#{1,4}\s+/, '')
    .replace(/^\*{1,2}(.*?)\*{1,2}$/, '$1')
    .replace(/^Slide\s+\d+\s*[:\-–—|]\s*/i, '')
    .replace(/^\d+\.\s+(Slide\s*[:\-–—|]\s*)?/i, '')
    .replace(/^\d+\s*[:\-–—|]\s*/i, '')
    .replace(/^\d+\.\s+/i, '')
    .trim();

  return stripMarkdownFormatting(stripped);
}

/**
 * Sanitizes a fallback title candidate. Rejects raw user conversational prompts,
 * long queries, instructions, and questions so they never become slide titles or file names.
 */
export function cleanFallbackTitle(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Reject conversational prompts, commands, or long user queries
  if (
    trimmed.length > 50 ||
    /^(?:plan|give me|how can|how to|can you|create|make|write|generate|show me|tell me|ok so|i want|please)\b/i.test(trimmed) ||
    /[?!]/.test(trimmed)
  ) {
    return '';
  }

  return stripMarkdownFormatting(trimmed);
}

/**
 * Detects if a text block contains a genuine ASCII flowchart, hierarchy tree, or box diagram.
 * Excludes normal prose, sentences, and prompts containing hyphens or letters like 'v'.
 */
export function isTrueAsciiDiagram(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();

  // 1. Unicode box drawing characters (e.g. ┌─┐, │ │, └──┘)
  if (/[\u2500-\u257F]/.test(trimmed)) return true;

  // 2. Explicit ASCII boxes: +-----+ or +=====+
  if (/\+[-=]{3,}\+/.test(trimmed)) return true;

  // 3. Tree branch connectors: +-- or |-- or \-- or ├── or └──
  if (/(?:^|\n)\s*(?:\+--|\|--|\\--|├──|└──)\s*\S/.test(trimmed)) return true;

  // 4. Flowchart nodes connected by arrows: [A] --> [B] or [A] -> [B]
  if (/\[[^\]\n]+\]\s*(?:-->|<--|==>|<==|->|<-)\s*\[[^\]\n]+\]/.test(trimmed)) return true;

  // 5. Vertical flow arrows on their own lines (e.g. ^ then | then [Box] or | then v)
  if (/(?:^|\n)\s*(?:\^|v)\s*\n\s*\|\s*(?:\n|$)/i.test(trimmed)) return true;
  if (/(?:^|\n)\s*\|\s*\n\s*(?:\^|v)\s*(?:\n|$)/i.test(trimmed)) return true;

  return false;
}

/**
 * Returns a polished badge label for slide code snippets.
 * Specifically converts generic text/txt/code blocks containing ASCII flowcharts,
 * hierarchy trees, or box diagrams into a premium "DIAGRAM" label.
 */
export function getSlideCodeBadge(rawLang: string, code: string): string {
  const lang = (rawLang || '').toLowerCase().trim();
  if (['text', 'txt', 'plaintext', 'ascii', 'code', ''].includes(lang)) {
    // Check if code contains true ASCII flowchart / box / hierarchy indicators
    const hasDiagramChars = isTrueAsciiDiagram(code);
    return hasDiagramChars ? 'DIAGRAM' : 'CODE';
  }
  return lang.toUpperCase();
}

/**
 * Strips common leading whitespace from all lines of a code/diagram snippet.
 * Preserves relative character columns for ASCII art, tables, and nested indentation,
 * while preventing artificial shifts from AI-generated indentations.
 */
export function stripCommonIndentation(code: string): string {
  if (!code) return '';
  const lines = code.split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length === 0) return code;
  const indents = nonEmpty.map(l => {
    const match = l.match(/^(\s*)/);
    return match ? match[1].length : 0;
  });
  const minIndent = Math.min(...indents);
  if (minIndent === 0) return code;
  return lines.map(l => (l.length >= minIndent ? l.slice(minIndent) : l.trim())).join('\n');
}

/**
 * Detects if a line represents a logo, image, or media placeholder.
 * Handles markdown images, HTML img tags, bracketed placeholders like [LOGO PLACEHOLDER],
 * [IMAGE PLACEHOLDER], [YOUR IMAGE HERE], [PRODUCT IMAGE], [COMPANY LOGO], [YOUR LOGO HERE],
 * [PHOTO PLACEHOLDER], [SCREENSHOT], and plain text variations.
 */
export function isLogoPlaceholderLine(line: string): boolean {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Markdown image: ![Alt Text](url) or ![Alt Text]
  if (/^!\[(.*?)\](?:\((.*?)\))?/.test(trimmed)) return true;

  // HTML img tag
  if (/^<img\b[^>]*>/i.test(trimmed)) return true;

  // Bracketed logo / image / media placeholder tags:
  // e.g. [LOGO PLACEHOLDER], [LOGO], [YOUR LOGO HERE], [COMPANY LOGO], [BRAND LOGO],
  // [IMAGE PLACEHOLDER], [IMAGE], [YOUR IMAGE HERE], [PRODUCT IMAGE], [PLACE IMAGE HERE],
  // [PHOTO PLACEHOLDER], [SCREENSHOT PLACEHOLDER], [GRAPHIC], [VISUAL PLACEHOLDER],
  // [Image: Dashboard Analytics], [Logo: Sree AI]
  if (/^\[[^\]]*(?:logo|brand\s*mark|image|photo|picture|screenshot|graphic|illustration|visual|placeholder)[^\]]*\]$/i.test(trimmed)) return true;

  // Plain text logo / image placeholder lines:
  // e.g. LOGO PLACEHOLDER, YOUR LOGO HERE, PLACE LOGO HERE, COMPANY LOGO,
  // IMAGE PLACEHOLDER, YOUR IMAGE HERE, PLACE IMAGE HERE, PRODUCT IMAGE,
  // SCREENSHOT PLACEHOLDER, PHOTO PLACEHOLDER
  if (/^(?:(?:place|your|company|brand|product|feature|app)\s+)?(?:logo|image|picture|photo|screenshot)(?:\s+placeholder|\s+here)?$/i.test(trimmed)) return true;
  if (/^(?:logo|image|picture|photo|screenshot)\s+placeholder(?::\s*.+)?$/i.test(trimmed)) return true;

  // Formatted variations: *Logo Placeholder*, **[LOGO PLACEHOLDER]**, **[YOUR IMAGE HERE]**, etc.
  if (/^[*_]{1,2}(?:\[?[^\]*_]*(?:logo|brand\s*mark|image|photo|picture|screenshot|graphic|illustration|visual|placeholder)[^\]*_]*\]?)[*_]{1,2}$/i.test(trimmed)) return true;

  return false;
}

/**
 * Extracts logo or image details (url and placeholder label) from a line.
 */
export function extractLogoFromLine(line: string): { hasLogo: boolean; url?: string; text?: string } {
  if (!line || typeof line !== 'string') return { hasLogo: false };
  const trimmed = line.trim();
  if (!isLogoPlaceholderLine(trimmed)) return { hasLogo: false };

  // 1. Markdown image tag: ![Alt](url)
  const imgMatch = trimmed.match(/^!\[(.*?)\](?:\((.*?)\))?/);
  if (imgMatch) {
    const alt = imgMatch[1]?.trim() || '';
    const url = imgMatch[2]?.trim() || '';
    const validUrl = url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) ? url : undefined;
    let label: string | undefined = undefined;
    if (alt) {
      if (/^(?:logo|placeholder|place\s+logo(?:\s+here)?|your\s+logo(?:\s+here)?|logo\s+placeholder)$/i.test(alt)) {
        label = 'YOUR LOGO HERE';
      } else if (/^(?:image|picture|photo|screenshot|place\s+image(?:\s+here)?|your\s+image(?:\s+here)?|image\s+placeholder)$/i.test(alt)) {
        label = 'YOUR IMAGE HERE';
      } else {
        label = alt;
      }
    }
    return { hasLogo: true, url: validUrl, text: label };
  }

  // 2. HTML img tag: <img src="..." alt="..." />
  const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  const altMatch = trimmed.match(/alt=["']([^"']+)["']/i);
  if (srcMatch) {
    const url = srcMatch[1].trim();
    const validUrl = (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) ? url : undefined;
    const label = altMatch ? altMatch[1].trim() : undefined;
    return { hasLogo: true, url: validUrl, text: label };
  }

  // 3. Bracketed or styled placeholder: strip brackets/markdown styling
  const cleanLabel = trimmed.replace(/^[*_~`#\-\[\]]+|[*_~`#\-\[\]]+$/g, '').trim();
  const lowerClean = cleanLabel.toLowerCase();

  let defaultLabel = 'YOUR LOGO HERE';
  if (/image|photo|picture|screenshot|graphic|illustration|visual/.test(lowerClean) && !/logo|brand/.test(lowerClean)) {
    defaultLabel = 'YOUR IMAGE HERE';
  }

  const isGenericLogo = /^(?:logo|place\s+logo(?:\s+here)?|your\s+logo(?:\s+here)?|logo\s+placeholder|placeholder)$/i.test(cleanLabel);
  const isGenericImage = /^(?:image|place\s+image(?:\s+here)?|your\s+image(?:\s+here)?|image\s+placeholder)$/i.test(cleanLabel);

  const label = isGenericLogo
    ? 'YOUR LOGO HERE'
    : isGenericImage
    ? 'YOUR IMAGE HERE'
    : cleanLabel || defaultLabel;

  return { hasLogo: true, text: label };
}

export interface AdaptiveCodeLayout {
  codeFontSize: number;
  lineSpacingVal: number;
  actualTextH: number;
  codeCardH: number;
  topOffset: number;
  bottomPadding: number;
}

/**
 * Dynamically calculates typography and card geometry for code and ASCII diagram blocks.
 * Enforces a strict vertical constraint budget so that:
 * 1. Short code snippets (<= 6 lines) retain spacious executive typography (13.5pt, 21pt spacing).
 * 2. Medium code snippets (7-12 lines) remain comfortably sized (11-12pt).
 * 3. Tall snippets and multi-level ASCII diagrams (16-30+ lines) dynamically scale their font
 *    and line spacing so the card NEVER exceeds the slide canvas and text NEVER spills outside the card.
 * 4. The card bottom always maintains safe clearance above slide numbers and watermarks.
 */
export function calculateAdaptiveCodeLayout(
  codeOrLineCount: string | number,
  isDiagram: boolean,
  currentY: number,
  isSplitLayout: boolean
): AdaptiveCodeLayout {
  const topOffset = isSplitLayout ? 0.44 : 0.42;
  const bottomPadding = isSplitLayout ? 0.28 : 0.22;

  // Slide height is 7.5". Slide number / footer begins at y = 7.15".
  // Content can safely extend to y = 7.02" maintaining clean separation above footer.
  const absoluteMaxBottom = 7.02;
  const maxAllowedCardH = Math.max(1.8, absoluteMaxBottom - currentY);
  // Cap the card container at 4.90" max for split layout or 5.45" max for full-width layout
  const maxCardH = Math.min(isSplitLayout ? 4.90 : 5.45, maxAllowedCardH);

  // Maximum vertical height available for text lines inside the card
  const maxAvailableTextH = Math.max(0.8, maxCardH - topOffset - bottomPadding);

  let rawLineCount: number;
  let rawLines: string[] = [];

  if (typeof codeOrLineCount === 'number') {
    rawLineCount = Math.max(1, codeOrLineCount);
  } else {
    const cleanCode = (codeOrLineCount || '').trimEnd();
    rawLines = cleanCode.split('\n');
    rawLineCount = Math.max(1, rawLines.length);
  }

  // Preferred typography before constraint checking
  let preferredFontSize: number;
  let preferredLineSpacing: number;

  if (isDiagram) {
    if (rawLineCount <= 8) {
      preferredFontSize = 12.0;
      preferredLineSpacing = 17;
    } else if (rawLineCount <= 14) {
      preferredFontSize = 11.0;
      preferredLineSpacing = 15;
    } else if (rawLineCount <= 20) {
      preferredFontSize = isSplitLayout ? 9.5 : 10.5;
      preferredLineSpacing = isSplitLayout ? 13 : 14.5;
    } else {
      preferredFontSize = isSplitLayout ? 8.5 : 10.5;
      preferredLineSpacing = isSplitLayout ? 11.5 : 13.5;
    }
  } else {
    if (rawLineCount <= 6) {
      preferredFontSize = isSplitLayout ? 13.5 : 14.0;
      preferredLineSpacing = isSplitLayout ? 21 : 22;
    } else if (rawLineCount <= 10) {
      preferredFontSize = isSplitLayout ? 12.0 : 12.5;
      preferredLineSpacing = isSplitLayout ? 18 : 19;
    } else if (rawLineCount <= 15) {
      preferredFontSize = isSplitLayout ? 10.5 : 11.0;
      preferredLineSpacing = isSplitLayout ? 15 : 16;
    } else {
      preferredFontSize = isSplitLayout ? 9.5 : 10.0;
      preferredLineSpacing = isSplitLayout ? 13.5 : 14.0;
    }
  }

  // Calculate true visual line count (accounting for word-wrapping on wide lines in non-diagrams)
  let effectiveLineCount = rawLineCount;
  if (!isDiagram && rawLines.length > 0) {
    const colWidthPt = (isSplitLayout ? 5.38 : 10.35) * 72;
    const charWidthPt = preferredFontSize * 0.60;
    const maxCharsPerLine = Math.max(25, Math.floor((colWidthPt - 24) / charWidthPt));
    effectiveLineCount = 0;
    for (const line of rawLines) {
      effectiveLineCount += Math.max(1, Math.ceil(line.length / maxCharsPerLine));
    }
  }

  // Calculate maximum points-per-line allowed by the card's vertical budget
  const maxPtPerLine = (maxAvailableTextH * 72) / Math.max(1, effectiveLineCount);

  // Constraint satisfaction: scale down lineSpacingVal and codeFontSize if needed
  let lineSpacingVal = preferredLineSpacing;
  let codeFontSize = preferredFontSize;

  if (preferredLineSpacing > maxPtPerLine) {
    lineSpacingVal = Math.max(6.5, maxPtPerLine);
    codeFontSize = Math.min(preferredFontSize, Math.max(5.5, lineSpacingVal * 0.82));
  }

  const ptPerLine = Math.max(codeFontSize * 1.20, lineSpacingVal);
  const rawTextH = (effectiveLineCount * ptPerLine) / 72;
  const actualTextH = Math.min(maxAvailableTextH, rawTextH);

  // Calculate total card container height: header + text + bottom padding
  // minCardH is now 1.4" so short code blocks don't leave large empty gaps
  const minCardH = 1.4;
  const desiredCardH = actualTextH + topOffset + bottomPadding;
  const codeCardH = Math.min(maxCardH, Math.max(minCardH, desiredCardH));

  return {
    codeFontSize: Number(codeFontSize.toFixed(1)),
    lineSpacingVal: Number(lineSpacingVal.toFixed(1)),
    actualTextH: Number(actualTextH.toFixed(3)),
    codeCardH: Number(codeCardH.toFixed(3)),
    topOffset,
    bottomPadding,
  };
}

/**
 * Detects if a line marks the boundary where presentation slides have ended
 * and subsequent non-presentation sections (Mermaid diagrams, ASCII/image previews,
 * document file guidance, or download instructions) begin.
 */
export function isPostPresentationBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // 1. Standalone Mermaid diagram code fence
  if (/^```\s*mermaid\b/i.test(trimmed)) {
    return true;
  }

  // 2. Deliverable, separate document, or format qualifiers in headings or bold headers
  // Matches e.g.:
  // "### CEO Strategic Roadmap (Internal Document)"
  // "## Executive Summary (Word Document Version)"
  // "### Architecture Diagram (Mermaid)"
  // "**CEO Strategy (Word/PDF)**"
  // "## 2. Mermaid Diagram"
  if (/^(?:#{1,4}\s+|\*{1,2}|_{1,2})?(?:\d+[\.:\-–—]\s*)?.*?\([^\)]+\)/.test(trimmed)) {
    const titlePart = trimmed.toLowerCase();
    if (
      titlePart.includes('internal document') ||
      titlePart.includes('separate document') ||
      titlePart.includes('document version') ||
      titlePart.includes('word document') ||
      titlePart.includes('pdf document') ||
      titlePart.includes('word/pdf') ||
      titlePart.includes('word (.docx)') ||
      titlePart.includes('docx') ||
      titlePart.includes('pdf') ||
      titlePart.includes('formal report') ||
      titlePart.includes('executive report') ||
      titlePart.includes('report version') ||
      titlePart.includes('doc file') ||
      titlePart.includes('document export') ||
      titlePart.includes('diagram') ||
      titlePart.includes('flowchart') ||
      titlePart.includes('mermaid') ||
      titlePart.includes('ascii') ||
      titlePart.includes('visual preview') ||
      titlePart.includes('download instructions') ||
      titlePart.includes('how to download') ||
      titlePart.includes('how to access') ||
      titlePart.includes('export instructions')
    ) {
      return true;
    }
  }

  // 3. Clean heading/numbered item check (stripping #, *, _, and numbers like "2. ", "3. ")
  const clean = trimmed
    .replace(/^(?:#{1,4}\s*|\*{1,2}|_{1,2}|\d+[\.:\-–—]\s*|[-*+•◦▪▫–—]\s*)+/g, '')
    .replace(/[*_~`]+$/g, '')
    .trim()
    .toLowerCase();

  // Conversational presentation delivery headings and handoffs:
  // e.g. "Your 9-Slide Presentation with Logo Only", "Your 10-Slide Presentation",
  // "The 9-Slide Presentation", "Your Presentation is Ready Above", "Your Clean Presentation"
  if (
    /^(?:your|the)\s+(?:clean\s+|image-free\s+|logo-free\s+|updated\s+|new\s+|complete\s+|full\s+|interactive\s+)?(?:\d+[- ]slide\s+)?presentation\b/i.test(clean) ||
    /^(?:your|the)\s+(?:deck|slides?)\s+(?:is|are)\s+ready\b/i.test(clean) ||
    /^(?:your|the)\s+(?:interactive\s+)?presentation\s+is\s+ready\b/i.test(clean) ||
    /^(?:preview|download)\s+(?:and\s+download|pptx|instructions?|your\s+presentation)\b/i.test(clean) ||
    /^presentation\s+(?:download|access|export|handoff|delivery|instructions?)\b/i.test(clean) ||
    /^presentation\s+(?:overview|summary)\s+(?:&|and)\s+(?:download|access|export|instructions?)\b/i.test(clean)
  ) {
    return true;
  }

  // Conversational UI Guidance Phrases in Text or Bullets:
  if (
    clean.includes('presentation is ready') ||
    clean.includes('presentation is now ready') ||
    clean.includes('presentation viewer above') ||
    clean.includes('presentation carousel') ||
    clean.includes('presentation card header') ||
    clean.includes('presentation card above') ||
    clean.includes('interactive presentation viewer') ||
    clean.includes('swipe through all') ||
    clean.includes('swipe through the slides') ||
    clean.includes('swipe through the') ||
    clean.includes('preview: you can swipe') ||
    clean.includes('preview & slide through') ||
    clean.includes('preview and slide through') ||
    clean.includes('download .pptx button') ||
    clean.includes('download pptx:') ||
    clean.includes('download pptx button') ||
    clean.includes('header of the presentation card') ||
    clean.includes('download your presentation file') ||
    clean.includes('download the presentation file') ||
    clean.includes('opening and closing slides') ||
    clean.includes('free of extra images or placeholders') ||
    clean.includes('logo on the opening and closing') ||
    clean.includes('with logo only') ||
    clean.includes('rendered above as a') ||
    clean.includes('interactive deck') ||
    clean.includes('preview window above')
  ) {
    return true;
  }

  if (
    clean.startsWith('mermaid') ||
    clean.startsWith('diagram') ||
    clean.startsWith('image preview') ||
    clean.startsWith('ascii visual') ||
    clean.startsWith('ascii preview') ||
    clean.startsWith('ascii diagram') ||
    clean.startsWith('ascii art') ||
    clean.startsWith('internal document') ||
    clean.startsWith('separate document') ||
    clean.startsWith('formal report') ||
    clean.startsWith('executive report') ||
    clean.startsWith('word document') ||
    clean.startsWith('pdf document') ||
    clean.startsWith('document export') ||
    clean.startsWith('how to access') ||
    clean.startsWith('how to download') ||
    clean.startsWith('how to get your file') ||
    clean.startsWith('how to get your presentation') ||
    clean.startsWith('access your file') ||
    clean.startsWith('download your file') ||
    clean.startsWith('download instructions') ||
    clean.startsWith('export instructions') ||
    clean.startsWith('to download:') ||
    clean.startsWith('to access:') ||
    clean.startsWith('for the powerpoint') ||
    clean.startsWith('for the word') ||
    clean.startsWith('for the pdf') ||
    clean.startsWith('for the ceo strategy') ||
    clean.startsWith('as requested, i have separated') ||
    clean.startsWith('as requested, i have excluded') ||
    clean.startsWith('i have separated the') ||
    clean.startsWith('i have excluded the') ||
    clean.startsWith('preview & slide through') ||
    clean.startsWith('preview and slide through') ||
    clean.startsWith('preview:') ||
    clean.startsWith('download pptx:') ||
    clean.startsWith('download as powerpoint') ||
    clean.startsWith('download .pptx') ||
    clean.startsWith('your presentation is ready') ||
    clean.startsWith('the presentation is ready') ||
    clean.startsWith('your deck is ready') ||
    clean.startsWith('presentation summary & download') ||
    clean.startsWith('presentation overview & download') ||
    clean.startsWith('presentation summary and download') ||
    clean.startsWith('presentation overview and download') ||
    clean.startsWith('presentation download') ||
    clean.startsWith('presentation access') ||
    clean.startsWith('presentation export') ||
    clean.includes('internal document') ||
    clean.includes('separate document') ||
    clean.includes('formal report') ||
    clean.includes('word document (.docx)') ||
    clean.includes('how to access your files')
  ) {
    return true;
  }

  // 4. Download / Outro guidance / External document transitions
  if (
    lower.startsWith('how to access') ||
    lower.startsWith('access your file') ||
    lower.startsWith('to access your file') ||
    lower.startsWith('how to download') ||
    lower.startsWith('how to get your file') ||
    lower.startsWith('how to get your presentation') ||
    lower.startsWith('to download') ||
    lower.startsWith('download instructions') ||
    lower.startsWith('to change themes') ||
    lower.startsWith('download your file') ||
    lower.startsWith('click download') ||
    lower.startsWith('click the download') ||
    lower.startsWith('which phase would you like') ||
    lower.startsWith('let me know if you would like') ||
    lower.startsWith('feel free to ask') ||
    lower.startsWith('your interactive presentation') ||
    lower.startsWith('the interactive presentation') ||
    lower.startsWith('your presentation is ready') ||
    lower.startsWith('the presentation is ready') ||
    lower.startsWith('your deck includes') ||
    lower.startsWith('the deck includes') ||
    lower.startsWith('once downloaded you can') ||
    lower.startsWith('once downloaded') ||
    lower.startsWith('you can preview and swipe') ||
    lower.startsWith('preview the presentation') ||
    lower.startsWith('right-clicking the placeholder') ||
    lower.startsWith('selecting change picture') ||
    lower.startsWith('replace it in powerpoint') ||
    lower.startsWith('to replace the placeholder') ||
    lower.startsWith('if you would like') ||
    lower.startsWith('if you want any') ||
    lower.startsWith('would you like me to') ||
    lower.startsWith('i hope this') ||
    lower.startsWith('hope this presentation') ||
    lower.startsWith('for the powerpoint') ||
    lower.startsWith('1. for the powerpoint') ||
    lower.startsWith('2. for the') ||
    lower.startsWith('for the word') ||
    lower.startsWith('for the pdf') ||
    lower.startsWith('for the ceo strategy') ||
    lower.startsWith('as requested, i have separated') ||
    lower.startsWith('as requested, i have excluded') ||
    lower.startsWith('i have separated the') ||
    lower.startsWith('i have excluded the') ||
    lower.startsWith('this roadmap is designed for you') ||
    lower.startsWith('the strategy text above is formatted') ||
    lower.startsWith('to download it as a professional document') ||
    lower.includes('for the powerpoint (.pptx)') ||
    lower.includes('for the ceo strategy (word/pdf)') ||
    lower.includes('action bar below this message') ||
    lower.includes('select word document (.docx)') ||
    lower.includes('select pdf document') ||
    lower.includes('how to access your files') ||
    lower.includes('presentation carousel') ||
    lower.includes('download .pptx button') ||
    lower.includes('presentation card header') ||
    lower.includes('selecting change picture') ||
    lower.includes('right-clicking the placeholder')
  ) {
    return true;
  }

  // Regex checks for conversational outro patterns
  if (/^(?:your|the)\s+(?:interactive\s+)?presentation\s+is\s+ready/i.test(trimmed)) {
    return true;
  }
  if (/^(?:your|the)\s+deck\s+includes/i.test(trimmed)) {
    return true;
  }
  if (/^once\s+downloaded\s+(?:you\s+can|it\s+can)/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks if a block of text is conversational AI chat preamble/instructions or download guidance
 * rather than presentation slides.
 */
function isConversationalSection(lines: string[]): boolean {
  // If section contains a post-presentation boundary, it is NEVER a presentation slide,
  // even if it has bullets or numbered steps (like download steps or separate document outlines)!
  if (lines.some(l => isPostPresentationBoundary(l))) return true;

  const joined = lines.join(' ').toLowerCase();

  // If section is explicitly a download or export guide, it is NEVER a presentation slide,
  // even if formatted with bullet points or numbered steps!
  const isDownloadGuide =
    joined.includes('how to get your file') ||
    joined.includes('how to download') ||
    joined.includes('download .pptx') ||
    joined.includes('download pptx') ||
    joined.includes('to download:') ||
    joined.includes('to change themes:') ||
    joined.includes('presentation card header') ||
    joined.includes('presentation card above') ||
    joined.includes('presentation viewer above') ||
    joined.includes('interactive presentation viewer') ||
    joined.includes('switch to other styles') ||
    joined.includes('your presentation is now perfectly formatted') ||
    joined.includes('presentation is ready above') ||
    joined.includes('presentation is ready') ||
    joined.includes('swipe through all') ||
    joined.includes('swipe through the slides') ||
    joined.includes('preview: you can swipe') ||
    joined.includes('preview & slide through') ||
    joined.includes('download this presentation') ||
    joined.includes('presentation card') ||
    joined.includes('look at the presentation') ||
    joined.includes('presentation carousel') ||
    joined.includes('with logo only') ||
    joined.includes('opening and closing slides') ||
    joined.includes('free of extra images');

  if (isDownloadGuide) return true;

  // If section contains genuine slide content (bullets, tables, code fences, or numbered items),
  // it is NEVER a purely conversational section! We must never discard slides that contain bullets.
  const hasBullets = lines.some(l => /^[-*+•◦▪▫–—]\s+/.test(l.trim()));
  const hasTable = lines.some(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
  const hasCodeFence = lines.some(l => /^```/.test(l.trim()));
  const hasNumberedList = lines.some(l => /^\d+\.\s+/.test(l.trim()));

  if (hasBullets || hasTable || hasCodeFence || (hasNumberedList && lines.length > 2)) {
    return false;
  }

  const hasConversationalPhrases =
    joined.includes('i apologize') ||
    joined.includes('oversight') ||
    joined.includes('capability') ||
    joined.includes('click the') ||
    joined.includes('export button') ||
    joined.includes('action bar below') ||
    joined.includes('slide-by-slide content') ||
    joined.includes('select **powerpoint') ||
    joined.includes('powerpoint (.pptx)') ||
    joined.includes('below is the complete') ||
    joined.includes('here is the complete') ||
    joined.includes('here is a') ||
    joined.includes('here is the') ||
    joined.includes('presentation-ready') ||
    joined.includes('let me know') ||
    joined.includes('hope this') ||
    joined.includes('feel free') ||
    joined.includes('download this');

  const hasSlideIndicators = lines.some(l =>
    /^#{1,3}\s+(Slide\s+\d+|[0-9]+\.\s+Slide)/i.test(l.trim()) ||
    /^[-*+•◦▪▫–—]\s+/.test(l.trim()) ||
    (l.trim().startsWith('|') && l.trim().endsWith('|'))
  );

  const hasHeading = lines.some(l => /^#{1,4}\s+/.test(l.trim()));
  if (!hasHeading && !hasSlideIndicators) {
    return true; // Plain conversational text without headings or slide indicators
  }

  return hasConversationalPhrases && !hasSlideIndicators;
}

/**
 * Parses raw markdown into structured slide objects
 */
export function parseMarkdownToSlides(markdown: string, fallbackTitle?: string): {
  title: string;
  subtitle: string;
  hasTitleLogo?: boolean;
  titleLogoText?: string;
  titleLogoUrl?: string;
  slides: ParsedSlideData[];
} {
  // 1. Clean thinking tags and normalize line endings
  const cleanMd = markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const allLines = cleanMd.split('\n');

  // 2. Identify if presentation uses explicit horizontal dividers (---, ***, ___)
  const hasDivider = allLines.some(l => /^[-*_]{3,}$/.test(l.trim()));
  const hasSlideHeader = allLines.some(l => /^(#{1,4}\s+)?(Slide\s+\d+|[0-9]+\.\s+Slide\b)/i.test(l.trim()));

  // 3. Partition into raw sections
  const rawSections: string[][] = [];
  let currentSection: string[] = [];
  let presentationStarted = false;
  let inCodeFence = false;

  for (const rawLine of allLines) {
    const trimmed = rawLine.trim();

    // Track code block fences to prevent splitting code blocks
    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
    }

    // Check if the presentation content has begun (title heading, slide header, logo image, or first divider)
    if (!presentationStarted) {
      if (
        /^[-*_]{3,}$/.test(trimmed) ||
        /^#{1,3}\s+/.test(trimmed) ||
        /^(#{1,4}\s+)?(Slide\s+\d+|[0-9]+\.\s+Slide\b|Title\s*Slide)/i.test(trimmed) ||
        /^!\[.*?(?:logo|placeholder|brand).*?\](?:\(.*?\))?/i.test(trimmed) ||
        /^\[?(?:place\s+|your\s+)?logo(?:\s+placeholder|\s+here)?\]?$/i.test(trimmed) ||
        /^<img\b[^>]*>/i.test(trimmed)
      ) {
        presentationStarted = true;
      }
    }

    // Once presentation has started, any post-presentation boundary terminates slide collection!
    if (presentationStarted && !inCodeFence && isPostPresentationBoundary(trimmed)) {
      if (currentSection.length > 0) {
        rawSections.push(currentSection);
        currentSection = [];
      }
      break; // Presentation ended: Mermaid, ASCII previews, or download guides follow
    }

    // Check horizontal delimiter (only outside code blocks)
    if (!inCodeFence && /^[-*_]{3,}$/.test(trimmed)) {
      if (currentSection.length > 0) {
        rawSections.push(currentSection);
        currentSection = [];
      }
      // Never include divider lines as content!
      continue;
    }

    // Check if currentSection only contains a logo image, placeholder, or theme directive.
    // If so, the upcoming # Title heading MUST stay in the same section as the logo!
    const onlyContainsLogoOrDirective =
      currentSection.length > 0 &&
      currentSection.every(l => {
        const t = l.trim();
        return !t || /^<!--\s*theme:/i.test(t) || isLogoPlaceholderLine(t);
      });

    const isNumberedSlideHeading =
      /^(?:#{1,4}\s+|\*\*)?\d+[\.:\-–—]\s+[A-Za-z0-9]/.test(trimmed) &&
      !isPostPresentationBoundary(trimmed);

    // Check slide header delimiter (if explicit slide headers are used, only outside code blocks)
    const isSlideHeaderLine =
      !inCodeFence &&
      !onlyContainsLogoOrDirective && (
        (hasSlideHeader && /^(#{1,4}\s+)?(Slide\s+\d+|[0-9]+\.\s+Slide\b)/i.test(trimmed)) ||
        (!hasDivider && !hasSlideHeader && /^#{1,2}\s+/.test(trimmed)) ||
        // If dividers were used earlier or omitted:
        // A new slide starts if currentSection already contains content (bullets, numbers, code, or table)
        // AND the new line is a slide heading (##, ###, ####, "Slide N", or numbered section title like "3. Service Automation")
        (currentSection.some(l => /^[-*+•◦▪▫–—]\s+/.test(l.trim()) || /^\d+\.\s+/.test(l.trim()) || (l.trim().startsWith('|') && l.trim().endsWith('|')) || l.trim().startsWith('```')) &&
          (
            /^#{1,4}\s+/.test(trimmed) ||
            /^(?:Slide\s+\d+|[0-9]+\.\s+Slide\b)/i.test(trimmed) ||
            isNumberedSlideHeading
          )
        ) ||
        (currentSection.length > 0 && !currentSection.some(l => /^#{1,4}\s+/.test(l.trim())) && /^#{1,2}\s+/.test(trimmed))
      );

    if (isSlideHeaderLine && currentSection.length > 0) {
      rawSections.push(currentSection);
      currentSection = [rawLine];
    } else {
      currentSection.push(rawLine);
    }
  }

  if (currentSection.length > 0) {
    rawSections.push(currentSection);
  }

  // 4. Filter out empty sections or purely conversational preambles/postambles/download guides
  const filteredSections = rawSections.filter(sec => {
    const nonBlank = sec.map(l => l.trim()).filter(l => l.length > 0 && !/^[-*_]{3,}$/.test(l));
    if (nonBlank.length === 0) return false;
    if (isConversationalSection(nonBlank)) return false;
    return true;
  });

  let presTitle = '';
  let presSubtitle = '';
  let hasTitleLogo = false;
  let titleLogoText = 'YOUR LOGO HERE';
  let titleLogoUrl: string | undefined = undefined;
  const parsedSlides: ParsedSlideData[] = [];

  // Check if a logo placeholder was placed before the title heading in raw markdown
  const beforeDivider = cleanMd.split(/^[-*_]{3,}$/m)[0] || '';
  const preTitleLogoMatch = beforeDivider.match(/!\[(.*?)\](?:\((.*?)\))?/);
  const beforeDividerLines = beforeDivider.split('\n');
  const hasBeforeLogo = !!preTitleLogoMatch || beforeDividerLines.some(l => isLogoPlaceholderLine(l));

  if (hasBeforeLogo) {
    hasTitleLogo = true;
    if (preTitleLogoMatch) {
      const alt = preTitleLogoMatch[1].trim();
      const url = preTitleLogoMatch[2]?.trim();
      if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
        titleLogoUrl = url;
      }
      if (alt && !/^logo$/i.test(alt)) {
        titleLogoText = alt;
      }
    } else {
      const pLine = beforeDividerLines.find(l => isLogoPlaceholderLine(l));
      if (pLine) {
        const info = extractLogoFromLine(pLine);
        if (info.text) titleLogoText = info.text;
        if (info.url) titleLogoUrl = info.url;
      }
    }
  }

  // 5. Detect and process sections
  for (let sIdx = 0; sIdx < filteredSections.length; sIdx++) {
    const sectionLines = filteredSections[sIdx];
    const cleanLines = sectionLines.map(l => l.trim()).filter(l => l.length > 0 && !/^[-*_]{3,}$/.test(l));
    if (cleanLines.length === 0) continue;

    // Detect if this first section is explicitly a Title Slide
    const firstLine = cleanLines[0];
    const isExplicitTitleSlide =
      sIdx === 0 &&
      (/Title\s*Slide/i.test(firstLine) ||
        cleanLines.some(l => /^#\s+/.test(l)) ||
        (cleanLines.length <= 4 && !cleanLines.some(l => /^[-*+•◦▪▫–—]\s+/.test(l) || l.startsWith('|'))));

    if (isExplicitTitleSlide) {
      // Extract presentation title, subtitle, and optional logo from this section
      for (const line of cleanLines) {
        const logoInfo = extractLogoFromLine(line);
        if (logoInfo.hasLogo) {
          hasTitleLogo = true;
          if (logoInfo.url) titleLogoUrl = logoInfo.url;
          if (logoInfo.text) titleLogoText = logoInfo.text;
          continue;
        }

        // If line is just a slide header marker like "Slide 1: Title Slide" or "Title Slide", extract any title suffix
        if (/^(?:#{1,4}\s*)?(?:Slide\s*0*1\b|Title\s*Slide\b)/i.test(line.trim())) {
          const cleaned = cleanSlideTitle(line);
          if (cleaned && !/^(?:Title\s*Slide|Slide\s*0*1)$/i.test(cleaned)) {
            if (!presTitle) {
              presTitle = cleaned;
            } else if (!presSubtitle) {
              presSubtitle = cleaned;
            }
          }
          continue;
        }

        if (/^#\s+/.test(line)) {
          presTitle = stripMarkdownFormatting(line.replace(/^#\s+/, '').trim());
        } else if (/^##\s+/.test(line)) {
          const content = stripMarkdownFormatting(line.replace(/^##\s+/, '').trim());
          if (!presTitle) {
            presTitle = content;
          } else if (!presSubtitle) {
            presSubtitle = content;
          }
        } else if (/^###\s+/.test(line)) {
          const content = stripMarkdownFormatting(line.replace(/^###\s+/, '').trim());
          if (!presTitle) {
            presTitle = content;
          } else if (!presSubtitle) {
            presSubtitle = content;
          }
        } else if (!presTitle && !/^(?:logo|placeholder)$/i.test(line)) {
          presTitle = stripMarkdownFormatting(line);
        } else if (presTitle && !presSubtitle && !/Prepared|Presented|By\s+/i.test(line) && !/^(?:logo|placeholder)$/i.test(line)) {
          presSubtitle = stripMarkdownFormatting(line);
        }
      }
      // Consumed as title slide, do not add as a standard content slide
      continue;
    }

    // Process as a content slide
    let slideTitle = '';
    let hasLogoPlaceholder = false;
    let logoPlaceholderText = 'YOUR LOGO HERE';
    let logoUrl: string | undefined = undefined;
    const bullets: string[] = [];
    const paragraphs: string[] = [];
    const tableLines: string[] = [];
    let codeSnippet: SlideCodeSnippet | undefined = undefined;

    let inCodeFence = false;
    let codeLang = '';
    const currentCodeLines: string[] = [];

    for (const rawL of sectionLines) {
      const trimmedLine = rawL.trim();

      // Outside code fences, ignore empty lines and markdown dividers
      if (!inCodeFence && (!trimmedLine || /^[-*_]{3,}$/.test(trimmedLine))) {
        continue;
      }

      // 1. Code fence toggling (```python ... ```)
      if (/^```/.test(trimmedLine)) {
        if (!inCodeFence) {
          inCodeFence = true;
          const match = trimmedLine.match(/^```([a-zA-Z0-9_+-]*)/);
          codeLang = match && match[1] ? match[1].toLowerCase() : 'code';
          continue;
        } else {
          inCodeFence = false;
          if (currentCodeLines.length > 0 && !codeSnippet) {
            codeSnippet = {
              language: codeLang || 'code',
              code: currentCodeLines.join('\n').trimEnd(),
            };
          }
          continue;
        }
      }

      // 2. Accumulate raw code lines when inside code fence (preserve exact indentation & ASCII spacing!)
      if (inCodeFence) {
        currentCodeLines.push(rawL);
        continue;
      }

      // 3. Normal elements outside code fence:
      // A. Table row
      if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
        tableLines.push(trimmedLine);
        continue;
      }

      // B. Logo placeholder image or real logo URL (e.g. ![Logo](https://...) or [PLACE LOGO HERE])
      const logoInfo = extractLogoFromLine(trimmedLine);
      if (logoInfo.hasLogo) {
        hasLogoPlaceholder = true;
        if (logoInfo.url) logoUrl = logoInfo.url;
        if (logoInfo.text) logoPlaceholderText = logoInfo.text;
        continue; // Consumed as logo placeholder/image, do not add as text!
      }

      // C. Slide Header (First heading in section)
      if (!slideTitle && /^#{1,4}\s+/.test(trimmedLine)) {
        slideTitle = cleanSlideTitle(trimmedLine);
        if (!presTitle) presTitle = slideTitle;
        continue;
      }

      // D. If no slide header was found yet and line looks like a title
      if (!slideTitle && /^(Slide\s+\d+|[0-9]+\.\s+)/i.test(trimmedLine)) {
        slideTitle = cleanSlideTitle(trimmedLine);
        continue;
      }

      // E. Bullet items (- point, * point, + point, • point)
      if (/^[-*+•◦▪▫–—]\s+/.test(trimmedLine)) {
        const rawBullet = trimmedLine.replace(/^[-*+•◦▪▫–—]\s+/, '').trim();
        const bulletLogo = extractLogoFromLine(rawBullet);
        if (bulletLogo.hasLogo) {
          hasLogoPlaceholder = true;
          if (bulletLogo.url) logoUrl = bulletLogo.url;
          if (bulletLogo.text) logoPlaceholderText = bulletLogo.text;
          continue;
        }
        const bulletText = stripMarkdownFormatting(rawBullet);
        if (bulletText) bullets.push(bulletText);
        continue;
      }

      // F. Numbered list items (1. point, 2. point)
      if (/^\d+\.\s+/.test(trimmedLine)) {
        const bulletText = stripMarkdownFormatting(trimmedLine.replace(/^\d+\.\s+/, '').trim());
        if (bulletText) bullets.push(bulletText);
        continue;
      }

      // G. Sub-headings within content (e.g. ### Sub topic)
      if (/^#{1,4}\s+/.test(trimmedLine)) {
        const subTitle = stripMarkdownFormatting(trimmedLine.replace(/^#{1,4}\s+/, '').trim());
        if (subTitle) bullets.push(subTitle);
        continue;
      }

      // H. Standard paragraph text (including blockquotes and descriptions)
      if (!slideTitle && !trimmedLine.startsWith('>')) {
        slideTitle = cleanSlideTitle(trimmedLine);
      } else if (trimmedLine.startsWith('>')) {
        const cleanP = stripMarkdownFormatting(trimmedLine);
        if (cleanP && !/^[-*_]{3,}$/.test(cleanP)) {
          paragraphs.push(cleanP);
        }
      } else if (bullets.length === 0) {
        // Only accept slide descriptive paragraphs BEFORE any bullet list begins.
        // Plain paragraphs occurring after bullet lists are conversational outro/subsequent responses.
        const cleanP = stripMarkdownFormatting(trimmedLine);
        if (cleanP && !/^[-*_]{3,}$/.test(cleanP)) {
          paragraphs.push(cleanP);
        }
      }
    }

    // Gracefully handle unclosed code fence
    if (inCodeFence && currentCodeLines.length > 0 && !codeSnippet) {
      codeSnippet = {
        language: codeLang || 'code',
        code: currentCodeLines.join('\n').trimEnd(),
      };
    }

    // Default title fallback if missing
    if (!slideTitle) {
      slideTitle = `Slide ${parsedSlides.length + 1}`;
    }

    // Only add slide if it has real content
    if (bullets.length > 0 || paragraphs.length > 0 || tableLines.length > 0 || codeSnippet || hasLogoPlaceholder) {
      parsedSlides.push({
        title: slideTitle,
        bullets,
        paragraphs,
        tableLines,
        codeSnippet,
        hasLogoPlaceholder,
        logoPlaceholderText,
        logoUrl,
      });
    }
  }

  // Fallback presentation title
  if (!presTitle) {
    const cleanFallback = cleanFallbackTitle(fallbackTitle);
    presTitle = cleanFallback || parsedSlides[0]?.title || 'Presentation';
  }

  return {
    title: presTitle,
    subtitle: presSubtitle || '',
    hasTitleLogo,
    titleLogoText,
    titleLogoUrl,
    slides: parsedSlides,
  };
}

/**
 * Transforms Markdown table lines into pptxgenjs table rows
 */
function buildPptxTable(tableLines: string[]): PptxGenJS.TableRow[] {
  const rows: PptxGenJS.TableRow[] = [];

  for (const line of tableLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    if (/^\|(\s*[:-]+[-| :]*)\|$/.test(trimmed)) continue; // skip separator row

    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map(c => stripMarkdownFormatting(c.trim()));

    if (cells.length === 0) continue;

    const isHeader = rows.length === 0;

    const rowCells: PptxGenJS.TableCell[] = cells.map(cellText => ({
      text: cellText,
      options: {
        fill: { color: isHeader ? '1E293B' : rows.length % 2 === 1 ? '161E2E' : '0F172A' },
        color: isHeader ? 'FFFFFF' : 'E2E8F0',
        bold: isHeader,
        fontSize: isHeader ? 11 : 10,
        fontFace: 'Arial',
        align: isHeader ? 'center' : 'left',
        valign: 'middle',
        border: {
          type: 'solid',
          pt: 1,
          color: '334155',
        },
      },
    }));

    rows.push(rowCells);
  }

  return rows;
}

let cachedFetchedImages: Record<string, string> = {};

/**
 * Loads an external or data URL image into a clean base64 PNG data URL
 * using an off-screen HTML5 Canvas. Includes a 2.5s timeout safety guard
 * so PowerPoint export never hangs if the remote host is unresponsive or blocked by CORS.
 */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  if (cachedFetchedImages[url]) return cachedFetchedImages[url];

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  try {
    const loadImg = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 400;
          canvas.height = img.naturalHeight || img.height || 140;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context unavailable'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = url;
    });

    const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const res = await Promise.race([loadImg, timeoutGuard]);
    if (res) {
      cachedFetchedImages[url] = res;
      return res;
    }
  } catch {
    // Graceful fallback to null if cross-origin image fails or network is offline
  }

  return null;
}

let cachedWatermarkDataUrl: string | null = null;

/**
 * Loads and rasterizes the Sree AI squircle icon (from /Sree-Ai-Fav-icon.png)
 * into a compact base64 PNG data URL (96x96 px) for embedding into PowerPoint slides.
 */
export async function getWatermarkIconDataUrl(): Promise<string | null> {
  if (cachedWatermarkDataUrl) return cachedWatermarkDataUrl;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const loadImg = new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const size = 96;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context unavailable'));
            ctx.drawImage(img, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => {
          if (img.src !== 'https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png') {
            img.src = 'https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png';
          } else {
            reject(new Error('Image failed to load'));
          }
        };
        img.src = '/Sree-Ai-Fav-icon.png';
      });

      // 1.5s timeout safety guard so export never hangs
      const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
      const res = await Promise.race([loadImg, timeoutGuard]);
      if (res) {
        cachedWatermarkDataUrl = res;
        return res;
      }
    } catch {
      // Graceful fallback
    }
  }

  return null;
}

let cachedLogoDataUrl: { [key: string]: string } = {};

/**
 * Generates an executive, crisp #1a1a1a dark charcoal placeholder image Data URL (400x150 px).
 * Matches the exact modern aesthetic with bold, centered white typography
 * (e.g. "YOUR LOGO HERE" or "YOUR IMAGE HERE") for PowerPoint "Change Picture" workflow.
 * In Node/Vitest test environments, safely falls back to a valid base64 PNG/SVG data URL.
 */
export function getLogoPlaceholderDataUrl(theme?: PresentationTheme, labelText?: string): string {
  const cleanLabel = (labelText || 'YOUR LOGO HERE')
    .replace(/^[*_~`#\-\[\]]+|[*_~`#\-\[\]]+$/g, '')
    .trim();
  const activeLabel = (cleanLabel || 'YOUR LOGO HERE').toUpperCase();
  const cacheKey = activeLabel;
  if (cachedLogoDataUrl[cacheKey]) {
    return cachedLogoDataUrl[cacheKey];
  }

  // Fallback valid base64 PNG for Node/SSR/Vitest environments where HTML5 Canvas is not present
  const fallbackPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAcIAAACMCAMAAABrUu1pAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAMAUExURQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///wAAACH5BAEAAAAALAAAAAABwgEAAAT/EMhJq7046827/2AoCADv';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallbackPng;
  }

  try {
    const canvas = document.createElement('canvas');
    const width = 400;
    const height = 150;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return fallbackPng;

    // 1. Dark #1a1a1a background with rounded corners (radius 8px)
    ctx.fillStyle = '#1a1a1a';
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(width - r, 0);
    ctx.quadraticCurveTo(width, 0, width, r);
    ctx.lineTo(width, height - r);
    ctx.quadraticCurveTo(width, height, width - r, height);
    ctx.lineTo(r, height);
    ctx.quadraticCurveTo(0, height, 0, height - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // 2. Subtle crisp border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Crisp centered white text
    ctx.fillStyle = '#ffffff';
    let fontSize = 20;
    if (activeLabel.length > 22) fontSize = 16;
    if (activeLabel.length > 30) fontSize = 13;

    ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(activeLabel, width / 2, height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    cachedLogoDataUrl[cacheKey] = dataUrl;
    return dataUrl;
  } catch {
    return fallbackPng;
  }
}

/**
 * Stamped watermark badge in bottom-right corner for anonymous and free users.
 * Contains the Sree AI logo icon beside "Sree AI", hyperlinked to https://sreeai.qzz.io/.
 */
function addWatermarkToSlide(
  slide: any,
  activeTheme: PresentationTheme,
  iconDataUrl: string | null
): void {
  const targetUrl = 'https://sreeai.qzz.io/';
  const tooltip = 'Created with Sree AI — https://sreeai.qzz.io/';
  const textColor = activeTheme.isLight ? '334155' : 'E2E8F0';

  if (iconDataUrl) {
    const cleanData = iconDataUrl.replace(/^data:/, '');

    // 1. Logo Icon placed tightly in the bottom-right corner
    slide.addImage({
      data: cleanData,
      x: 12.12,
      y: 7.10,
      w: 0.28,
      h: 0.28,
      hyperlink: { url: targetUrl, tooltip },
    });

    // 2. "Sree Ai" text beside icon in Javanese Text 14pt
    slide.addText('Sree Ai', {
      x: 12.46,
      y: 7.06,
      w: 0.76,
      h: 0.36,
      fontSize: 14,
      fontFace: 'Javanese Text',
      color: textColor,
      valign: 'middle',
      wrap: false,
      margin: 0,
      hyperlink: { url: targetUrl, tooltip },
    });
  } else {
    // Graceful fallback if image unavailable: text badge with link in corner
    slide.addText('Sree Ai', {
      x: 12.38,
      y: 7.06,
      w: 0.84,
      h: 0.36,
      fontSize: 14,
      fontFace: 'Javanese Text',
      color: textColor,
      valign: 'middle',
      wrap: false,
      margin: 0,
      hyperlink: { url: targetUrl, tooltip },
    });
  }
}

/**
 * Main export function: transforms raw markdown into a widescreen (13.33" x 7.5") .pptx Blob.
 * Calibrated so no text overflows and free/anonymous users receive the Sree AI watermark.
 */
export async function exportMarkdownToPptx(markdown: string, options?: PptxExportOptions): Promise<Blob> {
  const pres = new PptxGenJS();
  // Modern standard 16:9 widescreen layout (13.333" wide x 7.5" tall)
  pres.layout = 'LAYOUT_WIDE';
  pres.author = options?.author || '';
  pres.company = '';

  const activeTheme: PresentationTheme =
    typeof options?.theme === 'object' && options?.theme?.coverBg
      ? options.theme
      : typeof options?.theme === 'string' && PRESENTATION_THEMES[options.theme]
      ? PRESENTATION_THEMES[options.theme]
      : detectThemeFromMarkdown(markdown);

  const { title: presTitle, subtitle: presSubtitle, hasTitleLogo, titleLogoText, titleLogoUrl, slides } = parseMarkdownToSlides(markdown, options?.title);

  const showWatermark = options?.showWatermark ?? false;
  const iconDataUrl = showWatermark ? await getWatermarkIconDataUrl() : null;

  // ─────────────────────────────────────────────────────────────
  // 1. SLIDE 1: Title Slide (Dark Executive Aesthetic, Zero Out-of-Bounds Artifacts)
  // ─────────────────────────────────────────────────────────────
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: activeTheme.coverBg };

  // Optional Logo / Placeholder on Title Slide (genuine picture element for "Change Picture" in PPT)
  // A title logo/image is rendered ONLY if explicitly requested by markdown (hasTitleLogo / titleLogoUrl)
  // or if options.hasTitleLogo was explicitly requested.
  // fallbackLogoUrl provides the image data IF a logo was requested, but must NEVER force a logo
  // onto a clean presentation where no logo was requested or where hasTitleLogo is false!
  const isTitleLogoRequested =
    options?.hasTitleLogo !== undefined
      ? options.hasTitleLogo
      : (hasTitleLogo || Boolean(titleLogoUrl));

  if (isTitleLogoRequested) {
    let cleanLogoData: string | null = null;
    if (titleLogoUrl) {
      const fetched = await fetchImageAsDataUrl(titleLogoUrl);
      if (fetched) cleanLogoData = fetched.replace(/^data:/, '');
    }
    if (!cleanLogoData && options?.fallbackLogoUrl) {
      const fetchedFallback = await fetchImageAsDataUrl(options.fallbackLogoUrl);
      if (fetchedFallback) cleanLogoData = fetchedFallback.replace(/^data:/, '');
    }
    if (!cleanLogoData && (hasTitleLogo || options?.hasTitleLogo)) {
      const activeLabel = options?.titleLogoText || titleLogoText || 'YOUR LOGO HERE';
      const logoDataUrl = getLogoPlaceholderDataUrl(activeTheme, activeLabel);
      cleanLogoData = logoDataUrl.replace(/^data:/, '');
    }
    if (cleanLogoData) {
      titleSlide.addImage({
        data: cleanLogoData,
        x: 1.2,
        y: 0.82,
        w: 3.4,
        h: 1.275,
      });
    }
  }

  // Main Title (Well within 13.33" width and 7.5" height)
  titleSlide.addText(presTitle, {
    x: 1.2,
    y: 2.2,
    w: 10.93,
    h: 2.2,
    fontSize: 36,
    fontFace: activeTheme.fontFace || 'Arial',
    bold: true,
    color: activeTheme.titleColor,
    valign: 'middle',
    wrap: true,
  });

  // Subtitle (if available)
  if (presSubtitle) {
    titleSlide.addText(presSubtitle, {
      x: 1.2,
      y: 4.6,
      w: 10.93,
      h: 1.6,
      fontSize: 18,
      fontFace: activeTheme.fontFace || 'Arial',
      color: activeTheme.subtitleColor,
      valign: 'top',
      wrap: true,
    });
  }

  // Watermark on Title Slide if free/anonymous
  if (showWatermark) {
    addWatermarkToSlide(titleSlide, activeTheme, iconDataUrl);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. CONTENT SLIDES (Calibrated Margins, Auto Word-Wrap, Zero Overflow)
  // ─────────────────────────────────────────────────────────────
  const totalSlides = slides.length + 1; // +1 for title slide

  for (let idx = 0; idx < slides.length; idx++) {
    const slideData = slides[idx];
    const slideNumber = idx + 2;
    const slide = pres.addSlide();
    slide.background = { color: activeTheme.contentBg };

    // Slide Header (width: 11.33 fits safely inside 13.333 with 1.0 margin on both sides)
    slide.addText(slideData.title, {
      x: 1.0,
      y: 0.45,
      w: 11.33,
      h: 0.46,
      fontSize: 24,
      fontFace: activeTheme.fontFace || 'Arial',
      bold: true,
      color: activeTheme.contentTitleColor,
      valign: 'top',
      wrap: true,
      margin: 0,
    });

    // Accent Line right under title (width: 1.35 matches web clamp(60px, 7.5cqw, 130px))
    slide.addShape(pres.ShapeType.rect, {
      x: 1.0,
      y: 0.98,
      w: 1.35,
      h: 0.04,
      fill: { color: activeTheme.accentColor },
      line: { color: activeTheme.accentColor, width: 0 },
    });

    let currentY = 1.18;

    // Optional Logo / Placeholder on Content Slide (genuine picture element for "Change Picture" in PPT)
    if (slideData.hasLogoPlaceholder || !!slideData.logoUrl) {
      let cleanLogoData: string | null = null;
      if (slideData.logoUrl) {
        const fetched = await fetchImageAsDataUrl(slideData.logoUrl);
        if (fetched) cleanLogoData = fetched.replace(/^data:/, '');
      }
      if (!cleanLogoData && options?.fallbackLogoUrl) {
        const fetchedFallback = await fetchImageAsDataUrl(options.fallbackLogoUrl);
        if (fetchedFallback) cleanLogoData = fetchedFallback.replace(/^data:/, '');
      }
      if (!cleanLogoData && slideData.hasLogoPlaceholder) {
        const logoDataUrl = getLogoPlaceholderDataUrl(activeTheme, slideData.logoPlaceholderText);
        cleanLogoData = logoDataUrl.replace(/^data:/, '');
      }
      if (cleanLogoData) {
        slide.addImage({
          data: cleanLogoData,
          x: 1.0,
          y: currentY,
          w: 3.4,
          h: 1.275,
        });
        currentY += 1.42;
      }
    }

    // A. Render Table if present
    if (slideData.tableLines.length > 0) {
      const tableRows = buildPptxTable(slideData.tableLines);
      if (tableRows.length > 0) {
        slide.addTable(tableRows, {
          x: 1.0,
          y: currentY,
          w: 11.33,
          autoPage: false,
        });
        currentY += Math.min(4.2, tableRows.length * 0.42 + 0.4);
      }
    }

    const hasCode = !!slideData.codeSnippet && slideData.codeSnippet.code.length > 0;
    const hasBullets = slideData.bullets.length > 0;
    const hasParagraphs = slideData.paragraphs.length > 0;

    const cleanCode = hasCode ? slideData.codeSnippet!.code.trimEnd() : '';
    const badgeText = hasCode ? getSlideCodeBadge(slideData.codeSnippet!.language, cleanCode) : '';
    const isDiagram = badgeText === 'DIAGRAM';
    const codeLineCount = cleanCode.split('\n').length;

    // A slide uses Hero Layout (Full-width lead text + centered wide card) when:
    // 1. It has 0 bullets (text is an introductory subtitle/lead-in for the code/diagram)
    // 2. OR it is a tall architecture diagram (>14 lines) with sparse bullets (<=1 bullet)
    const isHeroCodeLayout = hasCode && (
      !hasBullets ||
      (isDiagram && codeLineCount > 14 && slideData.bullets.length <= 1)
    );
    const isSplitLayout = hasCode && !isHeroCodeLayout && (hasBullets || hasParagraphs);

    if (isHeroCodeLayout) {
      // ─────────────────────────────────────────────────────────
      // Hero Full-Width Code / Architecture Diagram Layout (1:1 with web preview)
      // ─────────────────────────────────────────────────────────
      if (hasParagraphs && currentY < 6.0) {
        const leadText = slideData.paragraphs.slice(0, 2).join('\n\n');
        const leadH = Math.min(0.55, slideData.paragraphs.length * 0.30 + 0.08);
        slide.addText(leadText, {
          x: 1.0,
          y: currentY,
          w: 11.33,
          h: leadH,
          fontSize: 13.5,
          fontFace: activeTheme.fontFace || 'Arial',
          color: activeTheme.bodyColor,
          valign: 'top',
          lineSpacing: 18,
          wrap: true,
          margin: 0,
        });
        currentY += leadH + 0.12;
      } else if (hasBullets && slideData.bullets.length === 1 && currentY < 6.0) {
        slide.addText(slideData.bullets[0], {
          x: 1.0,
          y: currentY,
          w: 11.33,
          h: 0.36,
          fontSize: 13,
          fontFace: activeTheme.fontFace || 'Arial',
          color: activeTheme.bodyColor,
          valign: 'top',
          wrap: true,
          margin: 0,
        });
        currentY += 0.42;
      }

      // For ASCII diagrams, strip artificial uniform indentation to restore true column 0
      const normalizedCode = isDiagram ? stripCommonIndentation(cleanCode) : cleanCode;

      // Adaptive typography, vertical containment, and card geometry (full-width: isTwoColumn = false)
      const layout = calculateAdaptiveCodeLayout(normalizedCode, isDiagram, currentY, false);
      const codeCardH = layout.codeCardH;
      const topOffset = layout.topOffset;
      const cardBg = activeTheme.isLight ? '0F172A' : '090D16';
      const headerBg = activeTheme.isLight ? '1E293B' : '111827';
      const cardBorder = activeTheme.isLight ? '334155' : '1E293B';
      const langColor = activeTheme.accentColor || '38BDF8';

      const rawLines = normalizedCode.split('\n');
      const maxLineChars = Math.max(...rawLines.map(l => l.length), 30);
      const charWidthInches = (layout.codeFontSize * 0.55) / 72;
      const textWidth = maxLineChars * charWidthInches;

      // Adapt card width: For diagrams, wrap the content with minimal, balanced padding rather than full-slide width
      const hPadding = isDiagram ? 0.42 : 0.24;
      const cardW = isDiagram
        ? Math.min(11.33, Math.max(3.8, textWidth + (hPadding * 2)))
        : 11.33;
      const cardX = 1.0 + (11.33 - cardW) / 2;

      // 1. Container (Centered, fits diagram width with minimal padding)
      slide.addShape(pres.ShapeType.roundRect, {
        x: cardX,
        y: currentY,
        w: cardW,
        h: codeCardH,
        fill: { color: cardBg },
        line: { color: cardBorder, width: 1 },
        rectRadius: 0.08,
      });

      // 2. Header Bar
      slide.addShape(pres.ShapeType.roundRect, {
        x: cardX,
        y: currentY,
        w: cardW,
        h: 0.38,
        fill: { color: headerBg },
        line: { color: cardBorder, width: 0.5 },
        rectRadius: 0.06,
      });

      slide.addShape(pres.ShapeType.rect, {
        x: cardX,
        y: currentY + 0.38,
        w: cardW,
        h: 0.015,
        fill: { color: cardBorder },
        line: { color: cardBorder, width: 0 },
      });

      // 3. Language / Diagram Badge
      slide.addText(badgeText, {
        x: cardX + 0.20,
        y: currentY + 0.04,
        w: Math.max(1.6, cardW - 0.90),
        h: 0.30,
        fontSize: 10,
        fontFace: 'Arial',
        bold: true,
        color: langColor,
        valign: 'middle',
      });

      // 4. macOS Traffic-Light Window Dots (Right-aligned in card)
      slide.addShape(pres.ShapeType.ellipse, {
        x: cardX + cardW - 0.64,
        y: currentY + 0.13,
        w: 0.12,
        h: 0.12,
        fill: { color: 'EF4444' },
        line: { color: 'EF4444', width: 0 },
      });
      slide.addShape(pres.ShapeType.ellipse, {
        x: cardX + cardW - 0.44,
        y: currentY + 0.13,
        w: 0.12,
        h: 0.12,
        fill: { color: 'F59E0B' },
        line: { color: 'F59E0B', width: 0 },
      });
      slide.addShape(pres.ShapeType.ellipse, {
        x: cardX + cardW - 0.24,
        y: currentY + 0.13,
        w: 0.12,
        h: 0.12,
        fill: { color: '10B981' },
        line: { color: '10B981', width: 0 },
      });

      // 5. Code Content: Centered inside card with minimal balanced gap from all sides
      const textX = isDiagram ? cardX + (cardW - textWidth) / 2 : 1.24;
      const textW = isDiagram ? Math.min(cardW - 0.10, textWidth + 0.10) : 10.85;

      slide.addText(normalizedCode, {
        x: textX,
        y: currentY + topOffset,
        w: textW,
        h: Math.min(layout.actualTextH + 0.05, codeCardH - topOffset - 0.05),
        fontSize: layout.codeFontSize,
        fontFace: 'Consolas',
        color: 'E2E8F0',
        valign: 'top',
        align: 'left',
        lineSpacing: layout.lineSpacingVal,
        margin: 0,
        paraSpaceBefore: 0,
        paraSpaceAfter: 0,
        wrap: false,
      });

      currentY += codeCardH;
    } else if (isSplitLayout) {
      // ─────────────────────────────────────────────────────────
      // Two-Column Technical Layout: Text/Bullets on Left, Code Card on Right
      // ─────────────────────────────────────────────────────────
      let leftColY = currentY;

      // 1. Left Column: Paragraphs
      if (hasParagraphs) {
        const pText = slideData.paragraphs.slice(0, 3).join('\n\n');
        slide.addText(pText, {
          x: 1.0,
          y: leftColY,
          w: 5.1,
          h: Math.min(2.0, 6.2 - leftColY),
          fontSize: 13,
          fontFace: activeTheme.fontFace || 'Arial',
          color: activeTheme.bodyColor,
          valign: 'top',
          lineSpacing: 18,
          wrap: true,
        });
        leftColY += Math.min(1.8, slideData.paragraphs.length * 0.4 + 0.2);
      }

      // 2. Left Column: Bullets
      if (hasBullets && leftColY < 6.2) {
        const maxBullets = leftColY > 3.0 ? 4 : 6;
        const bulletItems = slideData.bullets.slice(0, maxBullets).map(b => ({
          text: b,
          options: {
            bullet: true,
            fontSize: 13,
            fontFace: activeTheme.fontFace || 'Arial',
            color: activeTheme.bodyColor,
            breakLine: true,
          },
        }));

        slide.addText(bulletItems, {
          x: 1.0,
          y: leftColY,
          w: 5.1,
          h: Math.min(4.2, 6.4 - leftColY),
          valign: 'top',
          lineSpacing: 20,
          wrap: true,
        });
      }

      // 3. Right Column: Dedicated Modern IDE Code Card (1:1 match with web preview)
      // Adaptive typography, vertical containment, and card geometry
      const splitNormalizedCode = isDiagram ? stripCommonIndentation(cleanCode) : cleanCode;
      const layout = calculateAdaptiveCodeLayout(splitNormalizedCode, isDiagram, currentY, true);
      const codeCardH = layout.codeCardH;
      const topOffset = layout.topOffset;
      const cardBg = activeTheme.isLight ? '0F172A' : '090D16';
      const headerBg = activeTheme.isLight ? '1E293B' : '111827';
      const cardBorder = activeTheme.isLight ? '334155' : '1E293B';
      const langColor = activeTheme.accentColor || '38BDF8';

      // 1. Code Card Main Container
      slide.addShape(pres.ShapeType.roundRect, {
        x: 6.5,
        y: currentY,
        w: 5.8,
        h: codeCardH,
        fill: { color: cardBg },
        line: { color: cardBorder, width: 1 },
        rectRadius: 0.08,
      });

      // 2. Header Bar Strip (with subtle bottom border line)
      slide.addShape(pres.ShapeType.roundRect, {
        x: 6.5,
        y: currentY,
        w: 5.8,
        h: 0.38,
        fill: { color: headerBg },
        line: { color: cardBorder, width: 0.5 },
        rectRadius: 0.06,
      });

      slide.addShape(pres.ShapeType.rect, {
        x: 6.5,
        y: currentY + 0.38,
        w: 5.8,
        h: 0.015,
        fill: { color: cardBorder },
        line: { color: cardBorder, width: 0 },
      });

      // 3. Language / Diagram Badge (Left aligned in header bar)
      slide.addText(badgeText, {
        x: 6.72,
        y: currentY + 0.04,
        w: 3.5,
        h: 0.30,
        fontSize: 9.5,
        fontFace: 'Arial',
        bold: true,
        color: langColor,
        valign: 'middle',
      });

      // 4. macOS Traffic-Light Window Dots (Right aligned in header bar)
      slide.addShape(pres.ShapeType.ellipse, {
        x: 11.60,
        y: currentY + 0.13,
        w: 0.12,
        h: 0.12,
        fill: { color: 'EF4444' },
        line: { color: 'EF4444', width: 0 },
      });
      slide.addShape(pres.ShapeType.ellipse, {
        x: 11.80,
        y: currentY + 0.13,
        w: 0.12,
        h: 0.12,
        fill: { color: 'F59E0B' },
        line: { color: 'F59E0B', width: 0 },
      });
      slide.addShape(pres.ShapeType.ellipse, {
        x: 12.00,
        y: currentY + 0.13,
        w: 0.12,
        h: 0.12,
        fill: { color: '10B981' },
        line: { color: '10B981', width: 0 },
      });

      // 5. Monospace Code / Diagram Content (Strictly clamped within card boundaries)
      slide.addText(splitNormalizedCode, {
        x: 6.72,
        y: currentY + topOffset,
        w: 5.38,
        h: Math.min(layout.actualTextH + 0.05, codeCardH - topOffset - 0.05),
        fontSize: layout.codeFontSize,
        fontFace: 'Consolas',
        color: 'E2E8F0',
        valign: 'top',
        lineSpacing: layout.lineSpacingVal,
        margin: 0,
        paraSpaceBefore: 0,
        paraSpaceAfter: 0,
        wrap: !isDiagram,
      });

      currentY += Math.max(codeCardH, leftColY - currentY);
    } else {
      // ─────────────────────────────────────────────────────────
      // Standard Layout (No Code): Paragraphs & Full-Width Bullets
      // ─────────────────────────────────────────────────────────

      if (slideData.paragraphs.length > 0 && currentY < 6.2) {
        const bodyText = slideData.paragraphs.slice(0, 6).join('\n\n');
        const maxParagraphHeight = hasBullets
          ? Math.min(2.2, 6.2 - currentY - 1.2)
          : Math.min(4.6, 6.4 - currentY);

        slide.addText(bodyText, {
          x: 1.0,
          y: currentY,
          w: 11.33,
          h: maxParagraphHeight,
          fontSize: 14,
          fontFace: activeTheme.fontFace || 'Arial',
          color: activeTheme.bodyColor,
          valign: 'top',
          lineSpacing: 22,
          wrap: true,
        });

        currentY += Math.min(maxParagraphHeight, slideData.paragraphs.length * 0.45 + 0.3);
      }

      if (slideData.bullets.length > 0 && currentY < 6.2) {
        const maxBullets = currentY > 3.6 ? 4 : 7;
        const bulletItems = slideData.bullets.slice(0, maxBullets).map(b => ({
          text: b,
          options: {
            bullet: true,
            fontSize: 14,
            fontFace: activeTheme.fontFace || 'Arial',
            color: activeTheme.bodyColor,
            breakLine: true,
          },
        }));

        slide.addText(bulletItems, {
          x: 1.0,
          y: currentY,
          w: 11.33,
          h: Math.min(4.6, 6.4 - currentY),
          valign: 'top',
          lineSpacing: 24,
          wrap: true,
        });
        currentY += Math.min(4.0, slideData.bullets.length * 0.5);
      }
    }

    // Slide Number & Watermark
    if (showWatermark) {
      // 1. Watermark tucked into the bottom-right corner
      addWatermarkToSlide(slide, activeTheme, iconDataUrl);

      // 2. Slide Number on the right side, directly above the watermark
      slide.addText(`${slideNumber} of ${totalSlides}`, {
        x: 11.95,
        y: 6.72,
        w: 1.30,
        h: 0.28,
        fontSize: 10,
        fontFace: activeTheme.fontFace || 'Arial',
        color: activeTheme.isLight ? '94A3B8' : '64748B',
        align: 'left',
      });
    } else {
      // Standard paid layout: Slide Number on bottom right, no watermark
      slide.addText(`${slideNumber} of ${totalSlides}`, {
        x: 11.2,
        y: 7.10,
        w: 1.9,
        h: 0.28,
        fontSize: 10,
        fontFace: activeTheme.fontFace || 'Arial',
        color: activeTheme.isLight ? '94A3B8' : '64748B',
        align: 'right',
      });
    }
  }

  const blobOutput = await pres.write({ outputType: 'blob' });
  // pptxgenjs internally generates the container using JSZip, which defaults the Blob MIME type to 'application/zip'.
  // On mobile browsers (especially Android Chrome and Samsung Internet), Android's DownloadManager sniffs the
  // Blob's MIME type. Seeing 'application/zip' mismatched with a '.pptx' extension, Android automatically appends
  // '.zip' to the downloaded filename (resulting in '[name].pptx.zip'), which prompts the phone to open it as a zip archive.
  // Re-wrapping the blob with the official OpenXML PresentationML MIME type ensures mobile browsers download
  // it strictly as '.pptx' and open it directly in PowerPoint / Office viewers.
  return new Blob([blobOutput as Blob], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

/**
 * Detects whether markdown content represents an intentional presentation slide deck
 * strictly avoiding false positives on general documents, tutorials, or guides that use horizontal dividers (`---`).
 */
export function isPresentationMarkdown(markdown: string): boolean {
  if (!markdown || markdown.trim().length < 40) return false;

  const clean = markdown.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Explicit theme directive: <!-- theme: modernLight --> etc.
  //    This is the strongest signal — the AI deliberately inserted a theme tag.
  if (/<!--\s*theme:\s*[a-zA-Z0-9_-]+\s*-->/i.test(clean)) {
    return true;
  }

  // 2. Explicit slide markers: e.g. "Slide 1:", "Slide 2:", "## Slide 1", "### Slide 2", "Title Slide"
  //    Only count lines that BEGIN with a heading marker or bold and contain "Slide N" — NOT mentions
  //    of "slide" in conversational prose (e.g. "you can change the last slide").
  const slideHeaderCount = lines.filter(l =>
    /^(#{1,4}\s+|\*\*|\[)?(Slide\s+\d+|[0-9]+\.\s+Slide\b|Title\s*Slide)/i.test(l)
  ).length;
  if (slideHeaderCount >= 3) return true;

  // 3. Count true markdown horizontal dividers (---, ***, ___)
  const dividerCount = lines.filter(l => /^[-*_]{3,}$/.test(l)).length;

  // Combined slide header with dividers — require at least 2 dividers to prevent
  // a conversational response that references "Slide 1" once + has a single `---` from
  // being detected. A real presentation has multiple slides separated by dividers.
  if (slideHeaderCount >= 2 && dividerCount >= 2) {
    const parsed = parseMarkdownToSlides(clean);
    if (parsed.slides.length >= 2) return true;
  }

  // 4. Dividers (>= 2) with explicit presentation / slide vocabulary AND structural validation.
  //    A real slide deck has: (a) a `# Title` heading near the top, (b) `---` dividers separating
  //    content sections with `## / ###` headings, (c) the parsed result has real slides.
  //    A conversational response merely MENTIONING "presentation" won't have this structure.
  const hasPresentationKeywords =
    /\b(presentation|slide\s*deck|slides?\s+on\b|slide-by-slide|powerpoint|\.pptx|presentation\s+carousel)\b|প্রেজেন্টেশন|স্লাইড|प्रेजेंटेशन|स्लाइड|presentaci[oó]n/i.test(clean);

  if (hasPresentationKeywords && dividerCount >= 2) {
    // Structural check: content must have a `# Title` heading (level 1) near the top
    // followed by actual slide sections with headings after dividers.
    const hasTitleHeading = lines.some((l, idx) => idx < 10 && /^#\s+/.test(l) && !/^##/.test(l));
    const hasSlideHeadingsAfterDividers = lines.some((l, idx) => {
      if (!/^#{2,4}\s+/.test(l)) return false;
      // Check if there's a divider somewhere before this heading
      return lines.slice(0, idx).some(prev => /^[-*_]{3,}$/.test(prev));
    });

    if (hasTitleHeading && hasSlideHeadingsAfterDividers) {
      const parsed = parseMarkdownToSlides(clean);
      const totalSlideCount = (parsed.title ? 1 : 0) + parsed.slides.length;
      if (totalSlideCount >= 2) return true;
    }
  }

  return false;
}


export interface SlideDeckItem {
  id: string;
  isTitleSlide: boolean;
  slideNumber: number;
  title: string;
  subtitle?: string;
  bullets: string[];
  paragraphs: string[];
  tableLines: string[];
  codeSnippet?: SlideCodeSnippet;
  hasLogoPlaceholder?: boolean;
  logoPlaceholderText?: string;
  logoUrl?: string;
}

export interface SlideDeckData {
  title: string;
  subtitle: string;
  slides: SlideDeckItem[];
  totalSlides: number;
  theme: PresentationTheme;
}

/**
 * Extracts a complete structured SlideDeckData object for interactive slide viewers
 */
export function extractSlideDeck(
  markdown: string,
  fallbackTitle?: string,
  preferredTheme?: PresentationTheme | string
): SlideDeckData | null {
  if (!isPresentationMarkdown(markdown)) return null;

  const parsed = parseMarkdownToSlides(markdown, fallbackTitle);
  if (!parsed.slides || parsed.slides.length === 0) return null;

  const activeTheme: PresentationTheme =
    typeof preferredTheme === 'object' && preferredTheme?.coverBg
      ? preferredTheme
      : typeof preferredTheme === 'string' && PRESENTATION_THEMES[preferredTheme]
      ? PRESENTATION_THEMES[preferredTheme]
      : detectThemeFromMarkdown(markdown);

  const slideItems: SlideDeckItem[] = [
    {
      id: 'slide-1',
      isTitleSlide: true,
      slideNumber: 1,
      title: parsed.title,
      subtitle: parsed.subtitle || '',
      bullets: [],
      paragraphs: [],
      tableLines: [],
      hasLogoPlaceholder: parsed.hasTitleLogo,
      logoPlaceholderText: parsed.titleLogoText,
      logoUrl: parsed.titleLogoUrl,
    },
    ...parsed.slides.map((s, idx) => ({
      id: `slide-${idx + 2}`,
      isTitleSlide: false,
      slideNumber: idx + 2,
      title: s.title,
      bullets: s.bullets || [],
      paragraphs: s.paragraphs || [],
      tableLines: s.tableLines || [],
      codeSnippet: s.codeSnippet,
      hasLogoPlaceholder: s.hasLogoPlaceholder,
      logoPlaceholderText: s.logoPlaceholderText,
      logoUrl: s.logoUrl,
    })),
  ];

  if (slideItems.length < 2) return null;

  return {
    title: parsed.title,
    subtitle: parsed.subtitle || '',
    slides: slideItems,
    totalSlides: slideItems.length,
    theme: activeTheme,
  };
}

export interface PresentationSegmentText {
  type: 'text';
  content: string;
}

export interface PresentationSegmentDeck {
  type: 'presentation';
  slideDeck: SlideDeckData;
  rawMarkdown: string;
  title: string;
}

export type PresentationSegment = PresentationSegmentText | PresentationSegmentDeck;

export interface PresentationSplitResult {
  hasPresentation: boolean;
  topText: string;
  slideDeck: SlideDeckData | null;
  slideOutline: string;
  bottomText: string;
  segments: PresentationSegment[];
}

/**
 * Splits assistant message content for a single presentation deck (scanning from the end).
 */
export function splitSinglePresentation(
  markdown: string,
  fallbackTitle?: string,
  preferredTheme?: PresentationTheme | string
): PresentationSplitResult {
  if (!isPresentationMarkdown(markdown)) {
    return {
      hasPresentation: false,
      topText: markdown,
      slideDeck: null,
      slideOutline: '',
      bottomText: '',
      segments: [{ type: 'text', content: markdown }],
    };
  }

  const initialDeck = extractSlideDeck(markdown, fallbackTitle, preferredTheme);
  if (!initialDeck || initialDeck.slides.length < 2) {
    return {
      hasPresentation: false,
      topText: markdown,
      slideDeck: null,
      slideOutline: '',
      bottomText: '',
      segments: [{ type: 'text', content: markdown }],
    };
  }

  // Clean thinking tags and normalize line endings
  const cleanMd = markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\r\n/g, '\n');

  const lines = cleanMd.split('\n');

  // 1. Locate the last slide's title line (lastSlideLineIdx)
  const lastSlide = initialDeck.slides[initialDeck.slides.length - 1];
  const cleanLastTitle = lastSlide?.title ? lastSlide.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
  let lastSlideLineIdx = -1;

  if (cleanLastTitle) {
    // Scan backwards from the end of the lines to find the last slide heading
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      const cleanLine = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const isHeading =
        /^#{1,4}\s+/i.test(trimmed) ||
        /^(slide\s*\d+|title\s*slide)/i.test(trimmed) ||
        /^\*\*(?:slide\s*\d+|.*)\*\*$/i.test(trimmed) ||
        (cleanLine === cleanLastTitle && cleanLine.length >= 3);
      if (
        (cleanLine.includes(cleanLastTitle) || (cleanLine.length >= 4 && cleanLastTitle.includes(cleanLine))) &&
        isHeading &&
        !isPostPresentationBoundary(trimmed)
      ) {
        lastSlideLineIdx = i;
        break;
      }
    }
  }

  // Fallback 1: Scan backwards for earlier slide titles in reverse order
  if (lastSlideLineIdx === -1 && initialDeck.slides.length > 1) {
    for (let sIdx = initialDeck.slides.length - 2; sIdx >= 0; sIdx--) {
      const sTitle = initialDeck.slides[sIdx]?.title?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || '';
      if (!sTitle) continue;
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        const cleanLine = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const isHeading =
          /^#{1,4}\s+/i.test(trimmed) ||
          /^(slide\s*\d+|title\s*slide)/i.test(trimmed) ||
          /^\*\*(?:slide\s*\d+|.*)\*\*$/i.test(trimmed) ||
          (cleanLine === sTitle && cleanLine.length >= 3);
        if (
          (cleanLine.includes(sTitle) || (cleanLine.length >= 4 && sTitle.includes(cleanLine))) &&
          isHeading &&
          !isPostPresentationBoundary(trimmed)
        ) {
          lastSlideLineIdx = i;
          break;
        }
      }
      if (lastSlideLineIdx !== -1) break;
    }
  }

  // Fallback 2: If not found by cleanLastTitle, look for slide number pattern (e.g. Slide 6 or 6.)
  if (lastSlideLineIdx === -1 && initialDeck.slides.length > 1) {
    const totalSlides = initialDeck.slides.length;
    const slideNumRegex = new RegExp(`^(?:#{1,4}\\s+)?(?:slide\\s*0*${totalSlides}|0*${totalSlides}\\.\\s*)`, 'i');
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (slideNumRegex.test(trimmed) && !isPostPresentationBoundary(trimmed)) {
        lastSlideLineIdx = i;
        break;
      }
    }
  }

  // Fallback 3: Look backwards for the last explicit heading line in the file
  if (lastSlideLineIdx === -1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (
        (/^#{1,4}\s+/i.test(trimmed) || /^(slide\s*\d+|title\s*slide)/i.test(trimmed)) &&
        !isPostPresentationBoundary(trimmed)
      ) {
        lastSlideLineIdx = i;
        break;
      }
    }
  }

  // 2. Find where the slide deck starts (slideStartIndex)
  // Scan backwards from lastSlideLineIdx to locate the title slide or opening divider
  let slideStartIndex = 0;
  const firstSlideTitle = initialDeck.title ? initialDeck.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
  const firstSlideItemTitle = initialDeck.slides[0]?.title ? initialDeck.slides[0].title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
  const searchStartFrom = lastSlideLineIdx !== -1 ? lastSlideLineIdx : lines.length - 1;

  for (let i = searchStartFrom - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const cleanLine = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

    // A. Explicit theme directive immediately preceding the title slide
    if (/^<!--\s*theme:\s*[a-zA-Z0-9_-]+\s*-->/i.test(trimmed)) {
      slideStartIndex = i;
      break;
    }

    // B. Main title heading (# Title, or Title Slide, or Slide 1)
    const isHeading =
      /^#\s+/i.test(trimmed) ||
      /^#{1,4}\s*(slide\s*0*1\b|title\s*slide)/i.test(trimmed);
    const isMatchingTitle =
      (firstSlideTitle && (cleanLine.includes(firstSlideTitle) || (cleanLine.length >= 3 && firstSlideTitle.includes(cleanLine)))) ||
      (firstSlideItemTitle && (cleanLine.includes(firstSlideItemTitle) || (cleanLine.length >= 3 && firstSlideItemTitle.includes(cleanLine))));

    const matchesExplicitTitle = firstSlideTitle
      ? (isMatchingTitle || /^#\s+/i.test(trimmed))
      : (isMatchingTitle || /^#{1,4}\s*(slide\s*0*1\b|title\s*slide)/i.test(trimmed) || /^#\s+/i.test(trimmed));

    if (isHeading && matchesExplicitTitle) {
      slideStartIndex = i;

      // Check if preceding non-empty lines include a theme directive, divider, or logo image.
      // Skip over image lines (![...](...)  ) and subtitle lines (## ...) that may sit
      // between the theme directive and the # Title heading.
      for (let j = i - 1; j >= 0; j--) {
        const prevTrimmed = lines[j].trim();
        if (!prevTrimmed) continue;
        if (/^<!\-\-\s*theme:/i.test(prevTrimmed)) {
          slideStartIndex = j;
          break;
        }
        if (/^[-*_]{3,}$/.test(prevTrimmed)) {
          slideStartIndex = j;
          // Check one more level up for theme directive
          for (let k = j - 1; k >= 0; k--) {
            const beforeDivider = lines[k].trim();
            if (!beforeDivider) continue;
            if (/^<!\-\-\s*theme:/i.test(beforeDivider)) {
              slideStartIndex = k;
            }
            break;
          }
          break;
        }
        // Skip markdown images (![Logo](...)) or logo placeholder lines that sit between theme and title
        if (isLogoPlaceholderLine(prevTrimmed)) {
          slideStartIndex = j; // Include image in slide area
          continue; // Keep scanning upward for theme directive
        }
        break; // Hit non-theme, non-image, non-divider content → stop
      }
      break;
    }
  }

  // Forward fallback for slideStartIndex if backward scan didn't hit an explicit title heading
  if (slideStartIndex === 0) {
    for (let i = 0; i < searchStartFrom; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      if (/^<!--\s*theme:/i.test(trimmed)) {
        slideStartIndex = i;
        break;
      }
      const isHeading = /^#\s+/i.test(trimmed) || /^#{1,4}\s*(slide\s*0*1\b|title\s*slide)/i.test(trimmed);
      const cleanLine = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (
        isHeading &&
        (firstSlideTitle ? (cleanLine.includes(firstSlideTitle) || firstSlideTitle.includes(cleanLine)) : true)
      ) {
        slideStartIndex = i;
        break;
      }
    }
  }

  const searchFrom = lastSlideLineIdx !== -1 ? lastSlideLineIdx : slideStartIndex;
  let slideEndIndex = lines.length;
  let inCodeFence = false;

  for (let i = searchFrom + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip empty lines between slide elements
    if (!trimmed) continue;

    // 1. Post-presentation boundary (Mermaid, ASCII preview, Word/PDF doc, or download guide)
    if (!inCodeFence && isPostPresentationBoundary(trimmed)) {
      slideEndIndex = i;
      break;
    }

    // 2. Track code fence inside slide (e.g. ```python ... ```)
    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      continue;
    }

    // 3. Slide images or logo placeholder markers (e.g. ![Logo](url), [PLACE LOGO HERE], PLACE LOGO HERE, <img...>)
    if (
      isLogoPlaceholderLine(trimmed) ||
      /^<(?:center|div|p)\b/i.test(trimmed)
    ) {
      continue;
    }

    // 4. Slide content elements:
    // - Bullet points: "- point", "* point", "+ point", "• point", "1. point"
    if (/^[-*+•◦▪▫–—]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      continue;
    }

    // - Table row: "| col | col |"
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      continue;
    }

    // - Blockquote: "> quote"
    if (trimmed.startsWith('>')) {
      continue;
    }

    // - Slide comment or theme directive: "<!-- ... -->"
    if (trimmed.startsWith('<!--')) {
      continue;
    }

    const cleanLine = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

    // - Slide paragraphs parsed as part of initialDeck
    const isSlideParagraph = initialDeck?.slides?.some(s =>
      s.paragraphs?.some(p => {
        const cleanP = p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        return cleanP && (cleanLine.includes(cleanP) || cleanP.includes(cleanLine));
      })
    );
    if (isSlideParagraph) {
      continue;
    }

    // - Known bullet from the parsed deck (CRITICAL: NEVER break if this line is a parsed bullet!)
    const isKnownBullet = initialDeck?.slides?.some(s =>
      s.bullets?.some(b => {
        const cleanB = b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        return cleanB && (cleanLine.includes(cleanB) || cleanB.includes(cleanLine));
      })
    );
    if (isKnownBullet) {
      continue;
    }

    // - Known slide heading from the parsed deck (in case searchFrom was an earlier slide)
    const isKnownSlideTitle = initialDeck?.slides?.some(s => {
      const cleanTitle = s.title?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || '';
      return cleanTitle && (cleanLine.includes(cleanTitle) || cleanTitle.includes(cleanLine));
    });
    if (isKnownSlideTitle) {
      continue;
    }

    // 5. Divider line (---, ***, ___)
    // Only terminate on a divider if there are NO further slides or known bullets remaining below it!
    if (/^[-*_]{3,}$/.test(trimmed)) {
      const remainingLines = lines.slice(i + 1);
      const hasFurtherSlideContent = initialDeck?.slides?.some(s => {
        const sTitle = s.title?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || '';
        return sTitle && remainingLines.some(rl => rl.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').includes(sTitle));
      });
      if (!hasFurtherSlideContent) {
        slideEndIndex = i;
        break;
      } else {
        continue;
      }
    }

    // 6. Line is outside code fence, not a divider, not a bullet/table/blockquote/slide comment/image,
    // and not a recognized slide element from initialDeck.
    // This means the slide deck has ended, and conversational text / subsequent responses begin here!
    slideEndIndex = i;
    break;
  }

  // Extract raw sections
  let topText = lines.slice(0, slideStartIndex).join('\n').trim();
  // NOTE: Do NOT strip theme directives from topText here — topText is reused
  // by the multi-presentation loop in splitPresentationContent. Cleanup happens
  // at the final output stage (see splitPresentationContent).

  let slideOutline = lines.slice(slideStartIndex, slideEndIndex).join('\n').trim();
  slideOutline = slideOutline.replace(/[-*_]{3,}\s*$/, '').trim();
  // NOTE: Do NOT strip theme directives from slideOutline here — extractSlideDeck
  // needs them for theme detection. Cleanup happens after deck extraction below.

  let bottomTextLines = lines.slice(slideEndIndex);
  if (bottomTextLines.length > 0 && /^[-*_]{3,}$/.test(bottomTextLines[0].trim())) {
    bottomTextLines = bottomTextLines.slice(1);
  }
  let bottomText = bottomTextLines.join('\n').trim();
  bottomText = bottomText.replace(/<!--\s*theme:[\s\S]*?-->/gi, '').trim();

  // CRITICAL: Extract slide deck from the ISOLATED slideOutline, NOT from the full multi-presentation markdown!
  const isolatedDeck = extractSlideDeck(slideOutline, fallbackTitle, preferredTheme);
  const slideDeck = (isolatedDeck && isolatedDeck.slides && isolatedDeck.slides.length >= 2)
    ? isolatedDeck
    : initialDeck;

  // NOW strip theme directives from the visible slideOutline (after deck extraction has consumed them)
  slideOutline = slideOutline.replace(/<!--\s*theme:[\s\S]*?-->/gi, '').trim();

  const segments: PresentationSegment[] = [];
  if (topText) {
    segments.push({ type: 'text', content: topText });
  }
  segments.push({
    type: 'presentation',
    slideDeck,
    rawMarkdown: slideOutline,
    title: slideDeck.title || cleanFallbackTitle(fallbackTitle) || 'Presentation',
  });
  if (bottomText) {
    segments.push({ type: 'text', content: bottomText });
  }

  return {
    hasPresentation: true,
    topText,
    slideDeck,
    slideOutline,
    bottomText,
    segments,
  };
}

/**
 * Splits assistant message content into structured presentation segments and text guidance.
 * Fully supports MULTIPLE presentation decks within the same conversation, ensuring every deck
 * is extracted as its own standalone SlideDeckData without merging slide counts or dumping previous
 * presentations as raw markdown text.
 */
export function splitPresentationContent(
  markdown: string,
  fallbackTitle?: string,
  preferredTheme?: PresentationTheme | string
): PresentationSplitResult {
  if (!isPresentationMarkdown(markdown)) {
    return {
      hasPresentation: false,
      topText: markdown,
      slideDeck: null,
      slideOutline: '',
      bottomText: '',
      segments: [{ type: 'text', content: markdown }],
    };
  }

  // Extract all presentations iteratively from bottom up
  interface ExtractedDeck {
    deck: SlideDeckData;
    outline: string;
    bottomText: string;
    title: string;
  }

  const decksReversed: ExtractedDeck[] = [];
  let currentMarkdown = markdown;
  let remainingTopText = '';
  let iterations = 0;
  const MAX_DECKS = 10;

  while (isPresentationMarkdown(currentMarkdown) && iterations < MAX_DECKS) {
    iterations++;
    const split = splitSinglePresentation(currentMarkdown, fallbackTitle, preferredTheme);
    if (!split.hasPresentation || !split.slideDeck) {
      break;
    }

    decksReversed.push({
      deck: split.slideDeck,
      outline: split.slideOutline,
      bottomText: split.bottomText,
      title: split.slideDeck.title || cleanFallbackTitle(fallbackTitle) || 'Presentation',
    });

    remainingTopText = split.topText;

    // Safety guard: stop if no topText remains or if topText didn't shrink
    if (!split.topText || split.topText.length >= currentMarkdown.length) {
      break;
    }
    currentMarkdown = split.topText;
  }

  if (decksReversed.length === 0) {
    return {
      hasPresentation: false,
      topText: markdown,
      slideDeck: null,
      slideOutline: '',
      bottomText: '',
      segments: [{ type: 'text', content: markdown }],
    };
  }

  // Put in chronological order (oldest first, newest last)
  const decksChronological = [...decksReversed].reverse();
  const segments: PresentationSegment[] = [];

  if (remainingTopText.trim()) {
    segments.push({
      type: 'text',
      content: remainingTopText.trim(),
    });
  }

  for (let i = 0; i < decksChronological.length; i++) {
    const item = decksChronological[i];
    segments.push({
      type: 'presentation',
      slideDeck: item.deck,
      rawMarkdown: item.outline,
      title: item.title,
    });

    if (item.bottomText.trim()) {
      segments.push({
        type: 'text',
        content: item.bottomText.trim(),
      });
    }
  }

  // The latest (most recent) deck for backwards compatibility with single-deck consumers
  const latest = decksReversed[0];

  // Final cleanup: strip presentation metadata (theme directives, standalone images, logo placeholder markers)
  // from text segments, topText, and bottomText. These are presentation control markers, NOT conversational text.
  const cleanPresentationMeta = (text: string): string =>
    text
      .replace(/<!--\s*theme:[\s\S]*?-->/gi, '') // theme directives
      .replace(/!\[.*?(?:logo|placeholder|brand|image|photo|screenshot).*?\](?:\([^)]*\))?/gi, '') // any brand/logo/image markdown image
      .replace(/!\[.*?\]\((?:https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/gi, '') // standalone markdown images
      .replace(/<img\b[^>]*>/gi, '') // HTML img tags
      .replace(/^\s*\[?(?:place|your)\s+(?:logo|image|picture|photo|screenshot)(?:\s+placeholder|\s+here)?\]?\s*$/gim, '')
      .replace(/^\s*\[[^\]]*(?:logo|brand\s*mark|image|photo|screenshot)\s+placeholder[^\]]*\]\s*$/gim, '')
      .replace(/^\s*!\s*(?:logo|image|placeholder)\b.*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const cleanedTopText = cleanPresentationMeta(remainingTopText);
  const cleanedOutline = latest.outline.replace(/<!--\s*theme:[\s\S]*?-->/gi, '').trim();

  // Clean text content in segments
  for (const seg of segments) {
    if (seg.type === 'text') {
      seg.content = cleanPresentationMeta(seg.content);
    }
  }
  // Remove empty text segments after cleanup
  const cleanedSegments = segments.filter(
    seg => seg.type !== 'text' || seg.content.trim().length > 0
  );

  return {
    hasPresentation: true,
    topText: cleanedTopText,
    slideDeck: latest.deck,
    slideOutline: cleanedOutline,
    bottomText: cleanPresentationMeta(latest.bottomText),
    segments: cleanedSegments,
  };
}




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
 * Returns a polished badge label for slide code snippets.
 * Specifically converts generic text/txt/code blocks containing ASCII flowcharts,
 * hierarchy trees, or box diagrams into a premium "DIAGRAM" label.
 */
export function getSlideCodeBadge(rawLang: string, code: string): string {
  const lang = (rawLang || '').toLowerCase().trim();
  if (['text', 'txt', 'plaintext', 'ascii', 'code', ''].includes(lang)) {
    // Check if code contains ASCII flowchart / box / hierarchy indicators
    const hasDiagramChars = /[\^|v\+\-]|\b\[.*?\]\b|-->|<--|\+--|==|--/.test(code);
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

  // 2. Numbered deliverable section header (e.g. "2. Mermaid Diagram", "## 2. Mermaid", "3. Image Preview (ASCII Visual)", "4. Word Document")
  const numberedMatch = trimmed.match(/^(?:#{1,4}\s+|\*{1,2}|_{1,2})?([2-9]|\d{2,})\.\s*(.+)$/);
  if (numberedMatch) {
    const titlePart = numberedMatch[2].toLowerCase();

    // If the numbered header explicitly refers to a separate format, deliverable, or guide
    if (
      titlePart.includes('mermaid') ||
      titlePart.includes('image preview') ||
      titlePart.includes('ascii') ||
      titlePart.includes('visual preview') ||
      titlePart.includes('diagram') ||
      titlePart.includes('flowchart') ||
      titlePart.includes('doc file') ||
      titlePart.includes('word document') ||
      titlePart.includes('docx') ||
      titlePart.includes('pdf') ||
      titlePart.includes('document version') ||
      titlePart.includes('download instructions') ||
      titlePart.includes('how to download') ||
      titlePart.includes('export instructions')
    ) {
      return true;
    }
  }

  // 3. Format-specific headings (e.g. "### Mermaid Diagram", "## Mermaid View", "### Image Preview (ASCII Visual)")
  if (/^#{1,4}\s+/.test(trimmed)) {
    if (
      lower.includes('mermaid') ||
      lower.includes('image preview') ||
      lower.includes('ascii visual') ||
      lower.includes('ascii preview') ||
      lower.includes('ascii diagram') ||
      lower.includes('ascii art') ||
      lower.includes('word document (.docx)') ||
      lower.includes('doc file') ||
      lower.includes('document export') ||
      lower.includes('full document text')
    ) {
      return true;
    }
  }

  // 4. Download / Outro guidance
  if (
    lower.startsWith('how to download') ||
    lower.startsWith('how to get your file') ||
    lower.startsWith('to download:') ||
    lower.startsWith('download instructions:') ||
    lower.startsWith('to change themes:') ||
    lower.startsWith('download your files:') ||
    lower.startsWith('which phase would you like') ||
    lower.startsWith('let me know if you would like') ||
    lower.startsWith('feel free to ask')
  ) {
    return true;
  }

  // Headings for download guidance (e.g. "### How to download your files:", "## Download Instructions")
  if (/^#{1,4}\s+/.test(trimmed)) {
    const headingText = trimmed.replace(/^#{1,4}\s+/, '').trim().toLowerCase();
    if (
      headingText.startsWith('how to download') ||
      headingText.startsWith('how to get your file') ||
      headingText.startsWith('to download') ||
      headingText.startsWith('download instructions') ||
      headingText.startsWith('download your files')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a block of text is conversational AI chat preamble/instructions or download guidance
 * rather than presentation slides.
 */
function isConversationalSection(lines: string[]): boolean {
  // If section contains a post-presentation boundary, it is NEVER a presentation slide
  if (lines.some(l => isPostPresentationBoundary(l))) return true;

  const joined = lines.join(' ').toLowerCase();

  // If section is explicitly a download or export guide, it is NEVER a presentation slide
  const isDownloadGuide =
    joined.includes('how to get your file') ||
    joined.includes('how to download') ||
    joined.includes('download .pptx') ||
    joined.includes('to download:') ||
    joined.includes('to change themes:') ||
    joined.includes('presentation card header') ||
    joined.includes('switch to other styles') ||
    joined.includes('your presentation is now perfectly formatted') ||
    joined.includes('download this presentation') ||
    joined.includes('presentation card') ||
    joined.includes('look at the presentation');

  if (isDownloadGuide) return true;

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
    /^[-*+]\s+/.test(l.trim()) ||
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
export function parseMarkdownToSlides(markdown: string, fallbackTitle?: string): { title: string; subtitle: string; slides: ParsedSlideData[] } {
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

    // Check if the presentation content has begun (title heading, slide header, or first divider)
    if (!presentationStarted) {
      if (
        /^[-*_]{3,}$/.test(trimmed) ||
        /^#{1,3}\s+/.test(trimmed) ||
        /^(#{1,4}\s+)?(Slide\s+\d+|[0-9]+\.\s+Slide\b|Title\s*Slide)/i.test(trimmed)
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

    // Check slide header delimiter (if explicit slide headers are used, only outside code blocks)
    const isSlideHeaderLine =
      !inCodeFence && (
        (hasSlideHeader && /^(#{1,4}\s+)?(Slide\s+\d+|[0-9]+\.\s+Slide\b)/i.test(trimmed)) ||
        (!hasDivider && !hasSlideHeader && /^#{1,2}\s+/.test(trimmed)) ||
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

  let presTitle = fallbackTitle || '';
  let presSubtitle = '';
  const parsedSlides: ParsedSlideData[] = [];

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
        (cleanLines.length <= 4 && !cleanLines.some(l => /^[-*+]\s+/.test(l) || l.startsWith('|'))));

    if (isExplicitTitleSlide) {
      // Extract presentation title and subtitle from this section
      for (const line of cleanLines) {
        if (/^#\s+/.test(line)) {
          presTitle = stripMarkdownFormatting(line.replace(/^#\s+/, '').trim());
        } else if (/^##\s+/.test(line)) {
          presSubtitle = stripMarkdownFormatting(line.replace(/^##\s+/, '').trim());
        } else if (!presTitle && !/Slide\s*1/i.test(line) && !/Title\s*Slide/i.test(line)) {
          presTitle = stripMarkdownFormatting(line);
        } else if (presTitle && !presSubtitle && !/Prepared|Presented|By\s+/i.test(line)) {
          presSubtitle = stripMarkdownFormatting(line);
        }
      }
      // Consumed as title slide, do not add as a standard content slide
      continue;
    }

    // Process as a content slide
    let slideTitle = '';
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

      // B. Slide Header (First heading in section)
      if (!slideTitle && /^#{1,4}\s+/.test(trimmedLine)) {
        slideTitle = cleanSlideTitle(trimmedLine);
        if (!presTitle) presTitle = slideTitle;
        continue;
      }

      // C. If no slide header was found yet and line looks like a title
      if (!slideTitle && /^(Slide\s+\d+|[0-9]+\.\s+)/i.test(trimmedLine)) {
        slideTitle = cleanSlideTitle(trimmedLine);
        continue;
      }

      // D. Bullet items (- point, * point, + point)
      if (/^[-*+]\s+/.test(trimmedLine)) {
        const bulletText = stripMarkdownFormatting(trimmedLine.replace(/^[-*+]\s+/, '').trim());
        if (bulletText) bullets.push(bulletText);
        continue;
      }

      // E. Numbered list items (1. point, 2. point)
      if (/^\d+\.\s+/.test(trimmedLine)) {
        const bulletText = stripMarkdownFormatting(trimmedLine.replace(/^\d+\.\s+/, '').trim());
        if (bulletText) bullets.push(bulletText);
        continue;
      }

      // F. Sub-headings within content (e.g. ### Sub topic)
      if (/^#{1,4}\s+/.test(trimmedLine)) {
        const subTitle = stripMarkdownFormatting(trimmedLine.replace(/^#{1,4}\s+/, '').trim());
        if (subTitle) bullets.push(subTitle);
        continue;
      }

      // G. Standard paragraph text (including blockquotes and descriptions)
      if (!slideTitle && !trimmedLine.startsWith('>')) {
        slideTitle = cleanSlideTitle(trimmedLine);
      } else {
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
    if (bullets.length > 0 || paragraphs.length > 0 || tableLines.length > 0 || codeSnippet) {
      parsedSlides.push({
        title: slideTitle,
        bullets,
        paragraphs,
        tableLines,
        codeSnippet,
      });
    }
  }

  // Fallback presentation title
  if (!presTitle) {
    presTitle = parsedSlides[0]?.title || fallbackTitle || 'Presentation';
  }

  return {
    title: presTitle,
    subtitle: presSubtitle || '',
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

  const { title: presTitle, subtitle: presSubtitle, slides } = parseMarkdownToSlides(markdown, options?.title);

  const showWatermark = options?.showWatermark ?? false;
  const iconDataUrl = showWatermark ? await getWatermarkIconDataUrl() : null;

  // ─────────────────────────────────────────────────────────────
  // 1. SLIDE 1: Title Slide (Dark Executive Aesthetic, Zero Out-of-Bounds Artifacts)
  // ─────────────────────────────────────────────────────────────
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: activeTheme.coverBg };

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

  slides.forEach((slideData, idx) => {
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
  });

  const blobOutput = await pres.write({ outputType: 'blob' });
  return blobOutput as Blob;
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
  if (/<!--\s*theme:\s*[a-zA-Z0-9_-]+\s*-->/i.test(clean)) {
    return true;
  }

  // 2. Explicit slide markers: e.g. "Slide 1:", "Slide 2:", "## Slide 1", "### Slide 2", "Title Slide"
  const slideHeaderCount = lines.filter(l =>
    /^(#{1,4}\s+|\*\*|\[)?(Slide\s+\d+|[0-9]+\.\s+Slide\b|Title\s*Slide)/i.test(l)
  ).length;
  if (slideHeaderCount >= 2) return true;

  // 3. Count true markdown horizontal dividers (---, ***, ___)
  const dividerCount = lines.filter(l => /^[-*_]{3,}$/.test(l)).length;

  // Combined slide header with at least one divider (e.g. Slide 1 ... --- Slide 2)
  if (slideHeaderCount >= 1 && dividerCount >= 1) {
    const parsed = parseMarkdownToSlides(clean);
    if (parsed.slides.length >= 1) return true;
  }

  // 4. Multiple dividers (>= 2) with explicit presentation / slide vocabulary
  // This ensures standard tutorials, roadmaps, articles, or Word/PDF guides with `---` are NOT misidentified as PPTX.
  const hasPresentationKeywords = /\b(presentation|slide\s*deck|slides?\s+on\b|slide-by-slide|powerpoint|\.pptx|presentation\s+carousel)\b/i.test(clean);

  if (hasPresentationKeywords && dividerCount >= 2) {
    const parsed = parseMarkdownToSlides(clean);
    const totalSlideCount = (parsed.title ? 1 : 0) + parsed.slides.length;
    if (totalSlideCount >= 2) return true;
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

export interface PresentationSplitResult {
  hasPresentation: boolean;
  topText: string;
  slideDeck: ReturnType<typeof extractSlideDeck>;
  slideOutline: string;
  bottomText: string;
}

/**
 * Splits assistant message content into:
 * 1. topText: Conversational introduction & guidance preceding the slides
 * 2. slideDeck: Structured presentation deck data for SlideDeckPreview
 * 3. slideOutline: Raw markdown of the slides only (for the collapsible outline view)
 * 4. bottomText: Conversational outro & next-step instructions following the slides
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
    };
  }

  const slideDeck = extractSlideDeck(markdown, fallbackTitle, preferredTheme);
  if (!slideDeck || slideDeck.slides.length < 2) {
    return {
      hasPresentation: false,
      topText: markdown,
      slideDeck: null,
      slideOutline: '',
      bottomText: '',
    };
  }

  // Clean thinking tags and normalize line endings
  const cleanMd = markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\r\n/g, '\n');

  const lines = cleanMd.split('\n');

  // 1. Find where the slide deck starts (slideStartIndex)
  let slideStartIndex = 0;
  const firstSlideTitle = slideDeck.title ? slideDeck.title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('<!--')) continue;

    // Check if line is a divider immediately preceding a heading
    if (/^[-*_]{3,}$/.test(trimmed)) {
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)?.trim() || '';
      if (/^#{1,4}\s+/i.test(nextNonEmpty) || /^(slide\s*\d+|title\s*slide)/i.test(nextNonEmpty)) {
        slideStartIndex = i + 1;
        break;
      }
    }

    // Check if line is the main title heading (# Title, or Title Slide, or Slide 1)
    const cleanLine = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isMatchingTitle = firstSlideTitle && cleanLine.includes(firstSlideTitle);
    const isExplicitHeading =
      /^#\s+/i.test(trimmed) ||
      /^#{1,4}\s*(slide\s*1\b|title\s*slide)/i.test(trimmed);

    if (isExplicitHeading || isMatchingTitle) {
      slideStartIndex = i;
      break;
    }
  }

  // 2. Find where the slide deck ends (slideEndIndex)
  // Locate the last slide's title line
  const lastSlide = slideDeck.slides[slideDeck.slides.length - 1];
  const cleanLastTitle = lastSlide?.title ? lastSlide.title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  let lastSlideLineIdx = -1;

  if (cleanLastTitle) {
    for (let i = slideStartIndex; i < lines.length; i++) {
      const cleanLine = lines[i].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        cleanLine.includes(cleanLastTitle) &&
        (/^#{1,4}\s+/i.test(lines[i].trim()) || /^(slide\s*\d+|title\s*slide)/i.test(lines[i].trim()))
      ) {
        lastSlideLineIdx = i;
      }
    }
  }

  const searchFrom = lastSlideLineIdx !== -1 ? lastSlideLineIdx : slideStartIndex;
  let slideEndIndex = lines.length;

  for (let i = searchFrom + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Check for divider separating slides from outro or subsequent deliverable
    if (/^[-*_]{3,}$/.test(trimmed)) {
      const remaining = lines.slice(i + 1).map(l => l.trim()).filter(Boolean);
      if (remaining.length > 0) {
        const nextContentLine = remaining[0];
        if (isPostPresentationBoundary(nextContentLine)) {
          slideEndIndex = i;
          break;
        }
      }
    }

    // Check for post-presentation boundary (Mermaid, ASCII preview, Word/PDF doc, or download guide)
    if (isPostPresentationBoundary(trimmed)) {
      slideEndIndex = i;
      break;
    }
  }

  // Extract raw sections
  let topText = lines.slice(0, slideStartIndex).join('\n').trim();
  topText = topText.replace(/<!--\s*theme:[\s\S]*?-->/gi, '').trim();

  let slideOutline = lines.slice(slideStartIndex, slideEndIndex).join('\n').trim();
  slideOutline = slideOutline.replace(/[-*_]{3,}\s*$/, '').trim();

  let bottomTextLines = lines.slice(slideEndIndex);
  if (bottomTextLines.length > 0 && /^[-*_]{3,}$/.test(bottomTextLines[0].trim())) {
    bottomTextLines = bottomTextLines.slice(1);
  }
  let bottomText = bottomTextLines.join('\n').trim();
  bottomText = bottomText.replace(/<!--\s*theme:[\s\S]*?-->/gi, '').trim();

  return {
    hasPresentation: true,
    topText,
    slideDeck,
    slideOutline,
    bottomText,
  };
}




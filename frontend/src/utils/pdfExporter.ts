import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfExportOptions {
  title?: string;
  author?: string;
  includeMetadata?: boolean;
}

/**
 * Regex matching Unicode emoji pictographs, multi-character ZWJ sequences, skin-tone modifiers, flags, and keycaps.
 */
export const EMOJI_REGEX = /(?:(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\uD83C[\uDFFB-\uDFFF])?)*)|[\uD83C][\uDDE6-\uDDFF]{2}|[0-9#*]\uFE0F?\u20E3)/u;

/**
 * Checks if a string contains any emoji characters.
 */
export function hasEmoji(str: string): boolean {
  return EMOJI_REGEX.test(str);
}

const emojiCanvasCache = new Map<string, string>();

/**
 * Renders an emoji character onto an offscreen canvas and returns a high-res PNG Data URL.
 * Cached in memory so each unique emoji is only rasterized once per session.
 */
export function getEmojiDataUrl(emoji: string): string | null {
  if (typeof document === 'undefined') return null;

  if (emojiCanvasCache.has(emoji)) {
    return emojiCanvasCache.get(emoji)!;
  }

  try {
    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return null;

    // High resolution 72x72 for crisp printing and display
    const size = 72;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(size * 0.72)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "Segoe UI Symbol", sans-serif`;

    ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);

    const dataUrl = canvas.toDataURL('image/png');
    emojiCanvasCache.set(emoji, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

export interface TextToken {
  text: string;
  isEmoji: boolean;
  width: number;
}

/**
 * Splits a text string into words, whitespace, and emojis, measuring width for each.
 */
export function tokenizeTextWithEmojis(doc: jsPDF, text: string, fontSize: number): TextToken[] {
  const tokens: TextToken[] = [];
  const emojiSize = fontSize * 0.95;
  const emojiWidth = emojiSize + 1.5;

  let lastIndex = 0;
  const regex = new RegExp(EMOJI_REGEX.source, 'gu');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) {
      const pieces = textBefore.split(/(\s+)/);
      for (const piece of pieces) {
        if (!piece) continue;
        tokens.push({
          text: piece,
          isEmoji: false,
          width: doc.getTextWidth(piece),
        });
      }
    }

    tokens.push({
      text: match[0],
      isEmoji: true,
      width: emojiWidth,
    });

    lastIndex = regex.lastIndex;
  }

  const remainingText = text.slice(lastIndex);
  if (remainingText) {
    const pieces = remainingText.split(/(\s+)/);
    for (const piece of pieces) {
      if (!piece) continue;
      tokens.push({
        text: piece,
        isEmoji: false,
        width: doc.getTextWidth(piece),
      });
    }
  }

  return tokens;
}

/**
 * Greedily wraps text tokens into lines that fit within maxWidth without breaking emojis or words.
 */
export function wrapTokensToLines(tokens: TextToken[], maxWidth: number): TextToken[][] {
  const lines: TextToken[][] = [];
  let currentLine: TextToken[] = [];
  let currentWidth = 0;

  for (const token of tokens) {
    if (!token.isEmoji && token.text.trim() === '' && currentLine.length === 0) {
      continue;
    }

    if (currentWidth + token.width <= maxWidth || currentLine.length === 0) {
      currentLine.push(token);
      currentWidth += token.width;
    } else {
      lines.push(currentLine);
      if (!token.isEmoji && token.text.trim() === '') {
        currentLine = [];
        currentWidth = 0;
      } else {
        currentLine = [token];
        currentWidth = token.width;
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Renders a single line of tokens (text chunks and emojis) onto the PDF page.
 */
export function renderTokenLine(
  doc: jsPDF,
  line: TextToken[],
  startX: number,
  baselineY: number,
  fontSize: number
): void {
  let currentX = startX;
  const emojiSize = fontSize * 0.95;
  const emojiTop = baselineY - fontSize * 0.78;

  for (const token of line) {
    if (token.isEmoji) {
      const dataUrl = getEmojiDataUrl(token.text);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'PNG', currentX, emojiTop, emojiSize, emojiSize);
        } catch {
          // If image embedding fails, gracefully continue
        }
      }
      currentX += token.width;
    } else {
      doc.text(token.text, currentX, baselineY);
      currentX += token.width;
    }
  }
}

/**
 * Transliterates Unicode box-drawing characters, symbols, and arrows into clean ASCII equivalents
 * so they render reliably in standard PDF fonts (Courier/Helvetica) and across all document viewers
 * without turning into '%' or unmapped glyph placeholders.
 */
export function transliterateUnicodeSymbols(str: string): string {
  if (!str) return '';

  return str
    // Box-drawing horizontals & heavy/double dashes
    .replace(/[\u2500\u2501\u2504\u2505\u2508\u2509\u254C\u254D\u2550\u2014\u2013]/g, '-')
    // Box-drawing verticals & heavy/double lines
    .replace(/[\u2502\u2503\u2506\u2507\u250A\u250B\u254E\u254F\u2551]/g, '|')
    // Box-drawing corners, intersections, junctions, tees, crosses
    .replace(/[\u250C-\u254B\u2552-\u257F]/g, '+')
    // Downward triangles and arrows
    .replace(/[\u25BC\u25BD\u25BE\u25BF\u2193\u21D3\u2B07]/g, 'v')
    // Upward triangles and arrows
    .replace(/[\u25B2\u25B3\u25B4\u25B5\u2191\u21D1\u2B06]/g, '^')
    // Right triangles and arrows
    .replace(/[\u25B6\u25B7\u25B8\u25B9\u25BA\u25BB\u2192\u21D2\u2794\u279C\u27A4]/g, '>')
    // Left triangles and arrows
    .replace(/[\u25C0\u25C1\u25C2\u25C3\u25C4\u25C5\u2190\u21D0]/g, '<')
    // Bidirectional arrows
    .replace(/[\u2194\u21D4]/g, '<->')
    .replace(/[\u2195\u21D5]/g, '|')
    // Geometric shapes, bullets & blocks
    .replace(/[\u2580-\u259F]/g, '#')
    .replace(/[\u2022\u25CF\u25A0\u25AA]/g, '*')
    .replace(/[\u25CB\u25A1\u25AB\u25C6\u25C7\u25CA]/g, 'o')
    // Checkmarks and crosses
    .replace(/[\u2713\u2714]/g, '[x]')
    .replace(/[\u2715\u2716\u2717\u2718]/g, 'x')
    // Smart quotes and typography
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\u2026/g, '...')
    // Mathematical comparison symbols outside standard 8-bit fonts
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/[\u2248\u223C]/g, '~=')
    .replace(/[\u2260]/g, '!=');
}

/**
 * Strips markdown symbols (bold, italic, code, links) and cleans LaTeX/math expressions
 */
function stripMarkdownFormatting(str: string): string {
  const stripped = str
    // LaTeX temperature and degree symbols ($1.5^\circ\text{C}$ -> 1.5°C)
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*\^\\circ\\text\{C\}\s*\$/g, '$1°C')
    .replace(/\$\s*(\d+(?:\.\d+)?)\s*\^\{\\circ\}\\text\{C\}\s*\$/g, '$1°C')
    .replace(/\^\\circ\\text\{C\}/g, '°C')
    .replace(/\^\{\\circ\}\\text\{C\}/g, '°C')
    .replace(/\^\\circ/g, '°')
    .replace(/\^\{\\circ\}/g, '°')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\approx/g, '~=')
    .replace(/\\leq?/g, '<=')
    .replace(/\\geq?/g, '>=')
    .replace(/\\times/g, '×')
    .replace(/\\pm/g, '±')
    .replace(/\$([^$]+)\$/g, '$1')
    // Standard Markdown formatting
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/___(.*?)___/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();

  return transliterateUnicodeSymbols(stripped);
}

/**
 * Exports markdown content into a multi-page vector PDF Blob.
 * Features line-by-line code chunk pagination, dynamic metadata toggle, duplicate title elimination,
 * and native emoji rendering via high-resolution vector/canvas rasterization.
 */
export async function exportMarkdownToPdf(markdown: string, options?: PdfExportOptions): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 45;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin - 25;
  let cursorY = margin + 15;

  // Clean thinking tags and normalize line endings
  const cleanMd = markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const lines = cleanMd.split('\n');

  // Helper to ensure enough space on page, otherwise add a new page
  const ensureSpace = (neededHeight: number) => {
    if (cursorY + neededHeight > bottomLimit) {
      doc.addPage();
      cursorY = margin + 15;
    }
  };

  // 1. Document Title Banner (Clean Executive Style)
  const firstH1Line = lines.find(l => l.trim().startsWith('# '));
  const docTitle = options?.title || firstH1Line?.replace(/^#\s+/, '') || 'Document';
  const cleanTitle = stripMarkdownFormatting(docTitle);

  ensureSpace(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // #0F172A

  if (!hasEmoji(cleanTitle)) {
    const titleLines = doc.splitTextToSize(cleanTitle, contentWidth);
    doc.text(titleLines, margin, cursorY);
    cursorY += titleLines.length * 26 + 6;
  } else {
    const tokens = tokenizeTextWithEmojis(doc, cleanTitle, 22);
    const titleLines = wrapTokensToLines(tokens, contentWidth);
    for (const line of titleLines) {
      ensureSpace(26);
      renderTokenLine(doc, line, margin, cursorY, 22);
      cursorY += 26;
    }
    cursorY += 6;
  }

  // Title accent rule
  doc.setDrawColor(59, 130, 246); // #3B82F6
  doc.setLineWidth(1.5);
  doc.line(margin, cursorY, margin + contentWidth, cursorY);
  cursorY += 16;

  // Safe wrapper for jspdf-autotable
  const runAutoTable = typeof autoTable === 'function' ? autoTable : (autoTable as any)?.default;

  // 2. Parse and render markdown lines
  let i = 0;
  let hasSkippedInitialDuplicateTitle = false;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines
    if (!trimmed) {
      cursorY += 6;
      i++;
      continue;
    }

    // Skip horizontal divider line (draws a subtle separator)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      ensureSpace(16);
      doc.setDrawColor(226, 232, 240); // #E2E8F0
      doc.setLineWidth(0.75);
      doc.line(margin, cursorY, margin + contentWidth, cursorY);
      cursorY += 14;
      i++;
      continue;
    }

    // A. Markdown Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // Filter separator rows (e.g. |---|---|)
      const dataRows = tableLines.filter(l => !/^\|(\s*[:-]+[-| :]*)\|$/.test(l));
      if (dataRows.length > 0 && typeof runAutoTable === 'function') {
        const parsedRows = dataRows.map(row =>
          row
            .slice(1, -1)
            .split('|')
            .map(cell => stripMarkdownFormatting(cell.trim()))
        );

        const head = [parsedRows[0]];
        const body = parsedRows.slice(1);

        ensureSpace(40);
        runAutoTable(doc, {
          startY: cursorY,
          head: head,
          body: body,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 9,
            cellPadding: 5,
            textColor: [51, 65, 85], // #334155
            lineColor: [226, 232, 240],
            lineWidth: 0.5,
          },
          headStyles: {
            fillColor: [30, 41, 59], // #1E293B
            textColor: [255, 255, 255],
            fontStyle: 'bold',
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252], // #F8FAFC
          },
          didDrawCell: (data: any) => {
            const rawText = typeof data.cell.raw === 'string' ? data.cell.raw : '';
            if (hasEmoji(rawText)) {
              const bg = data.cell.styles.fillColor;
              if (bg && Array.isArray(bg)) {
                doc.setFillColor(bg[0], bg[1], bg[2]);
                doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
              }
              const tc = data.cell.styles.textColor || [51, 65, 85];
              doc.setTextColor(tc[0], tc[1], tc[2]);
              doc.setFont('helvetica', data.cell.styles.fontStyle || 'normal');
              const fs = data.cell.styles.fontSize || 9;
              doc.setFontSize(fs);

              const tokens = tokenizeTextWithEmojis(doc, rawText, fs);
              const maxW = data.cell.width - data.cell.padding('horizontal');
              const cellLines = wrapTokensToLines(tokens, maxW);
              const startX = data.cell.x + data.cell.padding('left');
              const startY = data.cell.y + data.cell.height / 2 + fs * 0.35;
              let lineY = startY;
              for (const cl of cellLines) {
                renderTokenLine(doc, cl, startX, lineY, fs);
                lineY += fs * 1.3;
              }
            }
          },
        });

        const lastTable = (doc as any).lastAutoTable;
        if (lastTable && lastTable.finalY) {
          cursorY = lastTable.finalY + 14;
        } else {
          cursorY += dataRows.length * 20 + 20;
        }
      }
      continue;
    }

    // B. Multi-Page Paginated Code blocks (```code```)
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++; // skip open fence
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++; // skip close fence
      }

      if (codeLines.length > 0) {
        // 1. Transliterate Unicode box drawing and arrow symbols into clean ASCII so standard Courier doesn't corrupt them into '%'
        const cleanCodeLines = codeLines.map(l => transliterateUnicodeSymbols(l));
        const maxLineLen = Math.max(...cleanCodeLines.map(l => l.length), 0);
        const availableCodeWidth = contentWidth - 18;

        // 2. Dynamically scale font size for wide code or ASCII diagrams so they fit cleanly without wrapping
        const charWidthRatio = 0.605;
        let codeFontSize = 8.5;
        if (maxLineLen > 0) {
          const maxAllowedSize = availableCodeWidth / (maxLineLen * charWidthRatio);
          codeFontSize = Math.min(8.5, Math.max(5.5, Math.floor(maxAllowedSize * 10) / 10));
        }

        doc.setFont('courier', 'normal');
        doc.setFontSize(codeFontSize);

        // 3. Process lines safely: if a line fits within available width, keep it unbroken!
        // If a line exceeds available width, wrap it safely without allowing any unbroken token to overflow off page
        const maxCharsPerLine = Math.max(20, Math.floor(availableCodeWidth / (codeFontSize * charWidthRatio)));
        const wrappedCode: string[] = [];

        for (const cl of cleanCodeLines) {
          if (cl.length <= maxCharsPerLine) {
            wrappedCode.push(cl);
          } else {
            // Line exceeds printable width even at scaled font size. Wrap safely.
            const split = doc.splitTextToSize(cl, availableCodeWidth);
            for (const segment of split) {
              if (segment.length > maxCharsPerLine) {
                // Hard chunk by character limit for continuous strings without spaces to prevent ANY overflow off page/screen
                for (let c = 0; c < segment.length; c += maxCharsPerLine) {
                  wrappedCode.push(segment.slice(c, c + maxCharsPerLine));
                }
              } else {
                wrappedCode.push(segment);
              }
            }
          }
        }

        const lineHeight = Math.max(8, Math.round(codeFontSize * 1.35));
        let remainingLines = [...wrappedCode];

        while (remainingLines.length > 0) {
          let maxLinesThisPage = Math.floor((bottomLimit - cursorY - 14) / lineHeight);
          if (maxLinesThisPage < 2) {
            doc.addPage();
            cursorY = margin + 15;
            maxLinesThisPage = Math.floor((bottomLimit - cursorY - 14) / lineHeight);
          }

          const chunk = remainingLines.slice(0, maxLinesThisPage);
          remainingLines = remainingLines.slice(maxLinesThisPage);

          const chunkBoxHeight = chunk.length * lineHeight + 12;
          doc.setFillColor(241, 245, 249); // #F1F5F9
          doc.setDrawColor(203, 213, 225); // #CBD5E1
          doc.setLineWidth(0.5);
          doc.roundedRect(margin, cursorY, contentWidth, chunkBoxHeight, 3, 3, 'FD');

          doc.setTextColor(30, 41, 59);
          for (let lIdx = 0; lIdx < chunk.length; lIdx++) {
            doc.text(chunk[lIdx], margin + 8, cursorY + 9 + lIdx * lineHeight);
          }
          cursorY += chunkBoxHeight + 8;
        }
      }
      continue;
    }

    // C. Headings (H1, H2, H3, H4) with duplicate title prevention
    if (/^#{1,4}\s+/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,4})\s+/)?.[1]?.length || 1;
      const headingText = stripMarkdownFormatting(trimmed.replace(/^#{1,4}\s+/, '').trim());

      // If this is the first H1 and it matches the banner title, skip re-rendering it!
      if (!hasSkippedInitialDuplicateTitle && level === 1 && headingText.toLowerCase() === cleanTitle.toLowerCase()) {
        hasSkippedInitialDuplicateTitle = true;
        i++;
        continue;
      }
      hasSkippedInitialDuplicateTitle = true;

      doc.setFont('helvetica', 'bold');
      if (level === 1) {
        ensureSpace(34);
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42); // #0F172A
        if (!hasEmoji(headingText)) {
          const hLines = doc.splitTextToSize(headingText, contentWidth);
          doc.text(hLines, margin, cursorY);
          cursorY += hLines.length * 20 + 8;
        } else {
          const tokens = tokenizeTextWithEmojis(doc, headingText, 16);
          const hLines = wrapTokensToLines(tokens, contentWidth);
          for (const line of hLines) {
            ensureSpace(20);
            renderTokenLine(doc, line, margin, cursorY, 16);
            cursorY += 20;
          }
          cursorY += 8;
        }
      } else if (level === 2) {
        ensureSpace(28);
        doc.setFontSize(13);
        doc.setTextColor(30, 41, 59); // #1E293B
        if (!hasEmoji(headingText)) {
          const hLines = doc.splitTextToSize(headingText, contentWidth);
          doc.text(hLines, margin, cursorY);
          cursorY += hLines.length * 17 + 6;
        } else {
          const tokens = tokenizeTextWithEmojis(doc, headingText, 13);
          const hLines = wrapTokensToLines(tokens, contentWidth);
          for (const line of hLines) {
            ensureSpace(17);
            renderTokenLine(doc, line, margin, cursorY, 13);
            cursorY += 17;
          }
          cursorY += 6;
        }
      } else {
        ensureSpace(24);
        doc.setFontSize(11);
        doc.setTextColor(51, 65, 85); // #334155
        if (!hasEmoji(headingText)) {
          const hLines = doc.splitTextToSize(headingText, contentWidth);
          doc.text(hLines, margin, cursorY);
          cursorY += hLines.length * 15 + 4;
        } else {
          const tokens = tokenizeTextWithEmojis(doc, headingText, 11);
          const hLines = wrapTokensToLines(tokens, contentWidth);
          for (const line of hLines) {
            ensureSpace(15);
            renderTokenLine(doc, line, margin, cursorY, 11);
            cursorY += 15;
          }
          cursorY += 4;
        }
      }

      i++;
      continue;
    }

    // D. Bullet items (- point, * point, + point) with line-by-line pagination
    if (/^[-*+]\s+/.test(trimmed)) {
      hasSkippedInitialDuplicateTitle = true;
      const bulletContent = stripMarkdownFormatting(trimmed.replace(/^[-*+]\s+/, '').trim());
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);

      if (!hasEmoji(bulletContent)) {
        const bLines = doc.splitTextToSize(bulletContent, contentWidth - 16);
        for (let bIdx = 0; bIdx < bLines.length; bIdx++) {
          if (cursorY + 14 > bottomLimit) {
            doc.addPage();
            cursorY = margin + 15;
          }
          if (bIdx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('•', margin + 4, cursorY);
            doc.setFont('helvetica', 'normal');
          }
          doc.text(bLines[bIdx], margin + 14, cursorY);
          cursorY += 14;
        }
      } else {
        const tokens = tokenizeTextWithEmojis(doc, bulletContent, 10);
        const bLines = wrapTokensToLines(tokens, contentWidth - 16);
        for (let bIdx = 0; bIdx < bLines.length; bIdx++) {
          if (cursorY + 14 > bottomLimit) {
            doc.addPage();
            cursorY = margin + 15;
          }
          if (bIdx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('•', margin + 4, cursorY);
            doc.setFont('helvetica', 'normal');
          }
          renderTokenLine(doc, bLines[bIdx], margin + 14, cursorY, 10);
          cursorY += 14;
        }
      }
      cursorY += 4;
      i++;
      continue;
    }

    // E. Numbered items (1. point) with line-by-line pagination
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      hasSkippedInitialDuplicateTitle = true;
      const numPrefix = `${numMatch[1]}.`;
      const numContent = stripMarkdownFormatting(numMatch[2].trim());
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);

      if (!hasEmoji(numContent)) {
        const nLines = doc.splitTextToSize(numContent, contentWidth - 20);
        for (let nIdx = 0; nIdx < nLines.length; nIdx++) {
          if (cursorY + 14 > bottomLimit) {
            doc.addPage();
            cursorY = margin + 15;
          }
          if (nIdx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text(numPrefix, margin + 2, cursorY);
            doc.setFont('helvetica', 'normal');
          }
          doc.text(nLines[nIdx], margin + 18, cursorY);
          cursorY += 14;
        }
      } else {
        const tokens = tokenizeTextWithEmojis(doc, numContent, 10);
        const nLines = wrapTokensToLines(tokens, contentWidth - 20);
        for (let nIdx = 0; nIdx < nLines.length; nIdx++) {
          if (cursorY + 14 > bottomLimit) {
            doc.addPage();
            cursorY = margin + 15;
          }
          if (nIdx === 0) {
            doc.setFont('helvetica', 'bold');
            doc.text(numPrefix, margin + 2, cursorY);
            doc.setFont('helvetica', 'normal');
          }
          renderTokenLine(doc, nLines[nIdx], margin + 18, cursorY, 10);
          cursorY += 14;
        }
      }
      cursorY += 4;
      i++;
      continue;
    }

    // F. Blockquotes (> quote)
    if (trimmed.startsWith('>')) {
      hasSkippedInitialDuplicateTitle = true;
      const quoteText = stripMarkdownFormatting(trimmed.replace(/^>\s*/, '').trim());
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105); // #475569

      if (!hasEmoji(quoteText)) {
        const qLines = doc.splitTextToSize(quoteText, contentWidth - 18);
        const qHeight = qLines.length * 13 + 8;
        ensureSpace(qHeight);

        // Quote bar
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(2.5);
        doc.line(margin + 2, cursorY - 2, margin + 2, cursorY + qHeight - 6);

        doc.text(qLines, margin + 14, cursorY + 6);
        cursorY += qHeight + 6;
      } else {
        const tokens = tokenizeTextWithEmojis(doc, quoteText, 9.5);
        const qLines = wrapTokensToLines(tokens, contentWidth - 18);
        const qHeight = qLines.length * 13 + 8;
        ensureSpace(qHeight);

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(2.5);
        doc.line(margin + 2, cursorY - 2, margin + 2, cursorY + qHeight - 6);

        for (const line of qLines) {
          renderTokenLine(doc, line, margin + 14, cursorY + 6, 9.5);
          cursorY += 13;
        }
        cursorY += 14;
      }
      i++;
      continue;
    }

    // G. Regular Paragraphs with line-by-line pagination
    hasSkippedInitialDuplicateTitle = true;
    const cleanParagraph = stripMarkdownFormatting(trimmed);
    if (cleanParagraph) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85); // #334155

      if (!hasEmoji(cleanParagraph)) {
        const pLines = doc.splitTextToSize(cleanParagraph, contentWidth);
        for (const line of pLines) {
          if (cursorY + 14 > bottomLimit) {
            doc.addPage();
            cursorY = margin + 15;
          }
          doc.text(line, margin, cursorY);
          cursorY += 14;
        }
      } else {
        const tokens = tokenizeTextWithEmojis(doc, cleanParagraph, 10);
        const pLines = wrapTokensToLines(tokens, contentWidth);
        for (const line of pLines) {
          if (cursorY + 14 > bottomLimit) {
            doc.addPage();
            cursorY = margin + 15;
          }
          renderTokenLine(doc, line, margin, cursorY, 10);
          cursorY += 14;
        }
      }
      cursorY += 6;
    }

    i++;
  }

  // 3. Add Page Numbers Footer (e.g. Page 1 of 3)
  const totalPages = doc.getNumberOfPages();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184); // #94A3B8

    // Footer rule
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - margin + 10, margin + contentWidth, pageHeight - margin + 10);

    // Page text on right
    doc.text(`Page ${pageNum} of ${totalPages}`, margin + contentWidth, pageHeight - margin + 22, {
      align: 'right',
    });
  }

  return doc.output('blob');
}

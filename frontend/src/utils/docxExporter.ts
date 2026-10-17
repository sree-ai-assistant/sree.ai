import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Footer,
  PageNumber,
  ShadingType,
} from 'docx';
import { transliterateUnicodeSymbols } from './pdfExporter';

interface DocxExportOptions {
  title?: string;
  author?: string;
}

/**
 * Tokenize simple inline markdown into TextRun objects
 */
function parseInlineRuns(text: string, baseStyle?: { color?: string; size?: number; font?: string; italics?: boolean; bold?: boolean }): TextRun[] {
  const runs: TextRun[] = [];
  const font = baseStyle?.font || 'Calibri';
  const size = baseStyle?.size || 22; // 11pt
  const color = baseStyle?.color || '1E293B';

  // Regular expression to match **bold**, *italic*, `code`, or plain text
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length >= 4) {
      runs.push(
        new TextRun({
          text: chunk.slice(2, -2),
          bold: true,
          italics: baseStyle?.italics,
          font,
          size,
          color,
        })
      );
    } else if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length >= 2) {
      runs.push(
        new TextRun({
          text: chunk.slice(1, -1),
          italics: true,
          bold: baseStyle?.bold,
          font,
          size,
          color,
        })
      );
    } else if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length >= 2) {
      runs.push(
        new TextRun({
          text: chunk.slice(1, -1),
          font: 'Consolas',
          size: Math.max(18, size - 2),
          color: '0F172A',
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F1F5F9',
          },
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: chunk,
          bold: baseStyle?.bold,
          italics: baseStyle?.italics,
          font,
          size,
          color,
        })
      );
    }
  }

  return runs.length > 0
    ? runs
    : [
        new TextRun({
          text,
          bold: baseStyle?.bold,
          italics: baseStyle?.italics,
          font,
          size,
          color,
        }),
      ];
}

/**
 * Converts a Markdown table (lines array) into a docx Table element
 */
function createDocxTable(tableLines: string[]): Table | null {
  const rowsData: string[][] = [];

  for (const line of tableLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    // Check if it's separator row like |---|---|
    if (/^\|(\s*[:-]+[-| :]*)\|$/.test(trimmed)) continue;

    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map(c => c.trim());
    if (cells.length > 0) {
      rowsData.push(cells);
    }
  }

  if (rowsData.length === 0) return null;

  const colCount = Math.max(...rowsData.map(r => r.length));
  const colWidthPct = Math.floor(100 / colCount);

  const tableRows = rowsData.map((rowCells, rowIndex) => {
    const isHeader = rowIndex === 0;

    const cells = rowCells.map(cellText => {
      const runs = parseInlineRuns(cellText, {
        color: isHeader ? 'FFFFFF' : '1E293B',
        bold: isHeader,
        size: 20, // 10pt
      });

      return new TableCell({
        width: {
          size: colWidthPct,
          type: WidthType.PERCENTAGE,
        },
        shading: {
          type: ShadingType.CLEAR,
          fill: isHeader ? '1E293B' : rowIndex % 2 === 1 ? 'F8FAFC' : 'FFFFFF',
        },
        margins: {
          top: 140,
          bottom: 140,
          left: 180,
          right: 180,
        },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        },
        children: [
          new Paragraph({
            alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
            children: runs,
          }),
        ],
      });
    });

    // Pad missing cells if any
    while (cells.length < colCount) {
      cells.push(
        new TableCell({
          width: { size: colWidthPct, type: WidthType.PERCENTAGE },
          children: [new Paragraph({})],
        })
      );
    }

    return new TableRow({
      children: cells,
      tableHeader: isHeader,
    });
  });

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: tableRows,
  });
}

/**
 * Main export function: transforms raw markdown into a beautifully formatted .docx Blob
 */
export async function exportMarkdownToDocx(markdown: string, options?: DocxExportOptions): Promise<Blob> {
  const lines = markdown.split(/\r?\n/);
  const docElements: (Paragraph | Table)[] = [];

  // Extract or infer title
  let docTitle = options?.title;
  let firstHeadingFound = false;

  // Banner Header at the top
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // 1. Code Block detection
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```

      // Transliterate Unicode box drawing to standard ASCII so every character has strict monospace width
      const cleanCodeLines = codeLines.map(l => transliterateUnicodeSymbols(l));
      const maxLineLen = Math.max(...cleanCodeLines.map(l => l.length), 0);

      // Auto-scale font size for wide code or ASCII diagrams so Word does not wrap lines mid-diagram
      let codeFontSize = 19; // 9.5pt default
      if (maxLineLen > 105) {
        codeFontSize = 13; // 6.5pt
      } else if (maxLineLen > 90) {
        codeFontSize = 15; // 7.5pt
      } else if (maxLineLen > 75) {
        codeFontSize = 16; // 8pt
      }

      // Word requires `break: 1` on TextRun for explicit line breaks; otherwise lines merge together!
      const runs: TextRun[] = cleanCodeLines.map((cl, idx) =>
        new TextRun({
          text: cl || ' ',
          break: idx > 0 ? 1 : undefined,
          font: 'Consolas',
          size: codeFontSize,
          color: '1E293B',
        })
      );

      docElements.push(
        new Paragraph({
          spacing: { before: 140, after: 140, line: Math.round(codeFontSize * 13) },
          shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
          border: {
            left: { color: 'CBD5E1', size: 12, style: BorderStyle.SINGLE, space: 10 },
            top: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE, space: 6 },
            right: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE, space: 6 },
            bottom: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE, space: 6 },
          },
          children: runs.length > 0 ? runs : [new TextRun({ text: ' ', font: 'Consolas', size: 19 })],
        })
      );
      continue;
    }

    // 2. Table detection (GFM pipe table)
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      const tableElement = createDocxTable(tableLines);
      if (tableElement) {
        docElements.push(
          new Paragraph({ spacing: { before: 180, after: 60 } }),
          tableElement,
          new Paragraph({ spacing: { before: 60, after: 180 } })
        );
      }
      continue;
    }

    // 3. Headings
    if (line.startsWith('# ')) {
      const headingText = line.replace(/^#\s+/, '').trim();
      if (!firstHeadingFound && !docTitle) {
        docTitle = headingText;
      }
      firstHeadingFound = true;

      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 140 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 36, // 18pt
              color: '0F172A',
              font: 'Calibri',
            }),
          ],
        })
      );
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      const headingText = line.replace(/^##\s+/, '').trim();
      firstHeadingFound = true;

      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 28, // 14pt
              color: '1E293B',
              font: 'Calibri',
            }),
          ],
        })
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      const headingText = line.replace(/^###\s+/, '').trim();
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 24, // 12pt
              color: '334155',
              font: 'Calibri',
            }),
          ],
        })
      );
      i++;
      continue;
    }

    if (line.startsWith('#### ') || line.startsWith('##### ')) {
      const headingText = line.replace(/^#{4,5}\s+/, '').trim();
      docElements.push(
        new Paragraph({
          spacing: { before: 160, after: 80 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 22, // 11pt
              color: '475569',
              font: 'Calibri',
            }),
          ],
        })
      );
      i++;
      continue;
    }

    // 4. Horizontal Rules
    if (/^[-*_]{3,}$/.test(line)) {
      docElements.push(
        new Paragraph({
          spacing: { before: 140, after: 140 },
          border: {
            bottom: { color: 'E2E8F0', size: 6, style: BorderStyle.SINGLE, space: 1 },
          },
        })
      );
      i++;
      continue;
    }

    // 5. Blockquotes
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s*/, '').trim();
      docElements.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          indent: { left: 400 },
          border: {
            left: { color: '3B82F6', size: 18, style: BorderStyle.SINGLE, space: 10 },
          },
          children: parseInlineRuns(quoteText, {
            italics: true,
            color: '475569',
            size: 22,
          }),
        })
      );
      i++;
      continue;
    }

    // 6. Bullet lists
    if (/^[-*+]\s+/.test(line)) {
      const itemText = line.replace(/^[-*+]\s+/, '').trim();
      docElements.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40, after: 60 },
          children: parseInlineRuns(itemText, { size: 22, color: '1E293B' }),
        })
      );
      i++;
      continue;
    }

    // 7. Numbered lists
    if (/^\d+\.\s+/.test(line)) {
      const itemText = line.replace(/^\d+\.\s+/, '').trim();
      const numMatch = line.match(/^(\d+)\.\s+/);
      const prefix = numMatch ? `${numMatch[1]}. ` : '• ';

      docElements.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { before: 40, after: 60 },
          children: [
            new TextRun({ text: prefix, bold: true, color: '2563EB', font: 'Calibri' }),
            ...parseInlineRuns(itemText, { size: 22, color: '1E293B' }),
          ],
        })
      );
      i++;
      continue;
    }

    // 8. Standard paragraph
    docElements.push(
      new Paragraph({
        spacing: { before: 60, after: 120, line: 276 }, // 1.15 line spacing
        children: parseInlineRuns(line, { size: 22, color: '1E293B' }),
      })
    );
    i++;
  }

  // Prepend title block if a title was derived or provided
  const headerBlock: Paragraph[] = [];
  if (docTitle) {
    headerBlock.push(
      new Paragraph({
        spacing: { before: 100, after: 80 },
        children: [
          new TextRun({
            text: docTitle,
            bold: true,
            size: 44, // 22pt
            color: '0F172A',
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 0, after: 280 },
        border: {
          bottom: { color: '3B82F6', size: 12, style: BorderStyle.SINGLE, space: 8 },
        },
        children: [
          new TextRun({
            text: `Generated by Sree AI   •   ${dateStr}`,
            size: 18, // 9pt
            color: '64748B',
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  const doc = new Document({
    creator: options?.author || 'Sree AI',
    title: docTitle || 'Document',
    description: 'Generated by Sree AI Platform',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Sree AI   |   Page ',
                    size: 18,
                    color: '94A3B8',
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: '94A3B8',
                    font: 'Calibri',
                  }),
                  new TextRun({
                    text: ' of ',
                    size: 18,
                    color: '94A3B8',
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: '94A3B8',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [...headerBlock, ...docElements],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

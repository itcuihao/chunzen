// Text layer: extracts text items, detects columns, filters math, dehyphenates, renders span overlay

import { TextItem, PdfViewport } from './pdfRenderer';

declare const pdfjsLib: {
  Util: { transform(transform: number[], viewportTransform: number[]): number[] };
};

export interface Sentence {
  id: string;
  text: string;
  spans: HTMLSpanElement[];
}

export interface Paragraph {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  section: 'header' | 'left' | 'right' | 'footer';
}

interface ColLayoutItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LineSegment {
  items: ColLayoutItem[];
  x: number;
  y: number;
  width: number;
  height: number;
  columnIndex: number; // -1: Full-width, 0: Left, 1: Right
  str: string;
  section: 'header' | 'left' | 'right' | 'footer';
}

interface LogicalParagraph {
  id: string;
  text: string;
  items: ColLayoutItem[];
  section: 'header' | 'left' | 'right' | 'footer';
}

interface SentenceItem {
  text: string;
  items: ColLayoutItem[];
}

// ── Main entry ──

export function buildTextLayer(
  container: HTMLElement,
  items: TextItem[],
  viewport: PdfViewport
): {
  sentences: Map<string, Sentence>;
  spanToSentence: Map<HTMLSpanElement, string>;
  paragraphs: Paragraph[];
  columnsCount: number;
} {
  container.innerHTML = '';

  // 1. Transform to layout coordinates and filter math/headers
  // We use a safe 2% margin to prevent discarding actual body text at page boundaries.
  const headerY = viewport.height * 0.02;
  const footerY = viewport.height * 0.98;
  const allItems: ColLayoutItem[] = [];

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    if (!tx || isNaN(tx[4]) || isNaN(tx[5])) continue;

    // Filter math symbols and LaTeX commands
    if (isMathArtifact(item.str)) continue;

    // Skip header/footer region (only if extreme outer margins)
    if (tx[5] < headerY || tx[5] > footerY) continue;

    const w = item.width * viewport.scale;
    allItems.push({
      str: item.str,
      x: tx[4],
      y: tx[5],
      width: w,
      height: item.height * viewport.scale
    });
  }

  if (allItems.length === 0) {
    return { sentences: new Map(), spanToSentence: new Map(), paragraphs: [], columnsCount: 1 };
  }

  // Sort items: Y first (top-to-bottom), then X (left-to-right)
  allItems.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
    return a.x - b.x;
  });

  // 2. Group items into raw horizontal lines
  const rawLines: ColLayoutItem[][] = [];
  let currentLine: ColLayoutItem[] = [];
  let currentY: number | null = null;
  const LINE_THRESHOLD = 4; // px

  for (const item of allItems) {
    if (currentY === null || Math.abs(item.y - currentY) <= LINE_THRESHOLD) {
      currentLine.push(item);
      currentY = currentY === null ? item.y : (currentY + item.y) / 2;
    } else {
      if (currentLine.length) rawLines.push(currentLine.sort((a, b) => a.x - b.x));
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length) rawLines.push(currentLine.sort((a, b) => a.x - b.x));

  // 3. Find page horizontal bounds
  const xs = allItems.map(it => it.x);
  const xMaxs = allItems.map(it => it.x + it.width);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xMaxs);
  const pageWidth = maxX - minX;
  const midX = minX + pageWidth / 2;

  // 4. Split lines into segments & count splits
  let splitCount = 0;
  const segments: LineSegment[] = [];
  const GUTTER_MIN_WIDTH = 15; // px
  const centerRange = pageWidth * 0.2; // gutter midpoint must be within 20% of page center

  for (const line of rawLines) {
    if (line.length === 0) continue;

    let splitIndex = -1;
    for (let j = 0; j < line.length - 1; j++) {
      const item1 = line[j];
      const item2 = line[j + 1];
      const rightSide1 = item1.x + item1.width;
      const leftSide2 = item2.x;
      const gapWidth = leftSide2 - rightSide1;
      const gapMid = (rightSide1 + leftSide2) / 2;

      if (gapWidth > GUTTER_MIN_WIDTH && Math.abs(gapMid - midX) < centerRange) {
        splitIndex = j;
        break;
      }
    }

    if (splitIndex !== -1) {
      splitCount++;
      segments.push(createSegment(line.slice(0, splitIndex + 1), 0));
      segments.push(createSegment(line.slice(splitIndex + 1), 1));
    } else {
      // Determine single line column index
      const first = line[0];
      const last = line[line.length - 1];
      const lineRight = last.x + last.width;
      const lineLeft = first.x;
      const lineWidth = lineRight - lineLeft;
      const lineCenter = (lineLeft + lineRight) / 2;

      let colIndex = -1;
      // In a dual-column layout, each column is less than 50% width.
      // We check if the segment width is smaller than 55% of the page width.
      // If so, we assign it to left/right column based on its center alignment relative to the page middle.
      if (lineWidth < pageWidth * 0.55) {
        if (lineCenter < midX) {
          colIndex = 0; // Left column
        } else {
          colIndex = 1; // Right column
        }
      }
      segments.push(createSegment(line, colIndex));
    }
  }

  // 5. Layout classification
  const isDoubleColumn = splitCount >= 3 || (rawLines.length > 0 && splitCount / rawLines.length > 0.08);

  // 6. Segment ordering (reading flow reconstruction)
  let orderedSegments: LineSegment[] = [];
  if (!isDoubleColumn) {
    // Single column: map all to col 0, sort by Y
    for (const seg of segments) {
      seg.columnIndex = 0;
      seg.section = 'left';
    }
    orderedSegments = [...segments].sort((a, b) => a.y - b.y);
  } else {
    // Double column: partition header, left col, right col, footer
    const colSegments = segments.filter(seg => seg.columnIndex === 0 || seg.columnIndex === 1);
    const bodyMinY = colSegments.length > 0 ? Math.min(...colSegments.map(s => s.y)) : 0;
    const bodyMaxY = colSegments.length > 0 ? Math.max(...colSegments.map(s => s.y + s.height)) : viewport.height;

    const headerGroup: LineSegment[] = [];
    const leftGroup: LineSegment[] = [];
    const rightGroup: LineSegment[] = [];
    const footerGroup: LineSegment[] = [];

    const bodyMidY = (bodyMinY + bodyMaxY) / 2;

    for (const seg of segments) {
      if (seg.columnIndex === 0) {
        seg.section = 'left';
        leftGroup.push(seg);
      } else if (seg.columnIndex === 1) {
        seg.section = 'right';
        rightGroup.push(seg);
      } else {
        // Full-width (columnIndex === -1)
        if (seg.y < bodyMinY) {
          seg.section = 'header';
          headerGroup.push(seg);
        } else if (seg.y > bodyMaxY) {
          seg.section = 'footer';
          footerGroup.push(seg);
        } else {
          // Middle full-width: assign depending on vertical half
          if (seg.y < bodyMidY) {
            seg.section = 'left';
            leftGroup.push(seg);
          } else {
            seg.section = 'right';
            rightGroup.push(seg);
          }
        }
      }
    }

    headerGroup.sort((a, b) => a.y - b.y);
    leftGroup.sort((a, b) => a.y - b.y);
    rightGroup.sort((a, b) => a.y - b.y);
    footerGroup.sort((a, b) => a.y - b.y);

    orderedSegments = [...headerGroup, ...leftGroup, ...rightGroup, ...footerGroup];
  }

  // 7. Dehyphenate segments in-place
  for (let i = 0; i < orderedSegments.length - 1; i++) {
    const current = orderedSegments[i];
    const next = orderedSegments[i + 1];
    if (current.columnIndex === next.columnIndex && current.str.endsWith('-') && current.str.length > 1) {
      const firstWordMatch = next.str.match(/^([a-zA-Z0-9]+)/);
      if (firstWordMatch) {
        const firstWord = firstWordMatch[1];
        current.str = current.str.slice(0, -1) + firstWord;
        next.str = next.str.slice(firstWord.length).trim();
      }
    }
  }

  // 8. Merge segments to paragraphs
  const logicalParas: LogicalParagraph[] = [];
  let paraBuf = '';
  let paraItems: ColLayoutItem[] = [];
  let paraId = 0;
  let currentColumnIndex: number | null = null;
  let currentSection: 'header' | 'left' | 'right' | 'footer' | null = null;

  function flush() {
    if (!paraBuf.trim()) { paraBuf = ''; paraItems = []; return; }
    logicalParas.push({
      id: `p-${paraId++}`,
      text: paraBuf.trim(),
      items: [...paraItems],
      section: currentSection || 'left'
    });
    paraBuf = '';
    paraItems = [];
  }

  for (let i = 0; i < orderedSegments.length; i++) {
    const seg = orderedSegments[i];
    const segText = seg.str;
    if (!segText) continue;

    const nextSeg = orderedSegments[i + 1];
    const isNewColumn = currentColumnIndex !== null && seg.columnIndex !== currentColumnIndex;
    const isNewSection = currentSection !== null && seg.section !== currentSection;

    if (isNewColumn || isNewSection) {
      flush();
    }

    currentColumnIndex = seg.columnIndex;
    currentSection = seg.section;
    paraBuf += (paraBuf ? ' ' : '') + segText;
    paraItems.push(...seg.items);

    const lineH = seg.height;
    const thisY = seg.y;
    const nextY = nextSeg?.y;
    const yGap = nextY ? (nextY - thisY) : Infinity;

    const endsWithPunct = /[.!?]$/.test(segText);
    const lineW = seg.width;
    const isParaEnd = !nextSeg ||
                      nextSeg.columnIndex !== currentColumnIndex ||
                      nextSeg.section !== currentSection ||
                      yGap > lineH * 2.3 ||
                      (endsWithPunct && lineW < 180);

    if (isParaEnd) flush();
  }
  flush();

  // 9. Render spans and compute paragraph bounding boxes
  const sentenceMap = new Map<string, Sentence>();
  const spanToSentence = new Map<HTMLSpanElement, string>();
  const paragraphs: Paragraph[] = [];

  let sentenceId = 0;
  for (const para of logicalParas) {
    if (!para.items.length) continue;

    // Compute bounding box
    const xs = para.items.map(it => it.x);
    const ys = para.items.map(it => it.y);
    const xMaxs = para.items.map(it => it.x + it.width);
    const yMaxs = para.items.map(it => it.y + it.height);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xMaxs) - x;
    const height = Math.max(...yMaxs) - y;
    const fontSize = para.items.reduce((sum, it) => sum + it.height, 0) / para.items.length;

    paragraphs.push({
      id: para.id,
      text: para.text,
      x,
      y,
      width,
      height,
      fontSize,
      section: para.section
    });

    // Split paragraph into sentences for highlight/selection
    const sents = splitParagraphIntoSentences(para);
    for (const sent of sents) {
      if (!sent.text || sent.text.length < 5) continue;
      const sid = String(sentenceId++);
      const spans: HTMLSpanElement[] = [];

      for (const item of sent.items) {
        const span = document.createElement('span');
        span.textContent = item.str;
        span.dataset.sentenceId = sid;
        span.style.left = item.x + 'px';
        span.style.top = item.y + 'px';
        span.style.fontSize = item.height + 'px';
        container.appendChild(span);
        spans.push(span);
        spanToSentence.set(span, sid);
      }

      sentenceMap.set(sid, { id: sid, text: sent.text, spans });
    }
  }

  return {
    sentences: sentenceMap,
    spanToSentence,
    paragraphs,
    columnsCount: isDoubleColumn ? 2 : 1
  };
}

// ── Helper functions ──

function createSegment(lineItems: ColLayoutItem[], colIndex: number): LineSegment {
  const xs = lineItems.map(it => it.x);
  const ys = lineItems.map(it => it.y);
  const xMaxs = lineItems.map(it => it.x + it.width);
  const yMaxs = lineItems.map(it => it.y + it.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xMaxs) - x;
  const height = Math.max(...yMaxs) - y;
  const str = lineItems.map(it => it.str).join(' ').trim();

  return {
    items: lineItems,
    x,
    y,
    width,
    height,
    columnIndex: colIndex,
    str,
    section: 'left'
  };
}

function splitParagraphIntoSentences(para: LogicalParagraph): SentenceItem[] {
  const result: SentenceItem[] = [];
  const segs = splitIntoSentences(para.text);
  let pos = 0;
  for (const seg of segs) {
    const start = pos;
    const end = pos + seg.length;
    const count = para.items.length;
    const s0 = Math.floor((start / para.text.length) * count);
    const s1 = Math.max(s0 + 1, Math.ceil((end / para.text.length) * count));
    const txt = seg.trim();
    if (txt.length >= 5) {
      result.push({ text: txt, items: para.items.slice(s0, s1) });
    }
    pos = end;
  }
  return result;
}

function splitIntoSentences(text: string): string[] {
  const results: string[] = [];
  const re = /[^.!?]*[.!?]+(?:\s|$)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text)) !== null) {
    results.push(m[0]);
    last = re.lastIndex;
  }
  if (last < text.length) results.push(text.slice(last));
  return results.filter(s => s.trim().length > 2);
}

function isMathArtifact(str: string): boolean {
  // LaTeX commands
  if (/^\\[a-zA-Z]+/.test(str)) return true;

  // Pure math symbols (single char)
  if (str.length === 1 && /[∫∑∏∞∂√∇×±≤≥→←↑↓↔⇒⇐⇔ℕℝℂℤ]/.test(str)) return true;

  // Filter only if it has no alphanumeric characters and length > 1 (e.g. operators like "+-", "<=")
  if (str.length > 1 && !/[a-zA-Z0-9]/.test(str)) return true;

  return false;
}
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
  section: 'header' | 'left' | 'right' | 'footer' | 'full';
  sentences?: Array<{ id: string; text: string }>;
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
  section: 'header' | 'left' | 'right' | 'footer' | 'full';
}

interface LogicalParagraph {
  id: string;
  text: string;
  items: ColLayoutItem[];
  section: 'header' | 'left' | 'right' | 'footer' | 'full';
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
      str: item.str.trim(),
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

  // 2b. Filter out running headers and footers using content analysis
  const filteredRawLines: ColLayoutItem[][] = [];
  for (const line of rawLines) {
    if (line.length === 0) continue;
    const lineStr = line.map(it => it.str).join(' ').trim();
    const lineY = line[0].y;
    if (isRunningHeaderFooter(lineStr, lineY, viewport.height)) {
      continue;
    }
    filteredRawLines.push(line);
  }

  // 3. Find page horizontal bounds from body text lines
  const bodyItems = filteredRawLines.flat();
  if (bodyItems.length === 0) {
    return { sentences: new Map(), spanToSentence: new Map(), paragraphs: [], columnsCount: 1 };
  }
  const xs = bodyItems.map(it => it.x);
  const xMaxs = bodyItems.map(it => it.x + it.width);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xMaxs);
  const pageWidth = maxX - minX;
  const midX = minX + pageWidth / 2;

  // 4. Split lines into segments & count splits (Two-pass analysis for hybrid layouts)
  let splitCount = 0;
  const splitLineYs: number[] = [];
  const GUTTER_MIN_WIDTH = 15; // px
  const centerRange = pageWidth * 0.2; // gutter midpoint must be within 20% of page center

  // Pass 1: Find split count and Y-coordinates of physically split lines
  for (const line of filteredRawLines) {
    if (line.length === 0) continue;
    let hasSplit = false;
    for (let j = 0; j < line.length - 1; j++) {
      const item1 = line[j];
      const item2 = line[j + 1];
      const rightSide1 = item1.x + item1.width;
      const leftSide2 = item2.x;
      const gapWidth = leftSide2 - rightSide1;
      const gapMid = (rightSide1 + leftSide2) / 2;

      if (gapWidth > GUTTER_MIN_WIDTH && Math.abs(gapMid - midX) < centerRange) {
        hasSplit = true;
        break;
      }
    }
    if (hasSplit) {
      splitCount++;
      splitLineYs.push(line[0].y);
    }
  }

  // 5. Layout classification
  const isDoubleColumn = splitCount >= 3 || (filteredRawLines.length > 0 && splitCount / filteredRawLines.length > 0.08);

  // Group split lines into continuous DoubleColumnZones
  const doubleColumnZones: Array<{ minY: number; maxY: number }> = [];
  if (isDoubleColumn && splitLineYs.length > 0) {
    splitLineYs.sort((a, b) => a - b);
    let currentZone = { minY: splitLineYs[0], maxY: splitLineYs[0] };
    for (let i = 1; i < splitLineYs.length; i++) {
      const y = splitLineYs[i];
      if (y - currentZone.maxY < 150) {
        currentZone.maxY = y;
      } else {
        doubleColumnZones.push(currentZone);
        currentZone = { minY: y, maxY: y };
      }
    }
    doubleColumnZones.push(currentZone);
  }

  // Expand double-column zones slightly (by 30px padding) to capture column start/end boundaries
  const expandedZones = doubleColumnZones.map(zone => ({
    minY: zone.minY - 30,
    maxY: zone.maxY + 30
  }));

  // Pass 2: Split lines into segments & assign column indices
  const segments: LineSegment[] = [];
  for (const line of filteredRawLines) {
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
      // In a dual-column layout, we restrict column 0/1 assignment to lines inside a DoubleColumnZone.
      if (isDoubleColumn) {
        const lineY = line[0].y;
        const inDoubleColumnZone = expandedZones.some(zone => lineY >= zone.minY && lineY <= zone.maxY);
        if (inDoubleColumnZone && lineWidth < pageWidth * 0.55) {
          if (lineCenter < midX) {
            colIndex = 0; // Left column
          } else {
            colIndex = 1; // Right column
          }
        }
      }
      segments.push(createSegment(line, colIndex));
    }
  }

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
    // Double column page: group segments into blocks of 'single' (columnIndex === -1)
    // and 'double' (columnIndex === 0 or 1) based on their Y-sorted order.
    const sortedSegs = [...segments].sort((a, b) => a.y - b.y);
    const blocks: Array<{ type: 'single' | 'double'; segments: LineSegment[] }> = [];

    for (const seg of sortedSegs) {
      const type = seg.columnIndex === -1 ? 'single' : 'double';
      if (blocks.length === 0 || blocks[blocks.length - 1].type !== type) {
        blocks.push({ type, segments: [seg] });
      } else {
        blocks[blocks.length - 1].segments.push(seg);
      }
    }

    const firstDoubleIndex = blocks.findIndex(b => b.type === 'double');
    const lastDoubleIndex = blocks.map(b => b.type).lastIndexOf('double');

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const block = blocks[bIdx];
      if (block.type === 'single') {
        let section: 'header' | 'footer' | 'left' | 'full' = 'left';
        if (firstDoubleIndex !== -1) {
          if (bIdx < firstDoubleIndex) {
            section = 'header';
          } else if (bIdx > lastDoubleIndex) {
            section = 'footer';
          } else {
            section = 'full';
          }
        }
        for (const seg of block.segments) {
          seg.section = section;
          seg.columnIndex = -1; // Keep as full-width
          orderedSegments.push(seg);
        }
      } else {
        const leftGroup: LineSegment[] = [];
        const rightGroup: LineSegment[] = [];
        for (const seg of block.segments) {
          if (seg.columnIndex === 0) {
            seg.section = 'left';
            leftGroup.push(seg);
          } else if (seg.columnIndex === 1) {
            seg.section = 'right';
            rightGroup.push(seg);
          } else {
            seg.section = 'left';
            leftGroup.push(seg);
          }
        }
        leftGroup.sort((a, b) => a.y - b.y);
        rightGroup.sort((a, b) => a.y - b.y);
        orderedSegments.push(...leftGroup, ...rightGroup);
      }
    }
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

        // Mutate corresponding ColLayoutItems in-place to keep them in sync with logical string
        if (current.items.length > 0 && next.items.length > 0) {
          const lastItem = current.items[current.items.length - 1];
          const firstItem = next.items[0];

          if (lastItem.str.endsWith('-')) {
            lastItem.str = lastItem.str.slice(0, -1) + firstWord;
          } else {
            lastItem.str += firstWord;
          }

          if (firstItem.str.startsWith(firstWord)) {
            firstItem.str = firstItem.str.slice(firstWord.length);
          } else {
            const idx = firstItem.str.indexOf(firstWord);
            if (idx !== -1) {
              firstItem.str = firstItem.str.slice(0, idx) + firstItem.str.slice(idx + firstWord.length);
            }
          }
        }
      }
    }
  }

  // 8. Merge segments to paragraphs
  const logicalParas: LogicalParagraph[] = [];
  let paraBuf = '';
  let paraItems: ColLayoutItem[] = [];
  let paraId = 0;
  let currentColumnIndex: number | null = null;
  let currentSection: 'header' | 'left' | 'right' | 'footer' | 'full' | null = null;

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

    const sentsList: Array<{ id: string; text: string }> = [];

    // Split paragraph into sentences for highlight/selection
    const sents = splitParagraphIntoSentences(para);
    for (const sent of sents) {
      if (!sent.text || sent.text.length < 5) continue;
      const sid = String(sentenceId++);
      sentsList.push({ id: sid, text: sent.text });
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

    paragraphs.push({
      id: para.id,
      text: para.text,
      x,
      y,
      width,
      height,
      fontSize,
      section: para.section,
      sentences: sentsList
    });
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

function computeItemOffsets(text: string, items: ColLayoutItem[]): Array<{ start: number; end: number }> {
  const offsets: Array<{ start: number; end: number }> = [];
  let currentIndex = 0;

  for (const item of items) {
    const str = item.str;
    if (!str) {
      offsets.push({ start: currentIndex, end: currentIndex });
      continue;
    }

    let start = text.indexOf(str, currentIndex);
    if (start === -1) {
      // Fallback 1: case-insensitive search
      const lowerText = text.toLowerCase();
      const lowerStr = str.toLowerCase();
      start = lowerText.indexOf(lowerStr, currentIndex);
    }

    if (start === -1) {
      // Fallback 2: align at the current index
      start = currentIndex;
    }

    const end = start + str.length;
    offsets.push({ start, end });
    currentIndex = end;
  }

  return offsets;
}

function splitParagraphIntoSentences(para: LogicalParagraph): SentenceItem[] {
  const result: SentenceItem[] = [];
  const offsets = computeItemOffsets(para.text, para.items);
  const segs = splitIntoSentences(para.text);
  let pos = 0;
  for (const seg of segs) {
    const start = pos;
    const end = pos + seg.length;
    const txt = seg.trim();
    if (txt.length >= 5) {
      const sentenceItems: ColLayoutItem[] = [];
      for (let idx = 0; idx < para.items.length; idx++) {
        const offset = offsets[idx];
        const itemCenter = (offset.start + offset.end) / 2;
        if (itemCenter >= start && itemCenter <= end) {
          sentenceItems.push(para.items[idx]);
        }
      }
      result.push({ text: txt, items: sentenceItems });
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

function isRunningHeaderFooter(lineStr: string, lineY: number, viewportHeight: number): boolean {
  const isTopRegion = lineY < viewportHeight * 0.08;
  const isBottomRegion = lineY > viewportHeight * 0.92;

  if (!isTopRegion && !isBottomRegion) return false;

  const trimmed = lineStr.trim();
  if (!trimmed) return false;

  // 1. Page number patterns (e.g., "123", "Page 123", "123 of 456", "[123]", "- 123 -")
  if (/^\d+$/.test(trimmed)) return true;
  if (/^page\s+\d+$/i.test(trimmed)) return true;
  if (/^\d+\s+of\s+\d+$/i.test(trimmed)) return true;
  if (/^-\s*\d+\s*-$/.test(trimmed)) return true;
  if (/^\[\s*\d+\s*\]$/.test(trimmed)) return true;
  if (/^•\s*\d+\s*•$/.test(trimmed)) return true;

  // 2. Copyright and publication metadata
  const lower = trimmed.toLowerCase();
  if (lower.includes('copyright') || lower.includes('©') || lower.includes('all rights reserved')) return true;
  if (lower.includes('doi:') || lower.includes('doi.org')) return true;
  if (lower.includes('issn') || lower.includes('e-issn') || lower.includes('eissn')) return true;
  if (lower.includes('http://') || lower.includes('https://') || lower.includes('www.')) return true;
  
  // Volume, issue, year info (e.g. "Vol. 12, No. 4, 2023", "Cancer Research 2024;84:1-10")
  if (/\bvol\.\s*\d+/i.test(trimmed) || /\bno\.\s*\d+/i.test(trimmed)) return true;
  if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(trimmed)) return true;

  // 3. Short lines at the extreme edges (e.g., journal abbreviations like "Nat. Commun.")
  const isExtremeTop = lineY < viewportHeight * 0.05;
  const isExtremeBottom = lineY > viewportHeight * 0.95;
  if ((isExtremeTop || isExtremeBottom) && trimmed.length < 40) {
    return true;
  }

  return false;
}
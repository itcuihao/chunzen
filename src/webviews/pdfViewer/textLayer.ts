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
  bold?: boolean;
  blockType?: BlockType;
}

interface ColLayoutItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
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

export type BlockType =
  | 'title'
  | 'authors'
  | 'heading'
  | 'body'
  | 'table'
  | 'figure-caption'
  | 'reference'
  | 'unknown';

interface StructuralBlock {
  type: BlockType;
  segments: LineSegment[];
}

interface LogicalParagraph {
  id: string;
  text: string;
  items: ColLayoutItem[];
  section: 'header' | 'left' | 'right' | 'footer' | 'full';
  blockType?: BlockType;
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
      height: item.height * viewport.scale,
      fontName: item.fontName || ''
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

  // 7b. Compute column left margins for indent detection
  const columnMargins = new Map<number, { left: number; width: number }>();
  for (const seg of orderedSegments) {
    if (seg.columnIndex < 0) continue;
    const key = seg.columnIndex;
    if (!columnMargins.has(key)) {
      columnMargins.set(key, { left: seg.x, width: seg.width });
    } else {
      const entry = columnMargins.get(key)!;
      entry.left = Math.min(entry.left, seg.x);
    }
  }

  // 8. Two-pass: detect structural blocks, then segment into paragraphs
  const blocks = detectStructuralBlocks(orderedSegments, columnMargins, pageWidth);

  const logicalParas: LogicalParagraph[] = [];
  let paraId = 0;
  for (const block of blocks) {
    const result = segmentBlockIntoParas(block, columnMargins, pageWidth, paraId);
    for (const para of result.paras) {
      para.blockType = block.type;
      logicalParas.push(para);
    }
    paraId = result.nextParaId;
  }

  // 8b. Post-pass: classify title/authors from first body blocks
  const fontSizes = logicalParas.map(p => p.items.reduce((s, it) => s + it.height, 0) / (p.items.length || 1));
  const sortedSizes = [...fontSizes].filter(s => s > 0).sort((a, b) => a - b);
  const medianSize = sortedSizes.length > 0 ? sortedSizes[Math.floor(sortedSizes.length / 2)] : 0;

  if (logicalParas.length > 0 && logicalParas[0].blockType === 'body') {
    const firstSize = fontSizes[0];
    if (firstSize > medianSize * 1.5) {
      logicalParas[0].blockType = 'title';
      // Check if next paragraph is authors (small text, contains commas/affiliations)
      if (logicalParas.length > 1 && logicalParas[1].blockType === 'body') {
        const secondSize = fontSizes[1];
        const secondText = logicalParas[1].text;
        if (secondSize < medianSize * 1.1 && (secondText.includes(',') || secondText.includes('@') || secondText.includes('University'))) {
          logicalParas[1].blockType = 'authors';
        }
      }
    }
  }

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

    // Detect bold: check if majority of items (by text length) use a bold font
    const boldScore = para.items.reduce((score, it) => {
      return isBoldFont(it.fontName) ? score + it.str.length : score;
    }, 0);
    const totalLen = para.items.reduce((sum, it) => sum + it.str.length, 0);
    const isBold = totalLen > 0 && (boldScore / totalLen) > 0.5;

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
      sentences: sentsList,
      bold: isBold || undefined,
      blockType: para.blockType,
    });
  }

  return {
    sentences: sentenceMap,
    spanToSentence,
    paragraphs,
    columnsCount: isDoubleColumn ? 2 : 1
  };
}

// ── Block detection predicates ──

function isHeadingSegment(seg: LineSegment): boolean {
  if (seg.items.length === 0) return false;
  if (!isBoldFont(seg.items[0].fontName)) return false;
  const text = seg.str.trim();
  if (text.length > 80) return false;
  return true;
}

function isFigureCaptionSegment(seg: LineSegment): boolean {
  const text = seg.str.trim();
  return /^(Figure|Fig\.?|Table)\s+\d/i.test(text);
}

function isReferenceStart(str: string): boolean {
  const text = str.trim();
  if (/^\[\d+\]/.test(text)) return true;
  if (/^\[\d+[,;]/.test(text)) return true;
  if (/^\d{1,3}\.\s/.test(text) && text.length > 10) return true;
  if (/^[A-Z][a-z]+\s+[A-Z]/.test(text) && /\b(19|20)\d{2}\b/.test(text)) return true;
  return false;
}

function isTableSegmentRow(segments: LineSegment[], i: number, colWidth: number): boolean {
  if (i + 2 >= segments.length) return false;
  const seg = segments[i];
  const seg1 = segments[i + 1];
  const seg2 = segments[i + 2];

  // All three segments must be short (< 65% column width) and in same column
  if (seg.width > colWidth * 0.65) return false;
  if (seg1.width > colWidth * 0.65) return false;
  if (seg2.width > colWidth * 0.65) return false;

  // Tight Y gaps
  const gap1 = Math.abs(seg1.y - seg.y);
  const gap2 = Math.abs(seg2.y - seg1.y);
  const lineH = Math.max(seg.height, 1);
  if (gap1 > lineH * 2.0 || gap2 > lineH * 2.0) return false;

  // At least 2 of 3 contain numeric data
  let numericCount = 0;
  for (const s of [seg, seg1, seg2]) {
    if (/\d/.test(s.str)) numericCount++;
  }
  if (numericCount < 2) return false;

  // Check for vertically aligned x-positions across the three segments (tabular structure)
  const allItems = [...seg.items, ...seg1.items, ...seg2.items];
  const xPositions = allItems.map(it => Math.round(it.x / 5) * 5);
  const uniqueX = new Set(xPositions);
  if (uniqueX.size >= 3) return true;

  return false;
}

// ── Pass 1: detect structural blocks ──

function detectStructuralBlocks(
  segments: LineSegment[],
  columnMargins: Map<number, { left: number; width: number }>,
  pageWidth: number
): StructuralBlock[] {
  const blocks: StructuralBlock[] = [];
  let i = 0;
  let pastReferencesHeading = false;

  while (i < segments.length) {
    const seg = segments[i];
    const text = seg.str.trim();
    if (!text) { i++; continue; }

    // Reference section gate
    if (isHeadingSegment(seg) && /^(references|bibliography|works?\s+cited)/i.test(text)) {
      blocks.push({ type: 'heading', segments: [seg] });
      pastReferencesHeading = true;
      i++;
      continue;
    }

    if (pastReferencesHeading) {
      const refSegs: LineSegment[] = [];
      while (i < segments.length) {
        const cur = segments[i];
        if (!cur.str.trim()) { i++; continue; }
        if (isHeadingSegment(cur)) break;
        if (isFigureCaptionSegment(cur)) break;
        if (refSegs.length === 0 || isReferenceStart(cur.str) || isContinuationOfReference(cur, refSegs[refSegs.length - 1])) {
          refSegs.push(cur);
          i++;
        } else {
          break;
        }
      }
      if (refSegs.length > 0) {
        blocks.push({ type: 'reference', segments: refSegs });
        continue;
      }
    }

    // Figure caption
    if (isFigureCaptionSegment(seg)) {
      const captionSegs = [seg];
      i++;
      while (i < segments.length) {
        const next = segments[i];
        if (!next.str.trim() || isHeadingSegment(next) || isFigureCaptionSegment(next)) break;
        if (next.columnIndex !== seg.columnIndex && next.columnIndex >= 0) break;
        captionSegs.push(next);
        i++;
      }
      blocks.push({ type: 'figure-caption', segments: captionSegs });
      continue;
    }

    // Heading
    if (isHeadingSegment(seg)) {
      blocks.push({ type: 'heading', segments: [seg] });
      i++;
      continue;
    }

    // Table detection (lookahead)
    const colWidth = columnMargins.get(seg.columnIndex)?.width ?? pageWidth;
    if (isTableSegmentRow(segments, i, colWidth)) {
      const tableSegs = [seg];
      i++;
      while (i < segments.length && isTableSegmentRow(segments, i, colWidth)) {
        tableSegs.push(segments[i]);
        i++;
      }
      // Also collect trailing short lines that are part of the table
      while (i < segments.length) {
        const next = segments[i];
        if (!next.str.trim()) break;
        if (next.width > colWidth * 0.7) break;
        if (isHeadingSegment(next) || isFigureCaptionSegment(next)) break;
        // Check Y gap - must be close to previous table row
        const prev = tableSegs[tableSegs.length - 1];
        if (Math.abs(next.y - prev.y) > Math.max(prev.height, 1) * 2.5) break;
        tableSegs.push(next);
        i++;
      }
      blocks.push({ type: 'table', segments: tableSegs });
      continue;
    }

    // Body (default)
    const bodySegs = [seg];
    i++;
    while (i < segments.length) {
      const next = segments[i];
      if (!next.str.trim()) { i++; continue; }
      if (isHeadingSegment(next)) break;
      if (isFigureCaptionSegment(next)) break;
      const nextColWidth = columnMargins.get(next.columnIndex)?.width ?? pageWidth;
      if (isTableSegmentRow(segments, i, nextColWidth)) break;
      if (isHeadingSegment(next) && /^(references|bibliography)/i.test(next.str.trim())) break;
      bodySegs.push(next);
      i++;
    }
    blocks.push({ type: 'body', segments: bodySegs });
  }

  return blocks;
}

function isContinuationOfReference(cur: LineSegment, prev: LineSegment): boolean {
  if (isReferenceStart(cur.str)) return true;
  if (cur.columnIndex !== prev.columnIndex) return false;
  const yGap = Math.abs(cur.y - prev.y);
  const lineH = Math.max(prev.height, 1);
  return yGap < lineH * 1.8;
}

// ── Pass 2: segment blocks into paragraphs ──

function segmentBlockIntoParas(
  block: StructuralBlock,
  columnMargins: Map<number, { left: number; width: number }>,
  pageWidth: number,
  paraIdStart: number
): { paras: LogicalParagraph[]; nextParaId: number } {
  const paras: LogicalParagraph[] = [];
  let paraId = paraIdStart;

  const flushPara = (text: string, items: ColLayoutItem[], section: 'header' | 'left' | 'right' | 'footer' | 'full') => {
    if (!text.trim()) return;
    paras.push({
      id: `p-${paraId++}`,
      text: text.trim(),
      items: [...items],
      section,
    });
  };

  const segs = block.segments.filter(s => s.str.trim());

  switch (block.type) {
    case 'title':
    case 'authors':
    case 'heading':
    case 'figure-caption': {
      // Entire block = one paragraph
      if (segs.length === 0) break;
      const allText = segs.map(s => s.str).join(' ').trim();
      const allItems = segs.flatMap(s => s.items);
      flushPara(allText, allItems, segs[0].section);
      break;
    }

    case 'table': {
      // Each segment row = one paragraph, tab-separated cells
      for (const seg of segs) {
        let text = '';
        for (let j = 0; j < seg.items.length; j++) {
          if (j > 0) {
            const prevRight = seg.items[j - 1].x + seg.items[j - 1].width;
            const gap = seg.items[j].x - prevRight;
            text += gap > seg.items[j].height * 0.5 ? '\t' : ' ';
          }
          text += seg.items[j].str;
        }
        flushPara(text, seg.items, seg.section);
      }
      break;
    }

    case 'reference': {
      // Split by reference entry boundaries
      let refBuf = '';
      let refItems: ColLayoutItem[] = [];
      let refSection: 'header' | 'left' | 'right' | 'footer' | 'full' = 'left';

      for (const seg of segs) {
        if (isReferenceStart(seg.str) && refBuf.trim()) {
          flushPara(refBuf, refItems, refSection);
          refBuf = '';
          refItems = [];
        }
        refBuf += (refBuf ? ' ' : '') + seg.str;
        refItems.push(...seg.items);
        refSection = seg.section;
      }
      if (refBuf.trim()) flushPara(refBuf, refItems, refSection);
      break;
    }

    case 'body':
    case 'unknown':
    default: {
      // Body paragraph heuristics: indent, Y gap, punctuation, font change
      let paraBuf = '';
      let paraItems: ColLayoutItem[] = [];
      let currentColumnIndex: number | null = null;
      let currentSection: 'header' | 'left' | 'right' | 'footer' | 'full' | null = null;

      const flushBody = () => {
        if (!paraBuf.trim()) { paraBuf = ''; paraItems = []; return; }
        paras.push({
          id: `p-${paraId++}`,
          text: paraBuf.trim(),
          items: [...paraItems],
          section: currentSection || 'left',
        });
        paraBuf = '';
        paraItems = [];
      };

      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const segText = seg.str;
        if (!segText) continue;

        const nextSeg = segs[si + 1];
        const isNewColumn = currentColumnIndex !== null && seg.columnIndex !== currentColumnIndex;
        const isNewSection = currentSection !== null && seg.section !== currentSection;

        if (isNewColumn || isNewSection) {
          flushBody();
        }

        const colMargin = columnMargins.get(nextSeg?.columnIndex ?? -1);
        const nextHasIndent = nextSeg && colMargin &&
          nextSeg.columnIndex >= 0 &&
          nextSeg.x - colMargin.left > seg.height * 1.5;

        const curBold = seg.items.length > 0 && isBoldFont(seg.items[0].fontName);
        const nextBold = nextSeg && nextSeg.items.length > 0 && isBoldFont(nextSeg.items[0].fontName);
        const fontChanged = nextSeg && curBold !== nextBold;

        currentColumnIndex = seg.columnIndex;
        currentSection = seg.section;
        paraBuf += (paraBuf ? ' ' : '') + segText;
        paraItems.push(...seg.items);

        const lineH = seg.height;
        const thisY = seg.y;
        const nextY = nextSeg?.y;
        const yGap = nextY ? (nextY - thisY) : Infinity;

        const endsWithPunct = /[.!?]$/.test(segText);
        const colWidth = columnMargins.get(seg.columnIndex)?.width || pageWidth;
        const isNarrowLine = seg.width < colWidth * 0.75;

        const isParaEnd = !nextSeg ||
                          nextSeg.columnIndex !== currentColumnIndex ||
                          nextSeg.section !== currentSection ||
                          yGap > lineH * 2.0 ||
                          (endsWithPunct && isNarrowLine) ||
                          (endsWithPunct && nextHasIndent) ||
                          fontChanged;

        if (isParaEnd) flushBody();
      }
      flushBody();
      break;
    }
  }

  return { paras, nextParaId: paraId };
}

// ── Existing Helper functions ──

function isBoldFont(fontName: string): boolean {
  if (!fontName) return false;
  const lower = fontName.toLowerCase();
  return /bold|heavy|black|demi|extrabold|semibold|medium/i.test(lower);
}

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
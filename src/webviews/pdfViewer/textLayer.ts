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
  columnIndex?: number;
  sentences?: Array<{ id: string; text: string }>;
  bold?: boolean;
  blockType?: BlockType;
}

export interface LayoutHints {
  columnsCount?: number;
  gutters?: number[];
  sidebarGutterX?: number;
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
  columnIndex?: number;
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
  viewport: PdfViewport,
  options?: {
    layoutHints?: LayoutHints;
  }
): {
  sentences: Map<string, Sentence>;
  spanToSentence: Map<HTMLSpanElement, string>;
  paragraphs: Paragraph[];
  columnsCount: number;
} {
  container.innerHTML = '';

  // 1. Transform to layout coordinates and filter math/headers
  const headerY = viewport.height * 0.02;
  const footerY = viewport.height * 0.98;
  const allItems: ColLayoutItem[] = [];

  // ── 字体频率分析：先统计每个 fontName 出现的字符数 ──
  // PDF.js 使用混淆名（g_d0_f1 等），不含 bold 关键词
  // 策略：字符数最多的字体 = 正文字体，其余字体 = 非正文（可能是标题/粗体）
  const fontCharCount = new Map<string, number>();
  for (const item of items) {
    if (!item.str || !item.str.trim() || !item.fontName) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    if (!tx || isNaN(tx[4]) || isNaN(tx[5])) continue;
    if (tx[5] < headerY || tx[5] > footerY) continue;
    fontCharCount.set(
      item.fontName,
      (fontCharCount.get(item.fontName) || 0) + item.str.length
    );
  }

  // 找出正文字体（字符数最多的）
  let bodyFont = '';
  let bodyFontCount = 0;
  for (const [name, count] of fontCharCount) {
    if (count > bodyFontCount) {
      bodyFontCount = count;
      bodyFont = name;
    }
  }
  // 将正文字体暴露给辅助函数
  _bodyFont = bodyFont;
  _fontCharCountMap = new Map(fontCharCount);
  _totalFontChars = [...fontCharCount.values()].reduce((s, n) => s + n, 0);

  console.log('[ChunZen] Font frequency:', [...fontCharCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
  console.log('[ChunZen] Body font (most frequent):', bodyFont);

  // Debug: collect unique font names
  const fontNames = new Set<string>();

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    if (!tx || isNaN(tx[4]) || isNaN(tx[5])) continue;

    // Filter math symbols and LaTeX commands
    if (isMathArtifact(item.str)) continue;

    // Skip header/footer region (only if extreme outer margins)
    if (tx[5] < headerY || tx[5] > footerY) continue;

    const scaledH = item.height * viewport.scale;
    // Filter affiliation superscript number clusters (e.g. "29 30", "1,2,3")
    // Heuristic: pure digit/comma/space string with small font height
    if (isAffiliationClutter(item.str, scaledH)) continue;

    const w = item.width * viewport.scale;
    allItems.push({
      str: item.str.trim(),
      x: tx[4],
      y: tx[5],
      width: w,
      height: scaledH,
      fontName: item.fontName || ''
    });
    fontNames.add(item.fontName || '');
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

  // 5b. Sidebar detection
  // Pattern: left column = wide main text, right column = narrow sidebar (e.g. Sections TOC box).
  // This can appear in both single-column and double-column pages.
  let hasSidebar = false;
  let sidebarGutterX = 0;
  {
    // Find items that cluster on the right side (x-center > 60% of page) and are narrow.
    const flatItems = filteredRawLines.flat();
    const narrowRight = flatItems.filter(it => {
      const center = it.x + it.width / 2;
      return center > minX + pageWidth * 0.55 && it.width < pageWidth * 0.45;
    });
    const narrowLeft = flatItems.filter(it => {
      const center = it.x + it.width / 2;
      return center < minX + pageWidth * 0.55 && it.width < pageWidth * 0.7;
    });
    const hasSidebarHeading = filteredRawLines.some(line => /^(sections?|contents?)$/i.test(composeLineText(line)));

    if (narrowRight.length >= 3 && narrowLeft.length > narrowRight.length) {
      // Find the gap between left and right clusters.
      const leftMaxX = Math.max(...narrowLeft.map(it => it.x + it.width));
      const rightMinX = Math.min(...narrowRight.map(it => it.x));
      if (rightMinX - leftMaxX > GUTTER_MIN_WIDTH && (hasSidebarHeading || narrowRight.length <= narrowLeft.length * 0.55)) {
        hasSidebar = true;
        sidebarGutterX = (leftMaxX + rightMinX) / 2;
        console.log('[ChunZen] Sidebar detected, gutterX:', sidebarGutterX, 'isDoubleColumn=', isDoubleColumn);
      }
    }
  }
  let effectiveGutters = hasSidebar
    ? [sidebarGutterX]
    : (isDoubleColumn ? [midX] : []);
  let detectedColumnsCount = (hasSidebar || isDoubleColumn) ? 2 : 1;
  const baselineHasSidebar = hasSidebar;
  const baselineSidebarGutterX = sidebarGutterX;
  const baselineEffectiveGutters = [...effectiveGutters];
  const baselineDetectedColumnsCount = detectedColumnsCount;
  let modelHintsApplied = false;

  const hints = options?.layoutHints;
  if (hints) {
    modelHintsApplied = true;
    if (typeof hints.sidebarGutterX === 'number' && Number.isFinite(hints.sidebarGutterX)) {
      hasSidebar = true;
      sidebarGutterX = hints.sidebarGutterX;
      effectiveGutters = [sidebarGutterX];
      detectedColumnsCount = Math.max(detectedColumnsCount, 2);
    }
    if (Array.isArray(hints.gutters) && hints.gutters.length > 0) {
      const normalized = hints.gutters
        .filter((g) => Number.isFinite(g))
        .map((g) => Number(g))
        .sort((a, b) => a - b);
      if (normalized.length > 0) {
        effectiveGutters = normalized;
        detectedColumnsCount = Math.max(detectedColumnsCount, Math.min(2, normalized.length + 1));
      }
    }
    if (typeof hints.columnsCount === 'number' && Number.isFinite(hints.columnsCount)) {
      detectedColumnsCount = Math.max(1, Math.min(2, Math.round(hints.columnsCount)));
    }
  }
  // Low-confidence fallback: if model hints don't have enough geometric support,
  // revert to baseline pdf.js rule detection.
  if (modelHintsApplied && effectiveGutters.length > 0) {
    const bestSupport = effectiveGutters.reduce((best, g) => {
      return Math.max(best, computeGutterSupport(filteredRawLines, g, GUTTER_MIN_WIDTH));
    }, 0);
    const minSupport = Math.max(3, Math.floor(filteredRawLines.length * 0.06));
    const columnEvidence = effectiveGutters.length === 0
      ? 0
      : computeColumnEvidenceByLines(filteredRawLines, effectiveGutters[0], pageWidth);
    if (bestSupport < minSupport || columnEvidence < 0.18) {
      hasSidebar = baselineHasSidebar;
      sidebarGutterX = baselineSidebarGutterX;
      effectiveGutters = [...baselineEffectiveGutters];
      detectedColumnsCount = baselineDetectedColumnsCount;
    }
  }
  // Guard rail: current production parser only supports reliable single/double-column reconstruction.
  // If model returns multiple gutters, keep the strongest one to avoid pseudo-3-column fragmentation.
  if (!hasSidebar && effectiveGutters.length > 1) {
    const scored = effectiveGutters.map((g) => ({
      gutter: g,
      score: computeGutterSupport(filteredRawLines, g, GUTTER_MIN_WIDTH)
    }));
    scored.sort((a, b) => b.score - a.score);
    effectiveGutters = scored.length > 0 ? [scored[0].gutter] : [];
  }

  // Pass 2: Split lines into segments & assign column indices
  const segments: LineSegment[] = [];
  for (const line of filteredRawLines) {
    if (line.length === 0) continue;
    const lineLeft = line[0].x;
    const lineRight = line[line.length - 1].x + line[line.length - 1].width;
    const rawLineWidth = lineRight - lineLeft;

    const splitIndices = new Set<number>();
    if (effectiveGutters.length > 0 && (!hasSidebar || rawLineWidth < pageWidth * 0.72)) {
      // Prefer splitting around detected gutters so same-Y multi-column content doesn't get merged.
      for (let j = 0; j < line.length - 1; j++) {
        const item1 = line[j];
        const item2 = line[j + 1];
        const rightSide1 = item1.x + item1.width;
        const leftSide2 = item2.x;
        const gapWidth = leftSide2 - rightSide1;
        for (const gutterX of effectiveGutters) {
          const crossesGutter =
            rightSide1 <= gutterX + 3 &&
            leftSide2 >= gutterX - 3;
          if (crossesGutter && gapWidth > Math.max(GUTTER_MIN_WIDTH, item2.height * 0.6)) {
            splitIndices.add(j);
          }
        }
      }
    }

    if (splitIndices.size === 0) {
      for (let j = 0; j < line.length - 1; j++) {
        const item1 = line[j];
        const item2 = line[j + 1];
        const rightSide1 = item1.x + item1.width;
        const leftSide2 = item2.x;
        const gapWidth = leftSide2 - rightSide1;
        const gapMid = (rightSide1 + leftSide2) / 2;

        if (gapWidth > GUTTER_MIN_WIDTH && Math.abs(gapMid - midX) < centerRange) {
          splitIndices.add(j);
          break;
        }
      }
    }

    if (splitIndices.size > 0) {
      const sortedSplitIndices = [...splitIndices].sort((a, b) => a - b);
      let start = 0;
      for (const splitIndex of sortedSplitIndices) {
        const part = line.slice(start, splitIndex + 1);
        if (part.length > 0) {
          const partSeg = createSegment(part, estimateColumnIndex(part, effectiveGutters, pageWidth));
          segments.push(partSeg);
        }
        start = splitIndex + 1;
      }
      const tail = line.slice(start);
      if (tail.length > 0) {
        const tailSeg = createSegment(tail, estimateColumnIndex(tail, effectiveGutters, pageWidth));
        segments.push(tailSeg);
      }
    } else {
      // Determine single line column index
      const first = line[0];
      const last = line[line.length - 1];
      const lineRight = last.x + last.width;
      const lineLeft = first.x;
      const lineWidth = lineRight - lineLeft;
      const lineCenter = (lineLeft + lineRight) / 2;

      let colIndex = -1;
      if (hasSidebar) {
        // Sidebar layout: assign by x-position relative to detected gutter.
        // Only assign to col 1 if the line is to the right of the gutter and narrow.
        if (lineLeft >= sidebarGutterX - 5 && lineWidth < pageWidth * 0.45) {
          colIndex = 1; // Sidebar (right)
        } else if (lineRight <= sidebarGutterX + 5 || lineWidth >= pageWidth * 0.65) {
          colIndex = 0; // Main text (left) or full-width
        }
        // lineWidth between 0.45 and 0.65 of pageWidth stays colIndex = -1 (full-width)
      } else if (isDoubleColumn) {
        // In a dual-column layout, restrict column 0/1 to lines inside a DoubleColumnZone.
        const lineY = line[0].y;
        const inDoubleColumnZone = expandedZones.some(zone => lineY >= zone.minY && lineY <= zone.maxY);
        if (inDoubleColumnZone && lineWidth < pageWidth * 0.55) {
          colIndex = lineCenter < midX ? 0 : 1;
        }
      } else if (effectiveGutters.length > 0 && lineWidth < pageWidth * 0.82) {
        colIndex = estimateColumnIndex(line, effectiveGutters, pageWidth);
      }
      segments.push(createSegment(line, colIndex));
    }
  }

  // 6. Segment ordering (reading flow reconstruction)
  let orderedSegments: LineSegment[] = [];
  if (hasSidebar) {
    // Sidebar layout: full-width items in Y-order, then left col in Y-order, then right sidebar in Y-order.
    // This keeps the main narrative in one column and avoids TOC/sidebar text mixing into body paragraphs.
    const fullSegs: LineSegment[] = [];
    const leftSegs: LineSegment[] = [];
    const rightSegs: LineSegment[] = [];
    for (const seg of segments) {
      if (seg.columnIndex === 0) { seg.section = 'left'; leftSegs.push(seg); }
      else if (seg.columnIndex === 1) { seg.section = 'right'; rightSegs.push(seg); }
      else { seg.section = 'full'; seg.columnIndex = -1; fullSegs.push(seg); }
    }
    fullSegs.sort((a, b) => a.y - b.y);
    leftSegs.sort((a, b) => a.y - b.y);
    rightSegs.sort((a, b) => a.y - b.y);
    const firstLeftY = leftSegs.length > 0 ? leftSegs[0].y : Infinity;
    const headerFullSegs = fullSegs.filter(s => s.y < firstLeftY);
    const footerFullSegs = fullSegs.filter(s => s.y >= firstLeftY);
    orderedSegments = [...headerFullSegs, ...leftSegs, ...footerFullSegs, ...rightSegs];
    console.log('[ChunZen] Sidebar ordering: full=', fullSegs.length, 'left=', leftSegs.length, 'right=', rightSegs.length);
  } else if (detectedColumnsCount <= 1) {
    // Single column: map all to col 0, sort by Y
    for (const seg of segments) {
      seg.columnIndex = 0;
      seg.section = 'left';
    }
    orderedSegments = [...segments].sort((a, b) => a.y - b.y);
  } else {
    // Multi-column page: group segments into blocks of 'single' (columnIndex === -1)
    // and 'multi' (columnIndex >= 0) based on their Y-sorted order.
    const sortedSegs = [...segments].sort((a, b) => a.y - b.y);
    const blocks: Array<{ type: 'single' | 'multi'; segments: LineSegment[] }> = [];

    for (const seg of sortedSegs) {
      const type = seg.columnIndex === -1 ? 'single' : 'multi';
      if (blocks.length === 0 || blocks[blocks.length - 1].type !== type) {
        blocks.push({ type, segments: [seg] });
      } else {
        blocks[blocks.length - 1].segments.push(seg);
      }
    }

    const firstMultiIndex = blocks.findIndex(b => b.type === 'multi');
    const lastMultiIndex = blocks.map(b => b.type).lastIndexOf('multi');

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const block = blocks[bIdx];
      if (block.type === 'single') {
        let section: 'header' | 'footer' | 'left' | 'full' = 'left';
        if (firstMultiIndex !== -1) {
          if (bIdx < firstMultiIndex) {
            section = 'header';
          } else if (bIdx > lastMultiIndex) {
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
        const perColumn = new Map<number, LineSegment[]>();
        for (const seg of block.segments) {
          const normalizedIndex = seg.columnIndex < 0 ? 0 : Math.min(seg.columnIndex, detectedColumnsCount - 1);
          seg.columnIndex = normalizedIndex;
          seg.section = sectionFromColumnIndex(normalizedIndex);
          if (!perColumn.has(normalizedIndex)) perColumn.set(normalizedIndex, []);
          perColumn.get(normalizedIndex)!.push(seg);
        }
        for (let col = 0; col < detectedColumnsCount; col++) {
          const colSegs = perColumn.get(col) || [];
          colSegs.sort((a, b) => a.y - b.y);
          orderedSegments.push(...colSegs);
        }
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
  const mergedLogicalParas = mergeOverSplitBodyParagraphs(logicalParas);

  // 8b. Post-pass: classify title/authors from first body blocks
  const fontSizes = mergedLogicalParas.map(p => p.items.reduce((s, it) => s + it.height, 0) / (p.items.length || 1));
  const sortedSizes = [...fontSizes].filter(s => s > 0).sort((a, b) => a - b);
  const medianSize = sortedSizes.length > 0 ? sortedSizes[Math.floor(sortedSizes.length / 2)] : 0;

  if (mergedLogicalParas.length > 0 && mergedLogicalParas[0].blockType === 'body') {
    const firstSize = fontSizes[0];
    if (firstSize > medianSize * 1.5) {
      mergedLogicalParas[0].blockType = 'title';
      // Check if next paragraph is authors (small text, contains commas/affiliations)
      if (mergedLogicalParas.length > 1 && mergedLogicalParas[1].blockType === 'body') {
        const secondSize = fontSizes[1];
        const secondText = mergedLogicalParas[1].text;
        if (secondSize < medianSize * 1.1 && (secondText.includes(',') || secondText.includes('@') || secondText.includes('University'))) {
          mergedLogicalParas[1].blockType = 'authors';
        }
      }
    }
  }

  // 9. Render spans and compute paragraph bounding boxes
  const sentenceMap = new Map<string, Sentence>();
  const spanToSentence = new Map<HTMLSpanElement, string>();
  const paragraphs: Paragraph[] = [];

  let sentenceId = 0;
  for (const para of mergedLogicalParas) {
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
      columnIndex: para.columnIndex,
      sentences: sentsList,
      bold: isBold || undefined,
      blockType: para.blockType,
    });
  }

  // Debug: log font names and block types
  console.log('[ChunZen] Font names:', [...fontNames]);
  console.log('[ChunZen] Blocks:', blocks.map((b: StructuralBlock) => `${b.type}(${b.segments.length}segs)`));
  console.log('[ChunZen] Paragraphs:', paragraphs.map(p => `${p.blockType || '?'} bold=${p.bold} "${p.text.slice(0, 50)}..."`));

  return {
    sentences: sentenceMap,
    spanToSentence,
    paragraphs,
    columnsCount: detectedColumnsCount
  };
}

// ── Block detection predicates ──

function isHeadingSegment(seg: LineSegment): boolean {
  if (seg.items.length === 0) return false;
  const text = seg.str.trim();
  if (!text) return false;

  // 长度限制：heading 不应超过 120 字符
  if (text.length > 120) return false;

  // 检测大多数 items 是否使用非正文字体（即 bold/heading 字体）
  // 用字符数加权，避免少量标点干扰
  const boldChars = seg.items.reduce(
    (sum, it) => (isBoldFont(it.fontName) ? sum + it.str.length : sum), 0
  );
  const totalChars = seg.items.reduce((sum, it) => sum + it.str.length, 0);
  if (totalChars === 0) return false;

  const boldRatio = boldChars / totalChars;
  if (boldRatio <= 0.5) return false;

  // 额外语义约束：避免把正文误判为 heading
  const tokens = text.split(/\s+/).filter(Boolean);
  const tokenCount = tokens.length;
  const endsWithSentencePunc = /[.!?;:。！？；：]$/.test(text);
  const upperTokens = tokens.filter(t => /^[A-Z0-9\-]{2,}$/.test(t)).length;
  const upperRatio = tokenCount > 0 ? upperTokens / tokenCount : 0;
  const startsWithEnum = /^(\(?\d+\)?[.)]?\s+|[IVXLC]+\.\s+)/.test(text);
  const looksShortTitle = tokenCount <= 12 && text.length <= 90 && !endsWithSentencePunc;

  return startsWithEnum || upperRatio > 0.55 || looksShortTitle;
}

function isFigureCaptionSegment(seg: LineSegment): boolean {
  const text = seg.str.trim();
  return /^(Figure|Fig\.?|Table)\s+\d/i.test(text);
}

function isSidebarTocHeading(
  seg: LineSegment,
  columnMargins: Map<number, { left: number; width: number }>,
  pageWidth: number
): boolean {
  if (seg.columnIndex < 0) return false;
  const text = seg.str.trim();
  if (!/^(sections?|contents?)$/i.test(text)) return false;

  const colWidth = columnMargins.get(seg.columnIndex)?.width ?? pageWidth;
  return colWidth < pageWidth * 0.5;
}

function isSidebarTocEntry(
  seg: LineSegment,
  tocColumnIndex: number,
  columnMargins: Map<number, { left: number; width: number }>,
  pageWidth: number
): boolean {
  if (seg.columnIndex !== tocColumnIndex) return false;
  const text = seg.str.trim();
  if (!text) return false;
  if (/^(figure|fig\.?|table)\s+\d/i.test(text)) return false;

  const colWidth = columnMargins.get(seg.columnIndex)?.width ?? pageWidth;
  if (seg.width > colWidth * 0.96) return false;
  if (text.length > 120) return false;

  return true;
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

function countWideIntraLineGaps(seg: LineSegment): number {
  if (seg.items.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < seg.items.length; i++) {
    const prev = seg.items[i - 1];
    const cur = seg.items[i];
    const gap = cur.x - (prev.x + prev.width);
    if (gap > Math.max(cur.height * 0.75, 8)) {
      count++;
    }
  }
  return count;
}

function isLikelyTableLine(seg: LineSegment, colWidth: number): boolean {
  if (!seg.str.trim()) return false;
  if (seg.width > colWidth * 0.92) return false;

  const wideGapCount = countWideIntraLineGaps(seg);
  if (wideGapCount < 2) return false;

  const hasNumeric = /\d/.test(seg.str);
  const hasPipeLikeDelimiter = /[:%]|±|×|\/|\(|\)/.test(seg.str);
  const tokens = seg.str.trim().split(/\s+/).filter(Boolean);
  const upperTokens = tokens.filter(t => /^[A-Z0-9\-]{2,}$/.test(t)).length;
  const upperRatio = tokens.length > 0 ? upperTokens / tokens.length : 0;
  const uppercaseGridLike = tokens.length >= 4 && tokens.length <= 18 && upperRatio > 0.45;
  return hasNumeric || hasPipeLikeDelimiter || uppercaseGridLike;
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

    // Sidebar table of contents (e.g. "Sections")
    if (isSidebarTocHeading(seg, columnMargins, pageWidth)) {
      const tocSegs = [seg];
      i++;
      while (i < segments.length) {
        const next = segments[i];
        if (!next.str.trim()) break;
        if (!isSidebarTocEntry(next, seg.columnIndex, columnMargins, pageWidth)) break;
        const prev = tocSegs[tocSegs.length - 1];
        const yClose = Math.abs(next.y - prev.y) <= Math.max(prev.height, next.height) * 2.4;
        if (!yClose) break;
        tocSegs.push(next);
        i++;
      }
      blocks.push({ type: 'table', segments: tocSegs });
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
    const next1 = segments[i + 1];
    const next2 = segments[i + 2];
    const looksLikeDenseRows =
      !!next1 &&
      next1.columnIndex === seg.columnIndex &&
      Math.abs(next1.y - seg.y) <= Math.max(seg.height, next1.height) * 2.1 &&
      isLikelyTableLine(seg, colWidth) &&
      isLikelyTableLine(next1, colWidth);
    const looksLikeDenseRows3 =
      !!next2 &&
      next2.columnIndex === seg.columnIndex &&
      Math.abs(next2.y - (next1?.y ?? next2.y)) <= Math.max(next1?.height ?? next2.height, next2.height) * 2.1 &&
      isLikelyTableLine(next2, colWidth);

    if (isTableSegmentRow(segments, i, colWidth) || (looksLikeDenseRows && looksLikeDenseRows3)) {
      const tableSegs = [seg];
      i++;
      while (i < segments.length) {
        const cur = segments[i];
        if (!cur.str.trim()) break;
        if (cur.columnIndex !== seg.columnIndex) break;

        const prev = tableSegs[tableSegs.length - 1];
        const yClose = Math.abs(cur.y - prev.y) <= Math.max(prev.height, cur.height) * 2.2;
        const rowLike = isTableSegmentRow(segments, i, colWidth) || isLikelyTableLine(cur, colWidth);
        if (!yClose || !rowLike) break;

        tableSegs.push(cur);
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
      if (isSidebarTocHeading(next, columnMargins, pageWidth)) break;
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

  const flushPara = (
    text: string,
    items: ColLayoutItem[],
    section: 'header' | 'left' | 'right' | 'footer' | 'full',
    columnIndex?: number
  ) => {
    if (!text.trim()) return;
    paras.push({
      id: `p-${paraId++}`,
      text: text.trim(),
      items: [...items],
      section,
      columnIndex,
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
      flushPara(allText, allItems, segs[0].section, segs[0].columnIndex >= 0 ? segs[0].columnIndex : undefined);
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
        flushPara(text, seg.items, seg.section, seg.columnIndex >= 0 ? seg.columnIndex : undefined);
      }
      break;
    }

    case 'reference': {
      // Split by reference entry boundaries
      let refBuf = '';
      let refItems: ColLayoutItem[] = [];
      let refSection: 'header' | 'left' | 'right' | 'footer' | 'full' = 'left';
      let refColumnIndex: number | undefined = undefined;

      for (const seg of segs) {
        if (isReferenceStart(seg.str) && refBuf.trim()) {
          flushPara(refBuf, refItems, refSection, refColumnIndex);
          refBuf = '';
          refItems = [];
        }
        refBuf += (refBuf ? ' ' : '') + seg.str;
        refItems.push(...seg.items);
        refSection = seg.section;
        refColumnIndex = seg.columnIndex >= 0 ? seg.columnIndex : refColumnIndex;
      }
      if (refBuf.trim()) flushPara(refBuf, refItems, refSection, refColumnIndex);
      break;
    }

    case 'body':
    case 'unknown':
    default: {
      // Body paragraph heuristics: line gap, indent, width and punctuation.
      // Use previous line cues to avoid over-splitting wrapped lines.
      let paraBuf = '';
      let paraItems: ColLayoutItem[] = [];
      let currentColumnIndex: number | null = null;
      let currentSection: 'header' | 'left' | 'right' | 'footer' | 'full' | null = null;
      const lineGapStats = computeLineGapStats(segs);

      const flushBody = () => {
        if (!paraBuf.trim()) { paraBuf = ''; paraItems = []; return; }
        paras.push({
          id: `p-${paraId++}`,
          text: paraBuf.trim(),
          items: [...paraItems],
          section: currentSection || 'left',
          columnIndex: currentColumnIndex !== null && currentColumnIndex >= 0 ? currentColumnIndex : undefined,
        });
        paraBuf = '';
        paraItems = [];
      };

      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si];
        const segText = seg.str;
        if (!segText) continue;

        const prevSeg = paraItems.length > 0 ? segs[si - 1] : undefined;
        if (prevSeg) {
          const isNewColumn = seg.columnIndex !== prevSeg.columnIndex;
          const isNewSection = seg.section !== prevSeg.section;
          if (isNewColumn || isNewSection || shouldStartNewBodyParagraph(prevSeg, seg, columnMargins, pageWidth, lineGapStats)) {
            flushBody();
          }
        }

        currentColumnIndex = seg.columnIndex;
        currentSection = seg.section;
        paraBuf += (paraBuf ? ' ' : '') + segText;
        paraItems.push(...seg.items);
      }
      flushBody();
      break;
    }
  }

  return { paras, nextParaId: paraId };
}

// ── Existing Helper functions ──

// 模块级变量：当前页正文字体（由 buildTextLayer 每次渲染时更新）
let _bodyFont = '';
let _fontCharCountMap = new Map<string, number>();
let _totalFontChars = 0;

/**
 * 判断某字体是否为「非正文」（即可能是粗体/标题）
 * 策略：
 *   1. 若字体名含 bold/heavy/black 等关键词 → 直接判为粗体
 *   2. 否则：若该字体不是正文字体（最高频字体）→ 视为非正文
 *      注意：空 fontName 不做判断，返回 false
 */
function isBoldFont(fontName: string): boolean {
  if (!fontName) return false;

  // 方式一：fontName 含明确 bold 关键词（非混淆 PDF 有效）
  if (/bold|heavy|black|demi|extrabold|semibold/i.test(fontName)) return true;

  // 方式二：基于频率推断（保守版）
  // 只有当字体占比很低时才视为强调字体，避免把整页正文误判成粗体。
  if (_bodyFont && fontName !== _bodyFont && _totalFontChars > 0) {
    const cnt = _fontCharCountMap.get(fontName) || 0;
    const ratio = cnt / _totalFontChars;
    if (ratio < 0.06) return true;
  }

  return false;
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
  const str = composeLineText(lineItems);

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

function sectionFromColumnIndex(columnIndex: number): 'left' | 'right' | 'full' {
  if (columnIndex === 0) return 'left';
  if (columnIndex === 1) return 'right';
  return 'full';
}

function composeLineText(items: ColLayoutItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].str.trim();

  let text = items[0].str.trim();
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const prevText = prev.str;
    const curText = cur.str;
    const gap = cur.x - (prev.x + prev.width);
    const gapThreshold = Math.max(cur.height * 0.2, 1.5);
    const attachNoSpace =
      gap <= gapThreshold ||
      /^[,.;:!?%)\]}]/.test(curText) ||
      /[(\[{]$/.test(prevText);

    if (attachNoSpace) {
      text += curText;
    } else {
      text += ` ${curText}`;
    }
  }
  return text.trim();
}

function computeGutterSupport(lines: ColLayoutItem[][], gutterX: number, minGapWidth: number): number {
  let support = 0;
  for (const line of lines) {
    if (line.length < 2) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const left = line[i];
      const right = line[i + 1];
      const rightSide = left.x + left.width;
      const leftSide = right.x;
      const gap = leftSide - rightSide;
      if (gap < minGapWidth) continue;
      if (rightSide <= gutterX + 3 && leftSide >= gutterX - 3) {
        support++;
      }
    }
  }
  return support;
}

function computeColumnEvidenceByLines(
  lines: ColLayoutItem[][],
  gutterX: number,
  pageWidth: number
): number {
  if (lines.length === 0) return 0;
  let evidenceLines = 0;
  let considered = 0;
  for (const line of lines) {
    if (line.length === 0) continue;
    const left = line[0].x;
    const right = line[line.length - 1].x + line[line.length - 1].width;
    const width = right - left;
    if (width >= pageWidth * 0.88) continue;
    considered++;
    const center = (left + right) / 2;
    const fullyLeft = right <= gutterX + 3;
    const fullyRight = left >= gutterX - 3;
    const sideLine = fullyLeft || fullyRight || (width < pageWidth * 0.55 && Math.abs(center - gutterX) > pageWidth * 0.08);
    if (sideLine) evidenceLines++;
  }
  if (considered === 0) return 0;
  return evidenceLines / considered;
}

function detectStableGutters(
  lines: ColLayoutItem[][],
  minX: number,
  pageWidth: number,
  minGapWidth: number
): number[] {
  const gutterPoints: number[] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const cur = line[i];
      const next = line[i + 1];
      const right = cur.x + cur.width;
      const left = next.x;
      const gap = left - right;
      if (gap < minGapWidth) continue;
      const mid = (right + left) / 2;
      if (mid < minX + pageWidth * 0.12 || mid > minX + pageWidth * 0.88) continue;
      gutterPoints.push(mid);
    }
  }
  if (gutterPoints.length === 0) return [];

  gutterPoints.sort((a, b) => a - b);
  const clusterDistance = Math.max(18, pageWidth * 0.05);
  const clusters: Array<{ center: number; count: number }> = [];
  for (const x of gutterPoints) {
    if (clusters.length === 0) {
      clusters.push({ center: x, count: 1 });
      continue;
    }
    const last = clusters[clusters.length - 1];
    if (Math.abs(x - last.center) <= clusterDistance) {
      const newCount = last.count + 1;
      last.center = (last.center * last.count + x) / newCount;
      last.count = newCount;
    } else {
      clusters.push({ center: x, count: 1 });
    }
  }

  const minSupport = Math.max(3, Math.floor(lines.length * 0.06));
  return clusters
    .filter(c => c.count >= minSupport)
    .map(c => c.center)
    .sort((a, b) => a - b);
}

function isLikelyHeadingLikeLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 100) return false;
  if (/^(\(?\d+\)?[.)]?\s+|[-•*]\s+)/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const upperWords = words.filter(w => /^[A-Z0-9\-]{2,}$/.test(w)).length;
  return upperWords / words.length > 0.7;
}

function mergeOverSplitBodyParagraphs(paras: LogicalParagraph[]): LogicalParagraph[] {
  const merged: LogicalParagraph[] = [];
  for (const para of paras) {
    if (merged.length === 0) {
      merged.push({ ...para, items: [...para.items] });
      continue;
    }

    const prev = merged[merged.length - 1];
    if (!canMergeBodyParagraph(prev, para)) {
      merged.push({ ...para, items: [...para.items] });
      continue;
    }

    prev.text = mergeTexts(prev.text, para.text);
    prev.items.push(...para.items);
  }
  return merged;
}

function canMergeBodyParagraph(prev: LogicalParagraph, cur: LogicalParagraph): boolean {
  if ((prev.blockType ?? 'body') !== 'body') return false;
  if ((cur.blockType ?? 'body') !== 'body') return false;
  if (prev.section !== cur.section) return false;
  if ((prev.columnIndex ?? -1) !== (cur.columnIndex ?? -1)) return false;
  if (!prev.text.trim() || !cur.text.trim()) return false;
  if (isLikelyHeadingLikeLine(cur.text)) return false;

  const prevBottom = prev.items.reduce((m, it) => Math.max(m, it.y + it.height), Number.NEGATIVE_INFINITY);
  const curTop = cur.items.reduce((m, it) => Math.min(m, it.y), Number.POSITIVE_INFINITY);
  const avgLineH = Math.max(
    1,
    (prev.items.reduce((s, it) => s + it.height, 0) + cur.items.reduce((s, it) => s + it.height, 0))
      / Math.max(1, prev.items.length + cur.items.length)
  );
  const yGap = Number.isFinite(prevBottom) && Number.isFinite(curTop) ? Math.max(0, curTop - prevBottom) : 0;
  if (yGap > Math.max(avgLineH * 1.55, 18)) return false;

  const prevText = prev.text.trim();
  const curText = cur.text.trim();
  const prevEndsHyphen = /[-\u2010\u2011\u2012\u2013\u2014]$/.test(prevText);
  const prevEndsTerminal = /[.!?;:。！？；：]$/.test(prevText);
  const curStartsUpper = /^[A-Z]/.test(curText);
  const curStartsLower = /^[a-z]/.test(curText);
  const curStartsBracket = /^[)\],.;:]/.test(curText);
  const prevShort = prevText.length < 90;
  const curShort = curText.length < 120;

  if (prevEndsHyphen) return true;
  if (!prevEndsTerminal && (curStartsLower || curStartsBracket)) return true;
  if (!prevEndsTerminal && prevShort && curShort) return true;
  if (prevEndsTerminal && curStartsUpper) return false;
  return prevShort && curShort && yGap < avgLineH * 1.15;
}

function mergeTexts(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trimStart();
  if (!left) return right;
  if (!right) return left;
  if (/[-\u2010\u2011\u2012\u2013\u2014]$/.test(left)) {
    return `${left.slice(0, -1)}${right}`;
  }
  if (/[({\[]$/.test(left) || /^[)\]}.,;:!?]/.test(right)) {
    return `${left}${right}`;
  }
  return `${left} ${right}`;
}

function estimateColumnIndex(
  lineItems: ColLayoutItem[],
  gutters: number[],
  pageWidth: number
): number {
  if (gutters.length === 0 || lineItems.length === 0) return -1;
  const first = lineItems[0];
  const last = lineItems[lineItems.length - 1];
  const lineLeft = first.x;
  const lineRight = last.x + last.width;
  const lineWidth = lineRight - lineLeft;
  if (lineWidth > pageWidth * 0.8) return -1;

  const center = (lineLeft + lineRight) / 2;
  let idx = 0;
  for (const g of gutters) {
    if (center > g) idx++;
  }
  return idx;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeLineGapStats(segs: LineSegment[]): Map<number, number> {
  const byColumn = new Map<number, number[]>();
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1];
    const cur = segs[i];
    if (cur.columnIndex !== prev.columnIndex || cur.section !== prev.section) continue;
    const gap = cur.y - prev.y;
    if (gap <= 0) continue;
    if (!byColumn.has(cur.columnIndex)) byColumn.set(cur.columnIndex, []);
    byColumn.get(cur.columnIndex)!.push(gap);
  }

  const stats = new Map<number, number>();
  for (const [col, gaps] of byColumn) {
    if (gaps.length === 0) continue;
    stats.set(col, median(gaps));
  }
  return stats;
}

function shouldStartNewBodyParagraph(
  prev: LineSegment,
  cur: LineSegment,
  columnMargins: Map<number, { left: number; width: number }>,
  pageWidth: number,
  lineGapStats: Map<number, number>
): boolean {
  if (prev.columnIndex !== cur.columnIndex || prev.section !== cur.section) {
    return true;
  }

  const colWidth = columnMargins.get(cur.columnIndex)?.width || pageWidth;
  const colMargin = columnMargins.get(cur.columnIndex)?.left ?? cur.x;

  const yGap = cur.y - prev.y;
  const lineH = Math.max(prev.height, cur.height, 1);
  const baseGap = lineGapStats.get(cur.columnIndex) || lineH * 1.1;
  const isLargeGap = yGap > Math.max(baseGap * 1.45, lineH * 1.85);
  if (isLargeGap) return true;

  const curText = cur.str.trim();
  const prevText = prev.str.trim();
  const curStartsLower = /^[a-z]/.test(curText);
  const curStartsList = /^(\(?\d+\)?[.)]?\s+|[-•*]\s+)/.test(curText);
  const prevEndsTerminal = /[.!?;:。！？；：]$/.test(prevText);

  const curIndent = Math.max(0, cur.x - colMargin);
  const prevIndent = Math.max(0, prev.x - colMargin);
  const hasFirstLineIndent =
    curIndent > Math.max(cur.height * 1.6, 12) &&
    prevIndent < Math.max(prev.height * 0.6, 5);

  // Conservative keep-together: wrapped lines inside the same paragraph should
  // not be split unless there is strong boundary evidence.
  if (!prevEndsTerminal && yGap <= Math.max(baseGap * 1.2, lineH * 1.45) && !curStartsList) {
    return false;
  }

  if (curStartsList) return true;
  if (hasFirstLineIndent && !curStartsLower && prevEndsTerminal) return true;

  return false;
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

/**
 * Filter standalone affiliation superscript number clusters.
 * e.g. "29 30", "1,2,3", "31 32,33,34 15 35"
 * These appear in author lists as footnote superscripts and are not useful text.
 */
function isAffiliationClutter(str: string, scaledHeightPx: number): boolean {
  const trimmed = str.trim();
  // Must be pure digits, spaces, commas, semicolons, or periods (no letters)
  if (!/^[\d\s,;.]+$/.test(trimmed)) return false;
  // Must be reasonably short (long number strings might be real data)
  if (trimmed.length > 30) return false;
  // Small font height strongly indicates superscript (< 9px at typical scale)
  if (scaledHeightPx < 9) return true;
  // Even at normal size, if there are multiple space-separated numbers, it's likely affiliation
  if (/^\d+(\s+\d+)+$/.test(trimmed)) return true;
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

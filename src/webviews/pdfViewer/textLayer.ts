// Text layer: extracts text items, detects columns, filters math, dehyphenates, renders span overlay

import { TextItem, PdfViewport, RichTextContent, ParagraphBoundary, HorizontalRule } from './pdfRenderer';

declare const pdfjsLib: {
  Util: { transform(transform: number[], viewportTransform: number[]): number[] };
};

// 模块级变量：当前页正文字体（由 buildTextLayer 每次渲染时更新）
let _bodyFont = '';
let _fontCharCountMap = new Map<string, number>();
let _totalFontChars = 0;

function isRotated(transform: number[]): boolean {
  if (!transform || transform.length < 4) return false;
  const scaleX = Math.abs(transform[0]);
  const skewY = Math.abs(transform[1]);
  const skewX = Math.abs(transform[2]);
  const scaleY = Math.abs(transform[3]);
  if (skewY > scaleX * 1.5 && skewX > scaleY * 1.5) {
    return true;
  }
  return false;
}

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
  skipped?: boolean;
  skipReason?: ParagraphSkipReason;
  lineMarker?: 'horizontal-rule' | 'table-image' | 'figure-image';
  ruleX1?: number;
  ruleX2?: number;
  imageDataUrl?: string;
  imageAlt?: string;
}

export type ParagraphSkipReason =
  | 'empty'
  | 'sidebar-column'
  | 'header-or-authors'
  | 'edge-metadata'
  | 'top-metadata'
  | 'watermark-fragment'
  | 'right-http-noise'
  | 'affiliation-footnote'
  | 'repeated-noise'
  | 'table-image-replaced';

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
  flowBand?: number;
}

export type BlockType =
  | 'header'
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
  skipped?: boolean;
}

interface SentenceItem {
  text: string;
  items: ColLayoutItem[];
}

interface RightEdgeNoiseZone {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const CIRCLED_NUM_MAP: Record<string, string> = {
  '①': '(1)', '②': '(2)', '③': '(3)', '④': '(4)', '⑤': '(5)',
  '⑥': '(6)', '⑦': '(7)', '⑧': '(8)', '⑨': '(9)', '⑩': '(10)',
  '⑪': '(11)', '⑫': '(12)', '⑬': '(13)', '⑭': '(14)', '⑮': '(15)',
  '⑯': '(16)', '⑰': '(17)', '⑱': '(18)', '⑲': '(19)', '⑳': '(20)',
  '⑴': '(1)', '⑵': '(2)', '⑶': '(3)', '⑷': '(4)', '⑸': '(5)',
  '⑹': '(6)', '⑺': '(7)', '⑻': '(8)', '⑼': '(9)', '⑽': '(10)',
  '⑾': '(11)', '⑿': '(12)', '⒀': '(13)', '⒁': '(14)', '⒂': '(15)',
  '⒃': '(16)', '⒄': '(17)', '⒅': '(18)', '⒆': '(19)', '⒇': '(20)',
  '⒈': '1.', '⒉': '2.', '⒊': '3.', '⒋': '4.', '⒌': '5.',
  '⒍': '6.', '⒎': '7.', '⒏': '8.', '⒐': '9.', '⒑': '10.',
  '⒒': '11.', '⒓': '12.', '⒔': '13.', '⒕': '14.', '⒖': '15.',
  '⒗': '16.', '⒘': '17.', '⒙': '18.', '⒚': '19.', '⒛': '20.',
  '❶': '(1)', '❷': '(2)', '❸': '(3)', '❹': '(4)', '❺': '(5)',
  '❻': '(6)', '❼': '(7)', '❽': '(8)', '❾': '(9)', '❿': '(10)',
  '➀': '(1)', '➁': '(2)', '➂': '(3)', '➃': '(4)', '➄': '(5)',
  '➅': '(6)', '➆': '(7)', '➇': '(8)', '➈': '(9)', '➉': '(10)',
  '➊': '(1)', '➋': '(2)', '➌': '(3)', '➍': '(4)', '➎': '(5)',
  '➏': '(6)', '➐': '(7)', '➑': '(8)', '➒': '(9)', '➓': '(10)',
  '⓵': '(1)', '⓶': '(2)', '⓷': '(3)', '⓸': '(4)', '⓹': '(5)',
  '⓺': '(6)', '⓻': '(7)', '⓼': '(8)', '⓽': '(9)', '⓾': '(10)',
  '㉑': '(21)', '㉒': '(22)', '㉓': '(23)', '㉔': '(24)', '㉕': '(25)',
  '㉖': '(26)', '㉗': '(27)', '㉘': '(28)', '㉙': '(29)', '㉚': '(30)',
  '㉛': '(31)', '㉜': '(32)', '㉝': '(33)', '㉞': '(34)', '㉟': '(35)',
  '㊱': '(36)', '㊲': '(37)', '㊳': '(38)', '㊴': '(39)', '㊵': '(40)',
};

const ROMAN_NUM_MAP: Record<string, string> = {
  'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V',
  'Ⅵ': 'VI', 'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X',
  'Ⅺ': 'XI', 'Ⅻ': 'XII', 'Ⅼ': 'L', 'Ⅽ': 'C', 'Ⅾ': 'D', 'Ⅿ': 'M',
  'ⅰ': 'i', 'ⅱ': 'ii', 'ⅲ': 'iii', 'ⅳ': 'iv', 'ⅴ': 'v',
  'ⅵ': 'vi', 'ⅶ': 'vii', 'ⅷ': 'viii', 'ⅸ': 'ix', 'ⅹ': 'x',
  'ⅺ': 'xi', 'ⅻ': 'xii', 'ⅼ': 'l', 'ⅽ': 'c', 'ⅾ': 'd', 'ⅿ': 'm',
};

const BULLET_MAP: Record<string, string> = {
  '\uf0b7': '•',
  '\uf02d': '•',
  '\u2219': '•',
  '\u25cf': '•',
  '\u25e6': '•',
  '\u25aa': '•',
  '\u25a0': '•',
  '\u25cb': '•',
  '\u25a1': '•',
  '\u25c6': '•',
  '\u25c7': '•',
  '\u27a4': '•',
  '\u2023': '•',
  '\u2043': '•',
};

const CIRCLED_NUM_REGEX = new RegExp('[' + Object.keys(CIRCLED_NUM_MAP).join('') + ']', 'g');
const BULLET_REGEX = new RegExp('[' + Object.keys(BULLET_MAP).join('') + ']', 'g');

export function normalizeText(str: string): string {
  if (!str) return '';
  str = str.replace(/[\uFF10-\uFF19]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
  str = str.replace(/[\u2160-\u217F]/g, (m) => ROMAN_NUM_MAP[m] || m);
  str = str.replace(CIRCLED_NUM_REGEX, (m) => CIRCLED_NUM_MAP[m] || m);
  // Normalize circled/parenthesized letters:
  // Circled Capital Letters U+24B6 - U+24CF (Ⓐ - Ⓩ) -> (A) - (Z)
  str = str.replace(/[\u24B6-\u24CF]/g, (m) => `(${String.fromCharCode(m.charCodeAt(0) - 0x24B6 + 65)})`);
  // Circled Small Letters U+24D0 - U+24E9 (ⓐ - ⓩ) -> (a) - (z)
  str = str.replace(/[\u24D0-\u24E9]/g, (m) => `(${String.fromCharCode(m.charCodeAt(0) - 0x24D0 + 97)})`);
  // Parenthesized Small Letters U+249C - U+24B5 (⒜ - ⒵) -> (a) - (z)
  str = str.replace(/[\u249C-\u24B5]/g, (m) => `(${String.fromCharCode(m.charCodeAt(0) - 0x249C + 97)})`);
  str = str.replace(BULLET_REGEX, (m) => BULLET_MAP[m] || m);
  str = str.replace(/^(\s*)[·⋅](\s+)/, '$1•$2');
  return str;
}

// ── Main entry ──

export function buildTextLayer(
  container: HTMLElement,
  richContent: RichTextContent | TextItem[],
  viewport: PdfViewport,
  options?: {
    layoutHints?: LayoutHints;
    pageNumber?: number;
    commonObjs?: any;
  }
): {
  sentences: Map<string, Sentence>;
  spanToSentence: Map<HTMLSpanElement, string>;
  paragraphs: Paragraph[];
  columnsCount: number;
} {
  container.innerHTML = '';

  let styles: Record<string, any> = {};
  let commonObjs: any = null;
  if (richContent && !Array.isArray(richContent)) {
    styles = richContent.styles || {};
    commonObjs = richContent.commonObjs;
  }
  if (options && options.commonObjs) {
    commonObjs = options.commonObjs;
  }

  let items: TextItem[];
  let paragraphBoundaries: ParagraphBoundary[] = [];
  let hasStructure = false;
  let horizontalRules: HorizontalRule[] = [];

  if (Array.isArray(richContent)) {
    items = richContent;
  } else {
    items = richContent.items;
    paragraphBoundaries = richContent.paragraphBoundaries;
    hasStructure = richContent.hasStructure;
    horizontalRules = richContent.horizontalRules || [];
  }

  // Pre-normalize all text items in-place to restore symbols (bullets, roman/circled/full-width numerals)
  for (const item of items) {
    if (item.str) {
      item.str = normalizeText(item.str);
    }
  }

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
    if (isRotated(item.transform)) continue;
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
  const rightEdgeNoiseZones = detectRightEdgeNoiseZones(items, viewport);

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    if (isRotated(item.transform)) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    if (!tx || isNaN(tx[4]) || isNaN(tx[5])) continue;

    // Filter out items that are strictly off-screen to prevent pageWidth/midX contamination
    if (tx[4] < 0 || tx[4] > viewport.width) continue;

    // Filter math symbols and LaTeX commands
    if (isMathArtifact(item.str)) continue;

    // Skip header/footer region (only if extreme outer margins)
    if (tx[5] < headerY || tx[5] > footerY) continue;

    const scaledH = item.height * viewport.scale;
    // Filter affiliation superscript number clusters (e.g. "29 30", "1,2,3")
    // Heuristic: pure digit/comma/space string with small font height
    if (isAffiliationClutter(item.str, scaledH)) continue;

    const w = item.width * viewport.scale;
    if (isRightEdgeWatermarkToken(item.str, tx[4], tx[5], w, scaledH, viewport.width, rightEdgeNoiseZones)) continue;
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
  const minX = Math.min(...xs);
  // Use viewport.width for page width/center to avoid stamp contamination
  const pageWidth = viewport.width - 2 * minX;
  const midX = viewport.width / 2;

  // Detect start of body (Abstract or Introduction)
  let firstBodyY = 0;
  for (const line of filteredRawLines) {
    const lineStr = line.map(it => it.str).join(' ').trim();
    if (/\b(abstract|introduction)\b/i.test(lineStr)) {
      firstBodyY = line[0].y;
      break;
    }
  }
  if (firstBodyY === 0) {
    firstBodyY = inferFirstBodyY(filteredRawLines, viewport.height, options?.pageNumber);
  }

  // 4. Split lines into segments & count splits (Two-pass analysis for hybrid layouts)
  let splitCount = 0;
  const splitLineYs: number[] = [];
  const GUTTER_MIN_WIDTH = 10; // px
  const centerRange = pageWidth * 0.2; // gutter midpoint must be within 20% of page center

  // Pass 1: Find split count and Y-coordinates of physically split lines
  for (const line of filteredRawLines) {
    if (line.length === 0) continue;
    if (line[0].y < firstBodyY - 5) continue;
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
  const splitRatio = filteredRawLines.length > 0 ? splitCount / filteredRawLines.length : 0;
  const isDoubleColumn = splitCount >= 3 || splitRatio > 0.08;

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
    const flatItems = filteredRawLines.filter(line => line[0].y >= firstBodyY - 5).flat();
    const narrowRight = flatItems.filter(it => {
      const center = it.x + it.width / 2;
      return center > minX + pageWidth * 0.55 && it.width < pageWidth * 0.45;
    });
    const narrowLeft = flatItems.filter(it => {
      const center = it.x + it.width / 2;
      return center < minX + pageWidth * 0.55 && it.width < pageWidth * 0.7;
    });
    const hasSidebarHeading = filteredRawLines
      .filter(line => line[0].y >= firstBodyY - 5)
      .some(line => /^(sections?|contents?)$/i.test(composeLineText(line)));

    // In strong dual-column pages, sparse right-column lines can look like a sidebar.
    // Only allow sidebar inference there when we have explicit sidebar heading cues.
    const sidebarAllowedInDualColumn = !isDoubleColumn || hasSidebarHeading || splitRatio < 0.35;

    if (sidebarAllowedInDualColumn && narrowRight.length >= 3 && narrowLeft.length > narrowRight.length) {
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
    const lineY = line[0].y;

    const splitIndices = new Set<number>();
    
    // Only allow splits and column assignments below body separator (firstBodyY - 5)
    if (lineY >= firstBodyY - 5 && effectiveGutters.length > 0 && (!hasSidebar || rawLineWidth < pageWidth * 0.72)) {
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

    if (lineY >= firstBodyY - 5 && splitIndices.size === 0) {
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
          const partSeg = createSegment(part, lineY >= firstBodyY - 5 ? estimateColumnIndex(part, effectiveGutters, pageWidth) : 0, styles, commonObjs);
          segments.push(partSeg);
        }
        start = splitIndex + 1;
      }
      const tail = line.slice(start);
      if (tail.length > 0) {
        const tailSeg = createSegment(tail, lineY >= firstBodyY - 5 ? estimateColumnIndex(tail, effectiveGutters, pageWidth) : 0, styles, commonObjs);
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
      if (lineY >= firstBodyY - 5) {
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
          const inDoubleColumnZone = expandedZones.some(zone => lineY >= zone.minY && lineY <= zone.maxY);
          if (inDoubleColumnZone && lineWidth < pageWidth * 0.55) {
            colIndex = lineCenter < midX ? 0 : 1;
          }
        } else if (effectiveGutters.length > 0 && lineWidth < pageWidth * 0.82) {
          colIndex = estimateColumnIndex(line, effectiveGutters, pageWidth);
        }
      }
      segments.push(createSegment(line, colIndex, styles, commonObjs));
    }
  }

  // 6. Segment ordering (reading flow reconstruction + horizontal rule barriers)
  const effectiveRules = normalizeHorizontalRuleBarriers(horizontalRules, viewport.width, viewport.height, firstBodyY);
  const orderedSegments = orderSegmentsWithHorizontalBarriers(
    segments,
    effectiveRules,
    hasSidebar,
    detectedColumnsCount
  );

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
  let mergedLogicalParas: LogicalParagraph[] = [];
  let blocks: StructuralBlock[] | null = null;

  if (hasStructure && paragraphBoundaries && paragraphBoundaries.length > 0) {
    let nextParaId = 0;

    // 1. Create a list of blocks (structured and gaps)
    interface PageBlock {
      type: 'structured' | 'gap';
      start: number; // index in items
      end: number;   // index in items
      role?: 'p' | 'heading' | 'figure' | 'table' | 'other';
      rawTag?: string;
    }

    const pageBlocks: PageBlock[] = [];
    let currentIdx = 0;
    for (const b of paragraphBoundaries) {
      if (b.start > currentIdx) {
        pageBlocks.push({
          type: 'gap',
          start: currentIdx,
          end: b.start,
        });
      }
      pageBlocks.push({
        type: 'structured',
        start: b.start,
        end: b.end,
        role: b.role,
        rawTag: b.rawTag,
      });
      currentIdx = b.end;
    }
    if (currentIdx < items.length) {
      pageBlocks.push({
        type: 'gap',
        start: currentIdx,
        end: items.length,
      });
    }

    // 2. Process each block
    for (const block of pageBlocks) {
      const rangeItems = items.slice(block.start, block.end);
      
      // Transform rangeItems to ColLayoutItems in layout coords
      const transformedItems: ColLayoutItem[] = [];
      for (const item of rangeItems) {
        if (!item.str || !item.str.trim()) continue;
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        if (!tx || isNaN(tx[4]) || isNaN(tx[5])) continue;
        if (isMathArtifact(item.str)) continue;
        if (tx[5] < headerY || tx[5] > footerY) continue;
        
        const scaledH = item.height * viewport.scale;
        if (isAffiliationClutter(item.str, scaledH)) continue;
        
        const w = item.width * viewport.scale;
        if (isRightEdgeWatermarkToken(item.str, tx[4], tx[5], w, scaledH, viewport.width, rightEdgeNoiseZones)) continue;
        transformedItems.push({
          str: item.str.trim(),
          x: tx[4],
          y: tx[5],
          width: w,
          height: scaledH,
          fontName: item.fontName || ''
        });
      }

      if (transformedItems.length === 0) continue;

      // Keep per-block text items in visual reading order before line grouping.
      // Tagged PDFs can provide items in content-stream order, which may interleave columns.
      transformedItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
        return a.x - b.x;
      });

      // Group into lines by Y coordinate
      const rawLines: ColLayoutItem[][] = [];
      let currentLine: ColLayoutItem[] = [];
      let currentY: number | null = null;
      const LINE_THRESHOLD = 4; // px

      for (const item of transformedItems) {
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

      // Dehyphenate lines in-place
      for (let i = 0; i < rawLines.length - 1; i++) {
        const curLine = rawLines[i];
        const nxtLine = rawLines[i + 1];
        if (curLine.length === 0 || nxtLine.length === 0) continue;
        const lastItem = curLine[curLine.length - 1];
        const firstItem = nxtLine[0];
        if (lastItem.str.endsWith('-') && lastItem.str.length > 1) {
          const firstWordMatch = firstItem.str.match(/^([a-zA-Z0-9]+)/);
          if (firstWordMatch) {
            const firstWord = firstWordMatch[1];
            lastItem.str = lastItem.str.slice(0, -1) + firstWord;
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

      // Filter out empty items
      const filteredLines = rawLines.map(line => line.filter(it => it.str.trim() !== '')).filter(line => line.length > 0);
      if (filteredLines.length === 0) continue;

      if (block.type === 'structured') {
        // Structured block is always a single paragraph/heading
        const allText = filteredLines.map(line => composeFormattedLineText(line, styles, commonObjs)).join(' ').replace(/\s+/g, ' ').trim();
        const allItems = filteredLines.flat();
        if (allText) {
          const blockType = mapRoleToBlockType(block.role);
          const para: LogicalParagraph = {
            id: `p-${nextParaId++}`,
            text: allText,
            items: allItems,
            section: 'left', // assigned below
            blockType
          };
          assignLayoutToParagraph(
            para,
            pageWidth,
            midX,
            isDoubleColumn,
            expandedZones,
            hasSidebar,
            sidebarGutterX,
            effectiveGutters,
            firstBodyY
          );
          mergedLogicalParas.push(para);
        }
      } else {
        // Gap block: group lines into paragraphs when Y gap is large
        let paraLines: ColLayoutItem[][] = [];
        let prevLineY: number | null = null;
        
        const flushGapPara = () => {
          if (paraLines.length === 0) return;
          const text = paraLines.map(line => composeFormattedLineText(line, styles, commonObjs)).join(' ').replace(/\s+/g, ' ').trim();
          const items = paraLines.flat();
          if (text) {
            const para: LogicalParagraph = {
              id: `p-${nextParaId++}`,
              text,
              items,
              section: 'left',
              blockType: 'unknown'
            };
            assignLayoutToParagraph(
              para,
              pageWidth,
              midX,
              isDoubleColumn,
              expandedZones,
              hasSidebar,
              sidebarGutterX,
              effectiveGutters,
              firstBodyY
            );
            mergedLogicalParas.push(para);
          }
          paraLines = [];
        };

        for (const line of filteredLines) {
          const lineY = line[0].y;
          const lineH = line[0].height;
          if (prevLineY !== null && Math.abs(lineY - prevLineY) > lineH * 1.6) {
            flushGapPara();
          }
          paraLines.push(line);
          prevLineY = lineY;
        }
        flushGapPara();
      }
    }
  } else {
    blocks = detectStructuralBlocks(orderedSegments, columnMargins, pageWidth);

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
    mergedLogicalParas = mergeOverSplitBodyParagraphs(logicalParas);
  }

  // 8b. Post-pass: classify title/authors/headers/abstracts from top region (y < firstBodyY - 5)
  const topParas = mergedLogicalParas.filter(p => {
    const avgY = p.items.reduce((sum, it) => sum + it.y, 0) / (p.items.length || 1);
    return avgY < firstBodyY - 5;
  });

  let titlePara: LogicalParagraph | null = null;
  let maxFontSize = 0;

  for (const p of topParas) {
    const text = p.text.trim();
    const lowerText = text.toLowerCase();
    const isHeaderOrMetadataCandidate =
      lowerText.includes('sciencedirect') ||
      lowerText.includes('article') ||
      lowerText.includes('consensus statement') ||
      lowerText.includes('check for updates') ||
      lowerText.includes('downloaded') ||
      lowerText.includes('http') ||
      lowerText.includes('volume') ||
      lowerText.includes('issue') ||
      lowerText.includes('copyright') ||
      lowerText.includes('©') ||
      lowerText.includes('issn');

    if (isHeaderOrMetadataCandidate) {
      continue;
    }

    const fontSize = p.items.reduce((sum, it) => sum + it.height, 0) / (p.items.length || 1);
    if (fontSize > maxFontSize) {
      maxFontSize = fontSize;
      titlePara = p;
    }
  }

  const titleY = titlePara ? titlePara.items.reduce((sum, it) => sum + it.y, 0) / (titlePara.items.length || 1) : 0;

  for (const p of mergedLogicalParas) {
    const avgY = p.items.reduce((sum, it) => sum + it.y, 0) / (p.items.length || 1);
    if (avgY < firstBodyY - 5) {
      if (p === titlePara) {
        p.blockType = 'title';
      } else if (avgY < titleY) {
        const text = p.text.trim();
        const words = text.split(/\s+/).filter(Boolean);
        const lowerText = text.toLowerCase();
        const looksLongBodyProse =
          text.length > 110 &&
          words.length >= 18 &&
          !/^https?:\/\//i.test(text) &&
          !lowerText.includes('downloaded from') &&
          !lowerText.includes('copyright') &&
          !lowerText.includes('sciencedirect');
        p.blockType = looksLongBodyProse ? 'body' : 'header';
      } else {
        const text = p.text.trim();
        const lowerText = text.toLowerCase();

        // Check if it is metadata/download stamp
        const isMetadata =
          lowerText.includes('downloaded') ||
          lowerText.includes('http') ||
          lowerText.includes('doi:') ||
          lowerText.includes('doi.org') ||
          lowerText.includes('issn') ||
          lowerText.includes('published by') ||
          lowerText.includes('elsevier') ||
          lowerText.includes('springer') ||
          lowerText.includes('nature') ||
          lowerText.includes('volume') ||
          lowerText.includes('issue');

        // Check if it is affiliation / footnote
        const isAffiliationOrFootnote =
          lowerText.includes('university') ||
          lowerText.includes('department of') ||
          lowerText.includes('institute') ||
          lowerText.includes('school of') ||
          lowerText.includes('hospital') ||
          lowerText.includes('laboratory') ||
          lowerText.includes('correspondence to') ||
          lowerText.includes('e-mail:') ||
          lowerText.includes('email:') ||
          lowerText.includes('@') ||
          lowerText.includes('contributed equally') ||
          lowerText.includes('creative commons') ||
          lowerText.includes('license');

        if (isMetadata) {
          p.blockType = 'header';
        } else if (isAffiliationOrFootnote || isLikelyAuthorList(text)) {
          p.blockType = 'authors';
        } else {
          // Subtitle or Abstract/Summary in the top region
          p.blockType = 'body';
        }
      }
    } else {
      if (!p.blockType || p.blockType === 'unknown' || p.blockType === 'body') {
        p.blockType = 'body';
      }
    }
  }

  // 9. Render spans and compute paragraph bounding boxes
  const sentenceMap = new Map<string, Sentence>();
  const spanToSentence = new Map<HTMLSpanElement, string>();
  const paragraphs: Paragraph[] = [];
  const sortedRuleMarkers = [...effectiveRules].sort((a, b) => a.y - b.y);

  let sentenceId = 0;
  let ruleCursor = 0;

  const emitRuleMarkersBefore = (y: number) => {
    while (ruleCursor < sortedRuleMarkers.length && sortedRuleMarkers[ruleCursor].y <= y) {
      const rule = sortedRuleMarkers[ruleCursor];
      const ruleWidth = Math.max(1, rule.x2 - rule.x1);
      paragraphs.push({
        id: `line-rule-${ruleCursor}`,
        text: '',
        x: rule.x1,
        y: rule.y,
        width: ruleWidth,
        height: Math.max(1, rule.thickness),
        fontSize: Math.max(1, rule.thickness),
        section: 'full',
        blockType: 'unknown',
        skipped: true,
        lineMarker: 'horizontal-rule',
        ruleX1: rule.x1,
        ruleX2: rule.x2,
      });
      ruleCursor++;
    }
  };

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
    const skipReason = shouldSkipParagraphForTranslation(para, viewport.width, viewport.height, firstBodyY, hasSidebar);
    const shouldSkip = skipReason !== null;

    // Detect bold: check if majority of items (by text length) use a bold font
    const boldScore = para.items.reduce((score, it) => {
      return isBoldFont(it.fontName) ? score + it.str.length : score;
    }, 0);
    const totalLen = para.items.reduce((sum, it) => sum + it.str.length, 0);
    const isBold = totalLen > 0 && (boldScore / totalLen) > 0.5;

    const sentsList: Array<{ id: string; text: string }> = [];
    emitRuleMarkersBefore(y);

    if (!shouldSkip) {
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
          span.dataset.paragraphId = para.id;
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
      sentences: sentsList.length > 0 ? sentsList : undefined,
      bold: isBold || undefined,
      blockType: para.blockType,
      skipped: shouldSkip,
      skipReason: skipReason ?? undefined,
    });
  }
  emitRuleMarkersBefore(Number.POSITIVE_INFINITY);

  // Debug: log font names and block types
  console.log('[ChunZen] Font names:', [...fontNames]);
  if (blocks) {
    console.log('[ChunZen] Blocks:', blocks.map((b: StructuralBlock) => `${b.type}(${b.segments.length}segs)`));
  }
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
  const text = seg.str.replace(/<[^>]+>/g, '').trim();
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
  const text = seg.str.replace(/<[^>]+>/g, '').trim();
  return /^(Figure|Fig\.?|Table)\s+\d/i.test(text);
}

function isSidebarTocHeading(
  seg: LineSegment,
  columnMargins: Map<number, { left: number; width: number }>,
  pageWidth: number
): boolean {
  if (seg.columnIndex < 0) return false;
  const text = seg.str.replace(/<[^>]+>/g, '').trim();
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
  const text = seg.str.replace(/<[^>]+>/g, '').trim();
  if (!text) return false;
  if (/^(figure|fig\.?|table)\s+\d/i.test(text)) return false;

  const colWidth = columnMargins.get(seg.columnIndex)?.width ?? pageWidth;
  if (seg.width > colWidth * 0.96) return false;
  if (text.length > 120) return false;

  return true;
}

function isReferenceStart(str: string, inReferencesSection: boolean = false, isHanging?: boolean): boolean {
  const text = str.replace(/<[^>]+>/g, '').trim();
  if (/^\[\d{1,4}\]/.test(text)) return true;
  if (/^\[\d{1,4}[,;]/.test(text)) return true;
  
  const dotNumMatch = text.match(/^(\d{1,4})\.\s/);
  if (dotNumMatch) {
    const num = parseInt(dotNumMatch[1], 10);
    const isYear = num >= 1800 && num <= 2100;
    if (!isYear) {
      if (inReferencesSection || text.length > 10) return true;
    }
  }

  // Standalone dot-numbers like "17." (which may be a separate segment)
  const standaloneDotNumMatch = text.match(/^(\d{1,4})\.$/);
  if (standaloneDotNumMatch) {
    const num = parseInt(standaloneDotNumMatch[1], 10);
    const isYear = num >= 1800 && num <= 2100;
    if (!isYear) return true;
  }

  // Standalone bracketed numbers like "[17]"
  if (/^\[\d{1,4}\]$/.test(text)) return true;
  
  // Naked numbers in references section
  if (inReferencesSection) {
    const nakedMatch = text.match(/^(\d{1,4})(?:\s+(.*))?$/);
    if (nakedMatch) {
      const num = parseInt(nakedMatch[1], 10);
      const isYear = num >= 1800 && num <= 2100;
      if (!isYear) return true;
    }
  }

  // Author-date style check
  const hasAuthorPattern = /^[A-Z][a-zA-Z\u00C0-\u017F\-]+,?\s+[A-Z]\b/.test(text);
  if (hasAuthorPattern) {
    if (inReferencesSection) {
      if (isHanging === true) {
        return true;
      } else if (isHanging === false) {
        return false;
      } else {
        return /\b(19|20)\d{2}\b/.test(text);
      }
    } else {
      return /\b(19|20)\d{2}\b/.test(text);
    }
  }

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
    if ((isHeadingSegment(seg) || text.length < 30) && /^(\d+(\.\d+)*\s+)?(references|bibliography|works?\s+cited|references\s+and\s+notes)\b/i.test(text)) {
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
        if (refSegs.length > 0 && cur.flowBand !== refSegs[refSegs.length - 1].flowBand) break;
        if (isHeadingSegment(cur)) break;
        if (isFigureCaptionSegment(cur)) break;

        const colLeft = columnMargins.get(cur.columnIndex)?.left ?? 0;
        const isHanging = colLeft > 0 ? (Math.abs(cur.x - colLeft) < 4) : undefined;

        if (refSegs.length === 0 || isReferenceStart(cur.str, pastReferencesHeading, isHanging) || isContinuationOfReference(cur, refSegs[refSegs.length - 1], columnMargins)) {
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
        if (next.flowBand !== seg.flowBand) break;
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
        if (next.flowBand !== seg.flowBand) break;
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
        if (cur.flowBand !== seg.flowBand) break;
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
        if (next.flowBand !== seg.flowBand) break;
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
      if (next.flowBand !== seg.flowBand) break;
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

  // Post-pass: detect reference-only continuation pages
  // If no reference blocks were found, check if the page is predominantly reference-like.
  // This handles continuation pages where the "References" heading was on a previous page.
  if (!blocks.some(b => b.type === 'reference')) {
    let refStartCount = 0;
    let totalNonEmpty = 0;
    for (const seg of segments) {
      if (!seg.str.trim()) continue;
      totalNonEmpty++;
      const colLeft = columnMargins.get(seg.columnIndex)?.left ?? 0;
      const isHanging = colLeft > 0 ? (Math.abs(seg.x - colLeft) < 4) : undefined;
      if (isReferenceStart(seg.str, true, isHanging)) refStartCount++;
    }
    if (refStartCount >= 3 && totalNonEmpty > 0 && refStartCount / totalNonEmpty > 0.08) {
      for (const block of blocks) {
        if (block.type === 'body' || block.type === 'unknown') {
          block.type = 'reference';
        }
      }
    }
  }

  return blocks;
}

function isContinuationOfReference(cur: LineSegment, prev: LineSegment, columnMargins?: Map<number, { left: number; width: number }>): boolean {
  let isHanging: boolean | undefined = undefined;
  if (columnMargins) {
    const colLeft = columnMargins.get(cur.columnIndex)?.left ?? 0;
    if (colLeft > 0) {
      isHanging = Math.abs(cur.x - colLeft) < 4;
    }
  }
  if (isReferenceStart(cur.str, false, isHanging)) return true;
  if (cur.flowBand !== prev.flowBand) return false;
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
      // Table rows: align cells to inferred column anchors and merge wrapped continuation rows.
      const colIndexForWidth = segs[0]?.columnIndex ?? -1;
      const colWidth = columnMargins.get(colIndexForWidth)?.width ?? pageWidth;
      const rowGeoms: TableRowGeom[] = segs.map(seg => ({
        seg,
        cells: splitTableCellsWithGeometry(seg),
      }));
      const anchors = inferTableColumnAnchors(rowGeoms, colWidth);
      const mergedRows = mergeContinuationTableRows(rowGeoms, anchors, colWidth);

      for (const row of mergedRows) {
        const text = row.text;
        const seg = row.seg;
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

      const colLeft = columnMargins.get(segs[0]?.columnIndex >= 0 ? segs[0].columnIndex : 0)?.left ?? 0;

      for (const seg of segs) {
        const segColLeft = columnMargins.get(seg.columnIndex >= 0 ? seg.columnIndex : 0)?.left ?? colLeft;
        const isHanging = segColLeft > 0 ? (Math.abs(seg.x - segColLeft) < 4) : undefined;
        if (isReferenceStart(seg.str, true, isHanging) && refBuf.trim()) {
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

interface TableCellGeom {
  text: string;
  x: number;
}

interface TableRowGeom {
  seg: LineSegment;
  cells: TableCellGeom[];
}

function splitTableCellsWithGeometry(seg: LineSegment): TableCellGeom[] {
  if (seg.items.length === 0) return [];
  const sorted = [...seg.items].sort((a, b) => a.x - b.x);
  const groups: ColLayoutItem[][] = [];
  let buf: ColLayoutItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (buf.length === 0) {
      buf.push(cur);
      continue;
    }
    const prev = buf[buf.length - 1];
    const gap = cur.x - (prev.x + prev.width);
    const splitGap = Math.max(cur.height * 0.55, 7);
    if (gap > splitGap) {
      groups.push(buf);
      buf = [cur];
    } else {
      buf.push(cur);
    }
  }
  if (buf.length > 0) groups.push(buf);

  return groups
    .map(group => ({
      text: composeLineText(group).trim(),
      x: Math.min(...group.map(it => it.x)),
    }))
    .filter(cell => cell.text.length > 0);
}

function clusterColumnAnchors(xs: number[], clusterDistance: number): number[] {
  if (xs.length === 0) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  const clusters: Array<{ center: number; count: number }> = [];
  for (const x of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(x - last.center) > clusterDistance) {
      clusters.push({ center: x, count: 1 });
      continue;
    }
    const nextCount = last.count + 1;
    last.center = (last.center * last.count + x) / nextCount;
    last.count = nextCount;
  }
  return clusters.map(c => c.center);
}

function inferTableColumnAnchors(rows: TableRowGeom[], colWidth: number): number[] {
  const richRows = rows.filter(r => r.cells.length >= 3);
  const sourceRows = richRows.length > 0 ? richRows : rows;
  const xs = sourceRows.flatMap(r => r.cells.map(c => c.x));
  const anchors = clusterColumnAnchors(xs, Math.max(14, colWidth * 0.055));
  if (anchors.length >= 2) return anchors;

  const fallback = rows
    .slice()
    .sort((a, b) => b.cells.length - a.cells.length || b.seg.width - a.seg.width)[0];
  return fallback ? fallback.cells.map(c => c.x).sort((a, b) => a - b) : [];
}

function mapRowCellsToAnchors(cells: TableCellGeom[], anchors: number[]): string[] {
  if (anchors.length === 0) return cells.map(c => c.text);
  const mapped = Array.from({ length: anchors.length }, () => '');
  let minAnchorIndex = 0;

  for (const cell of cells) {
    let bestIdx = minAnchorIndex;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = minAnchorIndex; i < anchors.length; i++) {
      const dist = Math.abs(cell.x - anchors[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    mapped[bestIdx] = mapped[bestIdx] ? `${mapped[bestIdx]} ${cell.text}` : cell.text;
    minAnchorIndex = Math.min(anchors.length - 1, bestIdx + 1);
  }

  return mapped;
}

function mergeContinuationTableRows(
  rows: TableRowGeom[],
  anchors: number[],
  colWidth: number
): Array<{ text: string; seg: LineSegment }> {
  if (rows.length === 0) return [];
  const expectedCols = Math.max(anchors.length, rows.reduce((m, r) => Math.max(m, r.cells.length), 0));
  const output: Array<{ seg: LineSegment; mapped: string[] }> = [];

  for (const row of rows) {
    const mapped = mapRowCellsToAnchors(row.cells, anchors);
    while (mapped.length < expectedCols) mapped.push('');

    const nonEmptyIdx = mapped
      .map((txt, idx) => (txt.trim() ? idx : -1))
      .filter(idx => idx >= 0);
    const nonEmptyCount = nonEmptyIdx.length;
    const firstCol = nonEmptyCount > 0 ? nonEmptyIdx[0] : -1;

    const prev = output[output.length - 1];
    const yGap = prev ? Math.max(0, row.seg.y - prev.seg.y) : Number.POSITIVE_INFINITY;
    const closeToPrev = prev ? yGap <= Math.max(prev.seg.height, row.seg.height) * 2.4 : false;
    const shortRow = nonEmptyCount > 0 && nonEmptyCount <= Math.max(2, expectedCols - 2);
    const narrowRow = row.seg.width < colWidth * 0.82;
    const hasLeftKey = mapped[0].trim().length > 0;
    const looksContinuation = !!prev && closeToPrev && shortRow && narrowRow && !hasLeftKey && firstCol >= 1;

    if (looksContinuation) {
      for (let i = 0; i < mapped.length; i++) {
        const txt = mapped[i].trim();
        if (!txt) continue;
        prev.mapped[i] = prev.mapped[i] ? `${prev.mapped[i]} ${txt}` : txt;
      }
      prev.seg = row.seg;
      continue;
    }

    output.push({ seg: row.seg, mapped });
  }

  return output.map(row => {
    const cells = [...row.mapped];
    while (cells.length > 1 && !cells[cells.length - 1].trim()) cells.pop();
    return {
      text: cells.join('\t').trim(),
      seg: row.seg,
    };
  });
}

// ── Existing Helper functions ──

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

function createSegment(lineItems: ColLayoutItem[], colIndex: number, styles?: Record<string, any>, commonObjs?: any): LineSegment {
  const xs = lineItems.map(it => it.x);
  const ys = lineItems.map(it => it.y);
  const xMaxs = lineItems.map(it => it.x + it.width);
  const yMaxs = lineItems.map(it => it.y + it.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xMaxs) - x;
  const height = Math.max(...yMaxs) - y;
  const str = styles ? composeFormattedLineText(lineItems, styles, commonObjs) : composeLineText(lineItems);

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

function normalizeHorizontalRuleBarriers(
  rules: HorizontalRule[],
  viewportWidth: number,
  viewportHeight: number,
  firstBodyY: number
): HorizontalRule[] {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  const filtered = rules
    .filter(rule => Number.isFinite(rule.y) && Number.isFinite(rule.x1) && Number.isFinite(rule.x2))
    .filter(rule => {
      const width = Math.max(0, rule.x2 - rule.x1);
      if (width < viewportWidth * 0.25) return false;
      if (rule.y < viewportHeight * 0.04) return false;
      if (rule.y < firstBodyY - 12) return false;
      if (rule.y > viewportHeight * 0.98) return false;
      return true;
    })
    .sort((a, b) => a.y - b.y);

  const merged: HorizontalRule[] = [];
  for (const rule of filtered) {
    const prev = merged[merged.length - 1];
    const yTol = Math.max(2, rule.thickness * 1.5);
    if (prev && Math.abs(prev.y - rule.y) <= yTol) {
      prev.x1 = Math.min(prev.x1, rule.x1);
      prev.x2 = Math.max(prev.x2, rule.x2);
      prev.y = (prev.y + rule.y) / 2;
      prev.thickness = Math.max(prev.thickness, rule.thickness);
    } else {
      merged.push({ ...rule });
    }
  }
  return merged;
}

function orderSegmentsWithHorizontalBarriers(
  segments: LineSegment[],
  rules: HorizontalRule[],
  hasSidebar: boolean,
  detectedColumnsCount: number
): LineSegment[] {
  if (segments.length === 0) return [];
  if (rules.length === 0) {
    const orderedSingleBand = orderSegmentBand(segments, hasSidebar, detectedColumnsCount);
    for (const seg of orderedSingleBand) seg.flowBand = 0;
    return orderedSingleBand;
  }

  const sortedByY = [...segments].sort((a, b) => a.y - b.y);
  const bands: LineSegment[][] = [];
  let currentBand: LineSegment[] = [];
  let ruleIndex = 0;

  for (const seg of sortedByY) {
    while (ruleIndex < rules.length && seg.y > rules[ruleIndex].y + Math.max(2, rules[ruleIndex].thickness * 0.5)) {
      if (currentBand.length > 0) {
        bands.push(currentBand);
        currentBand = [];
      }
      ruleIndex++;
    }
    currentBand.push(seg);
  }
  if (currentBand.length > 0) bands.push(currentBand);

  const ordered: LineSegment[] = [];
  for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
    const band = bands[bandIndex];
    const bandOrdered = orderSegmentBand(band, hasSidebar, detectedColumnsCount);
    for (const seg of bandOrdered) {
      seg.flowBand = bandIndex;
      ordered.push(seg);
    }
  }
  return ordered;
}

function orderSegmentBand(
  segments: LineSegment[],
  hasSidebar: boolean,
  detectedColumnsCount: number
): LineSegment[] {
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
    return [...headerFullSegs, ...leftSegs, ...footerFullSegs, ...rightSegs];
  }

  if (detectedColumnsCount <= 1) {
    // Single column: map all to col 0, sort by Y
    for (const seg of segments) {
      seg.columnIndex = 0;
      seg.section = 'left';
    }
    return [...segments].sort((a, b) => a.y - b.y);
  }

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

  const ordered: LineSegment[] = [];
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
        ordered.push(seg);
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
        ordered.push(...colSegs);
      }
    }
  }
  return ordered;
}

function isItalic(fontName: string, styles: Record<string, any>, commonObjs?: any): boolean {
  if (!fontName) return false;
  
  // Strategy 1: Check styles returned from getTextContent
  const style = styles[fontName];
  if (style && style.fontFamily) {
    const family = style.fontFamily.toLowerCase();
    if (family.includes('italic') || family.includes('oblique') || family.includes('obli') || family.includes('ital')) {
      return true;
    }
  }
  
  // Strategy 2: Check commonObjs if available and resolved
  if (commonObjs && typeof commonObjs.has === 'function' && commonObjs.has(fontName)) {
    try {
      const obj = commonObjs.get(fontName);
      if (obj) {
        if (obj.italic) return true;
        if (obj.name) {
          const name = obj.name.toLowerCase();
          if (name.includes('italic') || name.includes('oblique') || name.includes('obli') || name.includes('ital')) {
            return true;
          }
        }
      }
    } catch {
      // Ignore unresolved errors
    }
  }
  
  return false;
}

function composeFormattedLineText(items: ColLayoutItem[], styles: Record<string, any>, commonObjs?: any): string {
  if (items.length === 0) return '';
  if (items.length === 1) {
    const it = items[0];
    const italic = isItalic(it.fontName, styles, commonObjs);
    let txt = it.str.trim();
    if (italic) txt = `<i>${txt}</i>`;
    return txt;
  }

  // Calculate baseline to identify superscripts/subscripts
  let totalLen = 0;
  let heightSum = 0;
  for (const it of items) {
    if (it.str.trim()) {
      heightSum += it.height * it.str.length;
      totalLen += it.str.length;
    }
  }
  const baseHeight = totalLen > 0 ? heightSum / totalLen : 10;

  let ySum = 0;
  let yCount = 0;
  for (const it of items) {
    if (it.str.trim() && it.height >= baseHeight * 0.85) {
      ySum += it.y * it.str.length;
      yCount += it.str.length;
    }
  }
  const baseY = yCount > 0 ? ySum / yCount : items[0].y;

  const getFormattedItemText = (it: ColLayoutItem) => {
    const italic = isItalic(it.fontName, styles, commonObjs);
    const isSup = it.height < baseHeight * 0.88 && it.y < baseY - 1.2;
    const isSub = it.height < baseHeight * 0.88 && it.y > baseY + 1.2;
    
    let text = it.str;
    if (italic) {
      text = `<i>${text}</i>`;
    }
    if (isSup) {
      text = `<sup>${text}</sup>`;
    } else if (isSub) {
      text = `<sub>${text}</sub>`;
    }
    return { text, isSup, isSub };
  };

  const formatted0 = getFormattedItemText(items[0]);
  let text = formatted0.text;
  let prevIsSup = formatted0.isSup;
  let prevIsSub = formatted0.isSub;

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const prevText = prev.str;
    const curText = cur.str;
    const gap = cur.x - (prev.x + prev.width);
    const gapThreshold = Math.max(cur.height * 0.2, 1.5);
    
    const formattedCur = getFormattedItemText(cur);
    const curIsSup = formattedCur.isSup;
    const curIsSub = formattedCur.isSub;

    const attachNoSpace =
      gap <= gapThreshold ||
      /^[,.;:!?%)\]}]/.test(curText) ||
      /[(\[{]$/.test(prevText) ||
      (curIsSup && !prevIsSup) ||
      (curIsSub && !prevIsSub) ||
      (!curIsSup && prevIsSup) ||
      (!curIsSub && prevIsSub);

    if (attachNoSpace) {
      text += formattedCur.text;
    } else {
      text += ` ${formattedCur.text}`;
    }
    
    prevIsSup = curIsSup;
    prevIsSub = curIsSub;
  }
  return text.trim();
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

  // Font-size change split to prevent titles and author lists from merging
  const prevFontSize = prev.items.reduce((s, it) => s + it.height, 0) / (prev.items.length || 1);
  const curFontSize = cur.items.reduce((s, it) => s + it.height, 0) / (cur.items.length || 1);
  if (prevFontSize > 0 && curFontSize > 0) {
    const fontRatio = Math.max(prevFontSize / curFontSize, curFontSize / prevFontSize);
    if (fontRatio > 1.25) {
      return true;
    }
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
  const curStartsUpper = /^[A-Z]/.test(curText);
  const curStartsList = /^(\(?\d+\)?[.)]?\s+|[-•*]\s+)/.test(curText);
  const prevEndsTerminal = /[.!?;:。！？；：]$/.test(prevText);

  const curIndent = Math.max(0, cur.x - colMargin);
  const prevIndent = Math.max(0, prev.x - colMargin);
  const indentDelta = curIndent - prevIndent;
  const hasFirstLineIndent =
    curIndent > Math.max(cur.height * 1.6, 12) &&
    prevIndent < Math.max(prev.height * 0.6, 5) &&
    indentDelta > Math.max(cur.height * 0.9, 8);

  const spacingBreak = yGap > Math.max(baseGap * 1.12, lineH * 1.35);

  // Conservative keep-together: wrapped lines inside the same paragraph should
  // not be split unless there is strong boundary evidence.
  if (!prevEndsTerminal && yGap <= Math.max(baseGap * 1.2, lineH * 1.45) && !curStartsList) {
    return false;
  }

  // Capitalized sentence starts are common in wrapped academic prose.
  // Do not split only because the next line begins with uppercase.
  if (
    prevEndsTerminal &&
    curStartsUpper &&
    !curStartsList &&
    !hasFirstLineIndent &&
    !spacingBreak &&
    Math.abs(indentDelta) <= Math.max(cur.height * 0.9, 7)
  ) {
    return false;
  }

  if (curStartsList) return true;
  if (hasFirstLineIndent && !curStartsLower && prevEndsTerminal && spacingBreak) return true;

  return false;
}

function getPlainTextIndexToHtmlIndexMap(html: string): number[] {
  const map: number[] = [];
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const char = html[i];
    if (char === '<') {
      inTag = true;
    }
    if (!inTag) {
      map.push(i);
    }
    if (char === '>') {
      inTag = false;
    }
  }
  return map;
}

function computeItemOffsets(text: string, items: ColLayoutItem[]): Array<{ start: number; end: number }> {
  const map = getPlainTextIndexToHtmlIndexMap(text);
  const plainText = text.replace(/<[^>]+>/g, '');
  const offsets: Array<{ start: number; end: number }> = [];
  let currentIndex = 0;

  for (const item of items) {
    const str = item.str;
    if (!str) {
      const htmlIdx = currentIndex < map.length ? map[currentIndex] : text.length;
      offsets.push({ start: htmlIdx, end: htmlIdx });
      continue;
    }

    let start = plainText.indexOf(str, currentIndex);
    if (start === -1) {
      const lowerText = plainText.toLowerCase();
      const lowerStr = str.toLowerCase();
      start = lowerText.indexOf(lowerStr, currentIndex);
    }

    if (start === -1) {
      start = currentIndex;
    }

    const end = start + str.length;
    
    const htmlStart = start < map.length ? map[start] : text.length;
    const lastCharIdx = end - 1;
    const htmlEnd = lastCharIdx < map.length ? map[lastCharIdx] + 1 : text.length;
    
    offsets.push({ start: htmlStart, end: htmlEnd });
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
  const DOT_PLACEHOLDER = '__DOT_ABBR__';
  const protectedText = text
    // Common academic abbreviations that should not terminate a sentence.
    .replace(/\bet al\./gi, (m) => m.replace('.', DOT_PLACEHOLDER))
    .replace(/\b(fig|figs|eq|eqs|ref|refs|no|nos|dr|mr|mrs|ms|prof|inc|vs)\./gi, (m) => m.replace('.', DOT_PLACEHOLDER))
    // Single-letter initials (e.g. "S.-S. Wang", "A. B. Smith")
    .replace(/\b([A-Z])\./g, `$1${DOT_PLACEHOLDER}`);

  const results: string[] = [];
  const re = /[^.!?。！？]*[.!?。！？]+(?:\s|$)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(protectedText)) !== null) {
    results.push(m[0]);
    last = re.lastIndex;
  }
  if (last < protectedText.length) results.push(protectedText.slice(last));
  return results
    .map(s => s.replaceAll(DOT_PLACEHOLDER, '.'))
    .filter(s => s.trim().length > 2);
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

function detectRightEdgeNoiseZones(items: TextItem[], viewport: PdfViewport): RightEdgeNoiseZone[] {
  const candidates: Array<{ x: number; y: number; width: number; height: number; anchor: boolean }> = [];

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    if (!tx || isNaN(tx[4]) || isNaN(tx[5])) continue;

    const x = tx[4];
    const y = tx[5];
    const width = item.width * viewport.scale;
    const height = item.height * viewport.scale;
    const right = x + width;

    if (height > 8.5) continue;
    if (x < viewport.width * 0.86 && right < viewport.width * 0.93) continue;

    const text = item.str.trim();
    const lower = text.toLowerCase();
    const anchor =
      /^https?:\/\//.test(lower) ||
      lower.includes('doi.org') ||
      lower.includes('downloaded') ||
      lower.includes('guest') ||
      lower.includes('rupress.org') ||
      /\b20\d{2}\b/.test(lower);
    const weak =
      /^(from|by|on)$/i.test(text) ||
      /^(may|june|july|august|september|october|november|december|january|february|march|april)$/i.test(text);

    if (!anchor && !weak) continue;
    candidates.push({ x, y, width, height, anchor });
  }

  if (candidates.length === 0 || !candidates.some(c => c.anchor)) return [];

  candidates.sort((a, b) => a.x - b.x);
  const clusters: Array<{ items: typeof candidates; anchorCount: number }> = [];
  const xThreshold = 24;

  for (const c of candidates) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push({ items: [c], anchorCount: c.anchor ? 1 : 0 });
      continue;
    }
    const lastAvgX = last.items.reduce((sum, it) => sum + it.x, 0) / last.items.length;
    if (Math.abs(c.x - lastAvgX) <= xThreshold) {
      last.items.push(c);
      if (c.anchor) last.anchorCount++;
    } else {
      clusters.push({ items: [c], anchorCount: c.anchor ? 1 : 0 });
    }
  }

  const zones: RightEdgeNoiseZone[] = [];
  for (const cluster of clusters) {
    if (cluster.anchorCount < 1) continue;
    if (cluster.items.length < 3) continue;

    const xs = cluster.items.map(it => it.x);
    const ys = cluster.items.map(it => it.y);
    const rights = cluster.items.map(it => it.x + it.width);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...rights);
    if (xMin < viewport.width * 0.84) continue;

    zones.push({
      xMin: Math.max(0, xMin - 4),
      xMax: Math.min(viewport.width, xMax + 4),
      yMin: Math.max(0, Math.min(...ys) - 6),
      yMax: Math.min(viewport.height, Math.max(...ys) + 10),
    });
  }

  return zones;
}

function isRightEdgeWatermarkToken(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  rightEdgeNoiseZones: RightEdgeNoiseZone[]
): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  const looksWatermarkLexeme =
    t === 'downloaded' ||
    t === 'from' ||
    /^https?:\/\//.test(t) ||
    t.includes('rupress.org');
  const weakLexeme = /^(from|by|on|guest)$/i.test(text.trim()) || /\b20\d{2}\b/.test(t);

  const inNoiseZone = rightEdgeNoiseZones.some(zone => {
    const right = x + width;
    const yBottom = y + height;
    const xOverlap = right >= zone.xMin && x <= zone.xMax;
    const yOverlap = yBottom >= zone.yMin && y <= zone.yMax;
    return xOverlap && yOverlap;
  });

  if (inNoiseZone && height <= 8.5 && (looksWatermarkLexeme || weakLexeme)) return true;
  if (!looksWatermarkLexeme) return false;
  const rightEdge = x >= viewportWidth * 0.92 || (x + width) >= viewportWidth * 0.985;
  const tinyFont = height <= 7.5;
  return rightEdge && tinyFont;
}

function inferFirstBodyY(lines: ColLayoutItem[][], viewportHeight: number, pageNumber?: number): number {
  if (lines.length === 0) return viewportHeight * 0.45;
  const candidates: number[] = [];
  // Continuation pages can start body text close to the top margin.
  // Keep this loose enough to avoid skipping early dual-column lines.
  const minY = viewportHeight * 0.07;
  const maxY = viewportHeight * 0.72;
  const isFirstPage = pageNumber === undefined || pageNumber === 1;

  for (const line of lines) {
    if (line.length === 0) continue;
    const y = line[0].y;
    if (y < minY || y > maxY) continue;

    const text = composeLineText(line).trim();
    if (!text) continue;

    const lower = text.toLowerCase();
    if (isFirstPage && isLikelyAuthorList(text)) continue;
    if (
      lower.includes('corresponding author') ||
      lower.includes('addresses') ||
      lower.includes('this review comes from') ||
      lower.includes('edited by') ||
      lower.includes('current opinion') ||
      lower.includes('published by') ||
      lower.includes('sciencedirect') ||
      lower.includes('copyright') ||
      lower.includes('doi:') ||
      lower.includes('doi.org') ||
      lower.includes('issn') ||
      lower.includes('downloaded from') ||
      /https?:\/\//.test(lower)
    ) {
      continue;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 6) continue;
    if (text.length < 45) continue;
    candidates.push(y);
  }

  if (candidates.length === 0) return viewportHeight * 0.45;
  // Keep the earliest qualified body line. A hard floor like 0.18 * page height
  // can incorrectly push continuation pages downward and skip top body lines.
  return Math.min(...candidates);
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

  // 4. Journal running headers in top region (e.g. "circRNAs in cancer Patop and Kadener 127")
  //    These contain article title + author names + trailing page number
  if (isTopRegion && /\d{1,5}\s*$/.test(trimmed)) {
    const withoutTrailingNum = trimmed.replace(/\d{1,5}\s*$/, '').trim();
    if (withoutTrailingNum.length >= 10 && /[A-Z][a-z]/.test(withoutTrailingNum)) {
      return true;
    }
  }

  return false;
}

function mapRoleToBlockType(role?: 'p' | 'heading' | 'figure' | 'table' | 'other'): BlockType {
  if (!role) return 'unknown';
  if (role === 'p') return 'body';
  if (role === 'heading') return 'heading';
  if (role === 'figure') return 'figure-caption';
  if (role === 'table') return 'table';
  return 'unknown';
}

function assignLayoutToParagraph(
  para: LogicalParagraph,
  pageWidth: number,
  midX: number,
  isDoubleColumn: boolean,
  expandedZones: Array<{ minY: number; maxY: number }>,
  hasSidebar: boolean,
  sidebarGutterX: number,
  effectiveGutters: number[],
  firstBodyY: number
) {
  if (para.items.length === 0) return;

  const xs = para.items.map(it => it.x);
  const ys = para.items.map(it => it.y);
  const avgX = xs.reduce((s, x) => s + x, 0) / xs.length;
  const avgY = ys.reduce((s, y) => s + y, 0) / ys.length;

  const minParaX = Math.min(...xs);
  const maxParaX = Math.max(...para.items.map(it => it.x + it.width));
  const paraWidth = maxParaX - minParaX;

  let colIndex = -1;
  // Only assign columns below body separator
  if (avgY >= firstBodyY - 5) {
    if (hasSidebar) {
      if (minParaX >= sidebarGutterX - 5 && paraWidth < pageWidth * 0.45) {
        colIndex = 1;
      } else if (maxParaX <= sidebarGutterX + 5 || paraWidth >= pageWidth * 0.65) {
        colIndex = 0;
      }
    } else if (isDoubleColumn) {
      const inDoubleColumnZone = expandedZones.some(zone => avgY >= zone.minY && avgY <= zone.maxY);
      if (inDoubleColumnZone && paraWidth < pageWidth * 0.55) {
        colIndex = avgX < midX ? 0 : 1;
      }
    } else if (effectiveGutters.length > 0 && paraWidth < pageWidth * 0.82) {
      colIndex = estimateColumnIndex(para.items, effectiveGutters, pageWidth);
    }
  }

  para.columnIndex = colIndex >= 0 ? colIndex : undefined;
  para.section = sectionFromColumnIndex(colIndex);
}

function shouldSkipParagraphForTranslation(
  para: LogicalParagraph,
  viewportWidth: number,
  viewportHeight: number,
  firstBodyY: number,
  hasSidebar: boolean
): ParagraphSkipReason | null {
  const text = para.text.trim();
  if (!text) return 'empty';

  // 0. DOI/ISSN Exception: If it contains a DOI or ISSN, KEEP it (never skip).
  if (/\b10\.\d{4,9}\//.test(text) || /\b\d{4}-\d{3}[\dX]\b/.test(text)) {
    return null;
  }

  // Coordinate thresholds
  const ys = para.items.map(it => it.y);
  const avgY = ys.reduce((s, y) => s + y, 0) / (ys.length || 1);
  const isExtremeTop = avgY < viewportHeight * 0.08;
  const isExtremeBottom = avgY > viewportHeight * 0.92;
  const lowerText = text.toLowerCase();
  const startsWithHttp = /^https?:\/\//i.test(text);
  const minX = Math.min(...para.items.map(it => it.x));
  const rightSideLike = para.section === 'right' || para.columnIndex === 1 || minX > viewportWidth * 0.56;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Guard rail: top continuation-body prose should not be skipped as header noise.
  const nearTopBodyProse =
    avgY <= firstBodyY + 28 &&
    text.length > 110 &&
    wordCount >= 18 &&
    !startsWithHttp &&
    !lowerText.includes('downloaded from');
  if (nearTopBodyProse) return null;

  // 1. Sidebar / TOC
  if (hasSidebar && para.columnIndex === 1) return 'sidebar-column';

  // 2. Authors/Headers blockType
  if (para.blockType === 'authors' || para.blockType === 'header') return 'header-or-authors';

  // 3. Running Headers / Footers metadata
  if (isExtremeTop || isExtremeBottom) {
    if (lowerText.includes('copyright') || lowerText.includes('©') || lowerText.includes('all rights reserved')) return 'edge-metadata';
    if (lowerText.includes('doi:') || lowerText.includes('doi.org')) return 'edge-metadata';
    if (lowerText.includes('issn') || lowerText.includes('e-issn') || lowerText.includes('eissn')) return 'edge-metadata';
    if (lowerText.includes('http://') || lowerText.includes('https://') || lowerText.includes('www.')) return 'edge-metadata';
    if (/^\d+$/.test(text)) return 'edge-metadata';
    if (/^page\s+\d+$/i.test(text)) return 'edge-metadata';
    if (/^\d+\s+of\s+\d+$/i.test(text)) return 'edge-metadata';
    if (lowerText.includes('downloaded from') || lowerText.includes('published by') || lowerText.includes('sciencedirect')) return 'edge-metadata';
    if (lowerText.includes('consensus statement') || lowerText.includes('check for updates')) return 'edge-metadata';
  }

  // Additional metadata/DOIs anywhere on first page
  const isMetadata = lowerText.includes('doi:') || lowerText.includes('doi.org') || lowerText.includes('elsevier') || lowerText.includes('edited by') || lowerText.includes('current opinion') || lowerText.includes('sciencedirect') || lowerText.includes('check for updates') || lowerText.includes('downloaded from');
  if (isMetadata && avgY < firstBodyY + 100) return 'top-metadata';

  // Side watermark fragments can be split into multiple tiny lines ("Downloaded", "from", url).
  // Skip these regardless of vertical position.
  if (lowerText === 'downloaded' || lowerText === 'from') return 'watermark-fragment';
  // Treat right-side http links as page-side metadata/noise.
  if (startsWithHttp && rightSideLike) return 'right-http-noise';

  // 4. Affiliations, Footnotes, Correspondence
  const isAffiliationOrFootnote =
    lowerText.includes('university') ||
    lowerText.includes('department of') ||
    lowerText.includes('institute') ||
    lowerText.includes('school of') ||
    lowerText.includes('hospital') ||
    lowerText.includes('correspondence to') ||
    lowerText.includes('e-mail:') ||
    lowerText.includes('email:') ||
    lowerText.includes('@') ||
    lowerText.includes('contributed equally') ||
    lowerText.includes('creative commons') ||
    lowerText.includes('license');

  if (isAffiliationOrFootnote) {
    if (avgY < firstBodyY + 90 || avgY > viewportHeight * 0.65) {
      return 'affiliation-footnote';
    }
  }

  return null;
}

function isLikelyAuthorList(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // If it is just superscript numbers/symbols/spaces (e.g. footnote pointers like "1 1,2" or "1,2*")
  if (/^[\d\s,;.*†‡§¶]+$/.test(trimmed) && trimmed.length < 30) {
    return true;
  }

  // Calculate ratio of capitalized words
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return false;

  const titleCaseWords = words.filter(w => /^[A-Z]/.test(w)).length;
  const ratio = titleCaseWords / words.length;

  const hasCommas = (trimmed.match(/,/g) || []).length >= 2;
  const hasAnd = /\band\b/i.test(trimmed);

  // Author lists typically have a high proportion of titlecase words and are separated by commas/and, or are very short
  if (ratio > 0.65 && (hasCommas || hasAnd || words.length <= 8) && trimmed.length < 250) {
    return true;
  }

  return false;
}

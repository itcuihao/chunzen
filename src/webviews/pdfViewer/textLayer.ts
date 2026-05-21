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
}

interface ColLayoutItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Column {
  left: number;
  right: number;
}

interface LineItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columnIndex: number;
}

interface SentenceItem {
  text: string;
  items: LineItem[];
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

  // 1. Transform to layout coordinates
  const allItems: ColLayoutItem[] = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport as unknown as number[], item.transform);
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

  // 2. Detect columns from X-coordinate clustering
  const columns = detectColumns(allItems);

  // 3. Filter header/footer/math, assign each item to column, sort into reading order
  const refined = refineItems(allItems, columns, viewport.height);

  // 4. Group into lines (within same column, by Y coordinate)
  const lines = itemsToLines(refined);

  // 5. Dehyphenate
  const clean = dehyphenate(lines);

  // 6. Merge lines to paragraphs
  const logicalParas = buildParagraphs(clean);

  // 7. Render spans and compute paragraph bounding boxes
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
      fontSize
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

  return { sentences: sentenceMap, spanToSentence, paragraphs, columnsCount: columns.length };
}

// ── Column Detection ──

function detectColumns(items: ColLayoutItem[]): Column[] {
  // Build histogram of X positions to find column boundaries
  const bins = new Map<number, number>(); // rounded x → count
  const BIN_SIZE = 10;

  for (const item of items) {
    const bin = Math.round(item.x / BIN_SIZE) * BIN_SIZE;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }

  const sortedBins = [...bins.entries()].sort((a, b) => a[0] - b[0]);

  // Find gaps between bins (regions with low density)
  if (sortedBins.length === 0) return [{ left: 0, right: items[0]?.width || 800 }];

  const minX = sortedBins[0][0];
  const maxX = sortedBins[sortedBins.length - 1][0];
  const pageWidth = maxX - minX;

  // Build density profile: sliding window of 20px
  const density: Array<{ x: number; count: number }> = [];
  for (let x = minX; x <= maxX; x += 10) {
    const itemsInRange = items.filter(it => it.x >= x && it.x <= x + 20).length;
    density.push({ x, count: itemsInRange });
  }

  // Find valleys: x ranges where density is very low
  const valleys: Array<{ start: number; end: number }> = [];
  const MEAN_DENSITY = density.reduce((s, d) => s + d.count, 0) / density.length;
  const VALLEY_THRESHOLD = MEAN_DENSITY * 0.05;

  let valleyStart: number | null = null;
  for (let i = 0; i < density.length; i++) {
    if (density[i].count <= VALLEY_THRESHOLD) {
      if (valleyStart === null) valleyStart = density[i].x;
    } else if (valleyStart !== null) {
      valleys.push({ start: valleyStart, end: density[i].x });
      valleyStart = null;
    }
  }
  if (valleyStart !== null) {
    valleys.push({ start: valleyStart, end: maxX + 20 });
  }

  // Only count valleys in the middle 60% of page width (not margins)
  const marginLeft = minX + pageWidth * 0.15;
  const marginRight = maxX - pageWidth * 0.15;
  const midValleys = valleys.filter(v =>
    v.start > marginLeft && v.end < marginRight && (v.end - v.start) > 15
  );

  if (midValleys.length === 0) {
    // Single column
    return [{ left: minX, right: maxX }];
  }

  // Split page at widest valley
  const widest = midValleys.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

  // If the widest valley is too wide (e.g. > 30% of page width), it's likely just a sparse single column page
  if ((widest.end - widest.start) > pageWidth * 0.3) {
    return [{ left: minX, right: maxX }];
  }

  return [
    { left: minX, right: widest.start },
    { left: widest.end, right: maxX }
  ];
}

// ── Item refinement: column assignment, header/footer/math filtering ──

function refineItems(items: ColLayoutItem[], columns: Column[], pageHeight: number): LineItem[] {
  // Skip header/footer region (top 8%, bottom 8% of the actual page height)
  const headerY = pageHeight * 0.08;
  const footerY = pageHeight * 0.92;

  const result: LineItem[] = [];

  for (const item of items) {
    // Skip header/footer region
    if (item.y < headerY || item.y > footerY) continue;

    // Skip math symbols and formula fragments
    if (isMathArtifact(item.str)) continue;

    // Assign to column by center proximity
    const itemMidX = item.x + item.width / 2;
    let colIndex = 0;
    let bestDist = Infinity;

    for (let c = 0; c < columns.length; c++) {
      const colMidX = (columns[c].left + columns[c].right) / 2;
      const dist = Math.abs(itemMidX - colMidX);
      if (dist < bestDist) {
        bestDist = dist;
        colIndex = c;
      }
    }

    result.push({
      str: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      columnIndex: colIndex
    });
  }

  // Sort: column-first, then Y, then X
  result.sort((a, b) => {
    if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex;
    if (Math.abs(a.y - b.y) > 5) return a.y - b.y;
    return a.x - b.x;
  });

  return result;
}

// ── Math artifact detection ──

function isMathArtifact(str: string): boolean {
  // LaTeX commands
  if (/^\\[a-zA-Z]+/.test(str)) return true;

  // Pure math symbols (single char)
  if (str.length === 1 && /[∫∑∏∞∂√∇×±≤≥→←↑↓↔⇒⇐⇔ℕℝℂℤ]/.test(str)) return true;

  // Very short strings with low alpha ratio (formula fragments)
  if (str.length <= 15) {
    const alphaCount = (str.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount === 0 && str.length > 1) return true;
    if (alphaCount / str.length < 0.15 && str.length >= 4) return true;
  }

  return false;
}

// ── Items to lines ──

function itemsToLines(items: LineItem[]): LineItem[][] {
  const lines: LineItem[][] = [];
  let currentLine: LineItem[] = [];
  let currentY: number | null = null;
  const LINE_THRESHOLD = 4;

  for (const item of items) {
    if (currentY === null || Math.abs(item.y - currentY) <= LINE_THRESHOLD) {
      currentLine.push(item);
      currentY = currentY === null ? item.y : (currentY + item.y) / 2;
    } else {
      if (currentLine.length) lines.push(currentLine.sort((a, b) => a.x - b.x));
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length) lines.push(currentLine.sort((a, b) => a.x - b.x));
  return lines;
}

// ── Dehyphenation ──

function dehyphenate(lines: LineItem[][]): LineItem[][] {
  const result: LineItem[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;

    const last = line[line.length - 1];

    if (last.str.endsWith('-') && last.str.length > 1 && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine.length > 0) {
        const first = nextLine[0];
        // Merge: remove hyphen, append first word of next line
        last.str = last.str.slice(0, -1) + first.str;
        // Remove the first item from next line
        lines[i + 1] = nextLine.slice(1);
      }
    }

    result.push([...line]);
  }

  return result.filter(l => l.length > 0);
}

// ── Lines to paragraphs ──

interface LogicalParagraph {
  id: string;
  text: string;
  items: LineItem[];
}

function buildParagraphs(lines: LineItem[][]): LogicalParagraph[] {
  const result: LogicalParagraph[] = [];
  let paraBuf = '';
  let paraItems: LineItem[] = [];
  let paraId = 0;

  function flush() {
    if (!paraBuf.trim()) { paraBuf = ''; paraItems = []; return; }
    result.push({
      id: `p-${paraId++}`,
      text: paraBuf.trim(),
      items: [...paraItems]
    });
    paraBuf = '';
    paraItems = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.map(it => it.str).join(' ').trim();
    if (!lineText) continue;

    const nextLine = lines[i + 1];
    paraBuf += (paraBuf ? ' ' : '') + lineText;
    paraItems.push(...line);

    const lineH = line[0]?.height || 12;
    const thisY = line[0]?.y;
    const nextY = nextLine?.[0]?.y;
    const yGap = nextY ? (nextY - thisY) : Infinity;

    // End of paragraph markers
    const endsWithPunct = /[.!?]$/.test(lineText);
    const lastX = line[line.length - 1]?.x || 0;
    const firstX = line[0]?.x || 0;
    const lineW = (lastX + ((line[line.length - 1]?.width) || 0)) - firstX;
    // Paragraph ends: big Y gap, or short last line in a paragraph
    const isParaEnd = !nextLine || yGap > lineH * 2.5 || (endsWithPunct && lineW < 80);

    if (isParaEnd) flush();
  }
  flush();

  return result;
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
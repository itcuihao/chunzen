// PDF viewer webview — PDF.js rendering module

declare const pdfjsLib: {
  getDocument(config: { url: string; cMapUrl?: string; cMapPacked?: boolean }): { promise: Promise<PdfDocument> };
  Util: { transform(transform: number[], viewportTransform: number[]): number[] };
  OPS?: Record<string, number>;
  GlobalWorkerOptions: { workerSrc: string };
};

interface PdfDocument {
  numPages: number;
  getMetadata(): Promise<{ info?: { Title?: string } }>;
  getPage(num: number): Promise<PdfPage>;
  getOutline(): Promise<any[] | null>;
  getDestination(dest: string): Promise<any[] | null>;
  getPageIndex(ref: any): Promise<number>;
}

interface PdfPage {
  getViewport(config: { scale: number }): PdfViewport;
  getTextContent(options?: {
    includeMarkedContent?: boolean;
    normalizeWhitespace?: boolean;
  }): Promise<TextContent>;
  getOperatorList(): Promise<OperatorList>;
  render(config: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): RenderTask;
  commonObjs?: any;
}

export interface PdfViewport {
  width: number;
  height: number;
  scale: number;
  transform: number[];
}

interface RenderTask {
  promise: Promise<void>;
  cancel(): void;
}

/** A real text span from PDF.js */
export interface TextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
  hasEOL?: boolean;
  dir?: string;
}

/** A marked-content begin/end marker (returned when includeMarkedContent:true) */
export interface MarkedContentBegin {
  type: 'beginMarkedContent';
  tag: string;   // e.g. 'P', 'H1', 'Sect', 'Figure', 'Table'
  id?: string;
}
export interface MarkedContentEnd {
  type: 'endMarkedContent';
}
export type AnyContentItem = TextItem | MarkedContentBegin | MarkedContentEnd;

interface TextContent {
  items: AnyContentItem[];
}

interface OperatorList {
  fnArray: number[];
  argsArray: unknown[];
}

export interface HorizontalRule {
  id: string;
  x1: number;
  x2: number;
  y: number;
  thickness: number;
}

/** A paragraph/heading boundary derived from marked-content tags */
export interface ParagraphBoundary {
  /** Indices into the flat `items` array (inclusive start, exclusive end) */
  start: number;
  end: number;
  /** Normalised role: 'p' | 'heading' | 'figure' | 'table' | 'other' */
  role: 'p' | 'heading' | 'figure' | 'table' | 'other';
  /** Raw PDF tag, e.g. 'P', 'H1', 'H2', 'Caption' */
  rawTag: string;
}

/** Return value from getPageText — always includes flat items; optionally includes structure */
export interface RichTextContent {
  items: TextItem[];
  /** Non-empty only when PDF has tagged marked content (i.e. hasStructure === true) */
  paragraphBoundaries: ParagraphBoundary[];
  /** True when the PDF contains <P>/<H> marked-content tags */
  hasStructure: boolean;
  /** Horizontal separator rules detected from vector paths */
  horizontalRules: HorizontalRule[];
  styles?: Record<string, { fontFamily: string; ascent: number; descent: number }>;
  commonObjs?: any;
}

export type { PdfDocument, PdfPage };

// ── Role helpers ──────────────────────────────────────────────────────────────

const HEADING_TAGS = new Set(['h', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'title']);
const PARAGRAPH_TAGS = new Set(['p', 'lbody', 'td', 'th', 'blockquote', 'caption']);
const FIGURE_TAGS = new Set(['figure', 'formula']);
const TABLE_TAGS = new Set(['table']);

function classifyTag(tag: string): ParagraphBoundary['role'] {
  const t = tag.toLowerCase();
  if (HEADING_TAGS.has(t)) return 'heading';
  if (PARAGRAPH_TAGS.has(t)) return 'p';
  if (FIGURE_TAGS.has(t)) return 'figure';
  if (TABLE_TAGS.has(t)) return 'table';
  return 'other';
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initPdfJs(workerSrc: string): void {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
}

export async function loadPdf(url: string): Promise<PdfDocument> {
  const loadingTask = pdfjsLib.getDocument({ url });
  return loadingTask.promise;
}

export async function renderPageToCanvas(
  page: PdfPage,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<PdfViewport> {
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  const renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'RenderingCancelledException') {
      return viewport;
    }
    throw e;
  }
  return viewport;
}

/**
 * Extract text items from a PDF page.
 *
 * When the PDF is tagged (most modern academic PDFs), the returned
 * `paragraphBoundaries` array directly maps to semantic paragraphs/headings
 * via marked-content tags (<P>, <H1>, …).  `hasStructure` will be true.
 *
 * When the PDF is untagged, `paragraphBoundaries` is empty and `hasStructure`
 * is false — the caller should fall back to heuristic paragraph detection.
 */
export async function getPageText(page: PdfPage, viewport?: PdfViewport): Promise<RichTextContent> {
  // Request marked-content markers so we get paragraph/heading boundaries
  let rawContent: TextContent;
  try {
    rawContent = await page.getTextContent({ includeMarkedContent: true });
  } catch {
    // Older PDF.js versions may not support the option — fall back
    rawContent = await (page.getTextContent as () => Promise<TextContent>)();
  }

  const items: TextItem[] = [];
  const paragraphBoundaries: ParagraphBoundary[] = [];

  // Stack to handle nested marked-content (e.g. <Sect><P>…</P></Sect>)
  const stack: Array<{ tag: string; itemStart: number }> = [];
  let hasStructure = false;

  for (const raw of rawContent.items) {
    if (!('str' in raw)) {
      // Marked-content marker
      const mc = raw as MarkedContentBegin | MarkedContentEnd;
      if (mc.type === 'beginMarkedContent') {
        const tag = (mc as MarkedContentBegin).tag || '';
        const role = classifyTag(tag);
        // Only track roles we care about for paragraph segmentation
        if (role !== 'other' || tag.toLowerCase().startsWith('h')) {
          stack.push({ tag, itemStart: items.length });
          if (role === 'p' || role === 'heading') hasStructure = true;
        }
      } else if (mc.type === 'endMarkedContent') {
        if (stack.length > 0) {
          const { tag, itemStart } = stack.pop()!;
          const role = classifyTag(tag);
          if ((role === 'p' || role === 'heading') && items.length > itemStart) {
            paragraphBoundaries.push({
              start: itemStart,
              end: items.length,
              role,
              rawTag: tag,
            });
          }
        }
      }
    } else {
      // Real text item
      const ti = raw as TextItem;
      if (ti.str && ti.str.trim()) {
        items.push(ti);
      }
    }
  }

  // Sort boundaries by start index (they should already be, but be safe)
  paragraphBoundaries.sort((a, b) => a.start - b.start);

  // Remove nested duplicates: if a boundary is fully contained inside another,
  // keep only the innermost one.
  const dedupedBoundaries = dedupBoundaries(paragraphBoundaries);
  const horizontalRules = await extractHorizontalRules(page, viewport);

  console.log(
    `[ChunZen] getPageText: items=${items.length}`,
    `hasStructure=${hasStructure}`,
    `boundaries=${dedupedBoundaries.length}`,
    `horizontalRules=${horizontalRules.length}`
  );

  return {
    items,
    paragraphBoundaries: dedupedBoundaries,
    hasStructure,
    horizontalRules,
    styles: (rawContent as any).styles || {},
    commonObjs: page.commonObjs
  };
}

function dedupBoundaries(boundaries: ParagraphBoundary[]): ParagraphBoundary[] {
  if (boundaries.length <= 1) return boundaries;
  const result: ParagraphBoundary[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    // Keep this boundary only if it's not fully contained in the previous kept boundary
    const prev = result[result.length - 1];
    if (prev && b.start >= prev.start && b.end <= prev.end) {
      // b is nested inside prev — prefer the innermost (b)
      result.pop();
      result.push(b);
    } else {
      result.push(b);
    }
  }
  return result;
}

type PathLine = { x1: number; y1: number; x2: number; y2: number };
type PathBox = { minX: number; minY: number; maxX: number; maxY: number };

function applyTransformPoint(x: number, y: number, m: number[]): [number, number] {
  return [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
}

function mergeTransform(a: number[], b: number[]): number[] {
  return pdfjsLib.Util.transform(a, b);
}

function toNumberArray(input: unknown): number[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(Number).filter(Number.isFinite);
  if (ArrayBuffer.isView(input)) return Array.from(input as unknown as ArrayLike<number>).map(Number).filter(Number.isFinite);
  return [];
}

function extractPathLinesFromConstructPathArgs(
  args: unknown,
  ctm: number[],
  viewportTransform: number[]
): { lines: PathLine[]; boxes: PathBox[] } {
  const arr = Array.isArray(args) ? args : [];
  if (arr.length < 2) return { lines: [], boxes: [] };

  const rawOps = arr[0];
  const rawData = arr[1];
  const rawMinMax = arr.length > 2 ? arr[2] : undefined;

  const ops = toNumberArray(rawOps);
  if (ops.length === 0) return { lines: [], boxes: [] };

  const directData = toNumberArray(rawData);
  const data = directData.length > 0
    ? directData
    : (Array.isArray(rawData) && rawData.length > 0 ? toNumberArray(rawData[0]) : []);
  const minMax = toNumberArray(rawMinMax);

  const rules: { lines: PathLine[]; boxes: PathBox[] } = { lines: [], boxes: [] };

  const OPS = pdfjsLib.OPS || {};
  const moveToCode = OPS.moveTo;
  const lineToCode = OPS.lineTo;
  const curveToCode = OPS.curveTo;
  const curveTo2Code = OPS.curveTo2;
  const curveTo3Code = OPS.curveTo3;
  const closePathCode = OPS.closePath;
  const rectCode = OPS.rect ?? OPS.rectangle;

  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let hasCurrentPoint = false;

  for (const op of ops) {
    if (moveToCode !== undefined && op === moveToCode) {
      if (i + 1 >= data.length) break;
      cx = data[i++];
      cy = data[i++];
      sx = cx;
      sy = cy;
      hasCurrentPoint = true;
      continue;
    }

    if (lineToCode !== undefined && op === lineToCode) {
      if (i + 1 >= data.length || !hasCurrentPoint) break;
      const nx = data[i++];
      const ny = data[i++];
      const [px1, py1] = applyTransformPoint(cx, cy, ctm);
      const [px2, py2] = applyTransformPoint(nx, ny, ctm);
      const [vx1, vy1] = applyTransformPoint(px1, py1, viewportTransform);
      const [vx2, vy2] = applyTransformPoint(px2, py2, viewportTransform);
      rules.lines.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
      cx = nx;
      cy = ny;
      continue;
    }

    if (rectCode !== undefined && op === rectCode) {
      if (i + 3 >= data.length) break;
      const x = data[i++];
      const y = data[i++];
      const w = data[i++];
      const h = data[i++];
      const corners = [
        applyTransformPoint(x, y, ctm),
        applyTransformPoint(x + w, y, ctm),
        applyTransformPoint(x + w, y + h, ctm),
        applyTransformPoint(x, y + h, ctm),
      ].map(([px, py]) => applyTransformPoint(px, py, viewportTransform));
      const xs = corners.map(([px]) => px);
      const ys = corners.map(([, py]) => py);
      rules.boxes.push({
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      });
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      hasCurrentPoint = true;
      continue;
    }

    if (curveToCode !== undefined && op === curveToCode) {
      if (i + 5 >= data.length) break;
      i += 4;
      cx = data[i++];
      cy = data[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (curveTo2Code !== undefined && op === curveTo2Code) {
      if (i + 3 >= data.length) break;
      i += 2;
      cx = data[i++];
      cy = data[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (curveTo3Code !== undefined && op === curveTo3Code) {
      if (i + 3 >= data.length) break;
      i += 2;
      cx = data[i++];
      cy = data[i++];
      hasCurrentPoint = true;
      continue;
    }

    if (closePathCode !== undefined && op === closePathCode) {
      if (hasCurrentPoint) {
        const [px1, py1] = applyTransformPoint(cx, cy, ctm);
        const [px2, py2] = applyTransformPoint(sx, sy, ctm);
        const [vx1, vy1] = applyTransformPoint(px1, py1, viewportTransform);
        const [vx2, vy2] = applyTransformPoint(px2, py2, viewportTransform);
        rules.lines.push({ x1: vx1, y1: vy1, x2: vx2, y2: vy2 });
        cx = sx;
        cy = sy;
      }
      continue;
    }
  }

  if (minMax.length >= 4) {
    const [minX, minY, maxX, maxY] = minMax;
    const corners = [
      applyTransformPoint(minX, minY, ctm),
      applyTransformPoint(maxX, minY, ctm),
      applyTransformPoint(maxX, maxY, ctm),
      applyTransformPoint(minX, maxY, ctm),
    ].map(([px, py]) => applyTransformPoint(px, py, viewportTransform));
    const xs = corners.map(([px]) => px);
    const ys = corners.map(([, py]) => py);
    rules.boxes.push({
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    });
  }

  return rules;
}

function isStrokeLikeOp(op: number, OPS: Record<string, number>): boolean {
  const strokeLike = [
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ].filter((v): v is number => typeof v === 'number');
  return strokeLike.includes(op);
}

async function extractHorizontalRules(page: PdfPage, viewport?: PdfViewport): Promise<HorizontalRule[]> {
  let operatorList: OperatorList | null = null;
  try {
    operatorList = await page.getOperatorList();
  } catch {
    return [];
  }
  if (!operatorList || !Array.isArray(operatorList.fnArray) || !Array.isArray(operatorList.argsArray)) {
    return [];
  }

  const localViewport = viewport || page.getViewport({ scale: 1 });
  const viewportTransform = localViewport.transform;
  const OPS = pdfjsLib.OPS || {};
  const identity = [1, 0, 0, 1, 0, 0];
  const saveCode = OPS.save;
  const restoreCode = OPS.restore;
  const transformCode = OPS.transform;
  const setLineWidthCode = OPS.setLineWidth;
  const constructPathCode = OPS.constructPath;
  const endPathCode = OPS.endPath;
  const fillCode = OPS.fill;
  const eoFillCode = OPS.eoFill;
  const clipCode = OPS.clip;
  const eoClipCode = OPS.eoClip;

  const stateStack: Array<{ ctm: number[]; lineWidth: number }> = [];
  let ctm = [...identity];
  let lineWidth = 1;

  let pendingLines: PathLine[] = [];
  let pendingBoxes: PathBox[] = [];
  const candidates: Array<{ x1: number; x2: number; y: number; thickness: number }> = [];

  const flushPath = (strokeLike: boolean) => {
    if (!strokeLike) {
      pendingLines = [];
      pendingBoxes = [];
      return;
    }

    const lineCandidates: Array<{ x1: number; x2: number; y: number; thickness: number }> = [];
    for (const ln of pendingLines) {
      const length = Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1);
      if (length < localViewport.width * 0.18) continue;
      const dy = Math.abs(ln.y2 - ln.y1);
      if (dy > Math.max(2.2, lineWidth * localViewport.scale * 1.3)) continue;
      lineCandidates.push({
        x1: Math.min(ln.x1, ln.x2),
        x2: Math.max(ln.x1, ln.x2),
        y: (ln.y1 + ln.y2) / 2,
        thickness: Math.max(1, lineWidth * localViewport.scale),
      });
    }

    const boxCandidates: Array<{ x1: number; x2: number; y: number; thickness: number }> = [];
    for (const box of pendingBoxes) {
      const width = Math.max(0, box.maxX - box.minX);
      const height = Math.max(0, box.maxY - box.minY);
      if (width < localViewport.width * 0.25) continue;
      if (height > Math.max(localViewport.height * 0.02, 8)) continue;
      boxCandidates.push({
        x1: box.minX,
        x2: box.maxX,
        y: (box.minY + box.maxY) / 2,
        thickness: Math.max(1, height),
      });
    }

    candidates.push(...lineCandidates, ...boxCandidates);
    pendingLines = [];
    pendingBoxes = [];
  };

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i];

    if (saveCode !== undefined && fn === saveCode) {
      stateStack.push({ ctm: [...ctm], lineWidth });
      continue;
    }
    if (restoreCode !== undefined && fn === restoreCode) {
      const prev = stateStack.pop();
      if (prev) {
        ctm = prev.ctm;
        lineWidth = prev.lineWidth;
      }
      continue;
    }
    if (transformCode !== undefined && fn === transformCode) {
      const nums = toNumberArray(args);
      if (nums.length >= 6) {
        ctm = mergeTransform(ctm, [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]);
      }
      continue;
    }
    if (setLineWidthCode !== undefined && fn === setLineWidthCode) {
      const nums = toNumberArray(args);
      if (nums.length > 0 && Number.isFinite(nums[0]) && nums[0] > 0) {
        lineWidth = nums[0];
      }
      continue;
    }
    if (constructPathCode !== undefined && fn === constructPathCode) {
      const extracted = extractPathLinesFromConstructPathArgs(args, ctm, viewportTransform);
      pendingLines.push(...extracted.lines);
      pendingBoxes.push(...extracted.boxes);
      continue;
    }

    if (isStrokeLikeOp(fn, OPS)) {
      flushPath(true);
      continue;
    }

    const consumesPath =
      (endPathCode !== undefined && fn === endPathCode) ||
      (fillCode !== undefined && fn === fillCode) ||
      (eoFillCode !== undefined && fn === eoFillCode) ||
      (clipCode !== undefined && fn === clipCode) ||
      (eoClipCode !== undefined && fn === eoClipCode);
    if (consumesPath) {
      flushPath(false);
    }
  }

  flushPath(false);

  const inBounds = candidates.filter(c => {
    if (!Number.isFinite(c.x1) || !Number.isFinite(c.x2) || !Number.isFinite(c.y)) return false;
    if (c.y < 0 || c.y > localViewport.height) return false;
    const width = c.x2 - c.x1;
    if (width < localViewport.width * 0.25) return false;
    return c.x2 > 0 && c.x1 < localViewport.width;
  });

  inBounds.sort((a, b) => a.y - b.y);
  const merged: HorizontalRule[] = [];
  for (const c of inBounds) {
    const prev = merged[merged.length - 1];
    const yTol = Math.max(2, c.thickness * 1.2);
    if (prev && Math.abs(prev.y - c.y) <= yTol) {
      prev.x1 = Math.min(prev.x1, c.x1);
      prev.x2 = Math.max(prev.x2, c.x2);
      prev.y = (prev.y + c.y) / 2;
      prev.thickness = Math.max(prev.thickness, c.thickness);
    } else {
      merged.push({
        id: `hr-${merged.length}`,
        x1: c.x1,
        x2: c.x2,
        y: c.y,
        thickness: c.thickness,
      });
    }
  }

  return merged.filter(r => (r.x2 - r.x1) >= localViewport.width * 0.25);
}

// PDF viewer webview — PDF.js rendering module

import {
  extractPathLines,
  isDrawOpsShape,
  toNumberArray,
  type PathBox,
  type PathLine,
} from './pathDecode';
import { pdfjs } from './pdfjsRuntime';

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
  render(config: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] | null }): RenderTask;
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
  /** False when extracted with skipRules:true (e.g. background scan) */
  rulesExtracted?: boolean;
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

/** 随扩展分发的 PDF.js 静态资源地址（由 PdfEditorProvider 注入到 window） */
export interface PdfJsAssets {
  workerSrc: string;
  cMapUrl?: string;
  standardFontDataUrl?: string;
}

let assets: PdfJsAssets = { workerSrc: '' };
let resolvedWorkerBlobUrl: string | null = null;

export function initPdfJs(config: PdfJsAssets | string): void {
  assets = typeof config === 'string' ? { workerSrc: config } : config;
  pdfjs().GlobalWorkerOptions.workerSrc = assets.workerSrc;
}

async function ensureBlobWorker(): Promise<void> {
  if (resolvedWorkerBlobUrl || !assets.workerSrc || assets.workerSrc.startsWith('blob:')) return;
  try {
    const resp = await fetch(assets.workerSrc);
    if (!resp.ok) return;
    const blob = await resp.blob();
    resolvedWorkerBlobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/javascript' }));
    pdfjs().GlobalWorkerOptions.workerSrc = resolvedWorkerBlobUrl;
  } catch {
    // Fall back to original workerSrc
  }
}

export async function loadPdf(url: string): Promise<PdfDocument> {
  await ensureBlobWorker();
  const loadingTask = pdfjs().getDocument({
    url,
    // VSCode webview 的 vscode-resource 代理对 HTTP Range / 流式分块支持不佳，
    // 关闭 Range/Stream 避免反复试探或挂起，直接一次性读取。
    disableRange: true,
    disableStream: true,
    // 中文字体与标准字体的数据文件同样随扩展分发；缺失时 PDF.js 会退化成
    // 画不出字形，所以地址必须和 worker 一起给全。
    ...(assets.cMapUrl ? { cMapUrl: assets.cMapUrl, cMapPacked: true } : {}),
    ...(assets.standardFontDataUrl ? { standardFontDataUrl: assets.standardFontDataUrl } : {}),
  });
  return loadingTask.promise;
}

// Track active render task per canvas so concurrent renders cancel cleanly
// before resizing or mutating the shared 2D context.
const activeCanvasRenders = new WeakMap<
  HTMLCanvasElement,
  { task: RenderTask; settled: Promise<void> }
>();

export async function renderPageToCanvas(
  page: PdfPage,
  canvas: HTMLCanvasElement,
  scale: number,
  pixelRatioMultiplier = 1
): Promise<PdfViewport> {
  const prev = activeCanvasRenders.get(canvas);
  if (prev) {
    prev.task.cancel();
    await prev.settled;
  }

  const viewport = page.getViewport({ scale });

  // Render at physical-pixel resolution on HiDPI/Retina displays, then display
  // at CSS size. Without scaling the backing store by devicePixelRatio, the
  // browser upscales the bitmap and text/lines look blurry.
  // pixelRatioMultiplier > 1 supersamples beyond devicePixelRatio for extra
  // sharpness, at the cost of memory and render time (area grows quadratically).
  const outputScale = (window.devicePixelRatio || 1) * Math.max(1, pixelRatioMultiplier);
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = Math.floor(viewport.width) + 'px';
  canvas.style.height = Math.floor(viewport.height) + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
  const renderTask = page.render({ canvasContext: ctx, viewport, transform });
  const settled = renderTask.promise.then(
    () => undefined,
    () => undefined
  );
  const entry = { task: renderTask, settled };
  activeCanvasRenders.set(canvas, entry);

  try {
    await renderTask.promise;
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'RenderingCancelledException') {
      return viewport;
    }
    throw e;
  } finally {
    if (activeCanvasRenders.get(canvas) === entry) {
      activeCanvasRenders.delete(canvas);
    }
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
export async function getPageText(
  page: PdfPage,
  viewport?: PdfViewport,
  options?: { skipRules?: boolean }
): Promise<RichTextContent> {
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
  const skipRules = options?.skipRules === true;
  const horizontalRules = skipRules ? [] : await extractHorizontalRules(page, viewport);

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
    rulesExtracted: !skipRules,
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

function mergeTransform(a: number[], b: number[]): number[] {
  return pdfjs().Util.transform(a, b);
}

export async function extractHorizontalRules(page: PdfPage, viewport?: PdfViewport): Promise<HorizontalRule[]> {
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
  const OPS = pdfjs().OPS || {};
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
      const extracted = extractPathLines(args, ctm, viewportTransform, OPS);
      pendingLines.push(...extracted.lines);
      pendingBoxes.push(...extracted.boxes);
      // PDF.js 4.x+ 把绘制算子合进了 constructPath 自身（args[0] 为 stroke/closeStroke 等），
      // 后面不再跟独立的 stroke 算子，所以必须在这里立即冲刷。
      // 3.x 的 args[0] 是算子数组，不会命中这个分支。
      const embeddedOp = isDrawOpsShape(args) ? Number((args as unknown[])[0]) : NaN;
      if (Number.isFinite(embeddedOp) && isStrokeLikeOp(embeddedOp, OPS)) {
        flushPath(true);
      }
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

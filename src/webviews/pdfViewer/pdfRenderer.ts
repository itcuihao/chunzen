// PDF viewer webview — PDF.js rendering module

declare const pdfjsLib: {
  getDocument(config: { url: string; cMapUrl?: string; cMapPacked?: boolean }): { promise: Promise<PdfDocument> };
  Util: { transform(transform: number[], viewportTransform: number[]): number[] };
  GlobalWorkerOptions: { workerSrc: string };
};

interface PdfDocument {
  numPages: number;
  getMetadata(): Promise<{ info?: { Title?: string } }>;
  getPage(num: number): Promise<PdfPage>;
}

interface PdfPage {
  getViewport(config: { scale: number }): PdfViewport;
  getTextContent(options?: {
    includeMarkedContent?: boolean;
    normalizeWhitespace?: boolean;
  }): Promise<TextContent>;
  render(config: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): RenderTask;
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
export async function getPageText(page: PdfPage): Promise<RichTextContent> {
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

  console.log(
    `[ChunZen] getPageText: items=${items.length}`,
    `hasStructure=${hasStructure}`,
    `boundaries=${dedupedBoundaries.length}`
  );

  return { items, paragraphBoundaries: dedupedBoundaries, hasStructure };
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
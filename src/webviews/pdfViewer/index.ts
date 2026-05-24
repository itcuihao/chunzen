// PDF viewer webview entry point

import { initPdfJs, loadPdf, PdfDocument, PdfPage, PdfViewport, TextItem, RichTextContent, renderPageToCanvas, getPageText } from './pdfRenderer';
import { buildTextLayer, Paragraph, LayoutHints } from './textLayer';


declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
declare const pdfjsLib: {
  OPS?: Record<string, number>;
  Util: { transform(transform: number[], viewportTransform: number[]): number[] };
};

const vscode = acquireVsCodeApi();

type LayoutConfig = {
  useModel: boolean;
  modelEndpoint: string;
  timeoutMs: number;
  hoverHighlightStyle: 'overlay' | 'bar';
  theme: 'auto' | 'dark' | 'light';
};

const defaultLayoutConfig: LayoutConfig = {
  useModel: false,
  modelEndpoint: '',
  timeoutMs: 3500,
  hoverHighlightStyle: 'overlay',
  theme: 'auto'
};

let pdfDoc: PdfDocument | null = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.2;
let renderTask: { cancel(): void } | null = null;
let layoutConfig: LayoutConfig = { ...defaultLayoutConfig };

function applyTheme(t: 'auto' | 'dark' | 'light') {
  if (t === 'dark') {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  } else if (t === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-dark', 'theme-light');
  }
}

// Removed hover/selection translation state variables

// Translation states
let currentParagraphs: Paragraph[] = [];
let currentViewport: PdfViewport | null = null;
let currentRichContent: RichTextContent | null = null;
const pageTranslationsCache = new Map<number, Record<string, string>>();
const pageRichContentCache = new Map<number, RichTextContent>();
const readPages = new Set<number>();
const repeatCandidateSignaturesByPage = new Map<number, Set<string>>();
const repeatSignaturePages = new Map<string, Set<number>>();
let paragraphHoverOverlay: HTMLDivElement | null = null;

// DOM refs
const container = document.getElementById('pdf-container')!;
const loadingOverlay = document.getElementById('loading-overlay')!;
const pageTotalEl = document.getElementById('page-total')!;
const pageInputEl = document.getElementById('page-input') as HTMLInputElement;
const zoomLevelEl = document.getElementById('zoom-level')!;
const pdfTitleEl = document.getElementById('pdf-title')!;
const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
const textLayer = document.getElementById('text-layer')!;

// Canvas wrapper
const wrapper = document.createElement('div');
wrapper.id = 'canvas-wrapper';
container.appendChild(wrapper);
wrapper.appendChild(canvas);
wrapper.appendChild(textLayer);

async function loadPdfDocument() {
  try {
    repeatCandidateSignaturesByPage.clear();
    repeatSignaturePages.clear();
    initPdfJs((window as unknown as Record<string, string>).PDFJS_WORKER);
    pdfDoc = await loadPdf((window as unknown as Record<string, string>).PDF_SRC);
    totalPages = pdfDoc.numPages;
    pageTotalEl.textContent = `/ ${totalPages}`;

    try {
      const meta = await pdfDoc.getMetadata();
      if (meta?.info?.Title) pdfTitleEl.textContent = meta.info.Title;
    } catch { /* ignore */ }

    // Fetch and render PDF bookmarks outline
    try {
      const outline = await pdfDoc.getOutline();
      const outlineBtn = document.getElementById('btn-outline');
      if (outline && outline.length > 0) {
        const outlineTreeEl = document.getElementById('outline-tree')!;
        outlineTreeEl.innerHTML = '';
        renderOutlineNode(outline, outlineTreeEl);
        outlineBtn?.classList.remove('hidden');
      } else {
        outlineBtn?.classList.add('hidden');
      }
    } catch (err) {
      console.warn('[PDF Viewer] Failed to load outline:', err);
      document.getElementById('btn-outline')?.classList.add('hidden');
    }

    await renderCurrentPage();
    await extractMetaFromFirstPage();
    hideLoading();

    vscode.postMessage({ type: 'ready' });
    startBackgroundScan().catch(err => console.error('[PDF Viewer] Background scan error:', err));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    loadingOverlay.querySelector('.loading-text')!.textContent = `加载失败: ${msg}`;
  }
}

async function renderCurrentPage() {
  if (!pdfDoc) return;
  readPages.add(currentPage);

  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }

  const page = await pdfDoc.getPage(currentPage);
  const viewport = await renderPageToCanvas(page, canvas, scale);

  wrapper.style.width = viewport.width + 'px';
  wrapper.style.height = viewport.height + 'px';
  textLayer.style.width = viewport.width + 'px';
  textLayer.style.height = viewport.height + 'px';

  let items = pageRichContentCache.get(currentPage);
  if (!items) {
    items = await getPageText(page);
    pageRichContentCache.set(currentPage, items);
  }

  // Scale horizontal rules for the current scale
  const renderedRichContent: RichTextContent = {
    ...items,
    horizontalRules: items.horizontalRules.map(r => ({
      id: r.id,
      x1: r.x1 * scale,
      x2: r.x2 * scale,
      y: r.y * scale,
      thickness: r.thickness * scale
    }))
  };

  currentViewport = viewport;
  currentRichContent = renderedRichContent;
  const modelHints = await getLayoutHints(renderedRichContent, viewport);
  const { paragraphs: newParagraphs, columnsCount } = buildTextLayer(textLayer, renderedRichContent, viewport, {
    layoutHints: modelHints || undefined,
    pageNumber: currentPage
  });
  ensureParagraphHoverOverlay();
  applyRepeatedNoiseSkips(currentPage, newParagraphs, viewport.width, viewport.height);
  injectTableImageFallback(newParagraphs, viewport);

  currentParagraphs = newParagraphs;
  activeHoverParagraphId = null;
  hideParagraphHoverOverlay();

  // Retrieve cached translations for current page if available
  const cacheObj = pageTranslationsCache.get(currentPage);
  const translations = cacheObj
    ? Object.entries(cacheObj).map(([id, translatedText]) => ({ id, translatedText }))
    : undefined;

  // Send page text loaded message to extension host
  vscode.postMessage({
    type: 'page-text-loaded',
    pageNumber: currentPage,
    paragraphs: newParagraphs.map(p => ({
      id: p.id,
      text: p.text,
      section: p.section,
      columnIndex: p.columnIndex,
      sentences: p.sentences,
      fontSize: Math.round(p.fontSize / scale * 10) / 10,
      height: Math.round(p.height / scale * 10) / 10,
      bold: p.bold,
      blockType: p.blockType,
      skipped: p.skipped,
      skipReason: p.skipReason,
      lineMarker: p.lineMarker,
      ruleX1: p.ruleX1 !== undefined ? Math.round(p.ruleX1 / scale * 10) / 10 : undefined,
      ruleX2: p.ruleX2 !== undefined ? Math.round(p.ruleX2 / scale * 10) / 10 : undefined,
      imageDataUrl: p.imageDataUrl,
      imageAlt: p.imageAlt,
    })),
    columnsCount,
    translations
  });
}

function normalizeRepeatSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' <url> ')
    .replace(/\bwww\.\S+/g, ' <url> ')
    .replace(/\b\d{4,}\b/g, ' <num> ')
    .replace(/\s+/g, ' ')
    .replace(/[|•·]+/g, ' ')
    .trim();
}

function isRepeatNoiseCandidate(para: Paragraph, viewportWidth: number, viewportHeight: number): boolean {
  if (para.lineMarker === 'horizontal-rule') return false;
  if (!para.text || !para.text.trim()) return false;

  const text = para.text.trim();
  if (text.length < 14 || text.length > 260) return false;

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return false;

  const yTop = para.y;
  const yBottom = para.y + para.height;
  const nearTop = yTop < viewportHeight * 0.14;
  const nearBottom = yBottom > viewportHeight * 0.86;
  const rightEdge = para.section === 'right' || (para.x > viewportWidth * 0.62 && para.width < viewportWidth * 0.45);
  const leftEdge = para.x < viewportWidth * 0.06 && para.width < viewportWidth * 0.45;
  const edgeLike = nearTop || nearBottom || rightEdge || leftEdge;

  if (!edgeLike) return false;

  const lower = text.toLowerCase();
  const hasDoiCue =
    /\bdoi:\s*/i.test(text) ||
    /\bdoi\.org\b/i.test(lower) ||
    /\b10\.\d{4,9}\//.test(text);
  const hasMetaCue =
    hasDoiCue ||
    lower.includes('downloaded') ||
    lower.includes('copyright') ||
    lower.includes('all rights reserved') ||
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('www.');

  if (hasMetaCue) return true;

  // Without explicit metadata cues, only treat short template-like edge lines as candidates.
  // This avoids skipping real body prose at the top of continuation pages.
  const looksTemplateLine = tokens.length <= 10 && text.length <= 90;
  return looksTemplateLine;
}

function addRepeatSignature(pageNumber: number, signature: string): void {
  let pages = repeatSignaturePages.get(signature);
  if (!pages) {
    pages = new Set<number>();
    repeatSignaturePages.set(signature, pages);
  }
  pages.add(pageNumber);
}

function removePageRepeatSignatures(pageNumber: number): void {
  const prev = repeatCandidateSignaturesByPage.get(pageNumber);
  if (!prev) return;
  for (const sig of prev) {
    const pages = repeatSignaturePages.get(sig);
    if (!pages) continue;
    pages.delete(pageNumber);
    if (pages.size === 0) repeatSignaturePages.delete(sig);
  }
}

function applyRepeatedNoiseSkips(
  pageNumber: number,
  paragraphs: Paragraph[],
  viewportWidth: number,
  viewportHeight: number
): void {
  removePageRepeatSignatures(pageNumber);

  const signatures = new Set<string>();
  for (const para of paragraphs) {
    if (!isRepeatNoiseCandidate(para, viewportWidth, viewportHeight)) continue;
    const sig = normalizeRepeatSignature(para.text);
    if (!sig || sig.length < 12) continue;
    signatures.add(sig);
  }

  repeatCandidateSignaturesByPage.set(pageNumber, signatures);
  for (const sig of signatures) addRepeatSignature(pageNumber, sig);

  for (const para of paragraphs) {
    if (para.skipped || para.lineMarker === 'horizontal-rule') continue;
    const topBodyLike =
      para.y < viewportHeight * 0.14 &&
      para.text.length > 120 &&
      para.text.split(/\s+/).filter(Boolean).length >= 18 &&
      !/^https?:\/\//i.test(para.text.trim());
    if (topBodyLike) continue;
    if (!isRepeatNoiseCandidate(para, viewportWidth, viewportHeight)) continue;
    const sig = normalizeRepeatSignature(para.text);
    const pages = repeatSignaturePages.get(sig);
    if (pages && pages.size >= 2) {
      para.skipped = true;
      para.skipReason = 'repeated-noise';
    }
  }
}

function isValidLayoutHints(data: unknown): data is LayoutHints {
  if (!data || typeof data !== 'object') return false;
  const x = data as Record<string, unknown>;
  if (x.columnsCount !== undefined && typeof x.columnsCount !== 'number') return false;
  if (x.sidebarGutterX !== undefined && typeof x.sidebarGutterX !== 'number') return false;
  if (x.gutters !== undefined && !Array.isArray(x.gutters)) return false;
  return true;
}

async function getLayoutHints(
  richContent: Awaited<ReturnType<typeof getPageText>>,
  viewport?: { width: number; height: number; scale: number }
): Promise<LayoutHints | null> {
  if (!layoutConfig.useModel) return null;
  const endpoint = layoutConfig.modelEndpoint.trim();
  if (!endpoint) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, layoutConfig.timeoutMs || 3500));
  try {
    // Expected response shape (MVP):
    // { columnsCount?: number, gutters?: number[], sidebarGutterX?: number }
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const imageBase64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
    const payload = {
      pageNumber: currentPage,
      imageBase64,
      imageMimeType: 'image/jpeg',
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      viewport: viewport ? {
        width: viewport.width,
        height: viewport.height,
        scale: viewport.scale
      } : undefined,
      items: richContent.items.map(it => ({
        str: it.str,
        transform: it.transform,
        width: it.width,
        height: it.height,
        fontName: it.fontName
      }))
    };
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!resp.ok) return null;
    const data: unknown = await resp.json();
    const hints = toLayoutHints(data, viewport?.width ?? canvas.width);
    return hints;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type LayoutBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
};

function toLayoutHints(data: unknown, pageWidth: number): LayoutHints | null {
  if (isValidLayoutHints(data)) return data;
  const boxes = extractLayoutBoxes(data);
  if (boxes.length < 4) return null;

  const textLike = boxes.filter(b => !/table|figure|chart|formula|image/i.test(b.label));
  const base = textLike.length >= 4 ? textLike : boxes;
  const columnsCount = Math.min(2, inferColumnsFromBoxes(base));
  if (columnsCount <= 1) return null;

  const hints: LayoutHints = { columnsCount };
  const gutters = inferGuttersFromBoxes(base, columnsCount, pageWidth);
  if (gutters.length > 0) hints.gutters = gutters;
  if (columnsCount === 2 && gutters.length === 1 && isLikelySidebar(base, gutters[0], pageWidth)) {
    hints.sidebarGutterX = gutters[0];
  }
  return hints;
}

function extractLayoutBoxes(data: unknown): LayoutBox[] {
  const nodes = extractLayoutNodes(data);
  const results: LayoutBox[] = [];
  for (const node of nodes) {
    const box = parseLayoutBox(node);
    if (!box) continue;
    if (box.x2 <= box.x1 || box.y2 <= box.y1) continue;
    results.push(box);
  }
  return results;
}

function extractLayoutNodes(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;
  const directKeys = ['result', 'results', 'regions', 'layout', 'blocks', 'predictions'];
  for (const key of directKeys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  if (obj.data && typeof obj.data === 'object') {
    const nested = obj.data as Record<string, unknown>;
    for (const key of directKeys) {
      if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
  }
  return [];
}

function parseLayoutBox(node: unknown): LayoutBox | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  const label = String(obj.type ?? obj.label ?? obj.cls ?? obj.category ?? obj.class_name ?? '').toLowerCase();

  const source = Array.isArray(obj.bbox)
    ? obj.bbox
    : Array.isArray(obj.box)
      ? obj.box
      : null;
  if (!source) return null;
  const nums = source.map(Number).filter(Number.isFinite);

  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  if (nums.length >= 8) {
    const xs = [nums[0], nums[2], nums[4], nums[6]];
    const ys = [nums[1], nums[3], nums[5], nums[7]];
    x1 = Math.min(...xs);
    y1 = Math.min(...ys);
    x2 = Math.max(...xs);
    y2 = Math.max(...ys);
  } else if (nums.length >= 4) {
    const [a, b, c, d] = nums;
    // Support both [x1,y1,x2,y2] and [x1,y1,w,h].
    if (c > a && d > b) {
      x1 = a; y1 = b; x2 = c; y2 = d;
    } else {
      x1 = a; y1 = b; x2 = a + Math.max(0, c); y2 = b + Math.max(0, d);
    }
  } else {
    return null;
  }

  return { x1, y1, x2, y2, label };
}

function inferColumnsFromBoxes(boxes: LayoutBox[]): number {
  const centers = boxes.map(b => (b.x1 + b.x2) / 2).filter(Number.isFinite);
  if (centers.length < 6) return 1;

  const k1 = runKMeans1d(centers, 1);
  const k2 = runKMeans1d(centers, 2);
  const k3 = runKMeans1d(centers, 3);
  const variance = Math.max(1, k1.sse / centers.length);
  const score1 = k1.sse + variance * 0.08;
  const score2 = k2.sse + variance * 0.16;
  const score3 = k3.sse + variance * 0.24;

  const best = Math.min(score1, score2, score3);
  let k = best === score1 ? 1 : (best === score2 ? 2 : 3);
  const improvement = (score1 - best) / Math.max(score1, 1);
  if (k > 1 && improvement < 0.18) k = 1;
  return Math.min(2, k);
}

function inferGuttersFromBoxes(boxes: LayoutBox[], columnsCount: number, pageWidth: number): number[] {
  if (columnsCount <= 1) return [];
  const centers = boxes.map(b => (b.x1 + b.x2) / 2).filter(Number.isFinite);
  if (centers.length < 6) return [];
  const km = runKMeans1d(centers, columnsCount);
  const sortedCenters = [...km.centroids].sort((a, b) => a - b);
  const gutters: number[] = [];
  for (let i = 0; i < sortedCenters.length - 1; i++) {
    const g = (sortedCenters[i] + sortedCenters[i + 1]) / 2;
    if (g > pageWidth * 0.12 && g < pageWidth * 0.88) gutters.push(g);
  }
  return gutters;
}

function isLikelySidebar(boxes: LayoutBox[], gutterX: number, pageWidth: number): boolean {
  const left = boxes.filter(b => (b.x1 + b.x2) / 2 < gutterX);
  const right = boxes.filter(b => (b.x1 + b.x2) / 2 >= gutterX);
  if (right.length < 2 || left.length < 2) return false;
  const rightAvgWidth = right.reduce((s, b) => s + (b.x2 - b.x1), 0) / right.length;
  return rightAvgWidth < pageWidth * 0.42 && right.length <= left.length * 0.8;
}

function runKMeans1d(values: number[], k: number): { centroids: number[]; sse: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const centroids: number[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i + 0.5) * sorted.length / k));
    centroids.push(sorted[idx]);
  }

  let assignments = new Array(values.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    // assign
    for (let i = 0; i < values.length; i++) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c++) {
        const dist = Math.abs(values[i] - centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
        }
      }
      assignments[i] = bestIdx;
    }
    // update
    for (let c = 0; c < centroids.length; c++) {
      let sum = 0;
      let cnt = 0;
      for (let i = 0; i < values.length; i++) {
        if (assignments[i] === c) {
          sum += values[i];
          cnt++;
        }
      }
      if (cnt > 0) centroids[c] = sum / cnt;
    }
  }

  let sse = 0;
  for (let i = 0; i < values.length; i++) {
    const c = centroids[assignments[i]];
    const d = values[i] - c;
    sse += d * d;
  }
  return { centroids, sse };
}

function normalizeLayoutConfig(input: unknown): LayoutConfig {
  if (!input || typeof input !== 'object') return { ...defaultLayoutConfig };
  const raw = input as Record<string, unknown>;
  const timeoutRaw = Number(raw.timeoutMs);
  const hoverHighlightStyle = raw.hoverHighlightStyle === 'bar' ? 'bar' : 'overlay';
  const theme = raw.theme === 'dark' || raw.theme === 'light' ? raw.theme : 'auto';
  return {
    useModel: Boolean(raw.useModel),
    modelEndpoint: typeof raw.modelEndpoint === 'string' ? raw.modelEndpoint.trim() : '',
    timeoutMs: Number.isFinite(timeoutRaw) ? Math.max(500, Math.min(20000, Math.round(timeoutRaw))) : 3500,
    hoverHighlightStyle,
    theme
  };
}

function isLayoutConfigEqual(a: LayoutConfig, b: LayoutConfig): boolean {
  return a.useModel === b.useModel
    && a.modelEndpoint === b.modelEndpoint
    && a.timeoutMs === b.timeoutMs
    && a.hoverHighlightStyle === b.hoverHighlightStyle
    && a.theme === b.theme;
}

// Removed unused hover text events to avoid single sentence translation

async function extractMetaFromFirstPage() {
  if (!pdfDoc) return;
  try {
    let richContent = pageRichContentCache.get(1);
    if (!richContent) {
      const page = await pdfDoc.getPage(1);
      richContent = await getPageText(page);
      pageRichContentCache.set(1, richContent);
    }
    const text = richContent.items.map(it => it.str).join(' ');

    // Normalize spacing that often occurs in PDF text layer extraction (e.g. "10. 1038 / s..." or "10 . 1038")
    const cleanedText = text.replace(/10\s*\.\s*/gi, '10.').replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-');
    const doiMatch = cleanedText.match(/\b(10\.\d{4,9}\/[^\s"<>{}|\\^`\[\]]+)/i);
    const issnMatch = text.match(/\b(\d{4}-\d{3}[\dX])\b/);
    const journalPatterns = [
      /(?:Nature|Science|Cell|PNAS|PLOS|IEEE|ACM|Journal of|Proceedings of)\s+[\w\s]{2,40}/i
    ];
    let journal: string | undefined;
    for (const p of journalPatterns) {
      const m = text.match(p);
      if (m) { journal = m[0].trim(); break; }
    }

    if (doiMatch || issnMatch || journal) {
      vscode.postMessage({
        type: 'doi-found',
        doi: doiMatch ? doiMatch[1].replace(/[.,;)\]]+$/, '') : undefined,
        issn: issnMatch ? issnMatch[1] : undefined,
        journal
      });
    }
  } catch { /* ignore */ }
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
  setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
}

let activeHoverParagraphId: string | null = null;

function ensureParagraphHoverOverlay() {
  paragraphHoverOverlay = document.createElement('div');
  paragraphHoverOverlay.className = 'paragraph-hover-overlay';
  paragraphHoverOverlay.dataset.style = layoutConfig.hoverHighlightStyle;
  textLayer.appendChild(paragraphHoverOverlay);
}

function hideParagraphHoverOverlay() {
  if (!paragraphHoverOverlay) return;
  paragraphHoverOverlay.style.display = 'none';
}

// Highlight PDF paragraph
function highlightPdfParagraph(paragraphId: string) {
  clearPdfHighlight();
  const spans = textLayer.querySelectorAll(`span[data-paragraph-id="${paragraphId}"]`);
  spans.forEach(span => {
    (span as HTMLElement).classList.add('sentence-active');
  });
  const para = currentParagraphs.find(p => p.id === paragraphId);
  if (para && paragraphHoverOverlay) {
    const isBar = layoutConfig.hoverHighlightStyle === 'bar';
    const overlayLeft = isBar ? Math.max(0, para.x - 2) : para.x;
    const overlayWidth = isBar ? 3 : Math.max(2, para.width);
    const overlayHeight = Math.max(2, para.height);
    paragraphHoverOverlay.style.left = `${overlayLeft}px`;
    paragraphHoverOverlay.style.top = `${para.y}px`;
    paragraphHoverOverlay.style.width = `${overlayWidth}px`;
    paragraphHoverOverlay.style.height = `${overlayHeight}px`;
    paragraphHoverOverlay.dataset.style = layoutConfig.hoverHighlightStyle;
    paragraphHoverOverlay.style.display = 'block';
  }
  activeHoverParagraphId = paragraphId;
}

function clearPdfHighlight() {
  const spans = textLayer.querySelectorAll('.sentence-active');
  spans.forEach(span => {
    (span as HTMLElement).classList.remove('sentence-active');
  });
  hideParagraphHoverOverlay();
  activeHoverParagraphId = null;
}

// Hover event listeners on textLayer (paragraph-level sync)
textLayer.addEventListener('mouseover', (e) => {
  const target = e.target as HTMLElement;
  if (!target || target.tagName !== 'SPAN') return;
  const paragraphId = target.dataset.paragraphId;
  if (!paragraphId || paragraphId === activeHoverParagraphId) return;

  console.log('[PDF Viewer] mouseover paragraph id:', paragraphId);
  highlightPdfParagraph(paragraphId);
  vscode.postMessage({ type: 'pdf-hover', id: paragraphId });
});

textLayer.addEventListener('mouseleave', () => {
  if (!activeHoverParagraphId) return;
  console.log('[PDF Viewer] mouseleave text layer, clear paragraph hover:', activeHoverParagraphId);
  clearPdfHighlight();
  vscode.postMessage({ type: 'pdf-hover' });
});

// Toolbar
document.getElementById('btn-outline')?.addEventListener('click', () => {
  document.getElementById('outline-sidebar')?.classList.toggle('hidden');
});
document.getElementById('btn-prev')?.addEventListener('click', () => goToPage(currentPage - 1));
document.getElementById('btn-next')?.addEventListener('click', () => goToPage(currentPage + 1));
document.getElementById('btn-zoom-in')?.addEventListener('click', () => setZoom(scale + 0.15));
document.getElementById('btn-zoom-out')?.addEventListener('click', () => setZoom(scale - 0.15));
document.getElementById('btn-fit')?.addEventListener('click', fitWidth);
document.getElementById('btn-capture')?.addEventListener('click', () => {
  saveEntirePageAsImage().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.postMessage({ type: 'figure-screenshot-error', pageNumber: currentPage, reason: msg });
  });
});
pageInputEl.addEventListener('change', e => goToPage(parseInt((e.target as HTMLInputElement).value, 10)));

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(currentPage + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(currentPage - 1);
  else if (e.key === '+' || e.key === '=') setZoom(scale + 0.15);
  else if (e.key === '-') setZoom(scale - 0.15);
});

async function goToPage(n: number) {
  if (!pdfDoc) return;
  n = Math.max(1, Math.min(totalPages, n));
  currentPage = n;
  pageInputEl.value = String(n);
  await renderCurrentPage();
  if (n === 1) await extractMetaFromFirstPage();
}

async function setZoom(newScale: number) {
  scale = Math.max(0.5, Math.min(3.0, newScale));
  zoomLevelEl.textContent = Math.round(scale * 100) + '%';
  await renderCurrentPage();
}

function fitWidth() {
  if (!pdfDoc) return;
  const containerWidth = container.clientWidth - 32;
  pdfDoc.getPage(currentPage).then(page => {
    const vp = page.getViewport({ scale: 1 });
    setZoom(containerWidth / vp.width);
  });
}

interface RenderedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderedTextLine {
  text: string;
  x1: number;
  x2: number;
  y: number;
  height: number;
  width: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParaCluster {
  indices: number[];
}

function composeLineText(items: RenderedTextItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].str.trim();
  let text = items[0].str.trim();
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const gap = cur.x - (prev.x + prev.width);
    const gapThreshold = Math.max(cur.height * 0.2, 1.5);
    const attachNoSpace =
      gap <= gapThreshold ||
      /^[,.;:!?%)\]}]/.test(cur.str) ||
      /[(\[{]$/.test(prev.str);
    text += attachNoSpace ? cur.str : ` ${cur.str}`;
  }
  return text.trim();
}

function toNumberArray(input: unknown): number[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(Number).filter(Number.isFinite);
  if (ArrayBuffer.isView(input)) return Array.from(input as unknown as ArrayLike<number>).map(Number).filter(Number.isFinite);
  return [];
}

function buildRenderedTextItems(items: TextItem[], viewport: PdfViewport): RenderedTextItem[] {
  const output: RenderedTextItem[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
    const x = tx[4];
    const y = tx[5];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    output.push({
      str: it.str.trim(),
      x,
      y,
      width: Math.max(0, it.width * viewport.scale),
      height: Math.max(1, it.height * viewport.scale),
    });
  }
  return output;
}

function groupRenderedLines(items: RenderedTextItem[]): RenderedTextLine[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 2) return a.y - b.y;
    return a.x - b.x;
  });

  const lines: RenderedTextItem[][] = [];
  let cur: RenderedTextItem[] = [];
  for (const it of sorted) {
    if (cur.length === 0) {
      cur.push(it);
      continue;
    }
    const yRef = cur[0].y;
    const hRef = cur.reduce((sum, x) => sum + x.height, 0) / cur.length;
    const sameLine = Math.abs(it.y - yRef) <= Math.max(2.5, hRef * 0.45);
    if (sameLine) {
      cur.push(it);
    } else {
      cur.sort((a, b) => a.x - b.x);
      lines.push(cur);
      cur = [it];
    }
  }
  if (cur.length > 0) {
    cur.sort((a, b) => a.x - b.x);
    lines.push(cur);
  }

  return lines.map((line) => {
    const text = composeLineText(line);
    const x1 = Math.min(...line.map(it => it.x));
    const x2 = Math.max(...line.map(it => it.x + it.width));
    const height = line.reduce((sum, it) => sum + it.height, 0) / line.length;
    return { text, x1, x2, y: line[0].y, height, width: x2 - x1 };
  });
}

function scoreCaptionParagraph(para: Paragraph, viewport: PdfViewport): number {
  if (para.skipped || !para.text.trim()) return -999;
  if (para.width < viewport.width * 0.66) return -999;
  if (para.y < viewport.height * 0.10 || para.y > viewport.height * 0.72) return -999;
  if (para.text.length < 80) return -999;

  const lower = para.text.toLowerCase();
  let score = 0;
  if (/^(figure|fig\.)\s*\d/i.test(para.text)) score += 4;
  if (lower.includes('mechanism') || lower.includes('biogenesis')) score += 3;
  if (lower.includes('regular splicing') || lower.includes('back splicing')) score += 2;
  if (/\([a-z]\)/i.test(para.text)) score += 1;
  if (para.y < viewport.height * 0.45) score += 1;
  score += Math.min(2, para.text.length / 180);
  return score;
}

function multiplyTransform(a: number[], b: number[]): number[] {
  return pdfjsLib.Util.transform(a, b);
}

function applyTransformPoint(x: number, y: number, m: number[]): [number, number] {
  return [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
}

async function extractImageBoxes(page: PdfPage, viewport: PdfViewport): Promise<Rect[]> {
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS || {};
  const saveCode = OPS.save;
  const restoreCode = OPS.restore;
  const transformCode = OPS.transform;
  const paintCode = OPS.paintImageXObject;
  if (paintCode === undefined) return [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const stateStack: number[][] = [];
  const boxes: Rect[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (saveCode !== undefined && fn === saveCode) {
      stateStack.push([...ctm]);
      continue;
    }
    if (restoreCode !== undefined && fn === restoreCode) {
      ctm = stateStack.pop() || [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (transformCode !== undefined && fn === transformCode) {
      const nums = toNumberArray(args);
      if (nums.length >= 6) {
        ctm = multiplyTransform(ctm, [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]);
      }
      continue;
    }
    if (fn === paintCode) {
      const corners = [
        applyTransformPoint(0, 0, ctm),
        applyTransformPoint(1, 0, ctm),
        applyTransformPoint(1, 1, ctm),
        applyTransformPoint(0, 1, ctm),
      ].map(([px, py]) => applyTransformPoint(px, py, viewport.transform));
      const xs = corners.map(([px]) => px);
      const ys = corners.map(([, py]) => py);
      const x1 = Math.min(...xs);
      const x2 = Math.max(...xs);
      const y1 = Math.min(...ys);
      const y2 = Math.max(...ys);
      const width = x2 - x1;
      const height = y2 - y1;
      if (width < 8 && height < 8) continue;
      boxes.push({ x: x1, y: y1, width, height });
    }
  }

  return boxes;
}

async function saveEntirePageAsImage(): Promise<void> {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(currentPage);
  const exportScale = 3.0;
  const viewport = page.getViewport({ scale: exportScale });
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = viewport.width;
  tempCanvas.height = viewport.height;
  
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
  
  const renderTask = page.render({ canvasContext: ctx, viewport });
  await renderTask.promise;
  
  const dataUrl = tempCanvas.toDataURL('image/png');
  
  vscode.postMessage({
    type: 'figure-screenshot-captured',
    pageNumber: currentPage,
    dataUrl,
    bbox: {
      x: 0,
      y: 0,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height)
    }
  });
}

function findTableLikeClusters(paragraphs: Paragraph[], viewport: PdfViewport): ParaCluster[] {
  const picked: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.skipped || !p.text.trim()) continue;
    if (p.y > viewport.height * 0.72) continue;
    const lower = p.text.toLowerCase();
    const headerCue =
      /^table\s*\d*/i.test(p.text) ||
      lower.includes('name and genome location') ||
      lower.includes('alias in circbase') ||
      lower.includes('gene symbol') ||
      lower.includes('reference');
    const rowCue =
      /\[[0-9,\-–]+\]/.test(p.text) ||
      lower.includes('chr') ||
      lower.includes('circ');
    const wideEnough = p.width >= viewport.width * 0.42;
    if ((headerCue || rowCue) && wideEnough) picked.push(i);
  }
  if (picked.length === 0) return [];

  const clusters: ParaCluster[] = [];
  let current: number[] = [picked[0]];
  for (let k = 1; k < picked.length; k++) {
    const prev = paragraphs[picked[k - 1]];
    const cur = paragraphs[picked[k]];
    const yGap = cur.y - prev.y;
    if (yGap <= Math.max(40, prev.height * 4.0)) {
      current.push(picked[k]);
    } else {
      clusters.push({ indices: current });
      current = [picked[k]];
    }
  }
  clusters.push({ indices: current });
  return clusters.filter(c => c.indices.length >= 4);
}

function cropCanvasDataUrl(rect: Rect): string | null {
  const sx = Math.max(0, Math.floor(rect.x));
  const sy = Math.max(0, Math.floor(rect.y));
  const sw = Math.max(1, Math.ceil(rect.width));
  const sh = Math.max(1, Math.ceil(rect.height));
  if (sx >= canvas.width || sy >= canvas.height) return null;
  const cw = Math.min(sw, canvas.width - sx);
  const ch = Math.min(sh, canvas.height - sy);
  if (cw < 20 || ch < 20) return null;
  const tmp = document.createElement('canvas');
  tmp.width = cw;
  tmp.height = ch;
  const ctx = tmp.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch);
  return tmp.toDataURL('image/png');
}

function injectTableImageFallback(paragraphs: Paragraph[], viewport: PdfViewport): void {
  const clusters = findTableLikeClusters(paragraphs, viewport);
  if (clusters.length === 0) return;
  let best = clusters[0];
  let bestScore = -1;
  for (const cluster of clusters) {
    const paras = cluster.indices.map(i => paragraphs[i]);
    const minY = Math.min(...paras.map(p => p.y));
    const maxY = Math.max(...paras.map(p => p.y + p.height));
    const cues = paras.reduce((sum, p) => {
      const lower = p.text.toLowerCase();
      let s = 0;
      if (/^table\s*\d*/i.test(p.text)) s += 4;
      if (lower.includes('alias in circbase') || lower.includes('gene symbol')) s += 3;
      if (/\[[0-9,\-–]+\]/.test(p.text)) s += 1;
      return sum + s;
    }, 0);
    const score = cues + paras.length * 0.4 - minY * 0.002 - (maxY - minY) * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = cluster;
    }
  }

  const targetParas = best.indices.map(i => paragraphs[i]);
  const x1 = Math.max(0, Math.min(...targetParas.map(p => p.x)) - 12);
  const y1 = Math.max(0, Math.min(...targetParas.map(p => p.y)) - 14);
  const x2 = Math.min(viewport.width, Math.max(...targetParas.map(p => p.x + p.width)) + 12);
  const y2 = Math.min(viewport.height, Math.max(...targetParas.map(p => p.y + p.height)) + 14);
  const rect: Rect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  if (rect.width < viewport.width * 0.45 || rect.height < viewport.height * 0.08) return;

  const dataUrl = cropCanvasDataUrl(rect);
  if (!dataUrl) return;

  for (const idx of best.indices) {
    paragraphs[idx].skipped = true;
    paragraphs[idx].skipReason = 'table-image-replaced';
  }

  const firstIdx = Math.min(...best.indices);
  const imagePara: Paragraph = {
    id: `table-image-${currentPage}-${Math.round(rect.y)}`,
    text: '',
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    fontSize: Math.max(10, targetParas[0]?.fontSize || 12),
    section: 'full',
    blockType: 'table',
    skipped: false,
    lineMarker: 'table-image',
    imageDataUrl: dataUrl,
    imageAlt: `Table snapshot page ${currentPage}`,
  };
  paragraphs.splice(firstIdx, 0, imagePara);
}

// Receive messages from extension host
window.addEventListener('message', event => {
  const message = event.data;
  if (!message) return;

  switch (message.type) {
    case 'translate-page-paragraphs-loading': {
      break;
    }
    case 'translate-page-paragraphs-result': {
      const cacheObj: Record<string, string> = {};
      for (const item of message.translations) {
        cacheObj[item.id] = item.translatedText;
      }
      pageTranslationsCache.set(message.pageNumber, cacheObj);
      break;
    }
    case 'translate-page-paragraphs-error': {
      break;
    }
    case 'trigger-page-text-extract': {
      if (message.layoutConfig) {
        layoutConfig = normalizeLayoutConfig(message.layoutConfig);
      }
      applyTheme(layoutConfig.theme);
      renderCurrentPage();
      break;
    }
    case 'layout-config': {
      const next = normalizeLayoutConfig(message.config);
      const changed = !isLayoutConfigEqual(layoutConfig, next);
      layoutConfig = next;
      applyTheme(layoutConfig.theme);
      if (changed) {
        renderCurrentPage();
      }
      break;
    }
    case 'sync-panel-hover': {
      console.log('[PDF Viewer] received sync-panel-hover with id:', message.id);
      if (message.id) {
        highlightPdfParagraph(message.id);
        const firstSpan = textLayer.querySelector(`span[data-paragraph-id="${message.id}"]`);
        if (firstSpan) {
          firstSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        clearPdfHighlight();
      }
      break;
    }
    case 'capture-figure-screenshot': {
      saveEntirePageAsImage().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.postMessage({
          type: 'figure-screenshot-error',
          pageNumber: currentPage,
          reason: msg,
        });
      });
      break;
    }
    case 'get-pdf-pages-text': {
      (async () => {
        if (!pdfDoc) {
          vscode.postMessage({
            type: 'pdf-pages-text-result',
            paragraphs: []
          });
          return;
        }
        let targetPages: number[] = [];
        if (message.scope === 'read') {
          targetPages = Array.from(readPages).sort((a, b) => a - b);
        } else if (message.scope === 'all') {
          targetPages = Array.from({ length: totalPages }, (_, i) => i + 1);
        } else if (message.scope === 'custom') {
          targetPages = parsePageRange(message.customRange || '', totalPages);
        }

        const paragraphs: Array<{ id: string; text: string; page: number }> = [];
        try {
          for (const pageNum of targetPages) {
            let items = pageRichContentCache.get(pageNum);
            if (!items) {
              const page = await pdfDoc.getPage(pageNum);
              items = await getPageText(page);
              pageRichContentCache.set(pageNum, items);
            }
            
            const dummyDiv = document.createElement('div');
            const pageViewport = await pdfDoc.getPage(pageNum).then(p => p.getViewport({ scale: 1.0 }));
            const { paragraphs: pageParagraphs } = buildTextLayer(dummyDiv, items, pageViewport, {
              pageNumber: pageNum
            });
            
            applyRepeatedNoiseSkips(pageNum, pageParagraphs, pageViewport.width, pageViewport.height);
            
            for (const p of pageParagraphs) {
              if (p.skipped) continue;
              paragraphs.push({
                id: p.id,
                text: p.text,
                page: pageNum
              });
            }
          }
          vscode.postMessage({
            type: 'pdf-pages-text-result',
            paragraphs
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[PDF Viewer] Background extraction error:', msg);
          vscode.postMessage({
            type: 'pdf-pages-text-result',
            paragraphs: []
          });
        }
      })();
      break;
    }
    case 'request-bibliography-extract': {
      extractBibliography().catch(err => console.error('[PDF Viewer] Manual bibliography extraction error:', err));
      break;
    }
  }
});

function parsePageRange(rangeStr: string, maxPages: number): number[] {
  const pages = new Set<number>();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);
      if (!isNaN(start) && !isNaN(end)) {
        const low = Math.min(start, end);
        const high = Math.max(start, end);
        for (let i = low; i <= high; i++) {
          if (i >= 1 && i <= maxPages) {
            pages.add(i);
          }
        }
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        pages.add(page);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

function renderOutlineNode(items: any[], container: HTMLElement) {
  const ul = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    
    const link = document.createElement('a');
    link.className = 'outline-link';
    link.textContent = item.title;
    link.title = item.title;
    
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await pdfDoc!.getDestination(dest);
        }
        if (Array.isArray(dest)) {
          const pageRef = dest[0];
          const pageIndex = await pdfDoc!.getPageIndex(pageRef);
          goToPage(pageIndex + 1);
        }
      } catch (err) {
        console.error('[PDF Viewer] Failed to navigate to bookmark:', err);
      }
    });
    
    li.appendChild(link);
    
    if (item.items && item.items.length > 0) {
      renderOutlineNode(item.items, li);
    }
    
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

async function startBackgroundScan() {
  if (!pdfDoc || totalPages === 0) return;
  console.log('[PDF Viewer] Starting background scan...');

  // 1. Scan the last 15 pages first (from totalPages down to Math.max(1, totalPages - 14))
  const endPage = totalPages;
  const startPage = Math.max(1, totalPages - 14);

  for (let pageNum = endPage; pageNum >= startPage; pageNum--) {
    if (pageRichContentCache.has(pageNum)) continue;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const items = await getPageText(page);
      pageRichContentCache.set(pageNum, items);
      await new Promise(resolve => setTimeout(resolve, 30));
    } catch (err) {
      console.warn(`[PDF Viewer] Background scan failed for page ${pageNum}:`, err);
    }
  }

  // Extract bibliography once the last 15 pages are loaded
  await extractBibliography();

  // 2. Scan the rest of the pages in the background
  for (let pageNum = 1; pageNum < startPage; pageNum++) {
    if (pageRichContentCache.has(pageNum)) continue;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const items = await getPageText(page);
      pageRichContentCache.set(pageNum, items);
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      console.warn(`[PDF Viewer] Background scan failed for page ${pageNum}:`, err);
    }
  }

  console.log('[PDF Viewer] Background scan completed. All pages cached.');
}

async function extractBibliography() {
  if (!pdfDoc || totalPages === 0) return;

  const startScanPage = Math.max(1, totalPages - 14);
  let refStartPage = -1;

  // Scan backwards from totalPages down to Math.max(1, totalPages - 14) to find references start page
  for (let pageNum = totalPages; pageNum >= startScanPage; pageNum--) {
    let items = pageRichContentCache.get(pageNum);
    if (!items) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        items = await getPageText(page);
        pageRichContentCache.set(pageNum, items);
      } catch (err) {
        console.warn(`[PDF Viewer] Failed to parse page ${pageNum} during bibliography start search:`, err);
        continue;
      }
    }

    const dummyDiv = document.createElement('div');
    const pageViewport = await pdfDoc.getPage(pageNum).then(p => p.getViewport({ scale: 1.0 }));
    const { paragraphs } = buildTextLayer(dummyDiv, items, pageViewport, {
      pageNumber: pageNum
    });

    let hasHeading = false;
    for (const p of paragraphs) {
      if (p.skipped) continue;
      const text = p.text.trim();
      if (!text) continue;

      if (/^(\d+(\.\d+)*\s+)?(references|bibliography|works?\s+cited|references\s+and\s+notes)\b/i.test(text) && text.length < 50) {
        hasHeading = true;
        break;
      }
    }

    if (hasHeading) {
      refStartPage = pageNum;
      console.log(`[PDF Viewer] Detected references start page at ${pageNum}`);
      break;
    }
  }

  const bibEntries: Array<{ key: string; text: string }> = [];
  let activeEntry: { key: string; text: string } | null = null;
  let foundReferencesHeading = false;

  const actualStartPage = refStartPage !== -1 ? refStartPage : Math.max(1, totalPages - 4);
  console.log(`[PDF Viewer] Extracting bibliography starting from page ${actualStartPage}`);

  for (let pageNum = actualStartPage; pageNum <= totalPages; pageNum++) {
    let items = pageRichContentCache.get(pageNum);
    if (!items) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        items = await getPageText(page);
        pageRichContentCache.set(pageNum, items);
      } catch (err) {
        console.warn(`[PDF Viewer] Failed to parse page ${pageNum} for references:`, err);
        continue;
      }
    }

    const dummyDiv = document.createElement('div');
    const pageViewport = await pdfDoc.getPage(pageNum).then(p => p.getViewport({ scale: 1.0 }));
    const { paragraphs } = buildTextLayer(dummyDiv, items, pageViewport, {
      pageNumber: pageNum
    });

    for (const p of paragraphs) {
      if (p.skipped) continue;
      const text = p.text.trim();
      if (!text) continue;

      // Check if this is references section heading
      if (/^(\d+(\.\d+)*\s+)?(references|bibliography|works?\s+cited|references\s+and\s+notes)\b/i.test(text) && text.length < 50) {
        foundReferencesHeading = true;
        continue;
      }

      // Match citation start: e.g. [17], 17., 17 (naked number followed by space/word)
      const numMatch = text.match(/^\s*\[(\d{1,4})\]\s*(.*)/) || 
                       text.match(/^\s*(\d{1,4})\.\s*(.*)/) ||
                       text.match(/^\s*(\d{1,4})\s+(.*)/);

      if (numMatch) {
        const key = numMatch[1];
        activeEntry = { key, text };
        bibEntries.push(activeEntry);
        foundReferencesHeading = true; // Auto-activate continuation on first citation start
      } else if (activeEntry && (foundReferencesHeading || refStartPage !== -1)) {
        activeEntry.text += ' ' + text;
      }
    }
  }

  if (bibEntries.length > 0) {
    console.log(`[PDF Viewer] Successfully extracted ${bibEntries.length} bibliography entries.`);
    vscode.postMessage({
      type: 'pdf-bibliography-extracted',
      bibliography: bibEntries
    });
  }
}

loadPdfDocument();

// PDF viewer webview entry point

import { initPdfJs, loadPdf, PdfDocument, renderPageToCanvas, getPageText } from './pdfRenderer';
import { buildTextLayer, Paragraph, LayoutHints } from './textLayer';


declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

type LayoutConfig = {
  useModel: boolean;
  modelEndpoint: string;
  timeoutMs: number;
};

const defaultLayoutConfig: LayoutConfig = {
  useModel: false,
  modelEndpoint: '',
  timeoutMs: 3500
};

let pdfDoc: PdfDocument | null = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.2;
let renderTask: { cancel(): void } | null = null;
let layoutConfig: LayoutConfig = { ...defaultLayoutConfig };

// Removed hover/selection translation state variables

// Translation states
let currentParagraphs: Paragraph[] = [];
const pageTranslationsCache = new Map<number, Record<string, string>>();

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
    initPdfJs((window as unknown as Record<string, string>).PDFJS_WORKER);
    pdfDoc = await loadPdf((window as unknown as Record<string, string>).PDF_SRC);
    totalPages = pdfDoc.numPages;
    pageTotalEl.textContent = `/ ${totalPages}`;

    try {
      const meta = await pdfDoc.getMetadata();
      if (meta?.info?.Title) pdfTitleEl.textContent = meta.info.Title;
    } catch { /* ignore */ }

    await renderCurrentPage();
    await extractMetaFromFirstPage();
    hideLoading();

    vscode.postMessage({ type: 'ready' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    loadingOverlay.querySelector('.loading-text')!.textContent = `加载失败: ${msg}`;
  }
}

async function renderCurrentPage() {
  if (!pdfDoc) return;

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

  const items = await getPageText(page);
  const modelHints = await getLayoutHints(items, viewport);
  const { paragraphs: newParagraphs, columnsCount } = buildTextLayer(textLayer, items, viewport, {
    layoutHints: modelHints || undefined
  });

  currentParagraphs = newParagraphs;

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
      bold: p.bold,
      blockType: p.blockType
    })),
    columnsCount,
    translations
  });
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
  items: Awaited<ReturnType<typeof getPageText>>,
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
      items: items.map(it => ({
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
  return {
    useModel: Boolean(raw.useModel),
    modelEndpoint: typeof raw.modelEndpoint === 'string' ? raw.modelEndpoint.trim() : '',
    timeoutMs: Number.isFinite(timeoutRaw) ? Math.max(500, Math.min(20000, Math.round(timeoutRaw))) : 3500
  };
}

function isLayoutConfigEqual(a: LayoutConfig, b: LayoutConfig): boolean {
  return a.useModel === b.useModel && a.modelEndpoint === b.modelEndpoint && a.timeoutMs === b.timeoutMs;
}

// Removed unused hover text events to avoid single sentence translation

async function extractMetaFromFirstPage() {
  if (!pdfDoc) return;
  try {
    const page = await pdfDoc.getPage(1);
    const items = await getPageText(page);
    const text = items.map(it => it.str).join(' ');

    const doiMatch = text.match(/\b(10\.\d{4,9}\/[^\s"<>{}|\\^`\[\]]+)/);
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

// Highlight PDF sentences
function highlightPdfSentence(sid: string) {
  clearPdfHighlight();
  const spans = document.querySelectorAll(`span[data-sentence-id="${sid}"]`);
  spans.forEach(span => {
    (span as HTMLElement).classList.add('sentence-active');
  });
}

function clearPdfHighlight() {
  const spans = document.querySelectorAll('.sentence-active');
  spans.forEach(span => {
    (span as HTMLElement).classList.remove('sentence-active');
  });
}

// Hover event listeners on textLayer
textLayer.addEventListener('mouseover', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === 'SPAN' && target.dataset.sentenceId) {
    const sid = target.dataset.sentenceId;
    console.log('[PDF Viewer] mouseover sentence id:', sid);
    highlightPdfSentence(sid);
    vscode.postMessage({ type: 'pdf-hover', id: sid });
  }
});

textLayer.addEventListener('mouseout', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === 'SPAN' && target.dataset.sentenceId) {
    console.log('[PDF Viewer] mouseout sentence id:', target.dataset.sentenceId);
    clearPdfHighlight();
    vscode.postMessage({ type: 'pdf-hover' });
  }
});

// Toolbar
document.getElementById('btn-prev')?.addEventListener('click', () => goToPage(currentPage - 1));
document.getElementById('btn-next')?.addEventListener('click', () => goToPage(currentPage + 1));
document.getElementById('btn-zoom-in')?.addEventListener('click', () => setZoom(scale + 0.15));
document.getElementById('btn-zoom-out')?.addEventListener('click', () => setZoom(scale - 0.15));
document.getElementById('btn-fit')?.addEventListener('click', fitWidth);
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
      renderCurrentPage();
      break;
    }
    case 'layout-config': {
      const next = normalizeLayoutConfig(message.config);
      const changed = !isLayoutConfigEqual(layoutConfig, next);
      layoutConfig = next;
      if (changed) {
        renderCurrentPage();
      }
      break;
    }
    case 'sync-panel-hover': {
      console.log('[PDF Viewer] received sync-panel-hover with id:', message.id);
      if (message.id) {
        highlightPdfSentence(message.id);
        const firstSpan = textLayer.querySelector(`span[data-sentence-id="${message.id}"]`);
        if (firstSpan) {
          firstSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        clearPdfHighlight();
      }
      break;
    }
  }
});

loadPdfDocument();

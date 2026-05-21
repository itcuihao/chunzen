// PDF viewer webview entry point

import { initPdfJs, loadPdf, PdfDocument, renderPageToCanvas, getPageText } from './pdfRenderer';
import { buildTextLayer, Sentence } from './textLayer';
import { setupSelectionHandler } from './selection';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

let pdfDoc: PdfDocument | null = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.2;
let renderTask: { cancel(): void } | null = null;

const sentences = new Map<string, Sentence>();
const spanToSentence = new Map<HTMLSpanElement, string>();
let activeSentenceId: string | null = null;
let lastHoveredSentenceId: string | null = null;
let hoverDebounce: ReturnType<typeof setTimeout> | null = null;

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
    setupSelectionHandler(textLayer, vscode);
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
  const { sentences: newSentences, spanToSentence: newSpanMap } = buildTextLayer(textLayer, items, viewport);

  sentences.clear();
  spanToSentence.clear();
  for (const [k, v] of newSentences) {
    sentences.set(k, v);
  }
  for (const [k, v] of newSpanMap) {
    spanToSentence.set(k, v);
  }

  bindTextLayerEvents();
}

function bindTextLayerEvents() {
  textLayer.addEventListener('mouseover', onSpanMouseover as EventListener);
  textLayer.addEventListener('mouseout', onSpanMouseout as EventListener);
  textLayer.addEventListener('click', onSpanClick as EventListener);
}

function onSpanMouseover(e: MouseEvent) {
  const span = e.target as HTMLElement;
  if (!span.dataset.sentenceId) return;
  const sid = span.dataset.sentenceId;
  if (sid === lastHoveredSentenceId) return;

  clearHover();
  lastHoveredSentenceId = sid;

  const sentence = sentences.get(sid);
  if (!sentence) return;

  for (const s of sentence.spans) {
    s.classList.add('sentence-active');
  }

  clearTimeout(hoverDebounce ?? undefined);
  hoverDebounce = setTimeout(() => {
    activeSentenceId = sid;
    for (const s of sentence.spans) {
      s.classList.remove('sentence-active');
      s.classList.add('sentence-selected');
    }
    vscode.postMessage({ type: 'sentence-hover', sentenceId: sid, text: sentence.text });
  }, 300);
}

function onSpanMouseout(e: MouseEvent) {
  const span = e.target as HTMLElement;
  const sid = span.dataset.sentenceId;
  if (!sid) return;

  const relatedSid = (e.relatedTarget as HTMLElement)?.dataset?.sentenceId;
  if (relatedSid === sid) return;

  if (sid !== activeSentenceId) {
    clearHover();
  }
  clearTimeout(hoverDebounce ?? undefined);
}

function onSpanClick(e: MouseEvent) {
  const span = e.target as HTMLElement;
  if (!span.dataset.sentenceId) return;
  const sid = span.dataset.sentenceId;
  const sentence = sentences.get(sid);
  if (!sentence) return;
  vscode.postMessage({ type: 'sentence-click', sentenceId: sid, text: sentence.text });
}

function clearHover() {
  if (lastHoveredSentenceId) {
    const prev = sentences.get(lastHoveredSentenceId);
    if (prev) {
      for (const s of prev.spans) {
        s.classList.remove('sentence-active');
        if (lastHoveredSentenceId !== activeSentenceId) {
          s.classList.remove('sentence-selected');
        }
      }
    }
  }
  lastHoveredSentenceId = null;
}

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

loadPdfDocument();
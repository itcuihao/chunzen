// PDF viewer webview entry point

import { initPdfJs, loadPdf, PdfDocument, renderPageToCanvas, getPageText } from './pdfRenderer';
import { buildTextLayer, Paragraph } from './textLayer';


declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

let pdfDoc: PdfDocument | null = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.2;
let renderTask: { cancel(): void } | null = null;

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
  const { paragraphs: newParagraphs, columnsCount } = buildTextLayer(textLayer, items, viewport);

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
    paragraphs: newParagraphs.map(p => ({ id: p.id, text: p.text, section: p.section, sentences: p.sentences, fontSize: Math.round(p.fontSize / scale * 10) / 10, bold: p.bold, blockType: p.blockType })),
    columnsCount,
    translations
  });
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
      renderCurrentPage();
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
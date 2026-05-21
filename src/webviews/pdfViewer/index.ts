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
let isTranslationMode = false;
let isTranslating = false;

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

// Translation structures
const translationLayer = document.createElement('div');
translationLayer.id = 'translation-layer';
translationLayer.classList.add('hidden');
wrapper.appendChild(translationLayer);

const translationLoading = document.createElement('div');
translationLoading.id = 'translation-loading';
translationLoading.classList.add('hidden');
translationLoading.innerHTML = `
  <div class="spinner"></div>
  <div class="loading-text">正在翻译当前页面...</div>
`;
wrapper.appendChild(translationLoading);

// Toolbar buttons
const btnTranslateEl = document.getElementById('btn-translate');
const btnToggleTranslationEl = document.getElementById('btn-toggle-translation');

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

  // Position the translation overlay layer as well
  translationLayer.style.width = viewport.width + 'px';
  translationLayer.style.height = viewport.height + 'px';

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
    paragraphs: newParagraphs.map(p => ({ id: p.id, text: p.text })),
    columnsCount,
    translations
  });

  // Render translations overlay if mode is active and update toolbar buttons
  renderTranslationOverlay();
  updateToolbarButtons();
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
  if (n !== currentPage) {
    isTranslationMode = pageTranslationsCache.has(n);
    isTranslating = false;
    translationLoading.classList.add('hidden');
  }
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

// Bind translation buttons
btnTranslateEl?.addEventListener('click', startPageTranslation);
btnToggleTranslationEl?.addEventListener('click', toggleTranslationMode);

function startPageTranslation() {
  if (!pdfDoc || isTranslating) return;

  const pageCache = pageTranslationsCache.get(currentPage);
  if (pageCache) {
    isTranslationMode = true;
    renderTranslationOverlay();
    updateToolbarButtons();
    return;
  }

  if (currentParagraphs.length === 0) {
    alert('当前页面未检测到可翻译的段落文本');
    return;
  }

  isTranslating = true;
  translationLoading.classList.remove('hidden');

  vscode.postMessage({
    type: 'translate-page-paragraphs',
    pageNumber: currentPage,
    paragraphs: currentParagraphs.map(p => ({ id: p.id, text: p.text }))
  });
}

function toggleTranslationMode() {
  isTranslationMode = !isTranslationMode;
  renderTranslationOverlay();
  updateToolbarButtons();
}

function renderTranslationOverlay() {
  translationLayer.innerHTML = '';
  if (!isTranslationMode) {
    translationLayer.classList.add('hidden');
    return;
  }

  const pageCache = pageTranslationsCache.get(currentPage);
  if (!pageCache) {
    translationLayer.classList.add('hidden');
    return;
  }

  translationLayer.classList.remove('hidden');

  for (const para of currentParagraphs) {
    const translatedText = pageCache[para.id];
    if (!translatedText) continue;

    const div = document.createElement('div');
    div.className = 'translated-para';
    div.textContent = translatedText;

    div.style.left = para.x + 'px';
    div.style.top = para.y + 'px';
    div.style.width = para.width + 'px';
    div.style.height = para.height + 'px';

    const fs = Math.max(12, para.fontSize);
    div.style.fontSize = fs + 'px';

    translationLayer.appendChild(div);
  }
}

function updateToolbarButtons() {
  if (!btnTranslateEl || !btnToggleTranslationEl) return;

  const hasCache = pageTranslationsCache.has(currentPage);
  if (hasCache) {
    btnTranslateEl.classList.add('hidden');
    btnToggleTranslationEl.classList.remove('hidden');
    if (isTranslationMode) {
      btnToggleTranslationEl.textContent = '显示原文';
      btnToggleTranslationEl.title = '显示原文';
    } else {
      btnToggleTranslationEl.textContent = '显示译文';
      btnToggleTranslationEl.title = '显示译文';
    }
  } else {
    btnTranslateEl.classList.remove('hidden');
    btnToggleTranslationEl.classList.add('hidden');
  }
}

// Receive messages from extension host
window.addEventListener('message', event => {
  const message = event.data;
  if (!message) return;

  switch (message.type) {
    case 'translate-page-paragraphs-loading': {
      if (message.pageNumber === currentPage) {
        isTranslating = true;
        translationLoading.classList.remove('hidden');
      }
      break;
    }
    case 'translate-page-paragraphs-result': {
      const cacheObj: Record<string, string> = {};
      for (const item of message.translations) {
        cacheObj[item.id] = item.translatedText;
      }
      pageTranslationsCache.set(message.pageNumber, cacheObj);

      if (message.pageNumber === currentPage) {
        translationLoading.classList.add('hidden');
        isTranslating = false;
        isTranslationMode = true;
        renderTranslationOverlay();
        updateToolbarButtons();
      }
      break;
    }
    case 'translate-page-paragraphs-error': {
      if (message.pageNumber === currentPage) {
        translationLoading.classList.add('hidden');
        isTranslating = false;
        alert('翻译失败: ' + message.message);
      }
      break;
    }
    case 'trigger-page-text-extract': {
      renderCurrentPage();
      break;
    }
  }
});

loadPdfDocument();
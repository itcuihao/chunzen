"use strict";
// PDF viewer webview — PDF.js rendering module
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPdfJs = initPdfJs;
exports.loadPdf = loadPdf;
exports.renderPageToCanvas = renderPageToCanvas;
exports.getPageText = getPageText;
function initPdfJs(workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
}
async function loadPdf(url) {
    const loadingTask = pdfjsLib.getDocument({ url });
    return loadingTask.promise;
}
async function renderPageToCanvas(page, canvas, scale) {
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('Failed to get canvas context');
    const renderTask = page.render({ canvasContext: ctx, viewport });
    try {
        await renderTask.promise;
    }
    catch (e) {
        if (e?.name === 'RenderingCancelledException') {
            return viewport;
        }
        throw e;
    }
    return viewport;
}
async function getPageText(page) {
    const content = await page.getTextContent();
    return content.items.filter(item => item.str && item.str.trim());
}
//# sourceMappingURL=pdfRenderer.js.map
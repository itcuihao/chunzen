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
  getTextContent(): Promise<TextContent>;
  render(config: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): RenderTask;
}

interface PdfViewport {
  width: number;
  height: number;
  scale: number;
  transform: number[];
}

interface RenderTask {
  promise: Promise<void>;
  cancel(): void;
}

interface TextContent {
  items: TextItem[];
}

interface TextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
}

export type { PdfDocument, PdfPage, PdfViewport, TextContent, TextItem };

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

export async function getPageText(page: PdfPage): Promise<TextItem[]> {
  const content = await page.getTextContent();
  return content.items.filter(item => item.str && item.str.trim());
}
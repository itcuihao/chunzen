// 在 Node 中用真实 PDF.js + 真实 getPageText/buildTextLayer 处理 PDF 页面，供快照测试使用。
// 只模拟 buildTextLayer 用到的最小 DOM（document.createElement('span') + container.appendChild）。

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { buildTextLayer } from '../../src/webviews/pdfViewer/textLayer.ts';
import { getPageText } from '../../src/webviews/pdfViewer/pdfRenderer.ts';

// 与 index.ts 中的默认缩放一致
export const VIEW_SCALE = 1.2;

type PdfjsModule = {
  getDocument(opts: Record<string, unknown>): { promise: Promise<any>; destroy(): Promise<void> };
};

let pdfjs: PdfjsModule | undefined;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjs) {
    // 插件运行时从 CDN 加载 PDF.js 3.11.174（见 PdfEditorProvider），测试固定同一版本；
    // 3.x 的 legacy 构建是 CommonJS，经 createRequire 加载。
    const require = createRequire(import.meta.url);
    pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as PdfjsModule;
    // pdfRenderer.ts / textLayer.ts 在浏览器里依赖全局 pdfjsLib
    (globalThis as any).pdfjsLib = pdfjs;
  }
  return pdfjs;
}

function makeFakeContainer() {
  (globalThis as any).document = {
    createElement: () => ({ textContent: '', dataset: {} as Record<string, string>, style: {} as Record<string, string> })
  };
  return { innerHTML: '', appendChild() {} } as unknown as HTMLElement;
}

export interface PdfHandle {
  numPages: number;
  close(): Promise<void>;
  /** 与 index.ts renderCurrentPage 相同的数据流：getPageText → 缩放横线 → buildTextLayer */
  layoutPage(pageNumber: number): Promise<ReturnType<typeof buildTextLayer>>;
}

export async function openPdf(path: string): Promise<PdfHandle> {
  const lib = await loadPdfjs();
  const data = new Uint8Array(await readFile(path));
  const task = lib.getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;

  return {
    numPages: doc.numPages,
    close: () => task.destroy(),
    async layoutPage(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: VIEW_SCALE });
      const quiet = console.log;
      console.log = () => {};
      try {
        const rich = await getPageText(page);
        const scaled = {
          ...rich,
          horizontalRules: rich.horizontalRules.map(r => ({
            id: r.id,
            x1: r.x1 * VIEW_SCALE,
            x2: r.x2 * VIEW_SCALE,
            y: r.y * VIEW_SCALE,
            thickness: r.thickness * VIEW_SCALE
          }))
        };
        return buildTextLayer(makeFakeContainer(), scaled, viewport, { pageNumber });
      } finally {
        console.log = quiet;
      }
    }
  };
}

import { createHash } from 'node:crypto';

export interface ParagraphFingerprint {
  type: string;
  section: string;
  col: number | null;
  skip: string | null;
  bold: boolean;
  /** x, y, w, h 取整，避免跨平台浮点噪声 */
  box: [number, number, number, number];
  sentences: number;
  textLen: number;
  /** 文本 SHA-1 前 8 位：能发现内容变化，又不把论文原文写进仓库 */
  textHash: string;
  marker?: string;
}

export interface PageFingerprint {
  columns: number;
  paragraphs: ParagraphFingerprint[];
}

export function fingerprintPage(result: Awaited<ReturnType<PdfHandle['layoutPage']>>): PageFingerprint {
  return {
    columns: result.columnsCount,
    paragraphs: result.paragraphs.map(p => ({
      type: p.blockType ?? 'unknown',
      section: p.section ?? '',
      col: p.columnIndex ?? null,
      skip: p.skipped ? (p.skipReason ?? 'skipped') : null,
      bold: !!p.bold,
      box: [Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)],
      sentences: p.sentences?.length ?? 0,
      textLen: p.text.length,
      textHash: createHash('sha1').update(p.text).digest('hex').slice(0, 8),
      ...(p.lineMarker ? { marker: p.lineMarker } : {})
    }))
  };
}
